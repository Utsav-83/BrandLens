"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Sparkles,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react";
import { SAMPLE_FLAWED_CONTENT, SAMPLE_FLAWED_TITLE, SAMPLE_FLAWED_CHANNEL } from "@/lib/constants";

export function NewSubmissionForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<string>("social");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  function handleLoadSample() {
    setTitle(SAMPLE_FLAWED_TITLE);
    setChannel(SAMPLE_FLAWED_CHANNEL);
    setText(SAMPLE_FLAWED_CONTENT);
    setError(null);
    setUploadSuccess("Loaded pre-configured sample flawed draft");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "File parsing failed");
      }

      setText(data.text);
      if (!title) {
        setTitle(data.filename.replace(/\.[^/.]+$/, ""));
      }
      setUploadSuccess(`Extracted ${data.wordCount} words from ${data.filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(shouldAnalyse: boolean) {
    if (!title.trim()) {
      setError("Please provide a submission title.");
      return;
    }
    if (!text.trim()) {
      setError("Please provide content to check.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Create the submission
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, channel, text }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create submission");
      }

      const submissionId = data.id;

      // 2. If user clicked "Analyse Now", trigger analysis immediately
      if (shouldAnalyse) {
        const analyseRes = await fetch(`/api/submissions/${submissionId}/analyse`, {
          method: "POST",
        });
        if (!analyseRes.ok) {
          const analyseErr = await analyseRes.json();
          // Even if analysis fails/rate-limits, we navigate to the submission page so user can see status
          console.error("Analysis warning:", analyseErr);
        }
      }

      router.push(`/submissions/${submissionId}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit draft";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Create New Marketing Draft
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Submit copy or upload DOCX/PDF to review against brand rules and active facts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadSample}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-sm font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 transition"
        >
          <Sparkles className="w-4 h-4 text-teal-600" />
          Load Sample Flawed Content
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-900 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Submission Error</div>
            <div className="text-xs text-red-800 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-xs font-medium">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          {uploadSuccess}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
        {/* Title and Channel */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="block text-sm font-semibold text-slate-800 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Launch Announcement - Social Blast"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label htmlFor="channel" className="block text-sm font-semibold text-slate-800 mb-1">
              Channel <span className="text-red-500">*</span>
            </label>
            <select
              id="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm shadow-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="social">Social Media</option>
              <option value="web">Web Copy</option>
              <option value="email">Email Campaign</option>
              <option value="print">Print / Collateral</option>
              <option value="deck">Pitch Deck</option>
            </select>
          </div>
        </div>

        {/* File Upload Zone */}
        <div>
          <label htmlFor="file-upload" className="block text-sm font-semibold text-slate-800 mb-1">
            Import Document (Optional)
          </label>
          <div className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-lg p-4 text-center bg-slate-50 transition cursor-pointer relative focus-within:ring-2 focus-within:ring-teal-500">
            <input
              id="file-upload"
              type="file"
              accept=".docx,.pdf,.txt,.md"
              onChange={handleFileUpload}
              disabled={uploading}
              aria-label="Upload marketing draft document (.docx, .pdf, or .txt)"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center justify-center pointer-events-none">
              {uploading ? (
                <div className="flex items-center gap-2 text-teal-700 text-sm font-medium">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Extracting document text...
                </div>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-slate-500 mb-1" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click or drag & drop to upload .docx, .pdf, or .txt
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Magic-byte validated, max 5 MB
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Text Area */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="content" className="block text-sm font-semibold text-slate-800">
              Draft Copy <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-slate-600">
              {text.trim() ? `${text.trim().split(/\s+/).length} words` : "0 words"}
            </span>
          </div>
          <textarea
            id="content"
            required
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your marketing draft text here..."
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-sans leading-relaxed shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={submitting || uploading}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 disabled:opacity-50 transition"
          >
            {submitting ? "Saving..." : "Save as Draft"}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={submitting || uploading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50 transition"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analysing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Save & Run Analysis
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
