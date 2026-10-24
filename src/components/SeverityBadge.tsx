import React from "react";
import { AlertTriangle, AlertCircle, Info, ShieldAlert, Sparkles } from "lucide-react";

export type SeverityType = "high" | "medium" | "low" | string;

interface SeverityBadgeProps {
  severity: SeverityType;
  showIcon?: boolean;
  className?: string;
}

export function SeverityBadge({ severity, showIcon = true, className = "" }: SeverityBadgeProps) {
  const norm = severity.toLowerCase();

  if (norm === "high") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200 ${className}`}
        role="status"
        aria-label="High severity"
      >
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" aria-hidden="true" />}
        High
      </span>
    );
  }

  if (norm === "medium") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 ${className}`}
        role="status"
        aria-label="Medium severity"
      >
        {showIcon && <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />}
        Medium
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 ${className}`}
      role="status"
      aria-label="Low severity"
    >
      {showIcon && <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />}
      Low
    </span>
  );
}

export function OriginBadge({ origin }: { origin: "rule" | "ai" | string }) {
  if (origin === "ai") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
        <Sparkles className="w-3 h-3 text-purple-600" aria-hidden="true" />
        AI Judge
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      <ShieldAlert className="w-3 h-3 text-slate-600" aria-hidden="true" />
      Rule Check
    </span>
  );
}
