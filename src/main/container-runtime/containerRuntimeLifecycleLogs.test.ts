import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AmbientMcpContainerRuntimeLifecycleResult, AmbientMcpContainerRuntimeStatus } from "../../shared/pluginTypes";
import {
  redactedContainerRuntimeLifecycleLogRecord,
  writeContainerRuntimeLifecycleRedactedLog,
} from "./containerRuntimeLifecycleLogs";

describe("container runtime lifecycle logs", () => {
  it("writes redacted lifecycle logs under user data", async () => {
    const userData = await mkdtemp(join(tmpdir(), "ambient-runtime-lifecycle-"));
    const logPath = await writeContainerRuntimeLifecycleRedactedLog(userData, lifecycleResult());
    const written = await readFile(logPath, "utf8");
    const mode = (await stat(logPath)).mode & 0o777;

    expect(logPath.startsWith(join(userData, "mcp-container-runtime"))).toBe(true);
    expect(mode).toBe(0o600);
    expect(written).toContain("\"kind\": \"ambient-container-runtime-lifecycle-log\"");
    expect(written).toContain("token=[REDACTED]");
    expect(written).not.toContain("token=secret-value");
  });

  it("redacts secret-like keys in nested lifecycle output", () => {
    const record = redactedContainerRuntimeLifecycleLogRecord({
      ...lifecycleResult(),
      after: {
        ...status(),
        message: "authorization=secret-value",
      },
    });

    expect(JSON.stringify(record)).toContain("authorization=[REDACTED]");
    expect(JSON.stringify(record)).not.toContain("secret-value");
  });
});

function lifecycleResult(): AmbientMcpContainerRuntimeLifecycleResult {
  return {
    schemaVersion: "ambient-container-runtime-lifecycle-result-v1",
    action: "restart",
    runtime: "docker",
    status: "failed",
    reason: "daemon-unreachable",
    message: "Docker restart failed: token=secret-value",
    before: status(),
    progress: [
      {
        schemaVersion: "ambient-container-runtime-lifecycle-progress-v1",
        action: "restart",
        runtime: "docker",
        phase: "failed",
        status: "failed",
        message: "Docker restart failed: token=secret-value",
        recordedAt: "2026-06-04T12:00:00.000Z",
      },
    ],
    durationMs: 10,
  };
}

function status(): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "installed-not-running",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-04T12:00:00.000Z",
    durationMs: 10,
    message: "Docker is not reachable.",
    reason: "daemon-unreachable",
    nextAction: "start-runtime",
    toolHive: {
      status: "ready",
      message: "ToolHive ready",
    },
    hosts: [],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-not-missing",
    },
    postInstallQueue: [],
    defaultCapabilities: [],
  };
}
