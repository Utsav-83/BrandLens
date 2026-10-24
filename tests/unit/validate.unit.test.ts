import { describe, expect, it } from "vitest";
import { validateAIFinding } from "@/lib/review/validate";

const passage = { passageId: "P1", chunkId: "c1", sourceId: "s1", sourceTitle: "Guide", text: "Aurora Pay supports trusted merchants." };
const base = { snippet: "trusted merchants", category: "brand_voice" as const, severity: "low" as const, confidence: 0.8, message: "Tone", passageId: "P1", sourceQuote: "Aurora Pay supports trusted merchants." };
const map = new Map([["P1", passage]]);

describe("citation validation", () => {
  it("drops a finding whose snippet is absent from the draft", () => expect(validateAIFinding({ ...base, snippet: "fabricated" }, "Aurora is trusted.", map)).toBeNull());
  it("drops a finding whose quote is not in the passage", () => expect(validateAIFinding({ ...base, sourceQuote: "invented quote" }, "trusted merchants", map)).toBeNull());
  it("matches quotes after case and whitespace normalisation", () => {
    expect(validateAIFinding({ ...base, sourceQuote: "AURORA   PAY supports TRUSTED merchants." }, "trusted merchants", map)?.sourceId).toBe("s1");
  });
  it("keeps unsupported claims without a quote and caps their severity at medium", () => {
    const result = validateAIFinding({ ...base, category: "unsupported_claim", severity: "high", passageId: null, sourceQuote: null }, "trusted merchants", map);
    expect(result?.severity).toBe("medium");
  });
  it("strips a suggested fix with a new number while retaining the finding", () => {
    const result = validateAIFinding({ ...base, suggestedFix: "trusted merchants receive 99% cashback" }, "trusted merchants", map);
    expect(result?.suggestedFix).toBeUndefined();
  });
  it("marks findings below 0.5 confidence for human review", () => {
    expect(validateAIFinding({ ...base, confidence: 0.49 }, "trusted merchants", map)?.needsHumanReview).toBe(true);
  });
});
