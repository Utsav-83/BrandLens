import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AUDIT_READ_ROLES, requireRole } from "@/lib/guards";

export const runtime = "nodejs";

// GET /api/audit: manager, reviewer, and admin only. Omit payloads so audit
// readers cannot retrieve excerpts of creators' draft text from event metadata.
export async function GET(request: Request) {
  const guard = await requireRole(...AUDIT_READ_ROLES);
  if (guard.error) return guard.error;
  const user = guard.user;

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity");
  const action = searchParams.get("action");
  const actorId = searchParams.get("actorId");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const skip = (page - 1) * limit;

  try {
    const whereClause = {
      workspaceId: user.workspaceId,
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
    };

    const [total, entries] = await Promise.all([
      db.auditLog.count({ where: whereClause }),
      db.auditLog.findMany({
        where: whereClause,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      entries: entries.map(({ payload: _payload, ...entry }) => entry),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit records." }, { status: 500 });
  }
}
