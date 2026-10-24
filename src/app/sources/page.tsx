import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SourcesManager, SourceItem } from "./SourcesManager";

export const runtime = "nodejs";

export default async function SourcesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const sources = await prisma.source.findMany({
    where: {
      workspaceId: user.workspaceId,
      status: "active",
    },
    include: {
      _count: {
        select: { chunks: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const formattedSources: SourceItem[] = sources.map((s) => ({
    id: s.id,
    type: s.type as "guide" | "glossary" | "fact" | "claims",
    title: s.title,
    owner: s.owner,
    version: s.version,
    status: s.status as "active" | "archived",
    expiresAt: s.expiresAt,
    content: s.content,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    _count: s._count,
  }));

  return <SourcesManager sources={formattedSources} userRole={user.role} />;
}
