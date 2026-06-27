import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { buildGeneratedCapabilityRemovalPlanPrompt, buildGeneratedCapabilityUpdatePlanPrompt } from "../../renderer/src/pluginUiModel";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import {
  registerCapabilityBuilderPackage,
  scaffoldCapabilityBuilderPackage,
  unregisterCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "./pluginsCapabilityBuilderDogfoodFacade";
import { writeToneWavCapability } from "./pluginCapabilityBuilderDogfoodFixtures";
import { ProjectStore } from "./pluginsProjectStoreFacade";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-capability-lifecycle-dogfood-electron`,
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

describeNative("Capability Builder generated lifecycle dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-capability-lifecycle-dogfood-")));
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
