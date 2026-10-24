import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    exclude: [...configDefaults.exclude, "tests/integration/**"],
    coverage: {
      include: [
        "src/lib/audit.ts",
        "src/lib/auth.ts",
        "src/lib/workflow.ts",
        "src/lib/llm/index.ts",
        "src/lib/retrieval/chunk.ts",
        "src/lib/retrieval/index.ts",
        "src/lib/review/aiJudge.ts",
        "src/lib/review/rules.ts",
        "src/lib/review/validate.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@/generated/prisma": path.resolve(process.cwd(), "src/generated/prisma/client.ts"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
