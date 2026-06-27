import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { VoiceSettings } from "../../shared/localRuntimeTypes";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import { scaffoldCapabilityBuilderPackage } from "./pluginsCapabilityBuilderDogfoodFacade";
import { readDogfoodFilePath } from "./pluginCapabilityBuilderDogfoodFixtures";
import { ProjectStore } from "./pluginsProjectStoreFacade";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-capability-setup-planning-dogfood-electron`,
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

describeNative("Capability Builder setup and planning dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-capability-setup-planning-dogfood-")));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
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
});
