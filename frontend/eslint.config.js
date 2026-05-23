import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage", "playwright-report"],
  },
  {
    extends: [js.configs.recommended, tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // React hooks — only the essential rules, skip react-hooks v7 strict additions
      // (set-state-in-effect / refs flag too many existing patterns in this codebase)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Warn on unused vars — underscore-prefixed vars are allowed
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],

      // No console.log — warn/error remain allowed
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // Prefer type-only imports (aligns with tsconfig verbatimModuleSyntax)
      // disallowTypeAnnotations: false — allow import() type expressions (used in tests)
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: false,
      }],

      // Don't be overly strict
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
