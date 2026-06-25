/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { VoiceSettings } from "../../shared/localRuntimeTypes";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import { runAmbientCliPackageCommand } from "./pluginsAmbientCliFacade";
import {
  registerCapabilityBuilderPackage,
  saveCapabilityBuilderEnvSecret,
  unregisterCapabilityBuilderPackage,
} from "./pluginsCapabilityBuilderDogfoodFacade";

interface PluginCapabilityBuilderProviderDogfoodDeps {
  AgentRuntime: new (...args: any[]) => any;
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  getStore: () => any;
  getWorkspacePath: () => string;
  safeStorage: any;
  setRuntime: (runtime: any) => void;
}

export function registerPluginCapabilityBuilderProviderDogfoodCases(deps: PluginCapabilityBuilderProviderDogfoodDeps): void {
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
    "plans a generated Ambient capability through the read-only Capability Builder tool",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Capability Builder planning dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder dogfood test.",
          "Call ambient_capability_builder_plan for a capability that generates WAV files from text using Piper.",
          "Use goal exactly: Generate WAV voice files from text using Piper.",
          "Use provider Piper, kind artifact generator, outputFileArtifacts WAV, and locality local.",
          "Do not use shell, browser, ambient_cli, plugin install, scaffold, dependency install, register, or activation tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans a network/API generated capability with env and host requirements",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live network/API Capability Builder dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder network API plan dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during Capability Builder network/API planning dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder network/API planning dogfood test.",
          "Call ambient_capability_builder_plan for a capability that searches Brave Search using a tiny API smoke request.",
          "Use goal exactly: Search Brave Search with an approved API key and return concise JSON results.",
          'Use provider Brave Search, kind connector/API, locality network, envNames ["BRAVE_API_KEY"], networkHosts ["api.search.brave.com"], responseFormats JSON, and no outputFileArtifacts.',
          "Do not use shell, browser, ambient_cli, plugin install, scaffold, dependency install, register, activation, or secret tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_NETWORK_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_NETWORK_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("Env requirements: BRAVE_API_KEY");
      expect(transcript).toContain("Network hosts: api.search.brave.com");
      expect(transcript).toContain("Installer shape: search-provider");
      expect(transcript).toContain("Response formats: JSON");
      expect(transcript).toContain("File artifacts: none unless the capability intentionally creates files");
      expect(transcript).toContain("Network/API capabilities must declare exact networkHosts");
      expect(transcript).toContain("Secret values must never enter chat");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "normalizes known cloud TTS provider planning into the Ambient voice-provider path",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live cloud TTS provider planning dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder cloud TTS provider plan dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during cloud TTS provider planning dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop cloud TTS provider planning dogfood test.",
          "The user wants Ambient to set up ElevenLabs so assistant replies can be read aloud in chat.",
          "Call ambient_capability_builder_plan once. Use provider ElevenLabs and goal exactly: Set up ElevenLabs so Ambient can read assistant replies aloud.",
          "Do not provide installerShape, envNames, networkHosts, outputFileArtifacts, or locality yourself; let Ambient apply any product-level TTS provider defaults.",
          "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_ELEVENLABS_TTS_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(transcript).toContain("CAPABILITY_BUILDER_ELEVENLABS_TTS_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("Installer shape: tts-provider");
      expect(transcript).toContain("Execution locality: network");
      expect(transcript).toContain("File artifacts: MP3");
      expect(transcript).toContain("Env requirements: ELEVENLABS_API_KEY");
      expect(transcript).toContain("Network hosts: api.elevenlabs.io");
      expect(transcript).toContain("Use the first-party ElevenLabs tts-provider template");
      expect(transcript).toContain("ambient_capability_builder_secret_request");
      expect(transcript).toContain("Provider selection rules");
      expect(transcript).toContain("cost-incurring API use");
      expect(transcript).toContain("Health vs validation");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now repeat the same boundary-normalization check for Cartesia.",
          "Call ambient_capability_builder_plan once. Use provider Cartesia and goal exactly: Set up Cartesia so Ambient can read assistant replies aloud.",
          "Do not provide installerShape, envNames, networkHosts, outputFileArtifacts, or locality yourself; let Ambient apply any product-level TTS provider defaults.",
          "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_CARTESIA_TTS_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const finalTranscript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(finalTranscript).toContain("CAPABILITY_BUILDER_CARTESIA_TTS_PLAN_OK");
      expect(finalTranscript).toContain("Installer shape: tts-provider");
      expect(finalTranscript).toContain("Execution locality: network");
      expect(finalTranscript).toContain("File artifacts: WAV");
      expect(finalTranscript).toContain("Env requirements: CARTESIA_API_KEY");
      expect(finalTranscript).toContain("Network hosts: api.cartesia.ai");
      expect(finalTranscript).toContain("Use the first-party Cartesia tts-provider template");
      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans a known deep-research provider with catalog guardrails",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live deep-research provider planning dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder deep research provider plan dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during deep-research provider planning dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop deep-research provider planning dogfood test.",
          "Call ambient_capability_builder_plan once. Use provider LiteResearcher-4B and goal exactly: Set up LiteResearcher-4B for bounded Ambient deep research experiments.",
          "Do not provide installerShape, envNames, networkHosts, responseFormats, modelAssets, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
          "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, or secret tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_DEEP_RESEARCH_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(transcript).toContain("CAPABILITY_BUILDER_DEEP_RESEARCH_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("Installer shape: custom-cli");
      expect(transcript).toContain("Selected known provider card: LiteResearcher-4B (deep.literesearcher-4b)");
      expect(transcript).toContain("Provider selection rules");
      expect(transcript).toContain("Research evidence");
      expect(transcript).toContain("Retrieval/deep-research planning guardrails");
      expect(transcript).toContain("trace/source/report artifacts");
    },
    240_000,
  );

  itLive(
    "plans known social and agentic connectors with catalog guardrails",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live social/agentic connector planning dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder social and agentic connector plan dogfood");
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () => undefined,
        {
          request: async (request: any) => {
            throw new Error(`Unexpected permission prompt during social/agentic connector planning dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop social connector planning dogfood test.",
          "Call ambient_capability_builder_plan once. Use provider Bluesky and goal exactly: Set up a Bluesky connector that drafts posts and only publishes after approval.",
          "Use kind connector/API, but do not provide installerShape, envNames, networkHosts, responseFormats, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
          "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, secret, OAuth, social-posting, or external API tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_BLUESKY_CONNECTOR_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(transcript).toContain("CAPABILITY_BUILDER_BLUESKY_CONNECTOR_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("Installer shape: connector");
      expect(transcript).toContain("Selected known provider card: Bluesky / AT Protocol (social.bluesky-atproto)");
      expect(transcript).toContain("Env requirements: BLUESKY_APP_PASSWORD");
      expect(transcript).toContain("Social/agentic connector planning guardrails");
      expect(transcript).toContain("Do not bypass official APIs");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now repeat the same catalog-backed connector planning check for Stripe Sandbox.",
          "Call ambient_capability_builder_plan once. Use provider Stripe and goal exactly: Set up Stripe Sandbox for typed previews and sandbox PaymentIntent smoke tests.",
          "Use kind connector/API, but do not provide installerShape, envNames, networkHosts, responseFormats, outputFileArtifacts, or locality yourself; let Ambient apply provider catalog defaults.",
          "Do not use shell, browser, ambient_cli, scaffold, dependency install, register, activation, secret, OAuth, Stripe, payment, or external API tools.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_STRIPE_CONNECTOR_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const finalTranscript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(finalTranscript).toContain("CAPABILITY_BUILDER_STRIPE_CONNECTOR_PLAN_OK");
      expect(finalTranscript).toContain("Selected known provider card: Stripe Sandbox (agentic-services.stripe-sandbox)");
      expect(finalTranscript).toContain("Env requirements: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET");
      expect(finalTranscript).toContain("sandbox-only");
      expect(finalTranscript).toContain("Idempotency-Key");
      expect(finalTranscript).toContain("Reject live payment/banking keys");
      const audit = store.listPermissionAudit(20);
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    300_000,
  );

  itLive.each([
    {
      provider: "ElevenLabs",
      packageName: "ambient-elevenlabs-pi-flow",
      envName: "ELEVENLABS_API_KEY",
      output: "MP3",
      expectedHost: "api.elevenlabs.io",
      okToken: "CAPABILITY_BUILDER_ELEVENLABS_FULL_FLOW_OK",
    },
    {
      provider: "Cartesia",
      packageName: "ambient-cartesia-pi-flow",
      envName: "CARTESIA_API_KEY",
      output: "WAV",
      expectedHost: "api.cartesia.ai",
      okToken: "CAPABILITY_BUILDER_CARTESIA_FULL_FLOW_OK",
    },
  ])(
    "completes the approved $provider cloud TTS provider setup through live Pi turns",
    async ({ provider, packageName, envName, output, expectedHost, okToken }) => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live cloud TTS provider setup dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const providerSecret = await readDogfoodSecret(envName, `${envName.toLowerCase()}.txt`);

      const emittedEvents: DesktopEvent[] = [];
      const permissionResolutions: Array<Omit<PermissionPromptResolution, "mode"> & { mode: PermissionPromptResolution["mode"] }> = [];
      let voiceSettings: VoiceSettings = {
        enabled: false,
        mode: "off",
        autoplay: false,
        maxChars: 1500,
        longReply: "summarize",
        format: output === "MP3" ? "mp3" : "wav",
        artifactCacheMaxMb: 30,
      };
      const thread = store.createThread(`${provider} cloud TTS provider full-flow dogfood`);
      runtime = createRuntime(
        store,
        new deps.BrowserService(() => store.getWorkspace()),
        new deps.BrowserCredentialStore(() => store.getWorkspace(), deps.safeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request: any) => {
            if (
              ![
                "ambient_capability_builder_scaffold",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during ${provider} cloud TTS setup dogfood: ${request.title}`);
            }
            permissionResolutions.push({ allowed: true, mode: "allow_once" });
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input: VoiceSettings) => {
              voiceSettings = { ...input };
              return voiceSettings;
            },
            createMediaUrl: ({ relativePath }: { relativePath: string }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
          },
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          `This is an Ambient Desktop ${provider} cloud TTS provider full setup dogfood test.`,
          `The user has approved planning and scaffolding a ${provider} provider so Ambient can read assistant replies aloud.`,
          `Call ambient_capability_builder_plan once with provider ${provider} and goal exactly: Set up ${provider} so Ambient can read assistant replies aloud.`,
          `Then call ambient_capability_builder_scaffold once with name ${packageName}, provider ${provider}, and the same goal.`,
          "Do not provide installerShape, envNames, networkHosts, outputFileArtifactTypes, or locality yourself; let Ambient apply product-level TTS provider defaults.",
          "Do not call secret, validate, register, ambient_cli, browser, or shell tools in this turn.",
          `After scaffolding completes, answer with exactly ${provider.toUpperCase()}_TTS_SCAFFOLDED and nothing else.`,
        ].join("\n"),
      });

      let transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(transcript).toContain(`${provider.toUpperCase()}_TTS_SCAFFOLDED`);
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("ambient_capability_builder_scaffold completed");
      expect(transcript).toContain("Installer shape: tts-provider");
      expect(transcript).toContain(`Env requirements: ${envName}`);
      expect(transcript).toContain(`Network hosts: ${expectedHost}`);

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          `Request the Builder-scoped Desktop secret dialog for ${packageName}.`,
          `Call ambient_capability_builder_secret_request with packageName ${packageName} and envName ${envName}.`,
          "Do not ask me to paste the key into chat. Do not validate, register, use ambient_cli, shell, or browser tools in this turn.",
          `After the secret request tool result is available, answer with exactly ${provider.toUpperCase()}_TTS_SECRET_REQUESTED and nothing else.`,
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      expect(transcript).toContain(`${provider.toUpperCase()}_TTS_SECRET_REQUESTED`);
      expect(transcript).toContain("Capability Builder secret dialog requested");
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "ambient-cli-secret-requested",
            packageName,
            envName,
          }),
        ]),
      );
      const secretEvent = emittedEvents.find(
        (event) => event.type === "ambient-cli-secret-requested" && event.packageName === packageName && event.envName === envName,
      );
      expect(secretEvent && "builderSourcePath" in secretEvent ? secretEvent.builderSourcePath : "").toContain(
        `.ambient/capability-builder/packages/${packageName}`,
      );

      await saveCapabilityBuilderEnvSecret(deps.getWorkspacePath(), {
        packageName,
        envName,
        value: providerSecret,
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "The Desktop secret dialog has been completed.",
          `Call ambient_capability_builder_validate with packageName ${packageName} and includeSmokeTests true.`,
          `After validation succeeds, call ambient_capability_builder_register with packageName ${packageName}.`,
          "Do not call ambient_cli, shell, browser, or package install tools.",
          `After registration completes, answer with exactly ${okToken} and mention the voice provider setup completion status.`,
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message: { content: string }) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      expect(transcript).toContain(okToken);
      expect(transcript).toContain("ambient_capability_builder_validate completed");
      expect(transcript).toContain("Ambient Capability Builder validation");
      expect(transcript).toContain("Status: succeeded");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      expect(transcript).toContain("Registered voice provider:");
      expect(transcript).toContain("Voice provider setup completion");
      expect(transcript).toContain("Selected and enabled this provider because no voice provider was configured.");
      expect(transcript).toContain("runtime dogfood: succeeded");
      expect(voiceSettings.enabled).toBe(true);
      expect(voiceSettings.autoplay).toBe(true);
      expect(voiceSettings.mode).toBe("assistant-final");
      expect(voiceSettings.providerCapabilityId).toContain(packageName);
      expect(transcript).not.toContain(providerSecret);
      expect(JSON.stringify(audit)).not.toContain(providerSecret);
      expect(permissionResolutions.length).toBeGreaterThanOrEqual(3);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_scaffold", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        ]),
      );

      const selectedCapabilityId = voiceSettings.providerCapabilityId;
      const unregistered = await unregisterCapabilityBuilderPackage(deps.getWorkspacePath(), { packageName });
      expect(unregistered.preserved).toMatchObject({ builderSource: true, envSecrets: true });
      expect(unregistered.removedPackage.name).toBe(packageName);

      const reregistered = await registerCapabilityBuilderPackage(deps.getWorkspacePath(), { packageName });
      expect(reregistered.voiceProvider).toMatchObject({ available: true });
      expect(reregistered.voiceProvider?.capabilityId).toBe(selectedCapabilityId);
      const rerunOutput = join(deps.getWorkspacePath(), `${packageName}-rollback.${output === "MP3" ? "mp3" : "wav"}`);
      const rerun = await runAmbientCliPackageCommand(deps.getWorkspacePath(), {
        packageId: reregistered.installedPackage.id,
        command: reregistered.voiceProvider!.command,
        args: [
          "--text",
          `Ambient ${provider} rollback dogfood.`,
          "--output",
          rerunOutput,
          "--format",
          output === "MP3" ? "mp3" : "wav",
          "--voice",
          reregistered.voiceProvider!.voices[0]?.id ?? "default",
        ],
      });
      expect(rerun.stdout).toContain("audioPath");
      expect((await stat(rerunOutput)).size).toBeGreaterThan(0);
      expect(voiceSettings.providerCapabilityId).toBe(selectedCapabilityId);
      expect(JSON.stringify(unregistered)).not.toContain(providerSecret);
      expect(JSON.stringify(reregistered)).not.toContain(providerSecret);
      expect(JSON.stringify(rerun)).not.toContain(providerSecret);
    },
    600_000,
  );
}

async function readDogfoodSecret(envName: string, fileName: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileFromEnv = process.env[`${envName}_FILE`]?.trim();
  if (fileFromEnv) {
    const fromEnvFile = (await readFile(fileFromEnv, "utf8")).trim();
    if (fromEnvFile) return fromEnvFile;
  }
  const fromFile = (await readFile(join(process.cwd(), fileName), "utf8")).trim();
  if (fromFile) return fromFile;
  throw new Error(`Set ${envName}, ${envName}_FILE, or create ${fileName} for live Capability Builder dogfood.`);
}
