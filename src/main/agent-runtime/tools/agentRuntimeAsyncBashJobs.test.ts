import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AgentRuntimeAsyncBashJobService,
  asyncBashJobTerminal,
  type AsyncBashJobSnapshot,
} from "./agentRuntimeAsyncBashJobs";
import type { ToolRunnerPolicy } from "../agentRuntimeToolRuntimeFacade";
import {
  clearRegisteredSecretRedactionsForTests,
  registerSecretRedaction,
} from "../../security/securityToolRuntimeContract";

describe("AgentRuntimeAsyncBashJobService", () => {
  it("starts a detached command, polls incremental output, and materializes final artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const started = await service.start({
        threadId: "thread-1",
        workspacePath: workspace,
        command: "printf 'first\\n'; sleep 0.2; printf 'second\\n'",
        policy: fullAccessPolicy(workspace),
        yieldMs: 100,
      });

      expect(started.jobId).toMatch(/[0-9a-f-]+/);
      expect(started.maxRunMs).toBe(120_000);
      expect(started.outputPreview).toContain("first");

      const final = await pollUntilTerminal(service, "thread-1", started);
      expect(final.status).toBe("exited");
      expect(final.exitCode).toBe(0);
      expect(final.outputPreview).toContain("second");
      expect(final.artifacts.combined?.path).toMatch(/^\.ambient\/tool-outputs\//);
      expect(existsSync(join(workspace, final.artifacts.combined!.path))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("writes stdin to a running job", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-stdin-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const started = await service.start({
        threadId: "thread-stdin",
        workspacePath: workspace,
        command: "read line; sleep 0.15; printf 'got:%s\\n' \"$line\"",
        policy: fullAccessPolicy(workspace),
      });

      const afterWrite = await service.writeForThread("thread-stdin", started.jobId, "hello\n", 1000);
      const final = asyncBashJobTerminal(afterWrite.status)
        ? afterWrite
        : await pollUntilTerminal(service, "thread-stdin", afterWrite);

      expect(afterWrite.outputPreview).toContain("got:hello");
      expect(final.status).toBe("exited");
      expect(final.outputPreview).toContain("got:hello");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("cancels a running job", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-cancel-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const started = await service.start({
        threadId: "thread-cancel",
        workspacePath: workspace,
        command: "sleep 10",
        policy: fullAccessPolicy(workspace),
      });

      const cancelled = await service.cancelForThread("thread-cancel", started.jobId, "test cleanup");
      const final = asyncBashJobTerminal(cancelled.status)
        ? cancelled
        : await pollUntilTerminal(service, "thread-cancel", cancelled);

      expect(final.status).toBe("cancelled");
      expect(final.events.some((event) => event.text.includes("cancelling"))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("cancels bash_start when the tool-call signal aborts before handoff", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-abort-"));
    const snapshots: AsyncBashJobSnapshot[] = [];
    try {
      const service = new AgentRuntimeAsyncBashJobService({
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      });
      const controller = new AbortController();
      const startPromise = service.start({
        threadId: "thread-abort",
        workspacePath: workspace,
        command: "sleep 5",
        policy: fullAccessPolicy(workspace),
        yieldMs: 1000,
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 50);

      await expect(startPromise).rejects.toThrow("bash_start aborted before returning job");
      expect(snapshots.some((snapshot) => snapshot.status === "cancelled")).toBe(true);
      expect(snapshots.some((snapshot) =>
        snapshot.events.some((event) => event.text.includes("aborted before background handoff")),
      )).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("bounds in-memory output while preserving full artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-large-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const started = await service.start({
        threadId: "thread-large",
        workspacePath: workspace,
        command: "yes line | head -n 30000",
        policy: fullAccessPolicy(workspace),
      });

      const final = await pollUntilTerminal(service, "thread-large", started);

      expect(final.status).toBe("exited");
      expect(final.totalOutputChars).toBeGreaterThan(64_000);
      expect(final.outputPreview.length).toBeLessThanOrEqual(20_000);
      expect(final.outputTruncated).toBe(true);
      expect(final.firstAvailableSeq).toBeGreaterThan(1);
      expect(final.artifacts.combined?.totalChars).toBe(final.totalOutputChars);
      expect(existsSync(join(workspace, final.artifacts.combined!.path))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("stops noisy jobs when the async artifact byte limit is reached", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-output-limit-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService({ artifactByteLimit: 8_000 });
      const started = await service.start({
        threadId: "thread-output-limit",
        workspacePath: workspace,
        command: "yes line",
        policy: fullAccessPolicy(workspace),
      });

      const final = await pollUntilTerminal(service, "thread-output-limit", started, 60);

      expect(final.status).toBe("timed_out");
      expect(final.timeoutReason).toBe("output-limit");
      expect(final.artifactLimitReached).toBe(true);
      expect(final.artifacts.combined?.bytes).toBeLessThanOrEqual(8_000);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("redacts registered secrets split across streaming chunks before persisting output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-redaction-"));
    const dispose = registerSecretRedaction("split-secret-value");
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const code = [
        "process.stdout.write('before split-secret-');",
        "setTimeout(() => { process.stdout.write('value after\\n'); }, 25);",
      ].join("");
      const started = await service.start({
        threadId: "thread-redaction",
        workspacePath: workspace,
        command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(code)}`,
        policy: fullAccessPolicy(workspace),
      });

      const final = await pollUntilTerminal(service, "thread-redaction", started);
      const artifact = await readFile(join(workspace, final.artifacts.combined!.path), "utf8");

      expect(final.status).toBe("exited");
      expect(final.outputPreview).not.toContain("split-secret-value");
      expect(artifact).not.toContain("split-secret-value");
      expect(final.outputPreview).toContain("[REDACTED]");
      expect(artifact).toContain("[REDACTED]");
      expect(final.artifacts.combined?.redacted).toBe(true);
    } finally {
      dispose();
      clearRegisteredSecretRedactionsForTests();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("treats unterminated stdout progress as live activity", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-progress-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService();
      const code = [
        "let count = 0;",
        "const timer = setInterval(() => {",
        "  process.stdout.write('.');",
        "  count += 1;",
        "  if (count === 8) clearInterval(timer);",
        "}, 200);",
      ].join("");
      const started = await service.start({
        threadId: "thread-progress",
        workspacePath: workspace,
        command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(code)}`,
        idleTimeoutMs: 1000,
        yieldMs: 700,
        policy: fullAccessPolicy(workspace),
      });

      expect(started.events.some((event) => event.text.includes("stdout activity received"))).toBe(true);

      const final = await pollUntilTerminal(service, "thread-progress", started, 60);
      expect(final.status).toBe("exited");
      expect(final.outputPreview).toContain("........");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("terminates secret-like unterminated output when redaction carry overflows", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-secret-carry-"));
    try {
      const service = new AgentRuntimeAsyncBashJobService({ artifactByteLimit: 50_000 });
      const code = [
        "process.stdout.write('token=');",
        "setInterval(() => { process.stdout.write('A'.repeat(4096)); }, 1);",
      ].join("");
      const started = await service.start({
        threadId: "thread-secret-carry",
        workspacePath: workspace,
        command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(code)}`,
        policy: fullAccessPolicy(workspace),
      });

      const final = await pollUntilTerminal(service, "thread-secret-carry", started, 60);

      expect(final.status).toBe("timed_out");
      expect(final.timeoutReason).toBe("output-limit");
      expect(final.outputPreview).toContain("secret boundary");
      expect(final.outputPreview).not.toContain("token=");
      expect(final.artifacts.combined?.bytes).toBeLessThan(50_000);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not emit a queued job when invocation validation fails", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-async-bash-invalid-"));
    const snapshots: AsyncBashJobSnapshot[] = [];
    try {
      const service = new AgentRuntimeAsyncBashJobService({
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      });

      await expect(service.start({
        threadId: "thread-invalid",
        workspacePath: workspace,
        command: "printf nope",
        cwd: "/",
        policy: fullAccessPolicy(workspace),
      })).rejects.toThrow("outside the current workspace authority");

      expect(snapshots).toEqual([]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function pollUntilTerminal(
  service: AgentRuntimeAsyncBashJobService,
  threadId: string,
  initial: AsyncBashJobSnapshot,
  maxAttempts = 30,
): Promise<AsyncBashJobSnapshot> {
  let snapshot = initial;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (asyncBashJobTerminal(snapshot.status)) return snapshot;
    snapshot = await service.pollForThread(threadId, snapshot.jobId, {
      sinceSeq: snapshot.nextSinceSeq,
      waitMs: 500,
      maxBytes: 20_000,
    });
  }
  throw new Error(`Job ${initial.jobId} did not become terminal; last status ${snapshot.status}`);
}

function fullAccessPolicy(workspacePath: string): ToolRunnerPolicy {
  return {
    permissionMode: "full-access",
    workspacePath,
    subject: "pi-bash",
  };
}
