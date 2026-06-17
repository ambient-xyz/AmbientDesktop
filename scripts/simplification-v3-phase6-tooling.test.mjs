import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

describe("simplification V3 Phase 6 guardrail tooling", () => {
  it("keeps lint and format checks in explicit report mode", () => {
    const pkg = readJson("package.json");

    expect(pkg.devDependencies).toMatchObject({
      "@eslint/js": expect.any(String),
      eslint: expect.any(String),
      "eslint-plugin-react-hooks": expect.any(String),
      prettier: expect.any(String),
      "typescript-eslint": expect.any(String),
    });
    expect(pkg.scripts["lint:report"]).toContain("scripts/report-command.mjs lint");
    expect(pkg.scripts["format:report"]).toContain("scripts/report-command.mjs prettier");
    expect(pkg.scripts["simplification:v3:phase6:check"]).toContain("pnpm run simplification:v3:guardrails:check");
    expect(pkg.scripts["simplification:v3:phase6:check"]).toContain("pnpm run format:report");
    expect(pkg.scripts.verify).toBe("pnpm run simplification:v3:phase6:check");
  });

  it("provides local ESLint and Prettier configuration without workflow churn", () => {
    expect(existsSync(resolve(repoRoot, "eslint.config.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "prettier.config.mjs"))).toBe(true);
    expect(existsSync(resolve(repoRoot, ".prettierignore"))).toBe(true);
    expect(existsSync(resolve(repoRoot, ".github/workflows"))).toBe(false);
  });

  it("does not fail report-only commands when the underlying check reports current debt", () => {
    const output = execFileSync(process.execPath, ["scripts/report-command.mjs", "demo", process.execPath, "-e", "process.exit(2)"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(output).toContain("continuing because this Phase 6 lane is report-only");
  });
});
