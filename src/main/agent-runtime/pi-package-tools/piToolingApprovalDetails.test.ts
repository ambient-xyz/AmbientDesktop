import { describe, expect, it, vi } from "vitest";

import type { PiExtensionSandboxInstallPreview } from "./piExtensionSandboxPackages";
import type { PiPrivilegedSecurityScan } from "./piPrivilegedPackages";
import {
  createPiToolingApprovalDetailFormatter,
  formatPiExtensionSandboxInstallApprovalDetail,
  formatPiPrivilegedInstallApprovalDetail,
  formatPiResourceCountsForPermission,
} from "./piToolingApprovalDetails";

describe("piToolingApprovalDetails", () => {
  it("formats Pi package resource counts for permission prompts", () => {
    expect(formatPiResourceCountsForPermission({
      extension: 1,
      skill: 2,
      prompt: 3,
      theme: 4,
    })).toBe("extensions 1, skills 2, prompts 3, themes 4");
  });

  it("formats privileged install approval details with empty scan findings", () => {
    expect(formatPiPrivilegedInstallApprovalDetail(privilegedScan({ findings: [] }), "/workspace")).toBe([
      "Workspace: /workspace",
      "Package: privileged-pi",
      "Version: 1.2.3",
      "Source: ./privileged-pi",
      "Scan origin: explicit",
      "Fingerprint: fingerprint-1",
      "Recommendation: privileged-review-required",
      "Findings: 0",
      "- No high-risk patterns found by the heuristic scan.",
      "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
      "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
      "Heuristic scan only.",
    ].join("\n"));
  });

  it("formats privileged install approval details with scan findings", () => {
    expect(formatPiPrivilegedInstallApprovalDetail(privilegedScan({
      findings: [{
        severity: "high",
        category: "process",
        message: "spawns a subprocess",
        files: ["package.json"],
      }],
    }), "/workspace")).toContain("- [high] process: spawns a subprocess");
  });

  it("formats sandboxed extension install approval details", () => {
    expect(formatPiExtensionSandboxInstallApprovalDetail(sandboxPreview(), "/workspace")).toBe([
      "Workspace: /workspace",
      "Source: ./sandboxed-pi",
      "Repository: https://example.test/repo.git",
      "Package path: packages/tool",
      "SHA: abc123",
      "Package: sandboxed-pi",
      "Version: 0.1.0",
      "Entrypoint: index.js",
      "Allowed network hosts: api.example.test",
      "Tools: inspect, mutate",
      "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
      "Effect: copy the package into Ambient-managed Pi extension sandbox state.",
    ].join("\n"));
  });

  it("binds approval details to the current workspace lazily", () => {
    const workspacePath = vi.fn(() => "/workspace/latest");
    const formatter = createPiToolingApprovalDetailFormatter({ workspacePath });

    expect(formatter.formatPiResourceCountsForPermission({
      extension: 0,
      skill: 1,
      prompt: 0,
      theme: 0,
    })).toBe("extensions 0, skills 1, prompts 0, themes 0");
    expect(formatter.formatPiPrivilegedInstallApprovalDetail(privilegedScan())).toContain("Workspace: /workspace/latest");
    expect(formatter.formatPiExtensionSandboxInstallApprovalDetail(sandboxPreview({
      candidate: undefined,
      allowedNetworkHosts: [],
    }))).toContain("Allowed network hosts: none\nTools: none");
    expect(workspacePath).toHaveBeenCalledTimes(2);
  });
});

function sandboxPreview(overrides: Partial<PiExtensionSandboxInstallPreview> = {}): PiExtensionSandboxInstallPreview {
  return {
    source: "./sandboxed-pi",
    resolvedSource: "https://example.test/repo.git",
    packagePath: "packages/tool",
    sha: "abc123",
    packageName: "sandboxed-pi",
    version: "0.1.0",
    entrypoint: "index.js",
    allowedNetworkHosts: ["api.example.test"],
    candidate: {
      id: "sandboxed-pi",
      name: "sandboxed-pi",
      source: "./sandboxed-pi",
      resolvedSource: "https://example.test/repo.git",
      packagePath: "packages/tool",
      sha: "abc123",
      rootPath: "/workspace/.ambient/pi-extension-sandboxes/sandboxed-pi",
      entrypoint: "index.js",
      allowedNetworkHosts: ["api.example.test"],
      tools: [{ name: "inspect" }, { name: "mutate" }],
      installed: false,
      errors: [],
    },
    installable: true,
    errors: [],
    ...overrides,
  };
}

function privilegedScan(overrides: Partial<PiPrivilegedSecurityScan> = {}): PiPrivilegedSecurityScan {
  return {
    source: "./privileged-pi",
    scanOrigin: "explicit",
    packageName: "privileged-pi",
    version: "1.2.3",
    fingerprint: "fingerprint-1",
    resources: {
      piExtensions: [],
      piSkills: [],
      piPrompts: [],
      piThemes: [],
      bins: [],
      mcpServers: [],
      hookConfigs: [],
    },
    riskSummary: {
      lifecycleHooks: false,
      commands: false,
      mcpServers: false,
      hostConfigMutation: false,
      filesystemWrites: false,
      homeDirectoryAccess: false,
      processExecution: false,
      network: false,
      envOrSecrets: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    findings: [],
    recommendation: "privileged-review-required",
    caveat: "Heuristic scan only.",
    ...overrides,
  };
}
