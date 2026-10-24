import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "BrandLens | Pre-Publication Brand Governance",
  description: "Deterministic rules, BM25 retrieval, AI review with citation validation, and cryptographic audit trails.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Unauthenticated or invalid token
    user = null;
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-teal-500 selection:text-white flex flex-col">
        <ToastProvider>
          <Navbar user={user} />
          <main className="flex-1">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
