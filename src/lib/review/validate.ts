import { FindingSeverity, FindingOrigin } from "@/generated/prisma";

export interface RawAIFinding {
  snippet: string;
  category: "tone" | "brand_voice" | "unsupported_claim" | "inconsistent_fact" | "terminology" | "other";
  severity: "high" | "medium" | "low";
  confidence: number;
  message: string;
  passageId?: string | null;
  sourceQuote?: string | null;
  suggestedFix?: string | null;
}

export interface RetrievedPassageItem {
  passageId: string; // e.g. "P1"
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  text: string;
}

export interface ValidatedFinding {
  ruleId?: string;
  origin: FindingOrigin;
  category: string;
  severity: FindingSeverity;
  confidence: number;
  start: number;
  end: number;
  snippet: string;
  message: string;
  sourceId?: string;
  sourceQuote?: string;
  suggestedFix?: string;
  needsHumanReview: boolean;
}

/**
 * Normalizes text for comparison by lowercasing and collapsing whitespace.
 */
export function normalizeWhitespace(str: string): string {
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extracts numeric, percentage, and currency tokens from a string.
 */
export function extractNumbers(text: string): Set<string> {
  const numbers = text.match(/\b\d+(?:\.\d+)?%?|\$\d+(?:\.\d+)?|₹\d+(?:\.\d+)?/gi) || [];
  return new Set(numbers.map((n) => n.toLowerCase().trim()));
}

/**
 * Finds the character offset start/end of a snippet within the original draft,
 * handling case and minor whitespace variations.
 */
export function findSnippetOffsets(draft: string, snippet: string): { start: number; end: number } | null {
  if (!snippet || !draft) return null;

  // 1. Direct match
  const directIdx = draft.indexOf(snippet);
  if (directIdx !== -1) {
    return { start: directIdx, end: directIdx + snippet.length };
  }

  // 2. Case-insensitive match
  const lowerDraft = draft.toLowerCase();
  const lowerSnippet = snippet.toLowerCase();
  const lowerIdx = lowerDraft.indexOf(lowerSnippet);
  if (lowerIdx !== -1) {
    return { start: lowerIdx, end: lowerIdx + snippet.length };
  }

  // 3. Normalized whitespace regex match
  const escaped = snippet
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  try {
    const rx = new RegExp(escaped, "i");
    const m = rx.exec(draft);
    if (m) {
      return { start: m.index, end: m.index + m[0].length };
    }
  } catch {
    // If regex fails, fallback
  }

  return null;
}

/**
 * Validates a single raw AI finding against the draft and retrieved passages.
 * Enforces the non-negotiable "No source, no verdict" rule.
 */
export function validateAIFinding(
  finding: RawAIFinding,
  draft: string,
  passagesMap: Map<string, RetrievedPassageItem>
): ValidatedFinding | null {
  // Check 1: Snippet must occur in draft
  const offsets = findSnippetOffsets(draft, finding.snippet);
  if (!offsets) {
    // Snippet hallucinated or not found in draft -> DROP
    return null;
  }

  const isUnsupportedClaim = finding.category === "unsupported_claim";
  let validatedSourceQuote: string | undefined = undefined;
  let sourceId: string | undefined = undefined;
  let severity: FindingSeverity = finding.severity as FindingSeverity;

  if (isUnsupportedClaim) {
    // EXCEPTION: unsupported_claim may have no sourceQuote
    // Cap severity at medium as mandated by Non-Negotiable Rule 1
    severity = (finding.severity === "high" ? "medium" : finding.severity) as FindingSeverity;
    validatedSourceQuote = undefined;
  } else {
    // Check 2: sourceQuote must occur inside the cited passage
    if (!finding.passageId || !finding.sourceQuote) {
      // Non-unsupported claim missing sourceQuote or passage -> DROP
      return null;
    }

    const passage = passagesMap.get(finding.passageId);
    if (!passage) {
      // Cited passage ID does not exist -> DROP
      return null;
    }

    const normQuote = normalizeWhitespace(finding.sourceQuote);
    const normPassage = normalizeWhitespace(passage.text);

    if (!normPassage.includes(normQuote)) {
      // Hallucinated quote not present in retrieved source -> DROP
      return null;
    }

    validatedSourceQuote = finding.sourceQuote;
    sourceId = passage.sourceId;
  }

  // Check 3: Check for fabricated numbers in suggestedFix
  let validatedFix = finding.suggestedFix ? finding.suggestedFix.trim() : undefined;
  if (validatedFix) {
    const fixNumbers = extractNumbers(validatedFix);
    if (fixNumbers.size > 0) {
      // Extract numbers present in draft and in all retrieved passages
      const allowedNumbers = extractNumbers(draft);
      for (const p of passagesMap.values()) {
        const pNumbers = extractNumbers(p.text);
        pNumbers.forEach((num) => allowedNumbers.add(num));
      }

      // Check if any number in the suggested fix was fabricated
      let hasFabricatedNumber = false;
      for (const num of fixNumbers) {
        if (!allowedNumbers.has(num)) {
          hasFabricatedNumber = true;
          break;
        }
      }

      if (hasFabricatedNumber) {
        // Strip the fix to protect brand truth, but keep the finding
        validatedFix = undefined;
      }
    }
  }

  // Check 4: Low confidence flags needsHumanReview
  const needsHumanReview = finding.confidence < 0.5;

  return {
    origin: "ai",
    category: finding.category,
    severity,
    confidence: Math.max(0, Math.min(1, finding.confidence)),
    start: offsets.start,
    end: offsets.end,
    snippet: draft.slice(offsets.start, offsets.end),
    message: finding.message || (isUnsupportedClaim ? "No approved source found for this claim." : ""),
    sourceId,
    sourceQuote: validatedSourceQuote,
    suggestedFix: validatedFix,
    needsHumanReview,
  };
}

/**
 * Validates a batch of raw AI findings, filtering out invalid ones and computing offsets.
 */
export function validateBatchAIFindings(
  rawFindings: RawAIFinding[],
  draft: string,
  passages: RetrievedPassageItem[]
): ValidatedFinding[] {
  const passagesMap = new Map<string, RetrievedPassageItem>();
  for (const p of passages) {
    passagesMap.set(p.passageId, p);
  }

  const validated: ValidatedFinding[] = [];
  for (const raw of rawFindings) {
    const valid = validateAIFinding(raw, draft, passagesMap);
    if (valid) {
      validated.push(valid);
    }
  }

  return validated;
}

/**
 * Merges rule findings and validated AI findings:
 * - Rules win on overlapping spans (AI finding dropped).
 * - Sorts by severity (high > medium > low), then by start position.
 */
export function mergeFindings(
  ruleFindings: ValidatedFinding[],
  aiFindings: ValidatedFinding[]
): ValidatedFinding[] {
  const finalFindings: ValidatedFinding[] = [...ruleFindings];

  for (const aiFinding of aiFindings) {
    // Check if aiFinding overlaps with any rule finding
    const overlaps = ruleFindings.some(
      (rule) => Math.max(rule.start, aiFinding.start) < Math.min(rule.end, aiFinding.end)
    );

    if (!overlaps) {
      finalFindings.push(aiFinding);
    }
  }

  // Sort: High > Medium > Low, then by start offset
  const severityWeight: Record<FindingSeverity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return finalFindings.sort((a, b) => {
    const weightDiff = severityWeight[b.severity] - severityWeight[a.severity];
    if (weightDiff !== 0) return weightDiff;
    return a.start - b.start;
  });
}
