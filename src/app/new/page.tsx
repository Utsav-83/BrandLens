import React from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { NewSubmissionForm } from "./NewSubmissionForm";

export const runtime = "nodejs";

export default async function NewSubmissionPage() {
  const guard = await requireRole(["creator", "admin"]);
  if (guard.error) {
    if (guard.error.status === 401) {
      redirect("/login");
    }
    redirect("/");
  }

  return <NewSubmissionForm />;
}
