"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";

interface LoginFormProps {
  demoMode: boolean;
}

export function LoginForm({ demoMode }: LoginFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDemoLogin(role: string) {
    setLoadingRole(role);
    setError(null);
    try {
      const res = await fetch(`/api/auth/demo/${role}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to log in with demo account");
      }
      toast.success(`Logged in as ${data.user.name} (${data.user.role})`, "Welcome back!");
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      toast.error(message, "Demo Login Failed");
    } finally {
      setLoadingRole(null);
    }
  }

  async function handleNormalLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoadingRole("form");
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      toast.success(`Signed in as ${data.user.name}`, "Welcome back!");
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      toast.error(message, "Login Failed");
    } finally {
      setLoadingRole(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center mx-auto text-white shadow-md mb-3">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          BrandLens
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Pre-publication brand-governance & compliance platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-slate-200">
          {error && (
            <div
              className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg"
              role="alert"
            >
              {error}
            </div>
          )}

          {demoMode && (
            <div className="mb-6 space-y-3">
              <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase text-center">
                One-Click Hackathon Demo Access
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {/* 3 Big Buttons */}
                <button
                  type="button"
                  onClick={() => handleDemoLogin("creator")}
                  disabled={!!loadingRole}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-50 transition"
                >
                  {loadingRole === "creator" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Logging in...
                    </span>
                  ) : (
                    "Continue as Creator"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin("manager")}
                  disabled={!!loadingRole}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 disabled:opacity-50 transition"
                >
                  {loadingRole === "manager" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Logging in...
                    </span>
                  ) : (
                    "Continue as Manager"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin("reviewer")}
                  disabled={!!loadingRole}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-600 disabled:opacity-50 transition"
                >
                  {loadingRole === "reviewer" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Logging in...
                    </span>
                  ) : (
                    "Continue as Reviewer"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDemoLogin("legal_reviewer")}
                  disabled={!!loadingRole}
                  className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-600 disabled:opacity-50 transition"
                >
                  {loadingRole === "legal_reviewer" ? "Logging in..." : "Continue as Legal Reviewer"}
                </button>

                {/* Small Admin button */}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin("admin")}
                    disabled={!!loadingRole}
                    className="inline-flex items-center justify-center px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 disabled:opacity-50 transition"
                  >
                    {loadingRole === "admin" ? "Logging in..." : "Continue as Admin"}
                  </button>
                </div>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-600 font-medium">Or sign in with email</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleNormalLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="creator@aurora.test"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="AuroraDemo2026!"
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={!!loadingRole}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-xs text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50 transition"
            >
              {loadingRole === "form" ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
