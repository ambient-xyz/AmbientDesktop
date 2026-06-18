import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "../agent-runtime/agentRuntime";
import { ensureFirstPartyAmbientCliPackages } from "./ambientCliPackages";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "../ambient/liveAmbientProviderConfig";
import { ProjectStore } from "../projectStore/projectStore";

const itLive = process.env.AMBIENT_TINYSTYLER_LIVE === "1" ? it : it.skip;
const kimiModel = "moonshotai/kimi-k2.7-code";
const degradedLiveModelPattern = /(?:zai-org\/)?glm[-_. ]?5\.1/i;

describe("TinyStyler Ambient CLI live Pi dogfood", () => {
  let workspacePath = "";
  let store: ProjectStore | undefined;
  let runtime: AgentRuntime | undefined;
  let restoreEnv: (() => void) | undefined;
  let ambientCliApprovals = 0;

  beforeEach(async () => {
    workspacePath = await realpath(await mkdtemp(join(tmpdir(), "ambient-tinystyler-live-")));
    restoreEnv = configureTinyStylerLiveEnv(workspacePath);
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });
    store.setModelRuntimeSettings({
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
    });
    const installStatuses = await ensureFirstPartyAmbientCliPackages(workspacePath, {
      packageNames: ["ambient-tinystyler"],
    });
    expect(installStatuses).toEqual([
      expect.objectContaining({
        packageName: "ambient-tinystyler",
        status: expect.stringMatching(/^(installed|already_installed)$/),
      }),
    ]);
    ambientCliApprovals = 0;
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        if (request.toolName === "ambient_cli") {
          ambientCliApprovals += 1;
          return { allowed: true, mode: "allow_once" };
        }
        throw new Error(`Unexpected permission request during TinyStyler live dogfood: ${request.toolName}`);
      },
      denyThread: () => undefined,
    }, {
      ambientCli: { autoInstallFirstParty: false },
    });
  });

  afterEach(async () => {
    await runtime?.shutdownPluginMcpServers();
    runtime = undefined;
    store?.close();
    store = undefined;
    restoreEnv?.();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("uses search, describe, profile, and transfer from a fresh Pi turn", async () => {
    expect(liveAmbientProviderLabel()).toBe("Ambient");
    const examplesPath = "tinystyler-live/examples.txt";
    const sourcePath = "tinystyler-live/source.txt";
    const profilePath = "tinystyler-live/profile.json";
    const outputPath = "tinystyler-live/styled.txt";
    await mkdir(join(workspacePath, "tinystyler-live"), { recursive: true });
    await writeFile(
      join(workspacePath, examplesPath),
      [
        "Thanks for the thoughtful report. I can help untangle this carefully.",
        "",
        "Let's keep the next step crisp, kind, and grounded in evidence.",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(workspacePath, sourcePath), "Please review the latest logs and summarize the next action.\n", "utf8");

    const thread = store!.createThread("TinyStyler Ambient CLI live smoke");
    const prompt = [
      "This is a live Ambient Desktop TinyStyler Ambient CLI smoke test.",
      "The direct Ambient CLI tools may not be active at the start of the turn.",
      "If ambient_cli_search is not active, call ambient_tool_describe exactly once with name ambient_cli_search to activate the Ambient CLI bundle. Do not call ambient_tool_search.",
      "Then run the logical ambient_cli_search for TinyStyler style profile rewrite. Use direct ambient_cli_search if active; otherwise call ambient_tool_call with toolName ambient_cli_search and toolInput {\"query\":\"TinyStyler style profile rewrite\"}.",
      "Then run the logical ambient_cli_describe for packageName ambient-tinystyler and command tinystyler_profile. Use direct ambient_cli_describe if active; otherwise call ambient_tool_call with toolName ambient_cli_describe and toolInput {\"packageName\":\"ambient-tinystyler\",\"command\":\"tinystyler_profile\"}.",
      "Then run the logical ambient_cli for packageName ambient-tinystyler command tinystyler_profile with args exactly:",
      JSON.stringify(["--examples-file", examplesPath, "--output-profile", profilePath, "--profile-name", "support-replies", "--fake", "--json", "--seed", "17"]),
      "Use direct ambient_cli if active; otherwise call ambient_tool_call with toolName ambient_cli and toolInput containing packageName, command, and args.",
      "Then run the logical ambient_cli for packageName ambient-tinystyler command tinystyler_transfer with args exactly:",
      JSON.stringify(["--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--fake", "--json", "--seed", "17"]),
      "Use direct ambient_cli if active; otherwise call ambient_tool_call with toolName ambient_cli and toolInput containing packageName, command, and args.",
      "Do not read the source or example files into chat. Do not use shell, browser, filesystem, plugin install, MCP, connector, ambient_tool_search, or any tools except ambient_tool_describe for exact-name bootstrap, ambient_tool_call for exact Ambient CLI tool routing, and the three Ambient CLI tools named above.",
      "After both TinyStyler commands complete, answer exactly TINYSTYLER_AMBIENT_CLI_LIVE_OK and include the profile path and output path only.",
    ].join("\n");

    await sendWithTimeout({
      runtime: runtime!,
      store: store!,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_TINYSTYLER_LIVE_TIMEOUT_MS ?? 240_000),
      send: runtime!.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({
          preferredModelEnvNames: ["AMBIENT_TINYSTYLER_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
          fallbackModel: AMBIENT_DEFAULT_MODEL,
        }),
        thinkingLevel: "minimal",
        content: prompt,
      }),
    });

    await waitForWorkspaceFile(store!, thread.id, profilePath, 30_000);
    await waitForWorkspaceFile(store!, thread.id, outputPath, 30_000);
    const profile = JSON.parse(await readFile(join(workspacePath, profilePath), "utf8"));
    const outputText = await readFile(join(workspacePath, outputPath), "utf8");
    const transcript = threadTranscript(store!, thread.id);
    const toolNames = threadToolNames(store!, thread.id);
    const firstSearch = toolNames.indexOf("ambient_cli_search");
    const firstDescribe = toolNames.indexOf("ambient_cli_describe");
    const cliRuns = toolNames.filter((toolName) => toolName === "ambient_cli").length;
    const logicalSearchObserved = firstSearch >= 0 || transcript.includes("Ambient CLI capability search");
    const logicalDescribeObserved = firstDescribe >= 0 || transcript.includes("Ambient CLI capability description");
    const logicalCliRuns = cliRuns || (transcript.match(/Ambient CLI completed/g) ?? []).length;
    const allowedToolNames = new Set(["ambient_tool_describe", "ambient_tool_call", "ambient_cli_search", "ambient_cli_describe", "ambient_cli"]);
    const forbiddenToolNames = toolNames.filter((toolName) => !allowedToolNames.has(toolName));

    expect(logicalSearchObserved).toBe(true);
    expect(logicalDescribeObserved).toBe(true);
    if (firstSearch >= 0 && firstDescribe >= 0) expect(firstDescribe).toBeGreaterThan(firstSearch);
    expect(logicalCliRuns).toBeGreaterThanOrEqual(2);
    expect(ambientCliApprovals).toBeGreaterThanOrEqual(2);
    expect(forbiddenToolNames).toEqual([]);
    expect(profile).toMatchObject({
      schemaVersion: "ambient.tinystyler.profile.v1",
      profileName: "support-replies",
      sourceSummary: {
        exampleCount: 2,
        rawTextPersisted: false,
        exactSourceVerifiersPersisted: false,
      },
      createdWith: {
        runtimeMode: "fake",
      },
    });
    expect(profile.embedding.values).toHaveLength(768);
    expect(profile.sourceSummary).not.toHaveProperty("sourceExamples");
    expect(outputText).toContain("support-replies style transfer");
    expect(outputText).toContain("Please review the latest logs");
    expect(transcript).toContain("TINYSTYLER_AMBIENT_CLI_LIVE_OK");
    expect(transcript).toContain(profilePath);
    expect(transcript).toContain(outputPath);
    expect(transcript).not.toContain("thoughtful report");
    expect(transcript).not.toContain("latest logs and summarize");
    expect(transcript).not.toMatch(/\b(?:bash|shell|file_read|browser_nav|browser_content|ambient_cli_package_install) completed\b/i);

    await writeEvidenceReport({
      workspacePath,
      threadId: thread.id,
      provider: liveAmbientProviderLabel(),
      model: liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_TINYSTYLER_LIVE_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      }),
      toolNames,
      profilePath,
      outputPath,
      outputText,
      transcript,
      profile,
    });
  }, Number(process.env.AMBIENT_TINYSTYLER_LIVE_TEST_TIMEOUT_MS ?? 300_000));
});

