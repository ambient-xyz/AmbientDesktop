import { execFile } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { expect } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { CodexPluginSummary } from "../../shared/pluginTypes";
import { AmbientPluginHost, codexPluginTrustFingerprint } from "./pluginHost";
import type { AgentRuntime } from "./pluginsAgentRuntimeDogfoodFacade";
import type { ProjectStore } from "./pluginsProjectStoreFacade";

const execFileAsync = promisify(execFile);

export async function seedFixtureMarketplace(workspacePath: string): Promise<void> {
  const pluginRoot = join(workspacePath, "plugins", "ambient-fixture");
  await mkdir(dirname(pluginRoot), { recursive: true });
  await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
  const marketplacePath = join(workspacePath, ".agents", "plugins", "marketplace.json");
  await mkdir(dirname(marketplacePath), { recursive: true });
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "ambient-plugin-dogfood",
        interface: { displayName: "Ambient Plugin Dogfood" },
        plugins: [
          {
            name: "ambient-fixture",
            source: { source: "local", path: "./plugins/ambient-fixture" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function trustFixturePlugin(store: ProjectStore, workspacePath: string): Promise<CodexPluginSummary> {
  const host = new AmbientPluginHost();
  const catalog = await host.readCodexPluginCatalog(workspacePath, pluginStateReader(store));
  const fixture = catalog.plugins.find((plugin) => plugin.name === "ambient-fixture");
  if (!fixture) throw new Error("Fixture Codex plugin was not discovered.");
  store.setPluginTrusted(fixture.id, true, codexPluginTrustFingerprint(fixture));
  return { ...fixture, trusted: true };
}

export async function seedSelfInstallMarketplace(workspacePath: string): Promise<{ marketplacePath: string; sourceSha: string }> {
  const repo = join(workspacePath, "self-install-source");
  const pluginRoot = join(repo, "plugins", "ambient-fixture");
  await mkdir(dirname(pluginRoot), { recursive: true });
  await cp(join(process.cwd(), "plugins", "ambient-fixture"), pluginRoot, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: repo });
  await execFileAsync("git", ["add", "."], { cwd: repo });
  await execFileAsync(
    "git",
    ["-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "seed self-install plugin"],
    {
      cwd: repo,
    },
  );
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
  const sourceSha = String(stdout).trim();
  const marketplacePath = join(workspacePath, "self-install-marketplace.json");
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "ambient-self-install-dogfood",
        interface: { displayName: "Ambient Self Install Dogfood" },
        plugins: [
          {
            name: "ambient-fixture",
            version: "0.1.0",
            description: "Self-install dogfood fixture.",
            source: { source: "git-subdir", url: repo, path: "./plugins/ambient-fixture", sha: sourceSha },
            category: "Productivity",
            interface: {
              displayName: "Ambient Fixture",
              shortDescription: "Exercises self-install and MCP activation.",
              category: "Productivity",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { marketplacePath, sourceSha };
}

export async function seedAmbientCliFixture(workspacePath: string): Promise<void> {
  const root = join(workspacePath, "cli-fixture");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "skills", "json-cli"), { recursive: true });
  await writeFile(
    join(root, "ambient-cli.json"),
    `${JSON.stringify(
      {
        name: "ambient-json-cli",
        version: "0.1.0",
        description: "Fixture JSON CLI package.",
        skills: "./skills",
        commands: {
          "json-pick": {
            command: "node",
            args: ["./bin/json-pick.mjs"],
            cwd: "workspace",
            description: "Print a top-level JSON field.",
            healthCheck: ["node", "./bin/json-pick.mjs", "health.json", "message"],
          },
          "echo-arg": {
            command: "node",
            args: ["./bin/echo-arg.mjs"],
            cwd: "workspace",
            description: "Print the length of a supplied text argument without echoing the whole value.",
            healthCheck: ["node", "./bin/echo-arg.mjs", "--text", "healthy"],
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "bin", "json-pick.mjs"),
    [
      "import { readFileSync } from 'node:fs';",
      "const [file, key] = process.argv.slice(2);",
      "const value = JSON.parse(readFileSync(file, 'utf8'))[key];",
      "process.stdout.write(String(value));",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "bin", "echo-arg.mjs"),
    [
      "const args = process.argv.slice(2);",
      "const textFlagIndex = args.indexOf('--text');",
      "const text = textFlagIndex >= 0 ? args[textFlagIndex + 1] ?? '' : args[0] ?? '';",
      "process.stdout.write(`ECHO_ARG_LENGTH=${text.length}\\n`);",
      "process.stdout.write(`ECHO_ARG_PREFIX=${text.slice(0, 32)}\\n`);",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(root, "health.json"), `${JSON.stringify({ message: "healthy" })}\n`, "utf8");
  await writeFile(
    join(root, "skills", "json-cli", "SKILL.md"),
    [
      "---",
      "name: ambient-json-cli",
      "description: Use ambient_cli packageName ambient-json-cli command json-pick to extract a top-level JSON field.",
      "---",
      "",
      "Use ambient_cli with packageName ambient-json-cli and command json-pick.",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function sendDogfoodTurn(
  runtime: AgentRuntime,
  store: ProjectStore,
  threadId: string,
  input: {
    content: string | string[];
    expected: string;
    mode?: "agent" | "planner";
  },
): Promise<string> {
  await runtime.send({
    threadId,
    permissionMode: "workspace",
    collaborationMode: input.mode ?? "agent",
    model: process.env.AMBIENT_PLUGIN_CHAT_MODEL ?? AMBIENT_DEFAULT_MODEL,
    thinkingLevel: "minimal",
    content: Array.isArray(input.content) ? input.content.join("\n") : input.content,
  });
  const transcript = store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n");
  expect(transcript).toContain(input.expected);
  return transcript;
}

export async function writeMiniCpmDogfoodEvidence(input: {
  scenario?: string;
  commands?: string[];
  model: string;
  durationMs: number;
  summary: string;
  observations: unknown[];
  limitations: unknown[];
  artifactPath: string;
  image: { basename: string; bytes: number; sha256: string };
  runtimeInstall?: unknown;
}): Promise<void> {
  const evidenceRoot = join(process.cwd(), "test-results", "minicpm-v", "pi-dogfood");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    status: "passed",
    scenario: input.scenario ?? "live Ambient/Pi mediated ambient_cli MiniCPM-V screenshot analysis",
    createdAt: new Date().toISOString(),
    model: input.model,
    durationMs: input.durationMs,
    packageName: "ambient-minicpm-v-vision",
    commands: input.commands ?? ["minicpm_vision_start", "minicpm_vision_analyze", "minicpm_vision_stop"],
    artifactPath: input.artifactPath,
    image: input.image,
    ...(input.runtimeInstall ? { runtimeInstall: input.runtimeInstall } : {}),
    parsedOutput: {
      summary: input.summary,
      observations: input.observations,
      limitations: input.limitations,
    },
    redactionChecks: {
      imageBytesRedactedFromRequest: true,
      piVisibleArtifactPathIsWorkspaceRelative: !input.artifactPath.startsWith("/"),
    },
  };
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(evidenceRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function renderMiniCpmFixtureVideo(imagePath: string, videoPath: string): Promise<void> {
  const attempts = [
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "libx264", videoPath],
    ["-y", "-loop", "1", "-t", "1", "-i", imagePath, "-vf", "format=yuv420p", "-c:v", "mpeg4", videoPath],
  ];
  const errors: string[] = [];
  for (const args of attempts) {
    try {
      await execFileAsync("ffmpeg", args, { timeout: 60_000 });
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Unable to render MiniCPM-V video fixture with ffmpeg:\n${errors.join("\n---\n")}`);
}

export function pluginStateReader(store: ProjectStore) {
  return {
    isPluginEnabled: (pluginId: string) => store.isPluginEnabled(pluginId),
    isPluginTrusted: (pluginId: string, fingerprint?: string) => store.isPluginTrusted(pluginId, fingerprint),
  };
}

export function braveSearchDogfoodDescriptor(): Record<string, unknown> {
  return {
    name: "brave-search",
    version: "1.0.0",
    description: "Reviewed Brave Search CLI package.",
    skills: "./SKILL.md",
    env: [{ name: "BRAVE_API_KEY", description: "Brave Search API key.", required: true }],
    commands: {
      search: {
        command: "node",
        args: ["./search.js"],
        cwd: "package",
        description: "Search the web via Brave Search.",
        healthCheck: ["node", "--check", "./search.js"],
      },
    },
  };
}

export async function readDogfoodSecret(envName: string, fileName: string): Promise<string> {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const fileFromEnv = process.env[`${envName}_FILE`]?.trim();
  if (fileFromEnv) {
    const fromEnvFile = (await readFile(fileFromEnv, "utf8")).trim();
    if (!fromEnvFile) throw new Error(`${envName}_FILE points to an empty file.`);
    return fromEnvFile;
  }
  const fromFile = (await readFile(join(process.cwd(), fileName), "utf8")).trim();
  if (!fromFile) throw new Error(`${fileName} is empty.`);
  return fromFile;
}

export function restoreOptionalEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

export function isolatePluginDiscoveryEnv(workspacePath: string): () => void {
  const keys = [
    "AMBIENT_CODEX_PLUGIN_CACHE",
    "AMBIENT_CODEX_CURATED_MARKETPLACE_PATH",
    "AMBIENT_CODEX_CURATED_MARKETPLACE_URL",
    "AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH",
    "AMBIENT_CODEX_REMOTE_MARKETPLACE_URL",
    "AMBIENT_CODEX_REMOTE_MARKETPLACES",
    "AMBIENT_PI_PACKAGE_GALLERY_DISABLED",
    "AMBIENT_PI_USER_SETTINGS_PATH",
    "AMBIENT_PI_GLOBAL_PACKAGES_PATH",
  ] as const;
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, process.env[key]]));
  process.env.AMBIENT_CODEX_PLUGIN_CACHE = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH = "0";
  process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL = "0";
  process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES = "0";
  process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED = "1";
  process.env.AMBIENT_PI_USER_SETTINGS_PATH = join(workspacePath, ".ambient-test-missing-pi-settings.json");
  process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH = join(workspacePath, ".ambient-test-missing-pi-packages.json");

  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

export function restoreProcessEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
