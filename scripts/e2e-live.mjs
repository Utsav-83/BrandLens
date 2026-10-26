/* global process, console, fetch */
// Usage: node scripts/e2e-live.mjs https://<your-production-url>
const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) { console.error("Usage: node scripts/e2e-live.mjs <url>"); process.exit(1); }

const SAMPLE = "Hey guys, our Smart-Pay app is the #1 fastest and 100% secure! Fees are just 0.5% and we settle in 5 minutes!!!";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "\n        -> " + detail}`);
};
const info = (m) => console.log(`INFO  ${m}`);

class Client {
  constructor(origin = BASE) { this.cookies = {}; this.origin = origin; }
  async req(method, path, body, extraHeaders = {}) {
    const headers = { Origin: this.origin, ...extraHeaders };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + path, {
      method, headers, redirect: "manual",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";"); const i = kv.indexOf("=");
      this.cookies[kv.slice(0, i)] = kv.slice(i + 1);
    }
    let text = "", json = null;
    try { text = await res.text(); json = JSON.parse(text); } catch { /* response may not be JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}
const snip = (r) => `status ${r.status}: ${r.text.slice(0, 250).replace(/\s+/g, " ")}`;
const arr = (j, ...keys) => {
  if (Array.isArray(j)) return j;
  for (const k of keys) {
    if (Array.isArray(j?.[k])) return j[k];
    if (Array.isArray(j?.submission?.[k])) return j.submission[k];
    if (Array.isArray(j?.data?.[k])) return j.data[k];
  }
  return [];
};
const idOf = (j) => j?.id ?? j?.submission?.id ?? j?.data?.id ?? j?.data?.submission?.id;

async function login(role) {
  const c = new Client();
  const r = await c.req("POST", `/api/auth/demo/${role}`, {});
  return { c, r };
}

(async () => {
  console.log(`\nBrandLens live test -> ${BASE}\n`);

  // 1. Public pages and headers
  const anon = new Client();
  let r = await anon.req("GET", "/login");
  check("Login page loads (200)", r.status === 200, snip(r));
  check("Login page has demo buttons (DEMO_MODE on)", /continue as/i.test(r.text), "No 'Continue as ...' text found; set DEMO_MODE=true in Vercel and redeploy");
  const h = r.headers;
  check("Security headers present (CSP, nosniff)", !!h.get("content-security-policy") && h.get("x-content-type-options") === "nosniff", "Missing CSP or nosniff");
  check("HSTS header present", !!h.get("strict-transport-security"), "Missing Strict-Transport-Security");
  check("CSP has no unsafe-eval in production", !/unsafe-eval/.test(h.get("content-security-policy") || ""), "unsafe-eval present");

  // 2. Unauthenticated access
  r = await anon.req("GET", "/api/submissions/does-not-exist");
  check("API rejects unauthenticated (401/403)", [401, 403].includes(r.status), snip(r));
  r = await anon.req("GET", "/new");
  check("/new redirects unauthenticated users", [301, 302, 303, 307, 308].includes(r.status), snip(r));
  r = await anon.req("GET", "/api/audit");
  check("Audit API rejects unauthenticated", [401, 403].includes(r.status), snip(r));

  // 3. CSRF/Origin and input validation
  const evil = new Client("https://evil.example");
  r = await evil.req("POST", "/api/auth/demo/creator", {});
  check("Cross-origin POST is blocked (403)", r.status === 403, snip(r));
  r = await anon.req("POST", "/api/auth/demo/hacker", {});
  check("Invalid demo role rejected (400/404)", [400, 404].includes(r.status), snip(r));
  r = await anon.req("POST", "/api/auth/login", { email: "nobody@aurora.test", password: "wrong-password-123" });
  check("Wrong password rejected (400/401)", [400, 401].includes(r.status), snip(r));

  // 4. Demo logins for all roles
  const sessions = {};
  for (const role of ["creator", "manager", "reviewer", "legal_reviewer", "admin"]) {
    const { c, r: lr } = await login(role);
    sessions[role] = c;
    check(`Demo login: ${role}`, lr.status === 200, snip(lr));
  }
  if (!sessions.creator?.cookies || !Object.keys(sessions.creator.cookies).length) {
    console.log("\nCreator login failed, cannot continue. Check Vercel DATABASE_URL, DIRECT_URL, JWT_SECRET, DEMO_MODE.");
    return summary();
  }
  r = await sessions.creator.req("GET", "/api/auth/me");
  check("/api/auth/me returns creator role", r.status === 200 && JSON.stringify(r.json).includes("creator"), snip(r));

  // 5. Create submission
  let subId = null;
  const T = `E2E test ${new Date().toISOString()}`;
  for (const body of [{ title: T, text: SAMPLE }, { title: T, content: SAMPLE }, { title: T, body: SAMPLE }, { title: T, originalText: SAMPLE }]) {
    r = await sessions.creator.req("POST", "/api/submissions", body);
    if ([200, 201].includes(r.status) && idOf(r.json)) { subId = idOf(r.json); break; }
  }
  check("Creator creates a draft submission", !!subId, "Tried 4 body shapes. Last: " + snip(r));
  if (!subId) return summary();

  // 6. Ownership before submission
  r = await sessions.manager.req("GET", `/api/submissions/${subId}`);
  check("Manager cannot read someone's draft (404)", r.status === 404, snip(r));
  r = await sessions.reviewer.req("GET", `/api/submissions/${subId}`);
  check("Reviewer cannot read someone's draft (404)", r.status === 404, snip(r));
  r = await sessions.manager.req("POST", `/api/submissions/${subId}/analyse`, {});
  check("Manager cannot analyse a creator's draft (403/404)", [403, 404].includes(r.status), snip(r));

  // 7. Analyse
  r = await sessions.creator.req("POST", `/api/submissions/${subId}/analyse`, {});
  check("Analyse runs (200)", r.status === 200, snip(r));
  const blob = (r.text || "").toLowerCase();
  for (const [label, needle] of [["glossary: Smart-Pay", "smart-pay"], ["slang: guys", "guys"], ["absolute: 100% secure", "100% secure"], ["number: 0.5%", "0.5%"], ["number: 5 minutes", "5 minutes"]]) {
    check(`Finding detected - ${label}`, blob.includes(needle), "Not found in analyse response");
  }
  check("Rules-only notice or AI status reported", /rules-only|unavailable|ai(Available|_available)|aiStatus/i.test(r.text), "No AI status field/notice in response; check UI manually");

  // 8. Read findings
  r = await sessions.creator.req("GET", `/api/submissions/${subId}`);
  check("Creator reads own submission (200)", r.status === 200, snip(r));
  let findings = arr(r.json, "findings");
  check("Submission has findings", findings.length >= 5, `found ${findings.length}`);
  const withQuote = findings.filter((f) => f.sourceQuote ?? f.source_quote ?? f.quote);
  info(`${withQuote.length}/${findings.length} findings include a source quote`);
  const first = findings[0];

  // 9. Submit blocked while high-severity pending
  r = await sessions.creator.req("POST", `/api/submissions/${subId}/submit-for-review`, {});
  check("Submit blocked while high findings pending (4xx)", r.status >= 400 && r.status < 500, snip(r));

  // 10. Accept one, reject the rest with a reason
  if (first) {
    r = await sessions.creator.req("POST", `/api/findings/${first.id}/accept`, {});
    check("Accept a finding (200)", r.status === 200, snip(r));
    r = await sessions.creator.req("POST", `/api/findings/${first.id}/accept`, {});
    check("Accept is idempotent (no 5xx on repeat)", r.status < 500, snip(r));
  }
  let rejectNoReason = null;
  const second = findings[1];
  if (second) {
    rejectNoReason = await sessions.creator.req("POST", `/api/findings/${second.id}/reject`, {});
    check("Reject without reason is refused (400)", rejectNoReason.status === 400, snip(rejectNoReason));
  }
  r = await sessions.creator.req("GET", `/api/submissions/${subId}`);
  findings = arr(r.json, "findings");
  let rejected = 0, failed = 0;
  for (const f of findings) {
    const rr = await sessions.creator.req("POST", `/api/findings/${f.id}/reject`, { reason: "Approved by legal (automated test)" });
    if (rr.status === 200) rejected++; else if (rr.status >= 500) failed++;
  }
  check("Reject findings with a reason (no 5xx)", failed === 0, `${failed} server errors`);
  info(`Rejected ${rejected} remaining findings`);

  // 11. Other users cannot act on creator's findings
  if (first) {
    r = await sessions.manager.req("POST", `/api/findings/${first.id}/reject`, { reason: "attack test" });
    check("Manager cannot change creator's findings (403/404)", [403, 404].includes(r.status), snip(r));
  }

  // 12. Submit for review, then review
  r = await sessions.creator.req("POST", `/api/submissions/${subId}/submit-for-review`, {});
  check("Submit for review succeeds (200)", r.status === 200, snip(r));
  r = await sessions.creator.req("POST", `/api/submissions/${subId}/approve`, {});
  check("Creator cannot approve (403)", r.status === 403, snip(r));
  r = await sessions.reviewer.req("GET", `/api/submissions/${subId}`);
  check("Reviewer can read submission in review (200)", r.status === 200, snip(r));
  r = await sessions.reviewer.req("GET", `/api/submissions/${subId}/diff`);
  check("Diff available to reviewer (200)", r.status === 200, snip(r));
  r = await sessions.reviewer.req("POST", `/api/submissions/${subId}/comments`, { body: "E2E test comment", text: "E2E test comment", comment: "E2E test comment" });
  check("Reviewer can comment (200/201)", [200, 201].includes(r.status), snip(r));
  r = await sessions.reviewer.req("POST", `/api/submissions/${subId}/approve`, {});
  check("Reviewer approves (200)", r.status === 200, snip(r));
  r = await sessions.reviewer.req("POST", `/api/submissions/${subId}/approve`, {});
  check("Second approval refused (4xx)", r.status >= 400 && r.status < 500, snip(r));
  r = await sessions.creator.req("PUT", `/api/submissions/${subId}/text`, { text: "tamper after approval" });
  check("Editing text after approval refused (4xx)", r.status >= 400 && r.status < 500, snip(r));

  // 12b. Multi-stage approval matrix behavior
  let matrixSubId = null;
  const matrixTitle = `E2E approval matrix ${new Date().toISOString()}`;
  for (const body of [{ title: matrixTitle, text: "Hey guys. Fees are 0.5%." }, { title: matrixTitle, content: "Hey guys. Fees are 0.5%." }]) {
    r = await sessions.creator.req("POST", "/api/submissions", body);
    if ([200, 201].includes(r.status) && idOf(r.json)) { matrixSubId = idOf(r.json); break; }
  }
  check("Create approval matrix test draft", !!matrixSubId, snip(r));
  if (matrixSubId) {
    r = await sessions.creator.req("POST", `/api/submissions/${matrixSubId}/analyse`, {});
    check("Analyse numeric matrix draft", r.status === 200, snip(r));
    r = await sessions.creator.req("GET", `/api/submissions/${matrixSubId}`);
    const matrixFindings = arr(r.json, "findings");
    for (const f of matrixFindings) await sessions.creator.req("POST", `/api/findings/${f.id}/reject`, { reason: "Reviewed for routing test" });
    r = await sessions.creator.req("POST", `/api/submissions/${matrixSubId}/submit-for-review`, {});
    check("Submit matrix draft for staged review", r.status === 200, snip(r));
    r = await sessions.creator.req("GET", `/api/submissions/${matrixSubId}/stages`);
    const matrixStages = arr(r.json, "stages");
    const legalStage = matrixStages.find((stage) => stage.stage?.name === "Legal");
    const brandStage = matrixStages.find((stage) => stage.stage?.name === "Brand");
    check("Numeric claim requires Legal stage", !!legalStage, snip(r));
    r = await sessions.creator.req("POST", `/api/submissions/${matrixSubId}/stages/${brandStage?.stageId || legalStage?.stageId}/approve`, {});
    check("Creator cannot decide any stage (403)", r.status === 403, snip(r));
    if (legalStage) {
      r = await sessions.reviewer.req("POST", `/api/submissions/${matrixSubId}/stages/${legalStage.stageId}/approve`, {});
      check("Approval stages cannot be decided out of order (403)", r.status === 403, snip(r));
    }
    if (brandStage) {
      r = await sessions.reviewer.req("POST", `/api/submissions/${matrixSubId}/stages/${brandStage.stageId}/approve`, {});
      check("Brand stage approved by Brand reviewer", r.status === 200, snip(r));
    }
    if (legalStage) {
      r = await sessions.reviewer.req("POST", `/api/submissions/${matrixSubId}/stages/${legalStage.stageId}/approve`, {});
      check("Brand-only reviewer cannot approve Legal stage (403)", r.status === 403, snip(r));
      r = await sessions.legal_reviewer.req("POST", `/api/submissions/${matrixSubId}/stages/${legalStage.stageId}/approve`, {});
      check("Legal stage approved by Legal reviewer", r.status === 200, snip(r));
    }
    for (const stage of matrixStages.filter((item) => item.stage?.name === "Compliance")) {
      r = await sessions.manager.req("POST", `/api/submissions/${matrixSubId}/stages/${stage.stageId}/approve`, {});
      check("Compliance stage approved by Compliance reviewer", r.status === 200, snip(r));
    }
    r = await sessions.reviewer.req("GET", `/api/submissions/${matrixSubId}`);
    check("Final approval follows completion of every stage", r.status === 200 && r.json?.submission?.status === "approved", snip(r));
  }

  // 13. Audit trail
  r = await sessions.reviewer.req("GET", "/api/audit");
  check("Reviewer can read audit trail (200)", r.status === 200, snip(r));
  r = await sessions.creator.req("GET", "/api/audit");
  check("Creator cannot read audit trail (403)", [401, 403].includes(r.status), snip(r));
  check("Audit response omits draft text", !r.text.includes("Smart-Pay"), "Draft text visible to creator via audit");
  r = await sessions.reviewer.req("GET", "/api/audit");
  check("Audit response does not leak draft text to reviewers", !/Hey guys, our Smart-Pay/.test(r.text), "Full draft text found in audit payload");
  let v = await sessions.reviewer.req("GET", "/api/audit/verify");
  if (v.status === 405) v = await sessions.reviewer.req("POST", "/api/audit/verify", {});
  check("Audit verification reports a valid chain", v.status === 200 && /"(valid|ok|verified|isValid)"\s*:\s*true/i.test(v.text), snip(v));

  // 14. Admin sources
  r = await sessions.admin.req("GET", "/api/sources");
  check("Admin can list sources (200)", r.status === 200, snip(r));
  check("Seeded sources exist", arr(r.json, "sources").length > 0 || (r.text || "").length > 100, snip(r));
  r = await sessions.creator.req("GET", "/api/sources");
  info(`Creator GET /api/sources -> ${r.status} (informational)`);
  r = await sessions.creator.req("POST", "/api/sources", { title: "x", content: "x" });
  check("Creator cannot create sources (403)", [401, 403].includes(r.status), snip(r));

  // 15. Logout
  r = await sessions.creator.req("POST", "/api/auth/logout", {});
  check("Logout succeeds", r.status === 200, snip(r));

  summary();
})().catch((e) => { console.error("Script error:", e.message); process.exit(1); });

function summary() {
  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) { console.log("Failed:"); failed.forEach((f) => console.log(" - " + f.name)); }
  process.exit(failed.length ? 1 : 0);
}
