import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  PiExtensionSandboxCatalog,
  PiPackageCatalog,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
} from "../../shared/pluginTypes";
import {
  RightPanelPluginPiPackagesPane,
  type RightPanelPluginPiPackagesPaneProps,
} from "./RightPanelPluginPiPackagesPane";

function baseProps(overrides: Partial<RightPanelPluginPiPackagesPaneProps> = {}): RightPanelPluginPiPackagesPaneProps {
  return {
    setSelectedPiPackageDetailId: vi.fn(),
    piPackageInstalling: false,
    piExtensionSandboxInstalling: false,
    piExtensionSandboxClearingHistory: false,
    piPrivilegedClearingHistory: false,
    piPrivilegedScanning: false,
    piPrivilegedInstalling: false,
    piPackageSourceInput: "",
    setPiPackageSourceInput: vi.fn(),
    piPackageInstallScope: "workspace",
    setPiPackageInstallScope: vi.fn(),
    permissionAudit: [],
    installPiPackage: vi.fn(),
    installPiExtensionSandboxPackage: vi.fn(),
    scanPiPrivilegedPackage: vi.fn(),
    installPiPrivilegedPackage: vi.fn(),
    uninstallPiPackage: vi.fn(),
    setPiPackageEnabled: vi.fn(),
    uninstallPiExtensionSandboxPackage: vi.fn(),
    clearPiExtensionSandboxHistory: vi.fn(),
    disablePiPrivilegedPackage: vi.fn(),
    uninstallPiPrivilegedPackage: vi.fn(),
    clearPiPrivilegedPackageHistory: vi.fn(),
    ...overrides,
  };
}

function piPackageCatalog(): PiPackageCatalog {
  return {
    packages: [
      {
        id: "pi-helpers",
        name: "pi-helpers",
        version: "1.0.0",
        description: "Pi helper package.",
        sourceKind: "workspace",
        sourceLabel: "Workspace",
        packageSpec: "npm:pi-helpers",
        installed: false,
        enabled: false,
        installScope: "workspace",
        keywords: [],
        dependencyStatus: {
          packageJsonPath: "/tmp/pi-helpers/package.json",
          required: true,
          installed: false,
          packageNames: ["yaml"],
          missingPackages: ["yaml"],
        },
        resourceCounts: {
          extension: 1,
          skill: 0,
          prompt: 0,
          theme: 0,
        },
        resources: [],
        compatibilityTier: "supported",
        compatibilityNotes: ["Ready for workspace install."],
        supportLabels: [],
        errors: [],
      },
    ],
    errors: [],
    sourceNotes: ["Workspace scan complete."],
  };
}

function sandboxCatalog(): PiExtensionSandboxCatalog {
  return {
    packages: [
      {
        id: "sandbox-helpers",
        name: "sandbox-helpers",
        version: "0.2.0",
        description: "Sandboxed helper package.",
        source: "npm:sandbox-helpers",
        resolvedSource: "npm:sandbox-helpers@0.2.0",
        packagePath: "/tmp/sandbox-helpers.tgz",
        sha: "sha-sandbox",
        rootPath: "/tmp/sandbox-helpers",
        entrypoint: "dist/index.js",
        allowedNetworkHosts: ["example.com"],
        tools: [
          {
            name: "browser_fetch",
            description: "Fetch pages",
          },
        ],
        installed: true,
        errors: [],
      },
    ],
    history: [],
    errors: [],
  };
}

function privilegedScan(): PiPrivilegedSecurityScan {
  return {
    source: "npm:privileged-helper",
    scanOrigin: "explicit",
    packageName: "privileged-helper",
    version: "3.0.0",
    description: "Privileged helper package.",
    descriptorHash: "descriptor-hash",
    packageTreeHash: "package-tree-hash",
    fingerprint: "abcdef1234567890",
    resources: {
      piExtensions: ["pi-extension.json"],
      piSkills: [],
      piPrompts: [],
      piThemes: [],
      bins: ["privileged-helper"],
      mcpServers: ["privileged-mcp"],
      hookConfigs: [],
    },
    riskSummary: {
      lifecycleHooks: false,
      commands: true,
      mcpServers: true,
      hostConfigMutation: false,
      filesystemWrites: false,
      homeDirectoryAccess: false,
      processExecution: true,
      network: true,
      envOrSecrets: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    findings: [
      {
        severity: "warning",
        category: "commands",
        message: "Command surface detected.",
        files: ["package.json"],
      },
    ],
    recommendation: "privileged-review-required",
    caveat: "Review before enabling.",
  };
}

function privilegedCatalog(scan: PiPrivilegedSecurityScan): PiPrivilegedCatalog {
  return {
    packages: [
      {
        id: "privileged-helper",
        source: scan.source,
        packageName: scan.packageName,
        version: scan.version,
        rootPath: "/tmp/privileged-helper",
        status: "disabled",
        installedAt: "2026-05-03T00:00:00.000Z",
        scan,
      },
    ],
    history: [],
    errors: [],
  };
}

describe("RightPanelPluginPiPackagesPane", () => {
  it("renders nothing before Pi package inspection has a catalog", () => {
    const html = renderToStaticMarkup(<RightPanelPluginPiPackagesPane {...baseProps()} />);

    expect(html).toBe("");
  });

  it("renders Pi package candidates, sandboxed tools, and privileged scan state", () => {
    const scan = privilegedScan();
    const html = renderToStaticMarkup(
      <RightPanelPluginPiPackagesPane
        {...baseProps({
          piPackageCatalog: piPackageCatalog(),
          piPackageSourceInput: "npm:privileged-helper",
          piExtensionSandboxCatalog: sandboxCatalog(),
          piPrivilegedScan: scan,
          piPrivilegedScanSource: "npm:privileged-helper",
          piPrivilegedCatalog: privilegedCatalog(scan),
        })}
      />,
    );

    expect(html).toContain("Pi Packages");
    expect(html).toContain("pi-helpers");
    expect(html).toContain("Missing yaml");
    expect(html).toContain("Sandboxed Pi Tools");
    expect(html).toContain("sandbox-helpers");
    expect(html).toContain("browser_fetch: Fetch pages");
    expect(html).toContain("Privileged Scan: privileged-helper");
    expect(html).toContain("Command surface detected.");
    expect(html).toContain("Install disabled keeps this package inactive");
    expect(html).toContain("Privileged Pi Installs");
    expect(html).toContain("Review before enabling.");
  });
});
