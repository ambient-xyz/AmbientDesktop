import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AmbientModelRuntimeProfile, AmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_DEFAULT_MODEL, createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile, type SubagentRoleId, type SubagentRoleProfile } from "../../shared/subagentRoles";
import { resolveSubagentTurnBudgetPolicy } from "../../shared/subagentTurnBudget";
import { resolveSubagentToolScope } from "../../shared/subagentToolScope";
import type { LocalModelResourcePolicyDecision, LocalModelResourceRegistryEntry, LocalModelResourceRegistrySnapshot, LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";
import {
  LocalModelRuntimeStartupError,
  type LocalModelRuntimeLease,
  type LocalModelRuntimeReleaseResult,
  type LocalModelRuntimeStartupFailure,
} from "./localModelRuntimeManager";
import { ProjectStore } from "./localRuntimeProjectStoreFacade";
import { createLocalTextSubagentRuntimeAdapter } from "./localTextSubagentRuntime";

const roots: string[] = [];
const gib = 1024 ** 3;

type RuntimeLeaseOwner = Pick<
  LocalModelRuntimeLease["state"],
  "ownerThreadId" | "parentThreadId" | "subagentThreadId" | "subagentRunId" | "ownerDisplayName"
>;

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("local text sub-agent runtime adapter", () => {
  it("records local text output validation evidence in completed run events", async () => {
    const fixture = await localTextFixture();
    const fetchImpl = vi.fn(async () => jsonResponse({ output_text: "Local child result." }));
    const owner = runtimeLeaseOwner(fixture);
    const release = vi.fn(async () => runtimeRelease({ owner }));
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release, owner })) };
    const runtimeEvents: unknown[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager,
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            args: ["serve"],
            healthUrl: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      const started = adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      expect(started).toMatchObject({
        started: true,
        run: {
          status: "starting",
        },
      });

      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const completed = waited?.run ?? fixture.store.getSubagentRun(fixture.run.id);

      expect(completed).toMatchObject({
        status: "completed",
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: fixture.run.id,
          status: "completed",
          partial: false,
          summary: "Local child result.",
          childThreadId: fixture.run.childThreadId,
        },
      });
      const resultArtifact = completed.resultArtifact as { artifactPath: string };
      await expect(readFile(resultArtifact.artifactPath, "utf8")).resolves.toContain("Local child result.");
      expect(fixture.store.getThread(fixture.run.childThreadId).childStatus).toBe("completed");
      expect(fixture.store.listMessages(fixture.run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "assistant",
      ]);
      expect(fixture.store.listMessages(fixture.run.childThreadId).at(-1)?.content).toContain("Local child result.");
      expect(fixture.store.listSubagentRunEvents(fixture.run.id).map((event) => event.type)).toEqual(expect.arrayContaining([
        "subagent.local_text_preflight",
        "subagent.local_runtime_lease_acquired",
        "subagent.local_text_started",
        "subagent.local_text_completed",
      ]));
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_preflight",
          preview: expect.objectContaining({
            invocationLimits: expect.objectContaining({
              contextFits: true,
              outputReserveTokens: 4096,
              structuredOutputRequired: true,
              structuredOutputMode: "ambient_synthesized",
            }),
            turnBudgetPolicy: expect.objectContaining({
              maxTurns: 4,
              wrapUpAtTurn: 3,
              terminalStatusOnExhaustion: "aborted_partial",
            }),
          }),
        }),
        expect.objectContaining({
          type: "subagent.local_runtime_lease_acquired",
          preview: expect.objectContaining({
            schemaVersion: "ambient-local-text-runtime-lease-acquired-v1",
            childRunId: fixture.run.id,
            childThreadId: fixture.run.childThreadId,
            runtimeAcquisition: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-acquisition-v1",
              leaseId: "lease-1",
              runtimeId: "local-text-runtime",
              runtimeLease: expect.objectContaining({
                leaseId: "lease-1",
                parentThreadId: fixture.parent.id,
                subagentThreadId: fixture.run.childThreadId,
                subagentRunId: fixture.run.id,
                status: "running",
              }),
            }),
            runtimeLease: expect.objectContaining({
              schemaVersion: "ambient-local-runtime-lease-v1",
              leaseId: "lease-1",
              parentThreadId: fixture.parent.id,
              subagentThreadId: fixture.run.childThreadId,
              subagentRunId: fixture.run.id,
              modelRuntimeId: "local-text-runtime",
              modelProfileId: "local:local/text-4b",
              providerId: "local",
              capabilityKind: "local-text",
              status: "running",
            }),
            requestedLaunch: expect.objectContaining({
              capability: "local-text",
              ownerThreadId: fixture.run.childThreadId,
              modelId: "local/text-4b",
              modelProfileId: "local:local/text-4b",
              estimatedResidentMemoryBytes: 6 * gib,
            }),
            acquireInput: expect.objectContaining({
              runtimeId: "local-text-runtime",
              providerId: "local",
              modelId: "local/text-4b",
              modelProfileId: "local:local/text-4b",
              parentThreadId: fixture.parent.id,
              subagentThreadId: fixture.run.childThreadId,
              subagentRunId: fixture.run.id,
              ownerDisplayName: fixture.run.roleProfileSnapshot.label,
              estimatedResidentMemoryBytes: 6 * gib,
            }),
          }),
        }),
        expect.objectContaining({
          type: "subagent.local_text_completed",
          preview: expect.objectContaining({
            runtimeAcquisition: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-acquisition-v1",
              source: "started",
              leaseId: "lease-1",
              runtimeId: "local-text-runtime",
              pid: 5001,
              activeLeases: 1,
              runtimeLease: expect.objectContaining({
                schemaVersion: "ambient-local-runtime-lease-v1",
                leaseId: "lease-1",
                parentThreadId: fixture.parent.id,
                subagentThreadId: fixture.run.childThreadId,
                subagentRunId: fixture.run.id,
                ownerDisplayName: fixture.run.roleProfileSnapshot.label,
                modelRuntimeId: "local-text-runtime",
                modelProfileId: "local:local/text-4b",
                modelId: "local/text-4b",
                providerId: "local",
                capabilityKind: "local-text",
                estimatedResidentMemoryBytes: 6 * gib,
                actualResidentMemoryBytes: 4 * gib,
                pid: 5001,
                endpoint: "http://127.0.0.1:43123/health",
                status: "running",
              }),
            }),
            runtimeState: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-state-v1",
              runtimeId: "local-text-runtime",
              modelId: "local/text-4b",
              ownerThreadId: fixture.run.childThreadId,
              parentThreadId: fixture.parent.id,
              subagentThreadId: fixture.run.childThreadId,
              subagentRunId: fixture.run.id,
              ownerDisplayName: fixture.run.roleProfileSnapshot.label,
              pid: 5001,
              actualResidentMemoryBytes: 4 * gib,
              estimatedResidentMemoryBytes: 6 * gib,
              idleTimeoutMs: 300000,
            }),
            runtimeRelease: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-release-v1",
              status: "released",
              leaseId: "lease-1",
              pid: 5001,
              remainingLeases: 0,
              releasedAt: "2026-06-05T00:00:00.000Z",
              idleCleanupDueAt: "2026-06-05T00:05:00.000Z",
              runtimeLease: expect.objectContaining({
                schemaVersion: "ambient-local-runtime-lease-v1",
                leaseId: "lease-1",
                parentThreadId: fixture.parent.id,
                subagentThreadId: fixture.run.childThreadId,
                subagentRunId: fixture.run.id,
                ownerDisplayName: fixture.run.roleProfileSnapshot.label,
                modelRuntimeId: "local-text-runtime",
                modelProfileId: "local:local/text-4b",
                providerId: "local",
                capabilityKind: "local-text",
                status: "released",
              }),
            }),
            outputValidation: expect.objectContaining({
              schemaVersion: "ambient-local-text-output-validation-v1",
              valid: true,
              contentType: "text/plain",
              outputCharCount: "Local child result.".length,
              requiresFullOutputArtifact: false,
            }),
          }),
        }),
      ]));
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "status",
          status: "running",
          message: "Local text runtime lease lease-1 acquired.",
          localMemoryBytes: 4 * gib,
          details: expect.objectContaining({
            reason: "local_runtime_lease_acquired",
            runtime: "local_text",
            leaseId: "lease-1",
            runtimeId: "local-text-runtime",
            parentThreadId: fixture.parent.id,
            subagentThreadId: fixture.run.childThreadId,
            subagentRunId: fixture.run.id,
          }),
        }),
        expect.objectContaining({ type: "started", status: "running" }),
        expect.objectContaining({ type: "assistant_delta", textPreview: "Local child result." }),
        expect.objectContaining({ type: "completed", status: "completed" }),
      ]));
      expect(runtimeManager.acquire).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        ownerThreadId: fixture.run.childThreadId,
        parentThreadId: fixture.parent.id,
        subagentThreadId: fixture.run.childThreadId,
        subagentRunId: fixture.run.id,
        ownerDisplayName: fixture.run.roleProfileSnapshot.label,
        modelId: "local/text-4b",
      }));
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      fixture.close();
    }
  });

  it("records still-leased runtime evidence in completed local text events", async () => {
    const fixture = await localTextFixture();
    const release = vi.fn(async () => runtimeRelease({
      status: "still-leased",
      remainingLeases: 1,
      idleCleanupDueAt: undefined,
    }));
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager,
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            args: ["serve"],
            healthUrl: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: async () => jsonResponse({ output_text: "Local child result." }),
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      adapter.startChildRun?.(fixture.startInput());
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(waited?.run.status).toBe("completed");
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_completed",
          preview: expect.objectContaining({
            runtimeRelease: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-release-v1",
              status: "still-leased",
              leaseId: "lease-1",
              pid: 5001,
              remainingLeases: 1,
              releasedAt: "2026-06-05T00:00:00.000Z",
            }),
          }),
        }),
      ]));
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      fixture.close();
    }
  });

  it("records completed local text events when runtime release fails", async () => {
    const fixture = await localTextFixture();
    const release = vi.fn(async () => {
      throw new Error("release store unavailable");
    });
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager,
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            args: ["serve"],
            healthUrl: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: async () => jsonResponse({ output_text: "Local child result." }),
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      adapter.startChildRun?.(fixture.startInput());
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(waited?.run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: "Local child result.",
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_completed",
          preview: expect.objectContaining({
            runtimeRelease: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-release-v1",
              status: "failed",
              leaseId: "lease-1",
              pid: 5001,
              error: "release store unavailable",
            }),
            localTextResult: expect.objectContaining({
              status: "completed",
              textPreview: "Local child result.",
            }),
          }),
        }),
      ]));
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      fixture.close();
    }
  });

  it("records runtime release evidence when local text completion fails after acquire", async () => {
    const fixture = await localTextFixture();
    const release = vi.fn(async () => runtimeRelease());
    const runtimeManager = { acquire: vi.fn(async () => runtimeLease({ release })) };
    const runtimeEvents: unknown[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager,
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            args: ["serve"],
            healthUrl: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: async () => jsonResponse({ output_text: "   " }),
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });

      expect(waited?.run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Local text delegation output is empty"),
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_release_after_failure",
          preview: expect.objectContaining({
            schemaVersion: "ambient-local-text-delegation-failure-v1",
            runtimeAcquisition: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-acquisition-v1",
              source: "started",
              leaseId: "lease-1",
              runtimeId: "local-text-runtime",
              pid: 5001,
              activeLeases: 1,
            }),
            runtimeState: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-state-v1",
              runtimeId: "local-text-runtime",
              pid: 5001,
            }),
            runtimeRelease: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-release-v1",
              status: "released",
              leaseId: "lease-1",
              pid: 5001,
              remainingLeases: 0,
            }),
            outputValidation: expect.objectContaining({
              schemaVersion: "ambient-local-text-output-validation-v1",
              valid: false,
              reason: "Local text delegation output is empty.",
            }),
          }),
        }),
        expect.objectContaining({
          type: "subagent.local_text_failed",
          preview: expect.objectContaining({
            localTextFailure: expect.objectContaining({
              schemaVersion: "ambient-local-text-delegation-failure-v1",
              runtimeRelease: expect.objectContaining({ status: "released" }),
            }),
          }),
        }),
      ]));
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          status: "failed",
          details: expect.objectContaining({
            reason: "local_text_completion_failed",
            runtime: "local_text",
            localTextFailure: expect.objectContaining({
              runtimeRelease: expect.objectContaining({ status: "released" }),
            }),
          }),
        }),
      ]));
      expect(runtimeManager.acquire).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      fixture.close();
    }
  });

  it("keeps large local output behind a bounded preview and full-output artifact", async () => {
    const fixture = await localTextFixture();
    const output = "x".repeat(600);
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire: vi.fn(async () => runtimeLease()) },
        resolveRuntime: () => ({
          launch: {
            command: "/runtime/local-text",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
          maxInlineChars: 256,
        }),
        fetchImpl: async () => jsonResponse({ output_text: output }),
      });

      adapter.startChildRun?.(fixture.startInput());
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });
      const artifact = waited?.run.resultArtifact as { summary: string; fullOutputPath: string; artifactPath: string };

      expect(artifact.summary).toBe(`${"x".repeat(253)}...`);
      expect(artifact.fullOutputPath).toMatch(/\.local-text\.txt$/);
      await expect(readFile(artifact.fullOutputPath, "utf8")).resolves.toBe(output);
      await expect(readFile(artifact.artifactPath, "utf8")).resolves.toContain(artifact.fullOutputPath);
    } finally {
      fixture.close();
    }
  });

  it("does not let a late local completion overwrite parent cancellation", async () => {
    const fixture = await localTextFixture();
    const release = vi.fn(async () => runtimeRelease());
    const acquire = vi.fn(async () => runtimeLease({ release }));
    const deferred = createDeferred<Response>();
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            command: "/runtime/local-text",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: async () => deferred.promise,
      });

      adapter.startChildRun?.(fixture.startInput());
      await eventually(() => {
        expect(acquire).toHaveBeenCalledTimes(1);
      });
      const cancelled = await adapter.cancelChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        reason: "Parent stopped waiting.",
        idempotencyKey: "cancel-local-text",
        emitEvent: fixture.emitEvent,
      });
      expect(cancelled?.run.status).toBe("cancelled");

      deferred.resolve(jsonResponse({ output_text: "Too late." }));
      await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(fixture.store.getSubagentRun(fixture.run.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: {
          status: "cancelled",
          summary: "Parent stopped waiting.",
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_release_after_cancel",
          preview: expect.objectContaining({
            schemaVersion: "ambient-local-text-terminal-release-v1",
            terminalStatus: "cancelled",
            summary: "Local text runtime lease released after the child was cancelled.",
            runtimeAcquisition: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-acquisition-v1",
              source: "started",
              leaseId: "lease-1",
              runtimeId: "local-text-runtime",
              pid: 5001,
            }),
            runtimeState: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-state-v1",
              runtimeId: "local-text-runtime",
              pid: 5001,
            }),
            runtimeRelease: expect.objectContaining({
              schemaVersion: "ambient-local-model-runtime-release-v1",
              status: "released",
              leaseId: "lease-1",
              pid: 5001,
              remainingLeases: 0,
            }),
            outputValidation: expect.objectContaining({
              schemaVersion: "ambient-local-text-output-validation-v1",
              valid: true,
            }),
            localTextResult: expect.objectContaining({
              schemaVersion: "ambient-local-text-result-v1",
              textPreview: "Too late.",
            }),
          }),
        }),
      ]));
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      fixture.close();
    }
  });

  it("aborts local completion and records an aborted partial result when the role runtime budget expires", async () => {
    const baseRole = getDefaultSubagentRoleProfile("summarizer");
    const fixture = await localTextFixture({
      roleId: "summarizer",
      roleProfileSnapshot: {
        ...baseRole,
        guardPolicy: {
          ...baseRole.guardPolicy,
          maxRuntimeMs: 0,
          allowPartialResult: true,
        },
      },
    });
    const release = vi.fn(async () => runtimeRelease());
    const acquire = vi.fn(async () => runtimeLease({ release }));
    const fetchImpl = abortableFetch();
    const runtimeEvents: any[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            command: "/runtime/local-text",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: fetchImpl as typeof fetch,
      });

      adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      await eventually(() => {
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      });

      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const run = fixture.store.getSubagentRun(fixture.run.id);

      expect(waited).toMatchObject({
        timedOut: true,
        run: {
          status: "aborted_partial",
        },
      });
      expect(run).toMatchObject({
        status: "aborted_partial",
        resultArtifact: {
          status: "aborted_partial",
          partial: true,
          artifactPath: `ambient://threads/${fixture.run.childThreadId}/transcript`,
          summary: expect.stringContaining("role runtime budget"),
        },
      });
      expect((fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined)?.signal).toMatchObject({ aborted: true });
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "started", status: "running" }),
        expect.objectContaining({
          type: "status",
          status: "aborted_partial",
          artifactPath: `ambient://threads/${fixture.run.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_budget_exceeded",
            runtime: "local_text",
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.run.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.result",
          payload: expect.objectContaining({
            status: "aborted_partial",
            partial: true,
            reason: "runtime_budget_exceeded",
            runtime: "local_text",
          }),
        }),
      ]);
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.runtime_budget_exceeded",
          preview: expect.objectContaining({
            status: "aborted_partial",
            partial: true,
            runtime: "local_text",
          }),
        }),
      ]));
      expect(fixture.store.listMessages(fixture.run.childThreadId).at(-1)).toMatchObject({
        role: "system",
        content: expect.stringContaining("Local text sub-agent exceeded its runtime budget."),
        metadata: expect.objectContaining({
          status: "aborted_partial",
          reason: "runtime_budget_exceeded",
        }),
      });
      await eventually(() => {
        expect(release).toHaveBeenCalledTimes(1);
      });
      await eventually(() => {
        expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.local_text_release_after_partial",
            preview: expect.objectContaining({
              schemaVersion: "ambient-local-text-terminal-release-v1",
              terminalStatus: "aborted_partial",
              summary: "Local text runtime lease released after the child produced an aborted partial result.",
              runtimeAcquisition: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-acquisition-v1",
                source: "started",
                leaseId: "lease-1",
              }),
              runtimeState: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-state-v1",
                runtimeId: "local-text-runtime",
                pid: 5001,
              }),
              runtimeRelease: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-release-v1",
                status: "released",
                leaseId: "lease-1",
                pid: 5001,
                remainingLeases: 0,
              }),
            }),
          }),
        ]));
      });
    } finally {
      fixture.close();
    }
  });

  it("fails strict local text children when the role runtime budget expires", async () => {
    const baseRole = getDefaultSubagentRoleProfile("reviewer");
    const fixture = await localTextFixture({
      roleId: "reviewer",
      roleProfileSnapshot: {
        ...baseRole,
        guardPolicy: {
          ...baseRole.guardPolicy,
          maxRuntimeMs: 0,
          allowPartialResult: false,
        },
      },
    });
    const release = vi.fn(async () => runtimeRelease());
    const fetchImpl = abortableFetch();
    const runtimeEvents: any[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire: vi.fn(async () => runtimeLease({ release })) },
        resolveRuntime: () => ({
          launch: {
            command: "/runtime/local-text",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        fetchImpl: fetchImpl as typeof fetch,
      });

      adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      await eventually(() => {
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      });

      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const run = fixture.store.getSubagentRun(fixture.run.id);

      expect(waited).toMatchObject({
        timedOut: true,
        run: {
          status: "failed",
        },
      });
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          partial: false,
          artifactPath: `ambient://threads/${fixture.run.childThreadId}/transcript`,
          summary: expect.stringContaining("does not allow partial success"),
        },
      });
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          status: "failed",
          artifactPath: `ambient://threads/${fixture.run.childThreadId}/transcript`,
          details: expect.objectContaining({
            reason: "runtime_budget_exceeded",
            runtime: "local_text",
          }),
        }),
      ]));
      expect(fixture.store.listSubagentMailboxEvents(fixture.run.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "failed",
            partial: false,
            reason: "runtime_budget_exceeded",
            runtime: "local_text",
          }),
        }),
      ]);
      await eventually(() => {
        expect(release).toHaveBeenCalledTimes(1);
      });
      await eventually(() => {
        expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.local_text_release_after_failure",
            preview: expect.objectContaining({
              schemaVersion: "ambient-local-text-terminal-release-v1",
              terminalStatus: "failed",
              summary: "Local text runtime lease released after the child reached failed.",
              runtimeAcquisition: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-acquisition-v1",
                source: "started",
                leaseId: "lease-1",
              }),
              runtimeState: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-state-v1",
                runtimeId: "local-text-runtime",
                pid: 5001,
              }),
              runtimeRelease: expect.objectContaining({
                schemaVersion: "ambient-local-model-runtime-release-v1",
                status: "released",
                leaseId: "lease-1",
                pid: 5001,
                remainingLeases: 0,
              }),
            }),
          }),
        ]));
      });
    } finally {
      fixture.close();
    }
  });

  it("skips non-local model profiles so cloud Pi child sessions can handle them", async () => {
    const fixture = await localTextFixture({
      modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-05T00:00:00.000Z"),
    });
    try {
      const runtimeManager = { acquire: vi.fn(async () => runtimeLease()) };
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager,
        resolveRuntime: () => {
          throw new Error("Local runtime should not be resolved for cloud profiles.");
        },
      });

      const started = adapter.startChildRun?.(fixture.startInput());

      expect(started).toMatchObject({
        started: false,
        run: {
          status: "reserved",
        },
        message: expect.stringContaining("not local text-only"),
      });
      expect(runtimeManager.acquire).not.toHaveBeenCalled();
    } finally {
      fixture.close();
    }
  });

  it("preflights local launch readiness before runtime start", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntimeForLaunch: () => ({
          launch: {
            command: "  ",
            healthUrl: "file:///tmp/health",
            startupTimeoutMs: 0,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
        }),
        resolveRuntime: () => {
          throw new Error("Runtime resolver should not be used by scheduler preflight.");
        },
      });
      const start = fixture.startInput();
      const result = await adapter.preflightChildLaunch?.({
        parentThread: start.parentThread,
        task: start.task,
        role: start.role,
        model: start.run.modelRuntimeSnapshot.profile,
        dependencyMode: start.dependencyMode,
        forkMode: start.forkMode,
        promptMode: start.promptMode,
        canonicalTaskPath: start.run.canonicalTaskPath,
        idempotencyKey: start.idempotencyKey,
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local_text",
        allowed: false,
        blockers: expect.arrayContaining([
          "Local text runtime launch descriptor requires a non-empty command before scheduler launch.",
          "Local text runtime healthUrl must be an absolute http(s) URL.",
          "Local text runtime startupTimeoutMs must be positive when healthUrl is configured.",
        ]),
        details: {
          launchReadiness: expect.objectContaining({
            schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
            ready: false,
          }),
        },
      });
      expect(acquire).not.toHaveBeenCalled();
      expect(fixture.store.getSubagentRun(fixture.run.id).status).toBe("reserved");
    } finally {
      fixture.close();
    }
  });

  it("preflights local memory capacity before runtime start", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    const buildResourceRegistryForLaunch = vi.fn(() => localResourceRegistry({
      outcome: "refuse",
      reason: "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
      requestedEstimatedResidentMemoryBytes: 8 * gib,
      activeEstimatedResidentMemoryBytes: 12 * gib,
      projectedEstimatedResidentMemoryBytes: 20 * gib,
      maxResidentMemoryBytes: 16 * gib,
      exceededByBytes: 4 * gib,
      unloadCandidateIds: [],
    }));
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntimeForLaunch: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            estimatedResidentMemoryBytes: 8 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
        }),
        resolveRuntime: () => {
          throw new Error("Runtime resolver should not be used by scheduler preflight.");
        },
        buildResourceRegistryForLaunch,
      });
      const start = fixture.startInput();
      const result = await adapter.preflightChildLaunch?.({
        parentThread: start.parentThread,
        task: start.task,
        role: start.role,
        model: start.run.modelRuntimeSnapshot.profile,
        dependencyMode: start.dependencyMode,
        forkMode: start.forkMode,
        promptMode: start.promptMode,
        canonicalTaskPath: start.run.canonicalTaskPath,
        idempotencyKey: start.idempotencyKey,
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local_text",
        allowed: false,
        blockers: [
          "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
        ],
        capacity: {
          localMemory: {
            outcome: "refuse",
            allowed: false,
            requestedEstimatedResidentMemoryBytes: 8 * gib,
            activeEstimatedResidentMemoryBytes: 12 * gib,
            projectedEstimatedResidentMemoryBytes: 20 * gib,
            maxResidentMemoryBytes: 16 * gib,
            exceededByBytes: 4 * gib,
            localRuntimeReservation: expect.objectContaining({
              schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
              status: "requested",
              runtimeId: "local-text-runtime",
              requestedLaunchId: `${start.idempotencyKey}:${start.run.canonicalTaskPath}`,
              capabilityKind: "local-text",
              providerId: "local",
              modelId: "local/text-4b",
              modelProfileId: "local:local/text-4b",
              parentThreadId: start.parentThread.id,
              ownerThreadId: start.parentThread.id,
              canonicalTaskPath: start.run.canonicalTaskPath,
              idempotencyKey: start.idempotencyKey,
              stateRootPath: fixture.parent.workspacePath + "/.ambient/local-model-runtime",
              estimatedResidentMemoryBytes: 8 * gib,
              memoryEstimateSource: "launch_descriptor",
            }),
          },
        },
        details: {
          launchReadiness: expect.objectContaining({
            schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
            ready: true,
          }),
          resourcePolicy: expect.objectContaining({
            outcome: "refuse",
          }),
        },
      });
      expect(buildResourceRegistryForLaunch).toHaveBeenCalledWith(expect.objectContaining({
        parentThread: expect.objectContaining({ id: start.parentThread.id }),
        model: expect.objectContaining({ modelId: "local/text-4b" }),
        config: expect.objectContaining({
          launch: expect.objectContaining({ estimatedResidentMemoryBytes: 8 * gib }),
        }),
        launch: expect.objectContaining({
          canonicalTaskPath: start.run.canonicalTaskPath,
          idempotencyKey: start.idempotencyKey,
        }),
      }));
      expect(acquire).not.toHaveBeenCalled();
      expect(fixture.store.getSubagentRun(fixture.run.id).status).toBe("reserved");
    } finally {
      fixture.close();
    }
  });

  it("preflights custom local text runtime state roots as active memory evidence", async () => {
    const fixture = await localTextFixture();
    const stateRoot = await mkdtemp(join(tmpdir(), "ambient-local-text-custom-state-"));
    const runtimeStateDir = join(stateRoot, "already-running");
    const acquire = vi.fn(async () => runtimeLease());
    try {
      await mkdir(runtimeStateDir, { recursive: true });
      await writeFile(join(runtimeStateDir, "runtime-state.json"), `${JSON.stringify({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "already-running",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: process.pid,
        status: "running",
        command: ["/runtime/local-text", "serve"],
        cwd: fixture.parent.workspacePath,
        stateDir: runtimeStateDir,
        stdoutPath: join(runtimeStateDir, "runtime.stdout.log"),
        stderrPath: join(runtimeStateDir, "runtime.stderr.log"),
        startedAt: "2026-06-05T00:00:00.000Z",
        lastUsedAt: "2026-06-05T00:01:00.000Z",
        idleTimeoutMs: 300_000,
        healthUrl: "http://127.0.0.1:43123/health",
        ownerThreadId: "other-local-child",
        estimatedResidentMemoryBytes: 6 * gib,
      }, null, 2)}\n`, "utf8");
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntimeForLaunch: () => ({
          launch: {
            runtimeId: "next-local-text",
            command: "/runtime/local-text",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          stateRootPath: stateRoot,
        }),
        resolveRuntime: () => {
          throw new Error("Runtime resolver should not be used by scheduler preflight.");
        },
        localModelResourceSettings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          maxResidentMemoryBytes: 10 * gib,
          memoryLimitBehavior: "refuse",
        },
      });
      const start = fixture.startInput();
      const result = await adapter.preflightChildLaunch?.({
        parentThread: start.parentThread,
        task: start.task,
        role: start.role,
        model: start.run.modelRuntimeSnapshot.profile,
        dependencyMode: start.dependencyMode,
        forkMode: start.forkMode,
        promptMode: start.promptMode,
        canonicalTaskPath: start.run.canonicalTaskPath,
        idempotencyKey: start.idempotencyKey,
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local_text",
        allowed: false,
        blockers: [
          "Projected local-model resident memory exceeds the configured ceiling by 2.0 GiB; refusing launch.",
        ],
        capacity: {
          localMemory: {
            outcome: "refuse",
            allowed: false,
            activeEstimatedResidentMemoryBytes: 6 * gib,
            requestedEstimatedResidentMemoryBytes: 6 * gib,
            projectedEstimatedResidentMemoryBytes: 12 * gib,
            maxResidentMemoryBytes: 10 * gib,
            exceededByBytes: 2 * gib,
            localRuntimeReservation: expect.objectContaining({
              schemaVersion: "ambient-subagent-local-runtime-reservation-v1",
              status: "requested",
              runtimeId: "next-local-text",
              requestedLaunchId: `${start.idempotencyKey}:${start.run.canonicalTaskPath}`,
              capabilityKind: "local-text",
              parentThreadId: start.parentThread.id,
              ownerThreadId: start.parentThread.id,
              canonicalTaskPath: start.run.canonicalTaskPath,
              idempotencyKey: start.idempotencyKey,
              stateRootPath: stateRoot,
              estimatedResidentMemoryBytes: 6 * gib,
              memoryEstimateSource: "launch_descriptor",
            }),
          },
        },
        details: {
          resourcePolicy: expect.objectContaining({
            outcome: "refuse",
            activeEstimatedResidentMemoryBytes: 6 * gib,
            requestedEstimatedResidentMemoryBytes: 6 * gib,
            unloadCandidateIds: [`local-text:already-running:${process.pid}`],
          }),
        },
      });
      expect(acquire).not.toHaveBeenCalled();
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
      fixture.close();
    }
  });

  it("blocks local launch capacity when the resource policy snapshot contradicts its memory ceiling", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    const buildResourceRegistryForLaunch = vi.fn(() => localResourceRegistry({
      outcome: "within-limit",
      reason: "Projected local-model resident memory is within the configured ceiling.",
      requestedEstimatedResidentMemoryBytes: 8 * gib,
      activeEstimatedResidentMemoryBytes: 12 * gib,
      projectedEstimatedResidentMemoryBytes: 20 * gib,
      maxResidentMemoryBytes: 16 * gib,
      unloadCandidateIds: [],
    }));
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntimeForLaunch: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            estimatedResidentMemoryBytes: 8 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
        }),
        resolveRuntime: () => {
          throw new Error("Runtime resolver should not be used by scheduler preflight.");
        },
        buildResourceRegistryForLaunch,
      });
      const start = fixture.startInput();
      const result = await adapter.preflightChildLaunch?.({
        parentThread: start.parentThread,
        task: start.task,
        role: start.role,
        model: start.run.modelRuntimeSnapshot.profile,
        dependencyMode: start.dependencyMode,
        forkMode: start.forkMode,
        promptMode: start.promptMode,
        canonicalTaskPath: start.run.canonicalTaskPath,
        idempotencyKey: start.idempotencyKey,
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-subagent-child-runtime-launch-preflight-v1",
        runtime: "local_text",
        allowed: false,
        blockers: [
          expect.stringContaining("Local-model resource policy snapshot is invalid"),
        ],
        capacity: {
          localMemory: {
            outcome: "refuse",
            allowed: false,
            reason: expect.stringContaining("Local-model resource policy snapshot is invalid"),
            requestedEstimatedResidentMemoryBytes: 8 * gib,
            activeEstimatedResidentMemoryBytes: 12 * gib,
            projectedEstimatedResidentMemoryBytes: 20 * gib,
            maxResidentMemoryBytes: 16 * gib,
          },
        },
        details: {
          resourcePolicy: expect.objectContaining({
            outcome: "within-limit",
          }),
        },
      });
      expect(acquire).not.toHaveBeenCalled();
    } finally {
      fixture.close();
    }
  });

  it("fails before acquiring the runtime when local resource preflight refuses launch", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    const runtimeEvents: unknown[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            estimatedResidentMemoryBytes: 8 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        buildResourceRegistry: () => localResourceRegistry({
          outcome: "refuse",
          reason: "Projected local-model resident memory exceeds the configured ceiling by 4.0 GiB; refusing launch.",
          requestedEstimatedResidentMemoryBytes: 8 * gib,
          activeEstimatedResidentMemoryBytes: 12 * gib,
          projectedEstimatedResidentMemoryBytes: 20 * gib,
          maxResidentMemoryBytes: 16 * gib,
          exceededByBytes: 4 * gib,
          unloadCandidateIds: [],
        }),
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      const started = adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      expect(started).toMatchObject({
        started: true,
        run: { status: "starting" },
      });

      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(waited?.run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Local text delegation runtime preflight failed"),
        },
      });
      expect(acquire).not.toHaveBeenCalled();
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_preflight",
          preview: expect.objectContaining({
            allowed: false,
            resourcePolicy: expect.objectContaining({ outcome: "refuse" }),
          }),
        }),
        expect.objectContaining({ type: "subagent.local_text_failed" }),
      ]));
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "status", status: "starting" }),
        expect.objectContaining({ type: "error", status: "failed" }),
      ]));
    } finally {
      fixture.close();
    }
  });

  it("fails before acquiring the runtime when the local prompt exceeds model context limits", async () => {
    const smallProfile = localTextModel({
      contextWindowTokens: 16,
      maxOutputTokens: 8,
    });
    const fixture = await localTextFixture({
      modelRuntimeSnapshot: {
        ...localTextRuntimeSnapshot(),
        profile: smallProfile,
      },
    });
    const acquire = vi.fn(async () => runtimeLease());
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            command: "/runtime/local-text",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        buildPrompt: () => "x".repeat(100),
      });

      adapter.startChildRun?.(fixture.startInput());
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(waited?.run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("exceeding model local/text-4b context window 16 tokens"),
        },
      });
      expect(acquire).not.toHaveBeenCalled();
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_preflight",
          preview: expect.objectContaining({
            allowed: false,
            invocationLimits: expect.objectContaining({
              promptTokenEstimate: 25,
              outputReserveTokens: 8,
              projectedContextTokens: 33,
              contextFits: false,
            }),
          }),
        }),
        expect.objectContaining({ type: "subagent.local_text_failed" }),
      ]));
    } finally {
      fixture.close();
    }
  });

  it("fails before acquiring the runtime when the local launch descriptor is malformed", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    const runtimeEvents: unknown[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            command: "  ",
            healthUrl: "file:///tmp/health",
            startupTimeoutMs: 0,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
      });

      adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });

      expect(acquire).not.toHaveBeenCalled();
      expect(waited?.run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Local text runtime launch descriptor requires a non-empty command"),
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_preflight",
          preview: expect.objectContaining({
            allowed: false,
            launchReadiness: expect.objectContaining({
              schemaVersion: "ambient-local-text-runtime-launch-readiness-v1",
              ready: false,
              blockers: expect.arrayContaining([
                "Local text runtime launch descriptor requires a non-empty command before scheduler launch.",
                "Local text runtime healthUrl must be an absolute http(s) URL.",
                "Local text runtime startupTimeoutMs must be positive when healthUrl is configured.",
              ]),
              descriptor: expect.objectContaining({
                command: "",
                healthUrl: "file:///tmp/health",
                startupTimeoutMs: 0,
              }),
            }),
          }),
        }),
        expect.objectContaining({ type: "subagent.local_text_failed" }),
      ]));
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "status", status: "starting" }),
        expect.objectContaining({ type: "error", status: "failed" }),
      ]));
    } finally {
      fixture.close();
    }
  });

  it("records structured runtime startup failure evidence in the visible child thread", async () => {
    const fixture = await localTextFixture();
    const failure = localRuntimeStartupFailure();
    const acquire = vi.fn(async () => {
      throw new LocalModelRuntimeStartupError(failure);
    });
    const runtimeEvents: unknown[] = [];
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            healthUrl: "http://127.0.0.1:43123/health",
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
      });

      adapter.startChildRun?.({
        ...fixture.startInput(),
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: (event) => {
          runtimeEvents.push(event);
          return fixture.store.appendSubagentRunEvent(fixture.run.id, { type: "runtime-event", preview: event });
        },
      });

      expect(acquire).toHaveBeenCalledTimes(1);
      expect(waited?.run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Local model runtime did not become healthy"),
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_runtime_failed",
          preview: expect.objectContaining({
            schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
            reason: "startup_timeout",
            runtimeId: "local-text-runtime",
            modelId: "local/text-4b",
            stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
            stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
            health: expect.objectContaining({
              statusCode: 503,
              timedOut: true,
              textPreview: "health unavailable",
            }),
          }),
        }),
        expect.objectContaining({
          type: "subagent.local_text_failed",
          preview: expect.objectContaining({
            runtimeStartupFailure: expect.objectContaining({
              reason: "startup_timeout",
            }),
          }),
        }),
      ]));
      expect(fixture.store.listMessages(fixture.run.childThreadId).at(-1)).toMatchObject({
        role: "system",
        metadata: expect.objectContaining({
          status: "failed",
          runtimeStartupFailure: expect.objectContaining({
            runtimeId: "local-text-runtime",
            health: expect.objectContaining({ statusCode: 503 }),
          }),
        }),
      });
      expect(runtimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          status: "failed",
          details: expect.objectContaining({
            reason: "runtime_startup_failed",
            runtime: "local_text",
            runtimeStartupFailure: expect.objectContaining({
              reason: "startup_timeout",
            }),
          }),
        }),
      ]));
    } finally {
      fixture.close();
    }
  });

  it("unloads idle local runtimes and records enforcement before the visible child runs", async () => {
    const fixture = await localTextFixture();
    const acquire = vi.fn(async () => runtimeLease());
    const killLocalModelProcess = vi.fn();
    try {
      const adapter = createLocalTextSubagentRuntimeAdapter({
        store: fixture.store,
        runtimeManager: { acquire },
        resolveRuntime: () => ({
          launch: {
            runtimeId: "local-text-runtime",
            command: "/runtime/local-text",
            estimatedResidentMemoryBytes: 6 * gib,
          },
          completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
          artifactRootPath: fixture.artifactRootPath,
        }),
        buildResourceRegistry: () => localResourceRegistry({
          outcome: "unload-idle",
          reason: "Projected local-model resident memory exceeds the configured ceiling by 2.0 GiB; unload idle local models before launch.",
          requestedEstimatedResidentMemoryBytes: 6 * gib,
          activeEstimatedResidentMemoryBytes: 12 * gib,
          projectedEstimatedResidentMemoryBytes: 18 * gib,
          maxResidentMemoryBytes: 16 * gib,
          exceededByBytes: 2 * gib,
          unloadCandidateIds: ["idle-local-text"],
        }, [
          idleLocalTextResourceEntry("idle-local-text", 7001),
        ]),
        killLocalModelProcess,
        fetchImpl: async () => jsonResponse({ output_text: "Unloaded and completed." }),
        now: () => new Date("2026-06-05T00:00:00.000Z"),
      });

      adapter.startChildRun?.(fixture.startInput());
      const waited = await adapter.waitForChildRun?.({
        run: fixture.store.getSubagentRun(fixture.run.id),
        timeoutMs: 5000,
        emitEvent: fixture.emitEvent,
      });

      expect(killLocalModelProcess).toHaveBeenCalledWith(7001, "SIGTERM");
      expect(acquire).toHaveBeenCalledTimes(1);
      expect(waited?.run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: "Unloaded and completed.",
        },
      });
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.local_text_preflight",
          preview: expect.objectContaining({
            allowed: true,
            resourcePolicy: expect.objectContaining({ outcome: "unload-idle" }),
            resourcePolicyEnforcement: expect.objectContaining({
              allowed: true,
              outcome: "unloaded-idle",
              unload: expect.objectContaining({
                attemptedIds: ["idle-local-text"],
                stoppedIds: ["idle-local-text"],
                failed: [],
              }),
            }),
          }),
        }),
        expect.objectContaining({
          type: "subagent.local_text_started",
          preview: expect.objectContaining({
            resourcePolicyEnforcement: expect.objectContaining({
              outcome: "unloaded-idle",
            }),
          }),
        }),
      ]));
    } finally {
      fixture.close();
    }
  });
});

