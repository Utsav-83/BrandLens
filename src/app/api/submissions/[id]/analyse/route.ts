import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { checkRateLimit } from "@/lib/ratelimit";
import { analyzeDraft } from "@/lib/review";
import { appendAudit } from "@/lib/audit";
import { FindingOrigin, FindingSeverity } from "@/generated/prisma";

export const runtime = "nodejs";
export const maxDuration = 60; // Up to 60 seconds allowed on Vercel function

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

  // DB-based rate limit: 10 analyses per user per 10 minutes (600s)
  const rateLimitKey = `analyse:${user.id}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 10, 600);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Analysis rate limit exceeded. You can perform 10 analyses per 10 minutes.",
        resetTime: rateLimit.resetTime.toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": "600",
        },
      }
    );
  }

  try {
    // 1. Fetch submission and verify ownership
    const submission = await db.submission.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        ...(user.role === "creator" ? { creatorId: user.id } : {}),
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found or access denied." },
        { status: 404 }
      );
    }

    // 2. Call the analysis engine OUTSIDE of the DB transaction
    // (Rules first, AI second, citation validation)
    const analysis = await analyzeDraft(user.workspaceId, submission.currentText);

    // 3. Atomically write results, update status, and append to audit log in one transaction
    const result = await db.$transaction(async (tx) => {
      // Delete previous pending findings for this submission
      await tx.finding.deleteMany({
        where: {
          submissionId: id,
          OR: [{ decision: "pending" }, { stale: true }],
        },
      });

      // Insert validated findings
      if (analysis.findings.length > 0) {
        await tx.finding.createMany({
          data: analysis.findings.map((f) => ({
            submissionId: id,
            ruleId: f.ruleId,
            origin: f.origin as FindingOrigin,
            category: f.category,
            severity: f.severity as FindingSeverity,
            confidence: f.confidence,
            start: f.start,
            end: f.end,
            snippet: f.snippet,
            message: f.message,
            sourceId: f.sourceId,
            sourceQuote: f.sourceQuote,
            suggestedFix: f.suggestedFix,
            needsHumanReview: f.needsHumanReview,
            stale: false,
            decision: "pending",
          })),
        });
      }

      // Update submission status to 'analysed' and record AI telemetry
      const updatedSubmission = await tx.submission.update({
        where: { id },
        data: {
          status: "analysed",
          aiStatus: analysis.aiStatus,
          aiModel: analysis.aiModel,
        },
      });

      // Append tamper-evident audit record
      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "analyse_submission",
        entity: "submission",
        entityId: id,
        payload: {
          findingCount: analysis.findings.length,
          ruleFindings: analysis.ruleFindingCount,
          aiFindings: analysis.aiFindingCount,
          aiStatus: analysis.aiStatus,
          aiModel: analysis.aiModel,
          sourceIdsUsed: analysis.sourceIdsUsed,
        },
      });

      // Retrieve full list of freshly created findings
      const savedFindings = await tx.finding.findMany({
        where: { submissionId: id },
        orderBy: [{ severity: "desc" }, { start: "asc" }],
      });

      return {
        submission: updatedSubmission,
        findings: savedFindings,
      };
    });

    return NextResponse.json({
      submission: result.submission,
      findings: result.findings,
      aiStatus: analysis.aiStatus,
      aiModel: analysis.aiModel,
    });
  } catch (error) {
    console.error("Submission analysis error:", error);
    return NextResponse.json(
      { error: "Failed to complete content analysis." },
      { status: 500 }
    );
  }
}
