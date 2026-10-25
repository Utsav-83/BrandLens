import { NextResponse } from "next/server";
import { diffWordsWithSpace, diffLines } from "diff";
import { db } from "@/lib/db";
import { requireRole, assertCanViewSubmission } from "@/lib/guards";

export const runtime = "nodejs";

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
      select: {
        id: true,
        title: true,
        status: true,
        creatorId: true,
        workspaceId: true,
        originalText: true,
        currentText: true,
      },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found or access denied." }, { status: 404 });
    }

    const authError = assertCanViewSubmission(user, submission);
    if (authError) return authError;

    const wordDiff = diffWordsWithSpace(submission.originalText, submission.currentText);
    const lineDiff = diffLines(submission.originalText, submission.currentText);

    return NextResponse.json({
      submissionId: id,
      title: submission.title,
      status: submission.status,
      originalText: submission.originalText,
      currentText: submission.currentText,
      hasChanges: submission.originalText !== submission.currentText,
      wordDiff,
      lineDiff,
    });
  } catch (error) {
    console.error("Error computing submission diff:", error);
    return NextResponse.json({ error: "Failed to compute diff." }, { status: 500 });
  }
}
