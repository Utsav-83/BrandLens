import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { idParamSchema } from "@/lib/validation";
import { decideStage, jsonDecision, stageDecisionBodySchema } from "@/lib/approval-matrix";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const guard = await requireRole("manager", "reviewer", "legal_reviewer", "admin");
  if (guard.error) return guard.error;
  const { id, stageId } = await params;
  if (!idParamSchema.safeParse(id).success || !idParamSchema.safeParse(stageId).success) return NextResponse.json({ error: "Invalid ID parameter." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = stageDecisionBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    return jsonDecision(await db.$transaction((tx) => decideStage(tx, guard.user, id, stageId, "approved", parsed.data.comment)));
  } catch { return NextResponse.json({ error: "Failed to decide approval stage." }, { status: 500 }); }
}