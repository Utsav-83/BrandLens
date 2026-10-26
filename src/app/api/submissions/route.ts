import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, assertSameOrigin, REVIEWABLE_STATUSES } from "@/lib/guards";
import { appendAudit } from "@/lib/audit";
import { Channel, SubmissionStatus } from "@/generated/prisma";

export const runtime = "nodejs";

const createSubmissionSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    channel: z.enum(["social", "web", "email", "print", "deck"]).optional().default("web"),
    text: z.string().min(1, "Text content is required").optional(),
    content: z.string().optional(),
    body: z.string().optional(),
    originalText: z.string().optional(),
  })
  .transform((data) => ({
    title: data.title,
    channel: data.channel ?? "web",
    text: (data.text || data.content || data.body || data.originalText || "").trim(),
  }))
  .refine((data) => data.text.length > 0, {
    message: "Text content is required",
    path: ["text"],
  });

// GET /api/submissions: creators see their own; managers/reviewers/admins see all
export async function GET(request: Request) {
  const guard = await requireRole();
  if (guard.error) return guard.error;
  const user = guard.user;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") as SubmissionStatus | null;
  const channelFilter = searchParams.get("channel") as Channel | null;

  try {
    const isRestrictedCreator = user.role === "creator";
    const isReviewerOrManager = user.role === "manager" || user.role === "reviewer";

    let effectiveStatusFilter: SubmissionStatus | { in: SubmissionStatus[] } | undefined = undefined;
    if (isReviewerOrManager) {
      if (statusFilter && (REVIEWABLE_STATUSES as readonly string[]).includes(statusFilter)) {
        effectiveStatusFilter = statusFilter;
      } else {
        effectiveStatusFilter = { in: [...REVIEWABLE_STATUSES] };
      }
    } else if (statusFilter) {
      effectiveStatusFilter = statusFilter;
    }

    const submissions = await db.submission.findMany({
      where: {
        workspaceId: user.workspaceId,
        ...(isRestrictedCreator ? { creatorId: user.id } : {}),
        ...(effectiveStatusFilter ? { status: effectiveStatusFilter } : {}),
        ...(channelFilter ? { channel: channelFilter } : {}),
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { findings: true, comments: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}

// POST /api/submissions: creators and admins can create drafts
export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const guard = await requireRole("creator", "admin");
  if (guard.error) return guard.error;
  const user = guard.user;

  try {
    const body = await request.json();
    const parsed = createSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { title, channel, text } = parsed.data;

    const submission = await db.$transaction(async (tx) => {
      const newSub = await tx.submission.create({
        data: {
          workspaceId: user.workspaceId,
          creatorId: user.id,
          title,
          channel,
          originalText: text,
          currentText: text,
          status: "draft",
        },
      });

      await appendAudit(tx, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "create_submission",
        entity: "submission",
        entityId: newSub.id,
        payload: {
          title,
          channel,
          wordCount: text.split(/\s+/).filter(Boolean).length,
        },
      });

      return newSub;
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    console.error("Error creating submission:", error);
    return NextResponse.json({ error: "Failed to create submission" }, { status: 500 });
  }
}
