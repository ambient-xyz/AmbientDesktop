import { describe, expect, it, vi } from "vitest";

import {
  registerPiExtensionSandboxHistoryTool,
  registerPiPrivilegedHistoryTool,
  type PiExtensionSandboxHistoryToolRegistrationOptions,
  type PiPrivilegedHistoryToolRegistrationOptions,
} from "./agentRuntimePiPackageHistoryTools";
import type { PiExtensionSandboxCatalog } from "./piExtensionSandboxPackages";
import type { PiPrivilegedCatalog, PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPackageHistoryTools", () => {
  it("registers sandboxed extension and privileged package history tools", async () => {
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn(async () => extensionCatalogFixture());
    const discoverPiPrivilegedPackages = vi.fn(async () => privilegedCatalogFixture());

    const pi = {
      registerTool: (tool: any) => registeredTools.push(tool),
    };

    registerPiExtensionSandboxHistoryTool(pi, extensionOptions({
      discoverPiExtensionSandboxPackages,
    }));
    registerPiPrivilegedHistoryTool(pi, privilegedOptions({
      discoverPiPrivilegedPackages,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_pi_extension_history",
      "ambient_pi_privileged_history",
    ]);
    expect(registeredTools.map((tool) => tool.executionMode)).toEqual(["sequential", "sequential"]);

    const extensionResult = await registeredTools[0]!.execute("extension-history", {});
    expect(discoverPiExtensionSandboxPackages).toHaveBeenCalledWith("/workspace");
    expect(extensionResult.content[0].text).toContain("Sandboxed Pi extension history");
    expect(extensionResult.content[0].text).toContain("- pi-arxiv (pkg-extension); tools: search_arxiv");
    expect(extensionResult.details).toEqual({
      runtime: "pi-extension-sandbox",
      toolName: "ambient_pi_extension_history",
      installedCount: 1,
      historyCount: 1,
      errors: ["extension catalog warning"],
    });

    const privilegedResult = await registeredTools[1]!.execute("privileged-history", {});
    expect(discoverPiPrivilegedPackages).toHaveBeenCalledWith("/workspace");
    expect(privilegedResult.content[0].text).toContain("Privileged Pi package history");
    expect(privilegedResult.content[0].text).toContain("- pi-ffmpeg (pkg-privileged); status: active; scanOrigin: explicit");
    expect(privilegedResult.details).toEqual({
      runtime: "pi-privileged",
      toolName: "ambient_pi_privileged_history",
      installedCount: 1,
      historyCount: 1,
      errors: ["privileged catalog warning"],
    });
  });
});

function extensionOptions(
  overrides: Partial<PiExtensionSandboxHistoryToolRegistrationOptions> = {},
): PiExtensionSandboxHistoryToolRegistrationOptions {
  return {
    workspace: { path: "/workspace" },
    ...overrides,
  };
}

function privilegedOptions(
  overrides: Partial<PiPrivilegedHistoryToolRegistrationOptions> = {},
): PiPrivilegedHistoryToolRegistrationOptions {
  return {
    workspace: { path: "/workspace" },
    ...overrides,
  };
}

function extensionCatalogFixture(): PiExtensionSandboxCatalog {
  return {
    packages: [
      {
        id: "pkg-extension",
        name: "pi-arxiv",
        source: "npm:pi-arxiv",
        resolvedSource: "npm:pi-arxiv@1.0.0",
        packagePath: "/tmp/pi-arxiv.tgz",
        sha: "sha-extension",
        rootPath: "/workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv",
        entrypoint: "index.ts",
        allowedNetworkHosts: ["export.arxiv.org"],
        tools: [{ name: "search_arxiv" }],
        installed: true,
        errors: [],
      },
    ],
    history: [
      {
        id: "pkg-extension-old",
        name: "pi-arxiv-old",
        source: "npm:pi-arxiv-old",
        resolvedSource: "npm:pi-arxiv-old@0.1.0",
        packagePath: "/tmp/pi-arxiv-old.tgz",
        sha: "sha-extension-old",
        rootPath: "/workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv-old",
        entrypoint: "index.ts",
        allowedNetworkHosts: [],
        tools: [],
        installed: false,
        errors: [],
        removedAt: "2026-06-10T00:00:00.000Z",
        removalReason: "user",
      },
    ],
    errors: ["extension catalog warning"],
  };
}

function privilegedCatalogFixture(): PiPrivilegedCatalog {
  return {
    packages: [
      {
        id: "pkg-privileged",
        source: "npm:pi-ffmpeg",
        packageName: "pi-ffmpeg",
        rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
        status: "active",
        installedAt: "2026-06-10T00:00:00.000Z",
        scan: privilegedScanFixture(),
      },
    ],
    history: [
      {
        id: "pkg-privileged-old",
        source: "npm:pi-ffmpeg-old",
        packageName: "pi-ffmpeg-old",
        rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg-old",
        status: "disabled",
        installedAt: "2026-06-09T00:00:00.000Z",
        scan: privilegedScanFixture({ packageName: "pi-ffmpeg-old" }),
        removedAt: "2026-06-10T00:00:00.000Z",
        manualCleanup: ["/workspace/manual"],
      },
    ],
    errors: ["privileged catalog warning"],
  };
}

function privilegedScanFixture(
  overrides: Partial<PiPrivilegedSecurityScan> = {},
): PiPrivilegedSecurityScan {
  return {
    source: "npm:pi-ffmpeg",
    scanOrigin: "explicit",
    packageName: "pi-ffmpeg",
    fingerprint: "fingerprint",
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
    caveat: "fixture",
    ...overrides,
  };
}
