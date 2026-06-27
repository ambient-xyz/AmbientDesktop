import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { BrowserCredentialStore, BrowserService } from "./pluginsBrowserDogfoodFacade";
import { ProjectStore } from "./pluginsProjectStoreFacade";
import { runAmbientCliPackageCommand } from "./pluginsAmbientCliFacade";
import { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import {
  isolatePluginDiscoveryEnv,
  renderMiniCpmFixtureVideo,
  restoreProcessEnv,
  seedFixtureMarketplace,
  writeMiniCpmDogfoodEvidence,
} from "./pluginDogfoodTestSupport";

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR || "/tmp"}/ambient-plugin-dogfood-minicpm-electron`,
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
const itMiniCpmLive = process.env.AMBIENT_PLUGIN_CHAT_LIVE === "1" && process.env.AMBIENT_MINICPM_VISION_LIVE === "1" ? it : it.skip;

describeNative("Plugin MiniCPM-V dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-plugin-minicpm-dogfood-")));
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
  itMiniCpmLive(
    "dogfoods MiniCPM-V vision through Ambient CLI during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V Ambient CLI dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      await stat(llamaServer).catch(() => {
        throw new Error(
          `Set AMBIENT_MINICPM_V_LLAMA_SERVER to a runnable llama-server binary for live MiniCPM-V dogfood. Missing: ${llamaServer}`,
        );
      });

      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      const port = String(39_300 + Math.floor(Math.random() * 400));
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = port;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const source = join(workspacePath, "minicpm-v-package-source");
      const imageDir = join(workspacePath, "minicpm-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/main-shell-analysis.json";
      const stateDir = ".ambient/minicpm-v-dogfood-state";
      await cp(join(process.cwd(), "resources", "ambient-cli-packages", "ambient-minicpm-v-vision"), source, {
        recursive: true,
        force: true,
      });
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V Ambient CLI dogfood");
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

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V Ambient CLI package dogfood test.",
            "Use ambient_cli_package_preview with source ./minicpm-v-package-source.",
            "Then use ambient_cli_package_install with source ./minicpm-v-package-source.",
            "Preview is not installation. Wait for ambient_cli_package_install to complete successfully before answering.",
            "Do not run ambient_cli in this turn. Do not use browser or shell tools.",
            "After installation, answer with exactly MINICPM_VISION_PACKAGE_INSTALLED.",
          ].join("\n"),
        });
        const installTranscript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(installTranscript).toContain("ambient_cli_package_install completed");
        expect(installTranscript).toContain("MINICPM_VISION_PACKAGE_INSTALLED");

        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "Find the installed Ambient CLI capability for MiniCPM visual screenshot analysis by calling ambient_cli_search with query exactly MiniCPM visual screenshot analysis.",
            "Then call ambient_cli_describe with packageName ambient-minicpm-v-vision and command minicpm_vision_analyze.",
            "Do not run ambient_cli in this turn. Do not use browser or shell tools.",
            "After ambient_cli_describe completes, answer with exactly MINICPM_VISION_PACKAGE_DESCRIBED.",
          ].join("\n"),
        });
        const describeTranscript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(describeTranscript).toContain("Ambient CLI capability search");
        expect(describeTranscript).toContain("Ambient CLI capability description");
        expect(describeTranscript).toContain("MINICPM_VISION_PACKAGE_DESCRIBED");

        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "Now run the MiniCPM vision package through ambient_cli exactly in this order.",
            `First call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_start, and args ${JSON.stringify(["--state-dir", stateDir, "--wait-ms", "120000", "--offline"])}.`,
            `Second call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_analyze, and args ${JSON.stringify([
              "--state-dir",
              stateDir,
              "--image",
              "minicpm-dogfood/ambient-main-shell.png",
              "--output-json",
              artifactPath,
              "--prompt",
              "Inspect this Ambient Desktop screenshot for concrete UI evidence. Quote exact visible labels when legible and return concise valid JSON.",
            ])}.`,
            `Third call ambient_cli with packageName ambient-minicpm-v-vision, command minicpm_vision_stop, and args ${JSON.stringify(["--state-dir", stateDir])}.`,
            "After all three ambient_cli calls complete, answer with one short sentence containing MINICPM_VISION_DOGFOOD_OK and at least two exact visible labels from the MiniCPM observations.",
            "Do not use browser or shell tools. Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const transcript = store
          .listMessages(thread.id)
          .map((message) => message.content)
          .join("\n");
        expect(transcript).toContain("Command: minicpm_vision_start");
        expect(transcript).toContain("Command: minicpm_vision_analyze");
        expect(transcript).toContain("Command: minicpm_vision_stop");
        expect(transcript).toContain("MINICPM_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(`"jsonPath":"${artifactPath}"`);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");

        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
          artifacts: { previewJsonPath: artifactPath },
        });
        expect(artifact.parsedOutput.summary).toEqual(expect.any(String));
        expect(artifact.parsedOutput.observations.length).toBeGreaterThan(0);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
        const audit = store.listPermissionAudit(50);
        expect(audit).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli_package_install", decision: "allowed" }),
          ]),
        );
        expect(audit).toEqual(
          expect.arrayContaining([expect.objectContaining({ threadId: thread.id, toolName: "ambient_cli", decision: "allowed" })]),
        );
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", stateDir],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V vision through the typed Ambient visual tool during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed visual dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_700 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const imageDir = join(workspacePath, "minicpm-typed-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-main-shell-analysis.json";
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V typed visual dogfood");
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

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V typed visual tool dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            `Use imagePath exactly "minicpm-typed-dogfood/ambient-main-shell.png", task "ui_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_DOGFOOD_OK and at least two exact visible labels from the visual observations.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("MiniCPM-V visual analysis completed.");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed ambient_visual_analyze MiniCPM-V screenshot analysis",
          commands: ["ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V typed setup and analysis through the default managed runtime during a live Ambient/Pi chat turn",
    async () => {
      if (platform() !== "darwin" && platform() !== "linux") {
        throw new Error(`MiniCPM-V managed runtime dogfood is scoped to macOS/Linux, not ${platform()}.`);
      }
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V managed runtime dogfood.");

      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousEndpoint = process.env.AMBIENT_MINICPM_V_ENDPOINT;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_900 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      delete process.env.AMBIENT_MINICPM_V_ENDPOINT;
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const artifactId = platform() === "darwin" ? "llama-cpp-macos-arm64-metal" : "llama-cpp-linux-x64-vulkan-nvidia";
      const imageDir = join(workspacePath, "minicpm-managed-typed-dogfood");
      const imagePath = join(imageDir, "ambient-main-shell.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-managed-main-shell-analysis.json";
      const validationPath = join(workspacePath, ".ambient", "vision", "minicpm-v", "validation.json");
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), imagePath, { force: true });

      const thread = store.createThread("MiniCPM-V managed runtime typed visual dogfood");
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

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V default managed runtime dogfood test.",
            "First call ambient_visual_minicpm_setup exactly once.",
            `Use action "repair", installRuntime true, runtimeArtifactId exactly ${JSON.stringify(artifactId)}, validationImagePath exactly "minicpm-managed-typed-dogfood/ambient-main-shell.png", and validationTask "ui_review".`,
            "Do not provide endpointUrl, runtimeBinaryPath, or runtimeArchivePath. The setup must use the default Ambient-managed runtime download path.",
            "After setup completes, call ambient_visual_analyze exactly once.",
            `Use imagePath exactly "minicpm-managed-typed-dogfood/ambient-main-shell.png", task "ui_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After both typed visual tools complete, answer with one short sentence containing MINICPM_MANAGED_TYPED_VISION_DOGFOOD_OK and at least two exact visible labels from the visual observations.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual provider setup completed.");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_MANAGED_TYPED_VISION_DOGFOOD_OK");
        expect(transcript).toContain("New chat");
        expect(transcript).toContain("Ambient");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(imagePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const setupMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_minicpm_setup");
        expect(setupMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_minicpm_setup",
          status: "done",
        });
        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });

        const validation = JSON.parse(await readFile(validationPath, "utf8"));
        expect(validation.runtimeInstall).toMatchObject({
          status: expect.stringMatching(/installed|already-installed/),
          source: "managed-download",
          artifactId,
          archiveSha256: expect.any(String),
          binarySha256: expect.any(String),
        });
        if (platform() === "darwin") {
          expect(validation.runtimeInstall.macosSecurity).toMatchObject({
            quarantineAfter: "not-present",
            codeSignature: "valid",
            defaultDownloadPromotion: "eligible",
            promotionPolicy: expect.stringMatching(/gatekeeper-accepted|ambient-managed-valid-signature/),
          });
        }

        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed MiniCPM-V setup plus visual analysis through default managed runtime download",
          commands: ["ambient_visual_minicpm_setup", "ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
          runtimeInstall: {
            source: validation.runtimeInstall.source,
            status: validation.runtimeInstall.status,
            artifactId: validation.runtimeInstall.artifactId,
            archiveSha256: validation.runtimeInstall.archiveSha256,
            binarySha256: validation.runtimeInstall.binarySha256,
            downloadStatus: validation.runtimeInstall.downloadStatus,
            downloadBytes: validation.runtimeInstall.downloadBytes,
            macosSecurity: validation.runtimeInstall.macosSecurity,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_ENDPOINT", previousEndpoint);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    900_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V comparison through structured visual references during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V structured visual dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(39_950 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const imageDir = join(workspacePath, "minicpm-structured-dogfood");
      const currentPath = join(imageDir, "ambient-main-shell.png");
      const referencePath = join(imageDir, "ambient-project-board.png");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-comparison-analysis.json";
      await mkdir(imageDir, { recursive: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), currentPath, { force: true });
      await cp(join(process.cwd(), "test", "visual-baselines", "01a-project-board.png"), referencePath, { force: true });

      const thread = store.createThread("MiniCPM-V structured visual comparison dogfood");
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

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V structured visual comparison dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            "Use the structured image object and referenceImage object. Do not use imagePath or referenceImagePath.",
            `Use image {"path":"minicpm-structured-dogfood/ambient-main-shell.png","source":"browser_screenshot","label":"current main shell"}.`,
            `Use referenceImage {"path":"minicpm-structured-dogfood/ambient-project-board.png","source":"chat_attachment","label":"reference project board"}.`,
            `Use task "design_comparison", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "Do not call ambient_cli, ambient_cli_search, ambient_cli_describe, shell, browser, or file tools.",
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_COMPARISON_OK and mention that two visual inputs were compared.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_COMPARISON_OK");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(currentPath);
        expect(transcript).not.toContain(referencePath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("Reference image: minicpm-structured-dogfood/ambient-project-board.png");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.images).toHaveLength(2);
        expect(artifact.request.messages[0].content).toHaveLength(3);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        expect(artifact.request.messages[0].content[2].image_url.url).toContain("<redacted sha256:");
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );

  itMiniCpmLive(
    "dogfoods MiniCPM-V sampled video frames through the typed Ambient visual tool during a live Ambient/Pi chat turn",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live MiniCPM-V typed video dogfood.");
      const llamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER || "/Users/example/RCLI/deps/llama.cpp/build/bin/llama-server";
      const previousApiKey = process.env.AMBIENT_API_KEY;
      const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      const previousPort = process.env.AMBIENT_MINICPM_V_PORT;
      process.env.AMBIENT_API_KEY = apiKey;
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = llamaServer;
      process.env.AMBIENT_MINICPM_V_PORT = String(40_150 + Math.floor(Math.random() * 200));
      delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;

      const videoDir = join(workspacePath, "minicpm-video-dogfood");
      const videoPath = join(videoDir, "ambient-main-shell.mp4");
      const artifactPath = ".ambient/minicpm-v-dogfood/typed-video-frame-analysis.json";
      await mkdir(videoDir, { recursive: true });
      await renderMiniCpmFixtureVideo(join(process.cwd(), "test", "visual-baselines", "01-main-shell.png"), videoPath);

      const thread = store.createThread("MiniCPM-V typed video frame dogfood");
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

      try {
        await runtime.send({
          threadId: thread.id,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
          thinkingLevel: "minimal",
          content: [
            "This is an Ambient Desktop MiniCPM-V typed visual tool video-frame dogfood test.",
            "Call ambient_visual_analyze exactly once.",
            "Use the structured video object. Do not use imagePath, videoPath, ambient_cli, shell, browser, or file tools.",
            `Use video {"path":"minicpm-video-dogfood/ambient-main-shell.mp4","source":"media_artifact","label":"main shell clip","frameTimestampMs":500}.`,
            `Use task "video_frame_review", outputJsonPath exactly ${JSON.stringify(artifactPath)}, and offline true.`,
            "After ambient_visual_analyze completes, answer with one short sentence containing MINICPM_TYPED_VISION_VIDEO_FRAME_OK and mention that a sampled video frame was inspected.",
            "Do not include any local filesystem path in the final answer.",
          ].join("\n"),
        });

        const messages = store.listMessages(thread.id);
        const transcript = messages.map((message) => message.content).join("\n");
        expect(transcript).toContain("MiniCPM-V visual analysis completed.");
        expect(transcript).toContain("MINICPM_TYPED_VISION_VIDEO_FRAME_OK");
        expect(transcript).toContain(artifactPath);
        expect(transcript).not.toContain(videoPath);
        expect(transcript).not.toContain("data:image/png;base64");
        expect(transcript).not.toContain("Command: minicpm_vision_analyze");

        const visualMessage = messages.find((message) => message.metadata?.toolName === "ambient_visual_analyze");
        expect(visualMessage?.metadata).toMatchObject({
          toolName: "ambient_visual_analyze",
          status: "done",
        });
        expect(visualMessage?.content).toContain("Video: minicpm-video-dogfood/ambient-main-shell.mp4");
        expect(visualMessage?.content).toContain("frame 500ms");
        const artifact = JSON.parse(await readFile(join(workspacePath, artifactPath), "utf8"));
        expect(artifact).toMatchObject({
          status: "passed",
          model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
          schemaValidation: { valid: true },
        });
        expect(artifact.images).toHaveLength(1);
        expect(artifact.request.messages[0].content[1].image_url.url).toContain("<redacted sha256:");
        await writeMiniCpmDogfoodEvidence({
          scenario: "live Ambient/Pi typed ambient_visual_analyze MiniCPM-V sampled video frame analysis",
          commands: ["ambient_visual_analyze"],
          model: artifact.model,
          durationMs: artifact.latencyMs,
          summary: artifact.parsedOutput.summary,
          observations: artifact.parsedOutput.observations,
          limitations: artifact.parsedOutput.limitations,
          artifactPath: artifact.artifacts.previewJsonPath,
          image: {
            basename: artifact.image.basename,
            bytes: artifact.image.bytes,
            sha256: artifact.image.sha256,
          },
        });
      } finally {
        await runAmbientCliPackageCommand(workspacePath, {
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_stop",
          args: ["--state-dir", ".ambient/vision/minicpm-v/state"],
        }).catch(() => undefined);
        restoreProcessEnv("AMBIENT_API_KEY", previousApiKey);
        restoreProcessEnv("AMBIENT_MINICPM_V_LLAMA_SERVER", previousLlamaServer);
        restoreProcessEnv("AMBIENT_MINICPM_V_FAKE_ANALYSIS", previousFakeAnalysis);
        restoreProcessEnv("AMBIENT_MINICPM_V_PORT", previousPort);
      }
    },
    720_000,
  );
});
