import { describe, expect, it, vi } from "vitest";

import { registerPiExtensionSandboxInstallTool } from "./agentRuntimePiExtensionSandboxInstallTools";
import type { PiExtensionSandboxInstallPreview, PiExtensionSandboxPackageSummary } from "./piExtensionSandboxPackages";
import type { PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiExtensionSandboxInstallTools", () => {
  it("installs a sandboxed extension package after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({ installable: false }));
    const previewPiExtensionSandboxInstall = vi.fn(async () => previewFixture());
    const installPiExtensionSandboxPackage = vi.fn(async () => packageFixture());
    const scanPiPrivilegedPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const emit = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      previewPiExtensionSandboxInstall,
      installPiExtensionSandboxPackage,
      scanPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
      emit,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_extension_install_sandboxed"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("install", {
      source: "npm:pi-arxiv",
      allowedNetworkHosts: ["export.arxiv.org"],
      installRoute: rawRoute("npm:pi-arxiv", "pi-arxiv"),
    }, undefined, onUpdate);

    expect(previewAmbientCliPackagePiCatalogSource).toHaveBeenCalledWith("/workspace", "npm:pi-arxiv");
    expect(previewPiExtensionSandboxInstall).toHaveBeenCalledWith("/workspace", {
      source: "npm:pi-arxiv",
      allowedNetworkHosts: ["export.arxiv.org"],
    });
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_extension_install_sandboxed",
      title: "Install sandboxed Pi extension \"pi-arxiv\"?",
      message: "Ambient wants to install a Pi extension into the sandboxed compatibility host. Tool execution remains mediated by Ambient permissions.",
      detail: [
        "Workspace: /workspace",
        "Source: npm:pi-arxiv",
        "Repository: npm:pi-arxiv@1.0.0",
        "Package path: /tmp/pi-arxiv.tgz",
        "SHA: sha-extension",
        "Package: pi-arxiv",
        "Version: 1.0.0",
        "Entrypoint: index.ts",
        "Allowed network hosts: export.arxiv.org",
        "Tools: search_arxiv",
        "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
        "Effect: copy the pinned package into Ambient-managed Pi extension sandbox state.",
        "Route kind: raw-pi-exception",
        "Selected source: npm:pi-arxiv",
        "Target package: pi-arxiv",
        "Approval boundary: privileged-approval-required",
        "Route reason: User explicitly approved raw Pi compatibility install.",
      ].join("\n"),
      risk: "privileged-action",
      requireFreshPrompt: true,
      grantTargetLabel: "Install sandboxed Pi extension pi-arxiv",
      grantTargetIdentity: "ambient_pi_extension_install_sandboxed\0npm:pi-arxiv@1.0.0\0/tmp/pi-arxiv.tgz\0sha-extension\0export.arxiv.org",
      grantConditions: { installRoute: rawRoute("npm:pi-arxiv", "pi-arxiv") },
      allowedReason: "Sandboxed Pi extension install approved by Ambient permission grant policy.",
      deniedReason: "Sandboxed Pi extension install prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Installing sandboxed Pi extension from npm:pi-arxiv." }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_install_sandboxed",
        source: "npm:pi-arxiv",
        status: "installing",
      },
    });
    expect(installPiExtensionSandboxPackage).toHaveBeenCalledWith("/workspace", {
      source: "npm:pi-arxiv",
      allowedNetworkHosts: ["export.arxiv.org"],
    });
    expect(scanPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Sandboxed Pi extension installed",
          "Package: pi-arxiv",
          "Package id: pkg-extension",
          "Version: 1.0.0",
          "SHA: sha-extension",
          "Entrypoint: index.ts",
          "Allowed network hosts: export.arxiv.org",
          "Tools: search_arxiv",
          "Use ambient_pi_extension with this packageName and one of the listed tool names.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_install_sandboxed",
        packageId: "pkg-extension",
        packageName: "pi-arxiv",
        toolCount: 1,
        allowedNetworkHosts: ["export.arxiv.org"],
      },
    });
  });

  it("returns a privileged fallback scan when the sandbox preview is not installable", async () => {
    const registeredTools: RegisteredTool[] = [];
    const preview = previewFixture({
      installable: false,
      errors: ["Pi extension package did not register any tools."],
    });
    const scan = scanFixture();
    const scanPiPrivilegedPackage = vi.fn(async () => scan);
    const emit = vi.fn();
    const installPiExtensionSandboxPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({ installable: false })) as any,
      previewPiExtensionSandboxInstall: vi.fn(async () => preview),
      installPiExtensionSandboxPackage,
      scanPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
      emit,
    });

    const result = await registeredTools[0]!.execute("install", {
      source: "npm:pi-broken",
      installRoute: rawRoute("npm:pi-broken", "pi-arxiv"),
    }, undefined, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Sandboxed Pi extension install is blocked for npm:pi-broken; scanning privileged fallback instead." }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_install_sandboxed",
        source: "npm:pi-broken",
        packageName: "pi-arxiv",
        status: "sandbox-blocked",
        errors: ["Pi extension package did not register any tools."],
      },
    });
    expect(scanPiPrivilegedPackage).toHaveBeenCalledWith({
      source: "npm:pi-broken",
      scanOrigin: "sandbox-fallback",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "pi-privileged-scan-updated",
      source: "npm:pi-broken",
      scan,
      fallback: preview,
    });
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(installPiExtensionSandboxPackage).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Sandboxed Pi extension install blocked",
          "Package: pi-arxiv",
          "Entrypoint: index.ts",
          "Sandbox errors: Pi extension package did not register any tools.",
          "Privileged review required",
          "Scan origin: sandbox-fallback",
          "Recommendation: privileged-review-required",
          "Findings: 1",
          "No package was installed.",
          "If the user approves a disabled privileged install, call ambient_pi_privileged_install with the same source and scanOrigin \"sandbox-fallback\".",
          "fixture caveat",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_extension_install_sandboxed",
        fallbackToolName: "ambient_pi_privileged_install",
        source: "npm:pi-broken",
        packageName: "pi-arxiv",
        scanOrigin: "sandbox-fallback",
        status: "privileged-review-required",
        recommendation: "privileged-review-required",
        riskSummary: scan.riskSummary,
        errors: ["Pi extension package did not register any tools."],
      },
    });
  });

  it("returns a CLI adapter redirect instead of installing first-party catalog sources", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewPiExtensionSandboxInstall = vi.fn();
    const installPiExtensionSandboxPackage = vi.fn();
    const scanPiPrivilegedPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({
        installable: true,
        candidate: {
          name: "pi-arxiv",
          commands: [{ name: "search_arxiv" }],
        },
        resolution: {
          adapter: "pi-arxiv",
        },
      })) as any,
      previewPiExtensionSandboxInstall,
      installPiExtensionSandboxPackage,
      scanPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
      emit: vi.fn(),
    });

    const result = await registeredTools[0]!.execute("install", { source: "github:first-party/pi-arxiv" }, undefined, onUpdate);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(previewPiExtensionSandboxInstall).not.toHaveBeenCalled();
    expect(installPiExtensionSandboxPackage).not.toHaveBeenCalled();
    expect(scanPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Reviewed Ambient CLI adapter available");
    expect(result.details).toEqual(expect.objectContaining({
      runtime: "ambient-cli",
      toolName: "ambient_pi_extension_install_sandboxed",
      fallbackToolName: "ambient_cli_package_install_pi_catalog",
      source: "github:first-party/pi-arxiv",
      packageName: "pi-arxiv",
      commandNames: ["search_arxiv"],
      status: "first-party-cli-adapter-available",
      resolution: { adapter: "pi-arxiv" },
    }));
  });

  it("requires raw exception route metadata before previewing unwrapped sandbox installs", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewPiExtensionSandboxInstall = vi.fn();
    const scanPiPrivilegedPackage = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      latestInstallRouteLane: () => "pi-marketplace-privileged-review",
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({ installable: false })) as any,
      previewPiExtensionSandboxInstall,
      installPiExtensionSandboxPackage: vi.fn(),
      scanPiPrivilegedPackage,
      resolveFirstPartyPluginPermission: vi.fn(),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("install", { source: "npm:pi-custom" })).rejects.toThrow(
      "Raw Pi install route metadata is required for ambient_pi_extension_install_sandboxed.",
    );
    expect(previewPiExtensionSandboxInstall).not.toHaveBeenCalled();
    expect(scanPiPrivilegedPackage).not.toHaveBeenCalled();
  });

  it("rejects raw sandbox installs when the latest route selected a wrapper lane", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewPiExtensionSandboxInstall = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      latestInstallRouteLane: () => "pi-marketplace-generated-wrapper",
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({ installable: false })) as any,
      previewPiExtensionSandboxInstall,
      installPiExtensionSandboxPackage: vi.fn(),
      scanPiPrivilegedPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("install", {
      source: "npm:pi-custom",
      installRoute: rawRoute("npm:pi-custom"),
    })).rejects.toThrow("Latest ambient_install_route_plan lane must be \"pi-marketplace-privileged-review\"");
    expect(previewPiExtensionSandboxInstall).not.toHaveBeenCalled();
  });

  it("blocks sandboxed extension install in planner mode before validating input", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      previewPiExtensionSandboxInstall: vi.fn(),
      installPiExtensionSandboxPackage: vi.fn(),
      scanPiPrivilegedPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("install", {})).rejects.toThrow(
      "Sandboxed Pi extension installation is blocked in Planner Mode.",
    );
    expect(previewAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
  });

  it("stops before installing when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const installPiExtensionSandboxPackage = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({ installable: false })) as any,
      previewPiExtensionSandboxInstall: vi.fn(async () => previewFixture()),
      installPiExtensionSandboxPackage,
      scanPiPrivilegedPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("install", {
      source: "npm:pi-arxiv",
      installRoute: rawRoute("npm:pi-arxiv"),
    }, undefined, onUpdate)).rejects.toThrow(
      "Sandboxed Pi extension install blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(installPiExtensionSandboxPackage).not.toHaveBeenCalled();
  });
});

