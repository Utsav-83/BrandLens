import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { idParamSchema } from "@/lib/validation";
import { decideStage, jsonDecision, stageDecisionBodySchema } from "@/lib/approval-matrix";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const guard = await requireRole("manager", "reviewer", "legal_reviewer", "admin"); if (guard.error) return guard.error;
  const { id } = await params; if (!idParamSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID parameter." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = stageDecisionBodySchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      let stages = await tx.submissionStage.findMany({ where: { submissionId: id }, include: { stage: true }, orderBy: { stage: { order: "asc" } } });
      if (!stages.length) {
        const submission = await tx.submission.findFirst({ where: { id, workspaceId: guard.user.workspaceId } });
        if (!submission) return { status: 404, body: { error: "Submission not found or access denied." } };
        const brand = await tx.approvalStage.findFirst({ where: { workspaceId: guard.user.workspaceId, name: "Brand" } });
        if (!brand) return { status: 409, body: { error: "No approval stages are configured." } };
        await tx.submissionStage.create({ data: { submissionId: id, stageId: brand.id } });
        stages = await tx.submissionStage.findMany({ where: { submissionId: id }, include: { stage: true }, orderBy: { stage: { order: "asc" } } });
      }
      const next = stages.find((stage) => stage.status === "pending");
      if (!next) return { status: 409, body: { error: "No pending approval stage remains." } };
      return decideStage(tx, guard.user, id, next.stageId, "approved", parsed.data.comment);
    });
    return jsonDecision(result);
  } catch { return NextResponse.json({ error: "Failed to decide approval stage." }, { status: 500 }); }
}