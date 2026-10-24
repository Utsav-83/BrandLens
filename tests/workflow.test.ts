import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateSubmitForReview,
  validateApproval,
  validateRequestChanges,
  applyFindingReplacement,
} from "@/lib/workflow";
import { SubmissionStatus, FindingSeverity, FindingDecision } from "@/generated/prisma";

describe("Workflow State Machine (src/lib/workflow.ts)", () => {
  describe("canTransition", () => {
    it("allows legal happy-path transitions", () => {
      expect(canTransition("draft", "analysed")).toBe(true);
      expect(canTransition("analysed", "in_review")).toBe(true);
      expect(canTransition("in_review", "approved")).toBe(true);
      expect(canTransition("in_review", "changes_requested")).toBe(true);
      expect(canTransition("changes_requested", "draft")).toBe(true);
      expect(canTransition("changes_requested", "analysed")).toBe(true);
    });

    it("rejects illegal transitions", () => {
      // Cannot jump directly from draft to in_review without analysis
      expect(canTransition("draft", "in_review")).toBe(false);
      // Cannot jump directly from draft to approved
      expect(canTransition("draft", "approved")).toBe(false);
      // Approved is a terminal read-only state
      expect(canTransition("approved", "draft")).toBe(false);
      expect(canTransition("approved", "in_review")).toBe(false);
    });
  });

  describe("validateSubmitForReview", () => {
    it("blocks submission when status is draft instead of analysed", () => {
      const res = validateSubmitForReview("draft", []);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("must be in 'analysed' status");
    });

    it("blocks submission when any finding is stale", () => {
      const findings = [
        {
          severity: "low" as FindingSeverity,
          decision: "pending" as FindingDecision,
          stale: true,
          snippet: "some text",
        },
      ];
      const res = validateSubmitForReview("analysed", findings);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Findings are stale");
    });

    it("blocks submission when a HIGH severity finding is still pending", () => {
      const findings = [
        {
          severity: "high" as FindingSeverity,
          decision: "pending" as FindingDecision,
          stale: false,
          snippet: "100% secure",
        },
        {
          severity: "low" as FindingSeverity,
          decision: "accepted" as FindingDecision,
          stale: false,
          snippet: "guys",
        },
      ];
      const res = validateSubmitForReview("analysed", findings);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("HIGH severity finding(s) remain pending");
      expect(res.pendingHighSnippets).toContain("100% secure");
    });

    it("allows submission when all HIGH findings have been accepted or rejected", () => {
      const findings = [
        {
          severity: "high" as FindingSeverity,
          decision: "accepted" as FindingDecision,
          stale: false,
          snippet: "100% secure",
        },
        {
          severity: "high" as FindingSeverity,
          decision: "rejected" as FindingDecision,
          stale: false,
          snippet: "fastest",
        },
        {
          severity: "low" as FindingSeverity,
          decision: "pending" as FindingDecision, // Low pending is allowed
          stale: false,
          snippet: "sentence length",
        },
      ];
      const res = validateSubmitForReview("analysed", findings);
      expect(res.allowed).toBe(true);
      expect(res.reason).toBeUndefined();
    });
  });

  describe("validateApproval", () => {
    const submission = {
      creatorId: "creator-cora-123",
      status: "in_review" as SubmissionStatus,
    };

    it("allows a manager or reviewer to approve an in_review submission", () => {
      const res = validateApproval(submission, "reviewer-rachel-456", "reviewer");
      expect(res.allowed).toBe(true);

      const resManager = validateApproval(submission, "manager-marcus-789", "manager");
      expect(resManager.allowed).toBe(true);
    });

    it("forbids creator from approving their own submission (separation of duties)", () => {
      const res = validateApproval(submission, "creator-cora-123", "manager"); // Even if having manager privileges
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Separation of duties violation");
    });

    it("forbids users with creator role from approving", () => {
      const res = validateApproval(submission, "other-user-999", "creator");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("not authorized to approve");
    });

    it("forbids approving submissions not currently in 'in_review' status", () => {
      const draftSub = { creatorId: "creator-cora-123", status: "analysed" as SubmissionStatus };
      const res = validateApproval(draftSub, "reviewer-rachel-456", "reviewer");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Submission must be 'in_review'");
    });
  });

  describe("validateRequestChanges", () => {
    const submission = {
      creatorId: "creator-cora-123",
      status: "in_review" as SubmissionStatus,
    };

    it("allows reviewer to request changes with a mandatory explanatory comment", () => {
      const res = validateRequestChanges(
        submission,
        "reviewer-rachel-456",
        "reviewer",
        "Please revise the claim regarding settlement speed."
      );
      expect(res.allowed).toBe(true);
    });

    it("rejects request-changes without a comment", () => {
      const res = validateRequestChanges(submission, "reviewer-rachel-456", "reviewer", "");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("comment detailing the requested revisions is mandatory");
    });

    it("forbids creator from requesting changes on their own work", () => {
      const res = validateRequestChanges(submission, "creator-cora-123", "reviewer", "Self comment");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Creators cannot request changes on their own submissions");
    });
  });

  describe("applyFindingReplacement", () => {
    const initialText = "Hey guys, our Smart-Pay app is fastest!";

    it("replaces snippet cleanly using exact offsets", () => {
      // "Smart-Pay" is at offsets [14, 23]
      const res = applyFindingReplacement(initialText, "Smart-Pay", "SmartPay", 14, 23);
      expect(res.success).toBe(true);
      expect(res.newText).toBe("Hey guys, our SmartPay app is fastest!");
      expect(res.delta).toBe(-1); // "SmartPay" (8) - "Smart-Pay" (9) = -1
    });

    it("falls back to unique string match when offsets have shifted", () => {
      // Offsets intentionally wrong: [0, 9]
      const res = applyFindingReplacement(initialText, "Smart-Pay", "SmartPay", 0, 9);
      expect(res.success).toBe(true);
      expect(res.newText).toBe("Hey guys, our SmartPay app is fastest!");
      expect(res.replacementStart).toBe(14);
      expect(res.replacementEnd).toBe(23);
    });

    it("returns error when snippet appears multiple times and offsets do not match", () => {
      const ambiguousText = "Use Smart-Pay now. Every merchant loves Smart-Pay.";
      // Offsets wrong: [0, 9] (neither occurrence is at 0)
      const res = applyFindingReplacement(ambiguousText, "Smart-Pay", "SmartPay", 0, 9);
      expect(res.success).toBe(false);
      expect(res.error).toContain("appears multiple (2) times");
    });

    it("returns error when snippet is completely missing from text", () => {
      const res = applyFindingReplacement(initialText, "NonExistentSnippet", "Replacement", null, null);
      expect(res.success).toBe(false);
      expect(res.error).toContain("was not found in the current draft");
    });
  });
});
