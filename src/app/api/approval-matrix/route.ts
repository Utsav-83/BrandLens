import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { assertSameOrigin, requireRole } from "@/lib/guards";
import type { ApprovalStage } from "@/generated/prisma";

export const runtime = "nodejs";
const roleSchema = z.enum(["manager", "reviewer", "legal_reviewer"]);
const schema = z.object({
  stages: z.array(z.object({ name: z.string().trim().min(1).max(60), order: z.number().int().min(1), requiredReviewerRole: roleSchema })).min(1).max(10),
  rules: z.array(z.object({ category: z.string().trim().min(1).max(80), minimumSeverity: z.enum(["low", "medium", "high"]), stageName: z.string().min(1) })).max(100),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.stages.map((stage) => stage.name)).size !== value.stages.length) ctx.addIssue({ code: "custom", message: "Stage names must be unique." });
  if (new Set(value.stages.map((stage) => stage.order)).size !== value.stages.length) ctx.addIssue({ code: "custom", message: "Stage order values must be unique." });
  for (const rule of value.rules) if (!value.stages.some((stage) => stage.name === rule.stageName)) ctx.addIssue({ code: "custom", message: `Rule references unknown stage '${rule.stageName}'.` });
});

export async function GET() {
  const guard = await requireRole("admin"); if (guard.error) return guard.error;
  const stages = await db.approvalStage.findMany({ where: { workspaceId: guard.user.workspaceId }, include: { rules: true }, orderBy: { order: "asc" } });
  return NextResponse.json({ stages: stages.map(({ rules: _rules, ...stage }) => stage), rules: stages.flatMap((stage) => stage.rules.map((rule) => ({ category: rule.category, minimumSeverity: rule.minimumSeverity, stageName: stage.name }))) });
}

export async function PUT(request: Request) {
  const originError = assertSameOrigin(request); if (originError) return originError;
  const guard = await requireRole("admin"); if (guard.error) return guard.error;
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  try {
    const saved = await db.$transaction(async (tx) => {
      const records: ApprovalStage[] = [];
      const currentStages = await tx.approvalStage.findMany({ where: { workspaceId: guard.user.workspaceId }, orderBy: { order: "asc" } });
      for (const [index, stage] of currentStages.entries()) await tx.approvalStage.update({ where: { id: stage.id }, data: { order: -(index + 1) } });
      for (const stage of parsed.data.stages) records.push(await tx.approvalStage.upsert({ where: { workspaceId_name: { workspaceId: guard.user.workspaceId, name: stage.name } }, update: { order: stage.order, requiredReviewerRole: stage.requiredReviewerRole }, create: { workspaceId: guard.user.workspaceId, ...stage } }));
      await tx.approvalRule.deleteMany({ where: { workspaceId: guard.user.workspaceId } });
      if (parsed.data.rules.length) await tx.approvalRule.createMany({ data: parsed.data.rules.map((rule) => ({ workspaceId: guard.user.workspaceId, category: rule.category, minimumSeverity: rule.minimumSeverity, stageId: records.find((stage) => stage.name === rule.stageName)!.id })) });
      const existing = await tx.approvalStage.findMany({ where: { workspaceId: guard.user.workspaceId, id: { notIn: records.map((stage) => stage.id) } } });
      for (const stage of existing) if (!(await tx.submissionStage.count({ where: { stageId: stage.id } }))) await tx.approvalStage.delete({ where: { id: stage.id } });
      await appendAudit(tx, { workspaceId: guard.user.workspaceId, actorId: guard.user.id, action: "update_approval_matrix", entity: "approval_matrix", entityId: guard.user.workspaceId, payload: { stageCount: records.length, ruleCount: parsed.data.rules.length } });
      return records;
    });
    return NextResponse.json({ message: "Approval matrix saved.", stages: saved });
  } catch { return NextResponse.json({ error: "Failed to save approval matrix." }, { status: 500 }); }
}
