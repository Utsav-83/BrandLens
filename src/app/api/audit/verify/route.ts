import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { verifyChain } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/audit/verify: manager and admin only
export async function GET() {
  const guard = await requireRole("admin", "manager");
  if (guard.error) return guard.error;
  const user = guard.user;

  try {
    const totalCount = await db.auditLog.count({
      where: { workspaceId: user.workspaceId },
    });

    const result = await verifyChain(db, user.workspaceId);

    return NextResponse.json({
      intact: result.intact,
      totalEntries: totalCount,
      brokenId: result.brokenId,
      reason: result.reason,
      workspaceId: user.workspaceId,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error verifying audit chain:", error);
    return NextResponse.json({ error: "Failed to verify audit chain." }, { status: 500 });
  }
}
