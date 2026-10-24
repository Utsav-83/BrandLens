import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { validateSubmitForReview } from "@/lib/workflow";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("creator", "admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const result = await db.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id,
          workspaceId: user.workspaceId,
          ...(user.role === "creator" ? { creatorId: user.id } : {}),
        },
        include: {
          findings: true,
        },
      });

      if (!submission) {
        throw new Error("NOT_FOUND");
      }

      // Enforce server-side workflow guard
      const validation = validateSubmitForReview(submission.status, submission.findings);
      if (!validation.allowed) {
        return {
          allowed: false,
          reason: validation.reason,
          pendingHighSnippets: validation.pendingHighSnippets,
        };
      }

      const updated = await tx.submission.update({
        where: { id },
        data: {
          status: "in_review",
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "submit_for_review",
        entity: "submission",
        entityId: id,
        payload: {
          previousStatus: submission.status,
          newStatus: "in_review",
          totalFindings: submission.findings.length,
        },
      });

      return {
        allowed: true,
        submission: updated,
      };
    });

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: result.reason,
          pendingHighSnippets: result.pendingHighSnippets,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: "Submission submitted for review successfully.",
      submission: result.submission,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }
    console.error("Error submitting for review:", error);
    return NextResponse.json({ error: "Failed to submit for review." }, { status: 500 });
  }
}
