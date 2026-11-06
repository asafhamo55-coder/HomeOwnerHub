import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// `eslint .` is non-interactive; errors fail CI, warnings are a visible backlog.
const config = [
  {
    // e2e/ (Playwright) is intentionally not linted: it is outside the app bundle and has its own conventions.
    ignores: [".next/**", ".turbo/**", "node_modules/**", "next-env.d.ts", "src/generated/**", "public/**", "e2e/**", "content/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // next/core-web-vitals already registers the jsx-a11y plugin; add the recommended rule set only.
  { rules: { ...jsxA11y.flatConfigs.recommended.rules } },
  {
    // Existing violations are tracked as warnings so the gate can block new
    // errors without a large refactor; tighten each to "error" once fixed.
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // 52 existing uses, mostly Supabase row casts
      "react/no-unescaped-entities": "warn", // cosmetic; apostrophes in copy render correctly
      "jsx-a11y/no-autofocus": "warn", // deliberate focus on dialog open
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Input", "Textarea", "Select"], assert: "either", depth: 3 }],
      "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
      "@next/next/no-html-link-for-pages": "warn", // plain anchors kept so navigation behaves exactly as today
    },
  },
];

export default config;