async function localTextFixture(options: {
  modelRuntimeSnapshot?: AmbientModelRuntimeSnapshot;
  roleId?: SubagentRoleId;
  roleProfileSnapshot?: SubagentRoleProfile;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-local-text-subagent-runtime-"));
  roots.push(root);
  const workspacePath = join(root, "workspace");
  const artifactRootPath = join(root, "artifacts");
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  const parent = store.createThread("Parent");
  const parentAssistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: parentAssistant.id });
  const featureFlags = resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const roleId = options.roleId ?? "summarizer";
  const role = options.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(roleId);
  const run = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: parentAssistant.id,
    title: "Local text child",
    roleId,
    roleProfileSnapshot: role,
    canonicalTaskPath: `root/0:${roleId}`,
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: options.modelRuntimeSnapshot ?? localTextRuntimeSnapshot(),
    dependencyMode: "required",
  });
  const toolScope = resolveSubagentToolScope({
    role,
    model: run.modelRuntimeSnapshot.profile,
    task: { requestedCategories: ["artifact.read"] },
    workspacePolicy: {
      hardDeniedCategories: ["secrets.read", "subagent.spawn"],
      approvalMode: "non_interactive",
      worktreeIsolated: false,
      allowNestedFanout: false,
    },
  });
  const toolScopeSnapshot = store.recordSubagentToolScopeSnapshot(run.id, {
    scope: toolScope,
    resolverInputs: { test: "local-text-subagent-runtime" },
  });
  const emitEvent = (event: any) => store.appendSubagentRunEvent(run.id, { type: "runtime-event", preview: event });
  return {
    store,
    parent,
    run,
    artifactRootPath,
    emitEvent,
    startInput: () => ({
      parentThread: parent,
      run: store.getSubagentRun(run.id),
      task: "Summarize the local evidence.",
      role,
      dependencyMode: "required" as const,
      forkMode: "no_history" as const,
      promptMode: "fresh" as const,
      toolScope,
      toolScopeSnapshot,
      turnBudgetPolicy: resolveSubagentTurnBudgetPolicy(role),
      idempotencyKey: "spawn-local-text",
      emitEvent,
    }),
    close: () => store.close(),
  };
}

