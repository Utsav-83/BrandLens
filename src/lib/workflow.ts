import { SubmissionStatus, FindingSeverity, FindingDecision, Role } from "@/generated/prisma";

export const ALLOWED_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  draft: ["analysed"],
  analysed: ["in_review", "draft"],
  in_review: ["approved", "changes_requested"],
  changes_requested: ["draft", "analysed"],
  approved: [], // Terminal read-only state
};

/**
 * Pure function: checks if a status transition is permitted by the state machine.
 */
export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export interface SubmissionFindingState {
  severity: FindingSeverity;
  decision: FindingDecision;
  stale: boolean;
  snippet: string;
  category?: string;
  rejectReason?: string | null;
}

export interface ApprovalStageForWorkflow {
  id: string;
  name: string;
  order: number;
  requiredReviewerRole: Role;
}

export interface ApprovalRuleForWorkflow {
  category: string;
  minimumSeverity: FindingSeverity;
  stageId: string;
}

export interface ApprovalStageState {
  stageId: string;
  order: number;
  status: "pending" | "approved" | "changes_requested";
}

const severityRank: Record<FindingSeverity, number> = { low: 1, medium: 2, high: 3 };

/**
 * Determine required stages from every current finding category, whether its
 * decision is pending, accepted, edited, or rejected with a reason. This
 * intentionally preserves unresolved risk categories as well as resolved ones.
 */
export function selectRequiredApprovalStages(
  findings: Array<Pick<SubmissionFindingState, "category" | "severity" | "decision" | "rejectReason">>,
  stages: ApprovalStageForWorkflow[],
  rules: ApprovalRuleForWorkflow[]
): ApprovalStageForWorkflow[] {
  const required = new Set<string>();
  const rank = new Map(stages.map((stage) => [stage.id, stage]));
  for (const finding of findings) {
    for (const rule of rules) {
      if ((rule.category === "*" || rule.category === finding.category) && severityRank[finding.severity] >= severityRank[rule.minimumSeverity] && rank.has(rule.stageId)) {
        required.add(rule.stageId);
      }
    }
  }
  if (required.size === 0) {
    const brand = stages.find((stage) => stage.name.toLowerCase() === "brand");
    if (brand) required.add(brand.id);
  }
  return [...required].map((id) => rank.get(id)!).sort((a, b) => a.order - b.order);
}

export function validateStageDecision(
  input: { creatorId: string; status: SubmissionStatus },
  actorId: string,
  actorRole: Role,
  stage: ApprovalStageForWorkflow,
  stages: ApprovalStageState[]
): { allowed: boolean; reason?: string } {
  if (input.creatorId === actorId) return { allowed: false, reason: "Separation of duties violation: the submission creator cannot decide an approval stage." };
  if (input.status !== "in_review") return { allowed: false, reason: `Cannot decide a stage when submission status is '${input.status}'.` };
  const current = [...stages].sort((a, b) => a.order - b.order).find((item) => item.status === "pending");
  if (!current || current.stageId !== stage.id) return { allowed: false, reason: "Approval stages must be decided in order." };
  if (actorRole !== "admin" && actorRole !== stage.requiredReviewerRole) return { allowed: false, reason: `Role '${actorRole}' cannot decide the ${stage.name} stage; required role is '${stage.requiredReviewerRole}'.` };
  return { allowed: true };
}

export function stageDecisionResult(
  stages: ApprovalStageState[],
  stageId: string,
  decision: "approved" | "changes_requested"
): { stages: ApprovalStageState[]; submissionStatus: "in_review" | "approved" | "changes_requested" } {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const target = ordered.findIndex((stage) => stage.stageId === stageId);
  if (target < 0) return { stages, submissionStatus: "in_review" };
  const result = ordered.map((stage, index) => {
    if (index === target) return { ...stage, status: decision };
    if (decision === "changes_requested" && index > target) return { ...stage, status: "pending" as const };
    return stage;
  });
  return {
    stages: result,
    submissionStatus: decision === "changes_requested" ? "changes_requested" : result.every((stage) => stage.status === "approved") ? "approved" : "in_review",
  };
}

/**
 * Pure function: verifies whether a submission can be submitted for review.
 * Blocked if:
 * 1. Current status is not 'analysed'
 * 2. Any finding is marked stale = true
 * 3. Any HIGH severity finding has decision = 'pending'
 */
