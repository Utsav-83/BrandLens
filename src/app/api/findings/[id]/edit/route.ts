import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { applyFindingReplacement } from "@/lib/workflow";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const editFindingSchema = z.object({
  text: z.string().min(1, "Replacement text is required"),
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
    const parsed = editFindingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { text: customReplacement } = parsed.data;

    const transactionResult = await db.$transaction(async (tx) => {
      const finding = await tx.finding.findUnique({
        where: { id },
        include: { submission: true },
      });

      if (!finding) {
        throw new Error("NOT_FOUND");
      }

      if (user.role === "creator" && finding.submission.creatorId !== user.id) {
        throw new Error("FORBIDDEN");
      }

      if (finding.submission.status === "approved") {
        throw new Error("READ_ONLY_APPROVED");
      }

      // Idempotency: if already edited with the same text, return without duplicate modification
      if (finding.decision === "edited" && finding.finalText === customReplacement) {
        return {
          status: 200,
          finding,
          currentText: finding.submission.currentText,
          message: "Finding edit already applied.",
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
          error: "Finding is stale because draft text was modified. Please re-analyse before editing fixes.",
        };
      }

      // Apply custom text replacement
      const rep = applyFindingReplacement(
        finding.submission.currentText,
        finding.snippet,
        customReplacement,
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

      // Shift downstream pending finding offsets
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

      const updatedFinding = await tx.finding.update({
        where: { id },
        data: {
          decision: "edited",
          finalText: customReplacement,
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "edit_finding",
        entity: "finding",
        entityId: id,
        payload: {
          submissionId: finding.submissionId,
          snippet: finding.snippet,
          replacement: customReplacement,
          offsetShift: rep.delta,
        },
      });

      return {
        status: 200,
        finding: updatedFinding,
        currentText: rep.newText,
        message: "Finding edit applied.",
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
        return NextResponse.json({ error: "Finding not found." }, { status: 404 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      if (error.message === "READ_ONLY_APPROVED") {
        return NextResponse.json({ error: "Approved submissions are read-only." }, { status: 403 });
      }
    }
    console.error("Error editing finding:", error);
    return NextResponse.json({ error: "Failed to edit finding." }, { status: 500 });
  }
}
