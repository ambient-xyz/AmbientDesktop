import { createHash } from "node:crypto";
import { mcpManagedFileExchangePermissionMount, type McpManagedFileExchange } from "./mcpManagedFileExchange";
import type { McpAutowireCandidate } from "./mcpAutowireFacade";

export function candidatePermissionProfile(candidate: McpAutowireCandidate, managedFileExchange?: McpManagedFileExchange): Record<string, unknown> {
  const network = candidate.permissions.network;
  const filesystem = candidate.permissions.filesystem;
  return {
    network: {
      outbound: {
        insecure_allow_all: network.mode === "broad",
        allow_host: network.allowHosts,
        allow_port: network.allowPorts,
      },
    },
    filesystem: {
      workspaceRead: filesystem.workspaceRead,
      workspaceWrite: filesystem.workspaceWrite,
      extraMounts: [
        ...filesystem.extraMounts,
        ...(managedFileExchange ? [mcpManagedFileExchangePermissionMount(managedFileExchange)] : []),
      ],
    },
  };
}

export function candidateHashMismatchBlocker(expected: string | undefined, actual: string | undefined): string[] {
  if (!expected || !actual || expected === actual) return [];
  return [`Candidate hash mismatch: expected ${expected}, got ${actual}. Re-run autowire plan or review the current candidate before proceeding.`];
}

export function normalizeMcpTransport(value: string | undefined): "stdio" | "streamable-http" | "sse" {
  if (value === "streamable-http" || value === "sse") return value;
  return "stdio";
}

export function normalizeRepositoryUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim();
  normalized = normalized.replace(/^git\+/, "").replace(/^github:/, "https://github.com/");
  normalized = normalized.replace(/^git@github\.com:/, "https://github.com/");
  normalized = normalized.replace(/\.git$/i, "");
  return normalized || undefined;
}

export function safeHostMountPath(value: string): boolean {
  if (
    value.length > 1_000 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    return false;
  }
  if (!value.startsWith("/")) return false;
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  if (["/", "/Users", "/private", "/tmp", "/var", "/System", "/Library"].includes(normalized)) return false;
  return !normalized.split("/").includes("..");
}

export function safeContainerMountPath(value: string): boolean {
  if (
    value.length > 240 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes(":") ||
    value.startsWith("-") ||
    looksSecretLike(value)
  ) {
    return false;
  }
  const normalized = value.replace(/\/+$/, "") || "/";
  return normalized.startsWith("/") && normalized !== "/" && !normalized.split("/").includes("..");
}

export function looksSecretLike(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/i.test(value);
}

export function ambientWorkloadName(serverId: string): string {
  return `ambient-${safeIdSegment(serverId).slice(0, 52)}-${sha256Hex(serverId).slice(0, 8)}`;
}

export function safeIdSegment(value: string): string {
  return value.toLowerCase().replace(/^io\.github\./, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "mcp-server";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
