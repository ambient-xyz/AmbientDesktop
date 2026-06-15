import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  McpInstallCatalog,
  mcpDefaultCatalogUpdatePreviewText,
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstallPreviewSecretBindings,
  mcpInstalledServersText,
  mcpRemoteMcpProxyPreviewText,
  mcpRegistryInstallPreviewText,
  mcpStandardImportPreviewText,
  mcpServerSearchResultsText,
  registryInfoToAutowireCandidate,
  type McpPackageMetadataResolver,
} from "./mcpInstallCatalog";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import {
  TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "./toolHiveRuntimeService";
import { mcpDefaultCatalogDescriptorHash, parseDefaultCatalogDescriptor, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { validateMcpAutowireCandidate, type McpAutowireCandidate } from "./mcpAutowireSchemas";

const githubSecretRef = `ambient-secret-ref:v1:${"a".repeat(64)}`;
const context7SecretRef = `ambient-secret-ref:v1:${"b".repeat(64)}`;

describe("McpInstallCatalog", () => {
  it("searches registry servers with installed-state and compact review hints", async () => {
    const { catalog, service } = await fixtureCatalog();
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7",
          permissionProfilePath: "/tmp/context7.permissions.json",
          permissionProfileSha256: "abc123",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });

    const results = await catalog.searchRegistryServers({ query: "docs", limit: 5 });

    expect(results).toEqual([
      expect.objectContaining({
        serverId: "io.github.stacklok/context7",
        title: "Context7",
        catalogSource: "ambient-default+toolhive-registry",
        installed: true,
        workloadName: "ambient-context7",
        tools: ["resolve-library-id", "query-docs"],
        riskHints: expect.arrayContaining(["Supports optional secret-backed functionality."]),
      }),
    ]);
    expect(mcpServerSearchResultsText(results)).toContain("Use ambient_mcp_server_describe");
  });

  it("surfaces Ambient-recommended Scrapling handoff for web scraping searches", async () => {
    const { catalog } = await fixtureCatalog();

    const results = await catalog.searchRegistryServers({ query: "web scraping", limit: 5 });

    expect(results[0]).toMatchObject({
      serverId: "io.github.d4vinci/scrapling",
      catalogSource: "ambient-default",
      nextAction: expect.stringContaining("default capability installer"),
    });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serverId: "scrapling-github-server-json",
        title: "Scrapling MCP Server",
        catalogSource: "ambient-recommended-standard-import",
        repositoryUrl: "https://github.com/D4Vinci/Scrapling",
        tools: expect.arrayContaining(["get", "fetch"]),
        nextAction: expect.stringContaining("ambient_mcp_autowire_plan"),
      }),
    ]));
    const text = mcpServerSearchResultsText(results);
    expect(text).toContain("Built-in defaults are routed by Ambient through the default capability installer");
    expect(text).toContain("Ambient-recommended Standard MCP import");
    expect(text).toContain("targetUrl=https://github.com/D4Vinci/Scrapling");
  });

  it("treats wildcard registry searches as an unfiltered catalog listing", async () => {
    const { catalog } = await fixtureCatalog();

    const results = await catalog.searchRegistryServers({ query: "*", limit: 4 });

    expect(results.length).toBe(4);
    expect(results.map((result) => result.serverId)).toEqual(expect.arrayContaining([
      "io.github.stacklok/context7",
      "io.github.d4vinci/scrapling",
    ]));
  });

  it("searches and describes built-in default descriptors when ToolHive registry metadata is unavailable", async () => {
    const { catalog } = await fixtureCatalog({
      failRegistryList: true,
      failRegistryInfo: true,
      defaultCatalog: [context7DefaultDescriptor],
    });

    const results = await catalog.searchRegistryServers({ query: "context", limit: 5 });
    expect(results).toEqual([
      expect.objectContaining({
        serverId: "io.github.stacklok/context7",
        catalogSource: "ambient-default",
        title: "Context7",
      }),
    ]);
    expect(mcpServerSearchResultsText(results)).toContain("built-in default");

    const preview = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/context7", refresh: true });
    expect(preview.catalogSource).toBe("ambient-default");
    expect(preview.defaultDescriptor?.promotion.reviewStatus).toBe("reviewed");
    expect(preview.review.blockers).toEqual([]);
    expect(preview.runPlan?.serverId).toBe("io.github.stacklok/context7");
    expect(mcpRegistryInstallPreviewText(preview)).toContain("Catalog source: ambient-default");
  });

  it("does not turn Ambient default OCI capabilities into registry run plans", async () => {
    const { catalog } = await fixtureCatalog({
      failRegistryList: true,
      failRegistryInfo: true,
      defaultCatalog: [scraplingDefaultDescriptor],
    });

    const results = await catalog.searchRegistryServers({ query: "scrapling", limit: 5 });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serverId: "io.github.d4vinci/scrapling",
        title: "Scrapling",
        catalogSource: "ambient-default",
        tools: expect.arrayContaining(["get", "fetch"]),
      }),
    ]));

    const preview = await catalog.previewRegistryInstall({ serverId: "io.github.d4vinci/scrapling", refresh: true });
    expect(preview.runPlan).toBeUndefined();
    expect(preview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("default capability reconciler"),
    ]));
    expect(mcpRegistryInstallPreviewText(preview)).toContain("Run plan: not generated");
  });

  it("previews Ambient default OCI capability installs through the reconciler-owned path", async () => {
    const { catalog } = await fixtureCatalog({
      failRegistryList: true,
      failRegistryInfo: true,
      defaultCatalog: [scraplingDefaultDescriptor],
    });

    const preview = await catalog.previewDefaultCapabilityInstall({ capabilityId: "scrapling" });

    expect(preview).toMatchObject({
      serverId: "io.github.d4vinci/scrapling",
      capabilityId: "scrapling",
      catalogSource: "ambient-default",
      toolHiveRunSource: "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
      toolHiveServerArgs: ["mcp"],
      runPlan: {
        workloadName: "ambient-scrapling",
        sourceRef: "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
        transport: "stdio",
      },
    });
    expect(preview.review.blockers).toEqual([]);
    expect(catalog.defaultCapabilityIdForServerId("io.github.d4vinci/scrapling")).toBe("scrapling");
    expect(mcpDefaultCapabilityInstallPreviewText(preview)).toContain("Default capability: scrapling");
    expect(mcpDefaultCapabilityInstallPreviewText(preview)).toContain("ambient_mcp_server_install");
    expect(preview.permissionProfile.profile).toMatchObject({
      network: {
        outbound: {
          insecure_allow_all: true,
          allow_port: [80, 443],
        },
      },
    });
  });

  it("previews a low-risk registry install with permission profile and run plan", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/context7" });

    expect(preview.candidate).toMatchObject({
      source: {
        kind: "toolhive-registry",
        registryId: "io.github.stacklok/context7",
        url: "https://github.com/upstash/context7",
      },
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "registry",
        package: {
          registryType: "oci",
          identifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
          version: "2.1.8",
        },
      },
      permissions: {
        network: {
          mode: "allowlist",
          allowHosts: ["context7.com"],
          allowPorts: [443],
        },
      },
    });
    expect(preview.validation.status).toBe("ready-for-review");
    expect(preview.review.blockers).toEqual([]);
    expect(preview.review.warnings).toContain("Optional secret CONTEXT7_API_KEY is not bound; the server may run with lower limits or reduced functionality.");
    expect(preview.runPlan).toMatchObject({
      serverId: "io.github.stacklok/context7",
      group: "ambient",
      isolateNetwork: true,
      sourceRef: "toolhive-registry:io.github.stacklok/context7",
      transport: "stdio",
    });
    expect(await readFile(preview.permissionProfile.path, "utf8")).toContain("context7.com");
    expect(mcpRegistryInstallPreviewText(preview)).toContain("Blockers: none.");
  });

  it("requires explicit runtime volumes for filesystem registry servers and reflects them in review", async () => {
    const { catalog } = await fixtureCatalog({ registryEntries: [filesystemInfo] });

    const blocked = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/filesystem" });

    expect(blocked.runPlan).toBeUndefined();
    expect(blocked.review.blockers.join("\n")).toContain("requires at least one explicit runtimeVolumes mount");

    const preview = await catalog.previewRegistryInstall({
      serverId: "io.github.stacklok/filesystem",
      runtimeVolumes: [{
        hostPath: "/tmp/ambient-filesystem-fixture",
        containerPath: "/projects/fixture",
        mode: "ro",
        purpose: "Read the user's requested fixture directory.",
      }],
    });

    expect(preview.review.blockers).toEqual([]);
    expect(preview.toolHiveVolumes).toEqual([{
      hostPath: "/tmp/ambient-filesystem-fixture",
      containerPath: "/projects/fixture",
      mode: "ro",
      purpose: "Read the user's requested fixture directory.",
    }]);
    expect(preview.review.permissionSummary).toContain("/tmp/ambient-filesystem-fixture->/projects/fixture:read-only");
    expect(mcpRegistryInstallPreviewText(preview)).toContain("- volumes: /tmp/ambient-filesystem-fixture -> /projects/fixture:ro");
    await expect(readFile(preview.permissionProfile.path, "utf8")).resolves.toContain("/projects/fixture");
  });

  it("blocks required secrets until Ambient-managed secret refs are provided", async () => {
    const { catalog } = await fixtureCatalog();

    const missing = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/github" });

    expect(missing.review.blockers).toContain("Required secret GITHUB_PERSONAL_ACCESS_TOKEN must be bound through ambient_mcp_secret_request before install; never ask for the value in chat or create placeholder secret files.");
    expect(missing.runPlan).toBeUndefined();

    const ready = await catalog.previewRegistryInstall({
      serverId: "io.github.stacklok/github",
      secretBindings: [{ envName: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef: githubSecretRef }],
    });

    expect(ready.review.blockers).toEqual([]);
    expect(ready.runPlan?.envSecretRefs).toEqual([{ envName: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef: githubSecretRef }]);
    expect(mcpInstallPreviewSecretBindings(ready)).toEqual([
      expect.objectContaining({
        envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
        secretRef: githubSecretRef,
        derivedBindings: [
          expect.objectContaining({
            kind: "container-env-file",
            runtimeName: "GITHUB_PERSONAL_ACCESS_TOKEN",
          }),
        ],
      }),
    ]);
    expect(mcpRegistryInstallPreviewText(ready)).toContain("local containerized MCP secrets use short-lived ToolHive --env-file delivery");
    expect(mcpRegistryInstallPreviewText(ready)).toContain("deleted after launch");
  });

  it("keeps broad-network registry servers installable only with explicit warnings", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/fetch" });

    expect(preview.candidate.permissions.network).toMatchObject({
      mode: "broad",
      justification: "ToolHive registry permissions request broad outbound network access.",
    });
    expect(preview.validation.warnings.map((issue) => issue.code)).toContain("network.broad_review");
    expect(preview.review.blockers).toEqual([]);
    expect(preview.runPlan?.serverId).toBe("io.github.stacklok/fetch");
    expect(mcpRegistryInstallPreviewText(preview)).toContain("Broad network egress requires explicit user review.");
  });

  it("rejects secret bindings not declared by registry metadata", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewRegistryInstall({
      serverId: "io.github.stacklok/context7",
      secretBindings: [{ envName: "NOT_DECLARED", secretRef: "ambient-secret://bad/ref" }],
    });

    expect(preview.review.blockers).toContain("Secret binding NOT_DECLARED is not declared by ToolHive registry metadata for this server.");
    expect(preview.review.blockers).toContain("Secret binding NOT_DECLARED must use an Ambient-managed secret reference.");
    expect(preview.runPlan).toBeUndefined();
  });

  it("turns registry info into a schema-valid autowire candidate without trusting malformed repository URLs", () => {
    const candidate = registryInfoToAutowireCandidate({
      ...context7Info,
      repository_url: "not a url",
    });

    expect(candidate.source).not.toHaveProperty("url");
    expect(candidate.evidence[0].locator).toBe("toolhive registry info io.github.stacklok/context7");
  });

  it("adds a managed browser update policy for browser-class registry candidates", () => {
    const candidate = registryInfoToAutowireCandidate(browserInfo);
    const validation = validateMcpAutowireCandidate(candidate);

    expect(candidate.runtime.updatePolicy).toMatchObject({
      mode: "managed-browser-security",
      evidenceRefs: ["toolhive-registry-info"],
    });
    expect(validation.blockers.map((issue) => issue.code)).not.toContain("runtime.browser_update_policy_required");
    expect(validation.status).toBe("ready-for-review");
  });

  it("previews package-backed Standard MCP imports from autowire candidates", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewStandardMcpImport({ candidate: mcpAutowirePhase0Fixtures.scrapling });

    expect(preview).toMatchObject({
      serverId: "scrapling-github-server-json",
      catalogSource: "standard-mcp-import",
      toolHiveRunSource: "uvx://scrapling",
      toolHiveServerArgs: ["mcp"],
      review: {
        blockers: [],
        outcome: "ready",
      },
      runPlan: {
        serverId: "scrapling-github-server-json",
        sourceRef: "server-json:https://github.com/D4Vinci/Scrapling",
        transport: "stdio",
      },
    });
    expect(preview.review.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("network.broad_review"),
      expect.stringContaining("package.unpinned"),
    ]));
    await expect(readFile(preview.permissionProfile.path, "utf8")).resolves.toContain("insecure_allow_all");
    expect(mcpStandardImportPreviewText(preview)).toContain("thv source: uvx://scrapling");
    expect(mcpStandardImportPreviewText(preview)).toContain("server args: mcp");
    expect(mcpStandardImportPreviewText(preview)).toContain("Next: call ambient_mcp_standard_import_install");
    expect(mcpStandardImportPreviewText(preview)).toContain("Do not route this immediate next step back through ambient_tool_search.");

    const switchCandidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    switchCandidate.id = "csvglow-standard-mcp";
    switchCandidate.displayName = "Csvglow";
    switchCandidate.runtime.sourceKind = "pypi";
    switchCandidate.runtime.package = {
      registryType: "pypi",
      identifier: "csvglow",
      runtimeHint: "uvx csvglow --mcp",
      packageArguments: [{ type: "switch", name: "--mcp", isFixed: true }],
    };
    const switchPreview = await catalog.previewStandardMcpImport({ candidate: switchCandidate });
    expect(switchPreview.toolHiveRunSource).toBe("uvx://csvglow");
    expect(switchPreview.toolHiveServerArgs).toEqual(["--mcp"]);
    expect(mcpStandardImportPreviewText(switchPreview)).toContain("server args: --mcp");

    const alternateEntrypointCandidate = structuredClone(switchCandidate) as McpAutowireCandidate;
    alternateEntrypointCandidate.source = {
      kind: "github",
      url: "https://github.com/Ratnaditya-J/csvglow",
      packageName: "csvglow",
      evidenceRefs: ["discovery-summary"],
    };
    alternateEntrypointCandidate.runtime.package = {
      registryType: "pypi",
      identifier: "csvglow",
      runtimeHint: "uvx csvglow (entrypoint csvglow-mcp from csvglow)",
      entrypoint: {
        kind: "package-bin",
        command: "csvglow-mcp",
        fromPackage: "csvglow",
      },
      packageArguments: [],
    };
    const alternatePreview = await catalog.previewStandardMcpImport({ candidate: alternateEntrypointCandidate });
    expect(alternatePreview.runPlan).toBeUndefined();
    expect(alternatePreview.toolHiveEntrypoint).toBe("package-bin csvglow-mcp from csvglow");
    expect(alternatePreview.fallbackRoutes[0]).toMatchObject({
      kind: "custom-source-build",
      nextToolName: "ambient_mcp_autowire_source_build_describe",
    });
    expect(alternatePreview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("Package-bin entrypoint csvglow-mcp from csvglow cannot be encoded"),
    ]));
    expect(alternatePreview.review.outcome).toBe("deferred-unsupported-lane");

    const envCandidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    envCandidate.runtime.package!.runtimeImage = "python:3.11-slim";
    envCandidate.runtime.package!.packageArguments = [
      ...envCandidate.runtime.package!.packageArguments,
      {
        type: "env",
        name: "QDRANT_URL",
        valueHint: "http://localhost:6333",
        isFixed: true,
      },
    ];
    const envPreview = await catalog.previewStandardMcpImport({ candidate: envCandidate });
    expect(envPreview.review.blockers).toEqual([]);
    expect(envPreview.toolHiveEnvVars).toEqual([{ name: "QDRANT_URL", value: "http://localhost:6333" }]);
    expect(envPreview.toolHiveRuntimeImage).toBe("python:3.11-slim");
    expect(mcpStandardImportPreviewText(envPreview)).toContain("env vars: QDRANT_URL");
    expect(mcpStandardImportPreviewText(envPreview)).not.toContain("http://localhost:6333");
    expect(mcpStandardImportPreviewText(envPreview)).toContain("runtime image: python:3.11-slim");

    const npmPreview = await catalog.previewStandardMcpImport({ candidate: mcpAutowirePhase0Fixtures.rippr });
    expect(npmPreview.toolHiveRunSource).toBe("npx://rippr");
    expect(npmPreview.toolHiveEnvVars).toEqual([{ name: "NODE_USE_ENV_PROXY", value: "1" }]);
    expect(mcpStandardImportPreviewText(npmPreview)).toContain("env vars: NODE_USE_ENV_PROXY");

    envCandidate.permissions.filesystem.extraMounts = [{
      path: "/tmp/ambient-qdrant-data",
      containerPath: "/data",
      mode: "read-only",
      purpose: "Mount local Qdrant data read-only for a reviewed import.",
    }];
    const mountPreview = await catalog.previewStandardMcpImport({ candidate: envCandidate });
    expect(mountPreview.review.blockers).toEqual([]);
    expect(mountPreview.toolHiveVolumes).toEqual(expect.arrayContaining([{ hostPath: "/tmp/ambient-qdrant-data", containerPath: "/data", mode: "ro" }]));
    expect(mcpStandardImportPreviewText(mountPreview)).toContain("volumes: /tmp/ambient-qdrant-data -> /data:ro");

    const filesystemCandidate = structuredClone(mcpAutowirePhase0Fixtures.rippr) as McpAutowireCandidate;
    filesystemCandidate.id = "modelcontextprotocol-server-filesystem-standard-mcp";
    filesystemCandidate.displayName = "Server Filesystem";
    filesystemCandidate.source = {
      kind: "github",
      url: "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/filesystem",
      packageName: "@modelcontextprotocol/server-filesystem",
      evidenceRefs: ["filesystem-package-json"],
    };
    filesystemCandidate.runtime.sourceKind = "npm";
    filesystemCandidate.runtime.package = {
      registryType: "npm",
      identifier: "@modelcontextprotocol/server-filesystem",
      runtimeHint: "npx -y @modelcontextprotocol/server-filesystem /projects/filesystem-fixture",
      packageArguments: [],
    };
    filesystemCandidate.runtime.evidenceRefs = ["filesystem-package-json"];
    filesystemCandidate.evidence = [{
      id: "filesystem-package-json",
      type: "package-manifest",
      locator: "https://raw.githubusercontent.com/modelcontextprotocol/servers-archived/main/src/filesystem/package.json",
      summary: "The package exposes @modelcontextprotocol/server-filesystem as an npm Standard MCP source.",
    }];
    filesystemCandidate.permissions.filesystem.extraMounts = [{
      path: "/tmp/ambient-filesystem-fixture",
      containerPath: "/projects/filesystem-fixture",
      mode: "read-only",
      purpose: "Read the user-approved filesystem fixture.",
    }];
    filesystemCandidate.permissions.evidenceRefs = ["filesystem-package-json"];
    filesystemCandidate.validationPlan.expectedTools = ["list_allowed_directories", "list_directory", "read_text_file"];
    filesystemCandidate.validationPlan.evidenceRefs = ["filesystem-package-json"];
    filesystemCandidate.openQuestions = [];
    filesystemCandidate.riskSummary.evidenceRefs = ["filesystem-package-json"];
    const filesystemPreview = await catalog.previewStandardMcpImport({ candidate: filesystemCandidate });
    expect(filesystemPreview.review.blockers).toEqual([]);
    expect(filesystemPreview.toolHiveServerArgs).toEqual(["/projects/filesystem-fixture"]);
    expect(filesystemPreview.toolHiveVolumes).toEqual(expect.arrayContaining([
      { hostPath: "/tmp/ambient-filesystem-fixture", containerPath: "/projects/filesystem-fixture", mode: "ro" },
    ]));
    expect(mcpStandardImportPreviewText(filesystemPreview)).toContain("server args: /projects/filesystem-fixture");
    expect(mcpStandardImportPreviewText(filesystemPreview)).toContain("volumes: /tmp/ambient-filesystem-fixture -> /projects/filesystem-fixture:ro");

    envCandidate.permissions.filesystem.extraMounts = [{
      path: "/tmp/ambient-qdrant-data",
      mode: "read-only",
      purpose: "Missing reviewed container mount path.",
    }];
    const missingContainerMountPreview = await catalog.previewStandardMcpImport({ candidate: envCandidate });
    expect(missingContainerMountPreview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("requires a safe absolute containerPath"),
    ]));
    expect(missingContainerMountPreview.runPlan).toBeUndefined();

    envCandidate.runtime.package!.packageArguments = [{
      type: "env",
      name: "QDRANT_API_KEY",
      valueHint: "not-a-real-key",
      isFixed: true,
    }];
    const secretLikeEnvPreview = await catalog.previewStandardMcpImport({ candidate: envCandidate });
    expect(secretLikeEnvPreview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("looks secret-like"),
    ]));

    envCandidate.runtime.package!.runtimeImage = "--privileged";
    const badRuntimeImagePreview = await catalog.previewStandardMcpImport({ candidate: envCandidate });
    expect(badRuntimeImagePreview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("runtime image override cannot be a flag"),
    ]));
  });

  it("returns an exact ToolHive registry fallback for package-bin Standard MCP blockers", async () => {
    const { catalog } = await fixtureCatalog({
      packageMetadataResolver: async () => ({
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-everything",
        found: true,
        normalizedIdentifier: "@modelcontextprotocol/server-everything",
        repositoryUrl: "https://github.com/modelcontextprotocol/servers",
      }),
    });
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    candidate.id = "modelcontextprotocol-server-everything-standard-mcp";
    candidate.displayName = "Server Everything";
    candidate.source = {
      kind: "github",
      url: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
      packageName: "@modelcontextprotocol/server-everything",
      evidenceRefs: ["everything-readme"],
    };
    candidate.runtime = {
      provider: "toolhive",
      sourceKind: "npm",
      transport: "stdio",
      package: {
        registryType: "npm",
        identifier: "@modelcontextprotocol/server-everything",
        runtimeHint: "npx -y @modelcontextprotocol/server-everything (entrypoint mcp-server-everything)",
        entrypoint: {
          kind: "package-bin",
          command: "mcp-server-everything",
          fromPackage: "@modelcontextprotocol/server-everything",
        },
        packageArguments: [],
      },
      evidenceRefs: ["everything-readme"],
    };
    candidate.permissions.network = { mode: "isolated", allowHosts: [], allowPorts: [] };
    candidate.validationPlan = {
      preflights: ["toolhive-runtime", "container-runtime", "mcp-tool-discovery"],
      expectedTools: ["echo", "add"],
      evidenceRefs: ["everything-readme"],
    };
    candidate.evidence = [{
      id: "everything-readme",
      type: "readme",
      locator: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
      summary: "Everything README documents @modelcontextprotocol/server-everything and the mcp-server-everything bin.",
    }];
    const candidateHash = validateMcpAutowireCandidate(candidate).candidateHash;

    const preview = await catalog.previewStandardMcpImport({
      candidate,
      candidateRef: "ambient-mcp-candidate:everything",
      expectedCandidateHash: candidateHash,
    });

    expect(preview.runPlan).toBeUndefined();
    expect(preview.review.outcome).toBe("deferred-unsupported-lane");
    expect(preview.fallbackRoutes[0]).toMatchObject({
      kind: "toolhive-registry-install",
      status: "ready",
      blockedShape: "package-bin-entrypoint",
      serverId: "io.github.stacklok/everything",
      nextToolName: "ambient_mcp_server_describe",
      nextToolInput: { serverId: "io.github.stacklok/everything" },
    });
    expect(preview.fallbackRoutes[1]).toMatchObject({
      kind: "custom-source-build",
      nextToolInput: {
        candidateRef: "ambient-mcp-candidate:everything",
        expectedCandidateHash: candidateHash,
      },
    });
    const text = mcpStandardImportPreviewText(preview);
    expect(text).toContain("Fallback routes:");
    expect(text).toContain("Preferred: ToolHive registry install");
    expect(text).toContain('Next action: call ambient_mcp_server_describe with {"serverId":"io.github.stacklok/everything"}.');
    expect(text).not.toContain("ambient_mcp_server_search");
  });

  it("blocks Standard MCP imports when npm package metadata validation rejects the coordinate", async () => {
    const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
    candidate.id = "mermaid-grammer-inspector-standard-mcp";
    candidate.displayName = "Mermaid Grammer Inspector";
    candidate.source = {
      kind: "github",
      url: "https://github.com/bjmhe-archived/mermaid-grammer-inspector-mcp",
      packageName: "mermaid-grammer-inspector",
      evidenceRefs: ["discovery-summary"],
    };
    candidate.runtime = {
      provider: "toolhive",
      sourceKind: "npm",
      transport: "stdio",
      package: {
        registryType: "npm",
        identifier: "mermaid-grammer-inspector",
        runtimeHint: "npx -y mermaid-grammer-inspector",
        packageArguments: [],
      },
      evidenceRefs: ["discovery-summary"],
    };
    candidate.secrets = [];
    candidate.validationPlan = {
      preflights: ["toolhive-runtime", "container-runtime"],
      expectedTools: [],
      evidenceRefs: ["discovery-summary"],
    };
    candidate.evidence = [{
      id: "discovery-summary",
      type: "readme",
      locator: "https://github.com/bjmhe-archived/mermaid-grammer-inspector-mcp",
      summary: "README documented an npx MCP server package.",
    }];
    const { catalog } = await fixtureCatalog({
      packageMetadataResolver: async () => ({
        registryType: "npm",
        identifier: "mermaid-grammer-inspector",
        found: false,
        error: "HTTP 404 from fixture registry",
      }),
    });

    const preview = await catalog.previewStandardMcpImport({ candidate });

    expect(preview.review.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("NPM package mermaid-grammer-inspector was not found"),
      expect.stringContaining("custom ToolHive source lane"),
      expect.stringContaining("runtime.sourceKind=custom-image"),
    ]));
    expect(preview.runPlan).toBeUndefined();
    expect(mcpStandardImportPreviewText(preview)).toContain("Run plan: not generated because install blockers remain.");
    expect(mcpStandardImportPreviewText(preview)).toContain("do not fall back to unmanaged local commands");
  });

  it("keeps MCPB Standard MCP imports deferred with a typed unsupported-lane outcome", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewStandardMcpImport({ candidate: mcpbScraplingCandidate() });

    expect(preview.review).toMatchObject({
      outcome: "deferred-unsupported-lane",
      blockers: [
        "MCPB package imports are recognized but deferred until ToolHive run support is validated for MCPB sources.",
      ],
    });
    expect(preview.runPlan).toBeUndefined();
    expect(preview.toolHiveRunSource).toBeUndefined();
    expect(mcpStandardImportPreviewText(preview)).toContain("Outcome: deferred-unsupported-lane");
    expect(mcpStandardImportPreviewText(preview)).toContain("Run plan: not generated because install blockers remain.");
  });

  it("previews Remote MCP candidates as ToolHive proxy installs", async () => {
    const { catalog } = await fixtureCatalog();

    const preview = await catalog.previewRemoteMcpProxy({ candidate: mcpAutowirePhase0Fixtures.context7 });

    expect(preview).toMatchObject({
      serverId: "context7-remote-mcp",
      catalogSource: "remote-mcp-proxy",
      toolHiveRemoteUrl: "https://mcp.context7.com/mcp",
      review: {
        blockers: [],
        outcome: "ready",
      },
      runPlan: {
        serverId: "context7-remote-mcp",
        sourceRef: "https://mcp.context7.com/mcp",
        transport: "streamable-http",
      },
    });
    expect(preview.review.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Optional secret CONTEXT7_API_KEY is not bound"),
    ]));
    await expect(readFile(preview.permissionProfile.path, "utf8")).resolves.toContain("mcp.context7.com");
    expect(mcpRemoteMcpProxyPreviewText(preview)).toContain("Catalog source: remote-mcp-proxy");
    expect(mcpRemoteMcpProxyPreviewText(preview)).toContain("thv remote URL: https://mcp.context7.com/mcp");

    const withSecret = await catalog.previewRemoteMcpProxy({
      candidate: mcpAutowirePhase0Fixtures.context7,
      secretBindings: [{ envName: "CONTEXT7_API_KEY", secretRef: context7SecretRef }],
    });
    expect(withSecret.review.blockers).toEqual([]);
    expect(withSecret.runPlan?.envSecretRefs).toEqual([{ envName: "CONTEXT7_API_KEY", secretRef: context7SecretRef }]);
    expect(mcpInstallPreviewSecretBindings(withSecret)).toEqual([
      expect.objectContaining({
        envName: "CONTEXT7_API_KEY",
        secretRef: context7SecretRef,
        derivedBindings: [
          expect.objectContaining({
            kind: "remote-bearer-token-file",
            runtimeName: "Authorization",
            target: "https://mcp.context7.com/mcp",
          }),
        ],
      }),
    ]);
    expect(mcpRemoteMcpProxyPreviewText(withSecret)).toContain("CONTEXT7_API_KEY -> remote-bearer-token-file Authorization");
    expect(mcpRemoteMcpProxyPreviewText(withSecret)).toContain("Remote MCP proxy secrets use short-lived ToolHive --remote-auth-bearer-token-file delivery");
  });

  it("lists installed servers with runtime status and preserved state when ToolHive list fails", async () => {
    const { catalog, service } = await fixtureCatalog();
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7",
          registrySource: "toolhive-registry",
          sourceIdentity: {
            runtimeLane: "toolhive-registry",
            sourceKind: "registry",
            sourceUrl: "https://github.com/upstash/context7",
            registryId: "io.github.stacklok/context7",
            packageRegistryType: "oci",
            packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
            packageVersion: "2.1.8",
            toolHiveRunSource: "toolhive-registry:io.github.stacklok/context7",
            candidateId: "toolhive-registry-stacklok-context7",
            candidateHash: "candidate-hash",
            riskLevel: "low",
          },
          installReview: {
            status: "reviewed",
            outcome: "ready",
            reviewedAt: "2026-05-22T00:00:00.000Z",
            summary: "Context7 reviewed for ToolHive install.",
            warningCount: 0,
            blockerCount: 0,
          },
          secretBindings: [
            {
              envName: "CONTEXT7_API_KEY",
              secretRef: context7SecretRef,
              derivedBindings: [
                {
                  id: "context7-secret-binding",
                  kind: "container-env-file",
                  envName: "CONTEXT7_API_KEY",
                  secretRef: context7SecretRef,
                  runtimeName: "CONTEXT7_API_KEY",
                  target: "ambient-context7",
                },
              ],
            },
          ],
          permissionProfilePath: "/tmp/context7.permissions.json",
          permissionProfileSha256: "abc123",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
          lastKnownToolDescriptors: [{ name: "query-docs" }],
          lastKnownToolDescriptorHash: "hash123",
          toolDescriptorReviewStatus: "needs-review",
          toolDescriptorReviewReason: "MCP tool descriptors changed.",
          toolPolicies: {
            "delete-docs": {
              visibility: "hidden",
              callPolicy: "blocked",
              reason: "Destructive tool hidden until per-tool review exists.",
              updatedAt: "2026-05-22T00:00:00.000Z",
            },
          },
        },
      ],
    });

    const servers = await catalog.listInstalledServers();

    expect(servers).toEqual([
      expect.objectContaining({
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        runtimeLane: "toolhive-registry",
        sourceKind: "registry",
        sourceUrl: "https://github.com/upstash/context7",
        registryId: "io.github.stacklok/context7",
        packageRegistryType: "oci",
        packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
        packageVersion: "2.1.8",
        toolHiveRunSource: "toolhive-registry:io.github.stacklok/context7",
        candidateId: "toolhive-registry-stacklok-context7",
        candidateHash: "candidate-hash",
        riskLevel: "low",
        installReviewStatus: "reviewed",
        installReviewOutcome: "ready",
        secretBindingCount: 1,
        secretBindingEnvNames: ["CONTEXT7_API_KEY"],
        derivedSecretBindingCount: 1,
        derivedSecretBindingKinds: ["container-env-file"],
        workloadStatus: "running",
        endpoint: "http://127.0.0.1:4411/mcp",
        lastKnownToolCount: 1,
        lastKnownToolDescriptorHash: "hash123",
        toolDescriptorReviewStatus: "needs-review",
        toolPolicyCount: 1,
        hiddenToolPolicyCount: 1,
        blockedToolPolicyCount: 1,
      }),
    ]);
    expect(mcpInstalledServersText(servers)).toContain("status=running");
    expect(mcpInstalledServersText(servers)).toContain("source=toolhive-registry/registry");
    expect(mcpInstalledServersText(servers)).toContain("package=oci:ghcr.io/stacklok/dockyard/npx/context7:2.1.8@2.1.8");
    expect(mcpInstalledServersText(servers)).toContain("installReview=reviewed outcome=ready");
    expect(mcpInstalledServersText(servers)).toContain("secretBindings=1 env=CONTEXT7_API_KEY derived=1 delivery=container-env-file");
    expect(mcpInstalledServersText(servers)).toContain("toolDescriptorReview=needs-review");
    expect(mcpInstalledServersText(servers)).toContain("toolPolicies=1 hidden=1 blocked=1");

    const failing = await fixtureCatalog({ failList: true });
    await failing.service.writeState(await service.readState());
    const fallback = await failing.catalog.listInstalledServers();
    expect(fallback[0]).toMatchObject({
      serverId: "io.github.stacklok/context7",
      runtimeListError: expect.stringContaining("ToolHive list failed"),
    });
  });

  it("marks installed default catalog descriptors current, stale, or untracked", async () => {
    const { catalog, service } = await fixtureCatalog({ defaultCatalog: [context7DefaultDescriptor] });
    const currentHash = mcpDefaultCatalogDescriptorHash(context7DefaultDescriptor);
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7-current",
          registrySource: "ambient-default+toolhive-registry",
          defaultCatalogDescriptorHash: currentHash,
          defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
          permissionProfilePath: "/tmp/context7-current.permissions.json",
          permissionProfileSha256: "current",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7-stale",
          registrySource: "ambient-default+toolhive-registry",
          defaultCatalogDescriptorHash: "stale-descriptor-hash",
          defaultCatalogReviewedAt: "2026-05-21T20:00:00.000Z",
          permissionProfilePath: "/tmp/context7-stale.permissions.json",
          permissionProfileSha256: "stale",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7-untracked",
          registrySource: "toolhive-registry",
          permissionProfilePath: "/tmp/context7-untracked.permissions.json",
          permissionProfileSha256: "untracked",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });

    const servers = await catalog.listInstalledServers();

    expect(servers.map((server) => ({
      workloadName: server.workloadName,
      defaultCatalogUpdateStatus: server.defaultCatalogUpdateStatus,
      defaultCatalogDescriptorHash: server.defaultCatalogDescriptorHash,
      installedDefaultCatalogDescriptorHash: server.installedDefaultCatalogDescriptorHash,
      defaultCatalogReviewedAt: server.defaultCatalogReviewedAt,
    }))).toEqual([
      {
        workloadName: "ambient-context7-current",
        defaultCatalogUpdateStatus: "current",
        defaultCatalogDescriptorHash: currentHash,
        installedDefaultCatalogDescriptorHash: currentHash,
        defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
      },
      {
        workloadName: "ambient-context7-stale",
        defaultCatalogUpdateStatus: "update-available",
        defaultCatalogDescriptorHash: currentHash,
        installedDefaultCatalogDescriptorHash: "stale-descriptor-hash",
        defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
      },
      {
        workloadName: "ambient-context7-untracked",
        defaultCatalogUpdateStatus: "untracked",
        defaultCatalogDescriptorHash: currentHash,
        installedDefaultCatalogDescriptorHash: undefined,
        defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
      },
    ]);
    const text = mcpInstalledServersText(servers);
    expect(text).toContain("defaultCatalog=current");
    expect(text).toContain("defaultCatalog=update-available");
    expect(text).toContain("defaultCatalog=untracked");
    expect(text).toContain("ambient_mcp_server_default_update_describe");
  });

  it("previews bundled default catalog updates without mutating installed state", async () => {
    const { catalog, service } = await fixtureCatalog({ defaultCatalog: [context7DefaultDescriptor] });
    const currentHash = mcpDefaultCatalogDescriptorHash(context7DefaultDescriptor);
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7-stale",
          registrySource: "toolhive-registry",
          sourceIdentity: {
            runtimeLane: "toolhive-registry",
            sourceKind: "registry",
            sourceUrl: "https://github.com/upstash/context7-legacy",
            registryId: "io.github.stacklok/context7",
            packageRegistryType: "oci",
            packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.7",
            packageVersion: "2.1.7",
            toolHiveRunSource: "toolhive-registry:io.github.stacklok/context7",
          },
          defaultCatalogDescriptorHash: "stale-descriptor-hash",
          defaultCatalogReviewedAt: "2026-05-21T20:00:00.000Z",
          secretBindings: [
            {
              envName: "CONTEXT7_API_KEY",
              secretRef: context7SecretRef,
              derivedBindings: [
                {
                  id: "context7-secret-binding",
                  kind: "container-env-file",
                  envName: "CONTEXT7_API_KEY",
                  secretRef: context7SecretRef,
                  runtimeName: "CONTEXT7_API_KEY",
                  target: "ambient-context7-stale",
                },
              ],
            },
          ],
          permissionProfilePath: "/tmp/context7-stale.permissions.json",
          permissionProfileSha256: "stale",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
          lastKnownToolDescriptors: [{ name: "query-docs" }],
        },
      ],
    });

    const preview = await catalog.previewDefaultCatalogUpdate({ serverId: "io.github.stacklok/context7" });

    expect(preview).toMatchObject({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7-stale",
      status: "update-available",
      currentDescriptorHash: currentHash,
      installedDescriptorHash: "stale-descriptor-hash",
      currentReviewedAt: "2026-05-22T20:00:00.000Z",
      installedReviewedAt: "2026-05-21T20:00:00.000Z",
    });
    expect(preview.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "default descriptor hash", impact: "review" }),
      expect.objectContaining({ field: "runtime image/package", impact: "runtime" }),
      expect.objectContaining({ field: "runtime image/package version", installed: "2.1.7", current: "2.1.8" }),
      expect.objectContaining({ field: "declared tools", impact: "tools" }),
    ]));
    expect(preview.nextAction).toContain("ambient_mcp_server_uninstall");
    expect(preview.nextAction).toContain("ambient_mcp_server_install");
    expect(preview.nextAction).toContain("Do not mark the descriptor current");
    expect(preview.nextAction).toContain("Reuse the existing Ambient secret refs for CONTEXT7_API_KEY");

    const text = mcpDefaultCatalogUpdatePreviewText(preview);
    expect(text).toContain("Status: update-available");
    expect(text).toContain("runtime image/package version");
    expect(text).toContain("ambient_mcp_server_install");
    expect((await service.readState()).installedServers[0]?.defaultCatalogDescriptorHash).toBe("stale-descriptor-hash");
  });
});