export function validateSubmitForReview(
  status: SubmissionStatus,
  findings: SubmissionFindingState[]
): { allowed: boolean; reason?: string; pendingHighSnippets?: string[] } {
  if (status !== "analysed") {
    return {
      allowed: false,
      reason: `Submission must be in 'analysed' status to submit for review (current status: '${status}').`,
    };
  }

  const hasStale = findings.some((f) => f.stale);
  if (hasStale) {
    return {
      allowed: false,
      reason: "Findings are stale because the draft text was modified. Please re-analyse before submitting.",
    };
  }

  const pendingHigh = findings.filter(
    (f) => f.severity === "high" && f.decision === "pending"
  );

  if (pendingHigh.length > 0) {
    return {
      allowed: false,
      reason: `Cannot submit for review while ${pendingHigh.length} HIGH severity finding(s) remain pending. You must accept, edit, or reject each high severity issue.`,
      pendingHighSnippets: pendingHigh.map((f) => f.snippet),
    };
  }

  return { allowed: true };
}

/**
 * Pure function: validates whether an actor can approve a submission.
 * Enforces separation of concerns: creators cannot approve their own work.
 */
export function validateApproval(
  submission: { creatorId: string; status: SubmissionStatus },
  actorId: string,
  actorRole: Role
): { allowed: boolean; reason?: string } {
  const allowedRoles: Role[] = ["manager", "reviewer", "admin"];
  if (!allowedRoles.includes(actorRole)) {
    return {
      allowed: false,
      reason: `Role '${actorRole}' is not authorized to approve submissions.`,
    };
  }

  if (submission.creatorId === actorId) {
    return {
      allowed: false,
      reason: "Separation of duties violation: Creators are not permitted to approve their own submissions.",
    };
  }

  if (submission.status !== "in_review") {
    return {
      allowed: false,
      reason: `Cannot approve submission in '${submission.status}' status. Submission must be 'in_review'.`,
    };
  }

  return { allowed: true };
}

/**
 * Pure function: validates whether an actor can request changes on a submission.
 */
export function validateRequestChanges(
  submission: { creatorId: string; status: SubmissionStatus },
  actorId: string,
  actorRole: Role,
  comment: string
): { allowed: boolean; reason?: string } {
  const allowedRoles: Role[] = ["manager", "reviewer", "admin"];
  if (!allowedRoles.includes(actorRole)) {
    return {
      allowed: false,
      reason: `Role '${actorRole}' is not authorized to request changes.`,
    };
  }

  if (submission.creatorId === actorId) {
    return {
      allowed: false,
      reason: "Creators cannot request changes on their own submissions.",
    };
  }

  if (submission.status !== "in_review") {
    return {
      allowed: false,
      reason: `Cannot request changes on submission in '${submission.status}' status. Must be 'in_review'.`,
    };
  }

  if (!comment || !comment.trim()) {
    return {
      allowed: false,
      reason: "A comment detailing the requested revisions is mandatory.",
    };
  }

  return { allowed: true };
}

export interface ReplacementResult {
  success: boolean;
  newText?: string;
  replacementStart?: number;
  replacementEnd?: number;
  delta?: number;
  error?: string;
}

/**
 * Pure function: replaces a snippet in text using offsets with unique string match fallback.
 * Computes offset delta for shifting downstream pending findings.
 */
export function applyFindingReplacement(
  currentText: string,
  snippet: string,
  replacementText: string,
  start: number | null,
  end: number | null
): ReplacementResult {
  let repStart = -1;
  let repEnd = -1;

  // 1. Check if text at offsets matches snippet
  if (start !== null && end !== null && start >= 0 && end <= currentText.length) {
    if (currentText.slice(start, end) === snippet) {
      repStart = start;
      repEnd = end;
    }
  }

  // 2. Fallback to unique substring search if offset match failed
  if (repStart === -1) {
    let matchCount = 0;
    let foundIndex = -1;
    let pos = currentText.indexOf(snippet);

    while (pos !== -1) {
      matchCount++;
      foundIndex = pos;
      pos = currentText.indexOf(snippet, pos + 1);
    }

    if (matchCount === 1) {
      repStart = foundIndex;
      repEnd = foundIndex + snippet.length;
    } else if (matchCount === 0) {
      return {
        success: false,
        error: `Snippet '${snippet}' was not found in the current draft. Please re-analyse the submission.`,
      };
    } else {
      return {
        success: false,
        error: `Text at offsets has shifted and snippet '${snippet}' appears multiple (${matchCount}) times in the draft. Please re-analyse or edit manually.`,
      };
    }
  }

  const newText = currentText.slice(0, repStart) + replacementText + currentText.slice(repEnd);
  const delta = replacementText.length - (repEnd - repStart);

  return {
    success: true,
    newText,
    replacementStart: repStart,
    replacementEnd: repEnd,
    delta,
  };
}