function rawRoute(source: string, targetPackage?: string) {
  return {
    routeKind: "raw-pi-exception",
    selectedSource: source,
    ...(targetPackage ? { targetPackage } : {}),
    approvalBoundary: "privileged-approval-required",
    reason: "User explicitly approved raw Pi compatibility install.",
  };
}

function previewFixture(overrides: Partial<PiExtensionSandboxInstallPreview> = {}): PiExtensionSandboxInstallPreview {
  return {
    source: "npm:pi-arxiv",
    resolvedSource: "npm:pi-arxiv@1.0.0",
    packagePath: "/tmp/pi-arxiv.tgz",
    sha: "sha-extension",
    packageName: "pi-arxiv",
    version: "1.0.0",
    entrypoint: "index.ts",
    allowedNetworkHosts: ["export.arxiv.org"],
    candidate: packageFixture(),
    installable: true,
    errors: [],
    ...overrides,
  };
}

function packageFixture(overrides: Partial<PiExtensionSandboxPackageSummary> = {}): PiExtensionSandboxPackageSummary {
  return {
    id: "pkg-extension",
    name: "pi-arxiv",
    version: "1.0.0",
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
    ...overrides,
  };
}

function scanFixture(overrides: Partial<PiPrivilegedSecurityScan> = {}): PiPrivilegedSecurityScan {
  return {
    source: "npm:pi-broken",
    scanOrigin: "sandbox-fallback",
    packageName: "pi-arxiv",
    version: "1.0.0",
    descriptorHash: "descriptor-hash",
    packageTreeHash: "package-tree-hash",
    fingerprint: "fingerprint",
    resources: {
      piExtensions: ["index.ts"],
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
      network: true,
      envOrSecrets: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    findings: [{
      severity: "warning",
      category: "network",
      message: "may use network",
      files: [],
    }],
    recommendation: "privileged-review-required",
    caveat: "fixture caveat",
    ...overrides,
  };
}