async function fixtureCatalog(options: {
  failList?: boolean;
  failRegistryList?: boolean;
  failRegistryInfo?: boolean;
  registryEntries?: Array<Record<string, unknown>>;
  defaultCatalog?: McpDefaultCatalogDescriptor[];
  packageMetadataResolver?: McpPackageMetadataResolver;
} = {}): Promise<{
  catalog: McpInstallCatalog;
  service: ToolHiveRuntimeService;
  calls: ToolHiveCommandInvocation[];
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-install-catalog-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const registryEntries = options.registryEntries ?? registryFixtureEntries;
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    if (invocation.args.slice(0, 2).join(" ") === "registry list") {
      if (options.failRegistryList) return { stdout: "", stderr: "registry unavailable", exitCode: 1 };
      return ok(JSON.stringify(registryEntries));
    }
    if (invocation.args.slice(0, 2).join(" ") === "registry info") {
      if (options.failRegistryInfo) return { stdout: "", stderr: "registry info unavailable", exitCode: 1 };
      const serverId = invocation.args[2];
      const match = registryEntries.find((entry) => entry.name === serverId);
      return match ? ok(JSON.stringify(match)) : { stdout: "", stderr: "not found", exitCode: 1 };
    }
    if (invocation.args[0] === "list") {
      if (options.failList) return { stdout: "", stderr: "ToolHive list failed", exitCode: 1 };
      return ok(JSON.stringify([{ name: "ambient-context7", status: "running", group: "ambient", proxy_url: "http://127.0.0.1:4411/mcp" }]));
    }
    return ok("[]");
  };
  const service = new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-22T00:00:00.000Z"),
  });
  return {
    catalog: new McpInstallCatalog(service, {
      defaultCatalog: options.defaultCatalog,
      packageMetadataResolver: options.packageMetadataResolver,
    }),
    service,
    calls,
  };
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

