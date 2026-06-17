import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mcpAutowirePhase0Fixtures } from "../mcp-autowire/mcpAutowireFixtures";
import { validateMcpAutowireCandidate, type McpAutowireCandidate } from "../mcp-autowire/mcpAutowireSchemas";
import {
  MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
  createMcpCustomSourceBuildImage,
  describeMcpCustomSourceBuild,
  mcpCustomSourceBuildReviewText,
  reviewMcpCustomSourceBuildPlan,
  type McpCustomSourceBuildCommandRunner,
} from "./mcpCustomSourceBuild";

describe("MCP custom source build review", () => {
  it("emits a pinned custom-image candidate from a reviewed GitHub source image", () => {
    const candidate = githubSourceCandidate();
    candidate.permissions.network = {
      mode: "allowlist",
      allowHosts: ["stooq.com", "crates.io", "github-cloud.s3.amazonaws.com", "github.gi"],
      allowPorts: [443],
      justification: "Discovery found Stooq runtime access plus source-build infrastructure hosts.",
    };
    candidate.permissions.filesystem.extraMounts = [
      {
        path: "/tmp/ambient-sqlite-source/sqlite_explorer.py",
        containerPath: "/app/sqlite_explorer.py",
        mode: "read-only",
        purpose: "Mount reviewed SQLite Explorer source into the reviewed FastMCP runner image.",
      },
      {
        path: "/tmp/ambient-sqlite-data",
        containerPath: "/data",
        mode: "read-only",
        purpose: "Mount a disposable SQLite database read-only for validation.",
      },
    ];
    const result = reviewMcpCustomSourceBuildPlan({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        sourceUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
        resolvedCommit: "abc1234deadbeef",
        image: {
          identifier: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
          digest: `sha256:${"d".repeat(64)}`,
        },
        recipe: {
          kind: "existing-dockerfile",
          contextPath: ".",
          dockerfilePath: "Dockerfile",
          runtimeCommand: "python -m sqlite_explorer_fastmcp",
          serverArgs: ["--stdio"],
          runtimeEnv: [{ name: "SQLITE_DB_PATH", value: "/data/test.db" }],
          evidenceRefs: ["sqlite-readme"],
        },
      },
    });

    expect(result.status).toBe("ready-for-import");
    expect(result.blockers).toEqual([]);
    expect(result.customImageCandidate).toMatchObject({
      source: {
        resolvedCommit: "abc1234deadbeef",
      },
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "custom-image",
        package: {
          registryType: "oci",
          identifier: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
          digest: `sha256:${"d".repeat(64)}`,
          packageArguments: expect.arrayContaining([
            { type: "env", name: "SQLITE_DB_PATH", valueHint: "/data/test.db", isFixed: true },
          ]),
        },
        updatePolicy: {
          mode: "pinned",
        },
        sourceBuild: {
          schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
          sourceUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
          resolvedCommit: "abc1234deadbeef",
          recipeKind: "existing-dockerfile",
          recipeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          imageIdentifier: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
          imageDigest: `sha256:${"d".repeat(64)}`,
        },
      },
    });
    expect(result.customImageCandidate?.permissions.network).toMatchObject({
      mode: "allowlist",
      allowHosts: ["stooq.com"],
      allowPorts: [443],
    });
    expect(result.customImageCandidate?.permissions.network.justification).toContain("infrastructure hosts were excluded");
    expect(result.customImageValidation).toMatchObject({
      status: "ready-for-review",
      outcome: "ready",
      readyForToolHiveRun: true,
    });
    const text = mcpCustomSourceBuildReviewText(result, { customImageCandidateRef: "ambient-mcp-candidate:sqlite:1234" });
    expect(text).toContain("Runtime env: SQLITE_DB_PATH");
    expect(text).not.toContain("/data/test.db");
    expect(text).toContain("Custom-image candidate ref for ambient_mcp_standard_import_describe");
    expect(text).toContain("ambient-mcp-candidate:sqlite:1234");
  });

  it("requires a digest and reviewed generated Dockerfiles before import handoff", () => {
    const result = reviewMcpCustomSourceBuildPlan({
      candidate: githubSourceCandidate(),
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        resolvedCommit: "abc1234deadbeef",
        image: {
          identifier: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
        },
        recipe: {
          kind: "generated-dockerfile",
          contextPath: ".",
          serverArgs: [],
          generatedDockerfileReviewed: false,
        },
      },
    });

    expect(result.status).toBe("needs-build");
    expect(result.customImageCandidate).toBeUndefined();
    expect(result.blockers.join("\n")).toContain("Generated Dockerfiles must be explicitly reviewed");
    expect(mcpCustomSourceBuildReviewText(result)).toContain("digest=pending");
  });

  it("accepts source-build notes accidentally nested under recipe metadata", () => {
    const candidate = npmSqliteCandidate();
    const result = reviewMcpCustomSourceBuildPlan({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        sourceUrl: candidate.source.url,
        resolvedCommit: "abc1234deadbeef",
        image: {
          identifier: "ambient-source-built/mcp-sqlite-server-standard-mcp:abc1234",
        },
        recipe: {
          kind: "generated-dockerfile",
          contextPath: ".",
          dockerfilePath: ".ambient-source-build/Dockerfile",
          generatedDockerfileReviewed: true,
          runtimeCommand: "node /app/dist/index.js",
          serverArgs: [],
          runtimeEnv: [],
          notes: ["Pi copied optional source-build notes into recipe."],
        },
      },
    });

    expect(result.status).toBe("needs-build");
    expect(result.sourceBuild.notes).toEqual(["Pi copied optional source-build notes into recipe."]);
    expect(result.sourceBuild.recipe).not.toHaveProperty("notes");
    expect(result.blockers.join("\n")).toContain("OCI image digest is required");
  });

  it("derives a pinned generated Rust source-build plan without asking Pi to invent JSON", async () => {
    const candidate = githubSourceCandidate();
    const result = await describeMcpCustomSourceBuild({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
    }, {
      commandRunner: async (input) => ({
        command: input.command,
        args: input.args,
        stdout: `${"a".repeat(40)}\tHEAD\n`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    });

    expect(result.status).toBe("ready-to-build");
    expect(result.sourceBuild).toMatchObject({
      resolvedCommit: "a".repeat(40),
      image: {
        identifier: "ambient-source-built/sqlite-explorer-fastmcp-source:aaaaaaaaaaaa",
      },
      recipe: {
        kind: "generated-dockerfile",
        generatedDockerfileReviewed: true,
        dockerfilePath: ".ambient-source-build/Dockerfile",
      },
    });
    expect(result.generatedDockerfile).toContain("FROM rust:");
    expect(result.nextToolName).toBe("ambient_mcp_autowire_source_build_create");
    expect(result.sourceBuild.notes.length).toBeGreaterThan(0);
    const toolSourceBuild = result.nextToolInput?.sourceBuild as Record<string, unknown>;
    expect(toolSourceBuild).not.toHaveProperty("notes");
    expect(toolSourceBuild.recipe).not.toHaveProperty("notes");
    expect(result.forbiddenAlternatives.join("\n")).toContain("unmanaged local bridge");
  });

  it("derives a Node source-build plan for npm-backed GitHub MCP packages", async () => {
    const candidate = npmSqliteCandidate();
    const result = await describeMcpCustomSourceBuild({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
    }, {
      commandRunner: async (input) => ({
        command: input.command,
        args: input.args,
        stdout: `${"a".repeat(40)}\tHEAD\n`,
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      }),
    });

    expect(result.status).toBe("ready-to-build");
    expect(result.generatedDockerfile).toContain("FROM node:22-bookworm-slim AS builder");
    expect(result.generatedDockerfile).toContain("npm run build --if-present");
    expect(result.generatedDockerfile).not.toContain("cargo build");
    expect(result.sourceBuild.recipe).toMatchObject({
      kind: "generated-dockerfile",
      runtimeCommand: "node /app/dist/index.js",
    });
  });

  it("resolves GitHub tree URLs through the repository root and preserves build context", async () => {
    const candidate = githubSourceCandidate();
    candidate.source.url = "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem";
    const calls: string[][] = [];

    const result = await describeMcpCustomSourceBuild({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
    }, {
      commandRunner: async (input) => {
        calls.push(input.args);
        return {
          command: input.command,
          args: input.args,
          stdout: `${"f".repeat(40)}\trefs/heads/main\n`,
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      },
    });

    expect(calls[0]).toEqual(["ls-remote", "https://github.com/modelcontextprotocol/servers-archived", "main"]);
    expect(result.sourceBuild).toMatchObject({
      sourceUrl: "https://github.com/modelcontextprotocol/servers-archived",
      resolvedCommit: "f".repeat(40),
      recipe: {
        contextPath: "src/filesystem",
      },
    });
  });

  it("builds through the Ambient source-build lane and emits a digest-backed custom-image candidate", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ambient-source-build-test-"));
    const candidate = githubSourceCandidate();
    const sourceBuild = {
      schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
      sourceUrl: candidate.source.url,
      resolvedCommit: "b".repeat(40),
      image: {
        identifier: "ambient-source-built/sqlite-explorer-fastmcp:bbbbbbbbbbbb",
      },
      recipe: {
        kind: "generated-dockerfile",
        contextPath: ".",
        dockerfilePath: ".ambient-source-build/Dockerfile",
        generatedDockerfileReviewed: true,
        runtimeCommand: "/usr/local/bin/sqlite-explorer-fastmcp-mcp-server",
        serverArgs: [],
        runtimeEnv: [],
      },
    };
    const calls: string[] = [];
    const commandRunner: McpCustomSourceBuildCommandRunner = async (input) => {
      calls.push(`${input.command} ${input.args.join(" ")}`);
      if (input.command === "git" && input.args[0] === "clone") {
        const repoPath = input.args[input.args.length - 1]!;
        await mkdir(repoPath, { recursive: true });
        await writeFile(join(repoPath, "Cargo.toml"), "[package]\nname = \"sqlite-explorer-fastmcp-mcp-server\"\nversion = \"0.1.0\"\n");
      }
      if (input.kind === "container-inspect") {
        return {
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          stdout: `sha256:${"c".repeat(64)}\n`,
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      }
      return {
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      };
    };

    const result = await createMcpCustomSourceBuildImage({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
      sourceBuild,
      userDataPath,
    }, { commandRunner });

    expect(result.status).toBe("ready-for-import");
    expect(result.build).toMatchObject({
      runtime: "docker",
      imageIdentifier: "ambient-source-built/sqlite-explorer-fastmcp:bbbbbbbbbbbb",
      imageDigest: `sha256:${"c".repeat(64)}`,
    });
    expect(result.customImageCandidate).toMatchObject({
      runtime: {
        sourceKind: "custom-image",
        package: {
          registryType: "oci",
          digest: `sha256:${"c".repeat(64)}`,
        },
      },
    });
    expect(result.nextToolName).toBe("ambient_mcp_standard_import_describe");
    expect(calls.join("\n")).toContain("git clone");
    expect(calls.join("\n")).toContain("docker build");
    expect(result.build.buildLogPath).toContain(userDataPath);
  });

  it("specializes generated Node source builds from package.json bin metadata", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ambient-node-source-build-test-"));
    const candidate = npmSqliteCandidate();
    const sourceBuild = {
      schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
      sourceUrl: candidate.source.url,
      resolvedCommit: "d".repeat(40),
      image: {
        identifier: "ambient-source-built/mcp-sqlite-server-standard-mcp:dddddddddddd",
      },
      recipe: {
        kind: "generated-dockerfile",
        contextPath: ".",
        dockerfilePath: ".ambient-source-build/Dockerfile",
        generatedDockerfileReviewed: true,
        runtimeCommand: "node /app/dist/index.js",
        serverArgs: [],
        runtimeEnv: [],
      },
    };
    const commandRunner: McpCustomSourceBuildCommandRunner = async (input) => {
      if (input.command === "git" && input.args[0] === "clone") {
        const repoPath = input.args[input.args.length - 1]!;
        await mkdir(repoPath, { recursive: true });
        await writeFile(join(repoPath, "package.json"), JSON.stringify({
          name: "mcp-sqlite-server",
          type: "module",
          bin: { "mcp-sqlite-server": "dist/server.js" },
          scripts: { build: "tsup" },
          dependencies: { "@modelcontextprotocol/sdk": "^1.0.0", "better-sqlite3": "^11.0.0" },
        }));
      }
      if (input.kind === "container-inspect") {
        return {
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          stdout: `sha256:${"e".repeat(64)}\n`,
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      }
      return {
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      };
    };

    const result = await createMcpCustomSourceBuildImage({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
      sourceBuild,
      userDataPath,
    }, { commandRunner });

    expect(result.status).toBe("ready-for-import");
    expect(result.sourceBuild.recipe.runtimeCommand).toBe("node /app/dist/server.js");
    expect(result.customImageCandidate?.runtime.package?.runtimeHint).toBe("node /app/dist/server.js");
  });

  it("re-derives the reviewed source-build plan when create receives incomplete sourceBuild JSON", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ambient-partial-node-source-build-test-"));
    const candidate = npmSqliteCandidate();
    const commandRunner: McpCustomSourceBuildCommandRunner = async (input) => {
      if (input.command === "git" && input.args[0] === "ls-remote") {
        return {
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          stdout: `${"f".repeat(40)}\tHEAD\n`,
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      }
      if (input.command === "git" && input.args[0] === "clone") {
        const repoPath = input.args[input.args.length - 1]!;
        await mkdir(repoPath, { recursive: true });
        await writeFile(join(repoPath, "package.json"), JSON.stringify({
          name: "mcp-sqlite-server",
          type: "module",
          bin: { "mcp-sqlite-server": "dist/server.js" },
          dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" },
        }));
      }
      if (input.kind === "container-inspect") {
        return {
          command: input.command,
          args: input.args,
          cwd: input.cwd,
          stdout: `sha256:${"f".repeat(64)}\n`,
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        };
      }
      return {
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: 1,
      };
    };

    const result = await createMcpCustomSourceBuildImage({
      candidate,
      expectedCandidateHash: validateMcpAutowireCandidate(candidate).candidateHash,
      sourceBuild: {
        schemaVersion: MCP_CUSTOM_SOURCE_BUILD_SCHEMA_VERSION,
        sourceUrl: candidate.source.url,
        resolvedCommit: "f",
      },
      userDataPath,
    }, { commandRunner });

    expect(result.status).toBe("ready-for-import");
    expect(result.sourceBuild.resolvedCommit).toBe("f".repeat(40));
    expect(result.sourceBuild.image.identifier).toBe("ambient-source-built/mcp-sqlite-server-standard-mcp:ffffffffffff");
    expect(result.sourceBuild.recipe.runtimeCommand).toBe("node /app/dist/server.js");
    expect(result.customImageCandidate?.runtime.sourceKind).toBe("custom-image");
  });
});

function githubSourceCandidate(): McpAutowireCandidate {
  const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
  candidate.id = "sqlite-explorer-fastmcp-source";
  candidate.displayName = "SQLite Explorer FastMCP";
  candidate.source = {
    kind: "github",
    url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
    packageName: "sqlite-explorer-fastmcp-mcp-server",
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.runtime = {
    provider: "toolhive",
    sourceKind: "unknown",
    transport: "stdio",
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.permissions = {
    network: { mode: "disabled", allowHosts: [], allowPorts: [] },
    filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
    localApps: [],
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.validationPlan = {
    preflights: ["toolhive-runtime", "container-runtime"],
    expectedTools: ["query"],
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.evidence = [{
    id: "sqlite-readme",
    type: "readme",
    locator: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
    summary: "README describes a GitHub-only FastMCP SQLite server source.",
  }];
  candidate.openQuestions = [];
  candidate.riskSummary = {
    level: "medium",
    reasons: ["GitHub-only source needs a reviewed custom ToolHive source build."],
    evidenceRefs: ["sqlite-readme"],
  };
  return candidate;
}

function npmSqliteCandidate(): McpAutowireCandidate {
  const candidate = githubSourceCandidate();
  candidate.id = "mcp-sqlite-server-standard-mcp";
  candidate.displayName = "MCP Sqlite Server";
  candidate.source = {
    kind: "github",
    url: "https://github.com/ofershap/mcp-server-sqlite",
    packageName: "mcp-sqlite-server",
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.runtime = {
    provider: "toolhive",
    sourceKind: "npm",
    transport: "stdio",
    package: {
      registryType: "npm",
      identifier: "mcp-sqlite-server",
      runtimeHint: "npx -y mcp-sqlite-server",
      packageArguments: [],
    },
    evidenceRefs: ["sqlite-readme"],
  };
  candidate.permissions.filesystem.extraMounts = [{
    path: "/tmp/library.db",
    containerPath: "/projects/library.db",
    mode: "read-only",
    purpose: "Disposable SQLite fixture.",
  }];
  return candidate;
}
