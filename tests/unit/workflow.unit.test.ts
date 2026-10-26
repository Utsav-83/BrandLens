import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition, validateApproval, validateRequestChanges, validateStageDecision, stageDecisionResult, selectRequiredApprovalStages } from "@/lib/workflow";

const states = ["draft", "analysed", "in_review", "changes_requested", "approved"] as const;
const roles = ["creator", "manager", "reviewer", "admin"] as const;

describe("workflow state/action/role matrix", () => {
  it.each(states.flatMap((from) => states.map((to) => [from, to] as const)))("transition %s -> %s matches the transition table", (from, to) => {
    expect(canTransition(from, to)).toBe(from === to || ALLOWED_TRANSITIONS[from].includes(to));
  });
  it.each(roles.flatMap((role) => states.map((status) => [role, status] as const)))("approval by %s in %s is allowed only for authorized roles in review", (role, status) => {
    expect(validateApproval({ creatorId: "owner", status }, "reviewer-id", role).allowed).toBe(["manager", "reviewer", "admin"].includes(role) && status === "in_review");
  });
  it.each(roles.flatMap((role) => states.map((status) => [role, status] as const)))("change request by %s in %s is allowed only for authorized roles in review", (role, status) => {
    expect(validateRequestChanges({ creatorId: "owner", status }, "reviewer-id", role, "Please revise the claim.").allowed).toBe(["manager", "reviewer", "admin"].includes(role) && status === "in_review");
  });
});

describe("multi-stage approval matrix", () => {
  const stages = [
    { id: "brand", name: "Brand", order: 1, requiredReviewerRole: "reviewer" as const },
    { id: "legal", name: "Legal", order: 2, requiredReviewerRole: "legal_reviewer" as const },
    { id: "compliance", name: "Compliance", order: 3, requiredReviewerRole: "manager" as const },
  ];
  const state = stages.map((stage) => ({ stageId: stage.id, order: stage.order, status: "pending" as const }));

  it("routes numeric/claim categories to Legal and high severity to Compliance", () => {
    expect(selectRequiredApprovalStages([
      { category: "unsupported_claim", severity: "medium", decision: "accepted", rejectReason: null },
      { category: "tone", severity: "high", decision: "pending", rejectReason: null },
    ], stages, [
      { category: "unsupported_claim", minimumSeverity: "low", stageId: "legal" },
      { category: "*", minimumSeverity: "high", stageId: "compliance" },
    ]).map((stage) => stage.id)).toEqual(["legal", "compliance"]);
  });

  it("requires Brand as fallback when no rule applies", () => {
    expect(selectRequiredApprovalStages([], stages, []).map((stage) => stage.id)).toEqual(["brand"]);
  });

  it("blocks out-of-order decisions and reviewer role mismatches; admin may act", () => {
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "legal-user", "legal_reviewer", stages[1], state).allowed).toBe(false);
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "brand-user", "reviewer", stages[1], state).allowed).toBe(false);
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "admin", "admin", stages[1], state).allowed).toBe(false);
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "brand-user", "reviewer", stages[0], state).allowed).toBe(true);
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "admin", "admin", stages[0], state).allowed).toBe(true);
  });

  it("always blocks the creator from deciding a stage", () => {
    expect(validateStageDecision({ creatorId: "creator", status: "in_review" }, "creator", "admin", stages[0], state).allowed).toBe(false);
  });

  it("approves the submission only after every required stage and resets later stages on changes", () => {
    const brand = stageDecisionResult(state, "brand", "approved");
    expect(brand.submissionStatus).toBe("in_review");
    const legal = stageDecisionResult(brand.stages, "legal", "approved");
    expect(legal.submissionStatus).toBe("in_review");
    const final = stageDecisionResult(legal.stages, "compliance", "approved");
    expect(final.submissionStatus).toBe("approved");
    const reset = stageDecisionResult(final.stages, "brand", "changes_requested");
    expect(reset.submissionStatus).toBe("changes_requested");
    expect(reset.stages.map((item) => item.status)).toEqual(["changes_requested", "pending", "pending"]);
  });
});
