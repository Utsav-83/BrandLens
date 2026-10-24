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
    const isRestrictedCreator = user.role === "creator";

    const submission = await db.submission.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        ...(isRestrictedCreator ? { creatorId: user.id } : {}),
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        findings: {
          orderBy: [{ severity: "desc" }, { start: "asc" }],
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error("Error fetching submission details:", error);
    return NextResponse.json({ error: "Failed to fetch submission." }, { status: 500 });
  }
}
