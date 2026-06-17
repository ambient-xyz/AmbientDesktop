import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Model } from "@mariozechner/pi-ai";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import { createMcpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import { createMcpAutowirePlanRevisionStore } from "./mcpAutowirePlanEdits";
import { createMcpAutowirePiToolDefinitions } from "./mcpAutowirePiTools";
import { validateMcpAutowireCandidate, type McpAutowireCandidate } from "./mcpAutowireSchemas";
import type { McpAutowirePlanResult } from "./mcpAutowirePlanner";

describe("MCP autowire Pi tool", () => {
  it("exposes a compact read-only planner tool backed by the autowire planner", async () => {
    const plannerCalls: unknown[] = [];
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      planner: async (input, options) => {
        plannerCalls.push({ input, options });
        return planResult();
      },
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_plan"), {
      targetUrl: "https://github.com/upstash/context7",
      instructions: "Use the Ambient MCP autowire schema.",
      allowedDiscovery: { search: true, maxFetches: 3, maxSearches: 1, maxBytesPerFetch: 8_000 },
    });

    expect(textFromResult(result)).toContain("Recommended lane: remote-mcp");
    expect(textFromResult(result)).toContain("Candidate ref for ambient_mcp_autowire_review:");
    expect(textFromResult(result)).not.toContain("Candidate JSON for ambient_mcp_autowire_review:");
    expect(result.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_autowire_plan",
      status: "ready-for-review",
      outcome: "ready",
      targetUrl: "https://github.com/upstash/context7",
      candidateId: "context7-remote-mcp",
      candidateRef: expect.stringContaining("ambient-mcp-candidate:context7-remote-mcp:"),
      recommendedLane: "remote-mcp",
      readyForUserReview: true,
    });
    expect(plannerCalls).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          targetUrl: "https://github.com/upstash/context7",
          allowedDiscovery: expect.objectContaining({ search: true, maxFetches: 3, maxSearches: 1, maxBytesPerFetch: 8_000 }),
        }),
        options: expect.objectContaining({
          apiKey: "test-key",
          model: AMBIENT_DEFAULT_MODEL,
          baseUrl: "https://ambient.test",
        }),
      }),
    ]);
  });

  it("emits heartbeat updates while the autowire planner is still pending", async () => {
    vi.useFakeTimers();
    try {
      let resolvePlanner!: (value: McpAutowirePlanResult) => void;
      const updates: unknown[] = [];
      const candidateRefs = createMcpAutowireCandidateRefStore();
      const tools = createMcpAutowirePiToolDefinitions({
        apiKey: "test-key",
        model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
        getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
        workspace: { path: "/tmp/workspace", name: "workspace" },
        candidateRefs,
        planner: async (_input, plannerOptions) => new Promise<McpAutowirePlanResult>((resolve) => {
          plannerOptions.onProgress?.({
            stage: "streaming",
            elapsedMs: 1_200,
            outputChars: 64,
            thinkingChars: 12,
            idleElapsedMs: 100,
            idleTimeoutMs: 30_000,
          });
          plannerOptions.onToolProgress?.({
            toolCallId: "read-1",
            toolName: "ambient_mcp_url_read",
            status: "running",
            elapsedMs: 250,
            inputSummary: "url=https://raw.githubusercontent.com/D4Vinci/Scrapling/main/README.md",
          });
          resolvePlanner = resolve;
        }),
      });

      const execution = callTool(toolByName(tools, "ambient_mcp_autowire_plan"), {
        targetUrl: "https://github.com/D4Vinci/Scrapling",
      }, (update) => updates.push(update));

      await vi.advanceTimersByTimeAsync(15_000);

      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            stage: "streaming",
            outputChars: 64,
            thinkingChars: 12,
          }),
        }),
        expect.objectContaining({
          details: expect.objectContaining({
            toolName: "ambient_mcp_autowire_plan",
            status: "planning",
            stage: "discovery-tool-running",
            waitingOn: "ambient_mcp_url_read",
            outputChars: 64,
            thinkingChars: 12,
          }),
        }),
        expect.objectContaining({
          details: expect.objectContaining({
            toolName: "ambient_mcp_autowire_plan",
            status: "planning",
            stage: "heartbeat",
            heartbeatCount: 1,
            outputChars: 64,
            thinkingChars: 12,
          }),
        }),
        expect.objectContaining({
          details: expect.objectContaining({
            stage: "heartbeat",
            heartbeatCount: 2,
          }),
        }),
        expect.objectContaining({
          details: expect.objectContaining({
            stage: "heartbeat",
            heartbeatCount: 3,
          }),
        }),
      ]));

      resolvePlanner(planResult());
      const result = await execution;
      expect(textFromResult(result)).toContain("Candidate ref for ambient_mcp_autowire_review:");
      const updateCountAfterCompletion = updates.length;

      await vi.advanceTimersByTimeAsync(10_000);
      expect(updates).toHaveLength(updateCountAfterCompletion);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a normal app handoff without storing an MCP candidate ref", async () => {
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      planner: async () => normalAppPlanResult(),
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_plan"), {
      targetUrl: "https://github.com/opencut-app/opencut-classic",
    });

    const text = textFromResult(result);
    expect(text).toContain("Source classification: normal_app");
    expect(text).toContain("No MCP candidate was generated");
    expect(text).toContain("ambient_setup_runtime_preflight");
    expect(text).not.toContain("Candidate ref for ambient_mcp_autowire_review:");
    expect(result.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_autowire_plan",
      status: "blocked",
      outcome: "deferred-unsupported-lane",
      sourceClassification: "normal_app",
      sourceClassificationConfidence: "high",
      setupRecipe: "normal-app-setup",
      readyForUserReview: false,
      readyForToolHiveRun: false,
    });
    expect(result.details).not.toHaveProperty("candidateRef");
  });

  it("records durable plan revisions and applies typed edits after approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-autowire-plan-edits-"));
    const candidateRefs = createMcpAutowireCandidateRefStore({
      storagePath: join(root, "candidates.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const approvals: unknown[] = [];
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      planRevisions,
      planner: async () => planResult(),
      authorizePlanEdit: async (approval) => {
        approvals.push(approval);
        return true;
      },
    });

    const plan = await callTool(toolByName(tools, "ambient_mcp_autowire_plan"), {
      targetUrl: "https://github.com/upstash/context7",
    });
    const originalCandidateRef = plan.details.candidateRef as string;
    const revisions = await callTool(toolByName(tools, "ambient_mcp_autowire_plan_revision_list"), {});
    const revisionId = (revisions.details.revisions as Array<{ revisionId: string }>)[0].revisionId;

    const describe = await callTool(toolByName(tools, "ambient_mcp_autowire_plan_edit_describe"), {
      revisionId,
      reason: "Allow the server to reach the public API host discovered during validation.",
      operations: [{
        op: "network.allowlist.add",
        hosts: ["https://api.github.com/repos/upstash/context7"],
        ports: [443],
        justification: "Validation needs GitHub API metadata reads.",
      }],
    });

    expect(describe.details).toMatchObject({
      toolName: "ambient_mcp_autowire_plan_edit_describe",
      status: "ready-for-apply",
      permissionExpanding: true,
      parentRevisionId: revisionId,
      candidateRef: originalCandidateRef,
      changedPaths: expect.arrayContaining(["$.permissions.network.allowHosts"]),
      nextToolName: "ambient_mcp_autowire_review",
    });

    const applied = await callTool(toolByName(tools, "ambient_mcp_autowire_plan_edit_apply"), {
      revisionId,
      reason: "Allow the server to reach the public API host discovered during validation.",
      operations: [{
        op: "network.allowlist.add",
        hosts: ["api.github.com"],
        ports: [443],
        justification: "Validation needs GitHub API metadata reads.",
      }],
    });

    expect(approvals).toHaveLength(1);
    expect(applied.details).toMatchObject({
      toolName: "ambient_mcp_autowire_plan_edit_apply",
      status: "applied",
      permissionExpanding: true,
      revisionId: expect.stringContaining("ambient-mcp-revision:"),
      candidateRef: expect.stringContaining("ambient-mcp-candidate:"),
      nextToolName: "ambient_mcp_autowire_review",
    });
    expect(applied.details.candidateRef).not.toEqual(originalCandidateRef);
    expect(candidateRefs.get(applied.details.candidateRef as string)).toMatchObject({
      permissions: {
        network: {
          allowHosts: expect.arrayContaining(["api.github.com"]),
          allowPorts: expect.arrayContaining([443]),
        },
      },
    });
    const updatedRevisions = await callTool(toolByName(tools, "ambient_mcp_autowire_plan_revision_list"), {});
    expect(updatedRevisions.details).toMatchObject({
      revisionCount: 2,
    });
  });

  it("reviews candidate JSON and returns the deterministic handoff", async () => {
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_review"), {
      candidate: mcpAutowirePhase0Fixtures.context7,
    });

    expect(textFromResult(result)).toContain("Handoff: remote-mcp-proxy (ready, ready)");
    expect(result.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_autowire_review",
      status: "ready",
      outcome: "ready",
      candidateId: "context7-remote-mcp",
      recommendedLane: "remote-mcp",
      handoffKind: "remote-mcp-proxy",
      nextToolName: "ambient_mcp_remote_proxy_describe",
      blockerCount: 0,
    });

    const guided = await callTool(toolByName(tools, "ambient_mcp_autowire_review"), {
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
    });
    expect(textFromResult(guided)).toContain("Handoff: guided-local-bridge (deferred, guided-setup-required)");
    expect(guided.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_autowire_review",
      status: "deferred",
      outcome: "guided-setup-required",
      candidateId: "ghidramcp-guided-local-bridge",
      recommendedLane: "guided-local-bridge",
      handoffKind: "guided-local-bridge",
      nextToolName: "ambient_mcp_guided_bridge_describe",
    });
  });

  it("reviews candidate refs and returns compact Standard MCP next-tool input", async () => {
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const candidateRef = candidateRefs.put(
      mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
      validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash,
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_review"), {
      candidateRef,
    });

    expect(textFromResult(result)).toContain(`Next tool: ambient_mcp_standard_import_describe {"candidateRef":"${candidateRef}"`);
    expect(textFromResult(result)).not.toContain('"candidate":{"schemaVersion"');
    expect(result.details).toMatchObject({
      candidateRef,
      nextToolInput: {
        candidateRef,
        expectedCandidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      nextToolName: "ambient_mcp_standard_import_describe",
    });
    expect(candidateRefs.getReviewed(candidateRef)).toMatchObject({
      id: "scrapling-github-server-json",
    });
  });

  it("reviews candidate refs after the store is recreated for a reset Pi session", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-autowire-pi-refs-"));
    const storagePath = join(root, "thread-1.json");
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash;
    const candidateRef = createMcpAutowireCandidateRefStore({ storagePath }).put(
      mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
      candidateHash,
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs: createMcpAutowireCandidateRefStore({ storagePath }),
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_review"), {
      candidateRef,
      expectedCandidateHash: candidateHash,
    });

    expect(textFromResult(result)).toContain(`Next tool: ambient_mcp_standard_import_describe {"candidateRef":"${candidateRef}"`);
    expect(result.details).toMatchObject({
      candidateRef,
      candidateHash,
      nextToolInput: {
        candidateRef,
        expectedCandidateHash: candidateHash,
      },
    });
  });

  it("reviews custom source build plans and stores emitted custom-image candidate refs", async () => {
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const sourceCandidate = githubSourceOnlyCandidate();
    const sourceRef = candidateRefs.put(
      sourceCandidate as unknown as Record<string, unknown>,
      validateMcpAutowireCandidate(sourceCandidate).candidateHash,
      "reviewed",
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_custom_source_describe"), {
      candidateRef: sourceRef,
      sourceBuild: {
        schemaVersion: "ambient-mcp-custom-source-build-v1",
        sourceUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
        resolvedCommit: "abc1234deadbeef",
        image: {
          identifier: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
          digest: `sha256:${"d".repeat(64)}`,
        },
        recipe: {
          kind: "existing-reviewed-image",
          contextPath: ".",
          serverArgs: ["--stdio"],
        },
      },
    });

    expect(textFromResult(result)).toContain("Custom-image candidate ref for ambient_mcp_standard_import_describe");
    expect(result.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_autowire_custom_source_describe",
      status: "ready-for-import",
      sourceCandidateId: "sqlite-explorer-fastmcp-source",
      customImageCandidateRef: expect.stringContaining("ambient-mcp-candidate:sqlite-explorer-fastmcp-source:"),
      nextToolName: "ambient_mcp_standard_import_describe",
      nextToolInput: {
        candidateRef: expect.stringContaining("ambient-mcp-candidate:sqlite-explorer-fastmcp-source:"),
        expectedCandidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    const customRef = result.details.customImageCandidateRef as string;
    expect(candidateRefs.getReviewed(customRef)).toMatchObject({
      runtime: {
        sourceKind: "custom-image",
        package: {
          registryType: "oci",
          digest: `sha256:${"d".repeat(64)}`,
        },
        sourceBuild: {
          recipeKind: "existing-reviewed-image",
          recipeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          resolvedCommit: "abc1234deadbeef",
        },
      },
    });
  });

  it("reads bounded candidate evidence through the typed evidence reader instead of raw curl", async () => {
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const sourceCandidate = githubSourceOnlyCandidate();
    const sourceRef = candidateRefs.put(
      sourceCandidate as unknown as Record<string, unknown>,
      validateMcpAutowireCandidate(sourceCandidate).candidateHash,
      "reviewed",
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      evidenceFetch: async () => new Response("README evidence body", { status: 200 }) as any,
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_evidence_read"), {
      candidateRef: sourceRef,
      evidenceId: "sqlite-readme",
    });

    expect(textFromResult(result)).toContain("README evidence body");
    expect(result.details).toMatchObject({
      toolName: "ambient_mcp_autowire_evidence_read",
      status: "fetched",
      candidateRef: sourceRef,
      evidenceId: "sqlite-readme",
    });
  });

  it("derives source-build next input from a reviewed source candidate ref", async () => {
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const sourceCandidate = githubSourceOnlyCandidate();
    const sourceHash = validateMcpAutowireCandidate(sourceCandidate).candidateHash;
    const sourceRef = candidateRefs.put(
      sourceCandidate as unknown as Record<string, unknown>,
      sourceHash,
      "reviewed",
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      sourceBuildCommandRunner: async (input) => ({
        command: input.command,
        args: input.args,
        stdout: `${"a".repeat(40)}\tHEAD\n`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_source_build_describe"), {
      candidateRef: sourceRef,
      expectedCandidateHash: sourceHash,
    });

    expect(textFromResult(result)).toContain("Custom ToolHive source-build plan");
    expect(textFromResult(result)).toContain("Next tool: ambient_mcp_autowire_source_build_create");
    expect(result.details).toMatchObject({
      toolName: "ambient_mcp_autowire_source_build_describe",
      status: "ready-to-build",
      candidateRef: sourceRef,
      nextToolName: "ambient_mcp_autowire_source_build_create",
      nextToolInput: {
        candidateRef: sourceRef,
        expectedCandidateHash: sourceHash,
        sourceBuild: {
          resolvedCommit: "a".repeat(40),
          recipe: {
            kind: "generated-dockerfile",
          },
        },
      },
      forbiddenAlternatives: expect.arrayContaining([
        expect.stringContaining("unmanaged local bridge"),
      ]),
    });
  });

  it("creates a source-built custom-image candidate ref after an Ambient-managed build", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ambient-source-build-pitool-test-"));
    const candidateRefs = createMcpAutowireCandidateRefStore();
    const sourceCandidate = githubSourceOnlyCandidate();
    const sourceHash = validateMcpAutowireCandidate(sourceCandidate).candidateHash;
    const sourceRef = candidateRefs.put(
      sourceCandidate as unknown as Record<string, unknown>,
      sourceHash,
      "reviewed",
    );
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs,
      sourceBuildUserDataPath: userDataPath,
      sourceBuildCommandRunner: async (input) => {
        if (input.command === "git" && input.args[0] === "clone") {
          const repoPath = input.args[input.args.length - 1]!;
          await mkdir(repoPath, { recursive: true });
          await writeFile(join(repoPath, "Cargo.toml"), "[package]\nname = \"sqlite-explorer-fastmcp-mcp-server\"\nversion = \"0.1.0\"\n");
        }
        return {
          command: input.command,
          args: input.args,
          stdout: input.kind === "container-inspect" ? `sha256:${"d".repeat(64)}\n` : "",
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      },
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_autowire_source_build_create"), {
      candidateRef: sourceRef,
      expectedCandidateHash: sourceHash,
      sourceBuild: {
        schemaVersion: "ambient-mcp-custom-source-build-v1",
        sourceUrl: sourceCandidate.source.url,
        resolvedCommit: "b".repeat(40),
        image: {
          identifier: "ambient-source-built/sqlite-explorer-fastmcp:bbbbbbbbbbbb",
        },
        recipe: {
          kind: "generated-dockerfile",
          contextPath: ".",
          dockerfilePath: ".ambient-source-build/Dockerfile",
          generatedDockerfileReviewed: true,
          runtimeCommand: "/usr/local/bin/sqlite-explorer-fastmcp-mcp-server",
        },
      },
    });

    expect(textFromResult(result)).toContain("Custom-image candidate ref for ambient_mcp_standard_import_describe");
    expect(result.details).toMatchObject({
      toolName: "ambient_mcp_autowire_source_build_create",
      status: "ready-for-import",
      imageDigest: `sha256:${"d".repeat(64)}`,
      customImageCandidateRef: expect.stringContaining("ambient-mcp-candidate:sqlite-explorer-fastmcp-source:"),
      nextToolName: "ambient_mcp_standard_import_describe",
      nextToolInput: {
        candidateRef: expect.stringContaining("ambient-mcp-candidate:sqlite-explorer-fastmcp-source:"),
        expectedCandidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it("explains how to recover when a candidate ref is unavailable", async () => {
    const tools = createMcpAutowirePiToolDefinitions({
      apiKey: "test-key",
      model: { id: AMBIENT_DEFAULT_MODEL, baseUrl: "https://ambient.test" } as Model<"openai-completions">,
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "workspace" }),
      workspace: { path: "/tmp/workspace", name: "workspace" },
      candidateRefs: createMcpAutowireCandidateRefStore(),
    });

    await expect(callTool(toolByName(tools, "ambient_mcp_autowire_review"), {
      candidateRef: "ambient-mcp-candidate:missing:0000000000000000",
    })).rejects.toThrow(/rerun ambient_mcp_autowire_plan or pass the exact candidate JSON/);
  });
});

