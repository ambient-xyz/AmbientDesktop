import { describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearWorkflowJitterReleaseProfileLatestArtifacts,
  runWorkflowJitterReleaseProfileGate,
  WORKFLOW_JITTER_RELEASE_PROFILE_GATE_ARGS,
  WORKFLOW_JITTER_RELEASE_PROFILE_MATRIX_ARGS,
} from "./workflow-jitter-release-profile-gate.mjs";

describe("workflow jitter release-profile gate runner", () => {
  it("runs the release gate even when the release-profile matrix exits nonzero", async () => {
    const calls = [];
    const result = await runWorkflowJitterReleaseProfileGate({
      nodePath: "node",
      cwd: "/repo",
      env: { AMBIENT_PROVIDER: "gmi-cloud" },
      clearLatestArtifacts: false,
      runCommand: async (input) => {
        calls.push(input);
        return {
          label: input.label,
          exitCode: input.label.includes("matrix") ? 1 : 0,
          signal: undefined,
        };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(calls.map((call) => call.label)).toEqual([
      "workflow jitter release-profile matrix",
      "workflow jitter release-profile gate",
    ]);
    expect(calls[0]).toMatchObject({
      command: "node",
      args: WORKFLOW_JITTER_RELEASE_PROFILE_MATRIX_ARGS,
      cwd: "/repo",
      env: expect.objectContaining({ AMBIENT_PROVIDER: "gmi-cloud" }),
    });
    expect(calls[1]).toMatchObject({
      command: "node",
      args: WORKFLOW_JITTER_RELEASE_PROFILE_GATE_ARGS,
    });
  });

  it("fails overall when the gate rejects a matrix artifact and passes only when both commands pass", async () => {
    const gateRejected = await runWorkflowJitterReleaseProfileGate({
      clearLatestArtifacts: false,
      runCommand: async (input) => ({
        label: input.label,
        exitCode: input.label.includes("gate") ? 1 : 0,
        signal: undefined,
      }),
    });
    expect(gateRejected.exitCode).toBe(1);

    const passed = await runWorkflowJitterReleaseProfileGate({
      clearLatestArtifacts: false,
      runCommand: async (input) => ({ label: input.label, exitCode: 0, signal: undefined }),
    });
    expect(passed.exitCode).toBe(0);
  });

  it("forwards focused matrix tasks while preserving strict release-profile defaults", async () => {
    const calls = [];
    await runWorkflowJitterReleaseProfileGate({
      matrixTasks: ["ui-dogfood-gmail-20-metadata-readonly-validation", "ui-dogfood-public-source-browser"],
      clearLatestArtifacts: false,
      runCommand: async (input) => {
        calls.push(input);
        return { label: input.label, exitCode: 1, signal: undefined };
      },
    });

    expect(calls[0].args).toEqual([
      ...WORKFLOW_JITTER_RELEASE_PROFILE_MATRIX_ARGS,
      "--task=ui-dogfood-gmail-20-metadata-readonly-validation",
      "--task=ui-dogfood-public-source-browser",
    ]);
    expect(calls[1].args).toEqual(WORKFLOW_JITTER_RELEASE_PROFILE_GATE_ARGS);
  });

  it("clears mutable latest artifacts before running so stale evidence cannot pass", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "workflow-jitter-release-profile-"));
    try {
      const matrixDir = join(tempRoot, "test-results", "workflow-jitter-matrix");
      const gateDir = join(tempRoot, "test-results", "workflow-jitter-release-gate");
      await mkdir(matrixDir, { recursive: true });
      await mkdir(gateDir, { recursive: true });
      await Promise.all([
        writeFile(join(matrixDir, "latest.json"), "{}\n", "utf8"),
        writeFile(join(matrixDir, "latest.md"), "old\n", "utf8"),
        writeFile(join(gateDir, "latest.json"), "{}\n", "utf8"),
        writeFile(join(gateDir, "latest.md"), "old\n", "utf8"),
        writeFile(join(matrixDir, "history.jsonl"), "{\"kept\":true}\n", "utf8"),
      ]);

      await clearWorkflowJitterReleaseProfileLatestArtifacts(tempRoot);

      await expect(access(join(matrixDir, "latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(join(matrixDir, "latest.md"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(join(gateDir, "latest.json"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(join(gateDir, "latest.md"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(matrixDir, "history.jsonl"), "utf8")).toContain("\"kept\":true");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
