import { describe, expect, it, vi } from "vitest";

import {
  registerPluginInstallPlanningTools,
  registerPluginInstallPreviewTool,
} from "./agentRuntimePluginInstallReadOnlyTools";

describe("agentRuntimePluginInstallReadOnlyTools", () => {
  it("registers install route, runtime preflight, and setup recipe tools with injected services", async () => {
    const workspace = { path: "/tmp/ambient-plugin-readonly-planning" };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const recordedPlans: any[] = [];
    const runSetupRuntimePreflight = vi.fn(async (input: any) => setupRuntimePreflightFixture(input.workspacePath));
    const describeSetupRecipe = vi.fn(async (input: any) => setupRecipeDescribeFixture(input.workspacePath));

    registerPluginInstallPlanningTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      recordInstallRoutePlan: (plan) => recordedPlans.push(plan),
      discoverAmbientCliPackages: vi.fn(async () => ({
        packages: [
          {
            name: "ambient-cli-demo",
            commands: [{ name: "demo" }],
            skills: [{ name: "demo-skill" }],
          },
        ],
        errors: [],
      } as any)),
      runSetupRuntimePreflight,
      describeSetupRecipe,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_install_route_plan",
      "ambient_setup_runtime_preflight",
      "ambient_setup_recipe_describe",
    ]);

    const routeResult = await registeredTools[0].execute("route", {
      userRequest: "Set up this Docker Compose app.",
      requestedKind: "desktop-app",
    });
    expect(routeResult.details).toMatchObject({
      runtime: "ambient-install-route",
      toolName: "ambient_install_route_plan",
      status: "planned",
    });
    expect(recordedPlans).toHaveLength(1);
    expect(routeResult.details.installRouteSummary).toBeTruthy();
    expect(routeResult.details.installRouteTelemetry).toBeTruthy();

    const preflightUpdates: any[] = [];
    const preflightResult = await registeredTools[1].execute(
      "preflight",
      { packageManager: "pnpm" },
      undefined,
      (update: any) => preflightUpdates.push(update),
    );
    expect(runSetupRuntimePreflight).toHaveBeenCalledWith({
      workspacePath: workspace.path,
      packageManager: "pnpm",
    });
    expect(preflightUpdates[0].details).toMatchObject({
      runtime: "ambient-setup-runtime-preflight",
      status: "running",
      packageManager: "pnpm",
    });
    expect(preflightResult.details).toMatchObject({
      runtime: "ambient-setup-runtime-preflight",
      status: "complete",
      workspacePath: workspace.path,
      selectedPackageManager: "pnpm",
      selectedPackageManagerArch: "arm64",
    });

    const recipeUpdates: any[] = [];
    const recipeResult = await registeredTools[2].execute(
      "recipe",
      { recipe: "containerized_app", includeHostPreflight: false, includePortProbe: true },
      undefined,
      (update: any) => recipeUpdates.push(update),
    );
    expect(describeSetupRecipe).toHaveBeenCalledWith({
      workspacePath: workspace.path,
      recipe: "containerized_app",
      includeHostPreflight: false,
      includePortProbe: true,
    });
    expect(recipeUpdates[0].details).toMatchObject({
      runtime: "ambient-setup-recipe-describe",
      status: "running",
      recipe: "containerized_app",
    });
    expect(recipeResult.details).toMatchObject({
      runtime: "ambient-setup-recipe-describe",
      status: "complete",
      workspacePath: workspace.path,
      active: true,
      containerFiles: ["docker-compose.yml"],
      packageScripts: ["dev"],
      existingContainerCount: 1,
    });
  });

  it("registers plugin install preview as a read-only plugin host call", async () => {
    const workspace = { path: "/tmp/ambient-plugin-readonly-preview" };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewCodexPluginInstall = vi.fn(async () => pluginInstallPreviewFixture());

    registerPluginInstallPreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      previewCodexPluginInstall,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_plugin_install_preview"]);

    const updates: any[] = [];
    const result = await registeredTools[0].execute(
      "preview",
      { source: "/tmp/marketplace.json", name: "demo-plugin" },
      undefined,
      (update: any) => updates.push(update),
    );

    expect(previewCodexPluginInstall).toHaveBeenCalledWith(workspace.path, {
      source: "/tmp/marketplace.json",
      name: "demo-plugin",
    });
    expect(updates[0].details).toMatchObject({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_preview",
      status: "running",
      source: "/tmp/marketplace.json",
    });
    expect(result.content[0].text).toContain("Plugin install preview");
    expect(result.content[0].text).toContain("Demo Plugin");
    expect(result.details).toMatchObject({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_preview",
      source: "/tmp/marketplace.json",
      marketplaceSourceCount: 1,
      candidateCount: 1,
      installableCount: 1,
      errorCount: 0,
    });
  });
});

