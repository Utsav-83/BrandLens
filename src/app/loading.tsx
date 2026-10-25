import React from "react";

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6 animate-pulse"
    >
      <span className="sr-only">Loading page content...</span>
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-72 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-slate-200 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-48 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-6 w-40 bg-slate-200 rounded" />
          <div className="h-16 w-full bg-slate-100 rounded" />
        </div>
        <div className="h-48 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-6 w-40 bg-slate-200 rounded" />
          <div className="h-16 w-full bg-slate-100 rounded" />
        </div>
        <div className="h-48 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-6 w-40 bg-slate-200 rounded" />
          <div className="h-16 w-full bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  );
}
