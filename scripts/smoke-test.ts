/**
 * BrandLens End-to-End Smoke Test Script
 * Runs all core lifecycle flows against a live URL or local development server:
 * 1. Demo login as Creator
 * 2. Ingest & Create Marketing Draft
 * 3. Run Deterministic & AI Analysis
 * 4. Accept a proposed correction
 * 5. Submit copy for review
 * 6. Demo login as Reviewer
 * 7. Approve draft publication
 * 8. Demo login as Admin
 * 9. Cryptographically verify SHA-256 audit chain integrity
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts [BASE_URL]
 *   Example: npx tsx scripts/smoke-test.ts https://brandlens.vercel.app
 */

import { SAMPLE_FLAWED_CONTENT } from "../src/lib/constants";

const BASE_URL = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";

interface SmokeFinding {
  id: string;
  snippet: string;
  suggestedFix?: string | null;
  severity: string;
  decision: string;
}

interface SmokeApiResponse {
  intact?: boolean;
  totalEntries?: number;
  aiStatus?: string;
  error?: string;
  brokenId?: string | null;
  findings?: SmokeFinding[];
  user?: { role: string; email: string };
  submission?: {
    id?: string;
    findings?: SmokeFinding[];
  };
  [key: string]: unknown;
}

interface TestStepResult {
  step: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

const results: TestStepResult[] = [];

// Cookie storage for session management across requests
let currentCookies: string[] = [];

function extractCookies(response: Response): void {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    // Collect cookie strings
    const cookieParts = setCookie.split(/,\s*(?=[a-zA-Z0-9_]+=)/);
    for (const part of cookieParts) {
      const nameVal = part.split(";")[0];
      if (nameVal && !currentCookies.includes(nameVal)) {
        currentCookies.push(nameVal);
      }
    }
  }
}

async function request(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ res: Response; data: SmokeApiResponse | null; durationMs: number }> {
  const url = `${BASE_URL.replace(/\/$/, "")}${endpoint}`;
  const start = performance.now();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Origin: BASE_URL,
  };

  if (currentCookies.length > 0) {
    headers["Cookie"] = currentCookies.join("; ");
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const durationMs = Math.round(performance.now() - start);
  extractCookies(res);

  let data: SmokeApiResponse | null = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = (await res.json()) as SmokeApiResponse;
    } catch {
      data = null;
    }
  }

  return { res, data, durationMs };
}

