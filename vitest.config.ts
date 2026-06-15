import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/.ambient-codex/**",
      "**/.pnpm-store/**",
      "**/.worktrees/**",
      "**/test-results/**",
    ],
  },
});
