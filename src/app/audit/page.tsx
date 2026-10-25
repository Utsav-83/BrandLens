import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AUDIT_READ_ROLES } from "@/lib/guards";
import { db } from "@/lib/db";
import { AuditViewer, AuditRecord } from "./AuditViewer";

export const runtime = "nodejs";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!AUDIT_READ_ROLES.includes(user.role)) {
    redirect("/");
  }

  const logs = await db.auditLog.findMany({
    where: {
      workspaceId: user.workspaceId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });

  const formattedLogs: AuditRecord[] = logs.map((l) => ({
    id: l.id,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    actorId: l.actorId,
    createdAt: l.createdAt,
    prevHash: l.prevHash,
    hash: l.hash,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Audit Ledger & Governance Trail
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cryptographically hashed, append-only record of all submissions, reviews, decisions, and sign-offs.
        </p>
      </div>

      <AuditViewer initialLogs={formattedLogs} />
    </div>
  );
}
