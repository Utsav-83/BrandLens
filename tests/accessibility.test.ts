import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { RulesOnlyBanner } from "@/components/RulesOnlyBanner";
import { SeverityBadge, OriginBadge } from "@/components/SeverityBadge";
import ErrorBoundary from "@/app/error";
import NotFound from "@/app/not-found";
import fs from "fs";
import path from "path";

describe("Accessibility & Judge-Experience Pass", () => {
  describe("RulesOnlyBanner Accessibility Contract", () => {
    it("renders with role='status' and accessible message when AI is unavailable", () => {
      const html = renderToString(React.createElement(RulesOnlyBanner, { aiStatus: "unavailable" }));
      expect(html).toContain('role="status"');
      expect(html).toContain("AI review unavailable, rules-only results");
      expect(html).toContain("text-amber-800");
    });

    it("renders null when AI status is ok", () => {
      const html = renderToString(React.createElement(RulesOnlyBanner, { aiStatus: "ok" }));
      expect(html).toBe("");
    });
  });

  describe("SeverityBadge Text + Icon Contract", () => {
    it("renders high severity with text and icon (never color alone)", () => {
      const html = renderToString(React.createElement(SeverityBadge, { severity: "high" }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="High severity"');
      expect(html).toContain("High");
      expect(html).toContain("lucide-alert-triangle");
      expect(html).toContain("text-red-800");
    });

    it("renders medium severity with text and icon", () => {
      const html = renderToString(React.createElement(SeverityBadge, { severity: "medium" }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Medium severity"');
      expect(html).toContain("Medium");
      expect(html).toContain("lucide-alert-circle");
      expect(html).toContain("text-amber-800");
    });

    it("renders low severity with text and icon", () => {
      const html = renderToString(React.createElement(SeverityBadge, { severity: "low" }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Low severity"');
      expect(html).toContain("Low");
      expect(html).toContain("lucide-info");
      expect(html).toContain("text-blue-800");
    });

    it("renders origin badges with text and icon", () => {
      const ruleHtml = renderToString(React.createElement(OriginBadge, { origin: "rule" }));
      expect(ruleHtml).toContain("Rule Check");
      expect(ruleHtml).toContain("lucide-shield-alert");

      const aiHtml = renderToString(React.createElement(OriginBadge, { origin: "ai" }));
      expect(aiHtml).toContain("AI Judge");
      expect(aiHtml).toContain("lucide-sparkles");
    });
  });

  describe("Error Boundary & Not Found Recovery Actions", () => {
    it("provides a Try Again action in error boundary", () => {
      const html = renderToString(
        React.createElement(ErrorBoundary, {
          error: new Error("Test error"),
          reset: () => {},
        })
      );
      expect(html).toContain("Something went wrong");
      expect(html).toContain("Try Again");
      expect(html).toContain("Return Home");
      expect(html).toContain("focus:ring-2");
    });

    it("provides navigation back to dashboard in not found page", () => {
      const html = renderToString(React.createElement(NotFound));
      expect(html).toContain("Page Not Found");
      expect(html).toContain("Back to Dashboard");
      expect(html).toContain("focus:ring-2");
    });
  });

  describe("Layout Skip Link Contract", () => {
    it("contains skip to main content link targeting main-content", () => {
      const layoutSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/layout.tsx"),
        "utf8"
      );
      expect(layoutSrc).toContain('href="#main-content"');
      expect(layoutSrc).toContain("Skip to main content");
      expect(layoutSrc).toContain('id="main-content"');
    });
  });

  describe("Interactive Accessibility Contracts", () => {
    it("ensures NewSubmissionForm has id on file input and htmlFor on label", () => {
      const formSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/new/NewSubmissionForm.tsx"),
        "utf8"
      );
      expect(formSrc).toContain('htmlFor="file-upload"');
      expect(formSrc).toContain('id="file-upload"');
      expect(formSrc).toContain('aria-label="Upload marketing draft document');
    });

    it("ensures SubmissionWorkspace has aria-live polite status and escape listeners", () => {
      const wsSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/submissions/[id]/SubmissionWorkspace.tsx"),
        "utf8"
      );
      expect(wsSrc).toContain('aria-live="polite"');
      expect(wsSrc).toContain('aria-atomic="true"');
      expect(wsSrc).toContain('key === "Escape"');
      expect(wsSrc).toContain('id="findings-severity-filter"');
      expect(wsSrc).toContain('htmlFor="findings-severity-filter"');
    });

    it("ensures SourcesManager has escape modal dismissal and file input label", () => {
      const smSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/sources/SourcesManager.tsx"),
        "utf8"
      );
      expect(smSrc).toContain('key === "Escape"');
      expect(smSrc).toContain('htmlFor="source-file-upload"');
      expect(smSrc).toContain('id="source-file-upload"');
      expect(smSrc).toContain("No brand sources found");
    });

    it("ensures AuditViewer has action filter label and empty state", () => {
      const avSrc = fs.readFileSync(
        path.join(process.cwd(), "src/app/audit/AuditViewer.tsx"),
        "utf8"
      );
      expect(avSrc).toContain('htmlFor="audit-action-filter"');
      expect(avSrc).toContain('id="audit-action-filter"');
      expect(avSrc).toContain('htmlFor="audit-search-input"');
      expect(avSrc).toContain('id="audit-search-input"');
      expect(avSrc).toContain("No audit events found");
    });
  });
});
