import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyHarnessCheckout } from "./verify-harness-checkout.mjs";
import { buildHarnessManifest, classifyHarnessFailure } from "./write-harness-manifest.mjs";

describe("harness runtime contracts", () => {
  it("classifies harness, provider, environment, and product failures distinctly", () => {
    expect(classifyHarnessFailure({ exitCode: 0 })).toBe("passed");
    expect(classifyHarnessFailure({ phase: "native", stderr: "Native module verification failed for Node ABI 141" }))
      .toBe("harness_environment_failed");
    expect(classifyHarnessFailure({ phase: "test", stderr: "Ambient/Pi stream stalled after 30000 ms" }))
      .toBe("provider_failed");
    expect(classifyHarnessFailure({ phase: "test", stdout: "Error: 429 No workers are currently available." }))
      .toBe("provider_failed");
    expect(classifyHarnessFailure({ phase: "test", stderr: "model temporarily unavailable" }))
      .toBe("provider_failed");
    expect(classifyHarnessFailure({ phase: "dogfood", stderr: "Timed out waiting for Electron CDP" }))
      .toBe("harness_failed");
    expect(classifyHarnessFailure({
      phase: "test",
      stdout: "native module ok: better-sqlite3\nnative module ok: node-pty",
      stderr: "AssertionError: expected child threads to be greater than or equal to 3",
      exitCode: 1,
    })).toBe("product_failed");
    expect(classifyHarnessFailure({
      phase: "test",
      stdout: "The scenario workspace is temporary and the file is the requested artifact.",
      stderr: "AssertionError: expected child sessions to be greater than or equal to 3",
      exitCode: 1,
    })).toBe("product_failed");
    expect(classifyHarnessFailure({
      phase: "test",
      stderr: "AssertionError: expected child threads\n ❯ assertScenarioPassed src/main/subagentScenarioDogfood.live.test.ts:560:91",
      exitCode: 1,
    })).toBe("product_failed");
    expect(classifyHarnessFailure({ phase: "test", stderr: "expected child run status completed", exitCode: 1 }))
      .toBe("product_failed");
  });

  it("writes the manifest status and run identity without product-artifact guesses", () => {
    const manifest = buildHarnessManifest({
      kind: "live_node_test",
      status: "harness_environment_failed",
      phase: "checkout",
      command: ["node", "scripts/run-live-node-test.mjs", "--", "vitest"],
      checkout: { status: "failed" },
      now: "2026-06-14T00:00:00.000Z",
    });

    expect(manifest.schemaVersion).toBe("ambient-harness-manifest-v1");
    expect(manifest.result.status).toBe("harness_environment_failed");
    expect(manifest.run.kind).toBe("live_node_test");
    expect(manifest.checkout.status).toBe("failed");
  });

  it("fails before live execution when a nested worktree directory is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-harness-checkout-"));
    try {
      execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
      await writeFile(join(root, "package.json"), "{}\n", "utf8");
      await mkdir(join(root, ".worktrees", "stale", "node_modules"), { recursive: true });

      await expect(verifyHarnessCheckout({ cwd: root })).rejects.toThrow(/Harness checkout preflight failed/);
      const result = await verifyHarnessCheckout({ cwd: root, throwOnFailure: false });
      expect(result.status).toBe("failed");
      expect(result.issues.map((issue) => issue.kind)).toContain("nested_worktrees_dir");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