function planResult(): McpAutowirePlanResult {
  const candidate = mcpAutowirePhase0Fixtures.context7;
  return {
    targetUrl: "https://github.com/upstash/context7",
    instructions: "Use the Ambient MCP autowire schema.",
    session: {
      id: "mcp-autowire-install-fixture",
      purpose: "mcp-autowire-install",
      targetUrl: "https://github.com/upstash/context7",
    },
    candidate,
    validation: validateMcpAutowireCandidate(candidate),
    discovery: {
      grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 3, maxSearches: 1, maxBytesPerFetch: 8_000 },
      suggestedUrls: ["https://raw.githubusercontent.com/upstash/context7/master/server.json"],
      fetches: [
        {
          url: "https://raw.githubusercontent.com/upstash/context7/master/server.json",
          status: "fetched",
          statusCode: 200,
          returnedChars: 2_000,
          totalChars: 2_000,
          truncated: false,
        },
      ],
      searches: [
        {
          query: "mcp server metadata manifest",
          status: "searched",
          source: "github-tree",
          defaultBranch: "master",
          resultCount: 1,
          results: [
            {
              path: "server.json",
              url: "https://github.com/upstash/context7/blob/master/server.json",
              rawUrl: "https://raw.githubusercontent.com/upstash/context7/master/server.json",
              reason: "server metadata",
              score: 128,
            },
          ],
        },
      ],
      toolProgress: [],
    },
  };
}

