import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition, validateApproval, validateRequestChanges } from "@/lib/workflow";

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
