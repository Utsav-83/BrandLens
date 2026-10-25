import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, assertCanEditSubmission } from "@/lib/guards";
import { idParamSchema } from "@/lib/validation";
import { applyFindingReplacement } from "@/lib/workflow";
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
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Invalid ID parameter. Must be a valid UUID." },
      { status: 400 }
    );
  }

  try {
    const transactionResult = await db.$transaction(async (tx) => {
      // Serialize decisions on the same finding. A concurrent request will read
      // the committed decision after this row lock is released and return 409.
      await tx.$queryRaw`SELECT id FROM findings WHERE id = ${id} FOR UPDATE`;
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

      // Idempotency: if already accepted, return existing result without re-applying
      if (finding.decision === "accepted") {
        return {
          status: 200,
          finding,
          currentText: finding.submission.currentText,
          message: "Finding already accepted.",
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
          error: "Finding is stale because draft text was modified. Please re-analyse before accepting fixes.",
        };
      }

      const replacementText = finding.suggestedFix;
      if (!replacementText) {
        return {
          status: 400,
          error: "Finding does not have an approved suggested fix to accept.",
        };
      }

      // Perform replacement using offsets with unique substring fallback
      const rep = applyFindingReplacement(
        finding.submission.currentText,
        finding.snippet,
        replacementText,
        finding.start,
        finding.end
      );

      if (!rep.success || !rep.newText) {
        return {
          status: 409,
          error: rep.error || "Failed to locate snippet for replacement.",
        };
      }

      // Update submission text
      await tx.submission.update({
        where: { id: finding.submissionId },
        data: { currentText: rep.newText },
      });

      // Shift offsets of other pending findings located after this edit
      if (rep.replacementStart !== undefined && rep.replacementEnd !== undefined) {
        const overlappingFindings = await tx.finding.findMany({
          where: {
            submissionId: finding.submissionId,
            id: { not: id },
            decision: "pending",
            start: { lt: rep.replacementEnd },
            end: { gt: rep.replacementStart },
          },
          select: { id: true },
        });
        if (overlappingFindings.length > 0) {
          await tx.finding.updateMany({
            where: { id: { in: overlappingFindings.map((item) => item.id) } },
            data: { stale: true },
          });
        }
      }

      if (rep.delta !== undefined && rep.delta !== 0 && rep.replacementEnd !== undefined) {
        const downstreamFindings = await tx.finding.findMany({
          where: {
            submissionId: finding.submissionId,
            id: { not: id },
            decision: "pending",
            start: { gte: rep.replacementEnd },
          },
        });

        for (const down of downstreamFindings) {
          if (down.start !== null && down.end !== null) {
            await tx.finding.update({
              where: { id: down.id },
              data: {
                start: down.start + rep.delta,
                end: down.end + rep.delta,
              },
            });
          }
        }
      }

      // Mark finding as accepted
      const updatedFinding = await tx.finding.update({
        where: { id },
        data: {
          decision: "accepted",
          finalText: replacementText,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "accept_finding",
        entity: "finding",
        entityId: id,
        payload: {
          submissionId: finding.submissionId,
          snippet: finding.snippet,
          replacement: replacementText,
          offsetShift: rep.delta,
        },
      });

      return {
        status: 200,
        finding: updatedFinding,
        currentText: rep.newText,
        message: "Finding fix accepted and applied.",
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
      currentText: transactionResult.currentText,
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
    console.error("Error accepting finding:", error);
    return NextResponse.json({ error: "Failed to accept finding." }, { status: 500 });
  }
}
