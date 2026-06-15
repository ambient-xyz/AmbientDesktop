import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrivilegedActionNativeRequest, dryRunPrivilegedActionNativeRequest, planPrivilegedAction } from "./privilegedAction";
import {
  redactedContainerRuntimeManagedInstallLogRecord,
  redactedPrivilegedActionLogRecord,
  writeContainerRuntimeManagedInstallRedactedLog,
  writePrivilegedActionRedactedLog,
} from "./privilegedActionLogs";

describe("privileged action redacted logs", () => {
  it("writes redacted result logs inside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-privileged-log-"));
    try {
      const request = buildPrivilegedActionNativeRequest(
        planPrivilegedAction({
          kind: "privileged_action_template",
          purpose: "create_system_symlink",
          packageName: "ambient-kokoro-tts",
          reason: "Protected data path.",
          credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
          commands: [{ exe: "/bin/ln", args: ["-sfn", ".ambient/data", "/Library/Application Support/Ambient/data"] }],
        }),
        { workspacePath: workspace, requestId: "request/with unsafe chars" },
      );
      const result = {
        ...dryRunPrivilegedActionNativeRequest(request),
        stdoutPreview: "ok password=hunter2",
        stderrPreview: "token=abcdef",
        credential: "should-not-log",
      } as any;

      const logPath = await writePrivilegedActionRedactedLog(workspace, result);
      const log = await readFile(logPath, "utf8");

      expect(logPath).toContain(join(".ambient", "privileged-actions", "request-with-unsafe-chars.json"));
      expect(log).toContain('"kind": "ambient-privileged-action-log"');
      expect(log).toContain("password=[REDACTED]");
      expect(log).toContain("token=[REDACTED]");
      expect(log).toContain('"credential": "[REDACTED]"');
      expect(log).not.toContain("hunter2");
      expect(log).not.toContain("abcdef");
      expect(log).not.toContain("should-not-log");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts secret-like nested fields without changing the original result", () => {
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        reason: "Package manager boundary.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/env", args: ["installer", "api_key=secret-value"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-2" },
    );
    const result = dryRunPrivilegedActionNativeRequest(request);
    const record = redactedPrivilegedActionLogRecord({
      ...result,
      stdoutPreview: "api_key=secret-value",
    });

    expect(JSON.stringify(record)).toContain("api_key=[REDACTED]");
    expect(JSON.stringify(record)).not.toContain("secret-value");
    expect(result.stdoutPreview).toBeUndefined();
  });

  it("writes redacted managed container runtime install logs", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-managed-install-log-"));
    try {
      const result = {
        status: "failed" as const,
        message: "Package manager failed.",
        adapter: "ambient-user-command",
        requestId: "managed/install?one",
        commandCount: 1,
        stdoutPreview: "ok",
        stderrPreview: "Authorization=abc123 api_key=secret-value",
        redactedCommands: [{ exe: "brew", args: ["install", "--cask", "podman-desktop"], rationale: "Install Podman Desktop." }],
      };

      const logPath = await writeContainerRuntimeManagedInstallRedactedLog(workspace, result);
      const log = await readFile(logPath, "utf8");

      expect(logPath).toContain(join(".ambient", "privileged-actions", "managed-install-one.json"));
      expect(log).toContain('"kind": "ambient-container-runtime-managed-install-log"');
      expect(log).toContain("api_key=[REDACTED]");
      expect(log).not.toContain("secret-value");
      expect(log).not.toContain("abc123");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts managed install records without changing the original result", () => {
    const result = {
      status: "failed" as const,
      message: "Package manager failed.",
      adapter: "ambient-user-command",
      requestId: "managed-install-2",
      commandCount: 1,
      stderrPreview: "token=abc123",
      redactedCommands: [{ exe: "installer", args: ["token=abc123"], rationale: "Install runtime." }],
    };

    const record = redactedContainerRuntimeManagedInstallLogRecord(result);

    expect(JSON.stringify(record)).toContain("token=[REDACTED]");
    expect(JSON.stringify(record)).not.toContain("abc123");
    expect(result.stderrPreview).toBe("token=abc123");
  });
});
