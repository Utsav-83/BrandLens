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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-600 focus:text-white focus:rounded-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-700 font-medium text-sm"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <Navbar user={user} />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
