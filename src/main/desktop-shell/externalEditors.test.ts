import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceOpenTargets, normalizeDetectedBundleId, openWorkspaceTarget } from "./externalEditors";

const originalE2e = process.env.AMBIENT_E2E;
const originalE2eOpenTargets = process.env.AMBIENT_E2E_OPEN_TARGETS;
const originalE2eOpenTargetLog = process.env.AMBIENT_E2E_OPEN_TARGET_LOG;

afterEach(() => {
  restoreEnv("AMBIENT_E2E", originalE2e);
  restoreEnv("AMBIENT_E2E_OPEN_TARGETS", originalE2eOpenTargets);
  restoreEnv("AMBIENT_E2E_OPEN_TARGET_LOG", originalE2eOpenTargetLog);
});

describe("normalizeDetectedBundleId", () => {
  it("accepts bundle identifiers and rejects empty output", () => {
    expect(normalizeDetectedBundleId("com.microsoft.VSCode\n")).toBe("com.microsoft.VSCode");
    expect(normalizeDetectedBundleId("\n")).toBeUndefined();
    expect(normalizeDetectedBundleId("missing value")).toBeUndefined();
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("E2E editor launch hooks", () => {
  it("can expose deterministic open targets and record launch requests without opening native apps", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-editor-"));
    const target = join(workspace, "app.ts");
    const log = join(workspace, "open-targets.jsonl");
    await writeFile(target, "export const e2e = true;\n", "utf8");
    process.env.AMBIENT_E2E = "1";
    process.env.AMBIENT_E2E_OPEN_TARGETS = "1";
    process.env.AMBIENT_E2E_OPEN_TARGET_LOG = log;

    try {
      await expect(listWorkspaceOpenTargets()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "chrome", label: "Google Chrome", kind: "browser" }),
          expect.objectContaining({ id: "vscode", label: "VS Code" }),
        ]),
      );
      await openWorkspaceTarget(target, "vscode");
      expect(JSON.parse((await readFile(log, "utf8")).trim())).toMatchObject({
        targetId: "vscode",
        path: target,
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
