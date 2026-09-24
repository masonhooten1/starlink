// @ts-check
import eslint from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

// typescript-eslint's `config()` helper is deprecated — ESLint flat config
// handles nested arrays natively.
/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ["dist/**", ".astro/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // Astro plugin last so its parser/settings override TypeScript's for .astro files.
  ...astro.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Node scripts in scripts/** run outside Astro — give them Node globals.
  {
    files: ["scripts/**"],
    languageOptions: {
      globals: { Buffer: "readonly", URL: "readonly", console: "readonly", process: "readonly" },
    },
  },
];
