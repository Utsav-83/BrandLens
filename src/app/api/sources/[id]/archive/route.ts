import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const archivedSource = await db.$transaction(async (tx) => {
      const existing = await tx.source.findFirst({
        where: { id, workspaceId: user.workspaceId },
      });

      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      const updated = await tx.source.update({
        where: { id },
        data: { status: "archived" },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "archive_source",
        entity: "source",
        entityId: id,
        payload: {
          title: existing.title,
          type: existing.type,
          version: existing.version,
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      message: "Source archived successfully",
      source: archivedSource,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    console.error("Error archiving source:", error);
    return NextResponse.json({ error: "Failed to archive source" }, { status: 500 });
  }
}
