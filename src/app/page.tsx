import React from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  FileText,
  PlusCircle,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Info,
  BookOpen,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-full text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          Round 2 Hackathon Release
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
          Pre-Publication Brand Governance
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Ensure marketing drafts adhere to brand voice guidelines, glossaries, approved facts,
          and claim standards with citation verification and tamper-evident audit trails.
        </p>
        <div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition text-base"
          >
            Launch with Demo Accounts
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  // Fetch submissions based on user role
  const isManagerOrAbove =
    user.role === "manager" || user.role === "reviewer" || user.role === "legal_reviewer" || user.role === "admin";

  const submissions = await prisma.submission.findMany({
    where: {
      workspaceId: user.workspaceId,
      ...(isManagerOrAbove ? {} : { creatorId: user.id }),
    },
    include: {
      creator: { select: { name: true, email: true } },
      findings: {
        select: { severity: true, decision: true, stale: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const statusBadges: Record<string, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
    draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", icon: Clock },
    analysed: { label: "Analysed", bg: "bg-teal-50", text: "text-teal-700", icon: Sparkles },
    in_review: { label: "In Review", bg: "bg-amber-50", text: "text-amber-800", icon: Clock },
    changes_requested: { label: "Changes Requested", bg: "bg-rose-50", text: "text-rose-800", icon: AlertTriangle },
    approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-800", icon: CheckCircle2 },
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 4-Step Judge Guidance Banner */}
      <section aria-labelledby="how-it-works-title" className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 id="how-it-works-title" className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-600" aria-hidden="true" />
              How BrandLens Works (Judge Walkthrough)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict deterministic brand rules + BM25 knowledge retrieval + AI judge + human governance.
            </p>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">
            Role: {user.role}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-teal-600 mb-1">Step 1: Ingest Content</div>
            <p className="text-xs text-slate-600">
              Submit raw copy or upload DOCX/PDF. Plain text is extracted with magic byte verification.
            </p>
          </div>
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-teal-600 mb-1">Step 2: Hybrid Review</div>
            <p className="text-xs text-slate-600">
              Rules run first. Retrieval matches active facts. AI checks tone & claims (citations strictly validated).
            </p>
          </div>
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-teal-600 mb-1">Step 3: Human Decisions</div>
            <p className="text-xs text-slate-600">
              Creators accept, edit, or reject proposed fixes. AI never auto-publishes or overwrites copy.
            </p>
          </div>
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-teal-600 mb-1">Step 4: Audit & Signoff</div>
            <p className="text-xs text-slate-600">
              Managers review diffs & approve. Every event is sealed in a SHA-256 tamper-evident hash chain.
            </p>
          </div>
        </div>
      </section>

      {/* Submissions Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isManagerOrAbove ? "Workspace Submissions" : "My Submissions"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {submissions.length === 0
              ? "No drafts found. Create your first draft or load the sample flawed content."
              : `Showing ${submissions.length} active drafts in Aurora Pay workspace.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sources"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-xs transition"
          >
            <BookOpen className="w-4 h-4 text-slate-500" />
            Knowledge Base
          </Link>
          {user.role === "admin" && <Link href="/settings/approval-matrix" className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-xs transition">Approval matrix</Link>}
          <Link
            href="/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            New Draft
          </Link>
        </div>
      </div>

      {/* Submissions Table / Empty State */}
      {submissions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-4">
          <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto text-teal-600">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No submissions yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Paste copy or load the pre-configured sample flawed content to see BrandLens analyse
            glossaries, tone, absolute claims, and numeric fact checks in action.
          </p>
          <div className="pt-2">
            <Link
              href="/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg shadow-xs transition"
            >
              <Sparkles className="w-4 h-4" />
              Create & Analyse Sample Draft
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Title & Channel
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Findings
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Author
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Updated
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right font-semibold text-slate-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {submissions.map((sub) => {
                  const badge = statusBadges[sub.status] || {
                    label: sub.status,
                    bg: "bg-slate-100",
                    text: "text-slate-700",
                    icon: Clock,
                  };
                  const BadgeIcon = badge.icon;
                  const pendingFindings = sub.findings.filter(
                    (f) => f.decision === "pending" && !f.stale
                  );
                  const highPending = pendingFindings.filter((f) => f.severity === "high").length;
                  const medPending = pendingFindings.filter((f) => f.severity === "medium").length;
                  const lowPending = pendingFindings.filter((f) => f.severity === "low").length;

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/submissions/${sub.id}`}
                          className="font-semibold text-slate-900 hover:text-teal-600 block"
                        >
                          {sub.title}
                        </Link>
                        <span className="inline-block mt-1 text-xs uppercase px-2 py-0.5 font-medium rounded bg-slate-100 text-slate-600">
                          {sub.channel}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}
                        >
                          <BadgeIcon className="w-3.5 h-3.5" />
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {pendingFindings.length === 0 ? (
                          <span className="text-xs text-slate-600">0 open issues</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {highPending > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">
                                <AlertTriangle className="w-3 h-3 shrink-0 text-red-700" aria-hidden="true" />
                                {highPending} High
                              </span>
                            )}
                            {medPending > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-900">
                                <AlertCircle className="w-3 h-3 shrink-0 text-amber-700" aria-hidden="true" />
                                {medPending} Med
                              </span>
                            )}
                            {lowPending > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-900">
                                <Info className="w-3 h-3 shrink-0 text-blue-700" aria-hidden="true" />
                                {lowPending} Low
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {sub.creator.name}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                        {formatTimeAgo(sub.updatedAt)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/submissions/${sub.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:rounded"
                        >
                          Open Review
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
