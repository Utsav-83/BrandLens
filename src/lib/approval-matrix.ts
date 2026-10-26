import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { assertCanReview } from "@/lib/guards";
import { validateStageDecision, stageDecisionResult } from "@/lib/workflow";
import type { AuthenticatedUser } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma";

export const stageDecisionBodySchema = z.object({ comment: z.string().max(2000).optional() }).strict();

export async function decideStage(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser,
  submissionId: string,
  stageId: string,
  decision: "approved" | "changes_requested",
  comment?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const submission = await tx.submission.findFirst({
    where: { id: submissionId, workspaceId: user.workspaceId },
    include: { stages: { include: { stage: true } } },
  });
  if (!submission) return { status: 404, body: { error: "Submission not found or access denied." } };
  const reviewError = assertCanReview(user, submission);
  if (reviewError) return { status: reviewError.status, body: await reviewError.json() };
  const row = submission.stages.find((item) => item.stageId === stageId);
  if (!row || row.stage.workspaceId !== user.workspaceId) return { status: 404, body: { error: "Approval stage not found." } };
  const ordered = submission.stages.map((item) => ({ stageId: item.stageId, order: item.stage.order, status: item.status }));
  const valid = validateStageDecision(
    submission,
    user.id,
    user.role,
    { id: row.stage.id, name: row.stage.name, order: row.stage.order, requiredReviewerRole: row.stage.requiredReviewerRole },
    ordered
  );
  if (!valid.allowed) return { status: 403, body: { error: valid.reason } };
  if (decision === "changes_requested" && !comment?.trim()) return { status: 400, body: { error: "A comment detailing the requested revisions is mandatory." } };

  const next = stageDecisionResult(ordered, stageId, decision);
  const now = new Date();
  await tx.submissionStage.update({ where: { id: row.id }, data: { status: decision, decidedById: user.id, decidedAt: now, comment: comment?.trim() || null } });
  if (decision === "changes_requested") {
    const later = submission.stages.filter((item) => item.stage.order > row.stage.order);
    if (later.length) await tx.submissionStage.updateMany({ where: { id: { in: later.map((item) => item.id) } }, data: { status: "pending", decidedById: null, decidedAt: null, comment: null } });
    await tx.comment.create({ data: { submissionId, authorId: user.id, body: comment!.trim() } });
  }
  const updated = await tx.submission.update({
    where: { id: submissionId },
    data: next.submissionStatus === "approved"
      ? { status: "approved", approvedText: submission.currentText, approvedById: user.id, approvedAt: now }
      : next.submissionStatus === "changes_requested" ? { status: "changes_requested" } : {},
  });
  await appendAudit(tx, {
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: decision === "approved" ? "approve_submission_stage" : "request_changes_submission_stage",
    entity: "submission_stage",
    entityId: row.id,
    payload: { submissionId, stageId, stageName: row.stage.name, decision, submissionStatus: updated.status, decidedAt: now.toISOString() },
  });
  return { status: 200, body: { message: decision === "approved" ? "Approval stage decided successfully." : "Changes requested successfully.", submission: updated, stageId, stageStatus: decision } };
}

export function jsonDecision(result: { status: number; body: Record<string, unknown> }) {
  return NextResponse.json(result.body, { status: result.status });
}
