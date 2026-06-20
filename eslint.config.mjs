import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const globals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  Blob: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  CustomEvent: "readonly",
  document: "readonly",
  Event: "readonly",
  EventTarget: "readonly",
  fetch: "readonly",
  File: "readonly",
  FormData: "readonly",
  global: "readonly",
  globalThis: "readonly",
  localStorage: "readonly",
  MouseEvent: "readonly",
  navigator: "readonly",
  performance: "readonly",
  process: "readonly",
  queueMicrotask: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

function reportRules(rules = {}) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, ruleConfig]) => {
      if (ruleConfig === "off" || ruleConfig === 0) {
        return [name, ruleConfig];
      }
      if (Array.isArray(ruleConfig)) {
        return [name, ["warn", ...ruleConfig.slice(1)]];
      }
      return [name, "warn"];
    }),
  );
}

const jsRecommended = {
  ...js.configs.recommended,
  rules: reportRules(js.configs.recommended.rules),
};

const tsRecommended = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: ["**/*.{ts,tsx}"],
  rules: reportRules(config.rules),
}));

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "out/**",
      "dist/**",
      "release/**",
      "coverage/**",
      "test-results/**",
      ".ambient/**",
      ".ambient-codex/**",
      ".git/**",
      "*.asar",
      "pnpm-lock.yaml",
    ],
  },
  jsRecommended,
  ...tsRecommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals,
    },
    rules: {
      "no-console": "off",
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reportRules(reactHooks.configs.recommended.rules),
  },
);
