import { describe, expect, it } from "vitest";
import { checkInclusiveLanguage, runAllRules } from "@/lib/review/rules";

function findInclusiveFinding(text: string, glossaryLines: string[]) {
  return runAllRules(text, { glossaryLines }).find((finding) => finding.ruleId === "inclusive_language");
}

describe("inclusiveLanguage rule", () => {
  it("returns no findings for an empty draft", () => {
    expect(checkInclusiveLanguage("", ["AVOID: chairman -> USE: chairperson"])).toEqual([]);
  });

  it("reports one exact glossary match at its draft offsets", () => {
    const findings = checkInclusiveLanguage("The chairman leads.", ["AVOID: chairman -> USE: chairperson"]);
    expect(findings.map(({ snippet, start, end }) => ({ snippet, start, end }))).toEqual([
      { snippet: "chairman", start: 4, end: 12 },
    ]);
  });

  it("matches glossary terms without regard to case", () => {
    const findings = checkInclusiveLanguage("The CHAIRMAN leads.", ["AVOID: chairman -> USE: chairperson"]);
    expect(findings.map(({ snippet, start, end }) => ({ snippet, start, end }))).toEqual([
      { snippet: "CHAIRMAN", start: 4, end: 12 },
    ]);
  });

  it("does not match a glossary word inside chairmanship", () => {
    expect(checkInclusiveLanguage("Her chairmanship was effective.", ["AVOID: chairman -> USE: chairperson"])).toEqual([]);
  });

  it("reports every occurrence of a glossary term in one draft", () => {
    const text = "The chairman arrived before another chairman spoke.";
    const findings = checkInclusiveLanguage(text, ["AVOID: chairman -> USE: chairperson"]);
    expect(findings.map(({ snippet, start, end }) => ({ snippet, start, end }))).toEqual([
      { snippet: "chairman", start: 4, end: 12 },
      { snippet: "chairman", start: 36, end: 44 },
    ]);
  });

  it("keeps the longest match when glossary terms overlap", () => {
    const findings = checkInclusiveLanguage("chairman board members", [
      "AVOID: chairman -> USE: chairperson",
      "AVOID: chairman board -> USE: chairperson board",
    ]);
    expect(findings.map(({ snippet, start, end }) => ({ snippet, start, end }))).toEqual([
      { snippet: "chairman board", start: 0, end: 14 },
    ]);
  });

  it("uses the glossary line as source quote and its approved neutral term as the fix", () => {
    const sourceLine = "AVOID: manpower -> USE: workforce";
    const inclusiveFinding = findInclusiveFinding("We need more manpower.", [sourceLine]);
    expect(inclusiveFinding && {
      sourceQuote: inclusiveFinding.sourceQuote,
      suggestedFix: inclusiveFinding.suggestedFix,
    }).toEqual({ sourceQuote: sourceLine, suggestedFix: "workforce" });
  });

  it("matches a gendered alternative from a pipe-separated glossary entry", () => {
    const sourceLine = "AVOID: chairman | chairwoman -> USE: chairperson";
    const finding = findInclusiveFinding("The chairwoman joined.", [sourceLine]);
    expect(finding && {
      snippet: finding.snippet,
      sourceQuote: finding.sourceQuote,
      suggestedFix: finding.suggestedFix,
    }).toEqual({ snippet: "chairwoman", sourceQuote: sourceLine, suggestedFix: "chairperson" });
  });
});