function localTextRuntimeSnapshot(): AmbientModelRuntimeSnapshot {
  return {
    schemaVersion: "ambient-model-runtime-snapshot-v1",
    resolvedAt: "2026-06-05T00:00:00.000Z",
    requestedModelId: "local/text-4b",
    profile: localTextModel(),
  };
}

function localTextModel(overrides: Partial<AmbientModelRuntimeProfile> = {}): AmbientModelRuntimeProfile {
  return {
    schemaVersion: "ambient-model-runtime-profile-v1",
    profileId: "local:local/text-4b",
    providerId: "local",
    modelId: "local/text-4b",
    label: "Local Text 4B",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    contextWindowTokens: 16_384,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    toolUse: "none",
    structuredOutput: "none",
    supportsVision: false,
    supportsAudio: false,
    locality: "local",
    costClass: "local",
    trustClass: "local-user-managed",
    privacyLabel: "Local user-managed text model",
    memoryClass: "small-local",
    providerQuirks: [],
    ...overrides,
  };
}

function runtimeLeaseOwner(fixture: Awaited<ReturnType<typeof localTextFixture>>): RuntimeLeaseOwner {
  return {
    ownerThreadId: fixture.run.childThreadId,
    parentThreadId: fixture.parent.id,
    subagentThreadId: fixture.run.childThreadId,
    subagentRunId: fixture.run.id,
    ownerDisplayName: fixture.run.roleProfileSnapshot.label,
  };
}

