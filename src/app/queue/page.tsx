import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ArrowRight,
  CheckCircle2,
  User,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

export const runtime = "nodejs";

export default async function ReviewQueuePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Only manager, reviewer, and admin should access the review queue
  if (user.role === "creator") {
    redirect("/");
  }

  const submissions = await prisma.submission.findMany({
    where: {
      workspaceId: user.workspaceId,
      status: "in_review",
    },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      findings: {
        where: { decision: "pending", stale: false },
        select: { severity: true },
      },
    },
    orderBy: { updatedAt: "asc" }, // oldest submissions first for fair FIFO review
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Reviewer Queue
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
              {submissions.length} pending
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Marketing copy submitted by creators waiting for reviewer sign-off or change requests.
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
          Logged in as <strong>{user.name}</strong> ({user.role})
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Review Queue Clear</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All submitted drafts have been reviewed. When creators submit drafts for review,
            they will appear here for manager or reviewer sign-off.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Draft Title
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Channel
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Creator
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Open Findings
                  </th>
                  <th scope="col" className="px-6 py-3.5 font-semibold text-slate-700">
                    Submitted
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right font-semibold text-slate-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {submissions.map((sub) => {
                  const highCount = sub.findings.filter((f) => f.severity === "high").length;
                  const medCount = sub.findings.filter((f) => f.severity === "medium").length;
                  const lowCount = sub.findings.filter((f) => f.severity === "low").length;

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/submissions/${sub.id}`}
                          className="font-bold text-slate-900 hover:text-teal-600 block"
                        >
                          {sub.title}
                        </Link>
                        <span className="text-xs text-slate-400">
                          {sub.currentText.trim().split(/\s+/).length} words
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-slate-100 text-slate-700">
                          {sub.channel}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{sub.creator.name}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {sub.findings.length === 0 ? (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All clean
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {highCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                                {highCount} High
                              </span>
                            )}
                            {medCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                                {medCount} Med
                              </span>
                            )}
                            {lowCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                {lowCount} Low
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                        {formatTimeAgo(sub.updatedAt)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/submissions/${sub.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-xs transition"
                        >
                          Review Draft
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
