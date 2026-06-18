import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BrowserLoginInput, BrowserSearchInput } from "../../shared/browserTypes";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { pluginMcpToolDescriptor } from "./workflowDesktopToolFacade";
import { createDocxFixture, createPptxFixture, createXlsxFixture } from "../office/officeTestFixtures";
import { createPdfFixture } from "../pdf/pdfTestFixtures";
import type { PluginMcpToolRegistration } from "./workflowPluginsFacade";
import type { WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { createWorkflowDesktopToolBridge } from "./workflowDesktopTools";

function baseOptions() {
  return {
    manifest: {
      tools: ["bash", "browser_search", "fixture_tool"],
      mutationPolicy: "read_only" as const,
    },
    workspace: { path: process.cwd() },
    permissionMode: "full-access" as const,
    runId: "run-1",
  };
}

function fixtureRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_tool",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_tool: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: { ok: { type: "boolean" } }, additionalProperties: false },
  });
  return {
    registeredName: "fixture_tool",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}

describe("createWorkflowDesktopToolBridge", () => {
  it("binds shell through the tool runner contract without starting a Pi session", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const shellRunner = vi.fn(async (input) => {
      input.onData(Buffer.from("ok\n"));
      return { exitCode: 0 };
    });
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      eventSink: { append: (event) => void events.push(event) },
      shellRunner,
    });

    await expect(bridge.handlers.bash({ command: "echo ok" })).resolves.toEqual({
      exitCode: 0,
      output: "ok\n",
      truncated: false,
    });
    expect(shellRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "echo ok",
        cwd: process.cwd(),
        policy: expect.objectContaining({ subject: "workflow-tool" }),
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "desktop-tool.start",
      "desktop-tool.permission",
      "desktop-tool.end",
    ]);
  });

  it("materializes large shell output instead of dropping it", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workflow-shell-"));
    const largeOutput = "y".repeat(17_000);
    try {
      const shellRunner = vi.fn(async (input) => {
        input.onData(Buffer.from(largeOutput));
        return { exitCode: 0 };
      });
      const bridge = createWorkflowDesktopToolBridge({
        ...baseOptions(),
        workspace: { path: workspace },
        shellRunner,
      });

      const result = (await bridge.handlers.bash({ command: "printf large" })) as {
        outputArtifactPath: string;
        outputNotice: string;
      };
      expect(result).toMatchObject({
        exitCode: 0,
        output: largeOutput.slice(0, 16_000),
        truncated: true,
        outputChars: 17_000,
        outputPreviewChars: 16_000,
      });
      expect(result.outputArtifactPath).toMatch(/^\.ambient\/tool-outputs\//);
      expect(result.outputNotice).toContain("long_context_process");
      expect(await readFile(join(workspace, result.outputArtifactPath), "utf8")).toBe(largeOutput);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("binds long_context_process through the workflow tool bridge for structured evidence", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const longContextModelComplete = vi.fn(async () => "Messages are mostly informational with one follow-up.");
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["long_context_process"],
        mutationPolicy: "read_only",
      },
      longContextModelComplete,
      eventSink: { append: (event) => void events.push(event) },
    });

    const result = (await bridge.handlers.long_context_process({
      taskType: "summarization",
      instruction: "Summarize email evidence by action required.",
      text: {
        sourceCount: 2,
        items: [
          { subject: "FYI", snippet: "No action needed." },
          { subject: "Follow-up", snippet: "Please reply by Friday." },
        ],
      },
      maxModelCalls: 4,
    })) as { response: string; runtime: string; inputSources: Array<{ structured?: boolean }> };

    expect(result).toMatchObject({
      runtime: "ambient-lambda-rlm",
      response: "Messages are mostly informational with one follow-up.",
    });
    expect(result.inputSources[0]?.structured).toBe(true);
    expect(longContextModelComplete).toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "desktop-tool.start",
      "desktop-tool.permission",
      "desktop-tool.end",
    ]);
  });

  it("binds long_context_process workspacePaths through the workflow tool bridge for Office and PDF documents", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workflow-long-context-docs-"));
    try {
      await writeFile(
        join(workspace, "roadmap.pptx"),
        await createPptxFixture([{ title: "Launch", body: "Maple Ridge enablement.", notes: "Primary risk: regional support coverage." }]),
      );
      await writeFile(join(workspace, "memo.pdf"), createPdfFixture(["PDF answer: native extraction."]));
      const prompts: string[] = [];
      const bridge = createWorkflowDesktopToolBridge({
        ...baseOptions(),
        manifest: {
          tools: ["long_context_process"],
          mutationPolicy: "read_only",
        },
        workspace: { path: workspace },
        longContextModelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain("Maple Ridge enablement.");
          expect(prompt).toContain("Primary risk: regional support coverage.");
          expect(prompt).toContain("PDF answer: native extraction.");
          expect(prompt).toContain("Office format: pptx");
          expect(prompt).toContain("PDF text extraction: available");
          return "Documents were processed natively.";
        },
      });

      const result = (await bridge.handlers.long_context_process({
        taskType: "qa",
        question: "What do the documents say?",
        workspacePaths: ["roadmap.pptx", "memo.pdf"],
        maxModelCalls: 4,
      })) as { response: string; inputSources: Array<Record<string, unknown>> };

      expect(result.response).toBe("Documents were processed natively.");
      expect(result.inputSources).toEqual([
        expect.objectContaining({ type: "workspacePath", path: "roadmap.pptx", officeFormat: "pptx", officeUnitCount: 1 }),
        expect.objectContaining({ type: "workspacePath", path: "memo.pdf", pdfPages: 1 }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("binds workspace file read and write tools through the Desktop bridge", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workflow-files-"));
    try {
      await writeFile(join(workspace, "notes.md"), "# Notes\n", "utf8");
      await writeFile(join(workspace, "brief.pdf"), createPdfFixture(["PDF owner is Ada."]));
      await writeFile(join(workspace, "brief.docx"), await createDocxFixture(["Office briefing", "The launch owner is Ada."]));
      await writeFile(join(workspace, "budget.xlsx"), await createXlsxFixture([{ name: "Budget", rows: [["Owner", "Amount"], ["Ada", 42]] }]));
      const bridge = createWorkflowDesktopToolBridge({
        ...baseOptions(),
        manifest: {
          tools: ["file_read", "file_write"],
          mutationPolicy: "staged_until_approved",
        },
        workspace: { path: workspace },
      });

      await expect(bridge.handlers.file_read({ path: "notes.md" })).resolves.toMatchObject({
        path: "notes.md",
        content: "# Notes\n",
        truncated: false,
      });
      await expect(bridge.handlers.file_read({ path: "brief.pdf" })).resolves.toMatchObject({
        path: "brief.pdf",
        kind: "pdf",
        content: expect.stringContaining("PDF owner is Ada."),
        truncated: false,
        pdfText: {
          status: "available",
          pages: 1,
        },
      });
      await expect(bridge.handlers.file_read({ path: "brief.docx" })).resolves.toMatchObject({
        path: "brief.docx",
        kind: "office",
        content: expect.stringContaining("The launch owner is Ada."),
        officeText: {
          status: "available",
          format: "docx",
          unitLabel: "paragraphs",
          unitCount: 2,
        },
      });
      await expect(bridge.handlers.file_read({ path: "budget.xlsx" })).resolves.toMatchObject({
        path: "budget.xlsx",
        kind: "office",
        content: expect.stringContaining("B2: 42"),
        officeText: {
          status: "available",
          format: "xlsx",
          unitLabel: "sheets",
          unitCount: 1,
        },
      });
      const officeRead = (await bridge.handlers.file_read({ path: "brief.docx" })) as { officeText?: { text?: string } };
      expect(officeRead.officeText?.text).toBeUndefined();
      await expect(bridge.handlers.file_write({ path: "reports/out.txt", content: "done" })).resolves.toEqual({
        path: "reports/out.txt",
        bytes: 4,
      });
      await expect(readFile(join(workspace, "reports", "out.txt"), "utf8")).resolves.toBe("done");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps rejecting non-Office binary files through file_read", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workflow-binary-files-"));
    try {
      await writeFile(join(workspace, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const bridge = createWorkflowDesktopToolBridge({
        ...baseOptions(),
        manifest: {
          tools: ["file_read"],
          mutationPolicy: "read_only",
        },
        workspace: { path: workspace },
      });

      await expect(bridge.handlers.file_read({ path: "pixel.png" })).rejects.toThrow("text files, PDFs, or supported Office documents");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("binds approved local directory listing and local file reads through the Desktop bridge", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-workflow-local-workspace-"));
    const localDirectory = await mkdtemp(join(tmpdir(), "ambient-workflow-downloads-"));
    try {
      await mkdir(join(localDirectory, "Receipts"));
      await writeFile(join(localDirectory, "resume.txt"), "Ada Lovelace resume\n", "utf8");
      await writeFile(join(localDirectory, "agreement.pdf"), createPdfFixture(["Local PDF owner is Ada."]));
      await writeFile(join(localDirectory, "budget.xlsx"), await createXlsxFixture([{ name: "Budget", rows: [["Owner", "Amount"], ["Ada", 42]] }]));
      await writeFile(join(localDirectory, ".env.example"), "API_URL=https://example.test\n", "utf8");
      await writeFile(join(localDirectory, ".env.local"), "TOKEN=redacted\n", "utf8");
      await writeFile(join(localDirectory, ".hidden.txt"), "hidden\n", "utf8");
      await writeFile(join(localDirectory, "secrets.txt"), "token=redacted\n", "utf8");
      await writeFile(join(localDirectory, "pixel.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const bridge = createWorkflowDesktopToolBridge({
        ...baseOptions(),
        manifest: {
          tools: ["local_directory_list", "local_file_read"],
          mutationPolicy: "read_only",
        },
        workspace: { path: workspace },
      });

      await expect(bridge.handlers.local_directory_list({ path: localDirectory, maxEntries: 10, maxDepth: 1 })).resolves.toMatchObject({
        rootPath: expect.any(String),
        rootName: expect.stringContaining("ambient-workflow-downloads-"),
        entries: expect.arrayContaining([
          expect.objectContaining({ name: "Receipts", type: "directory", depth: 0 }),
          expect.objectContaining({ name: "resume.txt", type: "file", extension: ".txt", depth: 0 }),
          expect.objectContaining({ name: ".env.example", type: "file", depth: 0 }),
          expect.objectContaining({ name: "agreement.pdf", type: "file", extension: ".pdf", depth: 0 }),
          expect.objectContaining({ name: "budget.xlsx", type: "file", extension: ".xlsx", depth: 0 }),
        ]),
        skipped: expect.arrayContaining([
          expect.objectContaining({ path: ".hidden.txt", reason: "hidden path skipped" }),
          expect.objectContaining({ path: ".env.local", reason: "hidden path skipped" }),
          expect.objectContaining({ path: "secrets.txt", reason: "secret-like path skipped" }),
        ]),
      });
      await expect(bridge.handlers.local_file_read({ path: join(localDirectory, "resume.txt") })).resolves.toMatchObject({
        path: join(localDirectory, "resume.txt"),
        content: "Ada Lovelace resume\n",
        truncated: false,
        kind: "text",
      });
      await expect(bridge.handlers.local_file_read({ path: join(localDirectory, "budget.xlsx") })).resolves.toMatchObject({
        kind: "office",
        content: expect.stringContaining("B2: 42"),
        officeText: {
          status: "available",
          format: "xlsx",
          unitLabel: "sheets",
          unitCount: 1,
        },
      });
      await expect(bridge.handlers.local_file_read({ path: join(localDirectory, "agreement.pdf") })).resolves.toMatchObject({
        kind: "pdf",
        content: expect.stringContaining("Local PDF owner is Ada."),
        pdfText: {
          status: "available",
          pages: 1,
        },
      });
      await expect(bridge.handlers.local_file_read({ path: join(localDirectory, "pixel.png") })).rejects.toThrow(
        "text files, PDFs, or supported Office documents",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(localDirectory, { recursive: true, force: true });
    }
  });

  it("passes cancellation signals into workflow shell commands", async () => {
    const controller = new AbortController();
    const shellRunner = vi.fn(async () => ({ exitCode: 0 }));
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      abortSignal: controller.signal,
      shellRunner,
    });

    await expect(bridge.handlers.bash({ command: "sleep 30" })).resolves.toMatchObject({ exitCode: 0 });
    expect(shellRunner).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("skips shell execution in dry-run mode and records the skipped command", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const shellRunner = vi.fn(async () => ({ exitCode: 0 }));
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      dryRun: true,
      eventSink: { append: (event) => void events.push(event) },
      shellRunner,
    });

    await expect(bridge.handlers.bash({ command: "pnpm test" })).resolves.toEqual({
      exitCode: null,
      output: "[dry-run] skipped shell command: pnpm test\n",
      truncated: false,
    });
    expect(shellRunner).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "desktop-tool.dry_run",
        message: "bash",
      }),
    ]);
  });

  it("uses existing permission policy before workspace-mode shell commands", async () => {
    const requestPermission = vi.fn(async (_request: Omit<PermissionRequest, "id">) => false);
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      permissionMode: "workspace",
      requestPermission,
      shellRunner: vi.fn(async () => ({ exitCode: 0 })),
    });

    await expect(bridge.handlers.bash({ command: "rm -rf build" })).rejects.toThrow("permission denied");
    expect(requestPermission).toHaveBeenCalledWith(expect.objectContaining({ risk: "destructive-command" }));
  });

  it("binds browser search through the browser adapter and workspace permission prompt", async () => {
    const search = vi.fn(async (input: BrowserSearchInput) => [{ title: "Result", url: `https://example.test?q=${input.query}` }]);
    const requestPermission = vi.fn(async () => true);
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      permissionMode: "workspace",
      requestPermission,
      browser: {
        search,
        navigate: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn(),
        screenshot: vi.fn(),
        pick: vi.fn(),
      },
    });

    await expect(bridge.handlers.browser_search({ query: "Ambient" })).resolves.toEqual([
      { title: "Result", url: "https://example.test?q=Ambient" },
    ]);
    expect(requestPermission).toHaveBeenCalledWith(expect.objectContaining({ risk: "browser-network" }));
    expect(search).toHaveBeenCalledWith({ query: "Ambient", profileMode: "isolated", runtime: "chrome", artifactWorkspacePath: process.cwd() });
  });

  it("materializes fetched browser search content in workflow results", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-search-output-"));
    const largeContent = "browser search fetched content ".repeat(220);
    const search = vi.fn(async () => [
      {
        title: "Large result",
        url: "https://example.test/large",
        content: largeContent,
      },
    ]);
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      workspace: { path: workspacePath },
      browser: {
        search,
        navigate: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn(),
        screenshot: vi.fn(),
        pick: vi.fn(),
      },
    });

    try {
      const results = await bridge.handlers.browser_search({ query: "Ambient", fetchContent: true }) as Array<{
        content: string;
        contentArtifactPath?: string;
        contentChars?: number;
        contentPreviewChars?: number;
      }>;

      expect(results[0]).toMatchObject({
        contentChars: largeContent.length,
        contentPreviewChars: 3_000,
        contentArtifactPath: expect.stringMatching(/^\.ambient\/tool-outputs\/.+\.txt$/),
      });
      expect(results[0].content).toContain("[truncated] browser search result content preview is 3000");
      await expect(readFile(join(workspacePath, results[0].contentArtifactPath!), "utf8")).resolves.toBe(largeContent);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stubs browser network tools in dry-run mode", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const search = vi.fn(async (input: BrowserSearchInput) => [{ title: "Result", url: `https://example.test?q=${input.query}` }]);
    const requestPermission = vi.fn(async () => true);
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      dryRun: true,
      permissionMode: "workspace",
      requestPermission,
      eventSink: { append: (event) => void events.push(event) },
      browser: {
        search,
        navigate: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn(),
        screenshot: vi.fn(),
        pick: vi.fn(),
      },
    });

    await expect(bridge.handlers.browser_search({ query: "Scottsdale toddler pools" })).resolves.toEqual([
      expect.objectContaining({
        title: "[dry-run] Browser search skipped",
        snippet: expect.stringContaining("Scottsdale toddler pools"),
      }),
    ]);
    expect(search).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "desktop-tool.dry_run",
        message: "browser_search",
      }),
    ]);
  });

  it("stubs brokered browser login in dry-run mode without resolving credentials", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const login = vi.fn();
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["browser_login"],
        mutationPolicy: "read_only",
      },
      dryRun: true,
      eventSink: { append: (event) => void events.push(event) },
      browser: {
        search: vi.fn(),
        navigate: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn(),
        login,
        screenshot: vi.fn(),
        pick: vi.fn(),
      },
    });

    await expect(
      bridge.handlers.browser_login({
        credentialId: "cred-1",
        expectedOrigin: "https://example.test",
        submit: false,
      }),
    ).resolves.toEqual({
      dryRun: true,
      skipped: true,
      toolName: "browser_login",
      credentialId: "cred-1",
      expectedOrigin: "https://example.test",
      submitted: false,
    });
    expect(login).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "desktop-tool.dry_run",
        message: "browser_login",
      }),
    ]);
  });

  it("runs Ambient CLI workflow calls only when the manifest pins the command capability", async () => {
    const ambientCliRunner = vi.fn(async () => ({
      packageId: "pkg-json",
      packageName: "ambient-json-cli",
      commandName: "json-pick",
      command: ["node", "./bin/json-pick.mjs", "payload.json", "message"],
      cwd: process.cwd(),
      durationMs: 12,
      stdout: "hello",
    }));
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["ambient_cli"],
        ambientCliCapabilities: [
          {
            capabilityId: "pkg-json:tool:json-pick",
            registryPluginId: "cli:pkg-json",
            packageId: "pkg-json",
            packageName: "ambient-json-cli",
            command: "json-pick",
          },
        ],
        mutationPolicy: "read_only",
      },
      ambientCliRunner,
    });

    await expect(
      bridge.handlers.ambient_cli({ packageName: "ambient-json-cli", command: "json-pick", args: ["payload.json", "message"] }),
    ).resolves.toMatchObject({ stdout: "hello", packageId: "pkg-json" });
    expect(ambientCliRunner).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({ packageId: "pkg-json", command: "json-pick", args: ["payload.json", "message"] }),
    );
  });

  it("binds Ambient CLI describe as a read-only workflow tool", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const ambientCliDescriber = vi.fn(async () => ({
      package: {
        id: "pkg-json",
        name: "ambient-json-cli",
        source: "fixture",
        installed: true,
        availability: "available" as const,
        availabilityReason: "Installed fixture package is available.",
      },
      commands: [],
      skills: [],
      env: [],
      guidance: ["Use ambient_cli after describe."],
      diagnostics: [],
    }));
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["ambient_cli_describe"],
        ambientCliCapabilities: [],
        mutationPolicy: "read_only",
      },
      ambientCliDescriber,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      bridge.handlers.ambient_cli_describe({ packageName: "ambient-json-cli", command: "json-pick", includeSkill: true, maxSkillChars: 1200 }),
    ).resolves.toMatchObject({
      package: { id: "pkg-json", name: "ambient-json-cli" },
      guidance: ["Use ambient_cli after describe."],
    });
    expect(ambientCliDescriber).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({ packageName: "ambient-json-cli", command: "json-pick", includeSkill: true, maxSkillChars: 1200 }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "desktop-tool.start",
      "desktop-tool.permission",
      "desktop-tool.end",
    ]);
  });

  it("rejects Ambient CLI workflow calls missing a matching manifest capability", async () => {
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["ambient_cli"],
        ambientCliCapabilities: [],
        mutationPolicy: "read_only",
      },
      ambientCliRunner: vi.fn(),
    });

    await expect(bridge.handlers.ambient_cli({ packageName: "ambient-json-cli", command: "json-pick" })).rejects.toThrow(
      "does not declare Ambient CLI capability",
    );
  });

  it("requires explicit approval before workflow brokered browser login invokes the adapter", async () => {
    const login = vi.fn(async (input: BrowserLoginInput) => ({
      status: "submitted",
      credentialId: input.credentialId,
      origin: input.expectedOrigin,
    }));
    const requestPermission = vi.fn(async () => true);
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      manifest: {
        tools: ["browser_login"],
        mutationPolicy: "read_only",
      },
      permissionMode: "full-access",
      requestPermission,
      browser: {
        search: vi.fn(),
        navigate: vi.fn(),
        content: vi.fn(),
        evaluate: vi.fn(),
        login,
        screenshot: vi.fn(),
        pick: vi.fn(),
      },
    });

    await expect(
      bridge.handlers.browser_login({
        credentialId: "cred-1",
        expectedOrigin: "https://example.test",
        passwordSelector: "input[type=password]",
      }),
    ).resolves.toMatchObject({ status: "submitted", credentialId: "cred-1" });
    expect(requestPermission).toHaveBeenCalledWith(expect.objectContaining({ risk: "browser-login" }));
    expect(login).toHaveBeenCalledWith({
      credentialId: "cred-1",
      expectedOrigin: "https://example.test",
      passwordSelector: "input[type=password]",
      profileMode: "isolated",
      runtime: "chrome",
    });
  });

  it("binds plugin MCP tools through registrations and trust checks", async () => {
    const registration = fixtureRegistration();
    const ensurePluginTrusted = vi.fn(async () => true);
    const pluginCaller = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "done" }],
      details: {
        pluginId: "plugin-1",
        pluginName: "Fixture",
        serverName: "server",
        toolName: "fixture_original",
      },
    }));
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      pluginRegistrations: [registration],
      ensurePluginTrusted,
      pluginCaller,
    });

    await expect(bridge.handlers.fixture_tool({ ok: true })).resolves.toMatchObject({
      content: [{ text: "done" }],
    });
    expect(bridge.descriptors.map((descriptor) => descriptor.name)).toContain("fixture_tool");
    expect(ensurePluginTrusted).toHaveBeenCalledWith(registration);
    expect(pluginCaller).toHaveBeenCalledWith(
      registration.launchPlan,
      { toolName: "fixture_original", arguments: { ok: true } },
      { permissionMode: "full-access", workspacePath: process.cwd() },
    );
  });

  it("dry-runs plugin MCP tools without trust prompts or plugin invocation", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const registration = fixtureRegistration();
    const ensurePluginTrusted = vi.fn(async () => true);
    const pluginCaller = vi.fn();
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      pluginRegistrations: [registration],
      ensurePluginTrusted,
      pluginCaller,
      dryRun: true,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(bridge.handlers.fixture_tool({ ok: true })).resolves.toEqual({
      dryRun: true,
      skipped: true,
      toolName: "fixture_tool",
      input: { ok: true },
    });
    expect(ensurePluginTrusted).not.toHaveBeenCalled();
    expect(pluginCaller).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "desktop-tool.dry_run",
        message: "fixture_tool",
        data: expect.objectContaining({ source: "plugin-mcp", sideEffects: "plugin-defined" }),
      }),
    ]);
  });

  it("blocks plugin MCP tools before invocation when trust is denied", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const registration = fixtureRegistration();
    const ensurePluginTrusted = vi.fn(async () => false);
    const pluginCaller = vi.fn();
    const bridge = createWorkflowDesktopToolBridge({
      ...baseOptions(),
      pluginRegistrations: [registration],
      ensurePluginTrusted,
      pluginCaller,
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(bridge.handlers.fixture_tool({ ok: true })).rejects.toThrow(
      "Workflow plugin tool blocked by trust policy: fixture_tool",
    );
    expect(ensurePluginTrusted).toHaveBeenCalledWith(registration);
    expect(pluginCaller).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual([
      "desktop-tool.start",
      "desktop-tool.permission",
      "desktop-tool.error",
    ]);
    expect(events.map((event) => event.type)).not.toContain("plugin-mcp.start");
  });
});
