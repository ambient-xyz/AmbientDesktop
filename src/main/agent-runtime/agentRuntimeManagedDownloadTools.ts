import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../../shared/types";
import type { AmbientDownloadJobSnapshot, AmbientDownloadStartInput } from "../ambient/ambientDownloadService";
import { managedDownloadToolDescriptor, piToolFieldsFromDescriptor } from "../desktopToolRegistry";

export interface ManagedDownloadServiceLike {
  start(input: AmbientDownloadStartInput): AmbientDownloadJobSnapshot;
  status(jobId: string): AmbientDownloadJobSnapshot;
  wait(
    jobId: string,
    input: {
      signal?: AbortSignal;
      heartbeatMs?: number;
      onProgress?: (snapshot: AmbientDownloadJobSnapshot) => void;
    },
  ): Promise<AmbientDownloadJobSnapshot>;
  cancel(jobId: string): AmbientDownloadJobSnapshot;
}

export interface ManagedDownloadToolExtensionOptions {
  workspace: Pick<WorkspaceState, "path">;
  downloadService: ManagedDownloadServiceLike;
}

export function createManagedDownloadToolExtension(options: ManagedDownloadToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const start = piToolFieldsFromDescriptor(managedDownloadToolDescriptor("ambient_download_start"));
    pi.registerTool({
      ...start,
      parameters: start.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        onUpdate?.(managedDownloadToolUpdate("ambient_download_start", "Starting Ambient-managed download."));
        const input = managedDownloadStartInput(params);
        const snapshot = options.downloadService.start({
          workspacePath: options.workspace.path,
          ...input,
        });
        return managedDownloadToolResult(managedDownloadText(snapshot), "ambient_download_start", snapshot);
      },
    });

    const status = piToolFieldsFromDescriptor(managedDownloadToolDescriptor("ambient_download_status"));
    pi.registerTool({
      ...status,
      parameters: status.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = managedDownloadJobInput(params);
        const snapshot = options.downloadService.status(input.jobId);
        return managedDownloadToolResult(managedDownloadText(snapshot), "ambient_download_status", snapshot);
      },
    });

    const wait = piToolFieldsFromDescriptor(managedDownloadToolDescriptor("ambient_download_wait"));
    pi.registerTool({
      ...wait,
      parameters: wait.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const input = managedDownloadWaitInput(params);
        onUpdate?.(managedDownloadToolUpdate("ambient_download_wait", `Waiting for Ambient-managed download ${input.jobId}.`));
        const snapshot = await options.downloadService.wait(input.jobId, {
          signal,
          heartbeatMs: input.heartbeatMs,
          onProgress: (progress) => onUpdate?.(managedDownloadSnapshotUpdate("ambient_download_wait", progress)),
        });
        return managedDownloadToolResult(managedDownloadText(snapshot), "ambient_download_wait", snapshot);
      },
    });

    const cancel = piToolFieldsFromDescriptor(managedDownloadToolDescriptor("ambient_download_cancel"));
    pi.registerTool({
      ...cancel,
      parameters: cancel.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = managedDownloadJobInput(params);
        const snapshot = options.downloadService.cancel(input.jobId);
        return managedDownloadToolResult(managedDownloadText(snapshot), "ambient_download_cancel", snapshot);
      },
    });
  };
}

function managedDownloadToolUpdate(toolName: string, text: string): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-managed-download",
      toolName,
      status: "running",
    },
  };
}

function managedDownloadSnapshotUpdate(toolName: string, snapshot: AmbientDownloadJobSnapshot): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: managedDownloadProgressText(snapshot) }],
    details: {
      runtime: "ambient-managed-download",
      toolName,
      status: snapshot.status,
      download: snapshot,
    },
  };
}

