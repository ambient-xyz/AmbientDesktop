import { describe, expect, it, vi } from "vitest";
import { mcpAutowirePhase0Fixtures, mcpKatzillaInstallFailureReplay } from "./mcpAutowireFixtures";
import {
  executeAutowireDiscoveryTool,
  mcpAutowirePlanResultText,
  planMcpAutowire,
  type McpAutowirePlanResult,
} from "./mcpAutowirePlanner";

describe("MCP autowire planner", () => {
  it("runs a bounded URL-discovery planning loop and validates the candidate shape", async () => {
    const fetchImpl = vi.fn(async () => new Response("Context7 README evidence", {
      status: 200,
      headers: { "content-type": "text/markdown" },
    }));
    let callCount = 0;
    const sessionIds: Array<string | undefined> = [];

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/upstash/context7",
      instructions: "Prefer remote MCP if a remote endpoint is explicit.",
      allowedDiscovery: { maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        sessionIds.push(call.sessionId);
        if (call.tools?.length) {
          expect(call.responseFormat).toBeUndefined();
          expect(call.tools.map((tool) => tool.name)).toEqual(["ambient_mcp_url_read"]);
          const toolResult = await call.executeTool?.(
            {
              id: "read-1",
              type: "toolCall",
              name: "ambient_mcp_url_read",
              arguments: { url: "https://raw.githubusercontent.com/upstash/context7/master/README.md" },
            } as any,
            { url: "https://raw.githubusercontent.com/upstash/context7/master/README.md" },
          );
          expect(JSON.parse(typeof toolResult === "string" ? toolResult : toolResult?.text ?? "{}")).toMatchObject({
            status: "fetched",
            statusCode: 200,
            returnedChars: 24,
          });
          return "Evidence summary: Context7 README evidence from the raw README URL.";
        }
        expect(call.responseFormat?.type).toBe("json_schema");
        expect(call.systemPrompt).toContain("MCPB execution is currently deferred");
        expect(call.prompt).toContain("Discovery summary:");
        expect(call.prompt).toContain("Context7 README evidence");
        return JSON.stringify(mcpAutowirePhase0Fixtures.context7);
      },
    });

    expect(result.session).toMatchObject({
      purpose: "mcp-autowire-install",
      targetUrl: "https://github.com/upstash/context7",
    });
    expect(result.session.id).toMatch(/^mcp-autowire-install-[a-f0-9]{20}$/);
    expect(sessionIds).toEqual([result.session.id, result.session.id]);
    expect(result.candidate?.recommendedLane).toBe("remote-mcp");
    expect(result.validation.status).toBe("ready-for-review");
    expect(result.validation.readyForUserReview).toBe(true);
    expect(result.validation.readyForToolHiveRun).toBe(false);
    expect(result.discovery.suggestedUrls).toEqual(expect.arrayContaining([
      "https://raw.githubusercontent.com/upstash/context7/master/server.json",
    ]));
    expect(result.discovery.fetches).toEqual([
      expect.objectContaining({
        status: "fetched",
        url: "https://raw.githubusercontent.com/upstash/context7/master/README.md",
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
    expect(mcpAutowirePlanResultText(result)).toContain(`Autowire session: ${result.session.id} (mcp-autowire-install)`);
    expect(mcpAutowirePlanResultText(result)).toContain("Candidate JSON for ambient_mcp_autowire_review:");
    expect(mcpAutowirePlanResultText(result)).toContain('"schemaVersion": "ambient-mcp-autowire-v1"');
  });

  it("blocks discovery URLs outside the target repository before fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response("outside"));
    const fetches: McpAutowirePlanResult["discovery"]["fetches"] = [];
    const blocked = JSON.parse(await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_url_read" },
      { url: "https://example.com/server.json" },
      {
        target: { url: new URL("https://github.com/upstash/context7"), github: { owner: "upstash", repo: "context7" } },
        grants: { urlFetch: true, githubRaw: true, search: false, maxFetches: 2, maxSearches: 0, maxBytesPerFetch: 12_000 },
        fetches,
        fetchImpl,
      },
    ));

    expect(blocked).toMatchObject({
      status: "blocked",
      reason: "URL host is outside the target GitHub repository.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bootstraps one deterministic allowed URL read when the discovery worker skips tool use", async () => {
    const fetchImpl = vi.fn(async (input) => new Response(`bootstrap evidence for ${String(input)}`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/upstash/context7",
      instructions: "Classify Context7.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (call.tools?.length) return "Discovery worker summarized without using a tool.";
        expect(call.prompt).toContain("Deterministic bootstrap read fetched https://raw.githubusercontent.com/upstash/context7/main/README.md");
        return JSON.stringify(mcpAutowirePhase0Fixtures.context7);
      },
    });

    expect(result.validation.readyForUserReview).toBe(true);
    expect(result.discovery.fetches).toEqual([
      expect.objectContaining({
        status: "fetched",
        url: "https://raw.githubusercontent.com/upstash/context7/main/README.md",
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
  });

  it("prefetches GitHub tree subpath manifests before invoking Pi discovery", async () => {
    const packageUrl = "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/everything/package.json";
    const fetchImpl = vi.fn(async (input) => {
      expect(String(input)).toBe(packageUrl);
      return new Response(JSON.stringify({
        name: "@modelcontextprotocol/server-everything",
        description: "MCP server used for diagnostics and protocol tests.",
        dependencies: {
          "@modelcontextprotocol/sdk": "^1.0.0",
        },
        bin: {
          "mcp-server-everything": "dist/index.js",
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
      instructions: "Install this MCP.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async () => {
        throw new Error("GitHub tree package manifests should produce a deterministic candidate before Pi discovery.");
      },
    });

    expect(result.discovery.suggestedUrls[0]).toBe(packageUrl);
    expect(result.discovery.fetches).toEqual([
      expect.objectContaining({
        status: "fetched",
        url: packageUrl,
      }),
    ]);
    expect(result.candidate).toMatchObject({
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          identifier: "@modelcontextprotocol/server-everything",
        },
      },
    });
    expect(result.validation.readyForUserReview).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("adds explicitly requested read-only filesystem mounts to deterministic standard candidates", async () => {
    const packageUrl = "https://raw.githubusercontent.com/modelcontextprotocol/servers-archived/main/src/filesystem/package.json";
    const fetchImpl = vi.fn(async (input) => {
      expect(String(input)).toBe(packageUrl);
      return new Response(JSON.stringify({
        name: "@modelcontextprotocol/server-filesystem",
        description: "MCP server for local filesystem access.",
        dependencies: {
          "@modelcontextprotocol/sdk": "^1.0.0",
        },
        bin: {
          "mcp-server-filesystem": "dist/index.js",
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
      instructions: "Install this MCP with read-only access to /tmp/ambient-autowire-planner/filesystem-fixture and list notes.txt.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async () => {
        throw new Error("GitHub tree package manifests should produce a deterministic filesystem candidate before Pi discovery.");
      },
    });

    expect(result.candidate?.permissions.filesystem.extraMounts).toEqual([
      {
        path: "/tmp/ambient-autowire-planner/filesystem-fixture",
        containerPath: "/projects/filesystem-fixture",
        mode: "read-only",
        purpose: "User explicitly requested read-only filesystem access for this MCP install.",
      },
    ]);
    expect(result.candidate?.permissions.evidenceRefs).toContain("user-filesystem-mount");
    expect(result.candidate?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "user-filesystem-mount",
        locator: "user-instructions",
      }),
    ]));
    expect(result.validation.blockers.map((issue) => issue.code)).not.toContain("filesystem.broad_mount");
    expect(result.validation.readyForUserReview).toBe(true);
  });

  it("recovers GitHub tree targets through source-search bootstrap when raw branch prefetch misses", async () => {
    const mainPackageUrl = "https://raw.githubusercontent.com/modelcontextprotocol/servers-archived/main/src/filesystem/package.json";
    const masterPackageUrl = "https://raw.githubusercontent.com/modelcontextprotocol/servers-archived/master/src/filesystem/package.json";
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/modelcontextprotocol/servers-archived") {
        return new Response(JSON.stringify({ default_branch: "master" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://api.github.com/repos/modelcontextprotocol/servers-archived/git/trees/master?recursive=1") {
        return new Response(JSON.stringify({
          tree: [
            { path: "src/filesystem/package.json", type: "blob" },
            { path: "src/filesystem/README.md", type: "blob" },
            { path: "README.md", type: "blob" },
          ],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === masterPackageUrl) {
        return new Response(JSON.stringify({
          name: "@modelcontextprotocol/server-filesystem",
          description: "MCP server for local filesystem access.",
          dependencies: {
            "@modelcontextprotocol/sdk": "^1.0.0",
          },
          bin: {
            "mcp-server-filesystem": "dist/index.js",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.startsWith("https://raw.githubusercontent.com/modelcontextprotocol/servers-archived/main/")) {
        return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
      instructions: "Install this MCP with read-only access to /tmp/ambient-autowire-planner/filesystem-fixture and list notes.txt.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 5, maxSearches: 1, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (call.tools?.length) return "Discovery worker skipped tools.";
        throw new Error("Source-search bootstrap should recover the package manifest before candidate JSON generation.");
      },
    });

    expect(result.discovery.fetches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "failed",
        url: mainPackageUrl,
        statusCode: 404,
      }),
      expect.objectContaining({
        status: "fetched",
        url: masterPackageUrl,
      }),
    ]));
    expect(result.discovery.searches).toEqual([
      expect.objectContaining({
        status: "searched",
        defaultBranch: "master",
        resultCount: expect.any(Number),
      }),
    ]);
    expect(result.candidate).toMatchObject({
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          identifier: "@modelcontextprotocol/server-filesystem",
        },
      },
    });
    expect(result.candidate?.permissions.filesystem.extraMounts).toEqual([
      expect.objectContaining({
        path: "/tmp/ambient-autowire-planner/filesystem-fixture",
        mode: "read-only",
      }),
    ]);
    expect(result.validation.readyForUserReview).toBe(true);
  });

  it("adds explicitly requested filesystem mounts to Pi-returned candidate JSON before validation", async () => {
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/example/filesystem-mcp",
      instructions: "Install this MCP with read-only access to /tmp/ambient-autowire-planner/pi-fixture and list notes.txt.",
      allowedDiscovery: { urlFetch: false, githubRaw: false, search: false, maxFetches: 0, maxSearches: 0, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      textCall: async (call) => {
        callCount += 1;
        expect(call.responseFormat?.type).toBe("json_schema");
        expect(call.responseFormat?.type === "json_schema" ? call.responseFormat.json_schema.name : undefined).toBe("ambient_mcp_autowire_plan");
        return JSON.stringify({
          schemaVersion: "ambient-mcp-autowire-v1",
          id: "filesystem-mcp-standard",
          displayName: "Filesystem MCP",
          source: {
            kind: "github",
            url: "https://github.com/example/filesystem-mcp",
            packageName: "filesystem-mcp",
            evidenceRefs: ["readme"],
          },
          recommendedLane: "standard-mcp",
          runtime: {
            provider: "toolhive",
            sourceKind: "npm",
            transport: "stdio",
            package: {
              registryType: "npm",
              identifier: "filesystem-mcp",
              runtimeHint: "npx -y filesystem-mcp",
              packageArguments: [],
            },
            evidenceRefs: ["readme"],
          },
          secrets: [],
          permissions: {
            network: {
              mode: "disabled",
              allowHosts: [],
              allowPorts: [],
              justification: "This filesystem server does not require network access for the requested smoke test.",
            },
            filesystem: {
              workspaceRead: false,
              workspaceWrite: false,
              extraMounts: [],
            },
            localApps: [],
            evidenceRefs: ["readme"],
          },
          validationPlan: {
            preflights: ["toolhive-runtime", "container-runtime"],
            expectedTools: ["list_directory", "read_file"],
            evidenceRefs: ["readme"],
          },
          evidence: [{
            id: "readme",
            type: "readme",
            locator: "https://github.com/example/filesystem-mcp",
            summary: "README describes a package-backed filesystem MCP server.",
          }],
          openQuestions: [],
          riskSummary: {
            level: "medium",
            reasons: ["Filesystem access is scoped to the user-requested mount."],
            evidenceRefs: ["readme"],
          },
        });
      },
    });

    expect(callCount).toBe(1);
    expect(result.candidate?.permissions.filesystem.extraMounts).toEqual([
      {
        path: "/tmp/ambient-autowire-planner/pi-fixture",
        containerPath: "/projects/pi-fixture",
        mode: "read-only",
        purpose: "User explicitly requested read-only filesystem access for this MCP install.",
      },
    ]);
    expect(result.candidate?.permissions.evidenceRefs).toEqual(["readme", "user-filesystem-mount"]);
    expect(result.validation.blockers.map((issue) => issue.code)).not.toContain("filesystem.broad_mount");
    expect(result.validation.readyForUserReview).toBe(true);
  });

  it("prefers PyPI MCP scripts over npm wrappers and preserves fixed MCP switches", async () => {
    const readme = [
      "# Csvglow",
      "Generate dashboards from CSV files.",
      "Claude Desktop MCP configuration can use: npx -y csvglow --mcp",
      "The Python CLI also supports: csvglow --mcp",
    ].join("\n");
    const packageJson = JSON.stringify({
      name: "csvglow",
      keywords: ["csv", "dashboard", "mcp"],
      bin: {
        csvglow: "./bin/csvglow.js",
      },
    });
    const pyproject = [
      "[project]",
      'name = "csvglow"',
      'dependencies = ["mcp>=1.0.0", "pandas>=1.5.0"]',
      "",
      "[project.scripts]",
      'csvglow = "csvglow.cli:main"',
      'csvglow-mcp = "csvglow.mcp_server:main"',
    ].join("\n");
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) return new Response(readme, { status: 200, headers: { "content-type": "text/markdown" } });
      if (url.endsWith("/package.json")) return new Response(packageJson, { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/pyproject.toml")) return new Response(pyproject, { status: 200, headers: { "content-type": "text/plain" } });
      return new Response("not found", { status: 404 });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/Ratnaditya-J/csvglow",
      instructions: "Install this MCP.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 8, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (!call.tools?.length) throw new Error("Csvglow package evidence should produce a deterministic candidate before candidate JSON generation.");
        await call.executeTool?.(
          {
            id: "read-readme",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/README.md" },
        );
        await call.executeTool?.(
          {
            id: "read-package",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/package.json" },
          } as any,
          { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/package.json" },
        );
        await call.executeTool?.(
          {
            id: "read-pyproject",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/pyproject.toml" },
          } as any,
          { url: "https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/pyproject.toml" },
        );
        return [
          "Evidence summary:",
          "README documents csvglow as a Model Context Protocol server and shows npx -y csvglow --mcp.",
          "package.json package name is csvglow with mcp keyword.",
          "pyproject.toml project name is csvglow and defines csvglow-mcp = csvglow.mcp_server:main.",
        ].join(" ");
      },
    });

    expect(result.candidate).toMatchObject({
      id: "csvglow-standard-mcp",
      recommendedLane: "standard-mcp",
      runtime: {
        sourceKind: "pypi",
        package: {
          registryType: "pypi",
          identifier: "csvglow",
          runtimeHint: "uvx csvglow --mcp",
          packageArguments: [{ type: "switch", name: "--mcp", isFixed: true }],
        },
      },
    });
    expect(result.candidate?.runtime.package?.entrypoint).toBeUndefined();
    expect(result.validation.readyForUserReview).toBe(true);
  });

  it("hands normal application sources back to Pi instead of forcing an MCP candidate", async () => {
    const fetchImpl = vi.fn(async () => new Response("OpenCut Classic repository page", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/opencut-app/opencut-classic",
      instructions: "If this is a normal app, let Pi continue normal app setup.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (call.tools?.length) {
          expect(call.systemPrompt).toContain("normal application/containerized application signals");
          return [
            "Evidence summary:",
            "README describes OpenCut Classic as a Next.js/Bun web application and video editor.",
            "package.json shows a monorepo web application, no @modelcontextprotocol/sdk dependency, no MCP server scripts, and no MCP entry points.",
            "docker-compose.yml is present for PostgreSQL and Redis.",
            "server.json and .mcp.json are absent. This is not an MCP server.",
          ].join(" ");
        }
        throw new Error("Normal app handoff should not request MCP candidate JSON.");
      },
    });

    expect(result.candidate).toBeUndefined();
    expect(result.sourceClassification).toMatchObject({
      kind: "containerized_app",
      confidence: "high",
      setupRecipe: "containerized-app-setup",
    });
    expect(result.validation).toMatchObject({
      status: "blocked",
      outcome: "deferred-unsupported-lane",
      readyForUserReview: false,
      readyForToolHiveRun: false,
    });
    const text = mcpAutowirePlanResultText(result);
    expect(text).toContain("Source classification: containerized_app (high confidence)");
    expect(text).toContain("No MCP candidate was generated");
    expect(text).toContain("Do not call ambient_mcp_autowire_review");
    expect(text).toContain("ambient_setup_runtime_preflight");
    expect(text).toContain("ambient_setup_recipe_describe");
    expect(text).toContain("ambient_setup_final_report");
    expect(text).toContain("continue ordinary app setup");
    expect(callCount).toBe(1);
  });

  it("keeps FastMCP source-only servers in the MCP flow despite Docker and CLI signals", async () => {
    const readme = [
      "# SQLite Explorer MCP Server",
      "An MCP server that provides safe, read-only access to SQLite databases through Model Context Protocol (MCP).",
      "This server is built with the FastMCP framework.",
      "### read_query",
      "### list_tables",
      "### describe_table",
      "Dockerfile is present for container use.",
      "Run python sqlite_explorer.py with SQLITE_DB_PATH.",
      "No pyproject.toml or published package is documented.",
    ].join("\n");
    const fetchImpl = vi.fn(async () => new Response(readme, {
      status: 200,
      headers: { "content-type": "text/markdown" },
    }));
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (call.tools?.length) {
          const toolResult = await call.executeTool?.(
            {
              id: "read-sqlite",
              type: "toolCall",
              name: "ambient_mcp_url_read",
              arguments: { url: "https://raw.githubusercontent.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server/main/README.md" },
            } as any,
            { url: "https://raw.githubusercontent.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server/main/README.md" },
          );
          expect(JSON.parse(typeof toolResult === "string" ? toolResult : toolResult?.text ?? "{}")).toMatchObject({
            status: "fetched",
            statusCode: 200,
          });
          return [
            "Evidence summary:",
            "No server.json, .mcp.json, registry, npm, PyPI, OCI, or remote endpoint evidence was found.",
            "No MCP metadata is present in standard descriptor files.",
            "No MCP server entry point was found in descriptor metadata.",
            "Dockerfile and CLI run commands are present.",
          ].join(" ");
        }
        throw new Error("Source-only FastMCP evidence should produce a deterministic custom-source candidate handoff.");
      },
    });

    expect(callCount).toBe(1);
    expect(result.sourceClassification).toMatchObject({
      kind: "mcp_candidate",
      confidence: "high",
    });
    expect(result.candidate).toMatchObject({
      id: "sqlite-explorer-fastmcp-mcp-server-source-mcp",
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "unknown",
      },
    });
    expect(result.validation.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "lane.unsupported_standard_source",
      "toolhive.package_required",
    ]));
    expect(result.candidate?.validationPlan.expectedTools).toEqual(expect.arrayContaining([
      "read_query",
      "list_tables",
      "describe_table",
    ]));
  });

  it("routes source-only MCP target hints to custom source review when discovery only fetched HTML", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>GitHub repository page</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server",
      instructions: "Classify this Awesome MCP six-pack GitHub-only Python source server. Do not hallucinate a PyPI package.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: true, maxFetches: 1, maxSearches: 0, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (call.tools?.length) {
          await call.executeTool?.(
            {
              id: "read-html",
              type: "toolCall",
              name: "ambient_mcp_url_read",
              arguments: { url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server" },
            } as any,
            { url: "https://github.com/hannesrudolph/sqlite-explorer-fastmcp-mcp-server" },
          );
          return "Evidence summary: only the GitHub HTML page was fetched; no standard package metadata was confirmed.";
        }
        throw new Error("HTML-only source hints should still produce a deterministic custom-source candidate handoff.");
      },
    });

    expect(callCount).toBe(1);
    expect(result.candidate).toMatchObject({
      id: "sqlite-explorer-fastmcp-mcp-server-source-mcp",
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "unknown",
      },
    });
    expect(result.validation.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "lane.unsupported_standard_source",
      "toolhive.package_required",
    ]));
    const text = mcpAutowirePlanResultText(result, { candidateRef: "ambient-mcp-candidate:sqlite:1234" });
    expect(text).toContain("Source-only ToolHive handoff:");
    expect(text).toContain("Status: blocked for direct import; ready for the reviewed ToolHive source-build path.");
    expect(text).toContain("Next tool: ambient_mcp_autowire_review");
    expect(text).toContain("\"candidateRef\": \"ambient-mcp-candidate:sqlite:1234\"");
    expect(text).toContain("\"expectedCandidateHash\":");
    expect(text).toContain("Forbidden alternatives:");
    expect(text).toContain("ambient_mcp_autowire_source_build_describe");
    expect(text).toContain("direct import is blocked");
  });

  it("falls back to custom source review when Pi returns an invalid source-only MCP schema", async () => {
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/example/source-only-server",
      instructions: "Classify this GitHub source server.",
      allowedDiscovery: { urlFetch: false, githubRaw: false, search: false, maxFetches: 0, maxSearches: 0, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      textCall: async () => {
        callCount += 1;
        return JSON.stringify({
          schemaVersion: "ambient-mcp-autowire-v1",
          id: "source-only-server",
          displayName: "Source Only Server",
          source: {
            type: "github",
            repo: "example/source-only-server",
            entryPoint: "server.py",
          },
          recommendedLane: "standard-mcp",
          runtime: {
            provider: "toolhive",
            sourceKind: "unknown",
            transport: "stdio",
            command: "python server.py",
          },
          permissions: {
            network: { mode: "none" },
            filesystem: { mode: "none" },
          },
          validationPlan: { smokeTestTool: "list_tables" },
          evidence: [{
            id: "bad-readme",
            type: "README",
            url: "https://github.com/example/source-only-server",
            summary: "README says this is a FastMCP MCP server.",
          }],
          openQuestions: [],
          riskSummary: { overall: "medium" },
        });
      },
    });

    expect(callCount).toBe(2);
    expect(result.candidate).toMatchObject({
      id: "source-only-server-source-mcp",
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "unknown",
      },
    });
    expect(result.validation.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "lane.unsupported_standard_source",
      "toolhive.package_required",
    ]));
  });

  it("recognizes scoped npm MCP packages from bounded discovery without waiting for JSON repair", async () => {
    const readme = mcpKatzillaInstallFailureReplay.discovery.masterReadmeExcerpt;
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/master/README.md")) {
        return new Response(readme, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    let callCount = 0;
    const progressEvents: Array<{ outputChars: number; thinkingChars: number; stage: string }> = [];

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/codeislaw101/katzilla-sdk",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 6, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (!call.tools?.length) {
          expect(call.responseFormat?.type).toBe("json_schema");
          expect(call.responseFormat?.type === "json_schema" ? call.responseFormat.json_schema.name : undefined).toBe("ambient_mcp_autowire_network_requirements");
          expect(call.onProgress).toEqual(expect.any(Function));
          call.onProgress?.({ outputChars: 51, thinkingChars: 0, elapsedMs: 200, idleElapsedMs: 0, idleTimeoutMs: 30_000, stage: "streaming" });
          return JSON.stringify({
            runtimeHosts: [{
              host: "api.katzilla.dev",
              ports: [443],
              purpose: "Katzilla runtime API calls.",
              confidence: "high",
              evidence: [{ locator: "discovery-summary", summary: "Discovery summary names https://api.katzilla.dev/v1 as the API host." }],
            }],
            nonRuntimeHosts: [],
            needsBroadNetwork: false,
            openQuestions: [],
          });
        }
        expect(call.onProgress).toEqual(expect.any(Function));
        call.onProgress?.({ outputChars: 23, thinkingChars: 7, elapsedMs: 100, idleElapsedMs: 0, idleTimeoutMs: 30_000, stage: "streaming" });
        const toolResult = await call.executeTool?.(
          {
            id: "read-katzilla",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/README.md" },
        );
        expect(JSON.parse(typeof toolResult === "string" ? toolResult : toolResult?.text ?? "{}")).toMatchObject({
          status: "fetched",
          statusCode: 200,
        });
        return [
          "Evidence summary:",
          "Katzilla SDK documents a Model Context Protocol server.",
          "Install command: npx -y @katzilla/mcp.",
          "Required secret: KATZILLA_API_KEY.",
          "API host: https://api.katzilla.dev/v1.",
        ].join(" ");
      },
      onProgress: (progress) => progressEvents.push({
        outputChars: progress.outputChars,
        thinkingChars: progress.thinkingChars,
        stage: progress.stage,
      }),
    });

    expect(callCount).toBe(2);
    expect(progressEvents).toEqual(expect.arrayContaining([
      { outputChars: 23, thinkingChars: 7, stage: "streaming" },
      { outputChars: 51, thinkingChars: 0, stage: "streaming" },
    ]));
    expect(result.sourceClassification).toMatchObject({
      kind: "mcp_candidate",
      confidence: "high",
    });
    expect(result.candidate).toMatchObject({
      id: mcpKatzillaInstallFailureReplay.candidate.id,
      displayName: mcpKatzillaInstallFailureReplay.candidate.displayName,
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "@katzilla/mcp",
          runtimeHint: "npx -y @katzilla/mcp",
        },
      },
      secrets: [
        expect.objectContaining({
          name: "KATZILLA_API_KEY",
          required: true,
          secret: true,
        }),
      ],
      permissions: {
        network: expect.objectContaining({
          mode: "allowlist",
          allowHosts: ["api.katzilla.dev"],
        }),
      },
    });
    expect(result.validation.status).toBe("ready-for-review");
    expect(result.discovery.suggestedUrls.slice(0, 3)).toContain(mcpKatzillaInstallFailureReplay.discovery.masterEvidenceUrls[0]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses session JSON network extraction instead of noisy GitHub page hosts for Brasil data MCP", async () => {
    const readme = [
      "# Brasil Data MCP",
      "Model Context Protocol server for Brazilian public data.",
      "Install command: npx -y brasil-data-mcp.",
      "Tools look up CEP data and Brazilian national holidays.",
      "Powered by BrasilAPI at https://brasilapi.com.br/api.",
    ].join("\n");
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) {
        return new Response(readme, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      return new Response("<script src=\"https://api.githubcopilot.com/assets.js\"></script>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/alanpcf/brasil-data-mcp",
      instructions: "Install this MCP.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (call.tools?.length) {
          await call.executeTool?.(
            {
              id: "read-brasil",
              type: "toolCall",
              name: "ambient_mcp_url_read",
              arguments: { url: "https://raw.githubusercontent.com/alanpcf/brasil-data-mcp/main/README.md" },
            } as any,
            { url: "https://raw.githubusercontent.com/alanpcf/brasil-data-mcp/main/README.md" },
          );
          return [
            "Evidence summary:",
            "README documents a Model Context Protocol server.",
            "Install command: npx -y brasil-data-mcp.",
            "Runtime data source: https://brasilapi.com.br/api.",
            "The GitHub HTML page also referenced https://api.githubcopilot.com/assets.js, which is page noise.",
          ].join(" ");
        }
        expect(call.responseFormat?.type).toBe("json_schema");
        expect(call.responseFormat?.type === "json_schema" ? call.responseFormat.json_schema.name : undefined).toBe("ambient_mcp_autowire_network_requirements");
        return JSON.stringify({
          runtimeHosts: [{
            host: "brasilapi.com.br",
            ports: [443],
            purpose: "BrasilAPI runtime lookups for CEP and national holidays.",
            confidence: "high",
            evidence: [{ locator: "discovery-summary", summary: "Discovery identifies BrasilAPI as the runtime data source." }],
          }],
          nonRuntimeHosts: [{ host: "api.githubcopilot.com", reason: "GitHub page asset, not runtime server API." }],
          needsBroadNetwork: false,
          openQuestions: [],
        });
      },
    });

    expect(callCount).toBe(2);
    expect(result.candidate).toMatchObject({
      id: "brasil-data-mcp-standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "brasil-data-mcp",
        },
      },
      permissions: {
        network: expect.objectContaining({
          mode: "allowlist",
          allowHosts: ["brasilapi.com.br"],
          allowPorts: [443],
        }),
      },
    });
    expect(result.candidate?.permissions.network.allowHosts).not.toContain("api.githubcopilot.com");
  });

  it("keeps local SQLite package MCP network disabled despite README badge and social links", async () => {
    const readme = [
      "# mcp-server-sqlite",
      "Query SQLite databases, inspect schemas, and explain queries from your AI assistant.",
      "Install command: npx mcp-sqlite-server.",
      "Works with local `.db` files, no auth needed.",
      "Read-only by default for safety.",
      "Badges and author links: https://static.modelcontextprotocol.io/badge.svg https://www.typescriptlang.org https://linkedin.com/in/ofershap https://ofershap.github.io",
    ].join("\n");
    const packageJson = JSON.stringify({
      name: "mcp-sqlite-server",
      bin: { "mcp-sqlite-server": "dist/index.js" },
      dependencies: { "@modelcontextprotocol/sdk": "^1.0.0", "better-sqlite3": "^11.0.0" },
    });
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) return new Response(readme, { status: 200, headers: { "content-type": "text/markdown" } });
      if (url.endsWith("/package.json")) return new Response(packageJson, { status: 200, headers: { "content-type": "application/json" } });
      if (url.endsWith("/server.json")) return new Response(JSON.stringify({ name: "mcp-sqlite-server" }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("<a href=\"https://linkedin.com/in/ofershap\">author</a>", { status: 200, headers: { "content-type": "text/html" } });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/ofershap/mcp-server-sqlite",
      instructions: "Install this MCP with read-only access to /tmp/library.db.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 5, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (call.tools?.length) {
          await call.executeTool?.(
            {
              id: "read-sqlite",
              type: "toolCall",
              name: "ambient_mcp_url_read",
              arguments: { url: "https://raw.githubusercontent.com/ofershap/mcp-server-sqlite/main/README.md" },
            } as any,
            { url: "https://raw.githubusercontent.com/ofershap/mcp-server-sqlite/main/README.md" },
          );
          return [
            "Evidence summary:",
            "README documents a Model Context Protocol server.",
            "Install command: npx mcp-sqlite-server.",
            "Works with local .db files, no auth needed, and read-only by default.",
            "Author and badge links are not runtime APIs.",
          ].join(" ");
        }
        return JSON.stringify({
          runtimeHosts: [{
            host: "linkedin.com",
            ports: [443],
            purpose: "Runtime API access.",
            confidence: "low",
            evidence: [{ locator: "README.md", summary: "Noisy author/social link." }],
          }, {
            host: "static.modelcontextprotocol.io",
            ports: [443],
            purpose: "Runtime API access.",
            confidence: "low",
            evidence: [{ locator: "README.md", summary: "Noisy badge link." }],
          }],
          nonRuntimeHosts: [],
          needsBroadNetwork: false,
          openQuestions: [],
        });
      },
    });

    expect(result.candidate).toMatchObject({
      id: "mcp-sqlite-server-standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "mcp-sqlite-server",
        },
      },
      permissions: {
        network: {
          mode: "disabled",
          allowHosts: [],
          allowPorts: [],
        },
        filesystem: {
          extraMounts: [expect.objectContaining({
            path: "/tmp/library.db",
            containerPath: "/projects/library.db",
            mode: "read-only",
          })],
        },
      },
    });
    expect(result.candidate?.openQuestions).toEqual([]);
    expect(result.candidate?.riskSummary.reasons.join("\n")).toContain("local SQLite/database files");
  });

  it("replays Katzilla master-branch source search before fetch budget is wasted on main", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/codeislaw101/katzilla-sdk")) {
        return new Response(JSON.stringify({ default_branch: "master" }), { status: 200 });
      }
      if (url.includes("/git/trees/master")) {
        return new Response(JSON.stringify({
          tree: [
            { path: "README.md", type: "blob" },
            { path: "packages/mcp/README.md", type: "blob" },
            { path: "packages/mcp/package.json", type: "blob" },
            { path: "packages/sdk/src/client.ts", type: "blob" },
            { path: "packages/web/package.json", type: "blob" },
          ],
          truncated: false,
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const searches: McpAutowirePlanResult["discovery"]["searches"] = [];

    const output = await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_source_search" },
      { query: "mcp server package readme", limit: 4 },
      {
        target: { url: new URL(mcpKatzillaInstallFailureReplay.discovery.githubTarget), github: { owner: "codeislaw101", repo: "katzilla-sdk" } },
        grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
        fetches: [],
        searches,
        fetchImpl,
      },
    );
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      status: "searched",
      source: "github-tree",
      defaultBranch: "master",
    });
    expect(parsed.results.map((result: any) => result.rawUrl)).toEqual(expect.arrayContaining([...mcpKatzillaInstallFailureReplay.discovery.masterEvidenceUrls]));
    for (const mainUrl of mcpKatzillaInstallFailureReplay.discovery.failedMainBranchUrls) {
      expect(parsed.results.map((result: any) => result.rawUrl)).not.toContain(mainUrl);
    }
  });

  it("accepts npm package identifiers as autowire targets without an HTTPS URL workaround", async () => {
    const result = await planMcpAutowire({
      targetUrl: "npm:@katzilla/mcp",
      allowedDiscovery: { urlFetch: false, githubRaw: false, search: false, maxFetches: 0, maxSearches: 0 },
    }, {
      apiKey: "test-key",
    });

    expect(result.targetUrl).toBe("https://www.npmjs.com/package/@katzilla/mcp");
    expect(result.discovery.suggestedUrls).toEqual([
      "https://registry.npmjs.org/%40katzilla%2fmcp",
      "https://www.npmjs.com/package/@katzilla/mcp",
    ]);
    expect(result.candidate).toMatchObject({
      id: "katzilla-mcp-standard-mcp",
      displayName: "Katzilla MCP",
      recommendedLane: "standard-mcp",
      source: {
        kind: "other",
        packageName: "@katzilla/mcp",
      },
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "@katzilla/mcp",
          runtimeHint: "npx -y @katzilla/mcp",
        },
      },
    });
    expect(result.validation.status).toBe("ready-for-review");
  });

  it("prefers fetched package.json name over README npx examples for Standard MCP packages", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) {
        return new Response([
          "# Mermaid Grammer Inspector",
          "Model Context Protocol server for Mermaid grammar inspection.",
          'Cursor config args: ["-y", "mermaid-grammer-inspector"]',
        ].join("\n"), {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      if (url.endsWith("/package.json")) {
        return new Response(JSON.stringify({
          name: "@bjmhe/mermaid-grammer-inspector-mcp",
          bin: {
            "mermaid-grammer-inspector-mcp": "./dist/index.js",
          },
          dependencies: {
            "@modelcontextprotocol/sdk": "^1.0.0",
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/bjmhe-archived/mermaid-grammer-inspector-mcp",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (!call.tools?.length) throw new Error("Mermaid package evidence should produce a deterministic candidate.");
        await call.executeTool?.(
          {
            id: "read-readme",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/bjmhe-archived/mermaid-grammer-inspector-mcp/main/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/bjmhe-archived/mermaid-grammer-inspector-mcp/main/README.md" },
        );
        await call.executeTool?.(
          {
            id: "read-package",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/bjmhe-archived/mermaid-grammer-inspector-mcp/main/package.json" },
          } as any,
          { url: "https://raw.githubusercontent.com/bjmhe-archived/mermaid-grammer-inspector-mcp/main/package.json" },
        );
        return [
          "Evidence summary:",
          "README documents a Model Context Protocol server with npx mermaid-grammer-inspector.",
          "package.json name is @bjmhe/mermaid-grammer-inspector-mcp and depends on @modelcontextprotocol/sdk.",
        ].join(" ");
      },
    });

    expect(result.candidate).toMatchObject({
      id: "bjmhe-mermaid-grammer-inspector-mcp-standard-mcp",
      source: {
        packageName: "@bjmhe/mermaid-grammer-inspector-mcp",
      },
      runtime: {
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "@bjmhe/mermaid-grammer-inspector-mcp",
          runtimeHint: "npx -y @bjmhe/mermaid-grammer-inspector-mcp",
        },
      },
    });
    expect(mcpAutowirePlanResultText(result)).toContain("ambient_mcp_standard_import_describe");
  });

  it("adds managed browser update policy without promoting eval-only API keys to install secrets", async () => {
    const readme = [
      "# Playwright MCP Server",
      "A Model Context Protocol server that provides browser automation capabilities using Playwright.",
      "Install with npx -y @executeautomation/playwright-mcp-server.",
      "The server can take screenshots and run browser actions through MCP tools.",
      "Running evals:",
      "OPENAI_API_KEY=your-key npx mcp-eval src/evals/evals.ts src/tools/codegen/index.ts",
    ].join("\n");
    const packageJson = JSON.stringify({
      name: "@executeautomation/playwright-mcp-server",
      bin: {
        "playwright-mcp-server": "./dist/index.js",
      },
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.0.0",
        "@playwright/browser-chromium": "^1.0.0",
      },
    });
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) {
        return new Response(readme, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      if (url.endsWith("/package.json")) {
        return new Response(packageJson, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/executeautomation/mcp-playwright",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (!call.tools?.length) throw new Error("Playwright package evidence should produce a deterministic candidate.");
        await call.executeTool?.(
          {
            id: "read-readme",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/executeautomation/mcp-playwright/main/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/executeautomation/mcp-playwright/main/README.md" },
        );
        await call.executeTool?.(
          {
            id: "read-package",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/executeautomation/mcp-playwright/main/package.json" },
          } as any,
          { url: "https://raw.githubusercontent.com/executeautomation/mcp-playwright/main/package.json" },
        );
        return [
          "Evidence summary:",
          "README documents a Model Context Protocol server for Playwright browser automation.",
          "package.json name is @executeautomation/playwright-mcp-server and depends on @modelcontextprotocol/sdk.",
          "README eval instructions mention OPENAI_API_KEY for upstream tests, not runtime installation.",
        ].join(" ");
      },
    });

    expect(result.candidate).toMatchObject({
      id: "executeautomation-playwright-mcp-server-standard-mcp",
      runtime: {
        sourceKind: "npm",
        package: {
          identifier: "@executeautomation/playwright-mcp-server",
          runtimeImage: "node:22-alpine",
        },
        updatePolicy: {
          mode: "managed-browser-security",
        },
      },
    });
    expect(result.candidate?.secrets.map((secret) => secret.name)).not.toContain("OPENAI_API_KEY");
    expect(result.validation.blockers.map((issue) => issue.code)).not.toContain("runtime.browser_update_policy_required");
    expect(result.validation.status).toBe("ready-for-review");
  });

  it("keeps Qdrant local-mode API keys optional in deterministic standard candidates", async () => {
    const pyproject = [
      "[project]",
      'name = "mcp-server-qdrant"',
      'description = "MCP server for retrieving context from a Qdrant vector database"',
      "dependencies = [",
      '  "fastembed>=0.6.0",',
      '  "fastmcp==2.7.0",',
      '  "qdrant-client>=1.12.0",',
      "]",
      "",
      "[project.scripts]",
      'mcp-server-qdrant = "mcp_server_qdrant.main:main"',
    ].join("\n");
    const readme = [
      "# mcp-server-qdrant: A Qdrant MCP server",
      "This is an official Model Context Protocol server for keeping and retrieving memories in Qdrant.",
      "Environment Variables:",
      "| Name | Description | Default Value |",
      "| `QDRANT_URL` | URL of the Qdrant server | None |",
      "| `QDRANT_API_KEY` | API key for the Qdrant server | None |",
      "| `QDRANT_LOCAL_PATH` | Path to the local Qdrant database, alternative to `QDRANT_URL` | None |",
      "Remote mode example: QDRANT_URL=\"https://example.qdrant.io\" QDRANT_API_KEY=\"your-api-key\" uvx mcp-server-qdrant",
      "For local Qdrant mode, set QDRANT_LOCAL_PATH and omit QDRANT_API_KEY.",
    ].join("\n");
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) {
        return new Response(readme, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      if (url.endsWith("/pyproject.toml")) {
        return new Response(pyproject, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await planMcpAutowire({
      targetUrl: "https://github.com/qdrant/mcp-server-qdrant",
      instructions: "Distinguish local Qdrant path mode from remote URL mode; QDRANT_API_KEY should not be required for local mode.",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        if (!call.tools?.length) throw new Error("Qdrant package evidence should produce a deterministic candidate.");
        await call.executeTool?.(
          {
            id: "read-readme",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/qdrant/mcp-server-qdrant/master/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/qdrant/mcp-server-qdrant/master/README.md" },
        );
        await call.executeTool?.(
          {
            id: "read-pyproject",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/qdrant/mcp-server-qdrant/master/pyproject.toml" },
          } as any,
          { url: "https://raw.githubusercontent.com/qdrant/mcp-server-qdrant/master/pyproject.toml" },
        );
        return [
          "Evidence summary:",
          "README documents a Qdrant Model Context Protocol server.",
          "pyproject.toml project name is mcp-server-qdrant.",
          "QDRANT_API_KEY defaults to None and should not be required for local QDRANT_LOCAL_PATH mode.",
        ].join(" ");
      },
    });

    expect(result.candidate).toMatchObject({
      id: "mcp-server-qdrant-standard-mcp",
      runtime: {
        sourceKind: "pypi",
        package: {
          identifier: "mcp-server-qdrant",
          runtimeImage: "python:3.11-slim",
        },
      },
      secrets: [
        expect.objectContaining({
          name: "QDRANT_API_KEY",
          required: false,
        }),
      ],
    });
    expect(result.candidate?.runtime.updatePolicy).toBeUndefined();
    expect(result.candidate?.validationPlan.preflights).not.toContain("secret:QDRANT_API_KEY");
    expect(result.validation.status).toBe("ready-for-review");
  });

  it("normalizes git+https GitHub targets, parses pyproject package identity, and keeps optional tokens optional", async () => {
    const pyproject = [
      "[project]",
      'name = "mcp-techtrend"',
      'dependencies = [',
      '  "mcp>=1.0.0",',
      '  "httpx>=0.28.0",',
      "]",
      "",
      "[project.scripts]",
      'trends-mcp = "trends_mcp:main"',
    ].join("\n");
    const readme = [
      "# mcp-techTrend",
      "A Model Context Protocol server for GitHub trending repositories.",
      "Install with uvx mcp-techtrend or clone the repository and run the trends-mcp entry point.",
      "GITHUB_TOKEN is optional. Anonymous GitHub requests work, but the token raises the rate limit.",
    ].join("\n");
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/README.md")) {
        return new Response(readme, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        });
      }
      if (url.endsWith("/pyproject.toml")) {
        return new Response(pyproject, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    let callCount = 0;

    const result = await planMcpAutowire({
      targetUrl: "git+https://github.com/salwks/mcp-techTrend",
      allowedDiscovery: { urlFetch: true, githubRaw: true, search: false, maxFetches: 4, maxBytesPerFetch: 12_000 },
    }, {
      apiKey: "test-key",
      fetchImpl,
      textCall: async (call) => {
        callCount += 1;
        if (!call.tools?.length) throw new Error("TechTrend pyproject evidence should produce a deterministic candidate before candidate JSON generation.");
        await call.executeTool?.(
          {
            id: "read-readme",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/salwks/mcp-techTrend/main/README.md" },
          } as any,
          { url: "https://raw.githubusercontent.com/salwks/mcp-techTrend/main/README.md" },
        );
        await call.executeTool?.(
          {
            id: "read-pyproject",
            type: "toolCall",
            name: "ambient_mcp_url_read",
            arguments: { url: "https://raw.githubusercontent.com/salwks/mcp-techTrend/main/pyproject.toml" },
          } as any,
          { url: "https://raw.githubusercontent.com/salwks/mcp-techTrend/main/pyproject.toml" },
        );
        return [
          "Evidence summary:",
          "README documents a Model Context Protocol server.",
          "pyproject.toml project name is mcp-techtrend with mcp dependency and trends-mcp script.",
          "GITHUB_TOKEN is optional for higher GitHub rate limits.",
        ].join(" ");
      },
    });

    expect(callCount).toBe(1);
    expect(result.targetUrl).toBe("https://github.com/salwks/mcp-techTrend");
    expect(result.candidate).toMatchObject({
      id: "mcp-techtrend-standard-mcp",
      displayName: "MCP Techtrend",
      source: {
        kind: "github",
        url: "https://github.com/salwks/mcp-techTrend",
        packageName: "mcp-techtrend",
      },
      runtime: {
        provider: "toolhive",
        sourceKind: "pypi",
        package: {
          registryType: "pypi",
          identifier: "mcp-techtrend",
          runtimeHint: "uvx mcp-techtrend (entrypoint trends-mcp from mcp-techtrend)",
          entrypoint: {
            kind: "package-bin",
            command: "trends-mcp",
            fromPackage: "mcp-techtrend",
          },
        },
      },
      secrets: [
        expect.objectContaining({
          name: "GITHUB_TOKEN",
          required: false,
        }),
      ],
    });
    expect(result.candidate?.validationPlan.preflights).not.toContain("secret:GITHUB_TOKEN");
    expect(result.candidate?.evidence[0]?.locator).toContain("pyproject.toml");
    expect(result.validation.status).toBe("ready-for-review");
  });

  it("enforces the low-level fetch budget and byte cap", async () => {
    const fetches: McpAutowirePlanResult["discovery"]["fetches"] = [];
    const first = await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_url_read" },
      { url: "https://raw.githubusercontent.com/upstash/context7/master/README.md" },
      {
        target: { url: new URL("https://github.com/upstash/context7"), github: { owner: "upstash", repo: "context7" } },
        grants: { urlFetch: true, githubRaw: true, search: false, maxFetches: 1, maxSearches: 0, maxBytesPerFetch: 5 },
        fetches,
        fetchImpl: async () => new Response("0123456789", { status: 200 }),
      },
    );
    const second = await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_url_read" },
      { url: "https://raw.githubusercontent.com/upstash/context7/master/server.json" },
      {
        target: { url: new URL("https://github.com/upstash/context7"), github: { owner: "upstash", repo: "context7" } },
        grants: { urlFetch: true, githubRaw: true, search: false, maxFetches: 1, maxSearches: 0, maxBytesPerFetch: 5 },
        fetches,
        fetchImpl: async () => new Response("should not fetch", { status: 200 }),
      },
    );

    expect(JSON.parse(first)).toMatchObject({
      status: "fetched",
      text: "01234",
      totalChars: 10,
      returnedChars: 5,
      truncated: true,
    });
    expect(JSON.parse(second)).toMatchObject({
      status: "blocked",
      reason: "Fetch budget exhausted at 1 URL(s).",
    });
  });

  it("searches the target GitHub repo tree for likely MCP evidence paths", async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith("/repos/upstash/context7")) {
        return new Response(JSON.stringify({ default_branch: "master" }), { status: 200 });
      }
      if (url.includes("/git/trees/master")) {
        return new Response(JSON.stringify({
          tree: [
            { path: "README.md", type: "blob" },
            { path: "server.json", type: "blob" },
            { path: "package.json", type: "blob" },
            { path: "docs/usage.md", type: "blob" },
            { path: "dist/generated.js", type: "blob" },
          ],
          truncated: false,
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const searches: McpAutowirePlanResult["discovery"]["searches"] = [];

    const output = await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_source_search" },
      { query: "mcp server package readme", limit: 4 },
      {
        target: { url: new URL("https://github.com/upstash/context7"), github: { owner: "upstash", repo: "context7" } },
        grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
        fetches: [],
        searches,
        fetchImpl,
      },
    );
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      status: "searched",
      source: "github-tree",
      defaultBranch: "master",
      resultCount: 3,
    });
    expect(parsed.results.map((result: any) => result.path)).toEqual(["server.json", "package.json", "README.md"]);
    expect(parsed.results[0].rawUrl).toBe("https://raw.githubusercontent.com/upstash/context7/master/server.json");

    const budgetBlocked = await executeAutowireDiscoveryTool(
      { name: "ambient_mcp_source_search" },
      { query: "bridge", limit: 4 },
      {
        target: { url: new URL("https://github.com/upstash/context7"), github: { owner: "upstash", repo: "context7" } },
        grants: { urlFetch: true, githubRaw: true, search: true, maxFetches: 2, maxSearches: 1, maxBytesPerFetch: 12_000 },
        fetches: [],
        searches,
        fetchImpl,
      },
    );
    expect(JSON.parse(budgetBlocked)).toMatchObject({
      status: "blocked",
      reason: "Search budget exhausted at 1 search(es).",
    });
  });
});
