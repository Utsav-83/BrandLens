import React from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SubmissionWorkspace } from "./SubmissionWorkspace";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SubmissionPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const submission = await db.submission.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, email: true, role: true },
      },
      approvedBy: {
        select: { id: true, name: true, email: true },
      },
      findings: {
        orderBy: [{ severity: "desc" }, { start: "asc" }],
      },
      comments: {
        include: {
          author: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!submission || submission.workspaceId !== user.workspaceId) {
    notFound();
  }

  // Authorization: creators can only view their own submissions
  if (user.role === "creator" && submission.creatorId !== user.id) {
    notFound();
  }

  // Fetch audit trail for this submission
  const auditLogs = await db.auditLog.findMany({
    where: {
      workspaceId: user.workspaceId,
      entityId: id,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  const formattedData = {
    ...submission,
    findings: submission.findings.map((f) => ({
      id: f.id,
      ruleId: f.ruleId,
      origin: f.origin as "rule" | "ai",
      category: f.category,
      severity: f.severity as "high" | "medium" | "low",
      confidence: f.confidence,
      start: f.start,
      end: f.end,
      snippet: f.snippet,
      message: f.message,
      sourceId: f.sourceId,
      sourceQuote: f.sourceQuote,
      suggestedFix: f.suggestedFix,
      decision: f.decision as "pending" | "accepted" | "edited" | "rejected",
      rejectReason: f.rejectReason,
      finalText: f.finalText,
      stale: f.stale,
      needsHumanReview: f.needsHumanReview,
    })),
    comments: submission.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: c.author,
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      actorId: log.actorId,
      hash: log.hash,
    })),
  };

  return <SubmissionWorkspace submission={formattedData} currentUser={user} />;
}
