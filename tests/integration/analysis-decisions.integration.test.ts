import { afterEach, describe, expect, it, vi } from "vitest";
import { createFinding, createSource, createSubmission, createUser, createWorkspace, integrationDb, requestFor, routeParams } from "./database";
import { POST as acceptFinding } from "@/app/api/findings/[id]/accept/route";

const savedEnv = { provider: process.env.LLM_PROVIDER, model: process.env.LLM_MODEL, key: process.env.LLM_API_KEY };
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedEnv.provider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = savedEnv.provider;
  if (savedEnv.model === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = savedEnv.model;
  if (savedEnv.key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = savedEnv.key;
});

async function analysisRoute(provider: string, key = "integration-fake-key") {
  process.env.LLM_PROVIDER = provider;
  process.env.LLM_MODEL = "integration-test-model";
  if (key) process.env.LLM_API_KEY = key; else delete process.env.LLM_API_KEY;
  vi.resetModules();
  return (await import("@/app/api/submissions/[id]/analyse/route")).POST;
}

function mockOpenAI(content: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] })));
}

describe("analysis route integration", () => {
  it("persists findings from a good mocked LLM response", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    await createUser(workspace.id, "admin");
    const submission = await createSubmission(workspace.id, creator.id, "Our product supports merchants.");
    await createSource(workspace.id, creator.id, { type: "guide", title: "Tone", content: "Our product supports merchants." });
    mockOpenAI({ findings: [{ snippet: "supports merchants", category: "tone", severity: "low", confidence: 0.9, message: "Use clearer tone.", passageId: "P1", sourceQuote: "Our product supports merchants.", suggestedFix: "serves merchants" }] });
    const run = await analysisRoute("openai");
    const response = await run(await requestFor(creator, `/api/submissions/${submission.id}/analyse`, { method: "POST", body: "{}" }), routeParams(submission.id));
    expect(response.status).toBe(200);
    expect(await integrationDb.finding.count({ where: { submissionId: submission.id, origin: "ai" } })).toBe(1);
  });

  it("drops a mocked LLM finding with a hallucinated source quote", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    const submission = await createSubmission(workspace.id, creator.id, "Our product supports merchants.");
    await createSource(workspace.id, creator.id, { type: "guide", title: "Tone", content: "Our product supports merchants." });
    mockOpenAI({ findings: [{ snippet: "supports merchants", category: "tone", severity: "low", confidence: 0.9, message: "Claim", passageId: "P1", sourceQuote: "Approved claim that is not in the source." }] });
    const run = await analysisRoute("openai");
    const response = await run(await requestFor(creator, `/api/submissions/${submission.id}/analyse`, { method: "POST", body: "{}" }), routeParams(submission.id));
    expect(response.status).toBe(200);
    expect(await integrationDb.finding.count({ where: { submissionId: submission.id, origin: "ai" } })).toBe(0);
  });

  it("keeps deterministic findings when the mocked LLM times out", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    const submission = await createSubmission(workspace.id, creator.id, "This is 100% secure.");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("Aborted", "AbortError"); }));
    const run = await analysisRoute("openai");
    const response = await run(await requestFor(creator, `/api/submissions/${submission.id}/analyse`, { method: "POST", body: "{}" }), routeParams(submission.id));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.aiStatus).toBe("unavailable");
    expect(json.findings.some((finding: { ruleId: string }) => finding.ruleId === "absolute_claims")).toBe(true);
  });

  it("skips AI when no key is configured and enforces the per-user analysis limit", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    const submission = await createSubmission(workspace.id, creator.id);
    const run = await analysisRoute("openai", "");
    const first = await run(await requestFor(creator, `/api/submissions/${submission.id}/analyse`, { method: "POST", body: "{}" }), routeParams(submission.id));
    expect((await first.json()).aiStatus).toBe("skipped");
    let last!: Response;
    for (let i = 0; i < 10; i++) last = await run(await requestFor(creator, `/api/submissions/${submission.id}/analyse`, { method: "POST", body: "{}" }), routeParams(submission.id));
    expect(last.status).toBe(429);
  });
});

describe("finding decisions", () => {
  it("applies exact offsets, shifts later pending findings, and rejects stale or concurrent acceptance", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    const submission = await createSubmission(workspace.id, creator.id, "Bad term then other issue.");
    const firstStart = submission.currentText.indexOf("Bad term");
    const first = await createFinding(submission.id, { snippet: "Bad term", start: firstStart, end: firstStart + 8, suggestedFix: "Good" });
    const secondStart = submission.currentText.indexOf("other issue");
    const later = await createFinding(submission.id, { snippet: "other issue", start: secondStart, end: secondStart + 11, suggestedFix: "other concern" });
    const invoke = async () => acceptFinding(await requestFor(creator, `/api/findings/${first.id}/accept`, { method: "POST", body: "{}" }), routeParams(first.id));
    const pair = await Promise.all([invoke(), invoke()]);
    expect(pair.map((res) => res.status).sort()).toEqual([200, 200]);
    const outcomes = await Promise.all(pair.map(async (response) => (await response.json()).message));
    expect(outcomes.filter((message) => message === "Finding fix accepted and applied.")).toHaveLength(1);
    expect(outcomes.filter((message) => message === "Finding already accepted.")).toHaveLength(1);
    expect((await integrationDb.submission.findUniqueOrThrow({ where: { id: submission.id } })).currentText).toBe("Good then other issue.");
    const shifted = await integrationDb.finding.findUniqueOrThrow({ where: { id: later.id } });
    expect(shifted.start).toBe(secondStart - 4);

    const staleSubmission = await createSubmission(workspace.id, creator.id, "Bad term");
    const stale = await createFinding(staleSubmission.id, { snippet: "Bad term", start: 0, end: 8, stale: true, suggestedFix: "Good" });
    const staleResult = await acceptFinding(await requestFor(creator, `/api/findings/${stale.id}/accept`, { method: "POST", body: "{}" }), routeParams(stale.id));
    expect(staleResult.status).toBe(409);
  });
});
