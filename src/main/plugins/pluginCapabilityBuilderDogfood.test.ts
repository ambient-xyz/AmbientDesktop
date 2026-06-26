import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { scaffoldCapabilityBuilderPackage } from "./pluginsCapabilityBuilderDogfoodFacade";
import {
  customTtsProviderRepairFiles,
  findFirstFile,
  generatedBraveSearchRepairFiles,
  readDogfoodSecret,
  repairedBrokenTtsFiles,
  writeCustomTtsArtifactCapability,
  writeGeneratedBraveSearchCapability,
  writeZayaConfigCapability,
  zayaConfigRepairFiles,
} from "./pluginCapabilityBuilderDogfoodFixtures";
import { sendDogfoodTurn } from "./pluginCapabilityBuilderDogfoodTestSupport";
import { registerPluginCapabilityBuilderProviderDogfoodCases } from "./pluginCapabilityBuilderProviderDogfoodCases";
import { registerPluginCapabilityBuilderRealPackageDogfoodCases } from "./pluginCapabilityBuilderRealPackageDogfoodCases";
import { ProjectStore } from "./pluginsProjectStoreFacade";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-electron`,
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
describeNative("Capability Builder plugin dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-capability-dogfood-")));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });
  registerPluginCapabilityBuilderProviderDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  registerPluginCapabilityBuilderRealPackageDogfoodCases({
    AgentRuntime,
    BrowserCredentialStore,
    BrowserService,
    getStore: () => store,
    getWorkspacePath: () => workspacePath,
    safeStorage,
    setRuntime: (value) => {
      runtime = value;
    },
  });

  itLive(
    "repairs, validates, registers, and uses an invalid generated Ambient capability",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder repair application dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const brokenRoot = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(
        join(brokenRoot, "ambient-cli.json"),
        `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(brokenRoot, "capability-build.json"),
        `${JSON.stringify(
          {
            schemaVersion: "ambient-capability-builder-v1",
            name: "ambient-broken-tts",
            version: "0.1.0",
            status: "validated",
            lastValidatedAt: "2026-01-01T00:00:00.000Z",
            refs: { lastValidated: "stale", lastValidatedHash: "stale" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const repairFiles = repairedBrokenTtsFiles();
      const thread = store.createThread("Capability Builder repair application dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              ![
                "ambient_capability_builder_apply_repair",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during Capability Builder repair application dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
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
          "This is an Ambient Desktop Capability Builder integrated repair dogfood test.",
          "First call ambient_capability_builder_repair_plan with packageName ambient-broken-tts.",
          "Use requestedRepair exactly: Repair descriptor, SKILL, wrapper, and smoke test so this package validates and produces a WAV artifact.",
          "Do not call ambient_capability_builder_preview separately in this planning turn.",
          "Do not edit files, validate, register, run ambient_cli, use shell, or use browser tools.",
          "After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_INTEGRATED_REPAIR_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now apply the approved repair.",
          "Call ambient_capability_builder_apply_repair with packageName ambient-broken-tts.",
          "Use reason exactly: Apply approved repair files for the integrated dogfood.",
          "Use this exact files JSON array:",
          JSON.stringify(repairFiles),
          "Do not call install_deps, validate, register, ambient_cli, shell, or browser tools in this turn.",
          "After the apply-repair tool completes, answer with exactly CAPABILITY_BUILDER_APPLY_REPAIR_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "planner",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_capability_builder_preview with packageName ambient-broken-tts.",
          "Do not validate, register, run ambient_cli, use shell, or use browser tools in this turn.",
          "After preview completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_PREVIEW_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_capability_builder_validate with packageName ambient-broken-tts and includeSmokeTests true.",
          "Do not register, run ambient_cli, use shell, or use browser tools in this turn.",
          "After validation completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_VALIDATE_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_capability_builder_register with packageName ambient-broken-tts.",
          "Do not validate again, run ambient_cli, use shell, or use browser tools in this turn.",
          "After registration completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_REGISTER_OK and nothing else.",
        ].join("\n"),
      });

      const useThread = store.createThread("Capability Builder repaired installed-use dogfood");
      await runtime.send({
        threadId: useThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is a fresh Ambient Desktop turn for using a repaired generated capability.",
          "Call ambient_cli_search with query exactly Generate repaired WAV files from text.",
          "Then call ambient_cli_describe with packageName ambient-broken-tts and command broken_tts.",
          'Then call ambient_cli with packageName ambient-broken-tts, command broken_tts, and args ["live repair", "repaired-live.wav"].',
          "Do not use shell or browser tools.",
          "After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_REPAIRED_RUN_OK and include the phrase WAV artifact.",
        ].join("\n"),
      });

      let transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      let useTranscript = store
        .listMessages(useThread.id)
        .map((message) => message.content)
        .join("\n");
      if (useTranscript.includes("ambient_cli_describe completed") && !useTranscript.includes("ambient_cli completed")) {
        await runtime.send({
          threadId: useThread.id,
          permissionMode: "workspace",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "Continue from the completed ambient_cli_describe result.",
            'Now call ambient_cli with packageName ambient-custom-tts-artifact, command custom_tts_artifact, and args ["--text", "Ambient custom provider live dogfood.", "--output", "custom-provider-live.wav", "--format", "wav", "--voice", "default"].',
            "Do not call search or describe again. Do not use shell or browser tools.",
            "After ambient_cli completes, answer with exactly CUSTOM_TTS_PROVIDER_RUN_OK and include the phrase chat voice provider.",
          ].join("\n"),
        });
        transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        useTranscript = store
          .listMessages(useThread.id)
          .map((message) => message.content)
          .join("\n");
      }
      const audit = store.listPermissionAudit(80);
      expect(transcript).toContain("CAPABILITY_BUILDER_INTEGRATED_REPAIR_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
      expect(transcript).toContain("CAPABILITY_BUILDER_APPLY_REPAIR_OK");
      expect(transcript).toContain("ambient_capability_builder_apply_repair completed");
      expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_PREVIEW_OK");
      expect(transcript).toContain("ambient_capability_builder_preview completed");
      expect(transcript).toContain("Status: valid for static preview");
      expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_VALIDATE_OK");
      expect(transcript).toContain("ambient_capability_builder_validate completed");
      expect(transcript).toContain("CAPABILITY_BUILDER_REPAIRED_REGISTER_OK");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      expect(useTranscript).toContain("ambient_cli_search completed");
      expect(useTranscript).toContain("ambient_cli_describe completed");
      expect(useTranscript).toContain("ambient_cli completed");
      expect(useTranscript).toContain("CAPABILITY_BUILDER_REPAIRED_RUN_OK");
      expect(useTranscript).toContain("WAV artifact");
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_apply_repair", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
          expect.objectContaining({ threadId: useThread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      const manifest = JSON.parse(await readFile(join(brokenRoot, "capability-build.json"), "utf8"));
      expect(manifest.refs.lastValidatedHash).toEqual(expect.any(String));
      const installedArtifact = await findFirstFile(join(workspacePath, ".ambient", "cli-packages", "imported"), "repaired-live.wav");
      expect(installedArtifact).toBeTruthy();
      await expect(stat(installedArtifact!)).resolves.toBeTruthy();
    },
    600_000,
  );

  itLive(
    "repairs a custom TTS artifact package into a registered chat voice provider through Pi",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live custom TTS provider repair dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-custom-tts-artifact");
      await writeCustomTtsArtifactCapability(rootPath);

      const repairFiles = customTtsProviderRepairFiles();
      const thread = store.createThread("Custom TTS provider repair dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              ![
                "ambient_capability_builder_apply_repair",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during custom TTS provider repair dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
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
          "This is an Ambient Desktop custom TTS provider repair dogfood test.",
          "The package ambient-custom-tts-artifact currently looks like a one-off TTS artifact generator, but the user wants it converted into a chat voice provider.",
          "Call ambient_capability_builder_repair_plan with packageName ambient-custom-tts-artifact.",
          "Use requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
          "Do not call ambient_capability_builder_preview separately in this planning turn.",
          "Do not edit files, validate, register, run ambient_cli, use shell, or use browser tools.",
          "After the repair-plan tool completes, answer with exactly CUSTOM_TTS_PROVIDER_REPAIR_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now apply the approved custom TTS provider conversion repair.",
          "Call ambient_capability_builder_apply_repair with packageName ambient-custom-tts-artifact.",
          "Use reason exactly: Convert custom TTS artifact generator into an Ambient chat voice provider.",
          "Use this exact files JSON array:",
          JSON.stringify(repairFiles),
          "Do not call install_deps, validate, register, ambient_cli, shell, or browser tools in this turn.",
          "After the apply-repair tool completes, answer with exactly CUSTOM_TTS_PROVIDER_APPLY_REPAIR_OK and nothing else.",
        ].join("\n"),
      });

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_capability_builder_validate with packageName ambient-custom-tts-artifact and includeSmokeTests true.",
          "After validation succeeds, call ambient_capability_builder_register with packageName ambient-custom-tts-artifact.",
          "Do not run ambient_cli, use shell, or use browser tools in this turn.",
          "After registration completes, answer with exactly CUSTOM_TTS_PROVIDER_VALIDATE_REGISTER_OK and mention Registered voice provider.",
        ].join("\n"),
      });

      const useThread = store.createThread("Custom TTS provider fresh use dogfood");
      await runtime.send({
        threadId: useThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is a fresh Ambient Desktop turn for using the repaired custom TTS chat voice provider.",
          "Call ambient_cli_search with query exactly Custom TTS voice provider.",
          "Then call ambient_cli_describe with packageName ambient-custom-tts-artifact and command custom_tts_artifact.",
          'Then call ambient_cli with packageName ambient-custom-tts-artifact, command custom_tts_artifact, and args ["--text", "Ambient custom provider live dogfood.", "--output", "custom-provider-live.wav", "--format", "wav", "--voice", "default"].',
          "Do not use shell or browser tools.",
          "After ambient_cli completes, answer with exactly CUSTOM_TTS_PROVIDER_RUN_OK and include the phrase chat voice provider.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const useTranscript = store
        .listMessages(useThread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(80);
      expect(transcript).toContain("CUSTOM_TTS_PROVIDER_REPAIR_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
      expect(transcript).toContain("Convert the package into the Ambient tts-provider installer shape");
      expect(transcript).toContain("providerContract command");
      expect(transcript).toContain("CUSTOM_TTS_PROVIDER_APPLY_REPAIR_OK");
      expect(transcript).toContain("ambient_capability_builder_apply_repair completed");
      expect(transcript).toContain("CUSTOM_TTS_PROVIDER_VALIDATE_REGISTER_OK");
      expect(transcript).toContain("ambient_capability_builder_validate completed");
      expect(transcript).toContain("providerContract (custom_tts_artifact)");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      expect(transcript).toContain("Registered voice provider:");
      expect(useTranscript).toContain("ambient_cli_search completed");
      expect(useTranscript).toContain("ambient_cli_describe completed");
      expect(useTranscript).toContain("Command: custom_tts_artifact");
      expect(useTranscript).toContain("Health: passed");
      expect(useTranscript).toContain("ambient_cli completed");
      expect(useTranscript).toContain("CUSTOM_TTS_PROVIDER_RUN_OK");
      expect(useTranscript).toContain("chat voice provider");
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_apply_repair", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
          expect.objectContaining({ threadId: useThread.id, toolName: "ambient_cli", decision: "allowed" }),
        ]),
      );
      const manifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      expect(manifest.installerShape).toBe("tts-provider");
      expect(manifest.refs.voiceProviderContractValidatedAt).toEqual(expect.any(String));
      const installedArtifact = await findFirstFile(
        join(workspacePath, ".ambient", "cli-packages", "imported"),
        "custom-provider-live.wav",
      );
      expect(installedArtifact).toBeTruthy();
      await expect(stat(installedArtifact!)).resolves.toMatchObject({ size: expect.any(Number) });
    },
    600_000,
  );

  itLive(
    "dogfoods a generated Brave Search API capability through env binding lifecycle and repair",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated Brave API dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const braveApiKey = await readDogfoodSecret("BRAVE_API_KEY", "brave_api_key.txt");
      process.env.BRAVE_API_KEY = braveApiKey;
      await writeFile(join(workspacePath, "brave_api_key.txt"), `${braveApiKey}\n`, "utf8");
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "brave-api-search",
        goal: "Search Brave Search with an approved API key and return concise JSON results.",
        provider: "Brave Search",
        kind: "connector/API",
        installerShape: "search-provider",
        outputArtifactTypes: [],
        locality: "network",
      });
      const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-brave-api-search");
      await writeGeneratedBraveSearchCapability(rootPath);

      const thread = store.createThread("Capability Builder generated Brave API lifecycle dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              ![
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_capability_builder_unregister",
                "ambient_capability_builder_apply_repair",
                "ambient_cli_env_bind",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during generated Brave API dogfood: ${request.title}`);
            }
            return { allowed: true, mode: request.toolName === "ambient_cli" ? "always_workspace" : "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_preview with packageName ambient-brave-api-search. Do not validate, register, bind secrets, run ambient_cli, use shell, or use browser tools. After preview completes, answer with exactly CAPABILITY_BUILDER_BRAVE_PREVIEW_OK and include BRAVE_API_KEY and api.search.brave.com.",
        expected: "CAPABILITY_BUILDER_BRAVE_PREVIEW_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-brave-api-search and includeSmokeTests true.",
          "This is approved to use the BRAVE_API_KEY process env for one tiny Brave Search smoke request.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK and include the phrase api.search.brave.com.",
        ],
        expected: "CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_cli_describe with packageName ambient-brave-api-search and command brave_search.",
          "Do not run ambient_cli before binding the secret.",
          "After describe shows the missing env requirement, call ambient_cli_env_bind with packageName ambient-brave-api-search, envName BRAVE_API_KEY, and filePath ./brave_api_key.txt.",
          "Do not print or read the secret value into chat. After binding completes, answer with exactly CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK and include Missing required env: BRAVE_API_KEY.",
        ],
        expected: "CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli with packageName ambient-brave-api-search, command brave_search, and args ["Ambient Desktop Capability Builder", "-n", "1"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_BRAVE_RUN_OK and include Result 1.',
        expected: "CAPABILITY_BUILDER_BRAVE_RUN_OK",
      });

      const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      const installedPackageId = String(registeredManifest.installedPackageId);
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_unregister with packageName ambient-brave-api-search.",
          `Use installedPackageId exactly ${installedPackageId}.`,
          "Use reason exactly: Generated Brave API dogfood rollback preserves source, logs, and env binding metadata.",
          "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
          "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK",
      });

      await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_repair_plan with packageName ambient-brave-api-search. Use requestedRepair exactly: Restore the Brave Search API descriptor, SKILL, wrapper, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK and nothing else.",
        expected: "CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_apply_repair with packageName ambient-brave-api-search.",
          "Use reason exactly: Restore the intentionally broken generated Brave Search API capability.",
          "Use this exact files JSON array:",
          JSON.stringify(generatedBraveSearchRepairFiles()),
          "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-brave-api-search and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-brave-api-search.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli with packageName ambient-brave-api-search, command brave_search, and args ["Ambient Desktop generated capability", "-n", "1"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK and include Result 1.',
        expected: "CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK",
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      for (const expected of [
        "CAPABILITY_BUILDER_BRAVE_PREVIEW_OK",
        "BRAVE_API_KEY",
        "api.search.brave.com",
        "CAPABILITY_BUILDER_BRAVE_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_BRAVE_DESCRIBE_BIND_OK",
        "Missing required env: BRAVE_API_KEY",
        "CAPABILITY_BUILDER_BRAVE_RUN_OK",
        "Result 1",
        "CAPABILITY_BUILDER_BRAVE_UNREGISTER_REREGISTER_OK",
        "CAPABILITY_BUILDER_BRAVE_REPAIR_PLAN_OK",
        "CAPABILITY_BUILDER_BRAVE_APPLY_REPAIR_OK",
        "CAPABILITY_BUILDER_BRAVE_REPAIRED_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_BRAVE_REPAIRED_RUN_OK",
      ]) {
        expect(transcript).toContain(expected);
      }
      const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
      expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
    },
    900_000,
  );

  itLive(
    "dogfoods a generated model asset capability through download lifecycle and repair",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated model asset dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "zaya-config-reader",
        goal: "Download and inspect a small Zyphra ZAYA1-8B model config asset.",
        provider: "Zyphra ZAYA1-8B",
        kind: "model asset inspector",
        outputArtifactTypes: ["JSON"],
        locality: "network",
      });
      const rootPath = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-zaya-config-reader");
      await writeZayaConfigCapability(rootPath);

      const thread = store.createThread("Capability Builder generated model asset lifecycle dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              ![
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_capability_builder_unregister",
                "ambient_capability_builder_apply_repair",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during generated model asset dogfood: ${request.title}`);
            }
            return { allowed: true, mode: request.toolName === "ambient_cli" ? "always_workspace" : "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_preview with packageName ambient-zaya-config-reader. Do not validate, register, run ambient_cli, use shell, or use browser tools. After preview completes, answer with exactly CAPABILITY_BUILDER_ZAYA_PREVIEW_OK and include ZAYA1-8B config and huggingface.co.",
        expected: "CAPABILITY_BUILDER_ZAYA_PREVIEW_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-zaya-config-reader and includeSmokeTests true.",
          "This is approved to download the declared tiny config.json model asset from huggingface.co.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK and include ZayaForCausalLM.",
        ],
        expected: "CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli_search with query exactly inspect Zyphra ZAYA model config asset. Then call ambient_cli_describe with packageName ambient-zaya-config-reader and command zaya_config. Then call ambient_cli with packageName ambient-zaya-config-reader, command zaya_config, and args ["--field", "architectures.0"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_ZAYA_RUN_OK and include ZayaForCausalLM.',
        expected: "CAPABILITY_BUILDER_ZAYA_RUN_OK",
      });

      const registeredManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      const installedPackageId = String(registeredManifest.installedPackageId);
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_unregister with packageName ambient-zaya-config-reader.",
          `Use installedPackageId exactly ${installedPackageId}.`,
          "Use reason exactly: Generated model asset dogfood rollback preserves source, cache, and logs.",
          "Wait for unregister to complete, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
          "Do not stop after unregistering. After re-registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK",
      });

      await writeFile(join(rootPath, "ambient-cli.json"), "{}\n", "utf8");
      await sendDogfoodTurn(runtime, store, thread.id, {
        mode: "planner",
        content:
          "Call ambient_capability_builder_repair_plan with packageName ambient-zaya-config-reader. Use requestedRepair exactly: Restore the ZAYA model asset descriptor, SKILL, downloader wrapper, and smoke test after an intentional descriptor break. After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK and nothing else.",
        expected: "CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_apply_repair with packageName ambient-zaya-config-reader.",
          "Use reason exactly: Restore the intentionally broken generated ZAYA model asset capability.",
          "Use this exact files JSON array:",
          JSON.stringify(zayaConfigRepairFiles()),
          "After apply-repair completes, answer with exactly CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content: [
          "Call ambient_capability_builder_validate with packageName ambient-zaya-config-reader and includeSmokeTests true.",
          "Wait for validation to succeed, then call ambient_capability_builder_register with packageName ambient-zaya-config-reader.",
          "Do not stop after validation. After registration completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK and nothing else.",
        ],
        expected: "CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK",
      });
      await sendDogfoodTurn(runtime, store, thread.id, {
        content:
          'Call ambient_cli with packageName ambient-zaya-config-reader, command zaya_config, and args ["--field", "architectures.0"]. After ambient_cli completes, answer with exactly CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK and include ZayaForCausalLM.',
        expected: "CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK",
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      for (const expected of [
        "CAPABILITY_BUILDER_ZAYA_PREVIEW_OK",
        "ZAYA1-8B config",
        "huggingface.co",
        "CAPABILITY_BUILDER_ZAYA_VALIDATE_REGISTER_OK",
        "ZayaForCausalLM",
        "CAPABILITY_BUILDER_ZAYA_RUN_OK",
        "CAPABILITY_BUILDER_ZAYA_UNREGISTER_REREGISTER_OK",
        "CAPABILITY_BUILDER_ZAYA_REPAIR_PLAN_OK",
        "CAPABILITY_BUILDER_ZAYA_APPLY_REPAIR_OK",
        "CAPABILITY_BUILDER_ZAYA_REPAIRED_VALIDATE_REGISTER_OK",
        "CAPABILITY_BUILDER_ZAYA_REPAIRED_RUN_OK",
      ]) {
        expect(transcript).toContain(expected);
      }
      const repairedManifest = JSON.parse(await readFile(join(rootPath, "capability-build.json"), "utf8"));
      expect(repairedManifest.refs.lastRepair).toEqual(expect.any(String));
      expect(repairedManifest.refs.lastValidatedHash).toEqual(expect.any(String));
    },
    900_000,
  );
});
