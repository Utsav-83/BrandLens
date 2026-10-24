import { FindingSeverity, FindingOrigin } from "@/generated/prisma";

export interface RuleFinding {
  ruleId: string;
  origin: FindingOrigin;
  category: "tone" | "brand_voice" | "unsupported_claim" | "outdated_fact" | "terminology" | "accessibility";
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

export interface ApprovedFactItem {
  id: string;
  text: string;
  isExpired: boolean;
  expiresAt?: Date | null;
}

export interface RuleContext {
  glossaryLines?: string[];
  approvedFacts?: ApprovedFactItem[];
  claimsRegisterLines?: string[];
  brandGuidePassages?: string[];
}

/**
 * Normalizes string for case and whitespace comparison.
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Computes Flesch Reading Ease score.
 */
export function calculateFleschScore(text: string): { score: number; wordCount: number; sentenceCount: number } {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
  const words = text.match(/[a-zA-Z0-9'-]+/g) || [];

  if (words.length === 0 || sentences.length === 0) {
    return { score: 100, wordCount: 0, sentenceCount: 0 };
  }

  function countSyllables(word: string): number {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!clean) return 1;
    if (clean.length <= 3) return 1;

    let syllables = (clean.match(/[aeiouy]{1,2}/g) || []).length;
    if (clean.endsWith("e") && !clean.endsWith("le") && !clean.endsWith("ee")) {
      syllables = Math.max(1, syllables - 1);
    }
    return Math.max(1, syllables);
  }

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = totalSyllables / words.length;

  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    wordCount: words.length,
    sentenceCount: sentences.length,
  };
}

/**
 * 1. Glossary Terms Rule:
 * Parses glossary lines "AVOID: a | b -> USE: c" and flags every avoided term.
 * If the term in the draft exactly equals the approved USE term (case-sensitive), it is compliant and not flagged.
 */
export function checkGlossaryTerms(text: string, glossaryLines: string[] = []): RuleFinding[] {
  const findings: RuleFinding[] = [];

  for (const line of glossaryLines) {
    const match = line.match(/AVOID:\s*(.+?)\s*->\s*USE:\s*(.+)/i);
    if (!match) continue;

    const avoidTerms = match[1].split("|").map((t) => t.trim()).filter(Boolean);
    const useTerm = match[2].trim();

    for (const term of avoidTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?<=^|\\s|[^\\w-])${escaped}(?=$|\\s|[^\\w-])`, "gi");

      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        // If the snippet exactly matches the approved useTerm (including casing), it is compliant
        if (m[0] === useTerm) {
          continue;
        }

        findings.push({
          ruleId: "glossary_terms",
          origin: "rule",
          category: "terminology",
          severity: "high",
          confidence: 1.0,
          start: m.index,
          end: m.index + m[0].length,
          snippet: m[0],
          message: `Avoid using '${m[0]}'. Use the approved brand term '${useTerm}' instead.`,
          sourceQuote: line.trim(),
          suggestedFix: useTerm,
          needsHumanReview: false,
        });
      }
    }
  }

  return findings;
}

/**
 * 2. Absolute Claims Rule:
 * Flags unverified absolutes and superlatives.
 */
export function checkAbsoluteClaims(text: string, context?: RuleContext): RuleFinding[] {
  const findings: RuleFinding[] = [];

  const absolutePatterns = [
    { pattern: /\b100%\s+secure\b/gi, fix: "encrypted with TLS 1.2+ and AES-256", msg: "'100% secure' is an unverified absolute claim prohibited by brand policy." },
    { pattern: /\bguaranteed\s+(?:zero\s+risk|safe|returns|approval)\b/gi, fix: "rigorously protected", msg: "'Guaranteed' claims violate regulatory standards." },
    { pattern: /\bnever\s+fails\b/gi, fix: "designed with 99.9% platform availability", msg: "'Never fails' is an absolute guarantee that violates brand rules." },
    { pattern: /(?:^|[\s,;])(#1)(?=\s|$|[.,!?])/gi, fix: "leading", msg: "'#1' is an unaccredited superlative claim." },
    { pattern: /\bnumber\s+one\b/gi, fix: "leading", msg: "'Number one' is an unaccredited superlative claim." },
    { pattern: /\bthe\s+best\b/gi, fix: "a leading", msg: "'The best' is a subjective superlative banned by brand guidelines." },
    { pattern: /\bfastest\b/gi, fix: "rapid", msg: "'Fastest' is NOT approved: no independent benchmark exists." },
    { pattern: /\bmost\s+secure\b/gi, fix: "industry-standard secure", msg: "'Most secure' requires accredited third-party benchmark audits." },
    { pattern: /\bzero\s+risk\b/gi, fix: "managed risk", msg: "'Zero risk' financial claims are strictly prohibited." },
    { pattern: /\bzero\s+failure(?:\s+rate)?\b/gi, fix: "high availability", msg: "'Zero failure rate' is not approved due to bank rail dependencies." },
  ];

  const sourceQuote = context?.brandGuidePassages?.find((p) => p.includes("Absolute Claims")) ||
    "Fintech regulations and brand ethics strictly forbid unverified absolute statements. Never use terms such as '100% secure', 'guaranteed', 'never fails', 'zero risk', 'best payment app', '#1 payment solution', or 'number one'.";

  for (const item of absolutePatterns) {
    let m: RegExpExecArray | null;
    while ((m = item.pattern.exec(text)) !== null) {
      let snippet = m[0];
      let start = m.index;
      if (m[1]) {
        // Matched a capture group (e.g. #1)
        start = m.index + m[0].indexOf(m[1]);
        snippet = m[1];
      }

      findings.push({
        ruleId: "absolute_claims",
        origin: "rule",
        category: "unsupported_claim",
        severity: "high",
        confidence: 1.0,
        start,
        end: start + snippet.length,
        snippet,
        message: item.msg,
        sourceQuote,
        suggestedFix: item.fix,
        needsHumanReview: false,
      });
    }
  }

  return findings;
}

/**
 * 3. Numeric Claims Rule:
 * Verifies every number, fee percentage, and time turnaround against approved facts.
 */
export function checkNumericClaims(text: string, approvedFacts: ApprovedFactItem[] = []): RuleFinding[] {
  const findings: RuleFinding[] = [];

  // Match numbers, percentages (e.g. 0.5%, 1.8%), durations (5 minutes, 2 business days), or currencies
  const numericRegex = /(?:\b\d+(?:\.\d+)?%|\b\d+\s*(?:minutes?|hours?|business\s+days?|days?|seconds?)\b|(?:Rs\.?|INR|₹|\$)\s*\d+(?:\.\d+)?\b)/gi;

  let m: RegExpExecArray | null;
  while ((m = numericRegex.exec(text)) !== null) {
    const rawSnippet = m[0];
    const normalizedSnippet = normalizeText(rawSnippet);

    // Skip "100%" if it's already captured as "100% secure"
    if (normalizedSnippet === "100%" && text.toLowerCase().includes("100% secure")) {
      continue;
    }

    // Look for a supporting fact in approvedFacts
    let matchedFact: ApprovedFactItem | null = null;

    for (const fact of approvedFacts) {
      const normalizedFact = normalizeText(fact.text);
      if (normalizedFact.includes(normalizedSnippet)) {
        matchedFact = fact;
        break;
      }
    }

    if (!matchedFact) {
      // No supporting fact found at all
      findings.push({
        ruleId: "numeric_claims_unsupported",
        origin: "rule",
        category: "unsupported_claim",
        severity: "medium",
        confidence: 1.0,
        start: m.index,
        end: m.index + rawSnippet.length,
        snippet: rawSnippet,
        message: `No approved source supports this figure ('${rawSnippet}'). All statistics and turnaround times must be verified.`,
        needsHumanReview: true,
      });
    } else if (matchedFact.isExpired) {
      findings.push({
        ruleId: "numeric_claims_outdated",
        origin: "rule",
        category: "outdated_fact",
        severity: "high",
        confidence: 1.0,
        start: m.index,
        end: m.index + rawSnippet.length,
        snippet: rawSnippet,
        message: `The figure '${rawSnippet}' references an expired promotional or legacy term: '${matchedFact.text}'`,
        sourceQuote: matchedFact.text,
        needsHumanReview: false,
      });
    }
  }

  return findings;
}

/**
 * 4. Tone & Slang Rule:
 * Checks excessive exclamation marks, prohibited slang, and ALL-CAPS screaming.
 */
export function checkTone(text: string): RuleFinding[] {
  const findings: RuleFinding[] = [];

  // 4a. Slang list
  const slangRules = [
    { pattern: /\bhey\s+guys\b/gi, fix: "Hello everyone", msg: "'Hey guys' is overly casual slang prohibited in customer communications." },
    { pattern: /\bguys\b/gi, fix: "merchants", msg: "'Guys' is informal slang. Address customers as 'merchants' or 'partners'." },
    { pattern: /\bgonna\b/gi, fix: "going to", msg: "Avoid conversational contraction 'gonna'." },
    { pattern: /\bwanna\b/gi, fix: "want to", msg: "Avoid conversational contraction 'wanna'." },
    { pattern: /\bsuper\s+easy\b/gi, fix: "seamless", msg: "'Super easy' is colloquial slang. Use 'seamless' or 'straightforward'." },
    { pattern: /\bawesome\b/gi, fix: "reliable", msg: "Avoid overly casual filler 'awesome'." },
  ];

  for (const slang of slangRules) {
    let m: RegExpExecArray | null;
    while ((m = slang.pattern.exec(text)) !== null) {
      findings.push({
        ruleId: "tone_slang",
        origin: "rule",
        category: "tone",
        severity: "high",
        confidence: 1.0,
        start: m.index,
        end: m.index + m[0].length,
        snippet: m[0],
        message: slang.msg,
        sourceQuote: "Avoid overly casual colloquialisms and informal address. Words like 'guys', 'hey guys', 'gonna', 'wanna', 'super easy', and 'awesome' are strictly prohibited.",
        suggestedFix: slang.fix,
        needsHumanReview: false,
      });
    }
  }

  // 4b. Exclamation marks: consecutive ("!!", "!!!") or rate > 1 per 100 words
  const consecutiveExcl = /!{2,}/g;
  let exMatch: RegExpExecArray | null;
  while ((exMatch = consecutiveExcl.exec(text)) !== null) {
    findings.push({
      ruleId: "tone_exclamation_consecutive",
      origin: "rule",
      category: "tone",
      severity: "high",
      confidence: 1.0,
      start: exMatch.index,
      end: exMatch.index + exMatch[0].length,
      snippet: exMatch[0],
      message: "Consecutive exclamation marks are strictly prohibited. Use a single period.",
      sourceQuote: "Do not use more than one exclamation mark per 100 words. Never use consecutive exclamation marks (such as '!!' or '!!!').",
      suggestedFix: ".",
      needsHumanReview: false,
    });
  }

  const words = text.split(/\s+/).filter(Boolean);
  const totalExclamations = (text.match(/!/g) || []).length;
  if (words.length > 0 && totalExclamations > 1 && (totalExclamations / words.length) > 0.01) {
    const singleExclIndex = text.indexOf("!");
    if (singleExclIndex !== -1 && !findings.some((f) => f.ruleId.startsWith("tone_exclamation"))) {
      findings.push({
        ruleId: "tone_exclamation_density",
        origin: "rule",
        category: "tone",
        severity: "medium",
        confidence: 1.0,
        start: singleExclIndex,
        end: singleExclIndex + 1,
        snippet: "!",
        message: `Exclamation mark density (${totalExclamations} in ${words.length} words) exceeds brand guideline limit of 1 per 100 words.`,
        sourceQuote: "Maintain emotional restraint in written copy. Do not use more than one exclamation mark per 100 words.",
        suggestedFix: ".",
        needsHumanReview: false,
      });
    }
  }

  // 4c. ALL-CAPS screaming words (3+ uppercase letters, excluding approved acronyms)
  const allowedAcronyms = new Set([
    "TLS", "AES", "IST", "RBI", "WCAG", "AA", "SMS", "API", "USD", "INR", "DOCX", "PDF", "HTTP", "HTTPS", "JSON", "URL"
  ]);

  const allCapsRegex = /\b[A-Z]{3,}\b/g;
  let capsMatch: RegExpExecArray | null;
  while ((capsMatch = allCapsRegex.exec(text)) !== null) {
    const word = capsMatch[0];
    if (!allowedAcronyms.has(word)) {
      findings.push({
        ruleId: "tone_all_caps",
        origin: "rule",
        category: "tone",
        severity: "low",
        confidence: 1.0,
        start: capsMatch.index,
        end: capsMatch.index + word.length,
        snippet: word,
        message: `Avoid ALL-CAPS capitalization ('${word}'). Use title or sentence case.`,
        suggestedFix: word.charAt(0) + word.slice(1).toLowerCase(),
        needsHumanReview: false,
      });
    }
  }

  return findings;
}

/**
 * 5. Readability & Sentence Length Rule:
 * Flags sentences over 30 words.
 */
export function checkReadability(text: string): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const wordCount = (trimmed.match(/[a-zA-Z0-9'-]+/g) || []).length;

    if (wordCount > 30) {
      const start = text.indexOf(trimmed);
      findings.push({
        ruleId: "readability_sentence_length",
        origin: "rule",
        category: "brand_voice",
        severity: "low",
        confidence: 1.0,
        start: start !== -1 ? start : 0,
        end: start !== -1 ? start + trimmed.length : trimmed.length,
        snippet: trimmed.slice(0, 80) + "...",
        message: `Sentence is too long (${wordCount} words). Aurora Pay style limits sentences to 30 words maximum for clarity.`,
        needsHumanReview: false,
      });
    }
  }

  return findings;
}

/**
 * 6. Accessibility Text Rule:
 * Flags images with missing or empty alt text, and generic link text like "click here".
 */
export function checkAccessibilityText(text: string): RuleFinding[] {
  const findings: RuleFinding[] = [];

  const mdEmptyAlt = /!\[\s*\]\((.*?)\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdEmptyAlt.exec(text)) !== null) {
    findings.push({
      ruleId: "accessibility_missing_alt",
      origin: "rule",
      category: "accessibility",
      severity: "medium",
      confidence: 1.0,
      start: mdMatch.index,
      end: mdMatch.index + mdMatch[0].length,
      snippet: mdMatch[0],
      message: "Image is missing descriptive alt text. WCAG AA requires all images to include alt text.",
      sourceQuote: "All published images must include descriptive alt text.",
      suggestedFix: `![Description of visual content](${mdMatch[1]})`,
      needsHumanReview: false,
    });
  }

  const htmlImg = /<img\b([^>]*)>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlImg.exec(text)) !== null) {
    const attrs = htmlMatch[1];
    const hasAlt = /alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const altValue = hasAlt ? (hasAlt[1] || hasAlt[2] || "").trim() : null;

    if (altValue === null || altValue === "") {
      findings.push({
        ruleId: "accessibility_missing_alt_html",
        origin: "rule",
        category: "accessibility",
        severity: "medium",
        confidence: 1.0,
        start: htmlMatch.index,
        end: htmlMatch.index + htmlMatch[0].length,
        snippet: htmlMatch[0],
        message: "HTML <img> tag has missing or empty alt attribute. WCAG AA requires descriptive alt text.",
        sourceQuote: "All published images must include descriptive alt text.",
        needsHumanReview: false,
      });
    }
  }

  const badLinkText = /\[\s*(click\s+here|read\s+more|link)\s*\]\((.*?)\)/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = badLinkText.exec(text)) !== null) {
    findings.push({
      ruleId: "accessibility_link_text",
      origin: "rule",
      category: "accessibility",
      severity: "medium",
      confidence: 1.0,
      start: linkMatch.index,
      end: linkMatch.index + linkMatch[0].length,
      snippet: linkMatch[0],
      message: `Non-descriptive link text '${linkMatch[1]}'. Use descriptive destination text.`,
      sourceQuote: "Avoid non-descriptive hyperlink text such as 'click here' or 'read more'.",
      suggestedFix: `[View payment documentation](${linkMatch[2]})`,
      needsHumanReview: false,
    });
  }

  return findings;
}

function findWholeTerms(text: string, term: string): RegExpExecArray[] {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapedTerm}(?![\\p{L}\\p{N}_])`, "giu");
  return Array.from(text.matchAll(pattern));
}

const GENDERED_TERM_TOKENS = new Set([
  "chairman", "chairmen", "chairwoman", "chairwomen", "manpower", "mankind", "manmade",
  "man", "men", "guy", "guys", "salesman", "salesmen", "businessman", "businessmen",
  "fireman", "firemen", "policeman", "policemen", "waitress", "actress", "stewardess",
]);

function isGenderedTerm(term: string): boolean {
  const tokens = term.toLowerCase().replace(/[-_]/g, " ").match(/[\p{L}]+/gu) || [];
  return tokens.some((token) => GENDERED_TERM_TOKENS.has(token));
}

function selectLongestNonOverlapping(findings: RuleFinding[]): RuleFinding[] {
  const candidates = findings.sort((a, b) =>
    a.start - b.start || (b.end - b.start) - (a.end - a.start)
  );
  const selected: RuleFinding[] = [];
  for (const finding of candidates) {
    const previous = selected[selected.length - 1];
    if (!previous || finding.start >= previous.end) selected.push(finding);
  }
  return selected;
}

export function checkInclusiveLanguage(text: string, glossaryLines: string[] = []): RuleFinding[] {
  if (!text) return [];
  const findings: RuleFinding[] = [];
  for (const line of glossaryLines) {
    const mapping = line.match(/AVOID:\s*(.+?)\s*->\s*USE:\s*(.+)/i);
    if (!mapping) continue;
    const suggestedFix = mapping[2].trim();
    const terms = mapping[1].split("|").map((term) => term.trim()).filter(Boolean);
    for (const term of terms) {
      if (!isGenderedTerm(term)) continue;
      for (const match of findWholeTerms(text, term)) {
        const start = match.index;
        findings.push({
          ruleId: "inclusive_language",
          origin: "rule",
          category: "brand_voice",
          severity: "medium",
          confidence: 1,
          start,
          end: start + match[0].length,
          snippet: match[0],
          message: `Consider replacing gendered term '${term}' with '${suggestedFix}'.`,
          sourceQuote: line.trim(),
          suggestedFix,
          needsHumanReview: false,
        });
      }
    }
  }
  return selectLongestNonOverlapping(findings);
}

/**
 * Master deterministic rules runner: executes all 6 rule categories in sequence.
 */
export function runAllRules(text: string, context: RuleContext = {}): RuleFinding[] {
  const findings: RuleFinding[] = [
    ...checkGlossaryTerms(text, context.glossaryLines || []),
    ...checkInclusiveLanguage(text, context.glossaryLines || []),
    ...checkAbsoluteClaims(text, context),
    ...checkNumericClaims(text, context.approvedFacts || []),
    ...checkTone(text),
    ...checkReadability(text),
    ...checkAccessibilityText(text),
  ];

  return findings.sort((a, b) => a.start - b.start);
}