function setupRuntimePreflightFixture(workspacePath: string): any {
  const selectedPackageManager = {
    name: "pnpm",
    requested: true,
    inferredFrom: ["packageManager"],
    available: true,
    path: "/opt/homebrew/bin/pnpm",
    version: "10.0.0",
    binaryKind: "script-or-shim",
    architecture: "arm64",
  };
  return {
    workspacePath,
    host: {
      platform: "darwin",
      processArch: "arm64",
      machineArch: "arm64",
      release: "25.0.0",
    },
    ambientProcess: {
      execPath: "/usr/local/bin/node",
      nodeVersion: "v22.0.0",
      arch: "arm64",
      platform: "darwin",
    },
    shell: {
      path: "/bin/zsh",
    },
    packageMetadata: {
      packageManager: "pnpm@10.0.0",
      lockfiles: ["pnpm-lock.yaml"],
      nativeDependencySignals: ["esbuild"],
      nativeScriptSignals: [],
      packageJsonFound: true,
    },
    projectNode: {
      available: true,
      command: "node",
      version: "v22.0.0",
      arch: "arm64",
      execPath: "/opt/homebrew/bin/node",
    },
    packageManagers: [selectedPackageManager],
    selectedPackageManager,
    warnings: [],
  };
}

function setupRecipeDescribeFixture(workspacePath: string): any {
  return {
    schemaVersion: "ambient-setup-recipe-describe-v1",
    recipe: "containerized_app",
    workspacePath,
    activation: {
      active: true,
      confidence: "high",
      signals: ["docker-compose.yml"],
    },
    projectName: "ambient-plugin-readonly",
    containerFiles: [
      {
        path: "docker-compose.yml",
        kind: "compose",
        serviceCount: 1,
        services: ["web"],
      },
    ],
    packageScripts: [
      {
        name: "dev",
        command: "docker compose up",
      },
    ],
    portBindings: [
      {
        sourcePath: "docker-compose.yml",
        service: "web",
        hostPort: 3000,
        containerPort: 3000,
        protocol: "tcp",
        raw: "3000:3000",
      },
    ],
    portConflicts: [],
    composeCommands: [
      {
        command: "docker",
        args: ["compose", "version"],
        available: true,
        message: "Docker Compose is available.",
      },
    ],
    hostPreflight: [
      {
        kind: "docker",
        status: "ready",
        message: "Docker is running.",
      },
    ],
    existingContainers: [
      {
        runtime: "docker",
        name: "ambient-plugin-readonly-web-1",
        status: "running",
      },
    ],
    warnings: [],
    nextActions: ["Run docker compose up."],
  };
}

function pluginInstallPreviewFixture(): any {
  return {
    source: "/tmp/marketplace.json",
    marketplaceSources: [
      {
        id: "local-marketplace",
        label: "Local marketplace",
        source: "/tmp/marketplace.json",
        kind: "local",
        pluginCount: 1,
        contentChecksum: "abc123",
      },
    ],
    candidates: [
      {
        id: "demo-plugin",
        name: "demo-plugin",
        displayName: "Demo Plugin",
        version: "1.0.0",
        description: "Demo plugin.",
        marketplaceName: "local",
        marketplacePath: "/tmp/marketplace.json",
        rootPath: "/tmp/demo-plugin",
        sourceKind: "git",
        compatibilityTier: "supported",
        compatibilityNotes: [],
        supportLabels: [],
        skills: [{ name: "demo-skill" }],
        mcpServers: [],
        apps: [],
        imported: false,
        enabled: false,
        trusted: false,
        errors: [],
      },
    ],
    errors: [],
    installableCount: 1,
  };
}