function runtimeRelease(overrides: Partial<LocalModelRuntimeReleaseResult> & { owner?: RuntimeLeaseOwner } = {}): LocalModelRuntimeReleaseResult {
  const { owner, ...releaseOverrides } = overrides;
  return {
    status: "released",
    leaseId: "lease-1",
    pid: 5001,
    remainingLeases: 0,
    releasedAt: "2026-06-05T00:00:00.000Z",
    idleCleanupDueAt: "2026-06-05T00:05:00.000Z",
    runtimeLease: runtimeLeaseRecord("released", owner),
    ...releaseOverrides,
  };
}

function runtimeLease(options: { release?: () => Promise<LocalModelRuntimeReleaseResult>; owner?: RuntimeLeaseOwner } = {}): LocalModelRuntimeLease {
  const state = {
    schemaVersion: "ambient-local-model-runtime-state-v1" as const,
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b",
    pid: 5001,
    status: "running" as const,
    command: ["/runtime/local-text", "serve"],
    cwd: "/workspace",
    stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
    stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
    stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
    healthUrl: "http://127.0.0.1:43123/health",
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 4 * gib,
    memorySampledAt: "2026-06-05T00:00:01.000Z",
    ...options.owner,
  };
  const runtimeLeaseRecord = runtimeLeaseRecordForState(state, "running");
  return {
    leaseId: "lease-1",
    state,
    acquisition: {
      schemaVersion: "ambient-local-model-runtime-acquisition-v1",
      source: "started",
      leaseId: "lease-1",
      runtimeId: state.runtimeId,
      providerId: state.providerId,
      modelId: state.modelId,
      pid: state.pid,
      acquiredAt: state.lastUsedAt,
      activeLeases: 1,
      runtimeLease: runtimeLeaseRecord,
    },
    runtimeLease: runtimeLeaseRecord,
    release: options.release ?? (async () => runtimeRelease({ owner: options.owner })),
    touch: async () => state,
  };
}

