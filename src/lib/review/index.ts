import { db } from "../db";
import { runAllRules, RuleContext, ApprovedFactItem } from "./rules";
import { runAIJudge } from "./aiJudge";
import { mergeFindings, ValidatedFinding } from "./validate";
import { LLMClient, defaultLLMClient } from "../llm";
import { AiStatus } from "@/generated/prisma";

export interface ReviewAnalysisResult {
  findings: ValidatedFinding[];
  aiStatus: AiStatus;
  aiModel: string | null;
  ruleFindingCount: number;
  aiFindingCount: number;
  sourceIdsUsed: string[];
}

/**
 * Loads active rule context from the database for a workspace.
 */
export async function loadWorkspaceRuleContext(workspaceId: string): Promise<{
  ruleContext: RuleContext;
  sourceIds: string[];
}> {
  const sources = await db.source.findMany({
    where: {
      workspaceId,
      status: "active",
    },
    select: {
      id: true,
      type: true,
      content: true,
      expiresAt: true,
    },
  });

  const now = new Date();
  const sourceIds: string[] = sources.map((s) => s.id);

  let glossaryLines: string[] = [];
  const approvedFacts: ApprovedFactItem[] = [];
  let claimsRegisterLines: string[] = [];
  let brandGuidePassages: string[] = [];

  for (const src of sources) {
    if (src.type === "glossary") {
      const lines = src.content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      glossaryLines = [...glossaryLines, ...lines];
    } else if (src.type === "fact") {
      const isExpired = src.expiresAt ? src.expiresAt <= now : false;
      const lines = src.content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      for (const line of lines) {
        approvedFacts.push({
          id: src.id,
          text: line,
          isExpired,
          expiresAt: src.expiresAt,
        });
      }
    } else if (src.type === "claims") {
      const lines = src.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      claimsRegisterLines = [...claimsRegisterLines, ...lines];
    } else if (src.type === "guide") {
      const paras = src.content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      brandGuidePassages = [...brandGuidePassages, ...paras];
    }
  }

  return {
    ruleContext: {
      glossaryLines,
      approvedFacts,
      claimsRegisterLines,
      brandGuidePassages,
    },
    sourceIds,
  };
}

/**
 * Orchestrates full pre-publication review:
 * Step 1: Run deterministic rules (Rules first, AI second).
 * Step 2: Run AI judge on tone and semantic claim alignment.
 * Step 3: Enforce strict citation validation ("No source, no verdict").
 * Step 4: Merge findings (rules take precedence on overlaps, sorted by severity).
 */
export async function analyzeDraft(
  workspaceId: string,
  text: string,
  options?: {
    llmClient?: LLMClient;
    context?: RuleContext;
  }
): Promise<ReviewAnalysisResult> {
  const llm = options?.llmClient || defaultLLMClient;

  // 1. Load active rule context
  let ruleContext = options?.context;
  let sourceIdsUsed: string[] = [];

  if (!ruleContext) {
    const loaded = await loadWorkspaceRuleContext(workspaceId);
    ruleContext = loaded.ruleContext;
    sourceIdsUsed = loaded.sourceIds;
  }

  // 2. Step 1: Rules first
  const rawRuleFindings = runAllRules(text, ruleContext);
  const ruleFindings: ValidatedFinding[] = rawRuleFindings.map((rf) => ({
    ruleId: rf.ruleId,
    origin: "rule",
    category: rf.category,
    severity: rf.severity,
    confidence: rf.confidence,
    start: rf.start,
    end: rf.end,
    snippet: rf.snippet,
    message: rf.message,
    sourceId: rf.sourceId,
    sourceQuote: rf.sourceQuote,
    suggestedFix: rf.suggestedFix,
    needsHumanReview: rf.needsHumanReview,
  }));

  // 3. Step 2: AI second (with citation validation)
  const aiResult = await runAIJudge(workspaceId, text, llm);

  // 4. Merge findings: rules win on overlapping spans
  const merged = mergeFindings(ruleFindings, aiResult.findings);

  for (const p of aiResult.passagesUsed) {
    if (!sourceIdsUsed.includes(p.sourceId)) {
      sourceIdsUsed.push(p.sourceId);
    }
  }

  return {
    findings: merged,
    aiStatus: aiResult.aiStatus,
    aiModel: aiResult.aiModel,
    ruleFindingCount: ruleFindings.length,
    aiFindingCount: aiResult.findings.length,
    sourceIdsUsed,
  };
}
