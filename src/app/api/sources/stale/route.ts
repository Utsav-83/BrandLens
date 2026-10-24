import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  try {
    const now = new Date();
    const staleSources = await db.source.findMany({
      where: {
        workspaceId: user.workspaceId,
        status: "active",
        expiresAt: {
          lt: now,
        },
      },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { expiresAt: "asc" },
    });

    return NextResponse.json({
      staleSources,
      count: staleSources.length,
      evaluatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching stale sources:", error);
    return NextResponse.json({ error: "Failed to fetch stale sources" }, { status: 500 });
  }
}
