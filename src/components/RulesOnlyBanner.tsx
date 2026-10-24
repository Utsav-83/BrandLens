import React from "react";
import { AlertCircle } from "lucide-react";

interface RulesOnlyBannerProps {
  aiStatus?: string | null;
  className?: string;
}

export function RulesOnlyBanner({ aiStatus, className = "" }: RulesOnlyBannerProps) {
  if (aiStatus !== "unavailable" && aiStatus !== "skipped") {
    return null;
  }

  return (
    <div
      role="alert"
      className={`bg-amber-50 border-l-4 border-amber-500 p-4 text-amber-900 rounded-r shadow-sm flex items-center justify-between ${className}`}
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
        <div>
          <h4 className="font-semibold text-sm">AI review unavailable, rules-only results</h4>
          <p className="text-xs text-amber-700 mt-0.5">
            Deterministic brand rules and fact checks ran successfully. LLM judgements on tone and semantic claims were skipped.
          </p>
        </div>
      </div>
      <span className="text-xs font-mono px-2 py-1 bg-amber-100 text-amber-800 rounded border border-amber-300">
        aiStatus: {aiStatus}
      </span>
    </div>
  );
}
