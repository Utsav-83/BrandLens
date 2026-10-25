import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanReview } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const requestChangesSchema = z.object({
  comment: z.string().min(1, "Comment is required when requesting changes"),
});

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
    const body = await request.json();
    const parsed = requestChangesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { comment } = parsed.data;

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

      const reviewError = assertCanReview(user, submission);
      if (reviewError) {
        const errorJson = (await reviewError.json()) as { error: string };
        return {
          allowed: false,
          status: reviewError.status,
          reason: errorJson.error,
        };
      }

      if (!comment || !comment.trim()) {
        return {
          allowed: false,
          status: 400,
          reason: "A comment detailing the requested revisions is mandatory.",
        };
      }

      // Update status
      const updated = await tx.submission.update({
        where: { id },
        data: {
          status: "changes_requested",
        },
      });

      // Insert reviewer comment
      const newComment = await tx.comment.create({
        data: {
          submissionId: id,
          authorId: user.id,
          body: comment,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "request_changes",
        entity: "submission",
        entityId: id,
        payload: {
          commentId: newComment.id,
          commentPreview: comment.slice(0, 100),
          requestedBy: user.name,
        },
      });

      return {
        allowed: true,
        submission: updated,
        comment: newComment,
      };
    });

    if (!result.allowed) {
      return NextResponse.json({ error: result.reason }, { status: result.status || 403 });
    }

    return NextResponse.json({
      message: "Changes requested successfully.",
      submission: result.submission,
      comment: result.comment,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }
    console.error("Error requesting changes:", error);
    return NextResponse.json({ error: "Failed to request changes." }, { status: 500 });
  }
}
