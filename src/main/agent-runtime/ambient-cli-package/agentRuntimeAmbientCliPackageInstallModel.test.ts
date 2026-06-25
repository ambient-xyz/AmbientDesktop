import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  ambientCliPackageInstallApprovalDetail,
  ambientCliPackageInstallInput,
  ambientCliPackageInstallParams,
  ambientCliPackageInstallRequiresPinnedSource,
  ambientCliPackageInstallText,
  ambientCliPackagePiCatalogInstallApprovalDetail,
  ambientCliPackagePiCatalogInstallInput,
  ambientCliPackagePiCatalogInstallText,
  ambientCliPackagePreviewInput,
  ambientCliPackagePreviewText,
  ambientCliSummaryHydrationText,
  cliPackageInstallGrantIdentity,
  cliPackagePiCatalogInstallGrantIdentity,
  stableJson,
} from "./agentRuntimeAmbientCliPackageInstallModel";

describe("agentRuntimeAmbientCliPackageInstallModel", () => {
  it("parses install and preview input", () => {
    const descriptor = { name: "ambient-demo" };

    expect(ambientCliPackageInstallParams({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    })).toEqual({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    });

    expect(ambientCliPackagePreviewInput({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    })).toEqual({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    });

    expect(ambientCliPackagePreviewInput({
      source: "local-package",
      path: "",
      ref: "",
      sha: "",
      installDependencies: false,
    })).toEqual({
      source: "local-package",
    });

    expect(() => ambientCliPackagePreviewInput({ source: " " })).toThrow("source is required.");
    expect(() => ambientCliPackagePreviewInput({ source: "local-package", descriptor: [] })).toThrow("Expected an object.");
    expect(ambientCliPackagePiCatalogInstallInput({ source: "@pi/demo" })).toBe("@pi/demo");
    expect(() => ambientCliPackagePiCatalogInstallInput({ source: " " })).toThrow("source is required.");
    expect(cliPackagePiCatalogInstallGrantIdentity({
      source: "@pi/demo",
      preview: piCatalogPreviewFixture(),
    })).toBe("ambient_cli_package_install_pi_catalog\0@pi/demo\0sha-123\0deps=none\0{\"args\":[\"demo.js\"],\"command\":\"node\",\"cwd\":\"package\",\"healthCheck\":[],\"name\":\"demo\"}");
    expect(cliPackagePiCatalogInstallGrantIdentity({
      source: "@pi/demo",
      preview: { ...piCatalogPreviewFixture(), resolution: undefined },
    })).toBe("ambient_cli_package_install_pi_catalog\0@pi/demo\0unknown\0deps=none\0{\"args\":[\"demo.js\"],\"command\":\"node\",\"cwd\":\"package\",\"healthCheck\":[],\"name\":\"demo\"}");
  });

  it("builds install input, approval detail, and stable grant identity", () => {
    const preview = installPreviewFixture();
    const descriptor = { name: "ambient-demo", metadata: { z: 2, a: 1 } };

    expect(ambientCliPackageInstallInput({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    })).toEqual({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    });

    expect(ambientCliPackageInstallApprovalDetail(workspaceFixture(), preview)).toBe([
      "Workspace: /workspace",
      "Source: https://example.com/repo.git",
      "Path: packages/demo",
      "Ref: main",
      "SHA: abc123",
      "Content hash: content-hash-123",
      "Package: ambient-demo",
      "Commands: demo",
      "Skills: demo-skill",
      "Dependencies: installed via pnpm install",
      "Env requirements: DEMO_KEY=missing",
      "Health checks: 1",
      "Effect: copy package into Ambient-managed CLI package state.",
    ].join("\n"));

    expect(cliPackageInstallGrantIdentity({
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
      preview,
    })).toBe([
      "ambient_cli_package_install",
      "https://example.com/repo.git",
      "packages/demo",
      "main",
      "abc123",
      "content-hash-123",
      "install-dependencies",
      "ambient-demo",
      "0.0.0",
      "{\"args\":[\"demo.js\"],\"command\":\"node\",\"cwd\":\"package\",\"healthCheck\":[],\"name\":\"demo\"}",
      "demo-skill",
      "{\"metadata\":{\"a\":1,\"z\":2},\"name\":\"ambient-demo\"}",
    ].join("\0"));
  });

  it("formats Pi catalog approval detail with reviewed resolution metadata", () => {
    expect(ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), piCatalogPreviewFixture())).toBe([
      "Workspace: /workspace",
      "Source: @pi/demo",
      "npm: @pi/demo@1.2.3",
      "Repository: https://example.com/repo.git",
      "Repository path: packages/demo",
      "SHA: sha-123",
      "Package: ambient-demo",
      "Commands: demo",
      "Skills: demo-skill",
      "Dependencies: not installed; the reviewed Ambient adapter uses only Node built-ins and fetch.",
      "Security scan:\n- adapter source reviewed\n- no dynamic imports",
      "Health checks: 1",
      "Effect: copy reviewed package source plus a first-party Ambient CLI adapter into Ambient-managed CLI package state.",
    ].join("\n"));
  });

  it("discloses Pi catalog dependency installation before approval", () => {
    const preview = {
      ...piCatalogPreviewFixture(),
      dependencyInstall: {
        manager: "npm",
        command: ["npm", "ci", "--ignore-scripts"],
        cwd: "/tmp/pi-catalog-preview",
        attempted: false,
        passed: true,
        skipped: true,
        reason: "Dependency installation is not run during package preview. If approved, install runs dependencies before copying the package.",
      },
      resolution: {
        ...piCatalogPreviewFixture().resolution,
        installDependencies: true,
      },
    };

    expect(ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), preview)).toContain(
      "Dependencies: approved install will run npm ci --ignore-scripts.",
    );
    expect(ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), preview)).toContain(
      "Dependency note: Dependency installation is not run during package preview. If approved, install runs dependencies before copying the package.",
    );
    expect(ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), preview)).not.toContain(
      "uses only Node built-ins and fetch",
    );
  });

  it("discloses local dependency installation before approval when preview deferred it", () => {
    const preview = {
      ...installPreviewFixture(),
      dependencyInstall: {
        manager: "npm",
        command: ["npm", "ci", "--ignore-scripts"],
        cwd: "/workspace/packages/demo",
        attempted: false,
        passed: true,
        skipped: true,
        reason: "Dependency installation is not run during package preview. If approved, install runs dependencies before copying the package.",
      },
    };

    const approval = ambientCliPackageInstallApprovalDetail(workspaceFixture(), preview);
    expect(approval).toContain("Dependencies: approved install will run npm ci --ignore-scripts.");
    expect(approval).not.toContain("Dependencies: skipped via npm ci --ignore-scripts");
  });

  it("discloses declared install-time health checks when preview did not execute them", () => {
    const preview = {
      ...installPreviewFixture(),
      healthChecks: [],
      candidate: packageFixture({
        installed: false,
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "package",
            healthCheck: ["node", "demo.js", "health"],
          },
        ],
      }),
    };

    expect(ambientCliPackageInstallApprovalDetail(workspaceFixture(), preview)).toContain(
      "Health checks: not run during preview; approved install will run 1 declared package-controlled health check before completion",
    );
    expect(ambientCliPackageInstallApprovalDetail(workspaceFixture(), preview)).toContain(
      "Health check commands: demo: node demo.js health",
    );
    expect(
      ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), {
        ...preview,
        source: "@pi/demo",
        resolution: piCatalogPreviewFixture().resolution,
      }),
    ).toContain(
      "Health checks: not run during preview; approved install will run 1 declared package-controlled health check before completion",
    );
    expect(
      ambientCliPackagePiCatalogInstallApprovalDetail(workspaceFixture(), {
        ...preview,
        source: "@pi/demo",
        resolution: piCatalogPreviewFixture().resolution,
      }),
    ).toContain("Health check commands: demo: node demo.js health");
  });

  it("binds persistent install grant identities to declared health-check commands", () => {
    const descriptor = { name: "ambient-demo" };
    const safePreview = {
      ...installPreviewFixture(),
      healthChecks: [],
      candidate: packageFixture({
        installed: false,
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "package",
            healthCheck: ["node", "demo.js", "health"],
          },
        ],
      }),
    };
    const changedPreview = {
      ...safePreview,
      candidate: packageFixture({
        installed: false,
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "package",
            healthCheck: ["node", "changed-health.js"],
          },
        ],
      }),
    };

    const baseInput = {
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    };

    expect(cliPackageInstallGrantIdentity({ ...baseInput, preview: safePreview })).not.toBe(
      cliPackageInstallGrantIdentity({ ...baseInput, preview: changedPreview }),
    );
    expect(cliPackagePiCatalogInstallGrantIdentity({
      source: "@pi/demo",
      preview: {
        ...safePreview,
        source: "@pi/demo",
        resolution: piCatalogPreviewFixture().resolution,
      },
    })).not.toBe(cliPackagePiCatalogInstallGrantIdentity({
      source: "@pi/demo",
      preview: {
        ...changedPreview,
        source: "@pi/demo",
        resolution: piCatalogPreviewFixture().resolution,
      },
    }));
  });

  it("binds Pi catalog install grant identities to dependency install behavior", () => {
    const basePreview = piCatalogPreviewFixture();
    const dependencyPreview = {
      ...basePreview,
      dependencyInstall: {
        manager: "npm",
        command: ["npm", "ci", "--ignore-scripts"],
        cwd: "/tmp/pi-catalog-preview",
        attempted: false,
        passed: true,
        skipped: true,
      },
      resolution: {
        ...basePreview.resolution,
        installDependencies: true,
      },
    };

    expect(cliPackagePiCatalogInstallGrantIdentity({ source: "@pi/demo", preview: basePreview })).not.toBe(
      cliPackagePiCatalogInstallGrantIdentity({ source: "@pi/demo", preview: dependencyPreview }),
    );
  });

  it("serializes health-check grant identities without delimiter collisions", () => {
    const descriptor = { name: "ambient-demo" };
    const previewA = {
      ...installPreviewFixture(),
      candidate: packageFixture({
        installed: false,
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "package",
            healthCheck: ["node\u0001safe"],
          },
        ],
      }),
    };
    const previewB = {
      ...installPreviewFixture(),
      candidate: packageFixture({
        installed: false,
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "package",
            healthCheck: ["node", "safe"],
          },
        ],
      }),
    };
    const baseInput = {
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor,
      installDependencies: true,
    };

    expect(cliPackageInstallGrantIdentity({ ...baseInput, preview: previewA })).not.toBe(
      cliPackageInstallGrantIdentity({ ...baseInput, preview: previewB }),
    );
  });

  it("requires pinned sources for installs that run package-controlled install code", () => {
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "local-package",
      sha: undefined,
      installDependencies: true,
      preview: installPreviewFixture(),
    })).toBe(true);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "local-package",
      sha: undefined,
      installDependencies: false,
      preview: {
        ...installPreviewFixture(),
        healthChecks: [],
        candidate: packageFixture({
          installed: false,
          commands: [
            {
              name: "demo",
              description: "Run demo.",
              command: "node",
              args: ["demo.js"],
              cwd: "package",
              healthCheck: ["node", "demo.js", "health"],
            },
          ],
        }),
      },
    })).toBe(false);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "https://example.com/repo.git",
      sha: "abc123",
      installDependencies: true,
      preview: installPreviewFixture(),
    })).toBe(false);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "local-package",
      sha: undefined,
      installDependencies: false,
      preview: {
        ...installPreviewFixture(),
        healthChecks: [],
        candidate: packageFixture({
          installed: false,
          source: "bundled:ambient-demo",
          commands: [
            {
              name: "demo",
              description: "Run demo.",
              command: "node",
              args: ["demo.js"],
              cwd: "package",
              healthCheck: ["node", "demo.js", "health"],
            },
          ],
        }),
      },
    })).toBe(false);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "bundled:ambient-demo",
      sha: undefined,
      installDependencies: false,
      preview: {
        ...installPreviewFixture(),
        healthChecks: [],
        candidate: packageFixture({
          installed: false,
          source: "bundled:ambient-demo",
          commands: [
            {
              name: "demo",
              description: "Run demo.",
              command: "node",
              args: ["demo.js"],
              cwd: "package",
              healthCheck: ["node", "demo.js", "health"],
            },
          ],
        }),
      },
    })).toBe(false);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "local-package",
      sha: undefined,
      installDependencies: false,
      preview: {
        ...installPreviewFixture(),
        dependencyInstall: undefined,
        healthChecks: [],
      },
    })).toBe(false);
    expect(ambientCliPackageInstallRequiresPinnedSource({
      source: "local-package",
      sha: undefined,
      installDependencies: true,
      preview: {
        ...installPreviewFixture(),
        dependencyInstall: {
          manager: "npm",
          passed: true,
          attempted: false,
          skipped: true,
          command: ["npm", "ci", "--ignore-scripts"],
          cwd: "/workspace/packages/demo",
          reason: "No package dependencies declared.",
        },
        healthChecks: [],
      },
    })).toBe(false);
  });

  it("formats Pi catalog install result text with hydration and security metadata", () => {
    expect(ambientCliPackagePiCatalogInstallText({
      pkg: packageFixture(),
      summaryHydration: {
        attempted: true,
        reason: "hydrated after install",
        availableCount: 1,
        failedCount: 0,
        summaryStatuses: [
          { skillName: "demo-skill", status: "available" },
        ],
      } as any,
      resolution: piCatalogPreviewFixture().resolution,
    })).toBe([
      "Ambient CLI package installed",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Description: Generated demo package.",
      "Commands: demo",
      "Skills: demo-skill",
      "Declared commands are available immediately through ambient_cli. Use ambient_cli_search and ambient_cli_describe for package instructions; Ambient CLI skills are not mounted into every Pi session by default.",
      "",
      "Ambient CLI summary hydration",
      "Attempted: yes",
      "Reason: hydrated after install",
      "Available summaries: 1/1",
      "- demo-skill: available",
      "",
      "Security scan:\n- adapter source reviewed\n- no dynamic imports",
      "",
      "Use ambient_cli_describe with packageName \"ambient-demo\" before first execution, then ambient_cli with one of: demo.",
    ].join("\n"));

    expect(ambientCliPackagePiCatalogInstallText({
      pkg: packageFixture(),
      installText: () => "Custom install text.",
    })).toBe([
      "Custom install text.",
      "Use ambient_cli_describe with packageName \"ambient-demo\" before first execution, then ambient_cli with one of: demo.",
    ].join("\n\n"));
  });

  it("formats install preview text", () => {
    expect(ambientCliPackagePreviewText(installPreviewFixture())).toBe([
      "Ambient CLI package preview",
      "Source: https://example.com/repo.git",
      "Path: packages/demo",
      "Ref: main",
      "SHA: abc123",
      "Content hash: content-hash-123",
      "Package: ambient-demo",
      "Description: Generated demo package.",
      "Commands: demo",
      "Skills: demo-skill",
      "Dependencies: installed via pnpm install",
      "Env requirements: DEMO_KEY=missing",
      "Health checks: 1",
      "Installable: yes",
    ].join("\n"));
  });

  it("formats install and summary hydration result text", () => {
    expect(ambientCliPackageInstallText(packageFixture())).toBe([
      "Ambient CLI package installed",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Description: Generated demo package.",
      "Commands: demo",
      "Skills: demo-skill",
      "Declared commands are available immediately through ambient_cli. Use ambient_cli_search and ambient_cli_describe for package instructions; Ambient CLI skills are not mounted into every Pi session by default.",
    ].join("\n"));

    expect(ambientCliSummaryHydrationText({
      attempted: true,
      reason: "hydrated after install",
      availableCount: 1,
      failedCount: 1,
      summaryStatuses: [
        { skillName: "demo-skill", status: "available" },
        { skillName: "broken-skill", status: "failed", error: "timeout", retryAfter: "next run" },
      ],
    } as any)).toBe([
      "Ambient CLI summary hydration",
      "Attempted: yes",
      "Reason: hydrated after install",
      "Available summaries: 1/2",
      "Failed summaries: 1",
      "- demo-skill: available",
      "- broken-skill: failed (timeout) retry after next run",
    ].join("\n"));
  });

  it("serializes nested descriptor objects with stable key ordering", () => {
    expect(stableJson({ b: [2, { d: 4, c: 3 }], a: 1 })).toBe("{\"a\":1,\"b\":[2,{\"c\":3,\"d\":4}]}");
  });
});

