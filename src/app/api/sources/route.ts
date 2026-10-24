import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin } from "@/lib/guards";
import { chunkSourceContent } from "@/lib/retrieval/chunk";
import { appendAudit } from "@/lib/audit";
import { SourceType, SourceStatus } from "@/generated/prisma";

export const runtime = "nodejs";

const createSourceSchema = z.object({
  type: z.enum(["guide", "glossary", "fact", "claims"]),
  title: z.string().min(1, "Title is required").max(200),
  owner: z.string().min(1, "Owner is required").max(200),
  content: z.string().min(1, "Content is required"),
  expiresAt: z.string().datetime().nullable().optional(),
});

// GET /api/sources: all authenticated roles can read
export async function GET(request: Request) {
  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type") as SourceType | null;
  const statusFilter = (searchParams.get("status") || "active") as SourceStatus;

  try {
    const sources = await db.source.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        _count: {
          select: { chunks: true, versions: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Error fetching sources:", error);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

// POST /api/sources: admin only
export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  try {
    const body = await request.json();
    const parsed = createSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { type, title, owner, content, expiresAt } = parsed.data;
    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

    const source = await db.$transaction(async (tx) => {
      // 1. Create Source
      const newSource = await tx.source.create({
        data: {
          workspaceId: user.workspaceId,
          type,
          title,
          owner,
          version: 1,
          status: "active",
          expiresAt: expiresAtDate,
          content,
        },
      });

      // 2. Create SourceVersion
      await tx.sourceVersion.create({
        data: {
          sourceId: newSource.id,
          version: 1,
          content,
          createdById: user.id,
        },
      });

      // 3. Build Chunks
      const chunks = chunkSourceContent(type, content);
      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((c) => ({
            sourceId: newSource.id,
            sourceVersion: 1,
            text: c.text,
            position: c.position,
          })),
        });
      }

      // 4. Append Audit Entry
      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "create_source",
        entity: "source",
        entityId: newSource.id,
        payload: {
          title,
          type,
          owner,
          chunkCount: chunks.length,
          expiresAt: expiresAtDate?.toISOString() || null,
        },
      });

      return newSource;
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("Error creating source:", error);
    return NextResponse.json({ error: "Failed to create source" }, { status: 500 });
  }
}
