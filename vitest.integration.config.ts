import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration.test.ts", "tests/audit-concurrency.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup-env.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: {
      "@/generated/prisma": path.resolve(process.cwd(), "src/generated/prisma/client.ts"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
