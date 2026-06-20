import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderInspectionTools } from "./agentRuntimeCapabilityBuilderInspectionTools";

describe("agentRuntimeCapabilityBuilderInspectionTools", () => {
  it("registers preview, list, and read tools with injected parsers and services", async () => {
    const workspace = { path: "/workspace" };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const listCapabilityBuilderFiles = vi.fn(async () => listFilesFixture());
    const readCapabilityBuilderFile = vi.fn(async () => readFileFixture());
    const parsePreviewInput = vi.fn(() => ({ packageName: "ambient-demo" }));
    const parseListFilesInput = vi.fn(() => ({ sourcePath: ".ambient/capability-builder/packages/ambient-demo" }));
    const parseReadFileInput = vi.fn(() => ({
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "SKILL.md",
      maxChars: 200,
    }));

    registerCapabilityBuilderInspectionTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parsePreviewInput,
      parseListFilesInput,
      parseReadFileInput,
      previewCapabilityBuilderPackage,
      listCapabilityBuilderFiles,
      readCapabilityBuilderFile,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_capability_builder_preview",
      "ambient_capability_builder_list_files",
      "ambient_capability_builder_read_file",
    ]);

    const preview = await registeredTools[0].execute("preview", { packageName: "ambient-demo" });
    expect(parsePreviewInput).toHaveBeenCalledWith({ packageName: "ambient-demo" });
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, { packageName: "ambient-demo" });
    expect(preview.content[0].text).toContain("Ambient Capability Builder preview");
    expect(preview.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_preview",
      status: "valid",
      packageName: "ambient-demo",
      errorCount: 0,
      warningCount: 1,
      riskCount: 1,
      commandNames: ["demo"],
      envNames: ["DEMO_API_KEY"],
      artifactOutputTypes: ["json"],
    });

    const listed = await registeredTools[1].execute("list", { sourcePath: ".ambient/capability-builder/packages/ambient-demo" });
    expect(parseListFilesInput).toHaveBeenCalledWith({ sourcePath: ".ambient/capability-builder/packages/ambient-demo" });
    expect(listCapabilityBuilderFiles).toHaveBeenCalledWith(workspace.path, { sourcePath: ".ambient/capability-builder/packages/ambient-demo" });
    expect(listed.content[0].text).toContain("Ambient Capability Builder files");
    expect(listed.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_list_files",
      status: "listed",
      packageName: "ambient-demo",
      fileCount: 2,
      totalFileCount: 2,
      totalFileCountTruncated: false,
      omittedDirectoryCount: 0,
      maxEntries: 200,
      maxDepth: 12,
      includeGenerated: false,
      hasNextPage: true,
      nextPageInput: {
        sourcePath: ".ambient/capability-builder/packages/ambient-demo",
        maxEntries: 200,
        maxDepth: 12,
        includeGenerated: false,
        cursor: "next-page",
      },
      sourceRef: sourceRefFixture(),
      inventoryArtifact: expect.objectContaining({
        path: ".ambient/tool-outputs/2026-06-20/inventory.txt",
        inventoryFileCount: 2,
        inventoryFileCountTruncated: false,
      }),
      largeOutputPreview: expect.objectContaining({
        kind: "large-output",
        items: [expect.objectContaining({
          artifactPath: ".ambient/tool-outputs/2026-06-20/inventory.txt",
          suggestedTools: ["file_read", "long_context_process"],
        })],
      }),
    });

    const read = await registeredTools[2].execute("read", {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "SKILL.md",
      maxChars: 200,
    });
    expect(parseReadFileInput).toHaveBeenCalledWith({
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "SKILL.md",
      maxChars: 200,
    });
    expect(readCapabilityBuilderFile).toHaveBeenCalledWith(workspace.path, {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "SKILL.md",
      maxChars: 200,
    });
    expect(read.content[0].text).toContain("Ambient Capability Builder file");
    expect(read.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_read_file",
      status: "read",
      packageName: "ambient-demo",
      filePath: "SKILL.md",
      sizeBytes: 18,
      truncated: false,
      sourceRef: sourceRefFixture(),
    });
  });
});

function sourceRefFixture() {
  return {
    kind: "capability-builder-source",
    packageName: "ambient-demo",
    workspacePath: "/workspace",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
  };
}

function previewFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    valid: true,
    installerShape: "custom-cli",
    errors: [],
    warnings: ["check validation"],
    risks: ["network host"],
    files: {
      descriptor: true,
      skill: true,
      buildManifest: true,
      packageJson: true,
    },
    descriptor: {
      name: "ambient-demo",
      version: "1.0.0",
      description: "Demo capability.",
      commandNames: ["demo"],
      voiceProviderCommandNames: [],
      voiceDiscoveryCommandNames: [],
      voiceCloningCommandNames: [],
      envNames: ["DEMO_API_KEY"],
      envRequirements: [],
      networkHosts: ["api.demo.example"],
      modelAssets: [],
      artifactOutputTypes: ["json"],
      responseFormats: ["JSON"],
    },
    packageJson: {
      dependencies: ["zod"],
      devDependencies: [],
      lifecycleScripts: [],
    },
  };
}

function listFilesFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    sourceRef: sourceRefFixture(),
    maxEntries: 200,
    maxDepth: 12,
    includeGenerated: false,
    totalFileCount: 2,
    totalFileCountTruncated: false,
    omittedDirectoryCount: 0,
    omittedDirectories: [],
    nextCursor: "next-page",
    inventoryArtifact: {
      path: ".ambient/tool-outputs/2026-06-20/inventory.txt",
      bytes: 512,
      chars: 512,
      previewChars: 512,
      truncated: false,
      redacted: false,
      redactionCount: 0,
      inventoryFileCount: 2,
      inventoryFileCountTruncated: false,
      fileReadInput: { path: ".ambient/tool-outputs/2026-06-20/inventory.txt" },
      longContextProcessInput: {
        taskType: "analysis",
        instruction: "Analyze this Builder inventory.",
        workspacePaths: [".ambient/tool-outputs/2026-06-20/inventory.txt"],
        maxModelCalls: 4,
      },
    },
    files: [
      { path: "SKILL.md", sizeBytes: 18, mtimeMs: 1 },
      { path: "ambient-cli.json", sizeBytes: 200, mtimeMs: 2 },
    ],
  };
}

function readFileFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    sourceRef: sourceRefFixture(),
    filePath: "SKILL.md",
    sizeBytes: 18,
    content: "# Demo capability\n",
    truncated: false,
    maxChars: 200,
  };
}