function workspaceFixture(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function installPreviewFixture(): any {
  return {
    source: "https://example.com/repo.git",
    path: "packages/demo",
    ref: "main",
    sha: "abc123",
    contentHash: "content-hash-123",
    candidate: packageFixture({ installed: false }),
    dependencyInstall: {
      manager: "npm",
      passed: true,
      attempted: true,
      skipped: false,
      command: ["pnpm", "install"],
      cwd: "/workspace/packages/demo",
    },
    envStatus: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
    ],
    healthChecks: [
      {
        commandName: "demo",
        command: ["node", "demo.js"],
        cwd: "/workspace/packages/demo",
        passed: true,
      },
    ],
    installable: true,
    errors: [],
  };
}

function piCatalogPreviewFixture(): any {
  return {
    source: "@pi/demo",
    candidate: packageFixture({ installed: false, source: "@pi/demo" }),
    dependencyInstall: undefined,
    envStatus: [],
    healthChecks: [
      {
        commandName: "demo",
        command: ["node", "demo.js"],
        cwd: "/workspace/.ambient/cli-packages/ambient-demo",
        passed: true,
      },
    ],
    installable: true,
    errors: [],
    resolution: {
      source: "@pi/demo",
      npmPackageName: "@pi/demo",
      npmVersion: "1.2.3",
      repositoryUrl: "https://example.com/repo.git",
      repositoryDirectory: "packages/demo",
      sha: "sha-123",
      adapter: "ambient-demo",
      securityScan: ["adapter source reviewed", "no dynamic imports"],
    },
  };
}

function packageFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "pkg-123",
    name: "ambient-demo",
    version: "0.0.0",
    description: "Generated demo package.",
    rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
    source: "https://example.com/repo.git",
    installed: true,
    skills: [
      {
        name: "demo-skill",
        description: "Use demo.",
        path: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
      },
    ],
    commands: [
      {
        name: "demo",
        description: "Run demo.",
        command: "node",
        args: ["demo.js"],
        cwd: "package",
      },
    ],
    env: [],
    errors: [],
    ...overrides,
  };
}
