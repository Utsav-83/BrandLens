import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guards";
import { retrieve, findExpiredMatches } from "@/lib/retrieval";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await requireRole("admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || !q.trim()) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  try {
    const activeMatches = await retrieve(user.workspaceId, q.trim(), { k: 10 });
    const expiredMatches = await findExpiredMatches(user.workspaceId, q.trim(), { k: 5 });

    return NextResponse.json({
      query: q,
      count: activeMatches.length,
      activeMatches,
      expiredMatches,
    });
  } catch (error) {
    console.error("Debug search error:", error);
    return NextResponse.json({ error: "Failed to perform retrieval query" }, { status: 500 });
  }
}
