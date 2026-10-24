import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanJsonOutput, LLMTimeoutError, ProviderNeutralLLMClient } from "@/lib/llm";
import { runAIJudge } from "@/lib/review/aiJudge";

vi.mock("@/lib/retrieval", () => ({ retrieve: vi.fn(async () => [{ chunkId: "c1", sourceId: "s1", sourceTitle: "Guide", text: "Aurora Pay supports trusted merchants.", score: 1 }]) }));

describe("LLM boundary behaviour", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it.each([
    ["```json\n{\"ok\":true}\n```", "{\"ok\":true}"],
    ["Provider response: {\"ok\":true}\nextra text", "{\"ok\":true}"],
  ])("cleans JSON response framing", (input, expected) => expect(cleanJsonOutput(input)).toBe(expected));

  it("drops malformed AI items individually while retaining valid findings", async () => {
    const client = { isAvailable: () => true, getModelName: () => "test-model", completeJson: async () => ({ findings: [
      { snippet: "trusted merchants", category: "tone", severity: "low", confidence: 0.9, message: "Tone", passageId: "P1", sourceQuote: "Aurora Pay supports trusted merchants." },
      { snippet: "bad", category: "impossible", severity: "low", confidence: 8, message: "bad" },
    ] }) };
    const result = await runAIJudge("w1", "trusted merchants", client);
    expect(result.findings).toHaveLength(1);
  });

  it("converts an aborted fetch into a timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const client = new ProviderNeutralLLMClient({ provider: "openai", model: "unit-test-model", apiKey: "fake-key", timeoutMs: 10 });
    const pending = expect(client.completeJson("system", "user")).rejects.toBeInstanceOf(LLMTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await pending;
  });
});
