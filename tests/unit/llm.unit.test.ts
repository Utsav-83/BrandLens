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

  it("(a) is unavailable when provider and apiKey are set but model is empty", () => {
    const client = new ProviderNeutralLLMClient({ provider: "openai", apiKey: "fake-key", model: "" });
    expect(client.isAvailable()).toBe(false);
  });

  it("(b) is unavailable when provider is none", () => {
    const client = new ProviderNeutralLLMClient({ provider: "none", apiKey: "fake-key", model: "custom-model" });
    expect(client.isAvailable()).toBe(false);
  });

  it("(c) aborts hanging fetch at timeout and results in rules-only fallback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }))
    );
    const client = new ProviderNeutralLLMClient({
      provider: "openai",
      model: "unit-test-model",
      apiKey: "fake-key",
      timeoutMs: 50,
    });
    const pending = runAIJudge("w1", "Aurora Pay supports trusted merchants.", client);
    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;

    expect(result.aiStatus).toBe("unavailable");
    expect(result.findings).toEqual([]);
    expect(result.aiModel).toBeNull();
  });

  it("(d) results in rules-only fallback when fetch returns HTTP 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }))
    );
    const client = new ProviderNeutralLLMClient({
      provider: "openai",
      model: "unit-test-model",
      apiKey: "fake-key",
    });
    const result = await runAIJudge("w1", "Aurora Pay supports trusted merchants.", client);

    expect(result.aiStatus).toBe("unavailable");
    expect(result.findings).toEqual([]);
    expect(result.aiModel).toBeNull();
  });
});
