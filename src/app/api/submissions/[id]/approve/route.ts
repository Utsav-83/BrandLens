import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanReview } from "@/lib/guards";
import { idParamSchema } from "@/lib/validation";
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
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid ID parameter. Must be a valid UUID." },
      { status: 400 }
    );
  }

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

      // Enforce separation of duties and reviewable status
      const reviewError = assertCanReview(user, submission);
      if (reviewError) {
        const errorJson = (await reviewError.json()) as { error: string };
        return {
          allowed: false,
          status: reviewError.status,
          reason: errorJson.error,
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
      return NextResponse.json({ error: result.reason }, { status: result.status || 403 });
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
