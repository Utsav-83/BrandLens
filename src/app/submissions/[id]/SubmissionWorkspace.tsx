"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Send,
  Check,
  X,
  Edit2,
  MessageSquare,
  GitCompare,
  History,
  Clock,
  Layers,
  ChevronRight,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import * as Diff from "diff";
import { SeverityBadge, OriginBadge } from "@/components/SeverityBadge";
import { RulesOnlyBanner } from "@/components/RulesOnlyBanner";
import { formatTimeAgo, formatDate } from "@/lib/utils";
import { useToast } from "@/components/Toast";

export interface FindingItem {
  id: string;
  ruleId: string | null;
  origin: "rule" | "ai";
  category: string;
  severity: "high" | "medium" | "low";
  confidence: number;
  start: number | null;
  end: number | null;
  snippet: string;
  message: string;
  sourceQuote: string | null;
  sourceTitle?: string | null;
  sourceId: string | null;
  suggestedFix: string | null;
  decision: "pending" | "accepted" | "edited" | "rejected";
  rejectReason: string | null;
  finalText: string | null;
  stale: boolean;
  needsHumanReview: boolean;
}

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string | Date;
  author: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export interface AuditItem {
  id: string;
  action: string;
  createdAt: string | Date;
  actorId: string;
  hash: string;
}

export interface SubmissionData {
  id: string;
  title: string;
  channel: string;
  status: "draft" | "analysed" | "in_review" | "changes_requested" | "approved";
  aiStatus: string | null;
  aiModel: string | null;
  originalText: string;
  currentText: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  creator: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  approvedBy?: {
    name: string;
    email: string;
  } | null;
  approvedAt?: string | Date | null;
  findings: FindingItem[];
  comments: CommentItem[];
  auditLogs: AuditItem[];
  stages: Array<{ id: string; stageId: string; status: "pending" | "approved" | "changes_requested"; stage: { name: string; order: number; requiredReviewerRole: string }; decidedBy: { name: string } | null }>;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: "creator" | "manager" | "reviewer" | "legal_reviewer" | "admin";
}

interface SubmissionWorkspaceProps {
  submission: SubmissionData;
  currentUser: CurrentUser;
}

