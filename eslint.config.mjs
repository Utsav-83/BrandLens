import js from "@eslint/js";
import tsPlugin from "typescript-eslint";

export default [
  {
    ignores: [
      ".next/**",
      "**/.next/**",
      "dist/**",
      "**/dist/**",
      "src/generated/**",
      "**/src/generated/**",
      "node_modules/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