function runtimeLeaseRecord(status: LocalRuntimeLeaseRecord["status"], owner?: RuntimeLeaseOwner): LocalRuntimeLeaseRecord {
  return runtimeLeaseRecordForState({
    schemaVersion: "ambient-local-model-runtime-state-v1",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b",
    pid: 5001,
    status: "running",
    command: ["/runtime/local-text", "serve"],
    cwd: "/workspace",
    stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
    stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
    stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:00:00.000Z",
    idleTimeoutMs: 300000,
    healthUrl: "http://127.0.0.1:43123/health",
    estimatedResidentMemoryBytes: 6 * gib,
    actualResidentMemoryBytes: 4 * gib,
    memorySampledAt: "2026-06-05T00:00:01.000Z",
    ...owner,
  }, status);
}

function runtimeLeaseRecordForState(
  state: LocalModelRuntimeLease["state"],
  status: LocalRuntimeLeaseRecord["status"],
): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-1",
    ...(state.parentThreadId ? { parentThreadId: state.parentThreadId } : {}),
    ...(state.subagentThreadId ? { subagentThreadId: state.subagentThreadId } : {}),
    ...(state.subagentRunId ? { subagentRunId: state.subagentRunId } : {}),
    ...(state.ownerDisplayName ? { ownerDisplayName: state.ownerDisplayName } : {}),
    modelRuntimeId: state.runtimeId,
    ...(state.profileId ? { modelProfileId: state.profileId } : {}),
    modelId: state.modelId,
    providerId: state.providerId,
    capabilityKind: "local-text",
    ...(state.estimatedResidentMemoryBytes !== undefined ? { estimatedResidentMemoryBytes: state.estimatedResidentMemoryBytes } : {}),
    ...(state.actualResidentMemoryBytes !== undefined ? { actualResidentMemoryBytes: state.actualResidentMemoryBytes } : {}),
    pid: state.pid,
    ...(state.healthUrl ? { endpoint: state.healthUrl } : {}),
    acquiredAt: state.lastUsedAt,
    lastHeartbeatAt: state.lastUsedAt,
    status,
  };
}