function githubSourceOnlyCandidate(): McpAutowireCandidate {
  const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
  candidate.id = "sqlite-explorer-fastmcp-source";
  candidate.displayName = "SQLite Explorer FastMCP";
  candidate.source = {
    kind: "github",
    url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
    packageName: "sqlite-explorer-fastmcp-mcp-server",
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.runtime = {
    provider: "toolhive",
    sourceKind: "unknown",
    transport: "stdio",
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.permissions = {
    network: { mode: "disabled", allowHosts: [], allowPorts: [] },
    filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
    localApps: [],
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.validationPlan = {
    preflights: ["toolhive-runtime", "container-runtime"],
    expectedTools: ["query"],
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.evidence = [{
    id: "sqlite-readme",
    type: "readme",
    locator: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
    summary: "README describes a GitHub-only FastMCP SQLite server source.",
  }];
  candidate.openQuestions = [];
  candidate.riskSummary = {
    level: "medium",
    reasons: ["GitHub-only source needs a reviewed custom ToolHive source build."],
    evidenceRefs: ["sqlite-readme"],
  };
  return candidate;
}

function normalAppPlanResult(): McpAutowirePlanResult {
  return {
    targetUrl: "https://github.com/opencut-app/opencut-classic",
    session: {
      id: "mcp-autowire-install-normal-app-fixture",
      purpose: "mcp-autowire-install",
      targetUrl: "https://github.com/opencut-app/opencut-classic",
    },
    sourceClassification: {
      kind: "normal_app",
      confidence: "high",
      summary: "The source appears to be a normal application repository, not an MCP/plugin server.",
      signals: [
        "discovery reported missing MCP metadata or MCP entry points",
        "discovery found normal application framework or package-manager indicators",
      ],
      setupRecipe: "normal-app-setup",
      nextAction: "Next action: stop MCP autowire review and continue ordinary app setup with normal file, shell, and browser tools. Call ambient_setup_runtime_preflight before installing dependencies.",
    },
    validation: {
      status: "blocked",
      outcome: "deferred-unsupported-lane",
      readyForToolHiveRun: false,
      readyForUserReview: false,
      blockers: [
        {
          code: "source.normal_app_handoff",
          path: "$.sourceClassification.kind",
          message: "Autowire classified this source as normal_app, so no MCP install candidate was generated.",
          severity: "blocker",
        },
      ],
      warnings: [],
    },
    discovery: {
      grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 3, maxSearches: 1, maxBytesPerFetch: 8_000 },
      suggestedUrls: ["https://github.com/opencut-app/opencut-classic"],
      fetches: [
        {
          url: "https://github.com/opencut-app/opencut-classic",
          status: "fetched",
          statusCode: 200,
          returnedChars: 2_000,
          totalChars: 2_000,
          truncated: false,
        },
      ],
      searches: [],
      toolProgress: [],
    },
  };
}

function toolByName(tools: ReturnType<typeof createMcpAutowirePiToolDefinitions>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function callTool(
  tool: ReturnType<typeof createMcpAutowirePiToolDefinitions>[number],
  input: Record<string, unknown>,
  onUpdate?: Parameters<NonNullable<typeof tool.execute>>[3],
) {
  if (!tool.execute) throw new Error(`Tool ${tool.name} has no execute handler.`);
  return tool.execute("call-1", input, undefined, onUpdate, undefined as any);
}

function textFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}
