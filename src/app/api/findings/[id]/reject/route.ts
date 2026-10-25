import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanEditSubmission } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const rejectFindingSchema = z.object({
  reason: z.string().min(1, "A reason for rejection is required"),
});

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
    const body = await request.json();
    const parsed = rejectFindingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { reason } = parsed.data;

    const transactionResult = await db.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
        include: { submission: true },
      });

      if (!finding) {
        throw new Error("NOT_FOUND");
      }

      const authError = assertCanEditSubmission(user, finding.submission);
      if (authError) {
        throw new Error("NOT_FOUND");
      }

      if (finding.submission.status === "approved") {
        throw new Error("READ_ONLY_APPROVED");
      }

      // Idempotency: if already rejected with same reason, return existing
      if (finding.decision === "rejected" && finding.rejectReason === reason) {
        return {
          status: 200,
          finding,
          message: "Finding already rejected.",
        };
      }

      if (finding.decision !== "pending") {
        return {
          status: 409,
          error: `Finding has already been decided (${finding.decision}).`,
        };
      }

      if (finding.stale) {
        return {
          status: 409,
          error: "Finding is stale because draft text was modified. Please re-analyse before rejecting fixes.",
        };
      }

      const updated = await tx.finding.update({
        where: { id },
        data: {
          decision: "rejected",
          rejectReason: reason,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "reject_finding",
        entity: "finding",
        entityId: id,
        payload: {
          submissionId: finding.submissionId,
          snippet: finding.snippet,
          rejectReason: reason,
        },
      });

      return {
        status: 200,
        finding: updated,
        message: "Finding fix rejected.",
      };
    });

    if (transactionResult.status !== 200) {
      return NextResponse.json(
        { error: transactionResult.error },
        { status: transactionResult.status }
      );
    }

    return NextResponse.json({
      finding: transactionResult.finding,
      message: transactionResult.message,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Finding not found or access denied." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      if (error.message === "READ_ONLY_APPROVED") {
        return NextResponse.json({ error: "Approved submissions are read-only." }, { status: 403 });
      }
    }
    console.error("Error rejecting finding:", error);
    return NextResponse.json({ error: "Failed to reject finding." }, { status: 500 });
  }
}