const context7Info = {
  name: "io.github.stacklok/context7",
  title: "Context7",
  description: "Up-to-date documentation lookup for LLM coding agents.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["resolve-library-id", "query-docs"],
  repository_url: "https://github.com/upstash/context7",
  tags: ["documentation", "knowledge"],
  image: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
  permissions: {
    network: {
      outbound: {
        allow_host: ["context7.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [
    {
      name: "CONTEXT7_API_KEY",
      description: "Optional Context7 API key for higher limits.",
      required: false,
      secret: true,
    },
  ],
};

const context7DefaultDescriptor = parseDefaultCatalogDescriptor({
  schemaVersion: "ambient-mcp-default-catalog-v1",
  serverId: "io.github.stacklok/context7",
  title: "Context7",
  description: "Up-to-date documentation lookup for LLM coding agents.",
  source: {
    type: "toolhive-registry",
    registryId: "io.github.stacklok/context7",
    repositoryUrl: "https://github.com/upstash/context7",
    license: "MIT",
    reviewedAt: "2026-05-22T20:00:00.000Z",
    reviewedBy: "Ambient",
    evidenceRefs: ["context7-toolhive-registry"],
  },
  promotion: {
    reviewStatus: "reviewed",
    promotionReason: "Reviewed default candidate.",
    smokeTest: {
      status: "passed",
      summary: "Smoke passed.",
      evidenceRefs: ["mcpToolBridge.live.test.ts"],
    },
    riskNotes: ["Optional secret must use Ambient-managed secret flow."],
  },
  registryInfo: context7Info,
});

const scraplingDefaultDescriptor = parseDefaultCatalogDescriptor({
  schemaVersion: "ambient-mcp-default-catalog-v1",
  serverId: "io.github.d4vinci/scrapling",
  title: "Scrapling",
  description: "Default isolated web extraction capability.",
  source: {
    type: "ambient-default-oci",
    repositoryUrl: "https://github.com/D4Vinci/Scrapling",
    upstreamServerJsonUrl: "https://raw.githubusercontent.com/D4Vinci/Scrapling/main/server.json",
    upstreamServerName: "scrapling-github-server-json",
    license: "BSD-3-Clause",
    reviewedAt: "2026-05-23T20:00:00.000Z",
    reviewedBy: "Ambient",
    evidenceRefs: ["scrapling-plan"],
  },
  defaultCapability: {
    capabilityId: "scrapling",
    workloadName: "ambient-scrapling",
    autoInstall: true,
  },
  promotion: {
    reviewStatus: "reviewed",
    promotionReason: "Reviewed default candidate.",
    smokeTest: {
      status: "passed",
      summary: "Smoke passed.",
      evidenceRefs: ["smoke"],
    },
    riskNotes: ["Public web scraping must remain policy-gated."],
  },
  registryInfo: {
    name: "io.github.d4vinci/scrapling",
    title: "Scrapling",
    description: "Default isolated web extraction capability.",
    transport: "stdio",
    tools: ["get", "fetch", "screenshot"],
    repository_url: "https://github.com/D4Vinci/Scrapling",
    image: "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
    server_args: ["mcp"],
    permissions: {
      network: {
        outbound: {
          insecure_allow_all: true,
          allow_port: [80, 443],
        },
      },
    },
  },
});

const fetchInfo = {
  name: "io.github.stacklok/fetch",
  title: "Fetch",
  description: "Fetches remote web resources for MCP clients.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["fetch"],
  repository_url: "https://github.com/stackloklabs/gofetch",
  tags: ["web", "search"],
  image: "ghcr.io/stackloklabs/gofetch/server:1.0.3",
  permissions: {
    network: {
      outbound: {
        insecure_allow_all: true,
        allow_port: [443],
      },
    },
  },
  env_vars: [],
};

const githubInfo = {
  name: "io.github.stacklok/github",
  title: "GitHub",
  description: "GitHub MCP server.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["search_repositories", "get_file_contents"],
  repository_url: "https://github.com/github/github-mcp-server",
  tags: ["git", "github"],
  image: "ghcr.io/github/github-mcp-server:v1.0.3",
  permissions: {
    network: {
      outbound: {
        allow_host: [".github.com", ".githubusercontent.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [
    {
      name: "GITHUB_PERSONAL_ACCESS_TOKEN",
      description: "GitHub token used by the MCP server.",
      required: true,
      secret: true,
    },
  ],
};

const browserInfo = {
  name: "io.github.example/browser",
  title: "Browser MCP",
  description: "Headless Chromium browser automation server for screenshots.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["screenshot"],
  repository_url: "https://github.com/example/browser-mcp",
  tags: ["browser", "playwright"],
  image: "ghcr.io/example/browser-mcp:1.2.3",
  permissions: {
    network: {
      outbound: {
        allow_host: ["example.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [],
};

const everythingInfo = {
  name: "io.github.stacklok/everything",
  title: "Everything",
  description: "Reference MCP server that exercises protocol features.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["add", "annotatedMessage", "echo", "getResourceReference", "getTinyImage", "longRunningOperation", "printEnv", "sampleLLM"],
  repository_url: "https://github.com/modelcontextprotocol/servers",
  tags: ["test", "reference", "everything"],
  image: "docker.io/mcp/everything:latest",
  permissions: {
    network: {
      outbound: {
        insecure_allow_all: false,
      },
    },
  },
  env_vars: [],
};

const filesystemInfo = {
  name: "io.github.stacklok/filesystem",
  title: "Filesystem",
  description: "Allows you to do filesystem operations. Mount paths under /projects using --volume.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["list_allowed_directories", "list_directory", "read_file", "edit_file", "move_file"],
  repository_url: "https://github.com/modelcontextprotocol/servers",
  tags: ["filesystem", "local-files"],
  image: "docker.io/mcp/filesystem:1.0.2",
  permissions: {
    network: {
      outbound: {
        insecure_allow_all: false,
      },
    },
  },
  env_vars: [],
};

const registryFixtureEntries = [context7Info, fetchInfo, githubInfo, everythingInfo];

function mcpbScraplingCandidate(): McpAutowireCandidate {
  const candidate = structuredClone(mcpAutowirePhase0Fixtures.scrapling) as McpAutowireCandidate;
  candidate.id = "scrapling-github-mcpb";
  candidate.displayName = "Scrapling MCPB Package";
  candidate.runtime.sourceKind = "mcpb";
  candidate.runtime.package = {
    registryType: "mcpb",
    identifier: "scrapling.mcpb",
    version: "0.1.0",
    runtimeHint: "mcpb",
    packageArguments: [],
  };
  candidate.validationPlan.preflights = ["toolhive-version", "container-runtime", "mcpb-run-support", "mcp-tool-discovery"];
  candidate.evidence.push({
    id: "scrapling-mcpb",
    type: "server-json",
    locator: "https://github.com/D4Vinci/Scrapling/releases",
    summary: "Fixture evidence says an MCPB package exists, but Ambient has not validated ToolHive MCPB execution.",
  });
  candidate.runtime.evidenceRefs = ["scrapling-mcpb"];
  return candidate;
}
