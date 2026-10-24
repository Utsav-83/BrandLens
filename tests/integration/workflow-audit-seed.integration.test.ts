import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as createSubmission } from "@/app/api/submissions/route";
import { POST as accept } from "@/app/api/findings/[id]/accept/route";
import { POST as reject } from "@/app/api/findings/[id]/reject/route";
import { POST as submitForReview } from "@/app/api/submissions/[id]/submit-for-review/route";
import { POST as requestChanges } from "@/app/api/submissions/[id]/request-changes/route";
import { PATCH as reviseText } from "@/app/api/submissions/[id]/text/route";
import { POST as approve } from "@/app/api/submissions/[id]/approve/route";
import { GET as verifyAudit } from "@/app/api/audit/verify/route";
import { POST as createSource } from "@/app/api/sources/route";
import { POST as acceptFinding } from "@/app/api/findings/[id]/accept/route";
import { ensureSeeded } from "@/lib/seed";
import { createFinding, createUser, createWorkspace, integrationDb, jsonBody, requestFor, routeParams } from "./database";

const previousLLMEnv = { provider: process.env.LLM_PROVIDER, model: process.env.LLM_MODEL, key: process.env.LLM_API_KEY };
afterEach(() => {
  vi.unstubAllGlobals();
  if (previousLLMEnv.provider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = previousLLMEnv.provider;
  if (previousLLMEnv.model === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = previousLLMEnv.model;
  if (previousLLMEnv.key === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previousLLMEnv.key;
});

describe("submission workflow and audit integration", () => {
  it("completes the review lifecycle, preserves the audit chain under concurrent writes, and reports tampering", async () => {
    const workspace = await createWorkspace();
    const creator = await createUser(workspace.id, "creator");
    const reviewer = await createUser(workspace.id, "reviewer");
    const admin = await createUser(workspace.id, "admin");
    const glossary = await createSourceRecord();
    async function createSourceRecord() {
      const response = await createSource(await requestFor(admin, "/api/sources", { method: "POST", body: jsonBody({ type: "glossary", title: "Terms", owner: "Brand", content: "AVOID: Smart-Pay -> USE: SmartPay\nAVOID: awesome -> USE: reliable" }) }));
      expect(response.status).toBe(201);
      return response;
    }
    expect(glossary.status).toBe(201);

    const draftText = "Smart-Pay is awesome.";
    const created = await createSubmission(await requestFor(creator, "/api/submissions", { method: "POST", body: jsonBody({ title: "Launch", channel: "web", text: draftText }) }));
    expect(created.status).toBe(201);
    const submissionId = (await created.json()).submission.id as string;

    process.env.LLM_PROVIDER = "none";
    delete process.env.LLM_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("AI must stay disabled for this workflow test"); }));
    vi.resetModules();
    const analyse = (await import("@/app/api/submissions/[id]/analyse/route")).POST;
    const firstAnalysis = await analyse(await requestFor(creator, `/api/submissions/${submissionId}/analyse`, { method: "POST", body: "{}" }), routeParams(submissionId));
    expect(firstAnalysis.status).toBe(200);
    const generated = await integrationDb.finding.findMany({ where: { submissionId }, orderBy: { start: "asc" } });
    const glossaryFinding = generated.find((finding) => finding.snippet === "Smart-Pay");
    const toneFinding = generated.find((finding) => finding.snippet.toLowerCase() === "awesome");
    expect(glossaryFinding).toBeDefined();
    expect(toneFinding).toBeDefined();

    const accepted = await accept(await requestFor(creator, `/api/findings/${glossaryFinding!.id}/accept`, { method: "POST", body: "{}" }), routeParams(glossaryFinding!.id));
    expect(accepted.status).toBe(200);
    const rejected = await reject(await requestFor(creator, `/api/findings/${toneFinding!.id}/reject`, { method: "POST", body: jsonBody({ reason: "Keep this informal emphasis for the campaign." }) }), routeParams(toneFinding!.id));
    expect(rejected.status).toBe(200);
    expect((await integrationDb.finding.findUniqueOrThrow({ where: { id: toneFinding!.id } })).rejectReason).toBe("Keep this informal emphasis for the campaign.");

    expect((await submitForReview(await requestFor(creator, `/api/submissions/${submissionId}/submit-for-review`, { method: "POST", body: "{}" }), routeParams(submissionId))).status).toBe(200);
    const blankComment = await requestChanges(await requestFor(reviewer, `/api/submissions/${submissionId}/request-changes`, { method: "POST", body: jsonBody({ comment: "" }) }), routeParams(submissionId));
    expect(blankComment.status).toBe(400);
    expect((await approve(await requestFor(creator, `/api/submissions/${submissionId}/approve`, { method: "POST", body: "{}" }), routeParams(submissionId))).status).toBe(403);
    expect((await requestChanges(await requestFor(reviewer, `/api/submissions/${submissionId}/request-changes`, { method: "POST", body: jsonBody({ comment: "Please use the approved product name consistently." }) }), routeParams(submissionId))).status).toBe(200);

    expect((await reviseText(await requestFor(creator, `/api/submissions/${submissionId}/text`, { method: "PATCH", body: jsonBody({ text: "SmartPay is reliable." }) }), routeParams(submissionId))).status).toBe(200);
    expect((await analyse(await requestFor(creator, `/api/submissions/${submissionId}/analyse`, { method: "POST", body: "{}" }), routeParams(submissionId))).status).toBe(200);
    expect((await submitForReview(await requestFor(creator, `/api/submissions/${submissionId}/submit-for-review`, { method: "POST", body: "{}" }), routeParams(submissionId))).status).toBe(200);
    expect((await approve(await requestFor(reviewer, `/api/submissions/${submissionId}/approve`, { method: "POST", body: "{}" }), routeParams(submissionId))).status).toBe(200);
    expect((await reviseText(await requestFor(creator, `/api/submissions/${submissionId}/text`, { method: "PATCH", body: jsonBody({ text: "Cannot change approved text." }) }), routeParams(submissionId))).status).toBe(403);
    const postApprovalFinding = await createFinding(submissionId, { snippet: "SmartPay", start: 0, end: 8, suggestedFix: "Other" });
    expect((await acceptFinding(await requestFor(creator, `/api/findings/${postApprovalFinding.id}/accept`, { method: "POST", body: "{}" }), routeParams(postApprovalFinding.id))).status).toBe(403);

    const intact = await verifyAudit(await requestFor(admin, "/api/audit/verify"));
    expect((await intact.json()).intact).toBe(true);

    const mutations = await Promise.all(Array.from({ length: 10 }, (_, index) => createSource(await requestFor(admin, "/api/sources", { method: "POST", body: jsonBody({ type: "fact", title: `Concurrent ${index}`, owner: "Integration", content: `Approved fact number ${index}.` }) }))));
    expect(mutations.every((response) => response.status === 201)).toBe(true);
    const afterParallelWrites = await verifyAudit(await requestFor(admin, "/api/audit/verify"));
    expect((await afterParallelWrites.json()).intact).toBe(true);

    const firstEntry = await integrationDb.auditLog.findFirstOrThrow({ where: { workspaceId: workspace.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    await integrationDb.$executeRaw`UPDATE audit_logs SET payload = jsonb_set(payload, '{tampered}', 'true'::jsonb) WHERE id = ${firstEntry.id}`;
    const corrupted = await verifyAudit(await requestFor(admin, "/api/audit/verify"));
    const corruptedJson = await corrupted.json();
    expect(corruptedJson.intact).toBe(false);
    expect(corruptedJson.brokenId).toBe(firstEntry.id);
  });

  it("serializes five concurrent seed attempts into exactly one workspace", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureSeeded()));
    expect(new Set(results.map((result) => result.workspaceId)).size).toBe(1);
    expect(await integrationDb.workspace.count()).toBe(1);
  });
});
