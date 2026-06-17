import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { McpInstallCatalog } from "../mcp/mcpInstallCatalog";
import {
  mcpAutowireSixPackCandidateForId,
  mcpAutowireSixPackManagedLifecycleCandidateForId,
  mcpAutowireSixPackTargetIds,
  type McpAutowireSixPackTargetId,
} from "./mcpAutowireSixPackFixtures";
import { createMcpServerPiToolDefinitions } from "../mcp/mcpServerPiTools";
import { resolveOrExtractToolHiveExecutable } from "../tool-runtime/toolHiveBundle";
import { ToolHiveRuntimeService } from "../tool-runtime/toolHiveRuntimeService";

const execFileAsync = promisify(execFile);
const runLive = process.env.AMBIENT_MCP_AUTOWIRE_SIX_PACK_TOOLHIVE_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const defaultLiveTargets: McpAutowireSixPackTargetId[] = ["a2asearch"];

describe("MCP Autowire six-pack ToolHive live", () => {
  liveIt(
    "installs selected six-pack candidates as real Ambient-managed ToolHive workloads and removes them",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ambient-mcp-autowire-six-pack-toolhive-live-"));
      const userDataPath = join(root, "userData");
      const workspacePath = join(root, "workspace");
      await mkdir(userDataPath, { recursive: true });
      await mkdir(workspacePath, { recursive: true });
      const thv = process.env.AMBIENT_TOOLHIVE_BINARY || (await resolveOrExtractToolHiveExecutable({
        resourcesPath: join(process.cwd(), "resources"),
        extractionRoot: join(root, "toolhive-extracted"),
      })).executablePath;
      const toolHive = new ToolHiveRuntimeService({
        userDataPath,
        env: {
          ...process.env,
          AMBIENT_TOOLHIVE_BINARY: thv,
        },
        timeoutMs: 300_000,
      });
      const catalog = new McpInstallCatalog(toolHive);
      const tools = createMcpServerPiToolDefinitions({
        catalog,
        toolHive,
        getThread: () => ({
          id: "mcp-autowire-six-pack-toolhive-live-thread",
          collaborationMode: "agent",
          permissionMode: "workspace",
        }),
        workspace: {
          path: workspacePath,
          name: "workspace",
        },
        authorizeInstall: () => true,
        authorizeUninstall: () => true,
      });
      const install = toolByName(tools, "ambient_mcp_standard_import_install");
      const list = toolByName(tools, "ambient_mcp_server_list");
      const uninstall = toolByName(tools, "ambient_mcp_server_uninstall");

      try {
        const preflight = await toolHive.preflightRuntime(10);
        expect(preflight.ok, preflight.message).toBe(true);

        for (const targetId of selectedLiveTargetIds()) {
          const candidate = await liveCandidateForTarget({
            targetId,
            root,
            toolHive,
          });
          const preview = await catalog.previewStandardMcpImport({ candidate });
          expect(preview.review.blockers).toEqual([]);
          expect(preview.runPlan?.workloadName).toBeTruthy();
          if (!preview.runPlan) throw new Error(`No ToolHive run plan for ${targetId}.`);
          await cleanupWorkload(toolHive, preview.runPlan.workloadName);

          try {
            const installResult = await executePiTool(install, `install-${targetId}`, { candidate });
            expect(toolText(installResult)).toContain(`MCP server ${candidate.id} is ready.`);
            expect(installResult.details).toMatchObject({
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_standard_import_install",
              status: "ready",
              serverId: candidate.id,
              workloadName: preview.runPlan.workloadName,
              installValidationStatus: "ready",
            });
            expect(Number(installResult.details?.toolCount ?? 0)).toBeGreaterThan(0);

            const restartedCatalog = new McpInstallCatalog(new ToolHiveRuntimeService({
              userDataPath,
              env: {
                ...process.env,
                AMBIENT_TOOLHIVE_BINARY: thv,
              },
              timeoutMs: 300_000,
            }));
            const installedAfterRestart = await restartedCatalog.listInstalledServers();
            expect(installedAfterRestart).toEqual(expect.arrayContaining([
              expect.objectContaining({
                serverId: candidate.id,
                workloadName: preview.runPlan.workloadName,
                runtimeLane: "standard-mcp-import",
                workloadStatus: "running",
                installValidationStatus: "ready",
                lastKnownToolCount: expect.any(Number),
              }),
            ]));

            const listResult = await executePiTool(list, `list-${targetId}`, {});
            expect(toolText(listResult)).toContain(candidate.id);
          } finally {
            await executePiTool(uninstall, `uninstall-${targetId}`, { serverId: candidate.id }).catch(() => undefined);
            await cleanupWorkload(toolHive, preview.runPlan.workloadName);
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    12 * 60_000,
  );
});

function selectedLiveTargetIds(): McpAutowireSixPackTargetId[] {
  const raw = process.env.AMBIENT_MCP_AUTOWIRE_SIX_PACK_TOOLHIVE_TARGETS?.trim();
  const selected = !raw ? defaultLiveTargets : raw === "all"
    ? [...mcpAutowireSixPackTargetIds]
    : raw.split(",").map((entry) => entry.trim()).filter(Boolean) as McpAutowireSixPackTargetId[];
  const known = new Set(mcpAutowireSixPackTargetIds);
  for (const targetId of selected) {
    if (!known.has(targetId)) throw new Error(`Unknown six-pack ToolHive live target ${targetId}. Known targets: ${mcpAutowireSixPackTargetIds.join(", ")}`);
    if (targetId === "sqlite-explorer-fastmcp" && process.env.AMBIENT_MCP_AUTOWIRE_SIX_PACK_TOOLHIVE_CUSTOM_IMAGE_LIVE !== "1") {
      throw new Error("SQLite Explorer FastMCP builds a reviewed custom-image artifact during the live gate; set AMBIENT_MCP_AUTOWIRE_SIX_PACK_TOOLHIVE_CUSTOM_IMAGE_LIVE=1 to allow that local ToolHive build.");
    }
  }
  return selected;
}

async function liveCandidateForTarget(input: {
  targetId: McpAutowireSixPackTargetId;
  root: string;
  toolHive: ToolHiveRuntimeService;
}) {
  if (input.targetId !== "sqlite-explorer-fastmcp") return mcpAutowireSixPackCandidateForId(input.targetId);
  return prepareSqliteExplorerLiveCandidate(input.root, input.toolHive);
}

async function prepareSqliteExplorerLiveCandidate(root: string, toolHive: ToolHiveRuntimeService) {
  const sourceUrl = "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server";
  const resolvedCommit = await resolveGitCommit(sourceUrl, "refs/heads/main");
  const shortCommit = resolvedCommit.slice(0, 7);
  const imageIdentifier = `ambient-source-built/sqlite-explorer-fastmcp:${shortCommit}`;
  const sourceDir = join(root, "sqlite-source", resolvedCommit);
  const dataDir = join(root, "sqlite-data", resolvedCommit);
  await mkdir(sourceDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const sourcePath = join(sourceDir, "sqlite_explorer.py");
  const databasePath = join(dataDir, "test.db");
  await writeFile(sourcePath, await readGitHubText(`${sourceUrl}/raw/${resolvedCommit}/sqlite_explorer.py`), "utf8");
  await createSqliteFixtureDatabase(databasePath);

  await toolHive.buildProtocolImage({
    sourceRef: "uvx://fastmcp@0.4.1",
    tag: imageIdentifier,
    serverArgs: ["run", "/app/sqlite_explorer.py:mcp", "--transport", "stdio"],
  });
  const imageDigest = await localContainerImageId(imageIdentifier);
  const recipeHash = createHash("sha256").update(JSON.stringify({
    sourceUrl,
    resolvedCommit,
    imageIdentifier,
    recipe: {
      kind: "existing-reviewed-image",
      runtimeCommand: "fastmcp run /app/sqlite_explorer.py:mcp --transport stdio",
      runtimeEnv: [{ name: "SQLITE_DB_PATH", value: "/data/test.db" }],
      volumes: [
        { path: sourcePath, containerPath: "/app/sqlite_explorer.py", mode: "read-only" },
        { path: dataDir, containerPath: "/data", mode: "read-only" },
      ],
    },
  })).digest("hex");

  const candidate = mcpAutowireSixPackManagedLifecycleCandidateForId("sqlite-explorer-fastmcp");
  candidate.source.resolvedCommit = resolvedCommit;
  candidate.runtime.package = {
    registryType: "oci",
    identifier: imageIdentifier,
    digest: imageDigest,
    packageArguments: [{
      type: "env",
      name: "SQLITE_DB_PATH",
      valueHint: "/data/test.db",
      isFixed: true,
    }],
  };
  candidate.runtime.sourceBuild = {
    schemaVersion: "ambient-mcp-custom-source-build-v1",
    sourceUrl,
    resolvedCommit,
    recipeKind: "existing-reviewed-image",
    recipeHash,
    imageIdentifier,
    imageDigest,
    evidenceRefs: ["sqlite-source-build-review"],
  };
  candidate.runtime.updatePolicy = {
    mode: "pinned",
    reason: "Built from a reviewed SQLite Explorer source commit into a local ToolHive runner image with a recorded local image id.",
    evidenceRefs: ["sqlite-source-build-review"],
  };
  candidate.runtime.evidenceRefs = ["sqlite-source-build-review"];
  candidate.permissions.filesystem.extraMounts = [
    {
      path: sourcePath,
      containerPath: "/app/sqlite_explorer.py",
      mode: "read-only",
      purpose: "Mount the pinned SQLite Explorer source file read-only into the reviewed FastMCP runner image.",
    },
    {
      path: dataDir,
      containerPath: "/data",
      mode: "read-only",
      purpose: "Mount a disposable SQLite database directory read-only for live validation.",
    },
  ];
  candidate.validationPlan.expectedTools = ["read_query", "list_tables", "describe_table"];
  candidate.evidence = [{
    id: "sqlite-source-build-review",
    type: "other",
    locator: `${sourceUrl}@${resolvedCommit}`,
    summary: "Live six-pack gate built a reviewed FastMCP runner image and mounted pinned SQLite Explorer source plus a disposable read-only SQLite database.",
  }];
  candidate.source.evidenceRefs = ["sqlite-source-build-review"];
  candidate.permissions.evidenceRefs = ["sqlite-source-build-review"];
  candidate.validationPlan.evidenceRefs = ["sqlite-source-build-review"];
  candidate.riskSummary.evidenceRefs = ["sqlite-source-build-review"];
  return candidate;
}

async function resolveGitCommit(repositoryUrl: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["ls-remote", repositoryUrl, ref], {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  const commit = stdout.trim().split(/\s+/, 1)[0] ?? "";
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error(`Could not resolve ${repositoryUrl} ${ref}; got ${stdout.trim() || "empty output"}.`);
  return commit;
}

async function readGitHubText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/plain,*/*;q=0.1",
      "user-agent": "Ambient-MCP-Autowire-Six-Pack-Live",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

async function createSqliteFixtureDatabase(databasePath: string): Promise<void> {
  await execFileAsync("python3", ["-c", [
    "import sqlite3, sys",
    "conn = sqlite3.connect(sys.argv[1])",
    "conn.execute('create table notes(id integer primary key, body text)')",
    "conn.execute('insert into notes(body) values (?)', ('hello from ambient sqlite gate',))",
    "conn.commit()",
    "conn.close()",
  ].join("; "), databasePath], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

async function localContainerImageId(imageIdentifier: string): Promise<string> {
  const attempts: Array<{ binary: string; args: string[] }> = [
    { binary: "docker", args: ["image", "inspect", imageIdentifier, "--format", "{{.Id}}"] },
    { binary: "podman", args: ["image", "inspect", imageIdentifier, "--format", "{{.Id}}"] },
    { binary: "/opt/podman/bin/podman", args: ["image", "inspect", imageIdentifier, "--format", "{{.Id}}"] },
    { binary: "/opt/homebrew/bin/docker", args: ["image", "inspect", imageIdentifier, "--format", "{{.Id}}"] },
    { binary: "/usr/local/bin/docker", args: ["image", "inspect", imageIdentifier, "--format", "{{.Id}}"] },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync(attempt.binary, attempt.args, {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      const digest = stdout.trim().replace(/^sha256:/, "");
      if (/^[a-f0-9]{64}$/i.test(digest)) return `sha256:${digest}`;
      errors.push(`${attempt.binary}: unexpected image id ${stdout.trim() || "empty output"}`);
    } catch (error) {
      errors.push(`${attempt.binary}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Could not read local image id for ${imageIdentifier}. ${errors.join(" | ")}`);
}

function toolByName(tools: ReturnType<typeof createMcpServerPiToolDefinitions>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing MCP live tool ${name}`);
  return tool;
}

async function executePiTool(
  tool: ReturnType<typeof createMcpServerPiToolDefinitions>[number],
  toolCallId: string,
  input: Record<string, unknown>,
): Promise<any> {
  if (!tool.execute) throw new Error(`Tool ${tool.name} has no execute handler.`);
  return tool.execute(toolCallId, input, undefined, undefined, undefined as any);
}

function toolText(result: { content?: Array<{ text?: string }> }): string {
  return (result.content ?? []).map((item) => item.text ?? "").join("\n");
}

async function cleanupWorkload(toolHive: ToolHiveRuntimeService, workloadName: string): Promise<void> {
  await toolHive.stopWorkload(workloadName, 20).catch(() => undefined);
  await toolHive.removeWorkload(workloadName).catch(() => undefined);
  await execFileAsync("docker", ["rm", "-f", workloadName, `${workloadName}-dns`, `${workloadName}-egress`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await execFileAsync("docker", ["network", "rm", `toolhive-${workloadName}-internal`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await rm(join(tmpdir(), workloadName), { recursive: true, force: true }).catch(() => undefined);
}
