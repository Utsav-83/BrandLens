"use client";
import { useEffect, useState } from "react";

type Matrix = {
  stages: Array<{ name: string; order: number; requiredReviewerRole: string }>;
  rules: Array<{ category: string; minimumSeverity: string; stageName: string }>;
};

export function MatrixEditor() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    fetch("/api/approval-matrix").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load matrix.");
      setValue(JSON.stringify({ stages: data.stages.map(({ id: _id, workspaceId: _workspaceId, ...stage }: Record<string, unknown>) => stage), rules: data.rules }, null, 2));
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load matrix.")).finally(() => setBusy(false));
  }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const matrix = JSON.parse(value) as Matrix;
      const response = await fetch("/api/approval-matrix", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(matrix) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save matrix.");
      setMessage("Approval matrix saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save matrix."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <p className="text-sm text-slate-700">Edit the ordered stages and category/severity routing rules. Use <code>*</code> as a category to match every finding.</p>
    <label htmlFor="matrix-json" className="block text-sm font-semibold text-slate-900">Stages and rules (JSON)</label>
    <textarea id="matrix-json" value={value} onChange={(event) => setValue(event.target.value)} rows={24} spellCheck={false} className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600" aria-describedby="matrix-help" />
    <p id="matrix-help" className="text-xs text-slate-600">Allowed roles: reviewer, legal_reviewer, manager. Severity: low, medium, high.</p>
    {message && <p role="status" className="text-sm text-slate-800">{message}</p>}
    <button onClick={save} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Loading…" : "Save approval matrix"}</button>
  </section>;
}
