import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireRole } from "@/lib/guards";
import { MatrixEditor } from "./MatrixEditor";

export const runtime = "nodejs";
export default async function ApprovalMatrixPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const guard = await requireRole("admin");
  if (guard.error) redirect("/");
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8"><header><h1 className="text-2xl font-bold text-slate-900">Approval matrix</h1><p className="mt-1 text-sm text-slate-600">Configure the review stages used by your workspace.</p></header><MatrixEditor /></main>;
}
