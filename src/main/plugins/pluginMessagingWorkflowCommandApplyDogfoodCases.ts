/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { restoreProcessEnv, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

interface PluginMessagingWorkflowCommandApplyDogfoodDeps {
  AgentRuntime: new (...args: any[]) => any;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  getStore: () => any;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: any) => void;
}

export function registerPluginMessagingWorkflowCommandApplyDogfoodCases(deps: PluginMessagingWorkflowCommandApplyDogfoodDeps): void {
  const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as any, {
    get(_target, property) {
      const current = deps.getStore();
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as any;
  let runtime: any;
  const createRuntime = (...args: any[]) => {
    const value = new deps.AgentRuntime(...args);
    runtime = value;
    deps.setRuntime(value);
    return value;
  };

  itLive(
    "runs selected workflow exploration through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow action dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "workflow-action-dogfood-owner",
            phoneNumber: "+15550000007",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-workflow-action-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const workflowThread = store.createWorkflowAgentThreadSummary({
        folderId: store.listWorkflowAgentFolders()[0]?.id,
        title: "Remote workflow action target",
        initialRequest: "Check Remote Ambient Surface workflow action status.",
        projectPath: deps.getWorkspacePath(),
      });
      const thread = store.createThread("Remote Ambient Surface workflow action dogfood");
      let runExplorationCalls = 0;
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow action dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          workflowAgents: {
            runExploration: async (input: any) => {
              runExplorationCalls += 1;
              const graph = store.createWorkflowGraphSnapshot({
                workflowThreadId: input.workflowThreadId,
                source: "exploration",
                summary: "Remote Ambient Surface dogfood exploration graph.",
                nodes: [
                  {
                    id: "request",
                    type: "request",
                    label: "Owner request",
                    description: "Remote Ambient Surface workflow action dogfood request.",
                    runState: "completed",
                  },
                  {
                    id: "output",
                    type: "output",
                    label: "Status summary",
                    description: "Summarize the workflow action result for the owner.",
                    runState: "completed",
                  },
                ],
                edges: [
                  {
                    id: "request-to-output",
                    source: "request",
                    target: "output",
                    type: "data_flow",
                    label: "status",
                    runState: "completed",
                  },
                ],
              });
              const updatedThread = store.updateWorkflowAgentThreadPhase(input.workflowThreadId, "planned");
              return {
                thread: updatedThread,
                traceId: "trace-dogfood-1",
                graphSnapshotId: graph.id,
                text: "Workflow Agent exploration completed for Remote Ambient Surface dogfood.",
              };
            },
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface workflow action dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-action-dogfood-owner, conversationId workflow-action-conversation, ownerUserId owner-workflow-action-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-action-dogfood-owner, conversationId workflow-action-conversation, messageId workflow-action-dogfood-message-1, senderId owner-workflow-action-dogfood, senderLabel Owner, and text run exploration.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should run the selected Ambient Workflow Agent exploration action after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_ACTION_OK and include the phrases run exploration, Workflow action result: exploration, trace-dogfood-1, Remote Ambient Surface command apply, and Workflow projection.",
          ],
          expected: "MESSAGING_GATEWAY_WORKFLOW_ACTION_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("run exploration");
      expect(transcript).toContain("Workflow action result: exploration");
      expect(transcript).toContain("trace-dogfood-1");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(runExplorationCalls).toBe(1);
      expect(store.getWorkflowAgentThreadSummary(workflowThread.id).activeGraphSnapshotId).toEqual(expect.any(String));
    },
    300_000,
  );

  itLive(
    "approves selected workflow previews through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow review dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "workflow-review-dogfood-owner",
            phoneNumber: "+15550000008",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-workflow-review-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const workflowThread = store.createWorkflowAgentThreadSummary({
        folderId: store.listWorkflowAgentFolders()[0]?.id,
        title: "Remote workflow review target",
        initialRequest: "Review Remote Ambient Surface workflow preview status.",
        projectPath: deps.getWorkspacePath(),
      });
      const artifact = store.createWorkflowArtifact({
        workflowThreadId: workflowThread.id,
        title: "Remote workflow review preview",
        status: "ready_for_preview",
        manifest: {
          tools: [],
          mutationPolicy: "read_only",
        },
        spec: {
          goal: "Review Remote Ambient Surface workflow preview status.",
          summary: "A reviewable workflow preview for Remote Ambient Surface dogfood.",
        },
        sourcePath: join(deps.getWorkspacePath(), "remote-workflow-review.js"),
        statePath: join(deps.getWorkspacePath(), ".workflow-review-state"),
      });
      const thread = store.createThread("Remote Ambient Surface workflow review dogfood");
      let reviewArtifactCalls = 0;
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow review dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          workflowAgents: {
            reviewArtifact: async (input: any) => {
              reviewArtifactCalls += 1;
              const before = store.getWorkflowArtifact(input.artifactId);
              const updated =
                before.status === input.decision ? before : store.updateWorkflowArtifact({ id: input.artifactId, status: input.decision });
              const updatedThread = store.getWorkflowAgentThreadSummary(input.workflowThreadId);
              return {
                thread: updatedThread,
                artifactId: updated.id,
                artifactStatus: updated.status,
                changed: before.status !== updated.status,
                text: `Workflow preview approved via Remote Ambient Surface dogfood\nartifactStatus=${updated.status}`,
              };
            },
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface workflow preview review dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-review-dogfood-owner, conversationId workflow-review-conversation, ownerUserId owner-workflow-review-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-review-dogfood-owner, conversationId workflow-review-conversation, messageId workflow-review-dogfood-message-1, senderId owner-workflow-review-dogfood, senderLabel Owner, and text approve workflow preview.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should approve the selected Ambient Workflow Agent preview artifact after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, run exploration, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_REVIEW_OK and include the phrases approve workflow preview, Workflow action result: artifact approved, artifactStatus=approved, Remote Ambient Surface command apply, and Workflow projection.",
          ],
          expected: "MESSAGING_GATEWAY_WORKFLOW_REVIEW_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("approve workflow preview");
      expect(transcript).toContain("Workflow action result: artifact approved");
      expect(transcript).toContain("artifactStatus=approved");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(reviewArtifactCalls).toBe(1);
      expect(store.getWorkflowArtifact(artifact.id).status).toBe("approved");
    },
    300_000,
  );

  itLive(
    "recovers a failed workflow through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface workflow recovery dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            state: "ready",
            profileId: "workflow-recovery-dogfood-owner",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-workflow-recovery-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const workflowThread = store.createWorkflowAgentThreadSummary({
        folderId: store.listWorkflowAgentFolders()[0]?.id,
        title: "Remote workflow recovery target",
        initialRequest: "Retry failed Remote Ambient Surface workflow classifications.",
        projectPath: deps.getWorkspacePath(),
      });
      store.createWorkflowGraphSnapshot({
        workflowThreadId: workflowThread.id,
        source: "compile",
        summary: "Classify records.",
        nodes: [
          { id: "request", type: "request", label: "Request" },
          { id: "classify", type: "model_call", label: "Classify", retryPolicy: "Retry with same retained input." },
        ],
        edges: [{ id: "request-classify", source: "request", target: "classify", type: "control_flow" }],
      });
      const artifact = store.createWorkflowArtifact({
        workflowThreadId: workflowThread.id,
        title: "Remote workflow recovery artifact",
        status: "approved",
        manifest: {
          tools: [],
          mutationPolicy: "read_only",
        },
        spec: {
          goal: "Retry failed Remote Ambient Surface workflow classifications.",
          summary: "An approved workflow artifact with a retryable failed event for Remote Ambient Surface dogfood.",
        },
        sourcePath: join(deps.getWorkspacePath(), "remote-workflow-recovery.js"),
        statePath: join(deps.getWorkspacePath(), ".workflow-recovery-state.json"),
      });
      const failedRun = store.startWorkflowRun({ artifactId: artifact.id, status: "failed" });
      const failedEvent = store.appendWorkflowRunEvent({
        runId: failedRun.id,
        type: "ambient.call.error",
        graphNodeId: "classify",
        message: "schema mismatch",
      });
      const thread = store.createThread("Remote Ambient Surface workflow recovery dogfood");
      let recoverRunCalls = 0;
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface workflow recovery dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          workflowAgents: {
            recoverRun: async (input: any) => {
              recoverRunCalls += 1;
              expect(input).toMatchObject({
                workflowThreadId: workflowThread.id,
                runId: failedRun.id,
                eventId: failedEvent.id,
                action: "retry_step",
                graphNodeId: "classify",
              });
              const recoveredRun = store.startWorkflowRun({ artifactId: artifact.id, status: "succeeded" });
              const updatedThread = store.getWorkflowAgentThreadSummary(input.workflowThreadId);
              return {
                thread: updatedThread,
                runId: recoveredRun.id,
                runStatus: recoveredRun.status,
                changed: true,
                text: `Workflow recovery run completed\nRecovery action: ${input.action}\nSource event: ${input.eventId}\nRecovered run: ${recoveredRun.status} (${recoveredRun.id})`,
              };
            },
          },
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface workflow recovery dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId workflow-recovery-dogfood-owner, conversationId workflow-recovery-conversation, ownerUserId owner-workflow-recovery-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_runtime_surface_snapshot with limit 5 and confirm it shows a recovery event with the command retry failed step.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId workflow-recovery-dogfood-owner, conversationId workflow-recovery-conversation, messageId workflow-recovery-dogfood-message-1, senderId owner-workflow-recovery-dogfood, senderLabel Owner, and text retry failed step.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should retry the selected failed workflow event after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, compile, run exploration, approve/reject preview, cancel workflow, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_WORKFLOW_RECOVERY_OK and include the phrases Recovery events, retry failed step, Workflow action result: recovery retry, Recovery action: retry_step, Remote Ambient Surface command apply, and Workflow projection.",
          ],
          expected: "MESSAGING_GATEWAY_WORKFLOW_RECOVERY_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("Recovery events");
      expect(transcript).toContain("retry failed step");
      expect(transcript).toContain("Workflow action result: recovery retry");
      expect(transcript).toContain("Recovery action: retry_step");
      expect(recoverRunCalls).toBe(1);
    },
    300_000,
  );
}
