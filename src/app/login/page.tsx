import React from "react";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === "true";

  return <LoginForm demoMode={demoMode} />;
}
