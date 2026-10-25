import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanEditSubmission } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const patchTextSchema = z.object({
  text: z.string().min(1).optional(),
  currentText: z.string().min(1).optional(),
}).refine((data) => !!(data.text || data.currentText), {
  message: "Text content is required in 'text' or 'currentText'",
});

export async function PATCH(
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
    const body = await request.json();
    const parsed = patchTextSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const text = (parsed.data.text || parsed.data.currentText)!.trim();

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

      const authError = assertCanEditSubmission(user, submission);
      if (authError) {
        throw new Error("NOT_FOUND");
      }

      if (submission.status === "approved") {
        throw new Error("READ_ONLY_APPROVED");
      }

      const textChanged = text !== submission.currentText;
      if (textChanged) {
        await tx.finding.updateMany({
          where: { submissionId: id },
          data: { stale: true },
        });
      }

      // Update currentText and transition status back to 'draft'
      const updated = await tx.submission.update({
        where: { id },
        data: {
          currentText: text,
          status: textChanged ? "draft" : submission.status,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "edit_submission_text",
        entity: "submission",
        entityId: id,
        payload: {
          previousLength: submission.currentText.length,
          newLength: text.length,
          findingsMarkedStale: textChanged,
          statusResetToDraft: textChanged,
        },
      });

      return { submission: updated, textChanged };
    });

    return NextResponse.json({
      submission: result.submission,
      message: result.textChanged
        ? "Text updated successfully. Findings have been marked stale and require re-analysis."
        : "Text is unchanged; existing findings remain valid.",
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
      }
      if (error.message === "READ_ONLY_APPROVED") {
        return NextResponse.json({ error: "Approved submissions are read-only and cannot be edited." }, { status: 403 });
      }
    }
    console.error("Error editing submission text:", error);
    return NextResponse.json({ error: "Failed to update draft text." }, { status: 500 });
  }
}
