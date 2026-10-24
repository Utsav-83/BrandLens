import React from "react";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";

export default function LoginPage() {
  const demoMode =
    process.env.DEMO_MODE === "true" ||
    process.env.DEMO_MODE === "1" ||
    process.env.DEMO_MODE === undefined; // default true in dev

  return <LoginForm demoMode={demoMode} />;
}
