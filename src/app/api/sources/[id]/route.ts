import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { chunkSourceContent } from "@/lib/retrieval/chunk";
import { appendAudit } from "@/lib/audit";

export const runtime = "nodejs";

const updateSourceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  owner: z.string().min(1).max(200).optional(),
  content: z.string().min(1, "Content is required"),
  expiresAt: z.string().datetime().nullable().optional(),
});

// GET /api/sources/[id]: all authenticated roles
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  const { id } = await params;

  try {
    const source = await db.source.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        chunks: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error("Error fetching source:", error);
    return NextResponse.json({ error: "Failed to fetch source" }, { status: 500 });
  }
}

// PUT /api/sources/[id]: admin only (creates new version, rebuilds chunks, keeps history)
export async function PUT(
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
    const body = await request.json();
    const parsed = updateSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { title, owner, content, expiresAt } = parsed.data;

    const updatedSource = await db.$transaction(async (tx) => {
      // 1. Fetch current source
      const existing = await tx.source.findFirst({
        where: { id, workspaceId: user.workspaceId },
      });

      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      const nextVersion = existing.version + 1;
      const updatedExpiresAt = expiresAt !== undefined
        ? (expiresAt ? new Date(expiresAt) : null)
        : existing.expiresAt;

      // 2. Create SourceVersion
      await tx.sourceVersion.create({
        data: {
          sourceId: id,
          version: nextVersion,
          content,
          createdById: user.id,
        },
      });

      // 3. Update Source
      const updated = await tx.source.update({
        where: { id },
        data: {
          title: title ?? existing.title,
          owner: owner ?? existing.owner,
          version: nextVersion,
          content,
          expiresAt: updatedExpiresAt,
        },
      });

      // 4. Delete old chunks and build new chunks for active version
      await tx.chunk.deleteMany({
        where: { sourceId: id },
      });

      const chunks = chunkSourceContent(existing.type, content);
      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((c) => ({
            sourceId: id,
            sourceVersion: nextVersion,
            text: c.text,
            position: c.position,
          })),
        });
      }

      // 5. Append Audit Entry
      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "update_source_version",
        entity: "source",
        entityId: id,
        payload: {
          previousVersion: existing.version,
          newVersion: nextVersion,
          chunkCount: chunks.length,
          title: updated.title,
        },
      });

      return updated;
    });

    return NextResponse.json({ source: updatedSource });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    console.error("Error updating source:", error);
    return NextResponse.json({ error: "Failed to update source" }, { status: 500 });
  }
}
