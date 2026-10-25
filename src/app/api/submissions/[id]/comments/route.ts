import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanViewSubmission } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const addCommentSchema = z.object({
  body: z.string().min(1, "Comment body is required"),
});

// GET /api/submissions/[id]/comments
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const submission = await db.submission.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
      },
      select: { id: true, creatorId: true, workspaceId: true, status: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }

    const authError = assertCanViewSubmission(user, submission);
    if (authError) return authError;

    const comments = await db.comment.findMany({
      where: { submissionId: id },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments." }, { status: 500 });
  }
}

// POST /api/submissions/[id]/comments
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = addCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const comment = await db.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id,
          workspaceId: user.workspaceId,
        },
      });

      if (!submission) {
        throw new Error("NOT_FOUND");
      }

      const authError = assertCanViewSubmission(user, submission);
      if (authError) {
        throw new Error("NOT_FOUND");
      }

      const newComment = await tx.comment.create({
        data: {
          submissionId: id,
          authorId: user.id,
          body: parsed.data.body,
        },
        include: {
          author: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "add_comment",
        entity: "comment",
        entityId: newComment.id,
        payload: {
          submissionId: id,
          bodyPreview: parsed.data.body.slice(0, 100),
        },
      });

      return newComment;
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }
    console.error("Error adding comment:", error);
    return NextResponse.json({ error: "Failed to add comment." }, { status: 500 });
  }
}
