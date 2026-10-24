"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Plus,
  AlertTriangle,
  History,
  Check,
  Edit2,
  Archive,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export interface SourceItem {
  id: string;
  type: "guide" | "glossary" | "fact" | "claims";
  title: string;
  owner: string;
  version: number;
  status: "active" | "archived";
  expiresAt: string | Date | null;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: {
    chunks: number;
  };
}

export interface VersionItem {
  id: string;
  version: number;
  content: string;
  createdAt: string | Date;
  createdById: string;
}

interface SourcesManagerProps {
  sources: SourceItem[];
  userRole: string;
}

export function SourcesManager({ sources: initialSources, userRole }: SourcesManagerProps) {
  const router = useRouter();
  const [sources, setSources] = useState<SourceItem[]>(initialSources);
  const [selectedSource, setSelectedSource] = useState<SourceItem | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Form states for Admin Create/Edit
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<"guide" | "glossary" | "fact" | "claims">("fact");
  const [formOwner, setFormOwner] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{
    text: string;
    filename: string;
    wordCount: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = userRole === "admin";

  const typeBadges: Record<string, { label: string; bg: string; text: string }> = {
    guide: { label: "Brand Guide", bg: "bg-teal-50", text: "text-teal-800" },
    glossary: { label: "Glossary", bg: "bg-indigo-50", text: "text-indigo-800" },
    fact: { label: "Approved Fact", bg: "bg-emerald-50", text: "text-emerald-800" },
    claims: { label: "Claims Register", bg: "bg-amber-50", text: "text-amber-800" },
  };

  async function refreshSources() {
    try {
      const res = await fetch("/api/sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch {
      router.refresh();
    }
  }

  async function handleOpenDetail(source: SourceItem) {
    setSelectedSource(source);
    setLoadingVersions(true);
    setVersions([]);
    try {
      const res = await fetch(`/api/sources/${source.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } catch (err) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoadingVersions(false);
    }
  }

  function handleStartCreate() {
    setFormTitle("");
    setFormType("fact");
    setFormOwner("Brand Team");
    setFormContent("");
    setFormExpiresAt("");
    setUploadPreview(null);
    setIsCreating(true);
    setIsEditing(false);
    setError(null);
  }

  function handleStartEdit(source: SourceItem) {
    setFormTitle(source.title);
    setFormType(source.type);
    setFormOwner(source.owner);
    setFormContent(source.content);
    setFormExpiresAt(
      source.expiresAt ? new Date(source.expiresAt).toISOString().split("T")[0] : ""
    );
    setIsEditing(true);
    setIsCreating(false);
    setError(null);
  }

  async function handleSaveSource(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      setError("Title and content are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isCreating) {
        const res = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            type: formType,
            owner: formOwner,
            content: formContent,
            expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create source");
        setSuccess("Source created and chunked into knowledge base.");
      } else if (isEditing && selectedSource) {
        const res = await fetch(`/api/sources/${selectedSource.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            type: formType,
            owner: formOwner,
            content: formContent,
            expiresAt: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update source");
        setSuccess(`Source updated to version ${data.version}. Knowledge chunks refreshed.`);
      }

      setIsCreating(false);
      setIsEditing(false);
      setSelectedSource(null);
      await refreshSources();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save source");
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveSource(id: string) {
    if (!confirm("Are you sure you want to archive this source? It will no longer be retrieved.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/sources/${id}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to archive");
      }
      setSuccess("Source archived.");
      setSelectedSource(null);
      await refreshSources();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/sources/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload extraction failed");

      setUploadPreview(data);
      setFormTitle(data.filename.replace(/\.[^/.]+$/, ""));
      setFormContent(data.text);
      setIsCreating(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload extraction failed");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Knowledge Base & Brand Sources
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Approved brand guidelines, glossaries, verified facts, and claims used for retrieval and verification.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            {/* Upload Document Button */}
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-xs cursor-pointer transition">
              <UploadCloud className="w-4 h-4 text-slate-500" />
              <span>{isUploading ? "Extracting..." : "Upload Source"}</span>
              <input
                type="file"
                accept=".docx,.pdf,.txt,.md"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {/* Create Source Button */}
            <button
              type="button"
              onClick={handleStartCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              Add Source
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sources.map((source) => {
          const badge = typeBadges[source.type] || {
            label: source.type,
            bg: "bg-slate-100",
            text: "text-slate-700",
          };
          const isExpired = source.expiresAt && new Date(source.expiresAt) < new Date();

          return (
            <div
              key={source.id}
              className={`bg-white border rounded-xl p-5 shadow-xs flex flex-col justify-between transition hover:shadow-md ${
                isExpired ? "border-amber-300 ring-1 ring-amber-300" : "border-slate-200"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-xs font-mono text-slate-400">v{source.version}</span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 line-clamp-1">{source.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Owner: {source.owner}</p>
                </div>

                {isExpired && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Expired on {formatDate(source.expiresAt)} (Outdated fact)</span>
                  </div>
                )}

                <div className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2.5 rounded border border-slate-100 font-mono">
                  {source.content}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {source._count?.chunks ?? 0} indexed chunk(s)
                </span>

                <button
                  type="button"
                  onClick={() => handleOpenDetail(source)}
                  className="font-semibold text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
                >
                  View Details & History
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Source Detail & Version Drawer / Modal */}
      {selectedSource && !isEditing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-detail-title"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-teal-700">
                  {selectedSource.type} • Version {selectedSource.version}
                </span>
                <h3 id="source-detail-title" className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedSource.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                aria-label="Close dialog"
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Content Box */}
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-1.5">
                  Current Source Content
                </h4>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap">
                  {selectedSource.content}
                </div>
              </div>

              {/* Version History */}
              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-slate-400" />
                  Version History
                </h4>
                {loadingVersions ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading revision history...
                  </div>
                ) : versions.length === 0 ? (
                  <p className="text-xs text-slate-400">Only initial version on record.</p>
                ) : (
                  <div className="space-y-2">
                    {versions.map((ver) => (
                      <div
                        key={ver.id}
                        className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span>Revision v{ver.version}</span>
                          <span className="text-[11px] text-slate-400">
                            {formatDate(ver.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-mono line-clamp-2">
                          {ver.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with Admin Actions */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Expires: {selectedSource.expiresAt ? formatDate(selectedSource.expiresAt) : "Never"}
              </span>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleArchiveSource(selectedSource.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 rounded border border-rose-200 font-medium transition"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(selectedSource)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded font-medium shadow-xs transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit & Bump Version
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Create / Edit Modal */}
      {(isCreating || isEditing) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-form-title"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 id="source-form-title" className="text-lg font-bold text-slate-900">
                {isCreating ? "Add New Brand Knowledge Source" : `Edit ${selectedSource?.title}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setIsEditing(false);
                }}
                aria-label="Close dialog"
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveSource} className="p-6 overflow-y-auto space-y-4 flex-1">
              {uploadPreview && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded text-xs text-teal-800">
                  Extracted {uploadPreview.wordCount} words from {uploadPreview.filename}. Review and
                  save below.
                </div>
              )}

              <div>
                <label htmlFor="source-title" className="block text-xs font-semibold text-slate-700 mb-1">
                  Title
                </label>
                <input
                  id="source-title"
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Brand Tone Guidelines 2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="source-type" className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Type
                  </label>
                  <select
                    id="source-type"
                    value={formType}
                    onChange={(e) =>
                      setFormType(e.target.value as "guide" | "glossary" | "fact" | "claims")
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="guide">Brand Voice Guide</option>
                    <option value="glossary">Glossary</option>
                    <option value="fact">Approved Fact</option>
                    <option value="claims">Claims Register</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="source-owner" className="block text-xs font-semibold text-slate-700 mb-1">
                    Owner
                  </label>
                  <input
                    id="source-owner"
                    type="text"
                    required
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                    placeholder="e.g. Brand Marketing"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="source-expiry" className="block text-xs font-semibold text-slate-700 mb-1">
                  Expiry Date (Optional)
                </label>
                <input
                  id="source-expiry"
                  type="date"
                  value={formExpiresAt}
                  onChange={(e) => setFormExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label htmlFor="source-content" className="block text-xs font-semibold text-slate-700 mb-1">
                  Content
                </label>
                <textarea
                  id="source-content"
                  required
                  rows={8}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Enter source text or glossary entries (AVOID ... -> USE ...)"
                  className="w-full p-3 border border-slate-300 rounded text-xs font-mono focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setIsEditing(false);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {loading ? "Saving & Chunking..." : isCreating ? "Create Source" : "Save New Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