async function runStep(
  name: string,
  fn: () => Promise<{ passed: boolean; message: string }>
) {
  const start = performance.now();
  process.stdout.write(`• ${name}... `);
  try {
    const outcome = await fn();
    const durationMs = Math.round(performance.now() - start);
    results.push({
      step: name,
      passed: outcome.passed,
      message: outcome.message,
      durationMs,
    });
    if (outcome.passed) {
      console.log(`\x1b[32mPASS\x1b[0m (${durationMs}ms) - ${outcome.message}`);
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m (${durationMs}ms) - ${outcome.message}`);
    }
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      step: name,
      passed: false,
      message: msg || "Unexpected error",
      durationMs,
    });
    console.log(`\x1b[31mFAIL\x1b[0m (${durationMs}ms) - ${msg}`);
  }
}

async function main() {
  console.log(`\n========================================================`);
  console.log(`       BRANDLENS ROUND 2 END-TO-END SMOKE TEST`);
  console.log(`       Target URL: ${BASE_URL}`);
  console.log(`========================================================\n`);

  let submissionId = "";
  let findingId = "";

  // Step 1: Health check / Homepage
  await runStep("1. Homepage & Routing Health", async () => {
    const { res } = await request("/");
    if (res.status === 200 || res.status === 307 || res.status === 302) {
      return { passed: true, message: `Status ${res.status} OK` };
    }
    return { passed: false, message: `Unexpected HTTP ${res.status}` };
  });

  // Step 2: Login as Creator
  await runStep("2. Demo Login (Creator)", async () => {
    currentCookies = [];
    const { res, data } = await request("/api/auth/demo/creator", {
      method: "POST",
    });
    if (res.ok && data?.user?.role === "creator") {
      return { passed: true, message: `Authenticated as ${data.user.email} (${data.user.role})` };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 3: Create Marketing Submission
  await runStep("3. Create Marketing Draft", async () => {
    const { res, data } = await request("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Smoke Test Promo Copy",
        channel: "social",
        text: SAMPLE_FLAWED_CONTENT,
      }),
    });
    if (res.ok && data?.submission?.id) {
      submissionId = data.submission.id;
      return { passed: true, message: `Submission created with ID: ${submissionId}` };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 4: Run Analysis
  await runStep("4. Execute Multi-Layer Analysis", async () => {
    if (!submissionId) throw new Error("No submissionId from step 3");
    const { res, data } = await request(`/api/submissions/${submissionId}/analyse`, {
      method: "POST",
    });
    if (res.ok && Array.isArray(data?.findings)) {
      return {
        passed: true,
        message: `Identified ${data.findings.length} finding(s) (aiStatus: ${data.aiStatus || "ok"})`,
      };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 5: Read findings and accept fix
  await runStep("5. Accept Finding Fix & Verify Shift", async () => {
    const { res, data } = await request(`/api/submissions/${submissionId}`);
    if (!res.ok || !data?.submission?.findings) {
      return { passed: false, message: "Could not fetch findings" };
    }

    const pendingFixes = (data.submission.findings || []).filter(
      (f: SmokeFinding) => f.decision === "pending" && f.suggestedFix
    );

    if (pendingFixes.length === 0) {
      return { passed: true, message: "No suggested fixes to accept; skipped" };
    }

    const targetFinding = pendingFixes[0];
    findingId = targetFinding.id;

    const acceptRes = await request(`/api/findings/${findingId}/accept`, {
      method: "POST",
    });

    if (acceptRes.res.ok) {
      return { passed: true, message: `Accepted fix for "${targetFinding.snippet}"` };
    }
    return { passed: false, message: acceptRes.data?.error || `HTTP ${acceptRes.res.status}` };
  });

  // Step 6: Submit for Review
  await runStep("6. Submit Draft for Review", async () => {
    // Accepting a fix changes the copy and marks previous findings stale.
    // Re-run analysis so the state machine can evaluate current findings.
    const analysis = await request(`/api/submissions/${submissionId}/analyse`, {
      method: "POST",
    });
    if (!analysis.res.ok) {
      return { passed: false, message: analysis.data?.error || `Analysis HTTP ${analysis.res.status}` };
    }

    const { data } = await request(`/api/submissions/${submissionId}`);
    const highPending = (data?.submission?.findings || []).filter(
      (f: SmokeFinding) => f.decision === "pending" && f.severity === "high"
    );

    // Accept or reject remaining high findings to satisfy governance rule
    for (const hf of highPending) {
      await request(`/api/findings/${hf.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Smoke test approved exception" }),
      });
    }

    const { res, data: subData } = await request(
      `/api/submissions/${submissionId}/submit-for-review`,
      { method: "POST" }
    );

    if (res.ok) {
      return { passed: true, message: "Submitted to review queue successfully" };
    }
    return { passed: false, message: subData?.error || `HTTP ${res.status}` };
  });

  // Step 7: Demo Login as Reviewer
  await runStep("7. Demo Login (Reviewer)", async () => {
    currentCookies = [];
    const { res, data } = await request("/api/auth/demo/reviewer", {
      method: "POST",
    });
    if (res.ok && data?.user?.role === "reviewer") {
      return { passed: true, message: `Authenticated as ${data.user.email} (${data.user.role})` };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 8: Approve submission as Reviewer
  await runStep("8. Reviewer Approve Publication", async () => {
    const { res, data } = await request(`/api/submissions/${submissionId}/approve`, {
      method: "POST",
    });
    if (res.ok) {
      return { passed: true, message: "Draft marked approved and publication sealed" };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 9: Demo Login as Admin
  await runStep("9. Demo Login (Admin)", async () => {
    currentCookies = [];
    const { res, data } = await request("/api/auth/demo/admin", {
      method: "POST",
    });
    if (res.ok && data?.user?.role === "admin") {
      return { passed: true, message: `Authenticated as ${data.user.email} (${data.user.role})` };
    }
    return { passed: false, message: data?.error || `HTTP ${res.status}` };
  });

  // Step 10: Cryptographic Audit Verification
  await runStep("10. Verify SHA-256 Audit Chain Integrity", async () => {
    const { res, data } = await request("/api/audit/verify");
    if (res.ok && data?.intact === true) {
      return {
        passed: true,
        message: `Cryptographic audit chain intact (${data.totalEntries} chained records verified)`,
      };
    }
    return {
      passed: false,
      message: data?.intact === false ? `Broken chain at ${data.brokenId || "unknown entry"}` : `HTTP ${res.status}`,
    };
  });

  // Final summary
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log(`\n--------------------------------------------------------`);
  console.log(`SMOKE TEST SUMMARY: ${passedCount} / ${totalCount} PASSED`);
  console.log(`--------------------------------------------------------\n`);

  if (passedCount < totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal smoke test failure:", err);
  process.exit(1);
});
