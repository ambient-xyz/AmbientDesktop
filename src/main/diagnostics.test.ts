import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AmbientPermissionGrant, LocalRuntimeLeaseRecord, OrchestrationBoard, PermissionAuditEntry, ThreadSummary, WorkspaceState } from "../shared/types";
import { createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../shared/symphonyWorkflowRecipes";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  callableWorkflowToolName,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import { createDiagnosticBundle, diagnosticBundleFileName, redactString, redactValue } from "./diagnostics";
import { buildLocalModelRuntimeStatusSnapshot } from "./localModelRuntimeStatus";
import { ambientTencentMemoryDataDir, inspectTencentDbMemoryDiagnostics } from "./memory/tencentdb";
import { ProjectStore } from "./projectStore";

const gib = 1024 ** 3;

describe("diagnostics", () => {
  let workspacePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-diagnostics-"));
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("redacts secrets in strings and object values", () => {
    expect(redactString("Authorization: Bearer abcdefghijklmnopqrstuv")).toBe("Authorization: Bearer [REDACTED]");
    expect(redactString("api_key=ambient-abcdefghijklmnopqrstuvwxyz")).toBe("api_key=[REDACTED]");
    expect(redactString("schemaVersion=ambient-subagent-repair-diagnostics-v1")).toBe(
      "schemaVersion=ambient-subagent-repair-diagnostics-v1",
    );
    expect(redactValue({
      schemaVersion: "ambient-subagent-repair-diagnostics-v1",
      apiKey: "ambient-abcdefghijklmnopqrstuvwxyz",
      tokenCount: 123,
      nested: { token: "secret-token", tokenCount: 456 },
    })).toEqual({
      schemaVersion: "ambient-subagent-repair-diagnostics-v1",
      apiKey: "[REDACTED]",
      tokenCount: 123,
      nested: { token: "[REDACTED]", tokenCount: 456 },
    });
  });

  it("creates a redacted bundle with sqlite, session, and log excerpts", async () => {
    const statePath = join(workspacePath, ".ambient-codex");
    const sessionPath = join(statePath, "sessions");
    const threadSessionDir = join(sessionPath, "thread-1");
    await mkdir(threadSessionDir, { recursive: true });
    const sessionFile = join(threadSessionDir, "session.jsonl");
    await writeFile(sessionFile, '{"role":"assistant","content":"api_key=ambient-abcdefghijklmnopqrstuvwxyz"}\n', "utf8");
    const memoryDataDir = ambientTencentMemoryDataDir(statePath);
    await mkdir(memoryDataDir, { recursive: true });
    await writeFile(
      join(memoryDataDir, "raw-memory.json"),
      '{"memory":"raw memory secret ambient-abcdefghijklmnopqrstuvwxyz should not appear"}\n',
      "utf8",
    );

    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath,
      sessionPath,
    };
    const threads: ThreadSummary[] = [
      {
        id: "thread-1",
        title: "New chat",
        workspacePath,
        createdAt: "2026-04-29T00:00:00.000Z",
        updatedAt: "2026-04-29T00:00:00.000Z",
          lastMessagePreview: "hello",
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: "zai-org/GLM-5.1-FP8",
        thinkingLevel: "low",
        memoryEnabled: true,
        piSessionFile: sessionFile,
      },
    ];
    const audit: PermissionAuditEntry[] = [
      {
        id: "audit-1",
        threadId: "thread-1",
        createdAt: "2026-04-29T00:00:00.000Z",
        permissionMode: "workspace",
        toolName: "bash",
        risk: "network-command",
        decision: "allowed",
        detail: "Authorization: Bearer abcdefghijklmnopqrstuv",
        reason: "Approved.",
      },
    ];
    const grants: AmbientPermissionGrant[] = [
      {
        id: "grant-1",
        createdAt: "2026-04-29T00:00:00.000Z",
        updatedAt: "2026-04-29T00:00:00.000Z",
        createdBy: "user",
        permissionModeAtCreation: "workspace",
        scopeKind: "workspace",
        workspacePath,
        actionKind: "shell_command",
        targetKind: "shell_command_prefix",
        targetHash: "ambient-abcdefghijklmnopqrstuvwxyz0123456789",
        targetLabel: "api_key=ambient-abcdefghijklmnopqrstuvwxyz",
        source: "permission_prompt",
        reason: "authorization=abcdefghijklmnopqrstuvwxyz123456",
      },
    ];
    const orchestration: OrchestrationBoard = {
      tasks: [],
      runs: [
        {
          id: "run-1",
          taskId: "task-1",
          attemptNumber: 0,
          status: "completed",
          workspacePath,
          piSessionFile: sessionFile,
          startedAt: "2026-04-29T00:00:00.000Z",
          proofOfWork: { apiKey: "ambient-abcdefghijklmnopqrstuvwxyz" },
        },
      ],
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => threads,
        listMessages: () => [
          {
            id: "message-1",
            threadId: "thread-1",
            role: "user",
            content: "Bearer abcdefghijklmnopqrstuv",
            createdAt: "2026-04-29T00:00:00.000Z",
          },
        ],
        listPermissionAudit: () => audit,
        listPermissionGrants: () => grants,
        listOrchestrationBoard: () => orchestration,
        getAgentMemoryDiagnostics: () => inspectTencentDbMemoryDiagnostics({
          workspace,
          settings: {
            enabled: true,
            defaultThreadEnabled: true,
            adapter: "tencentdb",
            shortTermOffloadEnabled: false,
            embeddings: {
              enabled: false,
              providerMode: "ambient-managed",
              autoStartProvider: false,
              sendDimensions: false,
              maxInputChars: 512,
              timeoutMs: 10_000,
              preflightEnabled: true,
            },
            storageScope: "workspace",
          },
          featureFlagSnapshot: resolveAmbientFeatureFlags({
            settings: { tencentDbMemory: true },
            generatedAt: "2026-04-29T00:00:00.000Z",
          }),
          threads,
          now: new Date("2026-04-29T00:00:00.000Z"),
        }),
        getPluginDiagnostics: () => ({
          registry: {
            plugins: [],
            capabilities: [],
            sources: ["workspace source secret=ambient-abcdefghijklmnopqrstuvwxyz"],
            errors: ["Authorization: Bearer abcdefghijklmnopqrstuv"],
            sourceNotes: [],
          },
          codexCatalog: {
            marketplaces: [],
            plugins: [],
            importCandidates: [],
            errors: ["api_key=ambient-abcdefghijklmnopqrstuvwxyz"],
          },
          piPackages: {
            packages: [],
            errors: ["access_token=abcdefghijklmnopqrstuvwxyz123456"],
            sourceNotes: [],
          },
          ambientCliPackages: {
            packages: [],
            errors: ["cli secret=ambient-abcdefghijklmnopqrstuvwxyz"],
          },
          appAuth: [
            {
              connectorId: "gmail",
              providerId: "google",
              providerLabel: "Google",
              status: "error",
              unavailableReason: "refresh_token=abcdefghijklmnopqrstuvwxyz123456",
              accounts: [
                {
                  id: "account-1",
                  accountId: "neo",
                  label: "Neo",
                  email: "neo@example.com",
                  status: "error",
                  grantedScopes: ["mail.read"],
                  connectedAt: "2026-04-29T00:00:00.000Z",
                  updatedAt: "2026-04-29T00:00:00.000Z",
                  validationError: "Bearer abcdefghijklmnopqrstuv",
                },
              ],
            },
          ],
          mcpRuntimes: [
            {
              key: "plugin:server",
              pluginId: "plugin",
              pluginName: "Plugin",
              pluginVersion: "1.0.0",
              pluginFingerprint: '{"version":"1.0.0"}',
              serverName: "server",
              status: "unhealthy",
              permissionMode: "workspace",
              workspacePath: "/tmp/ambient-workspace",
              cwd: "/tmp/ambient-workspace/plugin",
              command: "node",
              args: ["server.js"],
              envKeys: ["TOKEN"],
              requestCount: 1,
              lastError: "password=ambient-abcdefghijklmnopqrstuvwxyz",
              stderr: "secret=ambient-abcdefghijklmnopqrstuvwxyz",
            },
          ],
          errors: ["authorization=abcdefghijklmnopqrstuvwxyz123456"],
        }),
      },
      [{ timestamp: "2026-04-29T00:00:00.000Z", level: "error", message: "secret=ambient-abcdefghijklmnopqrstuvwxyz" }],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.fileName).toBe(diagnosticBundleFileName(new Date("2026-04-29T00:00:00.000Z")));
    expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
      status: "unavailable",
      message: "Sub-agent repair diagnostics were not available for this bundle.",
      issueCount: 0,
      topActions: [],
    });
    expect(payload.bundle.summary.subagents.observability).toMatchObject({
      status: "unavailable",
      message: "Sub-agent observability was not available for this bundle.",
      spawnAttempts: 0,
      failedSpawns: 0,
      failureRate: null,
    });
    expect(payload.bundle.summary.subagents.attribution).toMatchObject({
      status: "unavailable",
      message: "Sub-agent attribution audit was not available for this bundle.",
      auditedRuntimeEventCount: 0,
      auditedParentMailboxEventCount: 0,
      issueCount: 0,
    });
    expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
      status: "unavailable",
      message: "Sub-agent replay evidence was not available for this bundle.",
      runCount: 0,
      runtimeEventCount: 0,
      persistedRunEventCount: 0,
    });
    expect(payload.bundle.localRuntimes.errors).toEqual([]);
    expect(payload.bundle.summary.localRuntimes).toMatchObject({
      status: "unavailable",
      message: "Local runtime diagnostics were not available for this bundle.",
      runtimeCount: 0,
      activeLeaseCount: 0,
      stopBlockedCount: 0,
    });
    expect(payload.bundle.agentMemory.diagnostics).toMatchObject({
      adapter: "tencentdb",
      status: "needs_attention",
      fileCount: 1,
      storageSchemaStatus: "missing",
      storageSchemaExpectedVersion: "ambient-tencent-memory-storage-v1",
      rawContentIncluded: false,
      activeThreadCount: 1,
      nativePreflight: {
        schemaVersion: "ambient-agent-memory-native-preflight-v1",
        status: "needs_attention",
        coreModuleConfigured: true,
      },
    });
    expect(payload.bundle.summary.agentMemory).toMatchObject({
      adapter: "tencentdb",
      status: "needs_attention",
      fileCount: 1,
      storageSchemaStatus: "missing",
      rawContentIncluded: false,
    });
    expect(JSON.stringify(payload.bundle.agentMemory)).not.toContain("raw memory secret");
    expect(JSON.stringify(payload.bundle.agentMemory)).not.toContain("ambient-abcdefghijklmnopqrstuvwxyz");
    expect(payload.bundle.sqlite.threads).toHaveLength(1);
    expect(payload.bundle.sqlite.messages[0].content).toBe("Bearer [REDACTED]");
    expect(payload.bundle.sqlite.permissionAudit[0].detail).toBe("Authorization: Bearer [REDACTED]");
    expect(payload.bundle.sqlite.permissionGrants[0].targetHash).toBe("[REDACTED]");
    expect(payload.bundle.sqlite.permissionGrants[0].targetLabel).toBe("api_key=[REDACTED]");
    expect(payload.bundle.sqlite.permissionGrants[0].reason).toBe("authorization=[REDACTED]");
    expect(payload.bundle.sqlite.orchestration.runs[0].proofOfWork).toEqual({ apiKey: "[REDACTED]" });
    expect(payload.bundle.sessions[0].path).toBe(".ambient-codex/sessions/thread-1/session.jsonl");
    expect(payload.bundle.sessions[0].excerpt).toContain("[REDACTED]");
    expect(payload.bundle.logs[0].message).toBe("secret=[REDACTED]");
    expect(payload.bundle.plugins.registry?.sources[0]).toBe("workspace source secret=[REDACTED]");
    expect(payload.bundle.plugins.registry?.errors[0]).toBe("Authorization: Bearer [REDACTED]");
    expect(payload.bundle.plugins.codexCatalog?.errors[0]).toBe("api_key=[REDACTED]");
    expect(payload.bundle.plugins.piPackages?.errors[0]).toBe("access_token=[REDACTED]");
    expect(payload.bundle.plugins.ambientCliPackages?.errors[0]).toBe("cli secret=[REDACTED]");
    expect(payload.bundle.plugins.appAuth?.[0].unavailableReason).toBe("refresh_token=[REDACTED]");
    expect(payload.bundle.plugins.appAuth?.[0].accounts[0].validationError).toBe("Bearer [REDACTED]");
    expect(payload.bundle.plugins.mcpRuntimes?.[0].lastError).toBe("password=[REDACTED]");
    expect(payload.bundle.plugins.mcpRuntimes?.[0].stderr).toBe("secret=[REDACTED]");
    expect(payload.bundle.plugins.errors[0]).toBe("authorization=[REDACTED]");
  });

  it("exports local runtime status snapshots with sub-agent lease blockers", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };
    const lease = runtimeLease({
      leaseId: "lease-review",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      ownerDisplayName: "Review worker",
    });

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getLocalModelRuntimeStatus: () => buildLocalModelRuntimeStatusSnapshot({
          workspacePath,
          residentProcesses: [
            {
              capability: "local-text",
              id: "local-text:runtime-1:5001",
              pid: 5001,
              running: true,
              statePath: join(workspacePath, ".ambient/local-model-runtime/runtime-1/runtime-state.json"),
              providerId: "local",
              runtimeId: "runtime-1",
              modelId: "local/text-4b",
              profileId: "local-text-4b-q4",
              endpointUrl: "http://127.0.0.1:43123/health",
              estimatedResidentMemoryBytes: 6 * gib,
              actualResidentMemoryBytes: 4 * gib,
              memorySampledAt: "2026-06-05T00:00:00.000Z",
            },
          ],
          leases: [lease],
          now: () => new Date("2026-06-05T00:00:00.000Z"),
        }),
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-06-05T00:00:00.000Z") },
    );

    expect(payload.bundle.localRuntimes.errors).toEqual([]);
    expect(payload.bundle.localRuntimes.status?.summary).toMatchObject({
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      restartBlockedCount: 1,
      activeEstimatedResidentMemoryBytes: 6 * gib,
      activeActualResidentMemoryBytes: 4 * gib,
    });
    expect(payload.bundle.localRuntimes.status?.policyHandoff.activeOwners).toEqual([
      expect.objectContaining({
        leaseId: "lease-review",
        runtimeEntryId: "local-text:runtime-1:5001",
        displayName: "sub-agent Review worker",
        subagentThreadId: "child-thread",
      }),
    ]);
    expect(payload.bundle.localRuntimes.evidence).toMatchObject({
      schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1",
      source: "diagnostic_export",
      capturedAt: "2026-06-05T00:00:00.000Z",
      counts: {
        runtimes: 1,
        activeOwners: 1,
      },
      shownCounts: {
        runtimes: 1,
        activeOwners: 1,
      },
      runtimes: [
        expect.objectContaining({
          runtimeEntryId: "local-text:runtime-1:5001",
          capability: "local-text",
          modelRuntimeId: "runtime-1",
          modelProfileId: "local-text-4b-q4",
          activeLeaseIds: ["lease-review"],
          ordinaryStopAllowed: false,
          ordinaryRestartAllowed: false,
          forceStopRequiresSubagentCancellation: true,
        }),
      ],
      activeOwners: [
        expect.objectContaining({
          runtimeEntryId: "local-text:runtime-1:5001",
          leaseId: "lease-review",
          displayName: "sub-agent Review worker",
          subagentThreadId: "child-thread",
          modelRuntimeId: "runtime-1",
          actualResidentMemoryBytes: 4 * gib,
        }),
      ],
    });
    expect(payload.bundle.localRuntimes.evidence?.blockedActions.length).toBeGreaterThan(0);
    expect(payload.bundle.localRuntimes.evidence?.nextSafeActions.length).toBeGreaterThan(0);
    expect(payload.bundle.summary.localRuntimes).toMatchObject({
      status: "needs_attention",
      message: "Local runtime diagnostics found 1 runtime, 1 active lease, and 1 lifecycle blocker.",
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 1,
      stopBlockedCount: 1,
      restartBlockedCount: 1,
      untrackedCount: 0,
      staleLeaseCount: 0,
      crashedLeaseCount: 0,
      activeEstimatedResidentMemoryBytes: 6 * gib,
      activeActualResidentMemoryBytes: 4 * gib,
    });
  });

  it("records a local runtime diagnostics provider failure without failing the export", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getLocalModelRuntimeStatus: () => {
          throw new Error("auth secret=ambient-abcdefghijklmnopqrstuvwxyz");
        },
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.bundle.localRuntimes.errors[0]).toBe("Local runtime diagnostics failed: auth secret=[REDACTED]");
    expect(payload.bundle.summary.localRuntimes).toMatchObject({
      status: "error",
      message: "Local runtime diagnostics failed to collect 1 error.",
      errorMessages: ["Local runtime diagnostics failed: auth secret=[REDACTED]"],
    });
    expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
      status: "unavailable",
      message: "Sub-agent repair diagnostics were not available for this bundle.",
    });
  });

  it("exports the resolved feature flag snapshot in diagnostic summaries", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };
    const featureFlags = resolveAmbientFeatureFlags({
      settings: { subagents: true },
      startup: { enabled: [], disabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getFeatureFlagSnapshot: () => featureFlags,
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-06-05T00:00:30.000Z") },
    );

    expect(payload.bundle.summary.featureFlags?.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG]).toMatchObject({
      enabled: false,
      source: "startup_arg_disable",
      defaultEnabled: false,
      settingsEnabled: true,
    });
  });

  it("exports bounded read-only sub-agent repair diagnostics", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Completed without artifact",
        roleId: "reviewer",
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        now: "2026-06-05T00:00:10.000Z",
      });
      const eventCountBefore = store.listSubagentRunEvents(run.id).length;

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-05T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.errors).toEqual([]);
      expect(payload.bundle.subagents.repairDiagnostics).toMatchObject({
        schemaVersion: "ambient-subagent-repair-diagnostics-v1",
        createdAt: "2026-06-05T00:00:30.000Z",
        issueCount: 1,
        shownIssueCount: 1,
        truncatedIssues: false,
        warningCount: 1,
        actionCounts: {
          inspect_result_artifact: 1,
        },
        affectedRunIds: [run.id],
        affectedThreadIds: [run.childThreadId],
      });
      expect(payload.bundle.subagents.repairDiagnostics?.issues).toEqual([
        expect.objectContaining({
          kind: "missing_result_artifact",
          action: "inspect_result_artifact",
          destructive: false,
          runId: run.id,
          threadId: run.childThreadId,
        }),
      ]);
      expect(payload.bundle.subagents.repairDiagnostics?.issues[0]).not.toHaveProperty("message");
      expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
        status: "needs_attention",
        message: "Sub-agent repair diagnostics found 1 issue.",
        issueCount: 1,
        shownIssueCount: 1,
        warningCount: 1,
        affectedRunCount: 1,
        affectedThreadCount: 1,
        topActions: [
          {
            action: "inspect_result_artifact",
            label: "Inspect result artifact",
            count: 1,
          },
        ],
        errorMessages: [],
      });
      expect(payload.bundle.subagents.observability).toMatchObject({
        schemaVersion: "ambient-subagent-observability-summary-v1",
        createdAt: "2026-06-05T00:00:30.000Z",
        spawnAttempts: 1,
        failedSpawns: 0,
      });
      expect(payload.bundle.summary.subagents.observability).toMatchObject({
        status: "healthy",
        message: "Sub-agent observability recorded activity with no support signals.",
        spawnAttempts: 1,
        failedSpawns: 0,
        failureRate: 0,
      });
      expect(payload.bundle.summary.subagents.attribution).toMatchObject({
        status: "healthy",
        message: "Sub-agent attribution audit found no child-originating events to inspect.",
        auditedRuntimeEventCount: 0,
        auditedParentMailboxEventCount: 0,
        issueCount: 0,
      });
      expect(payload.bundle.sqlite.messages).toEqual([]);
      expect(store.listSubagentRunEvents(run.id)).toHaveLength(eventCountBefore);
    } finally {
      store.close();
    }
  });

  it("exports sub-agent observability aggregates and diagnostic replay evidence", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          deniedCategories: [{ id: "workspace.write", reason: "Mutating child requires an isolated worktree." }],
          loadedTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          piVisibleTools: [{
            source: "built_in",
            id: "workspace.read",
            categoryId: "workspace.read",
            piVisible: true,
            mutatesState: false,
            requiresApproval: false,
          }],
          deniedTools: [{
            source: "built_in",
            id: "workspace.write",
            categoryId: "workspace.write",
            reason: "Mutating child requires an isolated worktree.",
          }],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        },
        createdAt: "2026-06-05T00:00:05.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.spawn_failed",
        preview: { reason: "provider capacity unavailable" },
        createdAt: "2026-06-05T00:00:06.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "usage",
          source: "child_runtime",
          runId: run.id,
          parentThreadId: run.parentThreadId,
          parentRunId: run.parentRunId,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:07.000Z",
          tokenCount: 17,
          costMicros: 9,
          localMemoryBytes: 4096,
          toolName: "write",
          status: "completed",
          details: {
            approvalSource: "permission_grant",
            approvalId: "approval-worker",
            worktreeIsolated: true,
            worktreePath: join(workspacePath, ".ambient-codex/worktrees", run.childThreadId),
          },
        },
        createdAt: "2026-06-05T00:00:07.000Z",
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "assistant",
        content: "Child replay evidence transcript preview for diagnostics.",
        metadata: {
          childRunId: run.id,
          childThreadId: run.childThreadId,
        },
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.restart_reconciled",
        preview: { reason: "desktop_restart" },
        createdAt: "2026-06-05T00:00:08.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.child_runtime_aborted",
        preview: {
          reason: "runtime_budget_exceeded",
          status: "aborted_partial",
        },
        createdAt: "2026-06-05T00:00:09.000Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.needs_attention",
        preview: {
          status: "needs_attention",
          summary: "Child needs parent steering before continuing.",
        },
        createdAt: "2026-06-05T00:00:09.500Z",
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:10.000Z",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "satisfied", {
        now: "2026-06-05T00:00:12.000Z",
      });
      store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        child: {
          runId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          roleId: run.roleId,
          status: "completed",
          summary: "Explorer child completed in the background.",
          completedAt: "2026-06-05T00:00:13.000Z",
        },
        createdAt: "2026-06-05T00:00:13.000Z",
      });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-05T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.errors).toEqual([]);
      expect(payload.bundle.subagents.observability).toMatchObject({
        schemaVersion: "ambient-subagent-observability-summary-v1",
        createdAt: "2026-06-05T00:00:30.000Z",
        spawnAttempts: 1,
        failedSpawns: 1,
        waitDurations: {
          count: 1,
          totalMs: 2000,
          maxMs: 2000,
        },
        toolDenials: {
          count: 1,
          byCategory: {
            "workspace.write": 1,
          },
        },
        usage: {
          tokenCount: 17,
          costMicros: 9,
        },
        localMemory: {
          eventCount: 1,
          peakBytes: 4096,
        },
        childRuntimeAborts: 1,
        groupedCompletions: 1,
        needsAttentionRequests: 1,
        restartReconciliations: 1,
      });
      expect(payload.bundle.summary.subagents.observability).toMatchObject({
        status: "needs_attention",
        message: "Sub-agent observability recorded 5 support signals.",
        spawnAttempts: 1,
        failedSpawns: 1,
        failureRate: 1,
        waitDurationCount: 1,
        waitDurationTotalMs: 2000,
        waitDurationMaxMs: 2000,
        childIdleOpenRunCount: expect.any(Number),
        childIdleTotalMs: expect.any(Number),
        childIdleMaxMs: expect.any(Number),
        childRuntimeAborts: 1,
        toolDenialCount: 1,
        groupedCompletions: 1,
        needsAttentionRequests: 1,
        restartReconciliations: 1,
        tokenCount: 17,
        costMicros: 9,
        localMemoryPeakBytes: 4096,
        errorMessages: [],
      });
      expect(payload.bundle.subagents.attributionAudit).toMatchObject({
        status: "healthy",
        message: "Sub-agent attribution audit verified 2 child-originating events.",
        auditedRuntimeEventCount: 1,
        auditedParentMailboxEventCount: 1,
        issueCount: 0,
      });
      expect(payload.bundle.subagents.replayEvidence).toMatchObject({
        schemaVersion: "ambient-subagent-replay-evidence-v1",
        source: "diagnostic_export",
        liveTokens: false,
        truncated: false,
        counts: {
          runs: 1,
          childThreads: 1,
          persistedRunEvents: 7,
          runtimeEvents: 1,
          parentMailboxEvents: 1,
          transcriptMessages: 1,
        },
        shownCounts: {
          runs: 1,
          childThreads: 1,
          persistedRunEvents: 7,
          runtimeEvents: 1,
          parentMailboxEvents: 1,
          transcriptMessages: 1,
        },
        childThreads: [
          expect.objectContaining({
            threadId: run.childThreadId,
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: run.parentRunId,
            canonicalTaskPath: run.canonicalTaskPath,
            collapsedByDefault: true,
          }),
        ],
        runtimeEventTimeline: [
          expect.objectContaining({
            runId: run.id,
            parentRunId: run.parentRunId,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            roleId: "explorer",
            source: "child_runtime",
            type: "usage",
            toolName: "write",
            status: "completed",
            approvalSource: "permission_grant",
            approvalId: "approval-worker",
            worktreeIsolated: true,
            worktreePath: redactString(join(workspacePath, ".ambient-codex/worktrees", run.childThreadId)),
          }),
        ],
        parentMailboxTimeline: [
          expect.objectContaining({
            parentThreadId: parent.id,
            parentRunId: run.parentRunId,
            type: "subagent.grouped_completion",
            deliveryState: "queued",
            childRunIds: [run.id],
            payloadPreview: expect.stringContaining("Explorer child completed in the background."),
          }),
        ],
        transcriptTimeline: [
          expect.objectContaining({
            threadId: run.childThreadId,
            role: "assistant",
            childRunId: run.id,
            childThreadId: run.childThreadId,
            contentPreview: "Child replay evidence transcript preview for diagnostics.",
          }),
        ],
      });
      expect(payload.bundle.subagents.replayEvidence?.persistedRunEventTimeline).toHaveLength(7);
      expect(payload.bundle.subagents.replayEvidence?.persistedRunEventTimeline.map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.spawn_failed",
        "subagent.runtime_event",
        "subagent.restart_reconciled",
        "subagent.child_runtime_aborted",
        "subagent.needs_attention",
      ]));
      expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
        status: "healthy",
        message: "Sub-agent replay evidence captured timelines for 1 child run.",
        runCount: 1,
        childThreadCount: 1,
        persistedRunEventCount: 7,
        runtimeEventCount: 1,
        parentMailboxEventCount: 1,
        transcriptMessageCount: 1,
        truncated: false,
      });
      expect(payload.bundle.summary.subagents.attribution).toMatchObject({
        status: "healthy",
        auditedRuntimeEventCount: 1,
        auditedParentMailboxEventCount: 1,
        issueCount: 0,
      });
    } finally {
      store.close();
    }
  });

  it("exports tool-scope denial metadata in parent mailbox replay evidence", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run-tool-scope",
        parentMessageId: "parent-message-tool-scope",
        title: "Connector reader",
        roleId: "explorer",
        canonicalTaskPath: "root/0:connector-reader",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const toolScopeSnapshot = store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read"],
          piVisibleCategories: ["workspace.read"],
          deniedCategories: [{ id: "connector.read", reason: "Capability requires interactive approval." }],
          loadedTools: [],
          piVisibleTools: [],
          deniedTools: [{
            source: "connector_app",
            id: "gmail.search",
            categoryId: "connector.read",
            reason: "Capability requires interactive approval.",
          }],
          approvalMode: "non_interactive",
          worktreeIsolated: true,
          fanoutAvailable: false,
        },
        createdAt: "2026-06-05T00:00:02.000Z",
      });
      store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: run.parentMessageId,
        type: "subagent.spawn_failed",
        deliveryState: "queued",
        idempotencyKey: "spawn:noninteractive-approval-unavailable",
        createdAt: "2026-06-05T00:00:03.000Z",
        payload: {
          schemaVersion: "ambient-subagent-spawn-failure-v1",
          failureStage: "tool_scope",
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          reason: "Capability requires interactive approval, but this launch is non-interactive.",
          toolScopeSnapshot: {
            runId: toolScopeSnapshot.runId,
            sequence: toolScopeSnapshot.sequence,
            createdAt: toolScopeSnapshot.createdAt,
            schemaVersion: toolScopeSnapshot.scope.schemaVersion,
            deniedCategories: toolScopeSnapshot.scope.deniedCategories,
            deniedTools: toolScopeSnapshot.scope.deniedTools,
            approvalMode: toolScopeSnapshot.scope.approvalMode,
            worktreeIsolated: toolScopeSnapshot.scope.worktreeIsolated,
            fanoutAvailable: toolScopeSnapshot.scope.fanoutAvailable,
          },
        },
      });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-05T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.replayEvidence?.parentMailboxTimeline).toEqual([
        expect.objectContaining({
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          type: "subagent.spawn_failed",
          deliveryState: "queued",
          childRunIds: [run.id],
          childThreadIds: [run.childThreadId],
          canonicalTaskPaths: [run.canonicalTaskPath],
          childSourceLabels: [`${run.canonicalTaskPath} / run ${run.id} / thread ${run.childThreadId}`],
          idempotencyKey: "spawn:noninteractive-approval-unavailable",
          payloadPreview: "Capability requires interactive approval, but this launch is non-interactive.",
          failureStage: "tool_scope",
          approvalMode: "non_interactive",
          approvalUnavailable: true,
          deniedCategoryIds: ["connector.read"],
          deniedToolIds: ["connector_app:gmail.search"],
          deniedCategoryLabels: ["Connector Read (connector.read)"],
          deniedToolLabels: ["Connector App gmail.search / Connector Read (connector.read)"],
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exports callable workflow task replay evidence with child caller and artifact links", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-11T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: enabledFlags });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Replay child callable workflow task evidence.",
          blocking: true,
          metricCriteria: [{ templateId: "map_reduce-metric", value: "Replay evidence keeps child workflow links." }],
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "diagnostic-callable-workflow-tool-call",
        callerProvenance: {
          kind: "subagent_child_thread",
          threadId: "child-thread",
          runId: "child-run",
          messageId: "child-message",
          subagentRunId: "subagent-run",
          canonicalTaskPath: "root/0:worker",
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          approval: {
            required: true,
            source: "child_bridge_policy",
            failureHandling: "forward approval to parent",
            scopeHint: "this_child_thread",
          },
          worktree: {
            required: true,
            isolated: true,
            status: "active",
            workspacePath,
            worktreePath: workspacePath,
            branchName: "ambient/child",
          },
          nestedFanout: {
            required: true,
            source: "child_bridge_policy",
          },
        },
        createdAt: "2026-06-11T00:00:01.000Z",
      });
      const queued = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: enabledFlags,
        createdAt: "2026-06-11T00:00:01.000Z",
      });
      store.beginCallableWorkflowTaskCompilerHandoff(queued.id, { createdAt: "2026-06-11T00:00:02.000Z" });
      const workflowThread = store.createWorkflowAgentThreadSummary({
        title: "Replay Workflow",
        initialRequest: "Compile replay workflow.",
        phase: "compiling",
        projectPath: workspacePath,
      });
      const artifact = store.createWorkflowArtifact({
        workflowThreadId: workflowThread.id,
        title: "Replay Child Mutation",
        status: "ready_for_preview",
        manifest: { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" },
        spec: { goal: "Replay child callable workflow.", summary: "Diagnostic replay artifact." },
        sourcePath: join(workspacePath, ".ambient-codex", "workflows", "replay", "main.ts"),
        statePath: join(workspacePath, ".ambient-codex", "workflows", "replay", "state.json"),
      });
      store.linkCallableWorkflowTaskArtifact({
        id: queued.id,
        workflowArtifactId: artifact.id,
        createdAt: "2026-06-11T00:00:03.000Z",
      });
      const run = store.startWorkflowRun({ artifactId: artifact.id, status: "running" });
      store.markCallableWorkflowTaskRunStarted({
        id: queued.id,
        workflowRunId: run.id,
        createdAt: "2026-06-11T00:00:04.000Z",
      });
      store.appendWorkflowRunEvent({
        runId: run.id,
        type: "workflow.step.completed",
        message: "Replay workflow step completed.",
        createdAt: "2026-06-11T00:00:05.000Z",
      });
      const succeededRun = store.updateWorkflowRun({ id: run.id, status: "succeeded", finish: true });
      store.markCallableWorkflowTaskRunFinished({
        id: queued.id,
        workflowRunId: run.id,
        runStatus: succeededRun.status,
        createdAt: "2026-06-11T00:00:06.000Z",
      });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-11T00:00:30.000Z"),
      });

      expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
        callableWorkflowTaskCount: 1,
      });
      expect(payload.bundle.subagents.replayEvidence?.counts.callableWorkflowTasks).toBe(1);
      expect(payload.bundle.subagents.replayEvidence?.callableWorkflowTaskTimeline).toEqual([
        expect.objectContaining({
          taskId: queued.id,
          launchId: queued.launchId,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: "Symphony Map-Reduce",
          status: "succeeded",
          statusLabel: "Succeeded",
          blocking: true,
          runnerDeferredReason: "workflow_run_succeeded",
          workflowThreadId: workflowThread.id,
          workflowArtifactId: artifact.id,
          workflowArtifactTitle: "Replay Child Mutation",
          workflowArtifactStatus: "ready_for_preview",
          workflowArtifactSourcePath: expect.stringContaining(".ambient-codex/workflows/replay/main.ts"),
          workflowArtifactStatePath: expect.stringContaining(".ambient-codex/workflows/replay/state.json"),
          workflowArtifactMutationPolicy: "staged_until_approved",
          workflowRunId: run.id,
          workflowRunStatus: "succeeded",
          workflowRunEventTypes: expect.arrayContaining([
            "callable_workflow.task_started",
            "workflow.step.completed",
            "callable_workflow.task_finished",
          ]),
          artifactLinkState: "linked",
          runLinkState: "linked",
          callerKind: "subagent_child_thread",
          childThreadId: "child-thread",
          childRunId: "child-run",
          subagentRunId: "subagent-run",
          canonicalTaskPath: "root/0:worker",
          approvalSource: "child_bridge_policy",
          approvalScope: "this_child_thread",
          worktreeIsolated: true,
          worktreeStatus: "active",
          nestedFanoutSource: "child_bridge_policy",
          lastEventType: "callable_workflow.task_finished",
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exports callable workflow restart issue provenance in replay repair evidence", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-11T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot: enabledFlags });
      const descriptor = registry.tools.find((tool) => tool.name === callableWorkflowToolName(SYMPHONY_WORKFLOW_PATTERN_IDS[0]));
      if (!descriptor) throw new Error("Missing callable workflow descriptor.");
      const executionPlan = buildCallableWorkflowExecutionPlan({
        descriptor,
        runPlan: buildCallableWorkflowRunPlan(descriptor, {
          goal: "Replay interrupted child callable workflow task.",
          blocking: true,
          metricCriteria: [{ templateId: "map_reduce-metric", value: "Restart evidence keeps child provenance." }],
        }),
        parent: {
          threadId: parent.id,
          runId: parentRun.id,
          assistantMessageId: assistant.id,
        },
        toolCallId: "diagnostic-callable-workflow-interrupted",
        callerProvenance: {
          kind: "subagent_child_thread",
          threadId: "child-thread",
          runId: "child-run",
          messageId: "child-message",
          subagentRunId: "subagent-run",
          canonicalTaskPath: "root/0:worker",
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          approval: {
            required: true,
            source: "child_bridge_policy",
            failureHandling: "forward approval to parent",
            scopeHint: "this_child_thread",
          },
          worktree: {
            required: true,
            isolated: true,
            status: "active",
            workspacePath,
            worktreePath: workspacePath,
            branchName: "ambient/child",
          },
          nestedFanout: {
            required: true,
            source: "child_bridge_policy",
          },
        },
        createdAt: "2026-06-11T00:00:01.000Z",
      });
      const queued = store.enqueueCallableWorkflowTask({
        executionPlan,
        featureFlagSnapshot: enabledFlags,
        createdAt: "2026-06-11T00:00:01.000Z",
      });
      store.beginCallableWorkflowTaskCompilerHandoff(queued.id, { createdAt: "2026-06-11T00:00:02.000Z" });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-11T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.repairDiagnostics?.callableWorkflowTasks?.issueCount).toBe(1);
      expect(payload.bundle.subagents.repairDiagnostics?.callableWorkflowTasks?.issues[0]).not.toHaveProperty("message");
      expect(payload.bundle.subagents.replayEvidence?.restartRepair.callableWorkflowTaskIssues).toEqual([
        expect.objectContaining({
          kind: "active_task_interrupted",
          severity: "warning",
          taskId: queued.id,
          taskStatus: "compiling",
          taskStatusLabel: "Compiling",
          blocking: true,
          runnerDeferredReason: "workflow_artifact_not_compiled",
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          callerKind: "subagent_child_thread",
          callerThreadId: "child-thread",
          callerRunId: "child-run",
          childThreadId: "child-thread",
          childRunId: "child-run",
          subagentRunId: "subagent-run",
          canonicalTaskPath: "root/0:worker",
          childParentThreadId: parent.id,
          childParentRunId: parentRun.id,
          approvalSource: "child_bridge_policy",
          approvalScope: "this_child_thread",
          worktreeRequired: true,
          worktreeIsolated: true,
          worktreeStatus: "active",
          nestedFanoutRequired: true,
          nestedFanoutSource: "child_bridge_policy",
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exports completion guard metadata in parent mailbox replay evidence", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run-guard",
        parentMessageId: "parent-message-guard",
        title: "Workspace writer",
        roleId: "worker",
        canonicalTaskPath: "root/0:worker",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: run.parentMessageId,
        type: "subagent.wait_barrier_attention",
        deliveryState: "queued",
        idempotencyKey: "wait-barrier-attention:guard",
        createdAt: "2026-06-05T00:00:03.000Z",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          waitBarrierId: "barrier-guard",
          barrierStatus: "failed",
          dependencyMode: "required_all",
          reason: "Child result is not synthesis-safe.",
          resultValidation: {
            valid: false,
            synthesisAllowed: false,
            partial: false,
            status: "completed",
            reason: "Missing approval provenance.",
            completionGuardValidation: {
              valid: false,
              synthesisAllowed: false,
              required: true,
              structuredEvidenceCount: 1,
              ambientEvidenceCount: 1,
              isolatedWorktreeEvidenceCount: 1,
              approvalEvidenceCount: 0,
              reason: "Missing approval provenance.",
            },
          },
          parentResolution: {
            schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
            childRunId: run.id,
            childStatus: "completed",
            action: "ask_user",
            status: "blocked",
          },
        },
      });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-05T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.replayEvidence?.parentMailboxTimeline).toEqual([
        expect.objectContaining({
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          type: "subagent.wait_barrier_attention",
          deliveryState: "queued",
          childRunIds: [run.id],
          idempotencyKey: "wait-barrier-attention:guard",
          payloadPreview: "Child result is not synthesis-safe.",
          completionGuardSummary: {
            valid: false,
            synthesisAllowed: false,
            required: true,
            structuredEvidenceCount: 1,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 0,
            reason: "Missing approval provenance.",
          },
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exports lifecycle metadata in parent mailbox replay evidence", async () => {
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run-lifecycle",
        parentMessageId: "parent-message-lifecycle",
        title: "Required worker",
        roleId: "worker",
        canonicalTaskPath: "root/0:worker",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: run.parentRunId,
        parentMessageId: run.parentMessageId,
        type: "subagent.wait_barrier_decision",
        deliveryState: "delivered",
        idempotencyKey: "barrier:cancel-parent",
        createdAt: "2026-06-05T00:00:03.000Z",
        deliveredAt: "2026-06-05T00:00:03.000Z",
        payload: {
          schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          waitBarrierId: "barrier-lifecycle",
          barrierStatus: "cancelled",
          childRunIds: [run.id],
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          decision: "cancel_parent",
          userDecisionPreview: "Stop the parent task.",
          cancelledRunIds: [run.id],
          detachedRunIds: ["detached-child"],
          unchangedRunIds: ["unchanged-child"],
          cancelledWaitBarrierIds: ["barrier-lifecycle"],
          cancelledMailboxEventIds: ["mailbox-followup"],
          parentCancellationRequested: true,
          reason: "User stopped the parent.",
        },
      });

      const payload = await createDiagnosticBundle(store, [], {
        appName: "Ambient Desktop",
        appVersion: "0.1.0",
        now: new Date("2026-06-05T00:00:30.000Z"),
      });

      expect(payload.bundle.subagents.replayEvidence?.parentMailboxTimeline).toEqual([
        expect.objectContaining({
          parentThreadId: parent.id,
          parentRunId: run.parentRunId,
          parentMessageId: run.parentMessageId,
          type: "subagent.wait_barrier_decision",
          deliveryState: "delivered",
          idempotencyKey: "barrier:cancel-parent",
          childRunIds: expect.arrayContaining(["detached-child", run.id, "unchanged-child"]),
          childThreadIds: [run.childThreadId],
          canonicalTaskPaths: [run.canonicalTaskPath],
          lifecycleSummary: {
            action: "cancel_parent",
            waitBarrierId: "barrier-lifecycle",
            barrierStatus: "cancelled",
            reason: "User stopped the parent.",
            userDecisionPreview: "Stop the parent task.",
            detachedRunIds: ["detached-child"],
            cancelledRunIds: [run.id],
            unchangedRunIds: ["unchanged-child"],
            cancelledWaitBarrierIds: ["barrier-lifecycle"],
            cancelledMailboxEventIds: ["mailbox-followup"],
            parentCancellationRequested: true,
          },
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exports a bounded sub-agent attribution audit for malformed persisted event data", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };
    const run = {
      id: "child-run",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:reviewer",
    } as any;

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        listAllSubagentRuns: () => [run],
        listSubagentRunEvents: () => [
          {
            runId: run.id,
            sequence: 1,
            type: "subagent.runtime_event",
            createdAt: "2026-06-05T00:00:01.000Z",
            preview: {
              schemaVersion: "ambient-subagent-runtime-event-v1",
              type: "tool_call",
              source: "child_runtime",
              runId: "other-child",
              parentThreadId: run.parentThreadId,
              parentRunId: run.parentRunId,
              childThreadId: run.childThreadId,
              canonicalTaskPath: run.canonicalTaskPath,
              createdAt: "2026-06-05T00:00:01.000Z",
            },
          },
          {
            runId: run.id,
            sequence: 2,
            type: "subagent.runtime_event",
            createdAt: "2026-06-05T00:00:02.000Z",
            preview: {
              schemaVersion: "ambient-subagent-runtime-event-v1",
              type: "error",
              source: "child_runtime",
              runId: run.id,
              createdAt: "2026-06-05T00:00:02.000Z",
            },
          },
        ],
        listSubagentParentMailboxEventsForParentRun: () => [
          {
            id: "mailbox-1",
            parentThreadId: run.parentThreadId,
            parentRunId: run.parentRunId,
            type: "subagent.lifecycle_interrupted",
            payload: {
              schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
              parentRunId: run.parentRunId,
              status: "failed",
            },
            deliveryState: "queued",
            createdAt: "2026-06-05T00:00:03.000Z",
            updatedAt: "2026-06-05T00:00:03.000Z",
          },
        ],
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-06-05T00:00:30.000Z") },
    );

    expect(payload.bundle.subagents.errors).toEqual([]);
    expect(payload.bundle.subagents.attributionAudit).toMatchObject({
      status: "needs_attention",
      message: "Sub-agent attribution audit found 3 issues.",
      auditedRuntimeEventCount: 2,
      auditedParentMailboxEventCount: 1,
      issueCount: 3,
      shownIssueCount: 3,
      truncatedIssues: false,
      missingAttributionCount: 2,
      mismatchedRunIdCount: 1,
    });
    expect(payload.bundle.subagents.attributionAudit?.issueSamples).toEqual([
      expect.objectContaining({
        eventType: "subagent.runtime_event",
        runId: run.id,
        parentRunId: run.parentRunId,
        message: "Sub-agent runtime event runId other-child does not match persisted child run child-run.",
      }),
      expect.objectContaining({
        eventType: "subagent.runtime_event",
        runId: run.id,
        parentRunId: run.parentRunId,
        message: "Sub-agent runtime event is missing attribution fields: parentThreadId, parentRunId, childThreadId, canonicalTaskPath.",
      }),
      expect.objectContaining({
        eventType: "subagent.lifecycle_interrupted",
        parentRunId: run.parentRunId,
        message: "Sub-agent parent mailbox event subagent.lifecycle_interrupted must identify at least one originating child run.",
      }),
    ]);
    expect(payload.bundle.summary.subagents.attribution).toMatchObject({
      status: "needs_attention",
      auditedRuntimeEventCount: 2,
      auditedParentMailboxEventCount: 1,
      issueCount: 3,
      missingAttributionCount: 2,
      mismatchedRunIdCount: 1,
    });
  });

  it("records a plugin diagnostics provider failure without failing the export", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getPluginDiagnostics: () => {
          throw new Error("auth secret=ambient-abcdefghijklmnopqrstuvwxyz");
        },
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.bundle.plugins.errors[0]).toBe("Plugin diagnostics failed: auth secret=[REDACTED]");
  });

  it("records a sub-agent diagnostics provider failure without failing the export", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getSubagentRepairDiagnostics: () => {
          throw new Error("auth secret=ambient-abcdefghijklmnopqrstuvwxyz");
        },
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.bundle.subagents.errors[0]).toBe("Sub-agent diagnostics failed: auth secret=[REDACTED]");
    expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
      status: "error",
      message: "Sub-agent diagnostics failed to collect 1 error.",
      errorMessages: ["Sub-agent diagnostics failed: auth secret=[REDACTED]"],
    });
    expect(payload.bundle.summary.subagents.observability).toMatchObject({
      status: "unavailable",
      message: "Sub-agent observability was not available for this bundle.",
    });
    expect(payload.bundle.summary.subagents.attribution).toMatchObject({
      status: "unavailable",
      message: "Sub-agent attribution audit was not available for this bundle.",
    });
    expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
      status: "unavailable",
      message: "Sub-agent replay evidence was not available for this bundle.",
    });
  });

  it("records a sub-agent observability provider failure without failing the export", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        getSubagentObservabilitySummary: () => {
          throw new Error("auth secret=ambient-abcdefghijklmnopqrstuvwxyz");
        },
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.bundle.subagents.errors[0]).toBe("Sub-agent observability failed: auth secret=[REDACTED]");
    expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
      status: "unavailable",
      message: "Sub-agent repair diagnostics were not available for this bundle.",
    });
    expect(payload.bundle.summary.subagents.observability).toMatchObject({
      status: "error",
      message: "Sub-agent observability failed to collect 1 error.",
      errorMessages: ["Sub-agent observability failed: auth secret=[REDACTED]"],
    });
    expect(payload.bundle.summary.subagents.attribution).toMatchObject({
      status: "unavailable",
      message: "Sub-agent attribution audit was not available for this bundle.",
    });
    expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
      status: "unavailable",
      message: "Sub-agent replay evidence was not available for this bundle.",
    });
  });

  it("records a sub-agent replay evidence provider failure without failing the export", async () => {
    const workspace: WorkspaceState = {
      path: workspacePath,
      name: "project",
      statePath: join(workspacePath, ".ambient-codex"),
      sessionPath: join(workspacePath, ".ambient-codex", "sessions"),
    };

    const payload = await createDiagnosticBundle(
      {
        getWorkspace: () => workspace,
        listThreads: () => [],
        listMessages: () => [],
        listPermissionAudit: () => [],
        listOrchestrationBoard: () => ({ tasks: [], runs: [] }),
        listAllSubagentRuns: () => {
          throw new Error("auth secret=ambient-abcdefghijklmnopqrstuvwxyz");
        },
        listSubagentRunEvents: () => [],
      },
      [],
      { appName: "Ambient Desktop", appVersion: "0.1.0", now: new Date("2026-04-29T00:00:00.000Z") },
    );

    expect(payload.bundle.subagents.errors[0]).toBe("Sub-agent replay evidence failed: auth secret=[REDACTED]");
    expect(payload.bundle.summary.subagents.replayEvidence).toMatchObject({
      status: "error",
      message: "Sub-agent replay evidence failed to collect 1 error.",
      errorMessages: ["Sub-agent replay evidence failed: auth secret=[REDACTED]"],
    });
    expect(payload.bundle.summary.subagents.repairDiagnostics).toMatchObject({
      status: "unavailable",
      message: "Sub-agent repair diagnostics were not available for this bundle.",
    });
    expect(payload.bundle.summary.subagents.attribution).toMatchObject({
      status: "unavailable",
      message: "Sub-agent attribution audit was not available for this bundle.",
    });
  });
});

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-1",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Worker",
    modelRuntimeId: "runtime-1",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 4 * gib,
    pid: 5001,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-05T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}