function localResourceRegistry(
  policyDecision: LocalModelResourcePolicyDecision,
  entries: LocalModelResourceRegistryEntry[] = [],
): LocalModelResourceRegistrySnapshot {
  const memoryLimitBehavior = policyDecision.outcome === "warn" || policyDecision.outcome === "refuse" || policyDecision.outcome === "unload-idle" || policyDecision.outcome === "ask-to-exceed"
    ? policyDecision.outcome
    : "warn";
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: "2026-06-05T00:00:00.000Z",
    settings: {
      schemaVersion: "ambient-local-model-resource-settings-v1",
      maxResidentMemoryBytes: policyDecision.maxResidentMemoryBytes,
      memoryLimitBehavior,
    },
    entries,
    activeCount: entries.filter((entry) => entry.running).length,
    activeEstimatedResidentMemoryBytes: policyDecision.activeEstimatedResidentMemoryBytes,
    ...(policyDecision.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: policyDecision.activeActualResidentMemoryBytes } : {}),
    policyDecision,
  };
}

function localRuntimeStartupFailure(): LocalModelRuntimeStartupFailure {
  return {
    schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
    reason: "startup_timeout",
    message: "Local model runtime did not become healthy: Local model runtime did not become healthy within 1ms.",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b",
    pid: 7001,
    command: ["/runtime/local-text", "serve"],
    cwd: "/workspace",
    stateDir: "/workspace/.ambient/local-model-runtime/local-text-runtime",
    stdoutPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stdout.log",
    stderrPath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime.stderr.log",
    startupTimeoutMs: 1,
    health: {
      ok: false,
      healthUrl: "http://127.0.0.1:43123/health",
      statusCode: 503,
      latencyMs: 12,
      textPreview: "health unavailable",
      error: "Local model runtime did not become healthy within 1ms.",
      timedOut: true,
    },
  };
}

function idleLocalTextResourceEntry(id: string, pid: number): LocalModelResourceRegistryEntry {
  return {
    capability: "local-text",
    id,
    pid,
    running: true,
    statePath: `/workspace/.ambient/local-model-runtime/${id}/state.json`,
    ownerThreadId: "previous-thread",
    modelId: "local/text-4b",
    profileId: "local:local/text-4b",
    estimatedResidentMemoryBytes: 8 * gib,
    startedAt: "2026-06-05T00:00:00.000Z",
    lastUsedAt: "2026-06-05T00:10:00.000Z",
    idleTimeMs: 600000,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function abortableFetch() {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("Expected local text fetch to receive an abort signal."));
        return;
      }
      const rejectAbort = () => reject(new Error("Local text fetch aborted by test."));
      if (signal.aborted) {
        rejectAbort();
      } else {
        signal.addEventListener("abort", rejectAbort, { once: true });
      }
    }));
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function eventually(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (lastError) throw lastError;
  assertion();
}