function configureTinyStylerLiveEnv(workspacePath: string): () => void {
  const keys = [
    "AMBIENT_PROVIDER",
    "AMBIENT_TINYSTYLER_LIVE_MODEL",
    "AMBIENT_LIVE_MODEL",
    "AMBIENT_TINYSTYLER_FAKE_RUNTIME",
    "AMBIENT_PI_PACKAGE_GALLERY_DISABLED",
    "AMBIENT_PI_USER_SETTINGS_PATH",
    "AMBIENT_PI_GLOBAL_PACKAGES_PATH",
    "AMBIENT_API_KEY",
    "AMBIENT_AGENT_AMBIENT_API_KEY",
  ] as const;
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const requestedModel = process.env.AMBIENT_TINYSTYLER_LIVE_MODEL || kimiModel;
    if (degradedLiveModelPattern.test(requestedModel)) {
      throw new Error(`TinyStyler live dogfood must not use degraded GLM 5.1 model ${requestedModel}.`);
    }
    process.env.AMBIENT_PROVIDER = "ambient";
    process.env.AMBIENT_TINYSTYLER_LIVE_MODEL = requestedModel;
    process.env.AMBIENT_LIVE_MODEL = requestedModel;
    process.env.AMBIENT_TINYSTYLER_FAKE_RUNTIME = "1";
    process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
    process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(workspacePath, ".ambient-test-missing-pi-settings.json");
    process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(workspacePath, ".ambient-test-missing-pi-packages.json");
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "TinyStyler Ambient CLI live dogfood" }));
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  store: ProjectStore;
  threadId: string;
  send: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void input.runtime.abort(input.threadId).catch(() => undefined);
      reject(new Error(`TinyStyler live dogfood timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function writeEvidenceReport(input: {
  workspacePath: string;
  threadId: string;
  provider: string;
  model: string;
  toolNames: string[];
  profilePath: string;
  outputPath: string;
  outputText: string;
  transcript: string;
  profile: Record<string, any>;
}): Promise<void> {
  const reportRoot = join(process.cwd(), "test-results", "tinystyler-live-dogfood");
  const report = {
    schemaVersion: "ambient-tinystyler-live-dogfood-evidence-v1",
    createdAt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    workspacePath: input.workspacePath,
    threadId: input.threadId,
    toolNames: input.toolNames,
    profilePath: input.profilePath,
    outputPath: input.outputPath,
    profile: {
      schemaVersion: input.profile.schemaVersion,
      profileName: input.profile.profileName,
      runtimeMode: input.profile.createdWith?.runtimeMode,
      rawTextPersisted: input.profile.sourceSummary?.rawTextPersisted,
      exactSourceVerifiersPersisted: input.profile.sourceSummary?.exactSourceVerifiersPersisted,
      embeddingDimension: input.profile.embedding?.dimension,
    },
    output: {
      bytes: Buffer.byteLength(input.outputText, "utf8"),
      sha256: createHash("sha256").update(input.outputText).digest("hex"),
      boundedPreview: input.outputText.slice(0, 160),
      previewTruncated: input.outputText.length > 160,
    },
    transcript: {
      chars: input.transcript.length,
      containsFinalToken: input.transcript.includes("TINYSTYLER_AMBIENT_CLI_LIVE_OK"),
      rawExamplesLeaked: input.transcript.includes("thoughtful report"),
    },
  };
  await mkdir(reportRoot, { recursive: true });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(join(reportRoot, "latest.json"), serialized, "utf8");
  await writeFile(join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), serialized, "utf8");
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 1000)}`)
    .join("\n\n");
}

async function waitForWorkspaceFile(store: ProjectStore, threadId: string, relativePath: string, timeoutMs: number): Promise<void> {
  const absolutePath = join(store.getWorkspace().path, relativePath);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(absolutePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Expected TinyStyler artifact was not created: ${relativePath}\n${summarizeThread(store, threadId)}`);
}
