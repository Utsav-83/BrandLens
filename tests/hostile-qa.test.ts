import { describe, it, expect } from "vitest";
import { analyzeDraft } from "@/lib/review";
import { RuleContext } from "@/lib/review/rules";
import {
  parseUploadedDocument,
  ScannedPdfError,
  InvalidFileHeaderError,
} from "@/lib/parse";
import { createEmptyScannedPdfBuffer } from "./fixtures/create-fixtures";
import {
  canTransition,
  applyFindingReplacement,
  validateApproval,
  validateRequestChanges,
  validateSubmitForReview,
} from "@/lib/workflow";
import { assertSameOrigin } from "@/lib/guards";
import { LLMClient } from "@/lib/llm";
import goldenSamples from "./golden-samples.json";

describe("Hostile QA & Reliability Pass (Prompt 7)", () => {
  const mockRuleContext: RuleContext = {
    glossaryLines: [
      "AVOID: Smart-Pay | Smart Pay | smartpay -> USE: SmartPay",
      "AVOID: crypto-token -> USE: digital token",
    ],
    approvedFacts: [
      {
        id: "fact-1",
        text: "SmartPay payments settle within 2 business days.",
        isExpired: false,
      },
      {
        id: "fact-2",
        text: "Transaction fee is 1.8% per card payment.",
        isExpired: false,
      },
      {
        id: "fact-expired",
        text: "Legacy SmartPay settlement takes 5 business days.",
        isExpired: true,
      },
    ],
    claimsRegisterLines: [
      "'Fastest' is NOT approved: no independent benchmark exists.",
      "'#1' is NOT approved: superlative unverified.",
    ],
    brandGuidePassages: [
      "Avoid superlatives. Do not claim 100% security or #1 status. Be professional.",
      "Do not use slang like 'guys' or 'gonna'.",
    ],
  };

  // Test 1: Golden samples in rules-only mode
  describe("1. Golden Samples under Rules-Only Engine", () => {
    it("evaluates all golden samples without error or unhandled exceptions", async () => {
      for (const sample of goldenSamples) {
        const result = await analyzeDraft("ws-test", sample.text, {
          context: mockRuleContext,
          llmClient: {
            completeJson: async () => ({ findings: [] }),
            isAvailable: () => false,
            getModelName: () => "none",
          },
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.findings)).toBe(true);
        expect(result.aiStatus).toBe("skipped");

        for (const finding of result.findings) {
          expect(finding.origin).toBe("rule");
          expect(finding.category).toBeDefined();
          expect(["high", "medium", "low"]).toContain(finding.severity);
          expect(finding.confidence).toBe(1.0);
          expect(finding.snippet).toBeDefined();
        }
      }
    });
  });

  // Test 2 & 3: Graceful degradation when LLM key fails or times out
  describe("2 & 3. LLM Failure & Timeout Graceful Degradation", () => {
    it("falls back smoothly to rules-only mode when LLM throws an error (e.g. invalid key / 401)", async () => {
      const failingClient: LLMClient = {
        completeJson: async () => {
          throw new Error("401 Unauthorized: Invalid API key provided");
        },
        isAvailable: () => true,
        getModelName: () => "failing-model",
      };

      const result = await analyzeDraft(
        "ws-test",
        "Hey guys, our Smart-Pay app is 100% secure!",
        {
          context: mockRuleContext,
          llmClient: failingClient,
        }
      );

      // A configured LLM failure degrades gracefully to rules-only mode.
      expect(result.aiStatus).toBe("unavailable");
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.snippet.includes("Smart-Pay"))).toBe(true);
    });

    it("falls back to rules-only when LLM times out", async () => {
      const timingOutClient: LLMClient = {
        completeJson: async () => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "AbortError";
          throw err;
        },
        isAvailable: () => true,
        getModelName: () => "timeout-model",
      };

      const result = await analyzeDraft(
        "ws-test",
        "Hey guys, our Smart-Pay app is 100% secure!",
        {
          context: mockRuleContext,
          llmClient: timingOutClient,
        }
      );

      expect(result.aiStatus).toBe("unavailable");
      expect(result.findings.length).toBeGreaterThan(0);
    });
  });

  // Test 4: Empty text, very long text (20k words), non-English, emojis
  describe("4. Edge Case Inputs (Empty, 20k words, Unicode, Emojis)", () => {
    it("handles empty draft text cleanly with zero errors", async () => {
      const result = await analyzeDraft("ws-test", "", {
        context: mockRuleContext,
        llmClient: {
          completeJson: async () => ({ findings: [] }),
          isAvailable: () => false,
          getModelName: () => "none",
        },
      });
      expect(result.findings).toEqual([]);
      expect(result.aiStatus).toBe("skipped");
    });

    it("handles huge draft text (20,000 words) without memory leak or stack overflow", async () => {
      const paragraph = "Our SmartPay solution settles transactions in 2 business days with 1.8% fees. ";
      const hugeText = paragraph.repeat(1500); // ~20,000 words
      expect(hugeText.split(/\s+/).length).toBeGreaterThan(15000);

      const start = performance.now();
      const result = await analyzeDraft("ws-test", hugeText, {
        context: mockRuleContext,
        llmClient: {
          completeJson: async () => ({ findings: [] }),
          isAvailable: () => false,
          getModelName: () => "none",
        },
      });
      const elapsed = performance.now() - start;

      expect(result).toBeDefined();
      expect(elapsed).toBeLessThan(5000); // Must complete within 5 seconds
    });

    it("handles non-English scripts, mixed Unicode, and heavy emoji drafts", async () => {
      const emojiText = "🚀💳 Smart-Pay est super rapide! 100% sécurisé! 🎉🔥 日本語のテストとالعربية 🌟";
      const result = await analyzeDraft("ws-test", emojiText, {
        context: mockRuleContext,
        llmClient: {
          completeJson: async () => ({ findings: [] }),
          isAvailable: () => false,
          getModelName: () => "none",
        },
      });

      expect(result).toBeDefined();
      expect(result.findings.some((f) => f.snippet === "Smart-Pay")).toBe(true);
    });
  });

  // Test 5: Document parsing security, magic bytes, scanned PDF detection
  describe("5. Document Security & Corrupted File Rejection", () => {
    it("rejects file with .pdf extension that is actually an executable or arbitrary text", async () => {
      const fakePdfBuffer = Buffer.from("MZ\x90\x00\x03\x00\x00\x00NotARealPdfFileHere");
      await expect(
        parseUploadedDocument("malicious.pdf", fakePdfBuffer)
      ).rejects.toThrowError(InvalidFileHeaderError);
    });

    it("rejects file with .docx extension that is not a valid zip archive", async () => {
      const fakeDocxBuffer = Buffer.from("ThisIsNotAZipFile");
      await expect(
        parseUploadedDocument("malicious.docx", fakeDocxBuffer)
      ).rejects.toThrowError(InvalidFileHeaderError);
    });

    it("identifies scanned / empty PDFs and throws friendly ScannedPdfError", async () => {
      const emptyScannedPdf = createEmptyScannedPdfBuffer();
      await expect(
        parseUploadedDocument("scanned-contract.pdf", emptyScannedPdf)
      ).rejects.toThrowError(ScannedPdfError);
    });
  });

  // Test 6: Workflow state machine transitions & security
  describe("6. State Machine Security & Forbidden Transitions", () => {
    it("strictly blocks draft -> in_review (must be analysed first)", () => {
      expect(canTransition("draft", "in_review")).toBe(false);
    });

    it("strictly blocks draft -> approved directly", () => {
      expect(canTransition("draft", "approved")).toBe(false);
    });

    it("strictly blocks approved -> draft (approved content is permanently immutable)", () => {
      expect(canTransition("approved", "draft")).toBe(false);
      expect(canTransition("approved", "in_review")).toBe(false);
    });
  });

  // Test 7: Finding offset replacement and downstream offset shifting
  describe("7. Idempotent Finding Replacement & Offset Shifting", () => {
    it("shifts subsequent finding offsets correctly when an earlier snippet is replaced with shorter or longer text", () => {
      const initialText = "Try Smart-Pay today! It is 100% secure.";
      // Snippet 1: "Smart-Pay" (start: 4, end: 13, length 9) -> replacement "SmartPay" (length 8, delta -1)
      const res1 = applyFindingReplacement(initialText, "Smart-Pay", "SmartPay", 4, 13);
      expect(res1.success).toBe(true);
      expect(res1.newText).toBe("Try SmartPay today! It is 100% secure.");
      expect(res1.delta).toBe(-1);

      // Verify that after shift, second finding "100% secure" matches at adjusted offset
      // Original offset was start: 27 ("100% secure" in "Try Smart-Pay today! It is 100% secure.")
      const adjustedStart = 27 + (res1.delta ?? 0); // 26
      const secondSnippet = "100% secure";
      const adjustedEnd = adjustedStart + secondSnippet.length;
      expect(res1.newText!.substring(adjustedStart, adjustedEnd)).toBe(secondSnippet);
    });

    it("falls back cleanly to unique string match if offsets drifted slightly", () => {
      const text = "Use SmartPay everywhere.";
      // Offsets off by 2 characters
      const res = applyFindingReplacement(text, "SmartPay", "AuroraPay", 2, 10);
      expect(res.success).toBe(true);
      expect(res.newText).toBe("Use AuroraPay everywhere.");
    });
  });

  // Test 8: CSRF & Same-Origin enforcement
  describe("8. CSRF & Same-Origin Header Enforcement", () => {
    it("blocks request when Origin header differs from Host", () => {
      const req = new Request("http://localhost:3000/api/submissions", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "https://evil-hacker.com",
        },
      });
      const errorResponse = assertSameOrigin(req);
      expect(errorResponse).not.toBeNull();
      expect(errorResponse!.status).toBe(403);
    });

    it("allows request when Origin header matches Host exactly", () => {
      const req = new Request("http://localhost:3000/api/submissions", {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://localhost:3000",
        },
      });
      const errorResponse = assertSameOrigin(req);
      expect(errorResponse).toBeNull();
    });
  });

  // Test 9: Separation of duties and review workflow rules
  describe("9. Separation of Duties & Review Guardrails", () => {
    it("strictly blocks creator from approving their own submission", () => {
      const submission = {
        creatorId: "user-creator",
        status: "in_review" as const,
      };
      const check = validateApproval(submission, "user-creator", "manager");
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("Separation of duties");
    });

    it("strictly requires a non-empty comment when requesting changes", () => {
      const submission = {
        creatorId: "user-creator",
        status: "in_review" as const,
      };
      const emptyCommentCheck = validateRequestChanges(submission, "user-reviewer", "reviewer", "   ");
      expect(emptyCommentCheck.allowed).toBe(false);
      expect(emptyCommentCheck.reason).toContain("comment");

      const validCheck = validateRequestChanges(submission, "user-reviewer", "reviewer", "Please fix claim.");
      expect(validCheck.allowed).toBe(true);
    });

    it("blocks submit-for-review when High severity findings are pending", () => {
      const findings = [
        { severity: "high" as const, decision: "pending" as const, stale: false },
        { severity: "low" as const, decision: "pending" as const, stale: false },
      ];
      const check = validateSubmitForReview("analysed", findings);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("HIGH severity");
    });

    it("blocks submit-for-review when findings are stale", () => {
      const findings = [
        { severity: "low" as const, decision: "pending" as const, stale: true },
      ];
      const check = validateSubmitForReview("analysed", findings);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("stale");
    });
  });
});
