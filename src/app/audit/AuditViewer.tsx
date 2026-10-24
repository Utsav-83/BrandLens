"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export interface AuditRecord {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorId: string;
  createdAt: string | Date;
  prevHash: string | null;
  hash: string;
  payload?: unknown;
}

interface AuditViewerProps {
  initialLogs: AuditRecord[];
}

export function AuditViewer({ initialLogs }: AuditViewerProps) {
  const [logs] = useState<AuditRecord[]>(initialLogs);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    brokenAtId?: string;
    count?: number;
    checkedAt: string;
  } | null>(null);

  async function handleVerifyIntegrity() {
    setVerifying(true);
    setVerificationResult(null);
    try {
      const res = await fetch("/api/audit/verify");
      const data = await res.json();
      setVerificationResult({
        valid: data.valid,
        brokenAtId: data.brokenAtId,
        count: data.count,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error("Integrity check failed:", err);
      setVerificationResult({
        valid: false,
        checkedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setVerifying(false);
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchActor = log.actorId.toLowerCase().includes(q);
      const matchEntity = log.entityId.toLowerCase().includes(q) || log.entity.toLowerCase().includes(q);
      const matchHash = log.hash.toLowerCase().includes(q);
      if (!matchActor && !matchEntity && !matchHash) return false;
    }
    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="space-y-6">
      {/* Integrity Verification Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">
              Cryptographic Audit Chain Integrity
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            BrandLens links every governance decision, edit, and sign-off into a SHA-256 hash chain
            protected by transaction-level Postgres advisory locks. Verify that no logs have been
            tampered with or truncated.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={handleVerifyIntegrity}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying hashes...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Verify Integrity
              </>
            )}
          </button>
        </div>
      </div>

      {/* Verification Status Result Banner */}
      {verificationResult && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between ${
            verificationResult.valid
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-red-50 border-red-300 text-red-900"
          }`}
        >
          <div className="flex items-center gap-3">
            {verificationResult.valid ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
            )}
            <div>
              <h3 className="font-bold text-sm">
                {verificationResult.valid
                  ? "✓ Audit Chain Intact: Cryptographically Verified"
                  : "✗ Integrity Compromised: Chain Break Detected!"}
              </h3>
              <p className="text-xs mt-0.5 opacity-90">
                {verificationResult.valid
                  ? `All ${verificationResult.count ?? "recorded"} events match their expected cryptographic SHA-256 hash digests.`
                  : `First invalid hash link detected at entry ID: ${verificationResult.brokenAtId}`}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono opacity-75">
            Verified at {verificationResult.checkedAt}
          </span>
        </div>
      )}

      {/* Audit Log Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white font-mono"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entity, action, hash..."
              className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded w-56 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <span className="text-xs text-slate-400">
          Showing {filteredLogs.length} of {logs.length} entries
        </span>
      </div>

      {/* Audit Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Timestamp
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Action
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Entity
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Actor ID
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Entry Hash (SHA-256)
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                  Previous Hash
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white font-mono">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-sans">
                    {formatDate(log.createdAt)}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-800">
                      {log.action}
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    <span className="font-sans text-[11px] uppercase text-slate-400 mr-1">
                      {log.entity}:
                    </span>
                    <span className="text-teal-700 truncate inline-block max-w-[120px] align-middle">
                      {log.entityId}
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                    {log.actorId.substring(0, 12)}...
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-800" title={log.hash}>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                      {log.hash.substring(0, 16)}...
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-400" title={log.prevHash ?? "GENESIS"}>
                    <span className="text-[11px]">
                      {!log.prevHash || log.prevHash === "GENESIS"
                        ? "GENESIS"
                        : `${log.prevHash.substring(0, 12)}...`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
