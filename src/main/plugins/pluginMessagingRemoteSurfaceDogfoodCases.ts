/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import type { ProjectSummary } from "../../shared/projectBoardTypes";
import { createDefaultMessagingProviderRegistry, createMessagingBindingStore } from "./pluginsMessagingDogfoodFacade";
import { restoreProcessEnv, sendDogfoodTurn } from "./pluginDogfoodTestSupport";

interface PluginMessagingRemoteSurfaceDogfoodDeps {
  AgentRuntime: new (...args: any[]) => any;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  ProjectStore: new (...args: any[]) => any;
  getStore: () => any;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: any) => void;
}

export function registerPluginMessagingRemoteSurfaceDogfoodCases(deps: PluginMessagingRemoteSurfaceDogfoodDeps): void {
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
    "lists messaging gateway providers, bindings, inventory, and runtime surfaces during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live messaging gateway dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Messaging gateway dogfood");
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "dogfood-owner",
            phoneNumber: "+15550000000",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );
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
            throw new Error(`Unexpected permission prompt during messaging gateway dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      let transcript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is an Ambient Desktop messaging gateway dogfood test.",
            "Call ambient_messaging_list_providers.",
            "Then call ambient_messaging_list_bindings.",
            "Then call ambient_messaging_headless_ux_inventory.",
            "Then call ambient_runtime_surface_snapshot with limit 5.",
            "Then call ambient_messaging_telegram_session_preview with action start_auth, providerId telegram-tdlib, profileId dogfood-owner, and phoneNumber +15550000000. Do not call ambient_messaging_telegram_session_apply.",
            "Then call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId dogfood-owner, conversationId dogfood-conversation, ownerUserId owner-dogfood, ambientSurface workflow_agents, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields.",
            "Then call ambient_messaging_list_bindings with providerId telegram-tdlib and purpose remote_ambient_surface.",
            "Then call ambient_messaging_gateway_status.",
            "Then call ambient_messaging_telegram_remote_surface_apply with action revoke, the bindingId from the create result, and reason dogfood cleanup.",
            "Then call ambient_messaging_list_bindings with providerId telegram-tdlib, purpose remote_ambient_surface, and includeInactive true.",
            "Do not call shell, browser, bridge event route, remote surface command preview/apply, provider bridge lifecycle, bridge poll, synthetic route, generic binding apply, install, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_DOGFOOD_OK and include the provider id telegram-tdlib, the phrase session bootstrap, the phrase typed remote surface binding, the phrase runtime surface inventory, and the phrase gateway status.",
          ],
          expected: "MESSAGING_GATEWAY_DOGFOOD_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(transcript).toContain("ambient_messaging_list_providers completed");
      expect(transcript).toContain("ambient_messaging_list_bindings completed");
      expect(transcript).toContain("ambient_messaging_headless_ux_inventory completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("ambient_messaging_telegram_session_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("telegram-tdlib");
      expect(transcript).toContain("session bootstrap");
      expect(transcript).toContain("typed remote surface binding");
      expect(transcript).toContain("runtime surface inventory");
      expect(transcript).toContain("gateway status");
    },
    840_000,
  );

  itLive(
    "defers Remote Ambient Surface project switches during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live project-switch dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Remote project switch dogfood");
      const previousTelegramEnv = {
        apiId: process.env.AMBIENT_AGENT_TELEGRAM_API_ID,
        apiHash: process.env.AMBIENT_AGENT_TELEGRAM_API_HASH,
        bridgeUrl: process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL,
      };
      process.env.AMBIENT_AGENT_TELEGRAM_API_ID = process.env.AMBIENT_AGENT_TELEGRAM_API_ID || "12345";
      process.env.AMBIENT_AGENT_TELEGRAM_API_HASH = process.env.AMBIENT_AGENT_TELEGRAM_API_HASH || "dogfood-api-hash";
      process.env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL = "http://127.0.0.1:1";
      const tdlibStateDir = join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "project-switch-dogfood-owner", "tdlib");
      await mkdir(tdlibStateDir, { recursive: true });
      await writeFile(
        join(deps.getWorkspacePath(), ".ambient-agent-state", "telegram", "project-switch-dogfood-owner", "bridge-session.json"),
        JSON.stringify(
          {
            profileId: "project-switch-dogfood-owner",
            phoneNumber: "+15550000000",
            tdlibStateDir,
            databaseEncryptionKey: "redacted-project-switch-dogfood-key",
          },
          null,
          2,
        ),
        "utf8",
      );

      const createdProjectSummaries: ProjectSummary[] = [];
      let scheduledProjectSwitchPath: string | undefined;
      const activeProjectSummary = (): ProjectSummary => {
        const workspace = store.getWorkspace();
        const threads = store.listThreads() as Array<{ createdAt?: string; updatedAt?: string }>;
        const timestamps = threads
          .flatMap((item: { createdAt?: string; updatedAt?: string }) => [item.createdAt, item.updatedAt])
          .filter((item): item is string => typeof item === "string" && item.length > 0);
        const fallbackTime = new Date(0).toISOString();
        return {
          id: workspace.path,
          path: workspace.path,
          name: workspace.name,
          statePath: workspace.statePath,
          sessionPath: workspace.sessionPath,
          createdAt: timestamps.length
            ? timestamps.reduce((earliest: string, item: string) => (item < earliest ? item : earliest))
            : fallbackTime,
          updatedAt: timestamps.length
            ? timestamps.reduce((latest: string, item: string) => (item > latest ? item : latest))
            : fallbackTime,
          threads: threads as ProjectSummary["threads"],
        };
      };
      const createDogfoodProject = (input: { name?: string; workspacePath?: string; reason: string }): ProjectSummary => {
        const name = input.name?.trim() || "Focused switch project";
        const projectPath = input.workspacePath?.trim() || join(deps.getWorkspacePath(), ".dogfood-projects", name.replace(/[/:\\]/g, "-"));
        const projectStore = new deps.ProjectStore();
        try {
          const workspace = projectStore.openWorkspace(projectPath);
          const threads = projectStore.listThreads() as Array<{ createdAt?: string; updatedAt?: string }>;
          const timestamps = threads
            .flatMap((item: { createdAt?: string; updatedAt?: string }) => [item.createdAt, item.updatedAt])
            .filter((item): item is string => typeof item === "string" && item.length > 0);
          const fallbackTime = new Date(0).toISOString();
          const summary: ProjectSummary = {
            id: workspace.path,
            path: workspace.path,
            name,
            statePath: workspace.statePath,
            sessionPath: workspace.sessionPath,
            createdAt: timestamps.length
              ? timestamps.reduce((earliest: string, item: string) => (item < earliest ? item : earliest))
              : fallbackTime,
            updatedAt: timestamps.length
              ? timestamps.reduce((latest: string, item: string) => (item > latest ? item : latest))
              : fallbackTime,
            threads: threads as ProjectSummary["threads"],
          };
          createdProjectSummaries.unshift(summary);
          return summary;
        } finally {
          projectStore.close();
        }
      };

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
            throw new Error(`Unexpected permission prompt during project-switch dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
        {
          projects: {
            listProjects: () => [activeProjectSummary(), ...createdProjectSummaries],
            createProject: (input: any) => createDogfoodProject(input),
            switchProject: (input: any) => {
              scheduledProjectSwitchPath = input.workspacePath;
            },
          },
        },
      );

      let transcript!: string;
      let postSwitchTranscript!: string;
      try {
        transcript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is a focused Remote Ambient Surface deferred project-switch dogfood test.",
            "Call ambient_messaging_telegram_remote_surface_preview with action create, purpose remote_ambient_surface, profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, ownerUserId project-switch-owner, ambientSurface projects, and maxDisclosureLabel owner-private-runtime-summary.",
            "Then call ambient_messaging_telegram_remote_surface_apply with the same create fields.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, messageId project-switch-dogfood-message-1, senderId project-switch-owner, senderLabel Owner, and text create project Focused switch project.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the first bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that first queuedProjectionId. This should create an Ambient project after approval.",
            "Then call ambient_messaging_telegram_bridge_event_route with profileId project-switch-dogfood-owner, conversationId project-switch-dogfood-conversation, messageId project-switch-dogfood-message-2, senderId project-switch-owner, senderLabel Owner, and text switch project Focused switch project.",
            "Then call ambient_messaging_remote_surface_command_preview with the queuedProjectionId from the second bridge event handoff result.",
            "Then call ambient_messaging_remote_surface_command_apply with that second queuedProjectionId. This should schedule an active Ambient project switch because this tool is running inside an active Pi turn.",
            "Then call ambient_messaging_gateway_status and verify there is a pending Remote Ambient Surface active project switch event for Focused switch project.",
            "Do not call shell, browser, provider bridge lifecycle, bridge poll, synthetic route, generic binding apply, install, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROJECT_SWITCH_DEFERRED_OK and include the phrases create project Focused switch project, switch project Focused switch project, Remote Ambient Surface command apply, Scheduled active project switch, pending project switch event, and gateway status.",
          ],
          expected: "MESSAGING_GATEWAY_PROJECT_SWITCH_DEFERRED_OK",
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        postSwitchTranscript = await sendDogfoodTurn(runtime, store, thread.id, {
          content: [
            "This is the post-turn check for the focused Remote Ambient Surface project-switch dogfood test.",
            "Call ambient_messaging_gateway_status and verify the recent Remote Ambient Surface runtime events include a completed active project switch event for Focused switch project.",
            "Then call ambient_messaging_remote_surface_reply_preview with only the completed active project switch runtimeEventId from gateway status. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient should generate the exact provider-neutral runtime event relay text.",
            "Do not call ambient_messaging_remote_surface_reply_apply, provider bridge lifecycle, bridge poll, bridge event route, shell, browser, generic binding apply, install, or any send-message tool.",
            "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROJECT_SWITCH_COMPLETED_OK and include the phrases completed project switch event, runtime event relay preview, and Ambient switched the active project to Focused switch project.",
          ],
          expected: "MESSAGING_GATEWAY_PROJECT_SWITCH_COMPLETED_OK",
        });
      } finally {
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_ID", previousTelegramEnv.apiId);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_API_HASH", previousTelegramEnv.apiHash);
        restoreProcessEnv("AMBIENT_AGENT_TELEGRAM_BRIDGE_URL", previousTelegramEnv.bridgeUrl);
      }

      expect(scheduledProjectSwitchPath).toContain("Focused switch project");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_preview completed");
      expect(transcript).toContain("ambient_messaging_telegram_remote_surface_apply completed");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_event_route completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply completed");
      expect(transcript).toContain("Scheduled active project switch");
      expect(transcript).toContain("pending project switch event");
      expect(transcript).toContain("gateway status");
      expect(postSwitchTranscript).toContain("ambient_messaging_gateway_status completed");
      expect(postSwitchTranscript).toContain("ambient_messaging_remote_surface_reply_preview completed");
      expect(postSwitchTranscript).toContain("completed project switch event");
      expect(postSwitchTranscript).toContain("runtime event relay preview");
      expect(postSwitchTranscript).toContain("Ambient switched the active project to Focused switch project");
    },
    480_000,
  );

  itLive(
    "surfaces Telegram relay repair steps during a focused live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Telegram relay repair dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Telegram relay repair dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Telegram relay repair dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Telegram relay repair dogfood test.",
          "Call exactly ambient_messaging_telegram_bridge_reply_preview with runtimeEventId remote-surface-missing-dogfood.",
          "The result should be blocked and should include Repair steps telling you to use an exact current runtimeEventId from ambient_messaging_gateway_status.",
          "Do not call ambient_messaging_telegram_bridge_reply_apply, lifecycle tools, shell, browser, install, or send-message tools.",
          "After checking the tool result, answer with exactly TELEGRAM_RELAY_REPAIR_STEPS_OK and include the phrases repair steps and current runtimeEventId.",
        ],
        expected: "TELEGRAM_RELAY_REPAIR_STEPS_OK",
      });

      expect(transcript).toContain("ambient_messaging_telegram_bridge_reply_preview completed");
      expect(transcript).toMatch(/Repair steps|repair steps/);
      expect(transcript).toContain("current runtimeEventId");
    },
    240_000,
  );

  itLive(
    "surfaces provider-neutral relay status for completed Telegram runtime events during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live provider-neutral relay status dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Telegram provider-neutral relay status dogfood");
      const binding = createMessagingBindingStore({
        stateRoot: store.getWorkspace().statePath,
        providers: createDefaultMessagingProviderRegistry(),
      }).create({
        providerId: "telegram-tdlib",
        authProfileId: "dogfood-relay-owner",
        conversationId: "telegram-relay-status-dogfood-conversation",
        purpose: "remote_ambient_surface",
        ownerUserId: "telegram-relay-status-owner",
        ambientSurface: "projects",
        maxDisclosureLabel: "owner-private-runtime-summary",
      }).binding;
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during provider-neutral relay status dogfood: ${request.title}`);
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
      const route = registeredTools.find((tool) => tool.name === "ambient_messaging_telegram_bridge_event_route");
      if (!route) throw new Error("Missing Telegram bridge event route tool in relay status dogfood setup.");
      const routed = await route.execute("telegram-relay-status-route", {
        profileId: "dogfood-relay-owner",
        conversationId: "telegram-relay-status-dogfood-conversation",
        messageId: "telegram-relay-status-command-message",
        senderId: "telegram-relay-status-owner",
        senderLabel: "Telegram Owner",
        text: "switch project Relay status project",
      });
      const queuedProjectionId = routed.details.queuedProjection.id;
      const runtimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Relay status project",
        summary: "Active Ambient project switched to Relay status project.",
        threadId: thread.id,
        queuedProjectionId,
        sourceEventId: "telegram-dogfood-relay-status-source-event",
        bindingId: binding.id,
        projectName: "Relay status project",
        completedAt: "2026-05-10T00:00:04.000Z",
        relaySuggested: true,
      });
      const unsupportedRuntimeEvent = (runtime as any).recordRemoteSurfaceRuntimeEvent({
        kind: "active_project_switch",
        status: "completed",
        title: "Switch to Unsupported provider project",
        summary: "Active Ambient project switched to Unsupported provider project.",
        threadId: thread.id,
        queuedProjectionId: "projection-dogfood-unsupported-provider",
        sourceEventId: "telegram-dogfood-relay-owner-telegram-relay-status-dogfood-conversation-unsupported-provider-message",
        bindingId: binding.id,
        projectName: "Unsupported provider project",
        completedAt: "2026-05-10T00:00:05.000Z",
        relayProviderId: "matrix-bridge",
        relaySuggested: true,
      });

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused provider-neutral Remote Ambient Surface relay status dogfood test.",
          `An active Telegram Remote Ambient Surface binding already exists with bindingId ${binding.id}, profileId dogfood-relay-owner, conversationId telegram-relay-status-dogfood-conversation, and ownerUserId telegram-relay-status-owner.`,
          `A completed Telegram Remote Ambient Surface runtime event already exists with runtimeEventId ${runtimeEvent.id} and queuedProjectionId ${queuedProjectionId}.`,
          `A completed unsupported-provider Remote Ambient Surface runtime event also exists with runtimeEventId ${unsupportedRuntimeEvent.id}, relayProviderId matrix-bridge, and no reviewed reply adapter.`,
          "Call ambient_messaging_gateway_status and verify the Telegram runtime event includes Relay action status: preview-ready, Duplicate blocked: no, target provider Telegram, Provider-neutral relay preview command, Provider-neutral relay apply command, and Provider repair diagnostics command. Also verify the unsupported-provider runtime event is repair-needed and names ambient_messaging_remote_surface_reply_preview as the preview command but no apply command.",
          "Then call ambient_runtime_surface_snapshot with limit 5 and verify Relay summaries include the same provider-neutral relay next action.",
          `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${runtimeEvent.id} only. Do not provide providerId, queuedProjectionId, replyToMessageId, or text; Ambient must resolve Telegram internally and generate the exact runtime event relay text.`,
          `Then call ambient_messaging_remote_surface_reply_preview with runtimeEventId ${unsupportedRuntimeEvent.id} only. It must be blocked, mention provider matrix-bridge is unsupported, and surface Repair steps.`,
          "Do not call ambient_messaging_telegram_bridge_reply_apply, lifecycle tools, polling tools, shell, browser, provider CLI, generic binding tools, install tools, or external messaging tools.",
          "After checking the tool results, answer with exactly MESSAGING_GATEWAY_PROVIDER_NEUTRAL_RELAY_STATUS_OK and include the phrases provider-neutral relay summary, preview-ready, repair-needed, matrix-bridge, Duplicate blocked: no, Provider-neutral relay preview command, Provider-neutral relay apply command, Provider repair diagnostics command, Relay summaries, runtime event relay preview, unsupported provider repair, and Repair steps.",
        ],
        expected: "MESSAGING_GATEWAY_PROVIDER_NEUTRAL_RELAY_STATUS_OK",
      });

      expect(transcript).toContain("ambient_messaging_gateway_status completed");
      expect(transcript).toContain("ambient_runtime_surface_snapshot completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_reply_preview completed");
      expect(transcript).toContain("Delegated tool: ambient_messaging_telegram_bridge_reply_preview");
      expect(transcript).toContain("Relay action status: preview-ready");
      expect(transcript).toContain("Duplicate blocked: no");
      expect(transcript).toContain("Provider-neutral relay preview command:");
      expect(transcript).toContain("Provider-neutral relay apply command:");
      expect(transcript).toContain("Provider repair diagnostics command:");
      expect(transcript).toContain("Relay summaries");
      expect(transcript).toContain("Ambient switched the active project to Relay status project.");
      expect(transcript).toContain("provider-neutral relay summary");
      expect(transcript).toContain("repair-needed");
      expect(transcript).toContain("matrix-bridge");
      expect(transcript).toContain("Provider matrix-bridge has no reviewed Remote Ambient Surface reply adapter");
      expect(transcript).toContain("Repair steps:");
      expect(transcript).toContain("unsupported provider repair");
    },
    240_000,
  );

  itLive(
    "uses actionable headless runtime UX inventory without renderer-only command guesses",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live headless runtime inventory dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Headless runtime command inventory dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during headless runtime inventory dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const transcript = await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "This is a focused Ambient headless runtime UX inventory dogfood test.",
          "Call ambient_messaging_headless_ux_inventory exactly once.",
          "Do not call shell, browser, lifecycle, bridge, polling, reply, binding apply, command preview/apply, install, or send-message tools.",
          "After checking the tool result, answer starting with HEADLESS_RUNTIME_COMMAND_INVENTORY_OK and include the phrases Remote Ambient Surface command lane, Settings catalog, voice.output ready, search.preference ready, model-mode.mode ready, model-mode.planner ready, workflow.exploration.run ready, workflow.compile.preview ready, workflow.review.approve ready, workflow.review.reject ready, workflow.run.cancel ready, workflow.recovery.retry ready, workflow.recovery.resume ready, workflow.recovery.skip ready, settings.thread.update, settings.planner.update, approval.respond ready, approval.grants.revoke ready, messaging.remote.activation.plan ready, messaging.remote.provider-support.plan ready, messaging.telegram.activation.plan ready, messaging.polling.status ready, messaging.polling.once ready, messaging.polling.start ready, messaging.polling.stop ready, speech.provider partial, speech.input ready, speech.language ready, settings.speech.update, media.generated ready, settings.media.update, ambient_messaging_remote_surface_command_preview, ambient_messaging_remote_surface_command_apply, ambient_messaging_remote_surface_activation_plan, ambient_messaging_remote_surface_provider_support_plan, ambient_messaging_telegram_owner_loop_activation_plan, ambient_messaging_telegram_bridge_polling_preview, ambient_messaging_telegram_bridge_polling_apply, ambient_messaging_telegram_bridge_polling_status, create project Field Notes, create workflow Track the Remote Ambient Surface gateway status, create chat Remote triage, set up remote control, set up Telegram remote control, plan Signal remote control support, activate Telegram owner loop, start Telegram owner polling, stop Telegram owner polling, check Telegram once for my command, run exploration, compile from exploration, approve workflow preview, reject workflow preview, cancel workflow, retry failed step, resume checkpoint, skip failed item, approve request 1, revoke grant 1, set voice mode off, set chat mode planner, set planner autoFinalize off, set speech language English, set generated media autoplay on, and ambient_messaging_gateway_status.",
        ],
        expected: "HEADLESS_RUNTIME_COMMAND_INVENTORY_OK",
      });

      expect(transcript).toContain("ambient_messaging_headless_ux_inventory completed");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_preview");
      expect(transcript).toContain("ambient_messaging_remote_surface_command_apply");
      expect(transcript).toContain("Settings catalog");
      expect(transcript).toContain("voice.output");
      expect(transcript).toContain("search.preference");
      expect(transcript).toContain("model-mode.mode");
      expect(transcript).toContain("model-mode.planner");
      expect(transcript).toContain("workflow.exploration.run");
      expect(transcript).toContain("workflow.compile.preview");
      expect(transcript).toContain("workflow.review.approve");
      expect(transcript).toContain("workflow.review.reject");
      expect(transcript).toContain("workflow.run.cancel");
      expect(transcript).toContain("workflow.recovery.retry");
      expect(transcript).toContain("workflow.recovery.resume");
      expect(transcript).toContain("workflow.recovery.skip");
      expect(transcript).toContain("messaging.remote.activation.plan");
      expect(transcript).toContain("messaging.remote.provider-support.plan");
      expect(transcript).toContain("messaging.telegram.activation.plan");
      expect(transcript).toContain("ambient_messaging_remote_surface_activation_plan");
      expect(transcript).toContain("ambient_messaging_remote_surface_provider_support_plan");
      expect(transcript).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
      expect(transcript).toContain("messaging.polling.status");
      expect(transcript).toContain("messaging.polling.once");
      expect(transcript).toContain("messaging.polling.start");
      expect(transcript).toContain("messaging.polling.stop");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_preview");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_apply");
      expect(transcript).toContain("ambient_messaging_telegram_bridge_polling_status");
      expect(transcript).toContain("settings.thread.update");
      expect(transcript).toContain("settings.planner.update");
      expect(transcript).toContain("approval.respond");
      expect(transcript).toContain("approval.grants.revoke");
      expect(transcript).toContain("speech.provider");
      expect(transcript).toContain("speech.input");
      expect(transcript).toContain("speech.language");
      expect(transcript).toContain("settings.speech.update");
      expect(transcript).toContain("media.generated");
      expect(transcript).toContain("settings.media.update");
      expect(transcript).toContain("create project Field Notes");
      expect(transcript).toContain("create workflow Track the Remote Ambient Surface gateway status");
      expect(transcript).toContain("create chat Remote triage");
      expect(transcript).toContain("set up remote control");
      expect(transcript).toContain("set up Telegram remote control");
      expect(transcript).toContain("activate Telegram owner loop");
      expect(transcript).toContain("start Telegram owner polling");
      expect(transcript).toContain("stop Telegram owner polling");
      expect(transcript).toContain("check Telegram once for my command");
      expect(transcript).toContain("run exploration");
      expect(transcript).toContain("compile from exploration");
      expect(transcript).toContain("approve workflow preview");
      expect(transcript).toContain("reject workflow preview");
      expect(transcript).toContain("cancel workflow");
      expect(transcript).toContain("retry failed step");
      expect(transcript).toContain("resume checkpoint");
      expect(transcript).toContain("skip failed item");
      expect(transcript).toContain("approve request 1");
      expect(transcript).toContain("revoke grant 1");
      expect(transcript).toContain("set voice mode off");
      expect(transcript).toContain("set chat mode planner");
      expect(transcript).toContain("set planner autoFinalize off");
      expect(transcript).toContain("set speech language English");
      expect(transcript).toContain("set generated media autoplay on");
      expect(transcript).toContain("ambient_messaging_gateway_status");
      expect(transcript).not.toContain("ambient_project_create");
      expect(transcript).not.toContain("ambient_workflow_create");
      expect(transcript).not.toContain("ambient_chat_create");
      expect(transcript).not.toContain("ambient_settings_update");
      expect(transcript).not.toContain("ambient_runtime_status");
    },
    180_000,
  );
}
