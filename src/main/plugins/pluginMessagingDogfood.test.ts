import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaPlaybackSettings, SttSettings } from "../../shared/localRuntimeTypes";
import type { PermissionPromptResponseMode, PermissionRequest } from "../../shared/permissionTypes";
import { buildRemoteSurfaceActivationPrompt } from "../../renderer/src/pluginUiModel";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { createDefaultMessagingProviderRegistry, createMessagingBindingStore } from "./pluginsMessagingDogfoodFacade";
import { registerPluginMessagingActivationDogfoodCases } from "./pluginMessagingActivationDogfoodCases";
import { registerPluginMessagingRemoteSurfaceDogfoodCases } from "./pluginMessagingRemoteSurfaceDogfoodCases";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { isolatePluginDiscoveryEnv, restoreProcessEnv, seedFixtureMarketplace, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-messaging-dogfood-electron`,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => electronMock.userDataPath,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8"),
  },
}));

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" ? it : it.skip;
const itTelegramOwnerLoopLive =
  process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" && process.env.AMBIENT_TELEGRAM_OWNER_LOOP_LIVE === "1" ? it : it.skip;

describeNative("Plugin messaging dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-messaging-dogfood-")));
    restoreEnv = isolatePluginDiscoveryEnv(workspacePath);
    await seedFixtureMarketplace(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });

  registerPluginMessagingRemoteSurfaceDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    ProjectStore,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  registerPluginMessagingActivationDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    buildRemoteSurfaceActivationPrompt,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

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
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "workflow-action-dogfood-owner", "bridge-session.json"),
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
        projectPath: workspacePath,
      });
      const thread = store.createThread("Remote Ambient Surface workflow action dogfood");
      let runExplorationCalls = 0;
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
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
            runExploration: async (input) => {
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

      let transcript = "";
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
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "workflow-review-dogfood-owner", "bridge-session.json"),
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
        projectPath: workspacePath,
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
        sourcePath: join(workspacePath, "remote-workflow-review.js"),
        statePath: join(workspacePath, ".workflow-review-state"),
      });
      const thread = store.createThread("Remote Ambient Surface workflow review dogfood");
      let reviewArtifactCalls = 0;
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
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
            reviewArtifact: async (input) => {
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

      let transcript = "";
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
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "workflow-recovery-dogfood-owner", "bridge-session.json"),
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
        projectPath: workspacePath,
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
        sourcePath: join(workspacePath, "remote-workflow-recovery.js"),
        statePath: join(workspacePath, ".workflow-recovery-state.json"),
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
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
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
            recoverRun: async (input) => {
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

      let transcript = "";
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

  itLive(
    "updates speech input policy through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface speech settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "speech-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "speech-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "speech-dogfood-owner",
            phoneNumber: "+15550000001",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-speech-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let sttSettings: SttSettings = {
        enabled: true,
        providerCapabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
        spokenLanguage: "English",
        mode: "push-to-talk",
        autoSendAfterTranscription: true,
        silenceFinalizeSeconds: 0.8,
        noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      };
      const thread = store.createThread("Remote Ambient Surface speech settings dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface speech settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          stt: {
            readSettings: () => sttSettings,
            updateSettings: (input) => {
              sttSettings = input;
              return sttSettings;
            },
            listProviders: () => [
              {
                capabilityId: "ambient-cli:qwen3-asr:tool:qwen3_asr_transcribe",
                providerId: "qwen3-asr",
                packageId: "qwen3-asr",
                packageName: "qwen3-asr",
                command: "qwen3_asr_transcribe",
                label: "Qwen3 ASR",
                installed: true,
                available: true,
                availabilityReason: "dogfood fixture provider",
                languages: ["English", "Spanish"],
                defaultLanguage: "English",
              },
            ],
          },
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface speech settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId speech-dogfood-owner, conversationId speech-settings-conversation, ownerUserId owner-speech-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId speech-dogfood-owner, conversationId speech-settings-conversation, messageId speech-dogfood-message-1, senderId owner-speech-dogfood, senderLabel Owner, and text set speech language Spanish.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient STT policy after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_STT_SETTINGS_OK and include the phrases set speech language Spanish, stt policy apply, spokenLanguage=Spanish, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_STT_SETTINGS_OK",
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
      expect(transcript).toContain("set speech language Spanish");
      expect(transcript).toContain("stt policy apply");
      expect(transcript).toContain("spokenLanguage=Spanish");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(sttSettings.spokenLanguage).toBe("Spanish");
    },
    300_000,
  );

  itLive(
    "updates generated media playback through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface media settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "media-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "media-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "media-dogfood-owner",
            phoneNumber: "+15550000002",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-media-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let mediaSettings: MediaPlaybackSettings = { generatedMediaAutoplay: false };
      const thread = store.createThread("Remote Ambient Surface media settings dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface media settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          media: {
            readSettings: () => mediaSettings,
            updateSettings: (input) => {
              mediaSettings = input;
              return mediaSettings;
            },
          },
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface generated media settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId media-dogfood-owner, conversationId media-settings-conversation, ownerUserId owner-media-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId media-dogfood-owner, conversationId media-settings-conversation, messageId media-dogfood-message-1, senderId owner-media-dogfood, senderLabel Owner, and text set generated media autoplay on.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient generated media playback setting after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_MEDIA_SETTINGS_OK and include the phrases set generated media autoplay on, media playback apply, generatedMediaAutoplay=true, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_MEDIA_SETTINGS_OK",
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
      expect(transcript).toContain("set generated media autoplay on");
      expect(transcript).toContain("media playback apply");
      expect(transcript).toContain("generatedMediaAutoplay=true");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(mediaSettings.generatedMediaAutoplay).toBe(true);
    },
    300_000,
  );

  itLive(
    "updates Planner finalization through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface Planner settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "planner-settings-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "planner-settings-dogfood-owner",
            phoneNumber: "+15550000006",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-planner-settings-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      let plannerSettings = { autoFinalize: true };
      const thread = store.createThread("Remote Ambient Surface Planner settings dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface Planner settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          planner: {
            readSettings: () => plannerSettings,
            updateSettings: (input) => {
              plannerSettings = input;
              return plannerSettings;
            },
          },
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface Planner finalization settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, ownerUserId owner-planner-settings-dogfood, ambientSurface settings, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId planner-settings-dogfood-owner, conversationId planner-settings-conversation, messageId planner-settings-dogfood-message-1, senderId owner-planner-settings-dogfood, senderLabel Owner, and text set planner autoFinalize off.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the Ambient Planner finalization setting after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PLANNER_SETTINGS_OK and include the phrases set planner autoFinalize off, planner finalization apply, autoFinalize=false, Remote Ambient Surface command apply, and Settings projection.",
          ],
          expected: "MESSAGING_GATEWAY_PLANNER_SETTINGS_OK",
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
      expect(transcript).toContain("set planner autoFinalize off");
      expect(transcript).toContain("planner finalization apply");
      expect(transcript).toContain("autoFinalize=false");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(plannerSettings.autoFinalize).toBe(false);
    },
    300_000,
  );

  itLive(
    "updates selected chat thread settings through Remote Ambient Surface command apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface thread settings dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "thread-settings-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "thread-settings-dogfood-owner",
            phoneNumber: "+15550000003",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-thread-settings-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote Ambient Surface thread settings dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface thread settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface selected chat thread settings dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, ownerUserId owner-thread-settings-dogfood, ambientSurface chat, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId thread-settings-dogfood-owner, conversationId thread-settings-conversation, messageId thread-settings-dogfood-message-1, senderId owner-thread-settings-dogfood, senderLabel Owner, and text set chat mode planner.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should update the selected Ambient chat thread mode after approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_THREAD_SETTINGS_OK and include the phrases set chat mode planner, thread settings apply, collaborationMode=planner, Remote Ambient Surface command apply, and Chat projection.",
          ],
          expected: "MESSAGING_GATEWAY_THREAD_SETTINGS_OK",
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
      expect(transcript).toContain("set chat mode planner");
      expect(transcript).toContain("thread settings apply");
      expect(transcript).toContain("collaborationMode=planner");
      expect(transcript).toContain("Remote Ambient Surface command apply");
      expect(store.getThread(thread.id).collaborationMode).toBe("planner");
    },
    300_000,
  );

  itLive(
    "responds to pending permission prompts through Remote Ambient Surface approval commands",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface approval dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "approval-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "approval-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "approval-dogfood-owner",
            phoneNumber: "+15550000004",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-approval-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote Ambient Surface approval dogfood");
      const pendingApproval: PermissionRequest = {
        id: "permission-approval-dogfood",
        threadId: thread.id,
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        title: "Send Telegram reply?",
        message: "Send one owner-scoped reply through Telegram.",
        detail: "Reply preview: Remote approval dogfood status.",
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantActionKind: "plugin_tool_execute",
        grantTargetKind: "tool",
        grantTargetLabel: "telegram reply dogfood",
        grantTargetHash: "telegram-reply-dogfood",
      };
      let approvalResponse: { id: string; response: PermissionPromptResponseMode } | undefined;
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface approval dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
          listPending: () => (approvalResponse ? [] : [pendingApproval]),
          respond: (id, response) => {
            approvalResponse = { id, response };
          },
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface pending approval dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId approval-dogfood-owner, conversationId approval-settings-conversation, ownerUserId owner-approval-dogfood, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId approval-dogfood-owner, conversationId approval-settings-conversation, messageId approval-dogfood-message-1, senderId owner-approval-dogfood, senderLabel Owner, and text approve request 1 always thread.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should resolve the pending Ambient permission prompt without asking for another approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK and include the phrases approve request 1 always thread, approval response apply, pendingApprovals=0, Responded to approval, and Remote Ambient Surface command apply.",
          ],
          expected: "MESSAGING_GATEWAY_APPROVAL_RESPONSE_OK",
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
      expect(transcript).toContain("approve request 1 always thread");
      expect(transcript).toContain("approval response apply");
      expect(transcript).toContain("Responded to approval");
      expect(approvalResponse).toEqual({
        id: "permission-approval-dogfood",
        response: "always_thread",
      });
    },
    300_000,
  );

  itLive(
    "revokes persistent permission grants through Remote Ambient Surface commands",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Remote Ambient Surface grant revocation dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "grant-revoke-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "grant-revoke-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "grant-revoke-owner",
            phoneNumber: "+15550000005",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-grant-revoke-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const thread = store.createThread("Remote permission grant revoke dogfood");
      const grant = store.createPermissionGrant({
        permissionModeAtCreation: "workspace",
        scopeKind: "thread",
        threadId: thread.id,
        actionKind: "plugin_tool_execute",
        targetKind: "tool",
        targetHash: "remote-grant-dogfood",
        targetLabel: "Remote dogfood grant",
        source: "permission_prompt",
        reason: "Dogfood grant for Remote Ambient Surface revocation.",
      });
      store.addPermissionAudit({
        threadId: thread.id,
        permissionMode: "workspace",
        toolName: "ambient_messaging_telegram_bridge_reply_apply",
        risk: "plugin-tool",
        decision: "allowed",
        reason: "Matched dogfood persistent grant.",
        decisionSource: "persistent_grant",
        grantId: grant.id,
      });

      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName === "ambient_messaging_telegram_remote_surface_apply") {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Remote Ambient Surface grant revoke dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
          listPending: () => [],
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface permission grant revocation dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId grant-revoke-owner, conversationId grant-revoke-conversation, ownerUserId owner-grant-revoke, ambientSurface notifications, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields. This should be approved by the permission requester.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId grant-revoke-owner, conversationId grant-revoke-conversation, messageId grant-revoke-message-1, senderId owner-grant-revoke, senderLabel Owner, and text revoke grant 1.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that queuedProjectionId. This should revoke the active Ambient permission grant without asking for another approval.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, generic binding apply, install, repair, provider setup, approval response, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_GRANT_REVOKE_OK and include the phrases revoke grant 1, grant revoke apply, activeGrants=0, Revoked permission grant, and Remote Ambient Surface command apply.",
          ],
          expected: "MESSAGING_GATEWAY_GRANT_REVOKE_OK",
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
      expect(transcript).toContain("revoke grant 1");
      expect(transcript).toContain("grant revoke apply");
      expect(transcript).toContain("Revoked permission grant");
      expect(store.listPermissionGrants()).toEqual([]);
      expect(store.getPermissionGrant(grant.id).revokedAt).toEqual(expect.any(String));
    },
    300_000,
  );

  itLive(
    "recognizes the planned Signal messaging provider stub without using it",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live messaging provider stub dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Signal provider stub dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Signal provider stub dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging provider stub dogfood test.",
          "Call ambient_messaging_list_providers.",
          "Then call ambient_messaging_conversation_directory_preview with providerId signal-cli and purpose remote_ambient_surface.",
          "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
          "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. It should return blocked without approval or provider I/O.",
          "Then call ambient_messaging_remote_surface_binding_preview with action create, providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
          "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
          "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. It should return blocked without approval or provider I/O.",
          "Then call ambient_messaging_remote_surface_event_preview with providerId signal-cli, authProfileId dogfood-owner, conversationId signal-dogfood-conversation, senderId signal-owner, and text status.",
          "Then call ambient_messaging_gateway_status.",
          "Do not call any lifecycle, binding apply, bridge, polling, reply, shell, browser, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_STUB_OK and include the phrases Signal planned provider, metadata-only, implementation planned, bindings disabled, runtime disabled, Signal readiness unavailable, Provider directory tool ambient_messaging_signal_conversation_directory_preview, Signal directory apply blocked, Signal binding readiness blocked, Signal owner handoff blocked, Signal owner handoff apply blocked, Handoff status not-attempted, Can feed binding apply no, Generic binding apply no, Telegram owner handoff no, no Signal messages read, no Signal messages sent, Typed apply tool none, and Typed route tool none.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_STUB_OK",
      });

      expect(transcript).toContain("ambient_messaging_list_providers completed");
      expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_binding_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_event_preview completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("Signal (signal-cli)");
      expect(transcript).toContain("Implementation: planned");
      expect(transcript).toContain("Readiness: unavailable");
      expect(transcript).toContain("Binding lifecycle: disabled");
      expect(transcript).toContain("Inbound ingestion: disabled");
      expect(transcript).toContain("Provider directory tool: ambient_messaging_signal_conversation_directory_preview");
      expect(transcript).toContain("Signal conversation directory result: blocked");
      expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
      expect(transcript).toContain("Signal owner handoff preview: blocked");
      expect(transcript).toContain("Signal owner handoff apply: blocked");
      expect(transcript).toContain("Handoff status: not-attempted");
      expect(transcript).toContain("Can feed binding apply: no");
      expect(transcript).toContain("Reads Signal unread messages: no");
      expect(transcript).toContain("Generic binding apply allowed: no");
      expect(transcript).toContain("Telegram owner handoff allowed: no");
      expect(transcript).toContain("Uses Telegram owner handoff: no");
      expect(transcript).toContain("Typed apply tool: none");
      expect(transcript).toContain("Typed route tool: none");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_STUB_OK");
      expect(transcript).toContain("no Signal messages read");
      expect(transcript).toContain("no Signal messages sent");
    },
    240_000,
  );

  itLive(
    "records Signal setup metadata without provider I/O",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal setup metadata dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config");
      await mkdir(signalConfigDir, { recursive: true });
      const thread = store.createThread("Signal setup metadata dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async () => ({ allowed: true, mode: "allow_once" }),
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging Signal setup metadata dogfood test.",
          `Call ambient_messaging_signal_session_preview with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          `Then call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
          "Then call ambient_messaging_gateway_status.",
          "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, conversation directory apply, binding apply, polling, reply, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_SETUP_OK and include the phrases Signal setup metadata written, no Signal messages read, no Signal messages sent, Signal runtime disabled, and Signal readiness unavailable.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_SETUP_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_session_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("Signal session setup apply");
      expect(transcript).toContain("Apply status: applied");
      expect(transcript).toContain("Readiness: unavailable");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_SETUP_OK");
      expect(transcript).toContain("no Signal messages read");
      expect(transcript).toContain("no Signal messages sent");
    },
    240_000,
  );

  itLive(
    "recognizes a fake Signal bridge contract without enabling Signal sends",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal bridge contract dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config");
      await mkdir(signalConfigDir, { recursive: true });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      const previousSignalOwnerHandoffFakeApply = process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY;
      const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      let unreadWindowRequestCount = 0;
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: true,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/conversations?metadataOnly=true&limit=5&query=dogfood") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              conversations: [
                {
                  conversationId: "signal-dogfood-conversation",
                  title: "Signal Dogfood",
                  type: "direct",
                  unreadCount: 1,
                  folderIds: [],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-owner/conversations/signal-dogfood-conversation/unread?limit=5") {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-owner",
              conversationId: "signal-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-dogfood-setup-message",
                  senderId: "signal-owner",
                  senderLabel: "Signal Owner",
                  text: "ambient-signal-setup-code-12345",
                  receivedAt: "2026-05-10T00:00:00.000Z",
                  outgoing: false,
                },
                {
                  messageId: "signal-dogfood-other-message",
                  senderId: "other-sender",
                  text: "private text that must not leak",
                  receivedAt: "2026-05-10T00:00:01.000Z",
                  outgoing: false,
                },
                ...(unreadWindowRequestCount >= 2
                  ? [
                      {
                        messageId: "signal-dogfood-command-message",
                        senderId: "signal-owner",
                        senderLabel: "Signal Owner",
                        text: "show projects private command must not leak",
                        receivedAt: "2026-05-10T00:00:02.000Z",
                        outgoing: false,
                      },
                    ]
                  : []),
              ],
            }),
          );
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
      process.env.AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY = "1";
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

      try {
        const thread = store.createThread("Signal bridge contract dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async () => ({ allowed: true, mode: "allow_once" }),
            denyThread: () => undefined,
          },
        );

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging Signal bridge contract dogfood test.",
            `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
            "Then call ambient_messaging_gateway_status.",
            "Then call ambient_messaging_signal_conversation_directory_preview with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5.",
            "Then call ambient_messaging_signal_conversation_directory_apply with providerId signal-cli, profileId dogfood-owner, purpose remote_ambient_surface, query dogfood, and limit 5. The permission requester will approve this metadata-only read.",
            "Then call ambient_messaging_signal_binding_readiness_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_owner_handoff_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5.",
            "Then call ambient_messaging_signal_owner_handoff_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, setupCode ambient-signal-setup-code-12345, and limit 5. The permission requester will approve this bounded fake-bridge owner handoff read.",
            "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, ownerUserId signal-owner, ownerHandoffSourceMessageId signal-dogfood-setup-message, initialSeenMessageIds [signal-dogfood-setup-message, signal-dogfood-other-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write, so it should persist the binding without starting Signal, reading messages, polling unread windows, or sending replies.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the active Signal binding.",
            "Then call ambient_messaging_signal_unread_window_preview with providerId signal-cli, bindingId from the active Signal binding, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5.",
            "Then call ambient_messaging_signal_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve this bounded fake-bridge unread-window read.",
            "Then call ambient_messaging_signal_unread_window_status with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
            "Then call ambient_messaging_signal_unread_window_apply a second time with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and limit 5. The permission requester will approve it; this repeat should be idempotent and report duplicate messages instead of creating another accepted dispatch.",
            "Then call ambient_messaging_signal_unread_window_status again with providerId signal-cli, the same active bindingId, profileId dogfood-owner, conversationId signal-dogfood-conversation, and includeInactive false.",
            "Then call ambient_messaging_signal_remote_surface_preview with action revoke, providerId signal-cli, bindingId from the active Signal binding, and reason dogfood cleanup.",
            "Then call ambient_messaging_signal_remote_surface_apply with action revoke, providerId signal-cli, the same bindingId, and reason dogfood cleanup. The permission requester will approve this metadata-only revoke.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to verify the Signal binding is revoked.",
            "Do not call shell, browser, install, lifecycle, Signal Desktop, provider CLI, generic binding apply, polling, reply, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK and include the phrases Signal bridge root contract accepted, Signal bridge profile status contract accepted, Bridge reachable yes, Configured yes, Signal conversation directory applied, signal-dogfood-conversation, Signal binding readiness blocked, Signal owner handoff ready, Signal owner handoff applied, Handoff status matched, Can feed binding apply yes, Signal remote surface preview ready, Signal remote surface applied, Signal unread apply applied, Accepted dispatches 1, Signal unread-window status ready, Duplicate messages 3, Queued Signal projections 1, Real Signal unread ingestion enabled no, Signal remote surface revoke ready, Signal remote surface revoke applied, Persisted yes, Status revoked, Generic binding apply no, Telegram owner handoff no, Apply tool ambient_messaging_signal_unread_window_apply, no Signal message bodies returned, and no Signal messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
        expect(transcript).toContain("ambient_messaging_gateway_status completed");
        expect(transcript).toContain("ambient_messaging_signal_conversation_directory_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_conversation_directory_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_binding_readiness_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_owner_handoff_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_owner_handoff_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
        expect(transcript).toContain("ambient_messaging_list_bindings completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_unread_window_status completed");
        expect(transcript).toContain("Signal bridge root contract accepted");
        expect(transcript).toContain("Signal bridge profile status contract accepted");
        expect(transcript).toContain("Bridge reachable: yes");
        expect(transcript).toContain("Configured: yes");
        expect(transcript).toContain("Signal conversation directory result: applied");
        expect(transcript).toContain("signal-dogfood-conversation");
        expect(transcript).toContain("Signal Remote Ambient Surface binding readiness preview: blocked");
        expect(transcript).toContain("Signal owner handoff preview: ready");
        expect(transcript).toContain("Signal owner handoff apply: applied");
        expect(transcript).toContain("Handoff status: matched");
        expect(transcript).toContain("Can feed binding apply: yes");
        expect(transcript).toContain("Reads Signal unread messages: yes");
        expect(transcript).toContain("Signal Remote Ambient Surface binding preview ready");
        expect(transcript).toContain("Signal Remote Ambient Surface binding applied");
        expect(transcript).toContain("Signal bounded unread-window apply");
        expect(transcript).toContain("Apply status: applied");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("Signal unread-window status");
        expect(transcript).toContain("Status: ready");
        expect(transcript).toContain("Duplicate messages: 3");
        expect(transcript).toContain("Queued Signal projections: 1");
        expect(transcript).toContain("Real Signal unread ingestion enabled: no");
        expect(transcript).toContain("Signal Remote Ambient Surface binding revoke preview ready");
        expect(transcript).toContain("Signal Remote Ambient Surface binding revoke applied");
        expect(transcript).toContain("Persisted: yes");
        expect(transcript).toContain("Active: 1");
        expect(transcript).toContain("Status: revoked");
        expect(transcript).toContain("Generic binding apply allowed: no");
        expect(transcript).toContain("Telegram owner handoff allowed: no");
        expect(transcript).toContain("Uses Telegram owner handoff: no");
        expect(transcript).toContain("Signal bounded unread-window preview");
        expect(transcript).toContain("Apply tool: ambient_messaging_signal_unread_window_apply");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_BRIDGE_CONTRACT_OK");
        expect(transcript).toContain("no Signal message bodies returned");
        expect(transcript).toContain("no Signal messages sent");
        expect(transcript).not.toContain("private text that must not leak");
        expect(transcript).not.toContain("show projects private command must not leak");
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_OWNER_HANDOFF_FAKE_BRIDGE_APPLY", previousSignalOwnerHandoffFakeApply);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    240_000,
  );

  itLive(
    "sends approved Signal bridge replies through the reviewed contract",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal reply send dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-reply");
      await mkdir(signalConfigDir, { recursive: true });
      await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner"), { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "signal", "dogfood-reply-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-reply-owner",
          signalCliConfigDir: signalConfigDir,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }),
      );
      const bindingStore = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      });
      const createdBinding = bindingStore.create({
        providerId: "signal-cli",
        authProfileId: "dogfood-reply-owner",
        conversationId: "signal-reply-dogfood-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "signal-reply-owner",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-reply-source-message",
          initialSeenMessageIds: ["signal-reply-source-message"],
        },
      });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      let sendRequestCount = 0;
      let unreadRequestCount = 0;
      let sentBody: unknown;
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: true,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-reply-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-reply-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/unread?limit=5") {
          unreadRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-reply-owner",
              conversationId: "signal-reply-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-reply-command-message",
                  senderId: "signal-reply-owner",
                  senderLabel: "Signal Owner",
                  text: "switch project Signal relay project private text must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-reply-owner/conversations/signal-reply-dogfood-conversation/send") {
          sendRequestCount += 1;
          let raw = "";
          request.on("data", (chunk) => {
            raw += chunk.toString();
          });
          request.on("end", () => {
            sentBody = raw ? JSON.parse(raw) : undefined;
            response.end(
              JSON.stringify({
                ok: true,
                messageId: "signal-dogfood-sent-message",
                sentAt: "2026-05-10T00:00:05.000Z",
              }),
            );
          });
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
      process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY = "1";

      try {
        const thread = store.createThread("Signal reply send dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              if (
                request.toolName === "ambient_messaging_signal_unread_window_apply" ||
                request.toolName === "ambient_messaging_signal_bridge_reply_apply"
              ) {
                return { allowed: true, mode: "allow_once" };
              }
              throw new Error(`Unexpected permission prompt during Signal reply send dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
        );
        const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
        (runtime as any).createMessagingGatewayToolExtension(
          thread.id,
          store.getWorkspace(),
        )({
          registerTool: (tool: any) => registeredTools.push(tool),
        });
        const tool = (name: string) => {
          const found = registeredTools.find((candidate) => candidate.name === name);
          if (!found) throw new Error(`Missing dogfood setup tool ${name}`);
          return found;
        };
        const unread = await tool("ambient_messaging_signal_unread_window_apply").execute("signal-runtime-dogfood-unread", {
          providerId: "signal-cli",
          bindingId: createdBinding.binding.id,
          profileId: "dogfood-reply-owner",
          conversationId: "signal-reply-dogfood-conversation",
          limit: 5,
        });
        expect(unread.details).toMatchObject({
          status: "applied",
          acceptedDispatchCount: 1,
        });
        const queuedProjectionId = unread.details.dispatches?.[0]?.queuedProjectionId;
        expect(queuedProjectionId).toBeTruthy();
        const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
          kind: "active_project_switch",
          status: "completed",
          title: "Switch to Signal relay project",
          summary: "Active Ambient project switched to Signal relay project.",
          threadId: thread.id,
          queuedProjectionId,
          sourceEventId: "signal-dogfood-reply-owner-signal-reply-dogfood-conversation-signal-reply-command-message",
          bindingId: createdBinding.binding.id,
          projectName: "Signal relay project",
          completedAt: "2026-05-10T00:00:04.000Z",
          relaySuggested: true,
        });

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging approved Signal runtime-event relay dogfood test.",
            `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and ownerUserId signal-reply-owner.`,
            `A completed Signal Remote Ambient Surface runtime event already exists with runtimeEventId ${runtimeEvent.id} and queuedProjectionId ${queuedProjectionId}.`,
            "Call ambient_messaging_gateway_status and verify the completed runtime event is present.",
            "Then call ambient_messaging_signal_relay_diagnostics with providerId signal-cli, profileId dogfood-reply-owner, conversationId signal-reply-dogfood-conversation, and the active bindingId.",
            `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${runtimeEvent.id} only. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient must resolve Signal internally and generate the exact runtime event relay text.`,
            `Then call ambient_messaging_remote_surface_reply_apply with runtimeEventId ${runtimeEvent.id} only. The permission requester will approve exactly one Signal runtime-event reply send through the delegated Signal adapter.`,
            "Then call ambient_messaging_gateway_status again to inspect the outbound delivery record and the runtime event relay status.",
            `Then call ambient_messaging_remote_surface_reply_preview one more time with runtimeEventId ${runtimeEvent.id} only. It should now be blocked as already relayed and show Repair steps; do not call apply again.`,
            "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_signal_unread_window_apply, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_real_polling_apply, shell, browser, Signal Desktop, provider CLI, Telegram tools, generic binding tools, install tools, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK and include the phrases Signal relay diagnostics, Remote Ambient Surface reply preview, Remote Ambient Surface reply apply, Delegated tool, runtime event relay preview, Ambient switched the active project to Signal relay project, Bridge approvedReplySend capability yes, Sends provider messages yes, Approval requested yes, Approval recorded yes, Sent yes, Provider message signal-dogfood-sent-message, Recent outbound deliveries, Relay status sent, Repair steps, Do not resend this runtime event, and chat-to-self ingestion separate.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK",
        });

        expect(transcript).toContain("ambient_messaging_gateway_status completed");
        expect(transcript).toContain("ambient_messaging_signal_relay_diagnostics completed");
        expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
        expect(transcript).toContain("ambient_messaging_remote_surface_reply_apply completed");
        expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_preview");
        expect(transcript).toContain("Delegated tool: ambient_messaging_signal_bridge_reply_apply");
        expect(transcript).toContain("Signal relay diagnostics");
        expect(transcript).toContain("Remote Ambient Surface reply preview");
        expect(transcript).toContain("Apply result:");
        expect(transcript).toContain("Runtime event:");
        expect(transcript).toContain("Ambient switched the active project to Signal relay project.");
        expect(transcript).toContain("Bridge approvedReplySend capability: yes");
        expect(transcript).toContain("Sends provider messages: yes");
        expect(transcript).toContain("Approval requested: yes");
        expect(transcript).toContain("Approval recorded: yes");
        expect(transcript).toContain("Sent: yes");
        expect(transcript).toContain("Provider message: signal-dogfood-sent-message");
        expect(transcript).toContain("Recent outbound deliveries");
        expect(transcript).toContain("Relay status: sent");
        expect(transcript).toContain("Repair steps:");
        expect(transcript).toContain("Do not resend this runtime event");
        expect(transcript).toContain("Signal chat-to-self ingestion is separate");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REPLY_SEND_OK");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_real_polling_apply completed");
        expect(transcript).not.toContain("switch project Signal relay project private text must not leak");
        expect(unreadRequestCount).toBe(1);
        expect(sendRequestCount).toBe(1);
        expect(sentBody).toEqual({
          text: "Ambient switched the active project to Signal relay project.",
          replyToMessageId: "signal-reply-command-message",
        });
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );

  itLive(
    "explains the blocked real Signal unread skeleton without using fake apply",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread skeleton dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Signal real unread skeleton dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during blocked real Signal unread skeleton dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient messaging real Signal unread skeleton dogfood test.",
          "Call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
          "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, profileId dogfood-owner, conversationId signal-dogfood-conversation, bindingId signal-binding-missing, and limit 5.",
          "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK and include the phrases Signal real unread-window preview: blocked, Signal real unread-window apply: blocked, Approval requested no, Contacts bridge unread endpoint no, Reads provider unread messages no, exact active bindingId, no fake unread apply, and no Signal messages read.",
        ],
        expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK",
      });

      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
      expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
      expect(transcript).toContain("Signal real unread-window preview: blocked");
      expect(transcript).toContain("Signal real unread-window apply: blocked");
      expect(transcript).toContain("Approval requested: no");
      expect(transcript).toContain("Contacts bridge unread endpoint: no");
      expect(transcript).toContain("Reads provider unread messages: no");
      expect(transcript).toContain("exact active bindingId");
      expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_BLOCKED_OK");
      expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
    },
    120_000,
  );

  itLive(
    "applies a real Signal unread single-read through the reviewed boundary",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real unread apply dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-real");
      await mkdir(signalConfigDir, { recursive: true });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      const previousSignalUnreadFakeApply = process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;
      let unreadWindowRequestCount = 0;
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: false,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-real-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-real-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-real-owner/conversations/signal-real-dogfood-conversation/unread?limit=5") {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-real-owner",
              conversationId: "signal-real-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-real-seed-message",
                  senderId: "signal-real-owner",
                  text: "seed private text must not leak",
                  receivedAt: "2026-05-10T00:00:00.000Z",
                  outgoing: false,
                },
                {
                  messageId: `signal-real-command-message-${unreadWindowRequestCount}`,
                  senderId: "signal-real-owner",
                  senderLabel: "Signal Owner",
                  text: "show projects real private command must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          );
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
      delete process.env.AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY;

      try {
        const thread = store.createThread("Signal real unread apply dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async () => ({ allowed: true, mode: "allow_once" }),
            denyThread: () => undefined,
          },
        );

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging real Signal unread apply dogfood test.",
            `Call ambient_messaging_signal_session_apply with providerId signal-cli, profileId dogfood-real-owner, signalCliConfigDir ${signalConfigDir}, accountIdentifierPresent true, linkedDevicePresent true, and registrationMetadataPresent true.`,
            "Then call ambient_messaging_signal_remote_surface_preview with providerId signal-cli, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, ownerUserId signal-real-owner, ownerHandoffSourceMessageId signal-real-seed-message, initialSeenMessageIds [signal-real-seed-message], ambientSurface projects, maxDisclosureLabel owner-private-runtime-summary, and limit 5.",
            "Then call ambient_messaging_signal_remote_surface_apply with the same Signal remote surface arguments. The permission requester will approve this metadata-only binding write.",
            "Then call ambient_messaging_list_bindings with providerId signal-cli and includeInactive true to get the active Signal binding id.",
            "Then call ambient_messaging_signal_real_unread_window_preview with providerId signal-cli, that active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5.",
            "Then call ambient_messaging_signal_real_unread_window_apply with providerId signal-cli, the same active bindingId, profileId dogfood-real-owner, conversationId signal-real-dogfood-conversation, and limit 5. The permission requester will approve this real bounded single-read.",
            "Do not call ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, polling, reply, install, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK and include the phrases Signal real unread-window preview: ready, Signal real unread-window apply: applied, Approval requested yes, Contacts bridge unread endpoint yes, Reads provider unread messages yes, Accepted dispatches 1, Real Signal unread ingestion enabled yes, no fake unread apply, and no Signal message bodies returned.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_session_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_remote_surface_apply completed");
        expect(transcript).toContain("ambient_messaging_signal_real_unread_window_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).toContain("Signal real unread-window preview: ready");
        expect(transcript).toContain("Signal real unread-window apply: applied");
        expect(transcript).toContain("Approval requested: yes");
        expect(transcript).toContain("Contacts bridge unread endpoint: yes");
        expect(transcript).toContain("Reads provider unread messages: yes");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("Real unread ingestion enabled: yes");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_UNREAD_APPLY_OK");
        expect(transcript).toContain("no Signal message bodies returned");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("seed private text must not leak");
        expect(transcript).not.toContain("show projects real private command must not leak");
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        restoreProcessEnv("AMBIENT_SIGNAL_UNREAD_WINDOW_FAKE_BRIDGE_APPLY", previousSignalUnreadFakeApply);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );

  itLive(
    "starts and stops approved Signal real polling without leaking provider text",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Signal real polling dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const signalConfigDir = join(workspacePath, "signal-cli-config-real-polling");
      await mkdir(signalConfigDir, { recursive: true });
      await mkdir(join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner"), { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "signal", "dogfood-polling-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-polling-owner",
          signalCliConfigDir: signalConfigDir,
          accountIdentifierPresent: true,
          linkedDevicePresent: true,
          registrationMetadataPresent: true,
          bridgeSessionReadable: true,
        }),
      );
      const bindingStore = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      });
      const createdBinding = bindingStore.create({
        providerId: "signal-cli",
        authProfileId: "dogfood-polling-owner",
        conversationId: "signal-polling-dogfood-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "signal-polling-owner",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
        metadata: {
          setupTool: "ambient_messaging_signal_remote_surface_apply",
          setupShape: "signal-owner-remote-ambient-surface",
          ownerHandoffSourceMessageId: "signal-polling-seed-message",
          initialSeenMessageIds: ["signal-polling-seed-message"],
        },
      });
      const previousSignalBridgeUrl = process.env.AMBIENT_SIGNAL_BRIDGE_URL;
      let unreadWindowRequestCount = 0;
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url === "/") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: false,
              },
            }),
          );
          return;
        }
        if (request.url === "/profiles/dogfood-polling-owner/status") {
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-polling-owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          );
          return;
        }
        if (request.url?.startsWith("/profiles/dogfood-polling-owner/conversations/signal-polling-dogfood-conversation/unread")) {
          unreadWindowRequestCount += 1;
          response.end(
            JSON.stringify({
              ok: true,
              providerId: "signal-cli",
              profileId: "dogfood-polling-owner",
              conversationId: "signal-polling-dogfood-conversation",
              messages: [
                {
                  messageId: "signal-polling-command-1",
                  senderId: "signal-polling-owner",
                  senderLabel: "Signal Polling Owner",
                  text: "polling private command text must not leak",
                  receivedAt: "2026-05-10T00:00:02.000Z",
                  outgoing: false,
                },
              ],
            }),
          );
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected local fake Signal bridge address.");
      process.env.AMBIENT_SIGNAL_BRIDGE_URL = `http://127.0.0.1:${address.port}`;

      try {
        const thread = store.createThread("Signal real polling approved dogfood");
        runtime = new AgentRuntime(
          store,
          new BrowserService(() => store.getWorkspace()),
          new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
          () => undefined,
          {
            request: async (request) => {
              if (request.title === "Start Signal real polling?") {
                return { allowed: true, mode: "allow_once" };
              }
              throw new Error(`Unexpected permission prompt during Signal real polling dogfood: ${request.title}`);
            },
            denyThread: () => undefined,
          },
        );

        const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient messaging approved Signal real polling dogfood test.",
            `An active Signal Remote Ambient Surface binding already exists with bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, and ownerUserId signal-polling-owner.`,
            "Then call ambient_messaging_signal_real_polling_status with providerId signal-cli, limit 5, and intervalMs 300000.",
            `Then call ambient_messaging_signal_real_polling_preview with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000.`,
            `Then call ambient_messaging_signal_real_polling_apply with action start, providerId signal-cli, bindingId ${createdBinding.binding.id}, profileId dogfood-polling-owner, conversationId signal-polling-dogfood-conversation, limit 5, and intervalMs 300000. The permission requester will approve Signal polling.`,
            "Then call ambient_messaging_signal_real_polling_status again and verify State running, Running yes, Timers active yes, and Accepted dispatches 1.",
            "Then call ambient_messaging_signal_real_polling_preview with action stop, providerId signal-cli, limit 5, and intervalMs 300000.",
            "Then call ambient_messaging_signal_real_polling_apply with action stop, providerId signal-cli, limit 5, and intervalMs 300000. Stop should not read messages or ask for approval.",
            "Then call ambient_messaging_signal_real_polling_status once more and verify State stopped, Running no, and Timers active no.",
            "Do not call ambient_messaging_signal_session_apply, ambient_messaging_signal_remote_surface_preview, ambient_messaging_signal_remote_surface_apply, ambient_messaging_list_bindings, ambient_messaging_signal_real_unread_window_apply, ambient_messaging_signal_unread_window_apply, shell, browser, Signal Desktop, provider CLI, generic binding, reply, install, or external messaging tools.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK and include the phrases Signal real polling runner status, Signal real polling start preview, Signal real polling start apply, Apply status applied, Immediate poll, Accepted dispatches 1, State running, Signal real polling stop preview, Signal real polling stop apply, State stopped, no Signal message bodies returned, and no Signal messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK",
        });

        expect(transcript).toContain("ambient_messaging_signal_real_polling_status completed");
        expect(transcript).toContain("ambient_messaging_signal_real_polling_preview completed");
        expect(transcript).toContain("ambient_messaging_signal_real_polling_apply completed");
        expect(transcript).toContain("Signal real polling runner status");
        expect(transcript).toContain("Signal real polling start preview");
        expect(transcript).toContain("Signal real polling start apply");
        expect(transcript).toContain("Apply status: applied");
        expect(transcript).toContain("Immediate poll");
        expect(transcript).toContain("Accepted dispatches: 1");
        expect(transcript).toContain("State: running");
        expect(transcript).toContain("Signal real polling stop preview");
        expect(transcript).toContain("Signal real polling stop apply");
        expect(transcript).toContain("State: stopped");
        expect(transcript).toContain("MESSAGING_GATEWAY_SIGNAL_REAL_POLLING_RUNNER_OK");
        expect(transcript).not.toContain("ambient_messaging_signal_real_unread_window_apply completed");
        expect(transcript).not.toContain("ambient_messaging_signal_unread_window_apply completed");
        expect(transcript).not.toContain("polling private command text must not leak");
        expect(unreadWindowRequestCount).toBe(1);
      } finally {
        restoreProcessEnv("AMBIENT_SIGNAL_BRIDGE_URL", previousSignalBridgeUrl);
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    },
    180_000,
  );

  itLive(
    "routes Telegram chat discovery through the typed conversation-directory preview boundary",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory boundary dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );

      const thread = store.createThread("Telegram directory boundary dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Telegram directory boundary dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient Telegram conversation-directory boundary dogfood test.",
            "Call ambient_messaging_list_providers.",
            "Then call ambient_messaging_conversation_directory_preview with providerId telegram-tdlib, authProfileId dogfood-owner, purpose remote_ambient_surface, and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Do not call ambient_messaging_telegram_conversation_directory_apply, lifecycle, shell, browser, Telegram Desktop UI, provider CLI, bridge polling, bridge reply, binding apply, install, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK and include the phrases Telegram provider directory preview, Provider directory tool ambient_messaging_telegram_conversation_directory_preview, real mode blocker, no Telegram messages read, no Telegram messages sent, and no shell/browser fallback.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_BOUNDARY_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_list_providers completed");
      expect(transcript).toContain("ambient_messaging_conversation_directory_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_preview completed");
      expect(transcript).toContain("Provider directory tool: ambient_messaging_telegram_conversation_directory_preview");
      expect(transcript).toContain("Telegram provider is not running in real mode");
      expect(transcript).toContain("Reads provider messages: no");
      expect(transcript).toContain("Sends provider messages: no");
      expect(transcript).not.toContain("ambient_messaging_telegram_conversation_directory_apply completed");
    },
    240_000,
  );

  itLive(
    "dogfoods Telegram directory result through binding and owner-route previews",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram directory-to-binding dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin !== "http://127.0.0.1:19092") {
          return originalFetch(input as RequestInfo | URL, init);
        }
        if ((init?.method ?? "GET") === "GET" && url.pathname === "/") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
          } as Response;
        }
        if ((init?.method ?? "GET") === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              chats: [
                {
                  id: "telegram-dogfood-chat",
                  title: "Dogfood Owner Chat",
                  type: "private",
                  unreadCount: 0,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({ error: "not found" }),
        } as Response;
      }) as typeof fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19092";

      const thread = store.createThread("Telegram directory to binding dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
              request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
              request.toolName === "ambient_messaging_telegram_remote_surface_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Telegram directory-to-binding dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Ambient Telegram directory-to-binding dogfood test.",
            "Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, messageId dogfood-message-1.",
            "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId dogfood-owner, conversationId telegram-dogfood-chat, messageId dogfood-message-1, senderId owner-1, senderLabel Owner, and text status.",
            "Then call ambient_messaging_telegram_relay_diagnostics with profileId dogfood-owner and conversationId telegram-dogfood-chat.",
            "Then call ambient_messaging_telegram_bridge_reply_preview using the queuedProjectionId from the route result and text exactly Ambient received your status request.",
            "Finally call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the create apply result, and reason dogfood cleanup.",
            "Do not call ambient_messaging_telegram_bridge_reply_apply, polling, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK and include the phrases metadata-only directory row, Remote Ambient Surface binding applied, owner route accepted, relay diagnostics ready, reply preview ready, binding revoked, no Telegram messages read, no Telegram messages sent.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_DIRECTORY_TO_BINDING_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_gateway_lifecycle_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_conversation_directory_apply completed");
      expect(transcript).toContain("Failure mode: none");
      expect(transcript).toContain("telegram-dogfood-chat: Dogfood Owner Chat");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_telegram_relay_diagnostics completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_preview completed");
      expect(transcript).toContain("Bridge mode: real Telegram bridge running");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_reply_apply completed");
    },
    420_000,
  );

  itTelegramOwnerLoopLive(
    "dogfoods Telegram owner handoff through real-mode poll and reply tools",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram owner-loop dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      const originalFetch = globalThis.fetch;
      const tdlibStateDir = join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      const setupCode = "AMBIENT-HANDOFF-DOGFOOD-123456";
      const sentMessages: unknown[] = [];
      let unreadCallCount = 0;
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(workspacePath, ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify({
          profileId: "dogfood-owner",
          phoneNumber: "+15550000000",
          tdlibStateDir,
          databaseEncryptionKey: "dogfood-key",
        }),
        "utf8",
      );
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl);
        if (url.origin !== "http://127.0.0.1:19093") {
          return originalFetch(input as RequestInfo | URL, init);
        }
        const method = init?.method ?? "GET";
        if (method === "GET" && url.pathname === "/") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              stateRoot: join(workspacePath, ".ambient-agent-state", "telegram"),
              sessionCount: 1,
            }),
          } as Response;
        }
        if (method === "GET" && url.pathname === "/sessions/dogfood-owner/chats") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              chats: [
                {
                  id: "telegram-dogfood-chat",
                  title: "Dogfood Owner Chat",
                  type: "private",
                  unreadCount: 2,
                  folderIds: [1],
                  updatedAt: "2026-05-10T00:00:00.000Z",
                },
              ],
            }),
          } as Response;
        }
        if (method === "GET" && url.pathname === "/sessions/dogfood-owner/inbox/unread") {
          unreadCallCount += 1;
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              messages:
                unreadCallCount === 1
                  ? [
                      {
                        id: "dogfood-noise",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: "private setup noise must not leak",
                        date: "2026-05-10T00:00:01.000Z",
                      },
                      {
                        id: "dogfood-handoff",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:02.000Z",
                      },
                    ]
                  : [
                      {
                        id: "dogfood-handoff",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: setupCode,
                        date: "2026-05-10T00:00:02.000Z",
                      },
                      {
                        id: "dogfood-status",
                        chatId: "telegram-dogfood-chat",
                        outgoing: false,
                        text: "status",
                        date: "2026-05-10T00:00:03.000Z",
                      },
                    ],
            }),
          } as Response;
        }
        if (
          method === "GET" &&
          (url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-handoff/sender-profile" ||
            url.pathname === "/sessions/dogfood-owner/chats/telegram-dogfood-chat/messages/dogfood-status/sender-profile")
        ) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              sender: {
                kind: "user",
                user: {
                  userId: "owner-1",
                  displayName: "Owner",
                },
              },
            }),
          } as Response;
        }
        if (method === "POST" && url.pathname === "/sessions/dogfood-owner/messages/send") {
          sentMessages.push(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body);
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              messageId: "dogfood-reply-1",
              date: "2026-05-10T00:00:04.000Z",
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({ error: "not found" }),
        } as Response;
      }) as typeof fetch;
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:19093";

      const thread = store.createThread("Telegram owner loop dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              request.toolName === "ambient_messaging_gateway_lifecycle_apply" ||
              request.toolName === "ambient_messaging_telegram_conversation_directory_apply" ||
              request.toolName === "ambient_messaging_telegram_owner_handoff_apply" ||
              request.toolName === "ambient_messaging_telegram_remote_surface_apply" ||
              request.toolName === "ambient_messaging_telegram_bridge_poll_apply" ||
              request.toolName === "ambient_messaging_remote_surface_command_apply" ||
              request.toolName === "ambient_messaging_telegram_bridge_reply_apply"
            ) {
              return { allowed: true, mode: "allow_once" };
            }
            throw new Error(`Unexpected permission prompt during Telegram owner-loop dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript = "";
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 1 of a focused Ambient Telegram owner-loop dogfood test.",
            `Use exact profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode ${setupCode}, and ownerUserId owner-1 once handoff returns it.`,
            "Call ambient_messaging_gateway_lifecycle_apply with action start, providerId telegram-tdlib, and mode real.",
            "Then call ambient_messaging_telegram_conversation_directory_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_conversation_directory_apply with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_owner_handoff_preview with profileId dogfood-owner, conversationId telegram-dogfood-chat, setupCode from above, and limit 5.",
            "Then call ambient_messaging_telegram_owner_handoff_apply with those same handoff arguments.",
            "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId telegram-dogfood-chat, ownerUserId owner-1, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create arguments and ownerHandoffSourceMessageId set to the sourceMessageId from the handoff apply result.",
            "Do not poll, send replies, call bridge_event_route, call synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK and include the phrases owner handoff matched, metadata-only directory row, Remote Ambient Surface binding applied, no Telegram Desktop fallback.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_SETUP_OK",
        });
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 2 of the same Telegram owner-loop dogfood test.",
            "Use the existing active dogfood-owner Remote Ambient Surface binding from step 1.",
            "Then call ambient_messaging_telegram_bridge_poll_preview with profileId dogfood-owner and limit 5.",
            "Then call ambient_messaging_telegram_bridge_poll_apply with profileId dogfood-owner and limit 5.",
            "Read the queued projection id from the poll apply result or gateway status.",
            "Then call ambient_messaging_remote_surface_command_preview with that queuedProjectionId.",
            "Then call ambient_messaging_remote_surface_command_apply with that same queuedProjectionId.",
            "Then call ambient_messaging_telegram_bridge_reply_preview with that same queuedProjectionId and text exactly Ambient status ready from owner loop dogfood.",
            "Then call ambient_messaging_telegram_bridge_reply_apply with that same queuedProjectionId and exact text.",
            "Do not call ambient_messaging_telegram_bridge_event_route, ambient_messaging_synthetic_route, lifecycle, directory, handoff, binding create, binding revoke, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK and include the phrases real-mode poll accepted, queued projection id visible, Remote Ambient Surface command apply, Telegram reply sent, no synthetic route.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_POLL_REPLY_OK",
        });
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is step 3 of the same Telegram owner-loop dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the step 1 create apply result, and reason dogfood cleanup.",
            "Do not call polling, reply, bridge_event_route, synthetic_route, shell, browser, Telegram Desktop UI, provider CLI, install, or any external send-message tool.",
            "After checking the tool result, answer with exactly MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK and include the phrase binding revoked.",
          ],
          expected: "MESSAGING_GATEWAY_TELEGRAM_OWNER_LOOP_CLEANUP_OK",
        });
      } finally {
        globalThis.fetch = originalFetch;
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_telegram_owner_handoff_apply completed");
      expect(transcript).toContain("Use ownerUserId owner-1");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_poll_apply completed");
      expect(transcript).toContain("Queued projection:");
      expect(transcript).toContain("Duplicate messages: 1");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_apply completed");
      expect(transcript).toContain("Delivery status: sent");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).not.toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).not.toContain("ambient_messaging_synthetic_route completed");
      expect(transcript).not.toContain("private setup noise must not leak");
      expect(sentMessages).toEqual([
        {
          chatId: "telegram-dogfood-chat",
          text: "Ambient status ready from owner loop dogfood",
          replyToMessageId: "dogfood-status",
        },
      ]);
    },
    420_000,
  );
});
