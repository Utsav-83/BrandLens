"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText,
  PlusCircle,
  BookOpen,
  ListOrdered,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "creator" | "manager" | "reviewer" | "admin";
  workspaceId: string;
}

interface NavbarProps {
  user: SessionUser | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Do not render navbar on login page
  if (pathname === "/login") {
    return null;
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  const role = user?.role;

  const navItems = [
    { label: "Submissions", href: "/", icon: FileText, show: true },
    { label: "New Draft", href: "/new", icon: PlusCircle, show: true },
    { label: "Knowledge Base", href: "/sources", icon: BookOpen, show: true },
    {
      label: "Review Queue",
      href: "/queue",
      icon: ListOrdered,
      show: role === "manager" || role === "reviewer" || role === "admin",
    },
    {
      label: "Audit Trail",
      href: "/audit",
      icon: ShieldCheck,
      show: role === "manager" || role === "admin",
    },
  ];

  const roleColors: Record<string, string> = {
    creator: "bg-teal-50 text-teal-700 border-teal-300 ring-teal-500/30",
    manager: "bg-indigo-50 text-indigo-700 border-indigo-300 ring-indigo-500/30",
    reviewer: "bg-sky-50 text-sky-700 border-sky-300 ring-sky-500/30",
    admin: "bg-purple-50 text-purple-700 border-purple-300 ring-purple-500/30",
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-black text-lg shadow-sm group-hover:bg-teal-700 transition">
                BL
              </div>
              <div>
                <span className="font-bold text-slate-900 tracking-tight text-lg">
                  Brand<span className="text-teal-600">Lens</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-400 border-l border-slate-200 pl-2">
                  Governance & Compliance
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            {user && (
              <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
                {navItems
                  .filter((item) => item.show)
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                          isActive
                            ? "bg-teal-50 text-teal-700"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
              </nav>
            )}
          </div>

          {/* Right side: User Badge & Actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-semibold text-slate-900 leading-tight">
                    {user.name}
                  </span>
                  <span className="text-[11px] text-slate-500">{user.email}</span>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ring-1 ${
                    roleColors[user.role] || "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                  role="status"
                  aria-label={`User role: ${user.role}`}
                >
                  {user.role}
                </span>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 transition"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition"
              >
                Sign In
              </Link>
            )}

            {/* Mobile menu button */}
            {user && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Menu className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {user && mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-3 space-y-1">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
        </div>
      )}
    </header>
  );
}