export function SubmissionWorkspace({
  submission: initialSubmission,
  currentUser,
}: SubmissionWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [submission, setSubmission] = useState<SubmissionData>(initialSubmission);
  const [activeTab, setActiveTab] = useState<"findings" | "diff" | "comments" | "history">("findings");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  // Filters for findings
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Actions in flight
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject dialog state
  const [rejectingFindingId, setRejectingFindingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Edit fix dialog state
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [customFixText, setCustomFixText] = useState("");

  // Direct copy editing
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftEditText, setDraftEditText] = useState(submission.currentText);

  // Request changes state
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [changesComment, setChangesComment] = useState("");

  // New comment input
  const [newComment, setNewComment] = useState("");

  const isCreator = currentUser.id === submission.creator.id;
  const isReviewerOrManager =
    currentUser.role === "manager" ||
    currentUser.role === "reviewer" ||
    currentUser.role === "legal_reviewer" ||
    currentUser.role === "admin";
  const canApproveOrRequest = isReviewerOrManager && !isCreator;

  // Findings metrics
  const activeFindings = submission.findings.filter((f) => !f.stale);
  const pendingFindings = activeFindings.filter((f) => f.decision === "pending");
  const highPendingCount = pendingFindings.filter((f) => f.severity === "high").length;
  const isStale = submission.findings.some((f) => f.stale);

  // Refresh submission data from server
  async function refreshData() {
    try {
      const res = await fetch(`/api/submissions/${submission.id}`);
      if (res.ok) {
        const data = await res.json();
        const sub = data.submission || data;
        setSubmission((prev) => ({
          ...prev,
          ...sub,
          auditLogs: prev.auditLogs,
        }));
        setDraftEditText(sub.currentText);
      }
    } catch {
      router.refresh();
    }
  }

  // Run or re-run analysis
  async function handleAnalyse() {
    setActionLoading("analyse");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/analyse`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }
      const findingCount = Array.isArray(data.findings) ? data.findings.length : 0;
      setActionSuccess(`Analysis complete! Identified ${findingCount} finding(s).`);
      toast.success(`Identified ${findingCount} finding(s).`, "Analysis Complete");
      await refreshData();
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run analysis";
      setActionError(msg);
      toast.error(msg, "Analysis Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Accept a finding
  async function handleAccept(findingId: string) {
    setActionLoading(`accept-${findingId}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/findings/${findingId}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept fix");
      }
      await refreshData();
      setActionSuccess("Fix accepted and applied to copy.");
      toast.success("Fix applied to copy.", "Accepted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept fix";
      setActionError(msg);
      toast.error(msg, "Action Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Submit edit for a finding
  async function handleEditFix(findingId: string) {
    if (!customFixText.trim()) return;
    setActionLoading(`edit-${findingId}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/findings/${findingId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: customFixText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save edited fix");
      }
      setEditingFindingId(null);
      setCustomFixText("");
      await refreshData();
      setActionSuccess("Custom fix applied to copy.");
      toast.success("Custom fix applied.", "Saved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save edit";
      setActionError(msg);
      toast.error(msg, "Edit Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Reject finding with reason
  async function handleReject(findingId: string) {
    if (!rejectReason.trim()) {
      setActionError("Please provide a reason for rejecting this finding.");
      toast.warning("Please provide a reason for rejecting this finding.");
      return;
    }
    setActionLoading(`reject-${findingId}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/findings/${findingId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reject finding");
      }
      setRejectingFindingId(null);
      setRejectReason("");
      await refreshData();
      setActionSuccess("Finding rejected.");
      toast.info("Finding marked as rejected.", "Rejected");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject finding";
      setActionError(msg);
      toast.error(msg, "Reject Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Save manual edits to draft copy
  async function handleSaveDraftText() {
    setActionLoading("save-text");
    setActionError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/text`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentText: draftEditText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update draft text");
      }
      setIsEditingDraft(false);
      await refreshData();
      setActionSuccess("Draft copy updated. Findings are marked stale; re-analysis required.");
      toast.warning("Findings marked stale. Click Re-analyse to update.", "Copy Updated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save edits";
      setActionError(msg);
      toast.error(msg, "Update Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Submit for review
  async function handleSubmitForReview() {
    setActionLoading("submit-review");
    setActionError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/submit-for-review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit for review");
      }
      await refreshData();
      setActionSuccess("Draft successfully submitted to review queue!");
      toast.success("Draft submitted to review queue.", "Submitted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit for review";
      setActionError(msg);
      toast.error(msg, "Submission Blocked");
    } finally {
      setActionLoading(null);
    }
  }

  // Approve submission
  async function handleApprove() {
    setActionLoading("approve");
    setActionError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Approval failed");
      }
      await refreshData();
      setActionSuccess("Draft approved and sealed! Published version locked.");
      toast.success("Draft approved and sealed.", "Approved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      setActionError(msg);
      toast.error(msg, "Approval Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Request changes with mandatory comment
  async function handleRequestChanges() {
    if (!changesComment.trim()) {
      setActionError("A comment explaining the requested changes is mandatory.");
      toast.warning("A comment explaining the requested changes is mandatory.");
      return;
    }
    setActionLoading("request-changes");
    setActionError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: changesComment }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request changes failed");
      }
      setIsRequestingChanges(false);
      setChangesComment("");
      await refreshData();
      setActionSuccess("Changes requested. Draft returned to creator.");
      toast.warning("Changes requested. Draft returned to creator.", "Revisions Requested");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request changes failed";
      setActionError(msg);
      toast.error(msg, "Action Failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Add comment
  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setActionLoading("comment");
    try {
      const res = await fetch(`/api/submissions/${submission.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add comment");
      }
      setNewComment("");
      await refreshData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setActionLoading(null);
    }
  }

  // Stepper representation
  const steps = [
    { key: "draft", label: "Draft" },
    { key: "analysed", label: "Analysed" },
    { key: "in_review", label: "In Review" },
    { key: "approved", label: "Approved" },
  ];

  const getStepStatus = (stepKey: string) => {
    if (submission.status === "changes_requested") {
      if (stepKey === "draft") return "completed";
      if (stepKey === "analysed") return "completed";
      if (stepKey === "in_review") return "warning";
      return "upcoming";
    }
    const order = ["draft", "analysed", "in_review", "approved"];
    const currentIndex = order.indexOf(submission.status);
    const stepIndex = order.indexOf(stepKey);
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  // Filtered findings list
  const filteredFindings = submission.findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
    return true;
  });

  // Render highlights inside the draft copy
  function renderHighlightedDraft() {
    const text = submission.currentText;
    // Only pending, non-stale findings with valid offsets get highlighted
    const validFindings = submission.findings
      .filter((f) => f.decision === "pending" && !f.stale && f.start != null && f.end != null)
      .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

    if (validFindings.length === 0) {
      return (
        <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 p-4">
          {text}
        </div>
      );
    }

    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    validFindings.forEach((finding, idx) => {
      const start = finding.start!;
      const end = finding.end!;

      if (start > lastIndex) {
        segments.push(
          <span key={`text-${lastIndex}`}>{text.substring(lastIndex, start)}</span>
        );
      }

      if (start >= lastIndex && end <= text.length) {
        const highlightSnippet = text.substring(start, end);
        const isSelected = selectedFindingId === finding.id;
        const colorStyles =
          finding.severity === "high"
            ? "bg-red-100 text-red-950 border-b-2 border-red-500 hover:bg-red-200"
            : finding.severity === "medium"
            ? "bg-amber-100 text-amber-950 border-b-2 border-amber-500 hover:bg-amber-200"
            : "bg-blue-100 text-blue-950 border-b-2 border-blue-500 hover:bg-blue-200";

        segments.push(
          <mark
            key={`finding-${finding.id}-${idx}`}
            onClick={() => {
              setSelectedFindingId(finding.id);
              setActiveTab("findings");
              const el = document.getElementById(`finding-card-${finding.id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className={`cursor-pointer px-1 py-0.5 rounded transition ${colorStyles} ${
              isSelected ? "ring-2 ring-teal-500 ring-offset-1 font-medium" : ""
            }`}
            title={`Finding: ${finding.message} (Click to inspect)`}
          >
            <span className="inline-flex items-center text-[10px] font-bold mr-1 opacity-75">
              {finding.severity === "high" && "▲"}
              {finding.severity === "medium" && "●"}
              {finding.severity === "low" && "ℹ"}
            </span>
            {highlightSnippet}
          </mark>
        );
        lastIndex = end;
      }
    });

    if (lastIndex < text.length) {
      segments.push(
        <span key={`text-end-${lastIndex}`}>{text.substring(lastIndex)}</span>
      );
    }

    return (
      <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800 p-4">
        {segments}
      </div>
    );
  }

  // Full Word Diff computation
  const diffParts = Diff.diffWords(submission.originalText, submission.currentText);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Status Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {submission.channel}
              </span>
              <span className="text-xs text-slate-600">Created by {submission.creator.name}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
              {submission.title}
            </h1>
          </div>

          {/* Stepper */}
          <nav aria-label="Workflow Status" className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-1">
            {steps.map((step, idx) => {
              const status = getStepStatus(step.key);
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      status === "completed"
                        ? "bg-teal-50 text-teal-800 border border-teal-200"
                        : status === "current"
                        ? "bg-slate-900 text-white"
                        : status === "warning"
                        ? "bg-rose-100 text-rose-800 border border-rose-300"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {status === "completed" && <Check className="w-3.5 h-3.5 text-teal-600" />}
                    {status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />}
                    <span>{step.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Global Alert Banners */}
        {submission.stages.length > 0 && (
          <section aria-label="Approval stage progress" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">Approval stages</h2>
            <ol className="flex flex-wrap gap-2">
              {submission.stages.map((item) => (
                <li key={item.id} className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800">
                  {item.status === "approved" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : item.status === "changes_requested" ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> : <Clock aria-hidden="true" className="h-3.5 w-3.5" />}
                  <span>{item.stage.name}: {item.status.replaceAll("_", " ")}</span>
                  <span className="text-slate-600">({item.stage.requiredReviewerRole.replaceAll("_", " ")})</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <RulesOnlyBanner aiStatus={submission.aiStatus} />

        {isStale && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-amber-950 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span>
                <strong>Copy has changed.</strong> Previous findings are marked stale. Re-run analysis
                to re-verify tone and claims.
              </span>
            </div>
            {isCreator && (
              <button
                type="button"
                onClick={handleAnalyse}
                disabled={!!actionLoading}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-600"
              >
                Re-analyse Now
              </button>
            )}
          </div>
        )}

        {/* Live Analysis Status Area (aria-live="polite") */}
        <div aria-live="polite" aria-atomic="true" className="space-y-2">
          {actionLoading === "analyse" && (
            <div role="status" className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2 text-teal-900 text-xs font-medium">
              <Loader2 className="w-4 h-4 text-teal-600 animate-spin shrink-0" aria-hidden="true" />
              <span>Running brand analysis against guidelines and facts...</span>
            </div>
          )}

          {actionError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-900 text-xs font-medium">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={handleAnalyse}
                className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-red-600 transition"
              >
                Retry
              </button>
            </div>
          )}

          {actionSuccess && (
            <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-900 text-xs font-medium">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>{actionSuccess}</span>
            </div>
          )}
        </div>

        {/* Action Bar by Role and State */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>
              <strong>{pendingFindings.length}</strong> open finding(s)
            </span>
            <span>•</span>
            <span className={highPendingCount > 0 ? "text-red-700 font-semibold" : ""}>
              <strong>{highPendingCount}</strong> high severity pending
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Creator Actions */}
            {isCreator && submission.status !== "approved" && (
              <>
                <button
                  type="button"
                  onClick={handleAnalyse}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50"
                >
                  {actionLoading === "analyse" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-teal-600" />
                  )}
                  {submission.status === "draft" ? "Run Analysis" : "Re-analyse"}
                </button>

                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={
                    !!actionLoading ||
                    highPendingCount > 0 ||
                    isStale ||
                    submission.status === "in_review" ||
                    submission.status === "draft"
                  }
                  title={
                    submission.status === "draft"
                      ? "Must run analysis before submitting for review"
                      : highPendingCount > 0
                      ? `Cannot submit: ${highPendingCount} high severity finding(s) are still pending`
                      : isStale
                      ? "Cannot submit: findings are stale. Re-analyse first."
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {actionLoading === "submit-review" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Submit for Review
                </button>
              </>
            )}

            {/* Manager / Reviewer Actions */}
            {canApproveOrRequest && submission.status === "in_review" && (
              <>
                <button
                  type="button"
                  onClick={() => setIsRequestingChanges(true)}
                  disabled={!!actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-lg text-xs font-medium shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600 disabled:opacity-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Request Changes
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!!actionLoading || highPendingCount > 0}
                  title={
                    highPendingCount > 0
                      ? `Cannot approve: ${highPendingCount} high severity finding(s) remain open`
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {actionLoading === "approve" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Approve Publication
                </button>
              </>
            )}

            {submission.status === "approved" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Approved by {submission.approvedBy?.name ?? "Reviewer"} on{" "}
                {formatDate(submission.approvedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Request Changes Modal/Box */}
        {isRequestingChanges && (
          <div
            role="region"
            aria-label="Request Changes Feedback Form"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsRequestingChanges(false);
              }
            }}
            className="mt-3 p-4 bg-rose-50 border border-rose-200 rounded-lg space-y-3"
          >
            <label
              htmlFor="request-changes-comment"
              className="block text-xs font-bold uppercase text-rose-900 tracking-wide"
            >
              Mandatory Feedback for Creator
            </label>
            <textarea
              id="request-changes-comment"
              rows={3}
              value={changesComment}
              onChange={(e) => setChangesComment(e.target.value)}
              placeholder="Explain required changes before this copy can be approved..."
              className="w-full p-2.5 bg-white border border-rose-300 rounded text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRequestingChanges(false)}
                className="px-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestChanges}
                disabled={actionLoading === "request-changes"}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-600"
              >
                {actionLoading === "request-changes" ? "Submitting..." : "Send Request & Return Draft"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Draft View & Inline Highlights (5 cols) */}
        <section aria-label="Draft Content" className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col h-[750px]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Draft Copy
                </h2>
                <span className="text-[11px] text-slate-600">
                  ({submission.currentText.trim().split(/\s+/).length} words)
                </span>
              </div>

              {isCreator && submission.status !== "approved" && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingDraft(!isEditingDraft);
                    setDraftEditText(submission.currentText);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:rounded"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {isEditingDraft ? "Cancel Edit" : "Edit Copy"}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isEditingDraft ? (
                <div className="p-4 space-y-3 h-full flex flex-col">
                  <label htmlFor="draft-edit-textarea" className="sr-only">
                    Edit draft copy
                  </label>
                  <textarea
                    id="draft-edit-textarea"
                    rows={20}
                    value={draftEditText}
                    onChange={(e) => setDraftEditText(e.target.value)}
                    className="w-full flex-1 p-3 border border-slate-300 rounded-lg text-sm font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-amber-800">
                      * Saving will mark existing findings as stale.
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveDraftText}
                      disabled={actionLoading === "save-text"}
                      className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600"
                    >
                      {actionLoading === "save-text" ? "Saving..." : "Save Copy"}
                    </button>
                  </div>
                </div>
              ) : (
                renderHighlightedDraft()
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
              <span>Click highlighted text to inspect rule & citation.</span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" aria-hidden="true" /> High
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" aria-hidden="true" /> Med
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <Info className="w-3 h-3 text-blue-600 shrink-0" aria-hidden="true" /> Low
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Tabs (Findings, Diff, Comments, History) (7 cols) */}
        <section aria-label="Review Tools and Findings" className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col h-[750px]">
            {/* Tabs Header */}
            <div className="border-b border-slate-200 px-4 bg-slate-50 flex items-center justify-between">
              <nav className="flex space-x-4" aria-label="Tabs">
                <button
                  type="button"
                  onClick={() => setActiveTab("findings")}
                  className={`py-3 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                    activeTab === "findings"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Findings
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
                    {submission.findings.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("diff")}
                  className={`py-3 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                    activeTab === "diff"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <GitCompare className="w-4 h-4" />
                  Full Diff
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`py-3 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                    activeTab === "comments"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Comments
                  {submission.comments.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800">
                      {submission.comments.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={`py-3 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                    activeTab === "history"
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  <History className="w-4 h-4" />
                  Audit Trail
                </button>
              </nav>
            </div>

            {/* Tab 1: Findings List */}
            {activeTab === "findings" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Findings Filters & Summary Bar */}
                <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="findings-severity-filter" className="text-xs text-slate-700 font-semibold">
                      Filter:
                    </label>
                    <select
                      id="findings-severity-filter"
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value)}
                      className="px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="all">All Severities</option>
                      <option value="high">High only</option>
                      <option value="medium">Medium only</option>
                      <option value="low">Low only</option>
                    </select>

                    <label htmlFor="findings-category-filter" className="sr-only">
                      Filter by Category
                    </label>
                    <select
                      id="findings-category-filter"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="all">All Categories</option>
                      <option value="tone">Tone</option>
                      <option value="brand_voice">Brand Voice</option>
                      <option value="unsupported_claim">Unsupported Claim</option>
                      <option value="inconsistent_fact">Inconsistent Fact</option>
                      <option value="terminology">Terminology</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <span className="text-xs text-slate-600">
                    Showing {filteredFindings.length} of {submission.findings.length}
                  </span>
                </div>

                {/* Cards Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {filteredFindings.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                      <p className="text-sm font-semibold text-slate-800">
                        {submission.findings.length === 0
                          ? "No brand findings detected"
                          : "No findings matching filters"}
                      </p>
                      <p className="text-xs text-slate-600">
                        {submission.findings.length === 0
                          ? "Draft content conforms to all active brand rules and verified facts."
                          : "All checks passed or filters exclude current items."}
                      </p>
                    </div>
                  ) : (
                    filteredFindings.map((finding) => {
                      const isPending = finding.decision === "pending" && !finding.stale;
                      const isSelected = selectedFindingId === finding.id;

                      return (
                        <div
                          key={finding.id}
                          id={`finding-card-${finding.id}`}
                          className={`bg-white border rounded-xl p-4 shadow-2xs transition space-y-3 ${
                            isSelected
                              ? "border-teal-500 ring-2 ring-teal-500/20"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {/* Card Header: Badges & Confidence */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <SeverityBadge severity={finding.severity} />
                              <OriginBadge origin={finding.origin} />
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {finding.category}
                              </span>
                              {finding.confidence < 0.5 && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  Needs human review
                                </span>
                              )}
                              {finding.stale && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  Stale
                                </span>
                              )}
                            </div>

                            {/* Confidence Progress Bar */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span>Conf:</span>
                              <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    finding.confidence > 0.8
                                      ? "bg-emerald-500"
                                      : finding.confidence > 0.5
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: `${Math.round(finding.confidence * 100)}%` }}
                                />
                              </div>
                              <span className="font-mono">{Math.round(finding.confidence * 100)}%</span>
                            </div>
                          </div>

                          {/* Message & Snippet */}
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{finding.message}</p>
                            <div className="mt-1.5 p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 font-mono">
                              <span className="text-slate-400 select-none mr-2">Flagged:</span>
                              &ldquo;{finding.snippet}&rdquo;
                            </div>
                          </div>

                          {/* Source Citation Quote Block */}
                          {finding.sourceQuote ? (
                            <div className="bg-slate-50/70 border-l-3 border-teal-500 p-2.5 rounded-r text-xs space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-teal-800 font-semibold">
                                <span className="flex items-center gap-1">
                                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                                  Source: {finding.sourceTitle ?? "Aurora Brand Standards"}
                                </span>
                              </div>
                              <p className="text-slate-600 italic">
                                &ldquo;{finding.sourceQuote}&rdquo;
                              </p>
                            </div>
                          ) : (
                            finding.category === "unsupported_claim" && (
                              <div className="bg-amber-50/70 border-l-3 border-amber-400 p-2.5 rounded-r text-xs text-amber-900">
                                <span className="font-semibold">No approved source found:</span> No
                                active brand guidelines or facts support this superlative or metric.
                              </div>
                            )
                          )}

                          {/* Suggested Fix Mini-Diff */}
                          {finding.suggestedFix && (
                            <div className="p-2.5 bg-teal-50/50 rounded-lg border border-teal-100 text-xs space-y-1">
                              <div className="text-[11px] font-bold text-teal-900 uppercase tracking-wide">
                                Suggested Rewrite
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-slate-600 line-through text-[11px]">
                                  {finding.snippet}
                                </span>
                                <ArrowRight className="w-3 h-3 text-teal-600 shrink-0" />
                                <span className="font-semibold text-teal-900">
                                  {finding.suggestedFix}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Card Footer: Action Buttons for Pending Finding */}
                          {isPending && isCreator ? (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                              {/* Edit Modal / Inline Form */}
                              {editingFindingId === finding.id ? (
                                <div
                                  role="region"
                                  aria-label="Edit suggested fix"
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditingFindingId(null);
                                  }}
                                  className="w-full space-y-2"
                                >
                                  <label htmlFor={`custom-fix-${finding.id}`} className="sr-only">
                                    Replacement text
                                  </label>
                                  <input
                                    id={`custom-fix-${finding.id}`}
                                    type="text"
                                    value={customFixText}
                                    onChange={(e) => setCustomFixText(e.target.value)}
                                    placeholder="Enter replacement text..."
                                    autoFocus
                                    className="w-full p-2 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditingFindingId(null)}
                                      className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditFix(finding.id)}
                                      disabled={actionLoading === `edit-${finding.id}`}
                                      className="px-3 py-1 text-xs bg-teal-600 text-white rounded font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
                                    >
                                      Save & Apply
                                    </button>
                                  </div>
                                </div>
                              ) : rejectingFindingId === finding.id ? (
                                <div
                                  role="region"
                                  aria-label="Reject finding"
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setRejectingFindingId(null);
                                  }}
                                  className="w-full space-y-2"
                                >
                                  <label htmlFor={`reject-reason-${finding.id}`} className="sr-only">
                                    Reason for rejecting
                                  </label>
                                  <input
                                    id={`reject-reason-${finding.id}`}
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Reason for rejecting (e.g. Legal exception granted)..."
                                    autoFocus
                                    className="w-full p-2 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setRejectingFindingId(null)}
                                      className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReject(finding.id)}
                                      disabled={actionLoading === `reject-${finding.id}`}
                                      className="px-3 py-1 text-xs bg-rose-600 text-white rounded font-medium hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50"
                                    >
                                      Confirm Reject
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    {finding.suggestedFix && (
                                      <button
                                        type="button"
                                        onClick={() => handleAccept(finding.id)}
                                        disabled={!!actionLoading}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50 transition"
                                      >
                                        {actionLoading === `accept-${finding.id}` ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5" />
                                        )}
                                        Accept Fix
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFindingId(finding.id);
                                        setCustomFixText(finding.suggestedFix || finding.snippet);
                                      }}
                                      disabled={!!actionLoading}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition"
                                    >
                                      <Edit2 className="w-3 h-3 text-slate-500" />
                                      Edit Fix
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingFindingId(finding.id);
                                      setRejectReason("");
                                    }}
                                    disabled={!!actionLoading}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-700 hover:bg-rose-50 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-600 transition"
                                  >
                                    <X className="w-3 h-3" />
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            /* Already Decided Badge */
                            finding.decision !== "pending" && (
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    finding.decision === "accepted"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : finding.decision === "edited"
                                      ? "bg-teal-100 text-teal-800"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {finding.decision === "accepted" && <Check className="w-3 h-3" />}
                                  {finding.decision === "edited" && <Edit2 className="w-3 h-3" />}
                                  {finding.decision === "rejected" && <X className="w-3 h-3" />}
                                  Decision: {finding.decision.toUpperCase()}
                                </span>
                                {finding.rejectReason && (
                                  <span className="text-slate-600 text-[11px] italic">
                                    Reason: &ldquo;{finding.rejectReason}&rdquo;
                                  </span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Full Diff */}
            {activeTab === "diff" && (
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                  Comparing original submitted draft with current copy after accepted corrections.
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-lg text-sm font-sans leading-relaxed">
                  {diffParts.map((part, index) => {
                    if (part.added) {
                      return (
                        <span
                          key={index}
                          className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded font-medium"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    if (part.removed) {
                      return (
                        <span
                          key={index}
                          className="bg-rose-100 text-rose-900 line-through px-1 py-0.5 rounded opacity-70"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={index}>{part.value}</span>;
                  })}
                </div>
              </div>
            )}

            {/* Tab 3: Comments */}
            {activeTab === "comments" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {submission.comments.length === 0 ? (
                    <div className="p-8 text-center text-slate-600 text-xs">
                      No comments yet. Reviewers and creators can discuss revisions here.
                    </div>
                  ) : (
                    submission.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">
                            {comment.author.name} ({comment.author.role})
                          </span>
                          <span className="text-[11px] text-slate-600">
                            {formatTimeAgo(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{comment.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="p-3 border-t border-slate-200 bg-white flex gap-2">
                  <label htmlFor="new-comment-input" className="sr-only">
                    Add feedback or discussion
                  </label>
                  <input
                    id="new-comment-input"
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add feedback or discussion..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim() || actionLoading === "comment"}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded text-xs font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50"
                  >
                    Post
                  </button>
                </form>
              </div>
            )}

            {/* Tab 4: Audit Trail */}
            {activeTab === "history" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
                  <span className="font-bold">Tamper-Evident SHA-256 Ledger:</span> Every review event,
                  decision, and status change is sealed in the cryptographic audit chain.
                </div>

                <div className="space-y-2">
                  {submission.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-white border border-slate-200 rounded-lg space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span className="font-mono text-teal-700">{log.action}</span>
                        <span className="text-[11px] text-slate-600">
                          {formatTimeAgo(log.createdAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        Actor: {log.actorId.substring(0, 12)}...
                      </div>
                      <div className="text-[10px] font-mono text-slate-600 truncate">
                        Hash: {log.hash}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
