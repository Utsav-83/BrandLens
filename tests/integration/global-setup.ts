import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";

function normalizedDatabaseIdentity(value: string): string {
  try {
    const parsed = new URL(value);
    const host = parsed.host.toLowerCase().replace(/-pooler(?=\.)/, "");
    return `${parsed.protocol}//${host}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return value.trim();
  }
}

export default function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  const appUrl = process.env.DATABASE_URL?.trim();
  if (!testUrl) throw new Error("Refusing integration tests: TEST_DATABASE_URL is not configured.");
  if (appUrl && normalizedDatabaseIdentity(testUrl) === normalizedDatabaseIdentity(appUrl)) {
    throw new Error("Refusing integration tests: TEST_DATABASE_URL points to the same database as DATABASE_URL.");
  }

  const projectRoot = process.cwd();
  const prismaCli = path.join(projectRoot, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  });
}
