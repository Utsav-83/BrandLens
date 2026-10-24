import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guards";

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
    const source = await db.source.findFirst({
      where: { id, workspaceId: user.workspaceId },
      select: { id: true, title: true, version: true },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    const versions = await db.sourceVersion.findMany({
      where: { sourceId: id },
      orderBy: { version: "desc" },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return NextResponse.json({ source, versions });
  } catch (error) {
    console.error("Error fetching source versions:", error);
    return NextResponse.json({ error: "Failed to fetch source versions" }, { status: 500 });
  }
}