function managedDownloadToolResult(
  text: string,
  toolName: string,
  snapshot: AmbientDownloadJobSnapshot,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-managed-download",
      toolName,
      status: snapshot.status,
      download: snapshot,
      jobId: snapshot.jobId,
      destinationPath: snapshot.destinationPath,
      absolutePath: snapshot.absolutePath,
      partPath: snapshot.partPath,
      bytesReceived: snapshot.bytesReceived,
      totalBytes: snapshot.totalBytes,
      percent: snapshot.percent,
      error: snapshot.error,
    },
  };
}

function managedDownloadText(snapshot: AmbientDownloadJobSnapshot): string {
  return [
    `Ambient managed download ${snapshot.status}.`,
    `Job id: ${snapshot.jobId}`,
    `Destination: ${snapshot.destinationPath}`,
    `Absolute path: ${snapshot.absolutePath}`,
    `Partial path: ${snapshot.partPath}`,
    `Progress: ${managedDownloadProgressText(snapshot)}`,
    snapshot.sha256 ? `Expected SHA-256: ${snapshot.sha256}` : undefined,
    snapshot.computedSha256 ? `Computed SHA-256: ${snapshot.computedSha256}` : undefined,
    snapshot.error ? `Error: ${snapshot.error}` : undefined,
  ].filter(Boolean).join("\n");
}

function managedDownloadProgressText(snapshot: AmbientDownloadJobSnapshot): string {
  const total = snapshot.totalBytes ?? snapshot.expectedBytes;
  const size = total
    ? `${formatManagedDownloadBytes(snapshot.bytesReceived)} of ${formatManagedDownloadBytes(total)}`
    : formatManagedDownloadBytes(snapshot.bytesReceived);
  const percent = snapshot.percent !== undefined ? `, ${Math.round(snapshot.percent)}%` : "";
  const speed = snapshot.speedBytesPerSecond !== undefined ? `, ${formatManagedDownloadBytes(snapshot.speedBytesPerSecond)}/s` : "";
  return `${snapshot.status}: ${size}${percent}${speed}`;
}

function managedDownloadStartInput(params: unknown): {
  url: string;
  destinationPath?: string;
  destinationKind?: "workspace" | "managed-install";
  overwrite?: boolean;
  expectedBytes?: number;
  sha256?: string;
  resume?: boolean;
  retryCount?: number;
} {
  const input = objectRecord(params);
  const rawDestinationKind = optionalString(input.destinationKind);
  if (rawDestinationKind && rawDestinationKind !== "workspace" && rawDestinationKind !== "managed-install") {
    throw new Error("destinationKind must be workspace or managed-install.");
  }
  const destinationKind = rawDestinationKind as "workspace" | "managed-install" | undefined;
  return {
    url: requiredString(input, "url").trim(),
    ...(optionalString(input.destinationPath) ? { destinationPath: optionalString(input.destinationPath) } : {}),
    ...(destinationKind ? { destinationKind } : {}),
    ...(optionalBoolean(input.overwrite) !== undefined ? { overwrite: optionalBoolean(input.overwrite) } : {}),
    ...(optionalNumber(input.expectedBytes) !== undefined ? { expectedBytes: optionalNumber(input.expectedBytes) } : {}),
    ...(optionalString(input.sha256) ? { sha256: optionalString(input.sha256) } : {}),
    ...(optionalBoolean(input.resume) !== undefined ? { resume: optionalBoolean(input.resume) } : {}),
    ...(optionalNumber(input.retryCount) !== undefined ? { retryCount: optionalNumber(input.retryCount) } : {}),
  };
}

function managedDownloadJobInput(params: unknown): { jobId: string } {
  const input = objectRecord(params);
  return { jobId: requiredString(input, "jobId").trim() };
}

function managedDownloadWaitInput(params: unknown): { jobId: string; heartbeatMs?: number } {
  const input = objectRecord(params);
  return {
    jobId: requiredString(input, "jobId").trim(),
    ...(optionalNumber(input.heartbeatMs) !== undefined ? { heartbeatMs: optionalNumber(input.heartbeatMs) } : {}),
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function formatManagedDownloadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
