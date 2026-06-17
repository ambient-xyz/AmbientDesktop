import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../shared/types";
import type { AmbientDownloadJobSnapshot, AmbientDownloadStartInput } from "../ambient/ambientDownloadService";
import { createManagedDownloadToolExtension, type ManagedDownloadServiceLike } from "./agentRuntimeManagedDownloadTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createManagedDownloadToolExtension", () => {
  it("registers managed download tools and forwards start requests", async () => {
    const registeredTools: RegisteredTool[] = [];
    const starts: AmbientDownloadStartInput[] = [];
    const service = downloadService({
      start: (input) => {
        starts.push(input);
        return snapshot({ status: "queued", bytesReceived: 0, expectedBytes: 1024, totalBytes: 1024 });
      },
    });

    createManagedDownloadToolExtension({
      workspace: workspace(),
      downloadService: service,
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_download_start",
      "ambient_download_status",
      "ambient_download_wait",
      "ambient_download_cancel",
    ]);
    expect(registeredTools.map((tool) => tool.executionMode)).toEqual(["sequential", "sequential", "sequential", "sequential"]);

    const updates: any[] = [];
    const result = await registeredTools[0]!.execute("download-start", {
      url: "https://example.com/model.bin",
      destinationPath: "models/model.bin",
      destinationKind: "managed-install",
      overwrite: true,
      expectedBytes: 1024,
      sha256: "abc123",
      resume: false,
      retryCount: 3,
    }, undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Starting Ambient-managed download." }],
        details: {
          runtime: "ambient-managed-download",
          toolName: "ambient_download_start",
          status: "running",
        },
      },
    ]);
    expect(starts).toEqual([{
      workspacePath: "/tmp/workspace",
      url: "https://example.com/model.bin",
      destinationPath: "models/model.bin",
      destinationKind: "managed-install",
      overwrite: true,
      expectedBytes: 1024,
      sha256: "abc123",
      resume: false,
      retryCount: 3,
    }]);
    expect(result.content[0].text).toContain("Ambient managed download queued.");
    expect(result.content[0].text).toContain("Progress: queued: 0 B of 1.0 KB");
    expect(result.details).toMatchObject({
      runtime: "ambient-managed-download",
      toolName: "ambient_download_start",
      status: "queued",
      jobId: "job-1",
      destinationPath: "downloads/file.bin",
    });
  });

  it("forwards status, wait, and cancel requests", async () => {
    const registeredTools: RegisteredTool[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const service = downloadService({
      status: (jobId) => {
        calls.push({ method: "status", jobId });
        return snapshot({ status: "running", bytesReceived: 512, totalBytes: 1024, percent: 50 });
      },
      wait: async (jobId, input) => {
        calls.push({ method: "wait", jobId, heartbeatMs: input.heartbeatMs, hasSignal: Boolean(input.signal) });
        input.onProgress?.(snapshot({ status: "running", bytesReceived: 512, totalBytes: 1024, percent: 50 }));
        return snapshot({ status: "completed", bytesReceived: 1024, totalBytes: 1024, percent: 100 });
      },
      cancel: (jobId) => {
        calls.push({ method: "cancel", jobId });
        return snapshot({ status: "canceled", bytesReceived: 512, totalBytes: 1024, percent: 50 });
      },
    });

    createManagedDownloadToolExtension({
      workspace: workspace(),
      downloadService: service,
    })({
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    } as any);

    const status = tool(registeredTools, "ambient_download_status");
    const wait = tool(registeredTools, "ambient_download_wait");
    const cancel = tool(registeredTools, "ambient_download_cancel");
    const waitUpdates: any[] = [];
    const signal = new AbortController().signal;

    const statusResult = await status.execute("download-status", { jobId: " job-1 " });
    const waitResult = await wait.execute("download-wait", { jobId: "job-1", heartbeatMs: 25 }, signal, (update: any) => waitUpdates.push(update));
    const cancelResult = await cancel.execute("download-cancel", { jobId: "job-1" });

    expect(calls).toEqual([
      { method: "status", jobId: "job-1" },
      { method: "wait", jobId: "job-1", heartbeatMs: 25, hasSignal: true },
      { method: "cancel", jobId: "job-1" },
    ]);
    expect(statusResult.details).toMatchObject({ toolName: "ambient_download_status", status: "running", percent: 50 });
    expect(waitUpdates).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "Waiting for Ambient-managed download job-1." }],
        details: expect.objectContaining({ toolName: "ambient_download_wait", status: "running" }),
      }),
      expect.objectContaining({
        content: [{ type: "text", text: "running: 512 B of 1.0 KB, 50%" }],
        details: expect.objectContaining({ toolName: "ambient_download_wait", status: "running" }),
      }),
    ]);
    expect(waitResult.details).toMatchObject({ toolName: "ambient_download_wait", status: "completed", percent: 100 });
    expect(cancelResult.details).toMatchObject({ toolName: "ambient_download_cancel", status: "canceled" });
  });
});

function tool(tools: RegisteredTool[], name: string): RegisteredTool {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing ${name}.`);
  return found;
}

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}

function downloadService(overrides: Partial<ManagedDownloadServiceLike> = {}): ManagedDownloadServiceLike {
  return {
    start: () => snapshot(),
    status: () => snapshot(),
    wait: async () => snapshot(),
    cancel: () => snapshot(),
    ...overrides,
  };
}

function snapshot(overrides: Partial<AmbientDownloadJobSnapshot> = {}): AmbientDownloadJobSnapshot {
  return {
    schemaVersion: "ambient-managed-download-job-v1",
    jobId: "job-1",
    status: "queued",
    url: "https://example.com/file.bin",
    destinationKind: "workspace",
    destinationPath: "downloads/file.bin",
    absolutePath: "/tmp/workspace/downloads/file.bin",
    partPath: "/tmp/workspace/downloads/file.bin.part",
    bytesReceived: 0,
    totalBytes: undefined,
    percent: undefined,
    expectedBytes: undefined,
    sha256: undefined,
    computedSha256: undefined,
    resumeEnabled: true,
    resumed: false,
    attempt: 1,
    retryCount: 2,
    error: undefined,
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...overrides,
  };
}
