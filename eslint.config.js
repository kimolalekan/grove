import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "drizzle/**"],
  },
  js.configs.recommended,
  // TypeScript-aware rules (TS files only — the codebase uses `require()` in
  // plain .js files, so TS rules must not leak into those).
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Legacy codebase: keep these visible but non-blocking during adoption.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      // New in ESLint 10 and too noisy for existing code; revisit later.
      "preserve-caught-error": "warn",
    },
  },
  {
    files: [
      "server/**/*.ts",
      "scripts/**/*.ts",
      "drizzle.config.ts",
      "tailwind.config.ts",
      "vite.config.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["*.js", "*.cjs", "*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
