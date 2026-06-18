import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";
import { createLocalRuntimeToolExtension } from "./agentRuntimeLocalRuntimeTools";

describe("createLocalRuntimeToolExtension", () => {
  it("registers local model runtime status, start, stop, and restart tools", async () => {
    const registeredTools: any[] = [];
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getActiveRuntimeLeases: () => [runtimeLease()],
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const tool = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_status");
    expect(tool).toBeDefined();
    expect(registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_start")).toBeDefined();
    expect(registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop")).toBeDefined();
    expect(registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart")).toBeDefined();
    expect(tool.executionMode).toBe("sequential");
    expect(tool.parameters).toMatchObject({
      properties: {
        includeStopped: { type: "boolean" },
        limit: { type: "number" },
      },
    });

    const result = await tool.execute("status-call", { limit: 2 });
    expect(result.content[0].text).toContain("Local model runtime status");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_status",
      status: "complete",
      schemaVersion: "ambient-local-model-runtime-status-v1",
      summary: {
        activeLeaseCount: 1,
      },
      inventory: {
        activeLeases: [
          expect.objectContaining({ leaseId: "lease-review" }),
        ],
      },
    });
  });

  it("blocks Start for active sub-agent local runtime leases", async () => {
    const registeredTools: any[] = [];
    const startRuntime = viFnUnexpectedStartRuntime();
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getActiveRuntimeLeases: () => [runtimeLease()],
      startRuntime,
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const start = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_start");
    const result = await start.execute("start-call", { runtimeId: "local-text-runtime" });

    expect(startRuntime.calls).toEqual([]);
    expect(result.content[0].text).toContain("Local model runtime Start blocked");
    expect(result.content[0].text).toContain("sub-agent Review worker");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_start",
      status: "blocked",
      result: {
        status: "blocked",
        reason: "Runtime is already running and owned by an active sub-agent lease.",
      },
    });
  });

  it("blocks Stop for active sub-agent local runtime leases", async () => {
    const registeredTools: any[] = [];
    const stopRuntime = viFnUnexpectedStopRuntime();
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getActiveRuntimeLeases: () => [runtimeLease()],
      stopRuntime,
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
    const result = await stop.execute("stop-call", { runtimeId: "local-text-runtime", force: true });

    expect(stopRuntime.calls).toEqual([]);
    expect(result.content[0].text).toContain("Local model runtime Stop blocked");
    expect(result.content[0].text).toContain("sub-agent Review worker");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_stop",
      status: "blocked",
      result: {
        status: "blocked",
        forceRequested: true,
        reason: expect.stringContaining("requires explicit cancellation"),
      },
    });
  });

  it("resolves forced Stop ownership before stopping a sub-agent owned runtime", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-force-stop-tool-"));
    try {
      await writeRunningLocalTextRuntimeState(workspacePath);
      let leases = [runtimeLease({ pid: process.pid })];
      const stopRuntime = viFnStopRuntime();
      const registeredTools: any[] = [];
      const ownershipRequests: any[] = [];
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getActiveRuntimeLeases: () => leases,
        stopRuntime,
        resolveLocalRuntimeOwnership: async (request) => {
          ownershipRequests.push(request);
          leases = [];
          return {
            schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
            action: request.action,
            runtimeId: request.runtimeId,
            status: "resolved",
            reason: "Affected sub-agent child-thread was cancelled before forced Stop.",
            affectedSubagents: request.affectedSubagents,
            resolvedLeaseIds: request.blockerLeaseIds,
          };
        },
        now: testNow,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
      const result = await stop.execute("stop-call", { runtimeId: "local-text-runtime", force: true });

      expect(ownershipRequests).toEqual([
        expect.objectContaining({
          schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
          action: "stop",
          runtimeId: "local-text-runtime",
          modelRuntimeId: "local-text-runtime",
          blockerLeaseIds: ["lease-review"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "lease-review",
              subagentThreadId: "child-thread",
            }),
          ],
          activeLeases: [
            expect.objectContaining({
              leaseId: "lease-review",
              subagentThreadId: "child-thread",
            }),
          ],
        }),
      ]);
      expect(stopRuntime.calls).toEqual([
        expect.objectContaining({
          runtimeId: "local-text-runtime",
          force: true,
        }),
      ]);
      expect(result.content[0].text).toContain("Local model runtime stopped");
      expect(result.content[0].text).toContain("Ownership resolution resolved");
      expect(result.details).toMatchObject({
        status: "stopped",
        result: {
          status: "stopped",
          ownershipResolution: {
            status: "resolved",
            resolvedLeaseIds: ["lease-review"],
          },
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps forced Stop blocked when ownership resolution does not clear the active lease", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-force-stop-retained-lease-tool-"));
    try {
      await writeRunningLocalTextRuntimeState(workspacePath);
      const stopRuntime = viFnUnexpectedStopRuntime();
      const registeredTools: any[] = [];
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getActiveRuntimeLeases: () => [runtimeLease({ pid: process.pid })],
        stopRuntime,
        resolveLocalRuntimeOwnership: async (request) => ({
          schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
          action: request.action,
          runtimeId: request.runtimeId,
          status: "resolved",
          reason: "Affected sub-agent child-thread was cancelled before forced Stop.",
          affectedSubagents: request.affectedSubagents,
          resolvedLeaseIds: request.blockerLeaseIds,
        }),
        now: testNow,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
      const result = await stop.execute("stop-call", { runtimeId: "local-text-runtime", force: true });

      expect(stopRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Stop blocked");
      expect(result.content[0].text).toContain("Ownership resolution blocked");
      expect(result.content[0].text).toContain("lease lease-review still active");
      expect(result.details).toMatchObject({
        status: "blocked",
        result: {
          status: "blocked",
          ownershipResolution: {
            status: "blocked",
            resolvedLeaseIds: ["lease-review"],
            blockedLeaseIds: ["lease-review"],
          },
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks Restart for active sub-agent local runtime leases", async () => {
    const registeredTools: any[] = [];
    const restartRuntime = viFnUnexpectedRestartRuntime();
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getActiveRuntimeLeases: () => [runtimeLease()],
      restartRuntime,
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const restart = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart");
    const result = await restart.execute("restart-call", { runtimeId: "local-text-runtime", force: true });

    expect(restartRuntime.calls).toEqual([]);
    expect(result.content[0].text).toContain("Local model runtime Restart blocked");
    expect(result.content[0].text).toContain("sub-agent Review worker");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_restart",
      status: "blocked",
      result: {
        status: "blocked",
        forceRequested: true,
        reason: expect.stringContaining("requires explicit cancellation"),
      },
    });
  });

  it("resolves forced Restart ownership before restarting a sub-agent owned runtime", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-force-restart-tool-"));
    try {
      await writeRunningLocalTextRuntimeState(workspacePath);
      let leases = [runtimeLease({ pid: process.pid })];
      const restartRuntime = viFnRestartRuntime();
      const registeredTools: any[] = [];
      const ownershipRequests: any[] = [];
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getActiveRuntimeLeases: () => leases,
        restartRuntime,
        resolveLocalRuntimeOwnership: async (request) => {
          ownershipRequests.push(request);
          leases = [];
          return {
            schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
            action: request.action,
            runtimeId: request.runtimeId,
            status: "resolved",
            reason: "Affected sub-agent child-thread was marked cancelled before forced Restart.",
            affectedSubagents: request.affectedSubagents,
            resolvedLeaseIds: request.blockerLeaseIds,
          };
        },
        now: testNow,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const restart = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart");
      const result = await restart.execute("restart-call", { runtimeId: "local-text-runtime", force: true });

      expect(ownershipRequests).toEqual([
        expect.objectContaining({
          action: "restart",
          runtimeId: "local-text-runtime",
          modelRuntimeId: "local-text-runtime",
          blockerLeaseIds: ["lease-review"],
        }),
      ]);
      expect(restartRuntime.calls).toEqual([
        expect.objectContaining({
          runtimeId: "local-text-runtime",
          force: true,
        }),
      ]);
      expect(result.content[0].text).toContain("Local model runtime restarted");
      expect(result.content[0].text).toContain("Ownership resolution resolved");
      expect(result.details).toMatchObject({
        status: "restarted",
        result: {
          status: "restarted",
          ownershipResolution: {
            status: "resolved",
            resolvedLeaseIds: ["lease-review"],
          },
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps forced Restart blocked when ownership resolution does not clear the active lease", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-force-restart-retained-lease-tool-"));
    try {
      await writeRunningLocalTextRuntimeState(workspacePath);
      const restartRuntime = viFnUnexpectedRestartRuntime();
      const registeredTools: any[] = [];
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getActiveRuntimeLeases: () => [runtimeLease({ pid: process.pid })],
        restartRuntime,
        resolveLocalRuntimeOwnership: async (request) => ({
          schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
          action: request.action,
          runtimeId: request.runtimeId,
          status: "resolved",
          reason: "Affected sub-agent child-thread was marked cancelled before forced Restart.",
          affectedSubagents: request.affectedSubagents,
          resolvedLeaseIds: request.blockerLeaseIds,
        }),
        now: testNow,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const restart = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart");
      const result = await restart.execute("restart-call", { runtimeId: "local-text-runtime", force: true });

      expect(restartRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Restart blocked");
      expect(result.content[0].text).toContain("Ownership resolution blocked");
      expect(result.content[0].text).toContain("lease lease-review still active");
      expect(result.details).toMatchObject({
        status: "blocked",
        result: {
          status: "blocked",
          ownershipResolution: {
            status: "blocked",
            resolvedLeaseIds: ["lease-review"],
            blockedLeaseIds: ["lease-review"],
          },
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("dry-runs Start for a stopped managed local text runtime without launching it", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-start-tool-"));
    try {
      const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "stopped",
        command: ["/runtime/local-text", "serve"],
        cwd: workspacePath,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:05:00.000Z",
        stoppedAt: "2026-06-06T00:05:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2), "utf8");
      const registeredTools: any[] = [];
      const startRuntime = viFnUnexpectedStartRuntime();
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        startRuntime,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const start = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_start");
      const result = await start.execute("start-call", { runtimeId: "local-text-runtime", dryRun: true });

      expect(startRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Start ready");
      expect(result.details).toMatchObject({
        status: "ready",
        result: {
          status: "ready",
          dryRun: true,
          runtimeId: "local-text-runtime",
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks Start before launch when the target runtime would exceed local memory policy", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-start-memory-tool-"));
    try {
      const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "stopped",
        command: ["/runtime/local-text", "serve"],
        cwd: workspacePath,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:05:00.000Z",
        stoppedAt: "2026-06-06T00:05:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2), "utf8");
      const registeredTools: any[] = [];
      const startRuntime = viFnUnexpectedStartRuntime();
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getLocalModelResourceSettings: () => ({
          schemaVersion: "ambient-local-model-resource-settings-v1",
          maxResidentMemoryBytes: 4 * 1024 ** 3,
          memoryLimitBehavior: "refuse",
        }),
        startRuntime,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const start = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_start");
      const result = await start.execute("start-call", { runtimeId: "local-text-runtime" });

      expect(startRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Start blocked");
      expect(result.content[0].text).toContain("Memory policy: refuse");
      expect(result.details).toMatchObject({
        status: "blocked",
        before: {
          registry: {
            requestedLaunch: {
              capability: "local-text",
              modelId: "local/text-4b",
              profileId: "local-text-4b-q4",
              estimatedResidentMemoryBytes: 6 * 1024 ** 3,
            },
            policyDecision: {
              outcome: "refuse",
              requestedEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
              maxResidentMemoryBytes: 4 * 1024 ** 3,
            },
          },
        },
        result: {
          status: "blocked",
          reason: expect.stringContaining("Local runtime Start is blocked by local model memory policy"),
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("dry-runs Stop for a managed local text runtime without stopping it", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-stop-tool-"));
    try {
      const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: workspacePath,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:00:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2), "utf8");
      const registeredTools: any[] = [];
      const stopRuntime = viFnUnexpectedStopRuntime();
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        stopRuntime,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
      const result = await stop.execute("stop-call", { runtimeId: "local-text-runtime", dryRun: true });

      expect(stopRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Stop ready");
      expect(result.details).toMatchObject({
        status: "ready",
        result: {
          status: "ready",
          dryRun: true,
          runtimeId: "local-text-runtime",
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs provider-declared Stop for voice runtime rows", async () => {
    const registeredTools: any[] = [];
    const providerCalls: any[] = [];
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getVoiceProviders: () => [voiceProvider()],
      runProviderLifecycleAction: async (input) => {
        providerCalls.push(input);
        return {
          schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
          action: input.action,
          status: "stopped",
          runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
          packageId: "ambient-cli:piper",
          packageName: "ambient-piper-runtime",
          commandName: "piper_stop",
          command: ["node", "-e", "process.stdout.write('stopped')"],
          cwd: "/workspace",
          durationMs: 4,
          reason: 'Provider-declared stop command "piper_stop" completed.',
        };
      },
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
    const result = await stop.execute("stop-call", { runtimeId: "piper-runtime" });

    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0]).toMatchObject({
      action: "stop",
      entry: expect.objectContaining({
        capability: "voice",
        modelRuntimeId: "piper-runtime",
      }),
    });
    expect(result.content[0].text).toContain("Local model runtime stopped: piper-runtime.");
    expect(result.content[0].text).toContain("Provider command: piper_stop.");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_stop",
      status: "stopped",
      result: {
        status: "stopped",
        providerResult: expect.objectContaining({
          commandName: "piper_stop",
        }),
      },
    });
  });

  it("runs provider-declared Start, Stop, and Restart for voice runtime rows", async () => {
    const registeredTools: any[] = [];
    const providerCalls: any[] = [];
    const startRuntime = viFnUnexpectedStartRuntime();
    const stopRuntime = viFnUnexpectedStopRuntime();
    const restartRuntime = viFnUnexpectedRestartRuntime();
    let runtimeRunning = false;
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getVoiceProviders: () => [voiceProvider({ running: runtimeRunning })],
      startRuntime,
      stopRuntime,
      restartRuntime,
      runProviderLifecycleAction: async (input) => {
        const commandName = providerCommandName(input.action);
        providerCalls.push({
          action: input.action,
          runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
          commandName,
        });
        runtimeRunning = input.action !== "stop";
        return {
          schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
          action: input.action,
          status: providerLifecycleStatus(input.action),
          runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
          packageId: "ambient-cli:piper",
          packageName: "ambient-piper-runtime",
          commandName,
          command: ["node", "-e", `process.stdout.write('${input.action}')`],
          cwd: "/workspace",
          durationMs: 4,
          reason: `Provider-declared ${input.action} command "${commandName}" completed.`,
        };
      },
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const start = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_start");
    const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
    const restart = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart");

    const startResult = await start.execute("start-call", { runtimeId: "piper-runtime" });
    runtimeRunning = true;
    const stopResult = await stop.execute("stop-call", { runtimeId: "piper-runtime" });
    runtimeRunning = true;
    const restartResult = await restart.execute("restart-call", { runtimeId: "piper-runtime" });

    expect(startRuntime.calls).toEqual([]);
    expect(stopRuntime.calls).toEqual([]);
    expect(restartRuntime.calls).toEqual([]);
    expect(providerCalls).toEqual([
      { action: "start", runtimeId: "piper-runtime", commandName: "piper_start" },
      { action: "stop", runtimeId: "piper-runtime", commandName: "piper_stop" },
      { action: "restart", runtimeId: "piper-runtime", commandName: "piper_restart" },
    ]);
    expect(startResult.content[0].text).toContain("Provider command: piper_start.");
    expect(stopResult.content[0].text).toContain("Provider command: piper_stop.");
    expect(restartResult.content[0].text).toContain("Provider command: piper_restart.");
    expect(startResult.details).toMatchObject({
      status: "started",
      result: {
        providerResult: { commandName: "piper_start" },
      },
    });
    expect(stopResult.details).toMatchObject({
      status: "stopped",
      result: {
        providerResult: { commandName: "piper_stop" },
      },
    });
    expect(restartResult.details).toMatchObject({
      status: "restarted",
      result: {
        providerResult: { commandName: "piper_restart" },
      },
    });

    await writeProviderDeclaredLifecycleProofArtifact({
      providerCalls,
      genericCallCounts: {
        start: startRuntime.calls.length,
        stop: stopRuntime.calls.length,
        restart: restartRuntime.calls.length,
      },
    });
  });

  it("resolves forced provider-declared Stop ownership before stopping a sub-agent owned runtime", async () => {
    const registeredTools: any[] = [];
    const providerCalls: any[] = [];
    const ownershipRequests: any[] = [];
    let leases = [voiceRuntimeLease()];
    createLocalRuntimeToolExtension({
      workspace: { path: "/workspace" },
      getVoiceProviders: () => [voiceProvider()],
      getActiveRuntimeLeases: () => leases,
      resolveLocalRuntimeOwnership: async (request) => {
        ownershipRequests.push(request);
        leases = [];
        return {
          schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
          action: request.action,
          runtimeId: request.runtimeId,
          status: "resolved",
          reason: "Voice worker was cancelled before forced provider Stop.",
          affectedSubagents: request.affectedSubagents,
          resolvedLeaseIds: request.blockerLeaseIds,
        };
      },
      runProviderLifecycleAction: async (input) => {
        providerCalls.push(input);
        return {
          schemaVersion: "ambient-local-runtime-provider-lifecycle-result-v1",
          action: input.action,
          status: "stopped",
          runtimeId: input.entry.modelRuntimeId ?? input.entry.id,
          packageId: "ambient-cli:piper",
          packageName: "ambient-piper-runtime",
          commandName: "piper_stop",
          command: ["node", "-e", "process.stdout.write('stopped')"],
          cwd: "/workspace",
          durationMs: 4,
          reason: 'Provider-declared stop command "piper_stop" completed.',
        };
      },
      now: testNow,
    })({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
    const result = await stop.execute("stop-call", { runtimeId: "piper-runtime", force: true });

    expect(ownershipRequests).toEqual([
      expect.objectContaining({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "stop",
        runtimeId: "piper-runtime",
        providerId: "ambient-cli:piper:tool:piper_tts",
        capabilityKind: "voice",
        blockerLeaseIds: ["voice-lease"],
        affectedSubagents: [
          expect.objectContaining({
            leaseId: "voice-lease",
            displayName: "sub-agent Voice worker",
            subagentThreadId: "child-thread",
          }),
        ],
        activeLeases: [
          expect.objectContaining({
            leaseId: "voice-lease",
            modelRuntimeId: "piper-runtime",
            capabilityKind: "voice",
          }),
        ],
      }),
    ]);
    expect(providerCalls).toEqual([
      expect.objectContaining({
        action: "stop",
        entry: expect.objectContaining({
          capability: "voice",
          modelRuntimeId: "piper-runtime",
        }),
      }),
    ]);
    expect(result.content[0].text).toContain("Local model runtime stopped: piper-runtime.");
    expect(result.content[0].text).toContain("Ownership resolution resolved");
    expect(result.details).toMatchObject({
      runtime: "ambient-local-model-runtime",
      toolName: "ambient_local_model_runtime_stop",
      status: "stopped",
      result: {
        status: "stopped",
        ownershipResolution: {
          status: "resolved",
          resolvedLeaseIds: ["voice-lease"],
        },
        providerResult: expect.objectContaining({
          commandName: "piper_stop",
        }),
      },
    });
  });

  it("dry-runs Restart for a managed local text runtime without restarting it", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-restart-tool-"));
    try {
      const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: workspacePath,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:00:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2), "utf8");
      const registeredTools: any[] = [];
      const restartRuntime = viFnUnexpectedRestartRuntime();
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        restartRuntime,
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const restart = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_restart");
      const result = await restart.execute("restart-call", { runtimeId: "local-text-runtime", dryRun: true });

      expect(restartRuntime.calls).toEqual([]);
      expect(result.content[0].text).toContain("Local model runtime Restart ready");
      expect(result.details).toMatchObject({
        status: "ready",
        result: {
          status: "ready",
          dryRun: true,
          runtimeId: "local-text-runtime",
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("lets stale sub-agent leases stop blocking lifecycle dry-runs", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-stale-lease-tool-"));
    try {
      const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: workspacePath,
        stateDir,
        stdoutPath: join(stateDir, "runtime.stdout.log"),
        stderrPath: join(stateDir, "runtime.stderr.log"),
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:00:00.000Z",
        idleTimeoutMs: 300000,
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * 1024 ** 3,
      }, null, 2), "utf8");
      const registeredTools: any[] = [];
      createLocalRuntimeToolExtension({
        workspace: { path: workspacePath },
        getActiveRuntimeLeases: () => [runtimeLease({
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
        })],
        now: () => new Date("2026-06-05T00:10:00.000Z"),
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      const stop = registeredTools.find((candidate) => candidate.name === "ambient_local_model_runtime_stop");
      const result = await stop.execute("stop-call", { runtimeId: "local-text-runtime", dryRun: true });

      expect(result.content[0].text).toContain("Local model runtime Stop ready");
      expect(result.details).toMatchObject({
        before: {
          summary: {
            activeLeaseCount: 0,
          },
          inventory: {
            entries: expect.arrayContaining([
              expect.objectContaining({
                owners: [],
                stopDecision: expect.objectContaining({
                  ordinaryStopAllowed: true,
                  blockerLeaseIds: [],
                }),
                leases: [
                  expect.objectContaining({ leaseId: "lease-review" }),
                ],
              }),
            ]),
          },
        },
        result: {
          status: "ready",
          dryRun: true,
        },
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function testNow(): Date {
  return new Date("2026-06-05T00:01:00.000Z");
}

function viFnUnexpectedStopRuntime() {
  const calls: any[] = [];
  const fn = async (input: any) => {
    calls.push(input);
    throw new Error("Stop should not be called in this test.");
  };
  return Object.assign(fn, { calls });
}

function viFnUnexpectedStartRuntime() {
  const calls: any[] = [];
  const fn = async (input: any) => {
    calls.push(input);
    throw new Error("Start should not be called in this test.");
  };
  return Object.assign(fn, { calls });
}

function viFnUnexpectedRestartRuntime() {
  const calls: any[] = [];
  const fn = async (input: any) => {
    calls.push(input);
    throw new Error("Restart should not be called in this test.");
  };
  return Object.assign(fn, { calls });
}

function voiceProvider(input: { running?: boolean } = {}) {
  const running = input.running ?? true;
  return {
    packageId: "ambient-cli:piper",
    packageName: "ambient-piper-runtime",
    command: "piper_tts",
    capabilityId: "ambient-cli:piper:tool:piper_tts",
    providerId: "ambient-cli:piper:tool:piper_tts",
    label: "Piper Runtime",
    format: "wav" as const,
    formats: ["wav" as const],
    voices: [{ id: "default" }],
    local: true,
    installed: true,
    available: true,
    availabilityReason: "Installed Ambient CLI package is available; execution still requires Desktop approval.",
    providerLifecycle: providerLifecycle(),
    diagnostics: {
      healthStatus: "passed" as const,
      missingHints: [],
      runtimeState: {
        schemaVersion: "ambient-voice-provider-runtime-state-v1" as const,
        status: running ? "running" as const : "stopped" as const,
        running,
        modelRuntimeId: "piper-runtime",
        modelId: "rhasspy/piper/en_US-lessac-medium",
        endpoint: "http://127.0.0.1:59201",
      },
    },
  };
}

function providerCommandName(action: "start" | "stop" | "restart"): string {
  if (action === "start") return "piper_start";
  if (action === "stop") return "piper_stop";
  return "piper_restart";
}

function providerLifecycleStatus(action: "start" | "stop" | "restart") {
  if (action === "start") return "started" as const;
  if (action === "stop") return "stopped" as const;
  return "restarted" as const;
}

function providerLifecycle() {
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1" as const,
    providerKind: "ambient-cli" as const,
    packageId: "ambient-cli:piper",
    packageName: "ambient-piper-runtime",
    start: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "start" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_start",
    },
    stop: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "stop" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_stop",
    },
    restart: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "restart" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper",
      packageName: "ambient-piper-runtime",
      command: "piper_restart",
    },
  };
}

function viFnStopRuntime() {
  const calls: any[] = [];
  const fn = async (input: any) => {
    calls.push(input);
    return {
      schemaVersion: "ambient-local-model-runtime-stop-v1" as const,
      status: "stopped" as const,
      runtimeId: input.runtimeId,
      forceRequested: input.force === true,
      pid: process.pid,
      stoppedAt: "2026-06-05T00:01:00.000Z",
    };
  };
  return Object.assign(fn, { calls });
}

function viFnRestartRuntime() {
  const calls: any[] = [];
  const fn = async (input: any) => {
    calls.push(input);
    return {
      schemaVersion: "ambient-local-model-runtime-restart-v1" as const,
      status: "restarted" as const,
      runtimeId: input.runtimeId,
      forceRequested: input.force === true,
      previousPid: process.pid,
      pid: process.pid,
      restartedAt: "2026-06-05T00:01:00.000Z",
    };
  };
  return Object.assign(fn, { calls });
}

async function writeProviderDeclaredLifecycleProofArtifact(input: {
  providerCalls: Array<{ action: string; commandName: string }>;
  genericCallCounts: { start: number; stop: number; restart: number };
}): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const existing = await readJsonIfExists(outputPath);
  const scenarios = isRecord(existing?.scenarios) ? existing.scenarios : {};
  const actions = input.providerCalls.map((call) => call.action);
  const usedGenericLifecycle = Object.values(input.genericCallCounts).some((count) => count > 0);
  const scenario = {
    status: "passed",
    proofKind: "deterministic-provider-declared-lifecycle",
    actions,
    commandNames: input.providerCalls.map((call) => call.commandName),
    providerKind: "ambient-cli",
    usedGenericLifecycle,
    genericCallCounts: input.genericCallCounts,
    evidence: "Provider-declared local runtime Start, Stop, and Restart commands handled the voice runtime without invoking generic local-text lifecycle managers.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-06-05T00:01:00.000Z").toISOString(),
    scenarios: {
      ...scenarios,
      "provider-declared-lifecycle": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeRunningLocalTextRuntimeState(workspacePath: string): Promise<void> {
  const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
    schemaVersion: "ambient-local-model-runtime-state-v1",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local-text-4b-q4",
    pid: process.pid,
    status: "running",
    command: ["/runtime/local-text", "serve"],
    cwd: workspacePath,
    stateDir,
    stdoutPath: join(stateDir, "runtime.stdout.log"),
    stderrPath: join(stateDir, "runtime.stderr.log"),
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
    healthUrl: "http://127.0.0.1:43123/health",
    estimatedResidentMemoryBytes: 6 * 1024 ** 3,
  }, null, 2), "utf8");
}

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * 1024 ** 3,
    acquiredAt: "2026-06-05T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}

function voiceRuntimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "voice-lease",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Voice worker",
    modelRuntimeId: "piper-runtime",
    modelId: "rhasspy/piper/en_US-lessac-medium",
    providerId: "ambient-cli:piper:tool:piper_tts",
    capabilityKind: "voice",
    estimatedResidentMemoryBytes: 512 * 1024 ** 2,
    endpoint: "http://127.0.0.1:59201",
    acquiredAt: "2026-06-05T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
    status: "running",
    ...overrides,
  };
}
