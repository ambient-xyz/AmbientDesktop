import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexPluginSummary } from "../shared/types";
import {
  buildPluginMcpLaunchPlans,
  buildPluginMcpToolRegistrations,
  callPluginMcpTool,
  codexPluginRuntimeFingerprint,
  inspectPluginMcpServers,
  PluginMcpSupervisor,
} from "./pluginMcpSupervisor";

function plugin(overrides: Partial<CodexPluginSummary>): CodexPluginSummary {
  return {
    id: "marketplace:fixture",
    name: "fixture",
    version: "0.1.0",
    description: "",
    marketplaceName: "Fixture",
    marketplacePath: ".agents/plugins/marketplace.json",
    rootPath: "/tmp/plugin",
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [],
    enabled: true,
    trusted: false,
    errors: [],
    ...overrides,
  };
}

describe("buildPluginMcpLaunchPlans", () => {
  it("includes pinned source checksums in plugin runtime fingerprints", () => {
    const fingerprint = codexPluginRuntimeFingerprint(
      plugin({
        sourceType: "git-subdir",
        sourceUrl: "https://example.test/plugins.git",
        sourceSha: "abc123",
        sourceChecksum: "sha256:fixture-checksum",
      }),
    );

    expect(fingerprint).toContain('"sourceChecksum":"sha256:fixture-checksum"');
    expect(fingerprint).toContain('"sourceSha":"abc123"');
  });

  it("builds startable launch plans for enabled plugin MCP servers", () => {
    expect(
      buildPluginMcpLaunchPlans([
        plugin({
          mcpServers: [{ name: "server", command: "node", args: ["server.js"], envKeys: ["TOKEN"] }],
        }),
      ]),
    ).toEqual([
      {
        pluginId: "marketplace:fixture",
        pluginName: "fixture",
        pluginVersion: "0.1.0",
        pluginFingerprint: expect.any(String),
        serverName: "server",
        cwd: "/tmp/plugin",
        command: "node",
        args: ["server.js"],
        envKeys: ["TOKEN"],
        enabled: true,
        startable: true,
      },
    ]);
  });

  it("keeps disabled plugins from being startable", () => {
    expect(
      buildPluginMcpLaunchPlans([
        plugin({
          enabled: false,
          mcpServers: [{ name: "server", command: "node", args: [], envKeys: [] }],
        }),
      ])[0],
    ).toMatchObject({ startable: false, reason: "Plugin is disabled." });
  });

  it("keeps plugins with missing MCP dependencies from being startable", () => {
    expect(
      buildPluginMcpLaunchPlans([
        plugin({
          dependencyStatus: {
            packageJsonPath: "/tmp/plugin/package.json",
            manager: "npm",
            installCommand: ["npm", "install", "--ignore-scripts"],
            required: true,
            installed: false,
            missingPackages: ["fixture-runtime"],
            reason: "Plugin MCP dependencies are not installed: fixture-runtime.",
          },
          mcpServers: [{ name: "server", command: "node", args: [], envKeys: [] }],
        }),
      ])[0],
    ).toMatchObject({
      startable: false,
      reason: "Plugin MCP dependencies are not installed: fixture-runtime.",
    });
  });

  it("inspects a fixture MCP server without calling plugin tools", async () => {
    const catalog = await inspectPluginMcpServers(
      [
        plugin({
          rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
          mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
        }),
      ],
      { timeoutMs: 1_000 },
    );

    expect(catalog.servers).toHaveLength(1);
    expect(catalog.servers[0].status).toBe("ready");
    expect(catalog.servers[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ambient_fixture_workspace_summary",
          serverName: "ambient-fixture",
        }),
      ]),
    );
    expect(catalog.servers[0].tools[0].inputSchema).toMatchObject({ type: "object" });
  });

  it("does not start disabled plugin servers during inspection", async () => {
    const catalog = await inspectPluginMcpServers([
      plugin({
        enabled: false,
        mcpServers: [{ name: "server", command: "node", args: [], envKeys: [] }],
      }),
    ]);

    expect(catalog.servers[0]).toMatchObject({ status: "skipped", reason: "Plugin is disabled." });
  });

  it("builds Pi-registerable plugin tool definitions from fixture MCP schemas", async () => {
    const registrations = await buildPluginMcpToolRegistrations(
      [
        plugin({
          rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
          mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
        }),
      ],
      { timeoutMs: 4_000 },
    );

    expect(registrations).toHaveLength(2);
    expect(registrations[0]).toMatchObject({
      registeredName: "ambient_fixture_workspace_summary",
      originalName: "ambient_fixture_workspace_summary",
      label: "fixture: ambient_fixture_workspace_summary",
      tool: {
        pluginName: "fixture",
        serverName: "ambient-fixture",
      },
    });
    expect(registrations[0].parameters).toMatchObject({ type: "object" });
    expect(registrations[0].description).toContain('Codex plugin "fixture"');
    expect(registrations[0].descriptor).toMatchObject({
      name: "ambient_fixture_workspace_summary",
      source: "plugin-mcp",
      sideEffects: "plugin-defined",
      permissionScope: "plugin-mcp",
    });
  });

  it("calls a fixture MCP tool and normalizes the returned text for Pi", async () => {
    const fixture = plugin({
      rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);
    const result = await callPluginMcpTool(
      plan,
      { toolName: "ambient_fixture_workspace_summary", arguments: { includeFiles: true } },
      { timeoutMs: 4_000 },
    );

    expect(result).toMatchObject({
      details: {
        pluginName: "fixture",
        serverName: "ambient-fixture",
        toolName: "ambient_fixture_workspace_summary",
      },
    });
    expect(result.content[0].text).toContain("Ambient fixture MCP summary");
    expect(result.content[0].text).toContain("includeFiles: true");
    expect(result.content[0].text).toContain("Structured content:");
  });

  it("supervises a fixture MCP server across inspection and tool calls", async () => {
    const supervisor = new PluginMcpSupervisor();
    const fixture = plugin({
      rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);

    try {
      const catalog = await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 4_000 });
      expect(catalog.servers[0]).toMatchObject({ status: "ready" });

      const [started] = supervisor.snapshots();
      expect(started).toMatchObject({
        pluginName: "fixture",
        pluginVersion: "0.1.0",
        pluginFingerprint: expect.stringContaining('"version":"0.1.0"'),
        serverName: "ambient-fixture",
        status: "ready",
        permissionMode: "full-access",
        workspacePath: join(process.cwd(), "plugins", "ambient-fixture"),
        requestCount: 1,
        toolCount: 2,
      });
      expect(started.recentEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sequence: 1, method: "initialize", status: "succeeded", durationMs: expect.any(Number) }),
          expect.objectContaining({ sequence: 2, method: "tools/list", status: "succeeded", durationMs: expect.any(Number) }),
        ]),
      );
      expect(started.pid).toEqual(expect.any(Number));

      const result = await supervisor.callPluginMcpTool(
        plan,
        { toolName: "ambient_fixture_workspace_summary", arguments: { includeFiles: false } },
        { timeoutMs: 4_000 },
      );
      expect(result.content[0].text).toContain("Ambient fixture MCP summary");

      const [afterCall] = supervisor.snapshots();
      expect(afterCall).toMatchObject({
        status: "ready",
        pid: started.pid,
        requestCount: started.requestCount + 1,
        toolCount: 2,
      });
      expect(afterCall.recentEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sequence: 3,
            method: "tools/call",
            toolName: "ambient_fixture_workspace_summary",
            status: "succeeded",
            durationMs: expect.any(Number),
          }),
        ]),
      );
    } finally {
      await supervisor.shutdown();
    }

    expect(supervisor.snapshots()).toEqual([]);
  });

  it("invalidates cached MCP tool descriptors when a plugin update fingerprint changes", async () => {
    const supervisor = new PluginMcpSupervisor();
    const base = plugin({
      rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const updated = { ...base, version: "0.2.0" };

    try {
      await supervisor.inspectPluginMcpServers([base], { timeoutMs: 4_000 });
      const [first] = supervisor.snapshots();
      expect(first).toMatchObject({
        pluginVersion: "0.1.0",
        toolCount: 2,
      });

      await supervisor.inspectPluginMcpServers([updated], { timeoutMs: 4_000 });
      const snapshots = supervisor.snapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({
        pluginVersion: "0.2.0",
        pluginFingerprint: expect.stringContaining('"version":"0.2.0"'),
        toolCount: 2,
      });
      expect(snapshots[0].key).not.toBe(first.key);
    } finally {
      await supervisor.shutdown();
    }
  });

  it("materializes large plugin MCP text output for Pi", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-plugin-output-"));
    const pluginRoot = join(workspacePath, "plugins", "ambient-fixture");
    await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
    const fixture = plugin({
      rootPath: pluginRoot,
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);
    try {
      const result = await callPluginMcpTool(
        plan,
        { toolName: "ambient_fixture_markdown_echo", arguments: { markdown: "large output dogfood", outputLines: 260 } },
        { timeoutMs: 4_000, workspacePath },
      );
      const output = result.details.outputOutput;

      expect(result.content[0].text).toContain("[truncated] plugin output preview is 12000");
      expect(output).toMatchObject({
        truncated: true,
        totalChars: expect.any(Number),
        previewChars: 12_000,
        artifactPath: expect.stringMatching(/^\.ambient\/tool-outputs\/.+\.txt$/),
      });
      expect(output!.totalChars).toBeGreaterThan(12_000);
      const artifact = await readFile(join(workspacePath, output!.artifactPath!), "utf8");
      expect(artifact).toContain("pluginOutputLine 0260");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps diagnostics for a plugin MCP server that crashes during startup", async () => {
    const supervisor = new PluginMcpSupervisor();
    const fixture = plugin({
      rootPath: process.cwd(),
      mcpServers: [
        {
          name: "crashing-server",
          command: "node",
          args: ["-e", "process.stderr.write('fixture startup failed\\n'); process.exit(1);"],
          envKeys: [],
        },
      ],
    });

    try {
      const catalog = await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 1_000, workspacePath: process.cwd() });
      expect(catalog.servers[0]).toMatchObject({
        status: "error",
        reason: expect.stringContaining("MCP server exited before responding"),
      });

      const [snapshot] = supervisor.snapshots();
      expect(snapshot).toMatchObject({
        pluginName: "fixture",
        pluginVersion: "0.1.0",
        pluginFingerprint: expect.stringContaining('"version":"0.1.0"'),
        serverName: "crashing-server",
        status: "crashed",
        permissionMode: "full-access",
        workspacePath: process.cwd(),
        requestCount: 0,
        failureCount: 1,
        backoffUntil: expect.any(String),
        lastError: expect.stringContaining("MCP server exited before responding"),
        stderr: expect.stringContaining("fixture startup failed"),
        recentEvents: expect.arrayContaining([
          expect.objectContaining({
            sequence: 1,
            method: "initialize",
            status: "failed",
            error: expect.stringContaining("MCP server exited before responding"),
          }),
          expect.objectContaining({
            method: "stderr",
            status: "succeeded",
            error: "fixture startup failed",
          }),
          expect.objectContaining({
            method: "crashed",
            status: "failed",
            error: expect.stringContaining("MCP server exited before responding"),
          }),
          expect.objectContaining({
            method: "stop",
            status: "succeeded",
            error: "Runtime marked crashed.",
          }),
        ]),
      });

      const retry = await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 1_000, workspacePath: process.cwd() });
      expect(retry.servers[0]).toMatchObject({
        status: "error",
        reason: expect.stringContaining("backing off"),
      });
      expect(supervisor.snapshots()[0]).toMatchObject({ failureCount: 1 });
    } finally {
      await supervisor.shutdown();
    }
  });

  it("can force-restart a crashed MCP runtime after the underlying server is fixed", async () => {
    const supervisor = new PluginMcpSupervisor();
    const workspace = await mkdtemp(join(tmpdir(), "ambient-mcp-restart-"));
    const serverPath = join(workspace, "server.mjs");
    const fixtureServer = await readFile(join(process.cwd(), "plugins", "ambient-fixture", "scripts", "fixture-mcp.js"), "utf8");
    const fixture = plugin({
      rootPath: workspace,
      mcpServers: [{ name: "restartable-server", command: "node", args: ["server.mjs"], envKeys: [] }],
    });

    try {
      await writeFile(serverPath, "process.stderr.write('restart fixture failed\\n'); process.exit(1);\n", "utf8");
      const failed = await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 1_000, workspacePath: workspace });
      expect(failed.servers[0]).toMatchObject({ status: "error" });
      const [crashed] = supervisor.snapshots();
      expect(crashed).toMatchObject({
        status: "crashed",
        failureCount: 1,
        stderr: expect.stringContaining("restart fixture failed"),
      });

      await writeFile(serverPath, fixtureServer, "utf8");
      const snapshots = await supervisor.restartRuntime(crashed.key, { timeoutMs: 4_000 });
      expect(snapshots).toEqual([
        expect.objectContaining({
          pluginName: "fixture",
          serverName: "restartable-server",
          status: "ready",
          workspacePath: workspace,
          requestCount: 0,
        }),
      ]);

      const [plan] = buildPluginMcpLaunchPlans([fixture]);
      const result = await supervisor.callPluginMcpTool(
        plan,
        { toolName: "ambient_fixture_workspace_summary", arguments: { includeFiles: false } },
        { timeoutMs: 4_000, workspacePath: workspace },
      );
      expect(result.content[0].text).toContain("Ambient fixture MCP summary");
      expect(supervisor.snapshots()[0]).toMatchObject({ status: "ready", requestCount: 1 });
    } finally {
      await supervisor.shutdown();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("keeps restart failure diagnostics as bounded lifecycle activity events", async () => {
    const supervisor = new PluginMcpSupervisor();
    const fixture = plugin({
      rootPath: process.cwd(),
      mcpServers: [
        {
          name: "restart-failure-server",
          command: "node",
          args: ["-e", "process.stderr.write('restart still failed\\n'); process.exit(1);"],
          envKeys: [],
        },
      ],
    });

    try {
      await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 1_000, workspacePath: process.cwd() });
      const [crashed] = supervisor.snapshots();
      const snapshots = await supervisor.restartRuntime(crashed.key, { timeoutMs: 1_000 });
      const [afterRestart] = snapshots ?? [];
      expect(afterRestart).toMatchObject({
        status: "crashed",
        failureCount: 2,
        stderr: expect.stringContaining("restart still failed"),
        recentEvents: expect.arrayContaining([
          expect.objectContaining({ method: "restart", status: "failed", error: "Manual runtime restart failed." }),
          expect.objectContaining({ method: "stderr", status: "succeeded", error: "restart still failed" }),
          expect.objectContaining({ method: "crashed", status: "failed" }),
          expect.objectContaining({ method: "stop", status: "succeeded", error: "Runtime marked crashed." }),
        ]),
      });
    } finally {
      await supervisor.shutdown();
    }
  });

  it("can stop a supervised MCP runtime by key", async () => {
    const supervisor = new PluginMcpSupervisor();
    const fixture = plugin({
      rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });

    try {
      await supervisor.inspectPluginMcpServers([fixture], { timeoutMs: 4_000 });
      const [started] = supervisor.snapshots();
      expect(started).toMatchObject({ status: "ready" });
      expect((await supervisor.restartRuntime("missing-runtime-key"))).toBeUndefined();
      await expect(supervisor.stopRuntimeByKey(started.key)).resolves.toEqual([]);
      expect(supervisor.snapshots()).toEqual([]);
    } finally {
      await supervisor.shutdown();
    }
  });

  it("can stop supervised MCP runtimes for one workspace without touching another", async () => {
    const supervisor = new PluginMcpSupervisor();
    const workspaceA = await mkdtemp(join(tmpdir(), "ambient-mcp-workspace-a-"));
    const workspaceB = await mkdtemp(join(tmpdir(), "ambient-mcp-workspace-b-"));
    const pluginRootA = join(workspaceA, "plugins", "ambient-fixture");
    const pluginRootB = join(workspaceB, "plugins", "ambient-fixture");
    await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRootA, { recursive: true });
    await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRootB, { recursive: true });
    const fixtureA = plugin({
      rootPath: pluginRootA,
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const fixtureB = plugin({
      rootPath: pluginRootB,
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });

    try {
      await supervisor.inspectPluginMcpServers([fixtureA], { timeoutMs: 4_000, workspacePath: workspaceA });
      await supervisor.inspectPluginMcpServers([fixtureB], { timeoutMs: 4_000, workspacePath: workspaceB });

      const started = supervisor.snapshots();
      expect(started).toHaveLength(2);
      expect(started.map((snapshot) => snapshot.workspacePath).sort()).toEqual([workspaceA, workspaceB].sort());

      await supervisor.shutdownWorkspace(workspaceA);

      const remaining = supervisor.snapshots();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ status: "ready", workspacePath: workspaceB });
    } finally {
      await supervisor.shutdown();
      await rm(workspaceA, { recursive: true, force: true });
      await rm(workspaceB, { recursive: true, force: true });
    }
  });

  it("marks an in-flight MCP tool call unhealthy on timeout and records diagnostics", async () => {
    const supervisor = new PluginMcpSupervisor();
    const workspace = await mkdtemp(join(tmpdir(), "ambient-mcp-timeout-"));
    await writeFile(join(workspace, "server.mjs"), slowMcpServerScript(), "utf8");
    const fixture = plugin({
      rootPath: workspace,
      mcpServers: [{ name: "slow-server", command: "node", args: ["server.mjs"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);

    try {
      await expect(
        supervisor.callPluginMcpTool(
          plan,
          { toolName: "ambient_fixture_slow_echo", arguments: { delayMs: 2_000 } },
          { timeoutMs: 200, workspacePath: workspace },
        ),
      ).rejects.toThrow("Timed out waiting for MCP tools/call.");

      const [snapshot] = supervisor.snapshots();
      expect(snapshot).toMatchObject({
        pluginName: "fixture",
        serverName: "slow-server",
        status: "unhealthy",
        workspacePath: workspace,
        requestCount: 1,
        failureCount: 1,
        backoffUntil: expect.any(String),
        lastError: "Timed out waiting for MCP tools/call.",
      });
      expect(snapshot.recentEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "tools/call",
            toolName: "ambient_fixture_slow_echo",
            status: "failed",
            error: "Timed out waiting for MCP tools/call.",
            durationMs: expect.any(Number),
          }),
        ]),
      );
    } finally {
      await supervisor.shutdown();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("marks an in-flight MCP tool call unhealthy on abort and records diagnostics", async () => {
    const supervisor = new PluginMcpSupervisor();
    const workspace = await mkdtemp(join(tmpdir(), "ambient-mcp-abort-"));
    await writeFile(join(workspace, "server.mjs"), slowMcpServerScript(), "utf8");
    const fixture = plugin({
      rootPath: workspace,
      mcpServers: [{ name: "slow-server", command: "node", args: ["server.mjs"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);
    const controller = new AbortController();

    try {
      const call = supervisor.callPluginMcpTool(
        plan,
        { toolName: "ambient_fixture_slow_echo", arguments: { delayMs: 2_000 } },
        { timeoutMs: 4_000, workspacePath: workspace, signal: controller.signal },
      );
      await waitForRuntimeEvent(supervisor, "tools/call");
      controller.abort();
      await expect(call).rejects.toThrow("MCP tools/call aborted.");

      const [snapshot] = supervisor.snapshots();
      expect(snapshot).toMatchObject({
        pluginName: "fixture",
        serverName: "slow-server",
        status: "unhealthy",
        workspacePath: workspace,
        requestCount: 1,
        failureCount: 1,
        backoffUntil: expect.any(String),
        lastError: "MCP tools/call aborted.",
      });
      expect(snapshot.recentEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "tools/call",
            toolName: "ambient_fixture_slow_echo",
            status: "failed",
            error: "MCP tools/call aborted.",
            durationMs: expect.any(Number),
          }),
        ]),
      );
    } finally {
      await supervisor.shutdown();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("does not start a plugin MCP server for a pre-aborted tool call", async () => {
    const supervisor = new PluginMcpSupervisor();
    const fixture = plugin({
      rootPath: join(process.cwd(), "plugins", "ambient-fixture"),
      mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    });
    const [plan] = buildPluginMcpLaunchPlans([fixture]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      supervisor.callPluginMcpTool(
        plan,
        { toolName: "ambient_fixture_workspace_summary", arguments: {} },
        { timeoutMs: 4_000, signal: controller.signal },
      ),
    ).rejects.toThrow("Plugin MCP tool call aborted.");
    expect(supervisor.snapshots()).toEqual([]);
  });
});

async function waitForRuntimeEvent(supervisor: PluginMcpSupervisor, method: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    if (supervisor.snapshots().some((snapshot) => snapshot.recentEvents?.some((event) => event.method === method))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for runtime event: ${method}`);
}

function slowMcpServerScript(): string {
  return `
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) handle(JSON.parse(line));
  }
});
function handle(message) {
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return;
  if (message.method === "initialize") {
    respond(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "slow-server", version: "0.1.0" } });
    return;
  }
  if (message.method === "tools/list") {
    respond(message.id, { tools: [{ name: "ambient_fixture_slow_echo", inputSchema: { type: "object", properties: { delayMs: { type: "number" } } } }] });
    return;
  }
  if (message.method === "tools/call") {
    setTimeout(() => respond(message.id, { content: [{ type: "text", text: "slow ok" }] }), Number(message.params?.arguments?.delayMs ?? 1000));
  }
}
function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
`;
}
