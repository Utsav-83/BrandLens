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
