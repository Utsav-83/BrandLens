import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertCanViewSubmission } from "@/lib/guards";
import { idParamSchema } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole("creator", "manager", "reviewer", "legal_reviewer", "admin");
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!idParamSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid ID parameter." }, { status: 400 });
  const submission = await db.submission.findFirst({ where: { id, workspaceId: guard.user.workspaceId } });
  if (!submission) return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
  const accessError = assertCanViewSubmission(guard.user, submission);
  if (accessError) return accessError;
  const stages = await db.submissionStage.findMany({ where: { submissionId: id }, include: { stage: { select: { id: true, name: true, order: true, requiredReviewerRole: true } }, decidedBy: { select: { id: true, name: true } } }, orderBy: { stage: { order: "asc" } } });
  return NextResponse.json({ stages });
}