import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// `eslint .` is non-interactive; errors fail CI, warnings are a visible backlog.
const config = [
  {
    ignores: [".next/**", ".turbo/**", "node_modules/**", "next-env.d.ts", "src/generated/**", "public/**", "e2e/**", "content/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // next/core-web-vitals already registers the jsx-a11y plugin; add the recommended rule set only.
  { rules: { ...jsxA11y.flatConfigs.recommended.rules } },
  {
    // Existing violations are tracked as warnings so the gate can block new
    // errors without a large refactor; tighten each to "error" once fixed.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn", // 52 existing uses, mostly Supabase row casts
      "react/no-unescaped-entities": "warn", // cosmetic; apostrophes in copy render correctly
      "jsx-a11y/no-autofocus": "warn", // deliberate focus on dialog open
      "jsx-a11y/label-has-associated-control": "warn", // labels wrap or sit beside controls via custom components
      "jsx-a11y/aria-role": "warn", // fires on custom components with a `role` prop, not DOM elements
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "warn", // existing tablist/menu patterns, need UX review
      "jsx-a11y/no-noninteractive-element-interactions": "warn", // existing click handlers on non-interactive elements
      "jsx-a11y/img-redundant-alt": "warn", // alt text such as "Photo of unit", needs copy review
      "jsx-a11y/media-has-caption": "warn", // user-uploaded media has no captions
      "jsx-a11y/alt-text": "warn", // test fixture image only
      "jsx-a11y/interactive-supports-focus": "warn", // existing tablist needs keyboard review
      "jsx-a11y/no-noninteractive-tabindex": "warn", // scrollable print region
      "@next/next/no-html-link-for-pages": "warn", // plain anchors kept so navigation behaves exactly as today
      "react/jsx-key": "warn", // static arrays inside a test fixture
    },
  },
];

export default config;
