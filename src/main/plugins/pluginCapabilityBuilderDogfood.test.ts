import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { VoiceSettings } from "../../shared/localRuntimeTypes";
import { buildGeneratedCapabilityRemovalPlanPrompt, buildGeneratedCapabilityUpdatePlanPrompt } from "../../renderer/src/pluginUiModel";
import { BrowserCredentialStore, BrowserService } from "../browser/browserAgentRuntimeContract";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import {
  registerCapabilityBuilderPackage,
  scaffoldCapabilityBuilderPackage,
  unregisterCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "./pluginsCapabilityBuilderDogfoodFacade";
import {
  customTtsProviderRepairFiles,
  findFirstFile,
  generatedBraveSearchRepairFiles,
  readDogfoodFilePath,
  readDogfoodSecret,
  repairedBrokenTtsFiles,
  writeCustomTtsArtifactCapability,
  writeGeneratedBraveSearchCapability,
  writeToneWavCapability,
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
    "completes the approved Piper local TTS provider setup through live Pi turns",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Piper local TTS provider setup dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const modelPath = await readDogfoodFilePath("PIPER_VOICE_MODEL_FILE", "the cached en_US-lessac-medium.onnx Piper voice model");
      const configPath = await readDogfoodFilePath(
        "PIPER_VOICE_CONFIG_FILE",
        "the cached en_US-lessac-medium.onnx.json Piper voice config",
      );
      const packageName = "ambient-piper-local-pi-flow";
      const commandName = "piper_local_pi_flow";
      const installScript = [
        "const fs = require('node:fs');",
        "fs.mkdirSync('models', { recursive: true });",
        "fs.copyFileSync(process.argv[1], 'models/en_US-lessac-medium.onnx');",
        "fs.copyFileSync(process.argv[2], 'models/en_US-lessac-medium.onnx.json');",
      ].join(" ");

      let voiceSettings: VoiceSettings = {
        enabled: false,
        mode: "off",
        autoplay: false,
        maxChars: 1500,
        longReply: "summarize",
        format: "wav",
        artifactCacheMaxMb: 30,
      };
      const thread = store.createThread("Piper local TTS provider full-flow dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (
              ![
                "ambient_capability_builder_scaffold",
                "ambient_capability_builder_install_deps",
                "ambient_capability_builder_validate",
                "ambient_capability_builder_register",
                "ambient_cli",
              ].includes(request.toolName)
            ) {
              throw new Error(`Unexpected permission prompt during Piper local TTS setup dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
        {
          voice: {
            readSettings: () => voiceSettings,
            updateSettings: async (input) => {
              voiceSettings = { ...input };
              return voiceSettings;
            },
            createMediaUrl: ({ relativePath }) => `ambient-media://dogfood/${encodeURIComponent(relativePath)}`,
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
          "This is an Ambient Desktop Piper local TTS provider full setup dogfood test.",
          "The user has approved planning and scaffolding a Piper provider so Ambient can read assistant replies aloud locally.",
          "Call ambient_capability_builder_plan once with provider Piper and goal exactly: Set up Piper so Ambient can read assistant replies aloud.",
          "Then call ambient_capability_builder_scaffold once with name piper-local-pi-flow, provider Piper, kind tts-provider, locality local, outputFileArtifactTypes WAV, and the same goal.",
          "Do not install dependencies, copy assets, validate, register, run ambient_cli, use shell, or use browser tools in this turn.",
          "After scaffolding completes, answer with exactly PIPER_LOCAL_TTS_SCAFFOLDED and nothing else.",
        ].join("\n"),
      });

      let transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("PIPER_LOCAL_TTS_SCAFFOLDED");
      expect(transcript).toContain("ambient_capability_builder_plan completed");
      expect(transcript).toContain("ambient_capability_builder_scaffold completed");
      expect(transcript).toContain("Installer shape: tts-provider");
      expect(transcript).toContain("Piper");
      expect(transcript).toContain("Piper voice model");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "The user approved preparing package-local Piper model assets from already-present cached files.",
          `Call ambient_capability_builder_install_deps with packageName ${packageName}.`,
          `Use exactly one command object with command node, args ${JSON.stringify(["-e", installScript, modelPath, configPath])}, cwd ".", rationale "Copy already-present approved Piper voice assets into the provider-local models directory for local validation."`,
          `After install_deps succeeds, call ambient_capability_builder_validate with packageName ${packageName} and includeSmokeTests true.`,
          `After validation succeeds, call ambient_capability_builder_register with packageName ${packageName}.`,
          "Do not call ambient_cli, shell, browser, or secret tools in this turn.",
          "After registration completes, answer with exactly PIPER_LOCAL_TTS_REGISTERED and mention the voice provider setup completion status.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(200);
      expect(transcript).toContain("PIPER_LOCAL_TTS_REGISTERED");
      expect(transcript).toContain("ambient_capability_builder_install_deps completed");
      expect(transcript).toContain("ambient_capability_builder_validate completed");
      expect(transcript).toContain("Status: succeeded");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      expect(transcript).toContain("Registered voice provider:");
      expect(transcript).toContain("Selected and enabled this provider because no voice provider was configured.");
      expect(voiceSettings).toMatchObject({
        enabled: true,
        autoplay: true,
        mode: "assistant-final",
        providerCapabilityId: expect.stringContaining(packageName),
        format: "wav",
      });
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_install_deps", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        ]),
      );
      const validationLog = await readFile(
        join(workspacePath, ".ambient", "capability-builder", "packages", packageName, "capability-validation-log.jsonl"),
        "utf8",
      );
      expect(validationLog).toContain('"source":"providerContract"');
      expect(validationLog).toContain("validation-artifacts");
      expect(validationLog).toContain("audio/wav");

      const outputPath = join(workspacePath, "piper-local-pi-flow.wav");
      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is a fresh installed-use check for the registered Piper local TTS provider.",
          `Call ambient_cli_describe with packageName ${packageName} and command ${commandName}.`,
          `Then call ambient_cli with packageName ${packageName}, command ${commandName}, and args ${JSON.stringify(["--text", "Ambient Piper local dogfood.", "--output", outputPath, "--format", "wav", "--voice", "default"])}.`,
          "Do not use shell, browser, install, validate, register, or repair tools.",
          "After ambient_cli completes, answer with exactly PIPER_LOCAL_TTS_RUN_OK and include the generated audio path.",
        ].join("\n"),
      });

      transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(transcript).toContain("ambient_cli_describe completed");
      expect(transcript).toContain("ambient_cli completed");
      expect(transcript).toContain("PIPER_LOCAL_TTS_RUN_OK");
      expect(transcript).toContain(outputPath);
      expect((await stat(outputPath)).size).toBeGreaterThan(0);
    },
    600_000,
  );

  itLive(
    "scaffolds a generated Ambient capability through Capability Builder",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder scaffold dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;

      const thread = store.createThread("Capability Builder scaffold dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_scaffold") {
              throw new Error(`Unexpected permission prompt during Capability Builder scaffold dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder scaffold dogfood test.",
          "Call ambient_capability_builder_scaffold with name piper-tts, goal exactly Generate WAV voice files from text using Piper, provider Piper, kind artifact generator, outputFileArtifactTypes WAV, and locality local.",
          "Do not install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the scaffold tool completes, answer with exactly CAPABILITY_BUILDER_SCAFFOLD_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_SCAFFOLD_OK");
      expect(transcript).toContain("ambient_capability_builder_scaffold completed");
      await expect(
        readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "ambient-cli.json"), "utf8"),
      ).resolves.toContain("ambient-piper-tts");
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_scaffold", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "previews a generated Ambient capability through the read-only Capability Builder tool",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder preview dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const thread = store.createThread("Capability Builder preview dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Capability Builder preview dogfood: ${request.title}`);
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
          "This is an Ambient Desktop Capability Builder preview dogfood test.",
          "Call ambient_capability_builder_preview with packageName ambient-piper-tts.",
          "Do not scaffold, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the preview tool completes, answer with exactly CAPABILITY_BUILDER_PREVIEW_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_PREVIEW_OK");
      expect(transcript).toContain("ambient_capability_builder_preview completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans a generated Ambient capability update through the read-only Capability Builder tool",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder update-plan dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const thread = store.createThread("Capability Builder update-plan dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Capability Builder update-plan dogfood: ${request.title}`);
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
          "This is an Ambient Desktop Capability Builder update-plan dogfood test.",
          "Call ambient_capability_builder_update_plan with packageName ambient-piper-tts.",
          "Use requestedChanges exactly: Add a speed option while preserving WAV artifact output.",
          "Do not call preview separately. Do not scaffold, edit files, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the update-plan tool completes, answer with exactly CAPABILITY_BUILDER_UPDATE_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_UPDATE_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_update_plan completed");
      expect(transcript).not.toContain("ambient_capability_builder_preview completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans generated Ambient capability removal through the read-only Capability Builder tool",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder removal-plan dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const thread = store.createThread("Capability Builder removal-plan dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Capability Builder removal-plan dogfood: ${request.title}`);
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
          "This is an Ambient Desktop Capability Builder removal-plan dogfood test.",
          "Call ambient_capability_builder_removal_plan with packageName ambient-piper-tts.",
          "Use installedPackageId exactly ambient-cli:generated:ambient-piper-tts.",
          "Use installedSource exactly ./.ambient/cli-packages/imported/ambient-piper-tts.",
          "Use reason exactly: User wants to hide the capability while preserving source and artifacts.",
          "Do not call preview separately. Do not delete files, unregister, disable, edit package state, remove secrets, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the removal-plan tool completes, answer with exactly CAPABILITY_BUILDER_REMOVAL_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_REMOVAL_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_removal_plan completed");
      expect(transcript).not.toContain("ambient_capability_builder_preview completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "plans generated Ambient capability repair through the read-only Capability Builder tool",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder repair-plan dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const brokenRoot = join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-broken-tts");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(
        join(brokenRoot, "ambient-cli.json"),
        `${JSON.stringify({ version: "0.1.0", commands: {}, artifacts: { outputTypes: ["WAV"] } }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(join(brokenRoot, "capability-validation-log.jsonl"), '{"status":"failed"}\n', "utf8");

      const thread = store.createThread("Capability Builder repair-plan dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Capability Builder repair-plan dogfood: ${request.title}`);
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
          "This is an Ambient Desktop Capability Builder repair-plan dogfood test.",
          "Call ambient_capability_builder_repair_plan with packageName ambient-broken-tts.",
          "Use requestedRepair exactly: Make the generated TTS package valid and require a WAV-producing smoke test.",
          "Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately.",
          "Do not scaffold, edit files, install dependencies, validate, register, unregister, delete files, activate, run ambient_cli, use shell, or use browser tools.",
          "After the repair-plan tool completes, answer with exactly CAPABILITY_BUILDER_REPAIR_PLAN_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_REPAIR_PLAN_OK");
      expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
      expect(transcript).toContain("Descriptor name is required");
      expect(transcript).not.toContain("ambient_capability_builder_preview completed");
      expect(transcript).not.toContain("ambient_capability_builder_validate completed");
      expect(transcript).not.toContain("ambient_capability_builder_register completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "routes protected-path repair diagnosis into the privileged action handoff during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live privileged action handoff dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const scaffold = await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "protected-python-path",
        goal: "Wrap a Python native runtime whose data directory can be compiled into a protected system path.",
        installerShape: "custom-cli",
        kind: "local model",
        provider: "Protected Python Path Fixture",
        locality: "local",
        modelAssets: ["runtime data directory"],
      });
      await writeFile(
        join(scaffold.rootPath, "capability-validation-log.jsonl"),
        `${JSON.stringify({
          timestamp: "2026-05-10T00:00:00.000Z",
          command: "protected-python-path",
          status: "failed",
          exitCode: 1,
          stderrPreview:
            "Error processing file '/Library/Application Support/Ambient/protected-runtime/espeak-ng-data/phontab': No such file or directory. The runtime data path is compiled into the native library.",
        })}\n`,
        "utf8",
      );

      const thread = store.createThread("Privileged action handoff dogfood");
      const privilegedCredentialRequests: unknown[] = [];
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_privileged_action_request") {
              throw new Error(`Unexpected permission prompt during privileged action handoff dogfood: ${request.title}`);
            }
            expect(request.detail).toContain("Protected Python Path Fixture");
            expect(request.detail).toContain("/Library/Application Support/Ambient/protected-runtime/espeak-ng-data");
            expect(request.detail).not.toContain("real-password");
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
        {
          privilegedCredentials: {
            request: async (request) => {
              privilegedCredentialRequests.push(request);
              return { allowed: true, credential: "temporary-dogfood-password" };
            },
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
          "This is an Ambient Desktop live dogfood for protected-path capability repair.",
          "First call ambient_capability_builder_repair_plan with packageName protected-python-path.",
          "Use requestedRepair exactly: Diagnose the compiled-in Python native data path failure and stop at a privileged handoff if protected system path mutation is required.",
          "After the repair-plan tool returns, use the repair plan's installerRecoveryTemplates and approval checkpoints.",
          "If the plan indicates a protected system path/admin boundary, call ambient_privileged_action_status before any privileged handoff request.",
          "Read the status result. It should report the current selected adapter, credential behavior, and policyHints for the darwin/create_system_symlink structured request shape; do not claim Ambient will execute the privileged command unless selectedAdapterExecutesPrivilegedCommands is true.",
          "Then call the privileged handoff tool with a typed privileged_action_template and rehearseCredentialPrompt true.",
          "Use purpose create_system_symlink, packageName protected-python-path, platform darwin, credential {{AMBIENT_PRIVILEGED_AUTH}}, and reason explaining the compiled-in protected data path.",
          "Shape the command template from the status policyHints. The workspace source is ./.ambient/capability-builder/packages/protected-python-path/models/espeak-ng-data and the Ambient-owned protected target is /Library/Application Support/Ambient/protected-runtime/espeak-ng-data.",
          "The command template should not use sudo or a shell.",
          "Do not edit files, install dependencies, validate, register, run ambient_cli, use shell, use browser tools, or ask the user to copy commands.",
          "After the privileged handoff tool completes, answer with exactly PRIVILEGED_ACTION_HANDOFF_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("ambient_capability_builder_repair_plan completed");
      expect(transcript).toContain("installerRecoveryTemplates");
      expect(transcript).toContain("python-native-data-path");
      expect(transcript).toContain("ambient_privileged_action_status completed");
      expect(transcript).toContain("Execution: dry-run-only");
      expect(transcript).toContain("Adapter status: not-implemented");
      expect(transcript).toContain("Selected adapter:");
      expect(transcript).toContain("Policy planning: available");
      expect(transcript).toContain("Policy hints:");
      expect(transcript).toContain("/bin/ln -sfn <workspace-source> <Ambient-owned protected target>");
      expect(transcript).toContain("ambient_privileged_action_request completed");
      expect(transcript).toContain("Status: not-executed");
      expect(transcript).toContain("Request adapter readiness: not-implemented");
      expect(transcript).toContain("Credential capture: rehearsed-and-discarded");
      expect(transcript).toContain("Continuation:");
      expect(transcript).toContain("state: blocked-until-native-adapter");
      expect(transcript).toContain("PRIVILEGED_ACTION_HANDOFF_OK");
      expect(transcript).not.toMatch(/\bsudo\b/);
      expect(transcript).not.toContain("temporary-dogfood-password");
      expect(privilegedCredentialRequests).toEqual([
        expect.objectContaining({
          schemaVersion: "ambient-privileged-action-v1",
          workspacePath,
          uiPrompt: expect.objectContaining({ credentialPrompt: "ephemeral-native-prompt-required" }),
        }),
      ]);
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            threadId: thread.id,
            toolName: "ambient_privileged_action_request",
            risk: "privileged-action",
            decision: "allowed",
          }),
        ]),
      );
    },
    240_000,
  );

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

  itLive(
    "installs dependencies for a generated Ambient capability through Capability Builder",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder dependency dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const thread = store.createThread("Capability Builder dependency dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_install_deps") {
              throw new Error(`Unexpected permission prompt during Capability Builder dependency dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder dependency install dogfood test.",
          "Call ambient_capability_builder_install_deps with packageName ambient-piper-tts.",
          'Use exactly one command object: command node, args ["--version"], cwd ".", rationale "Verify Node runtime availability for dependency planning smoke."',
          "Do not scaffold, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the dependency install tool completes, answer with exactly CAPABILITY_BUILDER_INSTALL_DEPS_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_INSTALL_DEPS_OK");
      expect(transcript).toContain("ambient_capability_builder_install_deps completed");
      await expect(
        readFile(
          join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "capability-deps-log.jsonl"),
          "utf8",
        ),
      ).resolves.toContain('"command":"node"');
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_install_deps", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "validates a generated Ambient capability through Capability Builder",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder validation dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const thread = store.createThread("Capability Builder validation dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_validate") {
              throw new Error(`Unexpected permission prompt during Capability Builder validation dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder validation dogfood test.",
          "Call ambient_capability_builder_validate with packageName ambient-piper-tts and includeSmokeTests true.",
          "Do not scaffold, install dependencies, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the validation tool completes, answer with exactly CAPABILITY_BUILDER_VALIDATE_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_VALIDATE_OK");
      expect(transcript).toContain("ambient_capability_builder_validate completed");
      await expect(
        readFile(
          join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "capability-validation-log.jsonl"),
          "utf8",
        ),
      ).resolves.toContain('"source":"healthCheck"');
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_validate", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "registers a generated Ambient capability through Capability Builder",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder registration dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

      const thread = store.createThread("Capability Builder registration dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_register") {
              throw new Error(`Unexpected permission prompt during Capability Builder registration dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder registration dogfood test.",
          "Call ambient_capability_builder_register with packageName ambient-piper-tts.",
          "Do not scaffold, install dependencies, validate, activate, run ambient_cli, use shell, or use browser tools.",
          "After the registration tool completes, answer with exactly CAPABILITY_BUILDER_REGISTER_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_REGISTER_OK");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      await expect(readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toContain(
        "ambient-piper-tts",
      );
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "unregisters a generated Ambient capability through Capability Builder while preserving source",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder unregister dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

      const thread = store.createThread("Capability Builder unregister dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_unregister") {
              throw new Error(`Unexpected permission prompt during Capability Builder unregister dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder unregister dogfood test.",
          "Call ambient_capability_builder_unregister with packageName ambient-piper-tts.",
          `Use installedPackageId exactly ${registered.installedPackage.id}.`,
          "Use reason exactly: Hide from search while preserving builder source and artifacts.",
          "Do not delete files, remove source, install dependencies, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the unregister tool completes, answer with exactly CAPABILITY_BUILDER_UNREGISTER_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_UNREGISTER_OK");
      expect(transcript).toContain("ambient_capability_builder_unregister completed");
      await expect(
        readFile(join(workspacePath, ".ambient", "capability-builder", "packages", "ambient-piper-tts", "ambient-cli.json"), "utf8"),
      ).resolves.toContain("ambient-piper-tts");
      expect(await readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).not.toContain(
        registered.installedPackage.id,
      );
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_unregister", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "re-registers an unregistered generated Ambient capability through Capability Builder",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder re-register dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      await unregisterCapabilityBuilderPackage(workspacePath, {
        packageName: "ambient-piper-tts",
        installedPackageId: registered.installedPackage.id,
      });

      const thread = store.createThread("Capability Builder re-register dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_capability_builder_register") {
              throw new Error(`Unexpected permission prompt during Capability Builder re-register dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop Capability Builder re-register dogfood test.",
          "Call ambient_capability_builder_register with packageName ambient-piper-tts.",
          "This package was previously unregistered but its builder source and validation metadata were preserved.",
          "Do not scaffold, install dependencies, validate, activate, run ambient_cli, use shell, or use browser tools.",
          "After the register tool completes, answer with exactly CAPABILITY_BUILDER_REREGISTER_OK and nothing else.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_REREGISTER_OK");
      expect(transcript).toContain("ambient_capability_builder_register completed");
      await expect(readFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "utf8")).resolves.toContain(
        "ambient-piper-tts",
      );
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ threadId: thread.id, toolName: "ambient_capability_builder_register", decision: "allowed" }),
        ]),
      );
    },
    240_000,
  );

  itLive(
    "discovers unregistered generated Ambient capability source through Capability Builder history",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Capability Builder history dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      const registered = await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      await unregisterCapabilityBuilderPackage(workspacePath, {
        packageName: "ambient-piper-tts",
        installedPackageId: registered.installedPackage.id,
      });

      const thread = store.createThread("Capability Builder history dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during Capability Builder history dogfood: ${request.title}`);
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
          "This is an Ambient Desktop Capability Builder history dogfood test.",
          "Call ambient_capability_builder_history with packageName ambient-piper-tts.",
          "Do not use ambient_cli_search, ambient_cli_describe, shell, browser, register, validate, unregister, or any mutating tools.",
          "After the history tool completes, answer with exactly CAPABILITY_BUILDER_HISTORY_OK and include the word unregistered.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("CAPABILITY_BUILDER_HISTORY_OK");
      expect(transcript).toContain("ambient_capability_builder_history completed");
      expect(transcript).toContain("unregistered");
      expect(transcript).not.toContain("ambient_cli_search completed");
      expect(audit).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: thread.id })]));
    },
    240_000,
  );

  itLive(
    "uses a registered generated Ambient capability through Ambient CLI search, describe, and run",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated capability Ambient CLI dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });
      await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-piper-tts" });

      const thread = store.createThread("Generated capability installed dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_cli") {
              throw new Error(`Unexpected permission prompt during generated capability Ambient CLI dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop generated capability installed-use dogfood test.",
          "Find the installed generated Ambient CLI capability by calling ambient_cli_search with query exactly Generate WAV voice files from text using Piper.",
          "Then call ambient_cli_describe with packageName ambient-piper-tts and command piper_tts.",
          "Do not run ambient_cli in this turn.",
          "After ambient_cli_describe completes, answer with exactly CAPABILITY_BUILDER_INSTALLED_DESCRIBED and nothing else.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const describeTranscript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      expect(describeTranscript).toContain("ambient_cli_search completed");
      expect(describeTranscript).toContain("ambient_cli_describe completed");
      expect(describeTranscript).toContain("CAPABILITY_BUILDER_INSTALLED_DESCRIBED");

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "Now call ambient_cli with packageName ambient-piper-tts, command piper_tts, and no args.",
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_INSTALLED_RUN_OK and include the phrase Draft capability scaffold.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("ambient_cli completed");
      expect(transcript).toContain("CAPABILITY_BUILDER_INSTALLED_RUN_OK");
      expect(transcript).toContain("Draft capability scaffold");
      expect(audit).toEqual(
        expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" })]),
      );
    },
    360_000,
  );

  itLive(
    "builds and runs a nontrivial generated WAV artifact capability",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated WAV artifact capability dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      const scaffold = await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "tone-wav",
        goal: "Generate a WAV tone artifact from text input",
        provider: "Node",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeToneWavCapability(scaffold.rootPath);
      await validateCapabilityBuilderPackage(workspacePath, { packageName: "ambient-tone-wav" });
      await registerCapabilityBuilderPackage(workspacePath, { packageName: "ambient-tone-wav" });

      const outputPath = join(workspacePath, "tone-output.wav");
      const thread = store.createThread("Generated WAV artifact capability dogfood");
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            if (request.toolName !== "ambient_cli") {
              throw new Error(`Unexpected permission prompt during generated WAV artifact dogfood: ${request.title}`);
            }
            return { allowed: true, mode: "allow_once" };
          },
          denyThread: () => undefined,
        },
      );

      await runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          "This is an Ambient Desktop generated WAV artifact capability dogfood test.",
          "Find the installed generated Ambient CLI capability by calling ambient_cli_search with query exactly WAV tone artifact.",
          "Then call ambient_cli_describe with packageName ambient-tone-wav and command tone_wav.",
          `Then call ambient_cli with packageName ambient-tone-wav, command tone_wav, and args exactly ["Codex test tone", "${outputPath}"].`,
          "After the tool result is available, answer with exactly CAPABILITY_BUILDER_ARTIFACT_OK and include the output WAV path.",
          "Do not use browser or shell tools.",
        ].join("\n"),
      });

      const transcript = store
        .listMessages(thread.id)
        .map((message) => message.content)
        .join("\n");
      const audit = store.listPermissionAudit(20);
      expect(transcript).toContain("ambient_cli_search completed");
      expect(transcript).toContain("ambient_cli_describe completed");
      expect(transcript).toContain("ambient_cli completed");
      expect(transcript).toContain("CAPABILITY_BUILDER_ARTIFACT_OK");
      expect(transcript).toContain(outputPath);
      expect((await stat(outputPath)).size).toBeGreaterThan(44);
      expect((await readFile(outputPath)).subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(audit).toEqual(
        expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" })]),
      );
    },
    360_000,
  );

  itLive(
    "dogfoods generated capability management planning prompts through live Ambient/Pi",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey)
        throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live generated capability management prompt dogfood.");
      process.env.AMBIENT_API_KEY = apiKey;
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
        provider: "Piper",
        kind: "artifact generator",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });

      const generated = {
        schemaVersion: "ambient-capability-builder-v1" as const,
        status: "registered",
        goal: "Generate WAV voice files from text using Piper",
        kind: "artifact generator",
        provider: "Piper",
        outputArtifactTypes: ["WAV"],
        sourcePath: "./.ambient/capability-builder/packages/ambient-piper-tts",
        installedPackageId: "ambient-cli:generated:ambient-piper-tts",
        installedSource: "./.ambient/cli-packages/imported/ambient-piper-tts",
        refs: { latest: "source-ref", lastRepair: "repair-ref", installed: "installed-ref", lastValidated: "validated-ref" },
      };
      runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), safeStorage),
        () => undefined,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during generated capability management prompt dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      const updateThread = store.createThread("Generated capability update planning dogfood");
      await runtime.send({
        threadId: updateThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          buildGeneratedCapabilityUpdatePlanPrompt({ packageName: "ambient-piper-tts", generated }),
          "This is a live dogfood turn for the management prompt. Call ambient_capability_builder_update_plan exactly once for the builder source path, then provide the plan.",
          "Do not call ambient_capability_builder_preview in this update-planning turn.",
          "Do not ask for approval in this dogfood turn. Do not install dependencies, edit files, validate, register, remove, activate, run ambient_cli, use shell, or use browser tools.",
          "After the update-plan result and plan are available, answer with exactly CAPABILITY_BUILDER_UPDATE_PLAN_PROMPT_OK.",
        ].join("\n"),
      });

      const updateTranscript = store
        .listMessages(updateThread.id)
        .map((message) => message.content)
        .join("\n");
      expect(updateTranscript).toContain("ambient_capability_builder_update_plan completed");
      expect(updateTranscript).toContain("CAPABILITY_BUILDER_UPDATE_PLAN_PROMPT_OK");
      expect(updateTranscript).not.toContain("bash completed");
      expect(updateTranscript).not.toContain("ambient_capability_builder_preview completed");
      expect(updateTranscript).not.toContain("ambient_capability_builder_validate completed");
      expect(updateTranscript).not.toContain("ambient_capability_builder_register completed");

      const removalThread = store.createThread("Generated capability removal planning dogfood");
      await runtime.send({
        threadId: removalThread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
        thinkingLevel: "minimal",
        content: [
          buildGeneratedCapabilityRemovalPlanPrompt({ packageName: "ambient-piper-tts", generated }),
          "This is a live dogfood turn for the removal prompt. Call ambient_capability_builder_removal_plan exactly once, then provide the safe removal plan.",
          "Do not call ambient_capability_builder_preview in this removal-planning turn.",
          "Do not ask for approval in this dogfood turn. Do not delete files, unregister, disable, edit package state, remove secrets, validate, register, activate, run ambient_cli, use shell, or use browser tools.",
          "After the plan is available, answer with exactly CAPABILITY_BUILDER_REMOVAL_PLAN_PROMPT_OK.",
        ].join("\n"),
      });

      const removalTranscript = store
        .listMessages(removalThread.id)
        .map((message) => message.content)
        .join("\n");
      expect(removalTranscript).toContain("ambient_capability_builder_removal_plan completed");
      expect(removalTranscript).toContain("CAPABILITY_BUILDER_REMOVAL_PLAN_PROMPT_OK");
      expect(removalTranscript).not.toContain("bash completed");
      expect(removalTranscript).not.toContain("ambient_capability_builder_preview completed");
      expect(removalTranscript).not.toContain("ambient_capability_builder_validate completed");
      expect(removalTranscript).not.toContain("ambient_capability_builder_register completed");
      expect(store.listPermissionAudit(20)).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: updateThread.id })]));
      expect(store.listPermissionAudit(20)).not.toEqual(expect.arrayContaining([expect.objectContaining({ threadId: removalThread.id })]));
    },
    360_000,
  );
});
