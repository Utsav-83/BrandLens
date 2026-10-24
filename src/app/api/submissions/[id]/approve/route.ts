import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { validateApproval } from "@/lib/workflow";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("manager", "reviewer", "admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const result = await db.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id,
          workspaceId: user.workspaceId,
        },
      });

      if (!submission) {
        throw new Error("NOT_FOUND");
      }

      // Enforce separation of duties: creators cannot approve their own work
      const validation = validateApproval(submission, user.id, user.role);
      if (!validation.allowed) {
        return {
          allowed: false,
          reason: validation.reason,
        };
      }

      const now = new Date();
      const updated = await tx.submission.update({
        where: { id },
        data: {
          status: "approved",
          approvedText: submission.currentText,
          approvedById: user.id,
          approvedAt: now,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "approve_submission",
        entity: "submission",
        entityId: id,
        payload: {
          approvedBy: user.name,
          approvedAt: now.toISOString(),
          textLength: submission.currentText.length,
        },
      });

      return {
        allowed: true,
        submission: updated,
      };
    });

    if (!result.allowed) {
      return NextResponse.json({ error: result.reason }, { status: 403 });
    }

    return NextResponse.json({
      message: "Submission approved successfully.",
      submission: result.submission,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }
    console.error("Error approving submission:", error);
    return NextResponse.json({ error: "Failed to approve submission." }, { status: 500 });
  }
}
