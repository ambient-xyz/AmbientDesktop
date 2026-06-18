import { chmod, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  TOOLHIVE_AMBIENT_GROUP,
  TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
  ToolHiveRuntimeService,
  formatToolHiveRunImportFailure,
  toolHiveWorkloadEndpoint,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "./toolHiveRuntimeService";
import { saveSecretReference } from "../security/secretReferenceStore";

const context7SecretRef = `ambient-secret-ref:v1:${"b".repeat(64)}`;

describe("ToolHiveRuntimeService", () => {
  it("turns ToolHive image pull failures into actionable run-import errors", () => {
    const message = formatToolHiveRunImportFailure({
      exitCode: 1,
      stdout: "",
      stderr: [
        "A new version of ToolHive is available: v0.28.3",
        "Currently running: v0.28.2",
        '{"level":"WARN","msg":"Image verification is disabled"}',
        "Error: failed to retrieve or pull image: image not found in registry",
      ].join("\n"),
    });

    expect(message).toContain("Actionable diagnosis");
    expect(message).toContain("update is available");
    expect(message).toContain("platform-specific Linux child manifest");
    expect(message).toContain("Raw ToolHive output");
  });

  it("explains ToolHive run-import timeouts separately from advisory update notices", () => {
    const message = formatToolHiveRunImportFailure({
      exitCode: 124,
      stdout: [
        "A new version of ToolHive is available: v0.29.1",
        "Currently running: v0.28.2",
      ].join("\n"),
      stderr: "",
    });

    expect(message).toContain("timed out before reporting a ready workload");
    expect(message).toContain("advisory");
  });

  it("explains ToolHive Standard MCP package build/source interpretation failures", () => {
    const message = formatToolHiveRunImportFailure({
      exitCode: 1,
      stdout: "",
      stderr: [
        "Error: failed to find or create the MCP server uvx://mcp-server-qdrant: invalid protocol scheme provided for MCP server",
        "failed to build Docker image: failed to process build output: build error: building at STEP \"RUN uv tool install mcp-server-qdrant\"",
      ].join("\n"),
    });

    expect(message).toContain("could not build or interpret the Standard MCP package source");
    expect(message).toContain("required non-secret runtime environment");
  });

  it("formats nonzero default executor run-import output instead of throwing raw exec errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-toolhive-default-executor-failure-"));
    const userDataPath = join(root, "userData");
    await mkdir(userDataPath, { recursive: true });
    const fakeThv = join(root, "thv");
    await writeFile(fakeThv, [
      "#!/usr/bin/env sh",
      "if [ \"$1\" = \"group\" ] && [ \"$2\" = \"list\" ]; then",
      "  printf 'NAME\\nambient\\n'",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"run\" ]; then",
      "  echo 'A new version of ToolHive is available: v0.29.1'",
      "  echo 'Currently running: v0.28.2'",
      "  echo 'playwright package startup failed' >&2",
      "  exit 13",
      "fi",
      "echo \"unexpected $*\" >&2",
      "exit 64",
      "",
    ].join("\n"), "utf8");
    await chmod(fakeThv, 0o755);
    const service = new ToolHiveRuntimeService({
      userDataPath,
      env: {
        AMBIENT_TOOLHIVE_BINARY: fakeThv,
        PATH: process.env.PATH,
        HOME: root,
      } as NodeJS.ProcessEnv,
    });

    await expect(service.runStandardMcpImport({
      serverId: "executeautomation-playwright-mcp-server-standard-mcp",
      workloadName: "ambient-playwright",
      sourceRef: "npx://@executeautomation/playwright-mcp-server",
      permissionProfile: {},
    })).rejects.toThrow(/ToolHive run-import failed with exit code 13.*playwright package startup failed/s);
  });

  it("wraps only typed ToolHive version, group, registry, preflight, list, stop, and remove commands", async () => {
    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      const command = invocation.args.slice(0, 2).join(" ");
      if (invocation.args[0] === "version") return ok("ToolHive v0.28.2\n");
      if (command === "group list") return ok("NAME\nambient\ndefault\n");
      if (command === "group create") return ok("");
      if (command === "registry list") return ok(JSON.stringify([{ name: "io.github.stacklok/context7" }]));
      if (command === "registry info") return ok(JSON.stringify({ name: invocation.args[2], tools: ["query-docs"] }));
      if (command === "runtime check") return ok("runtime ok\n");
      if (invocation.args[0] === "build") return ok("built\n");
      if (invocation.args[0] === "list") return ok(JSON.stringify([{ name: "ambient-context7", status: "running" }]));
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      return fail(`unexpected ${invocation.args.join(" ")}`);
    });

    await expect(service.version()).resolves.toMatchObject({ command: "version", stdout: "ToolHive v0.28.2\n" });
    await expect(service.listGroups()).resolves.toEqual(["ambient", "default"]);
    await expect(service.ensureAmbientGroup()).resolves.toBeUndefined();
    await expect(service.registryList()).resolves.toEqual([{ name: "io.github.stacklok/context7" }]);
    await expect(service.registryInfo("io.github.stacklok/context7")).resolves.toEqual({ name: "io.github.stacklok/context7", tools: ["query-docs"] });
    await expect(service.preflightRuntime(3)).resolves.toMatchObject({ ok: true, message: "runtime ok" });
    await expect(service.buildProtocolImage({
      sourceRef: "uvx://fastmcp@0.4.1",
      tag: "ambient-source-built/sqlite-explorer-fastmcp:abc1234",
      serverArgs: ["run", "/app/sqlite_explorer.py:mcp", "--transport", "stdio"],
    })).resolves.toMatchObject({ command: "build" });
    await expect(service.listWorkloads({ all: true })).resolves.toEqual([{ name: "ambient-context7", status: "running" }]);
    await expect(service.stopWorkload("ambient-context7", 7)).resolves.toMatchObject({ command: "stop" });
    await expect(service.removeWorkload("ambient-context7")).resolves.toMatchObject({ command: "rm" });

    expect(calls.map((call) => call.args)).toEqual([
      ["version"],
      ["group", "list"],
      ["group", "list"],
      ["registry", "list", "--format", "json"],
      ["registry", "info", "io.github.stacklok/context7", "--format", "json"],
      ["runtime", "check", "--timeout", "3"],
      ["build", "--tag", "ambient-source-built/sqlite-explorer-fastmcp:abc1234", "uvx://fastmcp@0.4.1", "--", "run", "/app/sqlite_explorer.py:mcp", "--transport", "stdio"],
      ["list", "--format", "json", "--all", "--group", TOOLHIVE_AMBIENT_GROUP],
      ["stop", "ambient-context7", "--timeout", "7"],
      ["rm", "ambient-context7"],
    ]);
  });

  it("parses JSON output when ToolHive prints update notices before JSON", async () => {
    const updateNotice = [
      "A new version of ToolHive is available: v0.28.3",
      "Currently running: v0.28.2",
    ].join("\n");
    const { service } = await fixtureService(async (invocation) => {
      if (invocation.args.slice(0, 2).join(" ") === "registry list") {
        return ok(`${updateNotice}\n${JSON.stringify([{ name: "io.github.stacklok/context7" }])}\n`);
      }
      if (invocation.args.slice(0, 2).join(" ") === "registry info") {
        return ok(`${updateNotice}\n${JSON.stringify({ name: invocation.args[2], tools: ["query-docs"] })}\n`);
      }
      return ok("[]");
    });

    await expect(service.registryList()).resolves.toEqual([{ name: "io.github.stacklok/context7" }]);
    await expect(service.registryInfo("io.github.stacklok/context7")).resolves.toEqual({
      name: "io.github.stacklok/context7",
      tools: ["query-docs"],
    });
  });

  it("runs ToolHive with an Ambient-owned clean Docker config", async () => {
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      return ok("ToolHive v0.28.2\n");
    });

    await service.version();

    const dockerConfig = calls[0].env.DOCKER_CONFIG;
    expect(dockerConfig).toBe(join(userData, "mcp", "toolhive", "docker-config"));
    if (!dockerConfig) throw new Error("missing DOCKER_CONFIG");
    await expect(readFile(join(dockerConfig, "config.json"), "utf8")).resolves.toBe("{}\n");
    expect(calls[0].env.TOOLHIVE_NO_TELEMETRY).toBe("1");
  });

  it("normalizes ambient workload summaries and endpoint shapes from ToolHive list output", async () => {
    const { service } = await fixtureService(async (invocation) => {
      if (invocation.args[0] === "list") {
        return ok(JSON.stringify([
          { name: "ambient-context7", status: "running", group: "ambient", proxy_url: "http://127.0.0.1:4411/mcp" },
          { workloadName: "ambient-scrapling", state: "stopped", endpoints: [{ url: "http://127.0.0.1:4412/mcp" }] },
          { workload_name: "ambient-ports", ports: [{ host: "127.0.0.1", host_port: "4413" }] },
        ]));
      }
      return ok("{}");
    });

    await expect(service.listAmbientWorkloadSummaries({ all: true })).resolves.toMatchObject([
      { name: "ambient-context7", status: "running", group: "ambient", endpoint: "http://127.0.0.1:4411/mcp" },
      { name: "ambient-scrapling", status: "stopped", endpoint: "http://127.0.0.1:4412/mcp" },
      { name: "ambient-ports", endpoint: "http://127.0.0.1:4413/mcp" },
    ]);

    expect(toolHiveWorkloadEndpoint({ endpoints: ["http://127.0.0.1:4414/sse"] })).toBe("http://127.0.0.1:4414/sse");
  });

	  it("writes deterministic permission profiles and persists Ambient workload state after registry run", async () => {
	    const { service, userData, calls } = await fixtureService(async (invocation) => {
	      calls.push(invocation);
	      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\ndefault\n");
	      if (invocation.args.slice(0, 2).join(" ") === "group create") return ok("");
	      if (invocation.args[0] === "run") return ok("running\n");
	      return ok("{}");
	    }, new Date("2026-05-22T12:00:00.000Z"));
	    const docsMount = join(userData, "mounts", "docs");
	    await mkdir(docsMount, { recursive: true });
	    const expectedDocsMount = await realpath(docsMount);

    const result = await service.runRegistryServer({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      registrySource: "toolhive",
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
      defaultCatalogDescriptorHash: "default-hash-v1",
      defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
      installReview: {
        status: "reviewed",
        outcome: "ready",
        reviewedAt: "2026-05-22T20:01:00.000Z",
        warningCount: 0,
        blockerCount: 0,
      },
      secretBindings: [{ envName: "CONTEXT7_API_KEY", secretRef: context7SecretRef }],
      transport: "stdio",
      proxyMode: "streamable-http",
	      volumes: [{
	        hostPath: docsMount,
	        containerPath: "/projects/docs",
	        mode: "ro",
	        purpose: "docs-fixture",
      }],
      permissionProfile: {
        network: { mode: "allowlist", hosts: ["mcp.context7.com"] },
        filesystem: { mounts: ["/projects/docs"] },
      },
    });

    expect(result.command).toBe("run-registry");
    expect(calls.map((call) => call.args.slice(0, 2).join(" "))).toEqual(["group list", "group create", "run --name"]);
    expect(calls[2].args).toEqual([
      "run",
      "--name",
      "ambient-context7",
      "--group",
      "ambient",
      "--isolate-network",
      "--permission-profile",
      expect.stringMatching(/ambient-context7-[a-f0-9]{12}\.json$/),
      "--label",
      "ambient.serverId=io.github.stacklok.context7",
      "--transport",
      "stdio",
	      "--proxy-mode",
	      "streamable-http",
	      "--volume",
	      `${expectedDocsMount}:/projects/docs:ro`,
	      "io.github.stacklok/context7",
	    ]);
    const profilePath = calls[2].args[7];
    expect(await readFile(profilePath, "utf8")).toContain('"allowlist"');
    await expect(service.readInstalledServerPermissionProfile("ambient-context7")).resolves.toMatchObject({
      path: profilePath,
      expectedSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sha256Verified: true,
      profile: {
        network: { mode: "allowlist", hosts: ["mcp.context7.com"] },
        filesystem: { mounts: ["/projects/docs"] },
      },
    });
    const state = JSON.parse(await readFile(join(userData, "mcp", "toolhive", "state.json"), "utf8"));
    expect(state).toMatchObject({
      schemaVersion: "ambient-toolhive-runtime-state-v1",
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7",
          registrySource: "toolhive",
          sourceIdentity: {
            runtimeLane: "toolhive-registry",
            sourceUrl: "https://github.com/upstash/context7",
            packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
            candidateHash: "candidate-hash",
          },
          defaultCatalogDescriptorHash: "default-hash-v1",
          defaultCatalogReviewedAt: "2026-05-22T20:00:00.000Z",
          installReview: {
            status: "reviewed",
            outcome: "ready",
            reviewedAt: "2026-05-22T20:01:00.000Z",
          },
	          secretBindings: [{ envName: "CONTEXT7_API_KEY", secretRef: context7SecretRef }],
	          runtimeVolumes: [{
	            hostPath: docsMount,
	            containerPath: "/projects/docs",
	            mode: "ro",
            purpose: "docs-fixture",
          }],
          permissionProfilePath: profilePath,
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      ],
    });
  });

  it("detects installed permission profile hash drift", async () => {
    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") return ok("running\n");
      return ok("{}");
    });

    await service.runRegistryServer({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      permissionProfile: {
        network: { outbound: { allow_host: ["mcp.context7.com"], allow_port: [443] } },
      },
    });
    const profilePath = calls.find((call) => call.args[0] === "run")?.args[7];
    if (!profilePath) throw new Error("missing profile path");
    await writeFile(profilePath, JSON.stringify({ network: { outbound: { insecure_allow_all: true } } }, null, 2), "utf8");

    await expect(service.readInstalledServerPermissionProfile("ambient-context7")).resolves.toMatchObject({
      path: profilePath,
      sha256Verified: false,
      profile: {
        network: { outbound: { insecure_allow_all: true } },
      },
    });
  });

  it("persists active Autowire revision pointers on installed servers", async () => {
    const { service } = await fixtureService(async () => ok("{}"), new Date("2026-05-22T12:00:00.000Z"));
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [{
        serverId: "context7-standard-mcp",
        workloadName: "ambient-context7-standard-mcp",
        registrySource: "standard-mcp-import",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          candidateHash: "0".repeat(64),
        },
        permissionProfilePath: "/profiles/context7.json",
        permissionProfileSha256: "profile-sha",
        createdAt: "2026-05-22T11:00:00.000Z",
        updatedAt: "2026-05-22T11:00:00.000Z",
      }],
    });

    const updated = await service.updateInstalledServerAutowireRevision({
      workloadName: "ambient-context7-standard-mcp",
      activeRevisionId: "ambient-mcp-revision:context7-standard-mcp:aaaaaaaaaaaa:bbbbbbbbbbbb",
      candidateRef: "ambient-mcp-candidate:context7-standard-mcp:aaaaaaaaaaaa",
      candidateHash: "a".repeat(64),
    });

    expect(updated).toMatchObject({
      activeRevisionId: "ambient-mcp-revision:context7-standard-mcp:aaaaaaaaaaaa:bbbbbbbbbbbb",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        candidateRef: "ambient-mcp-candidate:context7-standard-mcp:aaaaaaaaaaaa",
        candidateHash: "a".repeat(64),
      },
      updatedAt: "2026-05-22T12:00:00.000Z",
    });
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [{
        activeRevisionId: "ambient-mcp-revision:context7-standard-mcp:aaaaaaaaaaaa:bbbbbbbbbbbb",
      }],
    });
  });

  it("passes explicit image verification policy to ToolHive and persists the reviewed policy", async () => {
    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") return ok("running\n");
      return ok("{}");
    });

    await service.runRegistryServer({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      imageVerificationPolicy: "ambient-reviewed",
      permissionProfile: {},
    });

    const runCall = calls.find((call) => call.args[0] === "run");
    expect(runCall?.args).toEqual(expect.arrayContaining(["--image-verification", "disabled"]));
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [
        {
          workloadName: "ambient-context7",
          imageVerificationPolicy: "ambient-reviewed",
        },
      ],
    });
  });

  it("resolves Ambient-owned MCP secret refs through short-lived ToolHive runtime files", async () => {
    let registryEnvFilePath = "";
    let registryEnvFileText = "";
    let remoteTokenFilePath = "";
    let remoteTokenFileText = "";
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        const envFileIndex = invocation.args.indexOf("--env-file");
        if (envFileIndex !== -1) {
          registryEnvFilePath = invocation.args[envFileIndex + 1];
          registryEnvFileText = await readFile(registryEnvFilePath, "utf8");
        }
        const tokenFileIndex = invocation.args.indexOf("--remote-auth-bearer-token-file");
        if (tokenFileIndex !== -1) {
          remoteTokenFilePath = invocation.args[tokenFileIndex + 1];
          remoteTokenFileText = await readFile(remoteTokenFilePath, "utf8");
        }
        return ok("running\n");
      }
      return ok("{}");
    }, new Date("2026-05-22T12:00:00.000Z"));

    process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");
    try {
      const registrySecretRef = await saveSecretReference({
        scope: "mcp-server",
        workspacePath: userData,
        ownerId: "io.github.stacklok/context7",
        envName: "CONTEXT7_API_KEY",
        value: "context7-registry-token",
      });
      await service.runRegistryServer({
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        secretBindings: [
          {
            envName: "CONTEXT7_API_KEY",
            secretRef: registrySecretRef,
            derivedBindings: [
              {
                id: "registry-context7-api-key",
                kind: "container-env-file",
                envName: "CONTEXT7_API_KEY",
                secretRef: registrySecretRef,
                runtimeName: "CONTEXT7_API_KEY",
                target: "ambient-context7",
              },
            ],
          },
        ],
        permissionProfile: {},
      });

      const remoteSecretRef = await saveSecretReference({
        scope: "mcp-server",
        workspacePath: userData,
        ownerId: "context7-remote-mcp",
        envName: "CONTEXT7_API_KEY",
        value: "Bearer context7-remote-token",
      });
      await service.runRemoteMcpProxy({
        serverId: "context7-remote-mcp",
        workloadName: "ambient-context7-remote",
        remoteUrl: "https://mcp.context7.com/mcp",
        secretBindings: [
          {
            envName: "CONTEXT7_API_KEY",
            secretRef: remoteSecretRef,
            derivedBindings: [
              {
                id: "remote-context7-api-key",
                kind: "remote-bearer-token-file",
                envName: "CONTEXT7_API_KEY",
                secretRef: remoteSecretRef,
                runtimeName: "Authorization",
                target: "https://mcp.context7.com/mcp",
              },
            ],
          },
        ],
        transport: "streamable-http",
        permissionProfile: {},
      });
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }

    expect(registryEnvFileText).toBe("CONTEXT7_API_KEY=context7-registry-token\n");
    expect(remoteTokenFileText).toBe("context7-remote-token\n");
    expect(JSON.stringify(calls.map((call) => call.args))).not.toContain("context7-registry-token");
    expect(JSON.stringify(calls.map((call) => call.args))).not.toContain("context7-remote-token");
    await expect(readFile(registryEnvFilePath, "utf8")).rejects.toThrow();
    await expect(readFile(remoteTokenFilePath, "utf8")).rejects.toThrow();
    const state = await service.readState();
    expect(state.installedServers).toEqual([
      expect.objectContaining({
        workloadName: "ambient-context7",
        secretBindings: [
          expect.objectContaining({
            envName: "CONTEXT7_API_KEY",
            derivedBindings: [expect.objectContaining({ kind: "container-env-file" })],
          }),
        ],
      }),
      expect.objectContaining({
        workloadName: "ambient-context7-remote",
        secretBindings: [
          expect.objectContaining({
            envName: "CONTEXT7_API_KEY",
            derivedBindings: [expect.objectContaining({ kind: "remote-bearer-token-file", runtimeName: "Authorization" })],
          }),
        ],
      }),
    ]);
  });

	  it("delivers fixed non-secret Standard MCP env vars through a short-lived ToolHive env file", async () => {
	    let envFilePath = "";
	    let envFileText = "";
	    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        const envFileIndex = invocation.args.indexOf("--env-file");
        if (envFileIndex !== -1) {
          envFilePath = invocation.args[envFileIndex + 1];
          envFileText = await readFile(envFilePath, "utf8");
        }
        return ok("running\n");
	      }
	      return ok("{}");
	    });
	    const qdrantData = join(tmpdir(), `ambient-qdrant-data-${Date.now()}`);
	    await mkdir(qdrantData, { recursive: true });
	    const expectedQdrantData = await realpath(qdrantData);

	    await service.runStandardMcpImport({
      serverId: "qdrant-standard-mcp",
      workloadName: "ambient-qdrant-standard-mcp",
      sourceRef: "uvx://mcp-server-qdrant",
      runtimeImage: "python:3.11-slim",
      envVars: [
        { name: "QDRANT_URL", value: "http://localhost:6333" },
        { name: "COLLECTION_NAME", value: "ambient-test" },
	      ],
	      volumes: [
	        { hostPath: qdrantData, containerPath: "/data", mode: "ro" },
	      ],
	      permissionProfile: {},
	    });

	    const runCall = calls.find((call) => call.args[0] === "run");
	    expect(runCall?.args).toEqual(expect.arrayContaining(["--env-file", envFilePath]));
	    expect(runCall?.args).toEqual(expect.arrayContaining(["--runtime-image", "python:3.11-slim"]));
	    expect(runCall?.args).toEqual(expect.arrayContaining(["--volume", `${expectedQdrantData}:/data:ro`]));
    expect(runCall?.args.indexOf("--runtime-image")).toBeLessThan(runCall?.args.indexOf("uvx://mcp-server-qdrant") ?? -1);
    expect(runCall?.args.indexOf("--volume")).toBeLessThan(runCall?.args.indexOf("uvx://mcp-server-qdrant") ?? -1);
    expect(envFileText).toBe("QDRANT_URL=http://localhost:6333\nCOLLECTION_NAME=ambient-test\n");
    await expect(readFile(envFilePath, "utf8")).rejects.toThrow();
  });

  it("updates stale Standard MCP import state after requested runtime volumes change", async () => {
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") return ok("running\n");
      return ok("{}");
    });
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [{
        serverId: "csvglow-standard-mcp",
        workloadName: "ambient-csvglow-standard-mcp",
        registrySource: "standard-mcp-import",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          toolHiveRunSource: "uvx://csvglow",
        },
        permissionProfilePath: "/profiles/stale.json",
        permissionProfileSha256: "stale",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      }],
    });
    const exchangeVolume = {
      hostPath: join(userData, "mcp", "toolhive", "file-exchange", "ambient-csvglow-standard-mcp"),
      containerPath: "/ambient/mcp-files",
      mode: "rw" as const,
      purpose: "ambient-mcp-file-exchange",
    };

    await service.runStandardMcpImport({
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      sourceRef: "uvx://csvglow",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        toolHiveRunSource: "uvx://csvglow",
      },
      serverArgs: ["--mcp"],
      volumes: [exchangeVolume],
	      permissionProfile: {},
	    });
	    const expectedExchangeVolume = { ...exchangeVolume, hostPath: await realpath(exchangeVolume.hostPath) };

	    expect(calls.map((call) => call.args[0])).toEqual(["group", "run"]);
	    expect(calls.find((call) => call.args[0] === "run")?.args).toEqual(expect.arrayContaining([
	      "--volume",
	      `${expectedExchangeVolume.hostPath}:${exchangeVolume.containerPath}`,
	    ]));
	    expect((await stat(expectedExchangeVolume.hostPath)).mode & 0o7777).toBe(0o1777);
	    await expect(service.readState()).resolves.toMatchObject({
	      installedServers: [{
	        workloadName: "ambient-csvglow-standard-mcp",
	        runtimeVolumes: [exchangeVolume],
	        managedFileExchange: {
	          hostPath: exchangeVolume.hostPath,
	          containerPath: "/ambient/mcp-files",
	          mode: "rw",
        },
      }],
    });
  });

  it("marks existing Standard MCP import state failed when a managed rerun fails before conflict detection", async () => {
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") return fail("Error: invalid volume format: multiple colons found, expected single colon separator");
      return ok("{}");
    });
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [{
        serverId: "csvglow-standard-mcp",
        workloadName: "ambient-csvglow-standard-mcp",
        registrySource: "standard-mcp-import",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          toolHiveRunSource: "uvx://csvglow",
        },
        permissionProfilePath: "/profiles/stale.json",
        permissionProfileSha256: "stale",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      }],
    });
    const exchangeVolume = {
      hostPath: join(userData, "mcp", "toolhive", "file-exchange", "ambient-csvglow-standard-mcp"),
      containerPath: "/ambient/mcp-files",
      mode: "rw" as const,
      purpose: "ambient-mcp-file-exchange",
    };

    await expect(service.runStandardMcpImport({
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      sourceRef: "uvx://csvglow",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        toolHiveRunSource: "uvx://csvglow",
      },
      serverArgs: ["--mcp"],
      volumes: [exchangeVolume],
      permissionProfile: {},
    })).rejects.toThrow("invalid volume format");

    expect(calls.map((call) => call.args[0])).toEqual(["group", "run"]);
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [{
        workloadName: "ambient-csvglow-standard-mcp",
        installValidationStatus: "validation_failed",
        installValidationError: expect.stringContaining("invalid volume format"),
      }],
    });
  });

  it("reruns instead of adopting existing Standard MCP workloads when required runtime-volume state is absent", async () => {
    let runCount = 0;
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        runCount += 1;
        return runCount === 1
          ? fail("Error: workload with name 'ambient-csvglow-standard-mcp' already exists")
          : ok("running\n");
      }
      if (invocation.args[0] === "list") {
        return ok(JSON.stringify([{
          name: "ambient-csvglow-standard-mcp",
          status: "running",
          proxy_url: "http://127.0.0.1:57507/mcp",
          package: "docker.io/toolhivelocal/uvx-csvglow:20260609201452",
          labels: {
            "ambient.serverId": "csvglow-standard-mcp",
            "ambient.importSource": "standard-mcp-import",
          },
        }]));
      }
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      return ok("{}");
    });
    const exchangeVolume = {
      hostPath: join(userData, "mcp", "toolhive", "file-exchange", "ambient-csvglow-standard-mcp"),
      containerPath: "/ambient/mcp-files",
      mode: "rw" as const,
      purpose: "ambient-mcp-file-exchange",
    };

	    const result = await service.runStandardMcpImport({
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      sourceRef: "uvx://csvglow",
      serverArgs: ["--mcp"],
	      volumes: [exchangeVolume],
	      permissionProfile: {},
	    });
	    const expectedExchangeVolume = { ...exchangeVolume, hostPath: await realpath(exchangeVolume.hostPath) };

	    expect(runCount).toBe(2);
	    expect(result.stdout).toContain("Replaced stale ToolHive workload ambient-csvglow-standard-mcp");
	    expect(calls.map((call) => call.args[0])).toEqual(["group", "run", "list", "stop", "rm", "run"]);
	    expect(calls.find((call) => call.args[0] === "run")?.args).toEqual(expect.arrayContaining([
	      "--volume",
	      `${expectedExchangeVolume.hostPath}:${exchangeVolume.containerPath}`,
	    ]));
	    await expect(service.readState()).resolves.toMatchObject({
	      installedServers: [{
	        workloadName: "ambient-csvglow-standard-mcp",
	        runtimeVolumes: [exchangeVolume],
	      }],
	    });
  });

  it("replaces same-name unmanaged Standard MCP workloads through the reviewed install path", async () => {
    let runCount = 0;
    const progress: string[] = [];
    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        runCount += 1;
        return runCount === 1
          ? fail("Error: workload with name 'ambient-mozilla-firefox-devtools-mcp-standard-mcp-52fff35a' already exists")
          : ok("running\n");
      }
      if (invocation.args[0] === "list") {
        return ok(JSON.stringify([{
          name: "ambient-mozilla-firefox-devtools-mcp-standard-mcp-52fff35a",
          status: "running",
          proxy_url: "http://127.0.0.1:57507/mcp",
          package: "docker.io/toolhivelocal/npx-mozilla-firefox-devtools-mcp:20260609223356",
          labels: {},
        }]));
      }
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      return ok("{}");
    });

    const result = await service.runStandardMcpImport({
      serverId: "mozilla-firefox-devtools-mcp-standard-mcp",
      workloadName: "ambient-mozilla-firefox-devtools-mcp-standard-mcp-52fff35a",
      sourceRef: "npx://@mozilla/firefox-devtools-mcp",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        toolHiveRunSource: "npx://@mozilla/firefox-devtools-mcp",
      },
      permissionProfile: {},
      onProgress: (update) => progress.push(`${update.phase}:${update.status}`),
    });

    expect(runCount).toBe(2);
    expect(result.stdout).toContain("Replaced same-name ToolHive workload ambient-mozilla-firefox-devtools-mcp-standard-mcp-52fff35a");
    expect(calls.map((call) => call.args[0])).toEqual(["group", "run", "list", "stop", "rm", "run"]);
    expect(progress).toEqual(expect.arrayContaining([
      "toolhive-run:running",
      "same-name-conflict:running",
      "toolhive-stop-existing:running",
      "toolhive-remove-existing:running",
      "toolhive-rerun:running",
      "persist-state:running",
    ]));
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [{
        serverId: "mozilla-firefox-devtools-mcp-standard-mcp",
        workloadName: "ambient-mozilla-firefox-devtools-mcp-standard-mcp-52fff35a",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          toolHiveRunSource: "npx://@mozilla/firefox-devtools-mcp",
        },
      }],
    });
  });

  it("reruns instead of adopting existing Standard MCP workloads when the permission profile changed", async () => {
    let runCount = 0;
    const { service, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        runCount += 1;
        return runCount === 1
          ? fail("Error: workload with name 'ambient-context7-standard-mcp' already exists")
          : ok("running\n");
      }
      if (invocation.args[0] === "list") {
        return ok(JSON.stringify([{
          name: "ambient-context7-standard-mcp",
          status: "running",
          proxy_url: "http://127.0.0.1:57507/mcp",
          package: "uvx://context7",
          labels: {
            "ambient.serverId": "context7-standard-mcp",
            "ambient.importSource": "standard-mcp-import",
          },
        }]));
      }
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      return ok("{}");
    });
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [{
        serverId: "context7-standard-mcp",
        workloadName: "ambient-context7-standard-mcp",
        registrySource: "standard-mcp-import",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          toolHiveRunSource: "uvx://context7",
        },
        permissionProfilePath: "/profiles/stale.json",
        permissionProfileSha256: "stale-profile-sha",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      }],
    });

    const result = await service.runStandardMcpImport({
      serverId: "context7-standard-mcp",
      workloadName: "ambient-context7-standard-mcp",
      sourceRef: "uvx://context7",
      serverArgs: ["mcp"],
      permissionProfile: {
        network: { outbound: { allow_host: ["mcp.context7.com"], allow_port: [443] } },
      },
    });

    expect(runCount).toBe(2);
    expect(result.stdout).toContain("Replaced stale ToolHive workload ambient-context7-standard-mcp");
    expect(calls.map((call) => call.args[0])).toEqual(["group", "run", "list", "stop", "rm", "run"]);
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [{
        workloadName: "ambient-context7-standard-mcp",
        permissionProfileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }],
    });
  });

  it("keeps stale Standard MCP import state visible when runtime-volume replacement fails", async () => {
    let runCount = 0;
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") {
        runCount += 1;
        return runCount === 1
          ? fail("Error: workload with name 'ambient-csvglow-standard-mcp' already exists")
          : fail("Error: invalid volume format: multiple colons found, expected single colon separator");
      }
      if (invocation.args[0] === "list") {
        return ok(JSON.stringify([{
          name: "ambient-csvglow-standard-mcp",
          status: "running",
          proxy_url: "http://127.0.0.1:57507/mcp",
          package: "uvx://csvglow",
          labels: {
            "ambient.serverId": "csvglow-standard-mcp",
            "ambient.importSource": "standard-mcp-import",
          },
        }]));
      }
      if (invocation.args[0] === "stop") return ok("stopped\n");
      if (invocation.args[0] === "rm") return ok("removed\n");
      return ok("{}");
    });
    await service.writeState({
      schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
      installedServers: [{
        serverId: "csvglow-standard-mcp",
        workloadName: "ambient-csvglow-standard-mcp",
        registrySource: "standard-mcp-import",
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          toolHiveRunSource: "uvx://csvglow",
        },
        permissionProfilePath: "/profiles/stale.json",
        permissionProfileSha256: "stale",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
      }],
    });
    const exchangeVolume = {
      hostPath: join(userData, "mcp", "toolhive", "file-exchange", "ambient-csvglow-standard-mcp"),
      containerPath: "/ambient/mcp-files",
      mode: "rw" as const,
      purpose: "ambient-mcp-file-exchange",
    };

    await expect(service.runStandardMcpImport({
      serverId: "csvglow-standard-mcp",
      workloadName: "ambient-csvglow-standard-mcp",
      sourceRef: "uvx://csvglow",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        toolHiveRunSource: "uvx://csvglow",
      },
      serverArgs: ["--mcp"],
      volumes: [exchangeVolume],
      permissionProfile: {},
    })).rejects.toThrow("invalid volume format");

    expect(runCount).toBe(2);
    expect(calls.map((call) => call.args[0])).toEqual(["group", "run", "list", "stop", "rm", "run"]);
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [{
        workloadName: "ambient-csvglow-standard-mcp",
        installValidationStatus: "validation_failed",
        installValidationError: expect.stringContaining("invalid volume format"),
      }],
    });
  });

  it("persists Ambient workload state after Remote MCP proxy run", async () => {
    const { service, userData, calls } = await fixtureService(async (invocation) => {
      calls.push(invocation);
      if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\n");
      if (invocation.args[0] === "run") return ok("running\n");
      return ok("{}");
    }, new Date("2026-05-22T12:00:00.000Z"));

    const result = await service.runRemoteMcpProxy({
      serverId: "context7-remote-mcp",
      workloadName: "ambient-context7-remote",
      remoteUrl: "https://mcp.context7.com/mcp",
      registrySource: "remote-mcp-proxy",
      sourceIdentity: {
        runtimeLane: "remote-mcp-proxy",
        sourceKind: "remote-url",
        sourceUrl: "https://github.com/upstash/context7",
        toolHiveRunSource: "https://mcp.context7.com/mcp",
        candidateId: "context7-remote-mcp",
        candidateHash: "candidate-hash",
        riskLevel: "medium",
      },
      installReview: {
        status: "reviewed",
        outcome: "ready",
        reviewedAt: "2026-05-22T20:01:00.000Z",
        warningCount: 1,
        blockerCount: 0,
      },
      secretBindings: [],
      transport: "streamable-http",
      proxyMode: "streamable-http",
      permissionProfile: {
        network: { outbound: { allow_host: ["mcp.context7.com"], allow_port: [443] } },
      },
    });

    expect(result.command).toBe("run-remote");
    const runCall = calls.find((call) => call.args[0] === "run");
    expect(runCall?.args).toEqual([
      "run",
      "--name",
      "ambient-context7-remote",
      "--group",
      "ambient",
      "--isolate-network",
      "--permission-profile",
      expect.stringMatching(/ambient-context7-remote-[a-f0-9]{12}\.json$/),
      "--label",
      "ambient.serverId=context7-remote-mcp",
      "--label",
      "ambient.importSource=remote-mcp-proxy",
      "--transport",
      "streamable-http",
      "--proxy-mode",
      "streamable-http",
      "https://mcp.context7.com/mcp",
    ]);
    const state = JSON.parse(await readFile(join(userData, "mcp", "toolhive", "state.json"), "utf8"));
    expect(state.installedServers[0]).toMatchObject({
      serverId: "context7-remote-mcp",
      workloadName: "ambient-context7-remote",
      registrySource: "remote-mcp-proxy",
      sourceIdentity: {
        runtimeLane: "remote-mcp-proxy",
        toolHiveRunSource: "https://mcp.context7.com/mcp",
        candidateHash: "candidate-hash",
      },
      installReview: {
        status: "reviewed",
        outcome: "ready",
      },
    });
  });

  it("waits for an ambient workload endpoint before reporting readiness", async () => {
    let listCalls = 0;
    const { service } = await fixtureService(async (invocation) => {
      if (invocation.args[0] === "list") {
        listCalls += 1;
        return ok(JSON.stringify(listCalls < 3
          ? [{ name: "ambient-context7", status: "starting" }]
          : [{ name: "ambient-context7", status: "running", url: "http://127.0.0.1:7777/mcp" }]));
      }
      return ok("{}");
    });

    await expect(service.waitForAmbientWorkload("ambient-context7", { timeoutMs: 2_000, pollIntervalMs: 1 })).resolves.toMatchObject({
      name: "ambient-context7",
      status: "running",
      endpoint: "http://127.0.0.1:7777/mcp",
    });
    expect(listCalls).toBe(3);
  });

  it("snapshots tool descriptors and marks installed servers for review on drift", async () => {
    const { service } = await fixtureService(async () => ok("{}"), new Date("2026-05-22T12:00:00.000Z"));
    await service.writeState({
      schemaVersion: "ambient-toolhive-runtime-state-v1",
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7",
          permissionProfilePath: "/tmp/context7.permissions.json",
          permissionProfileSha256: "abc123",
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      ],
    });

    const first = await service.snapshotInstalledServerToolDescriptors("ambient-context7", [
      { name: "query-docs", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
    ]);
    expect(first.changed).toBe(false);
    expect(first.state).toMatchObject({
      toolDescriptorReviewStatus: "trusted",
      lastToolDiscoveryAt: "2026-05-22T12:00:00.000Z",
    });

    const second = await service.snapshotInstalledServerToolDescriptors("ambient-context7", [
      { name: "query-docs", inputSchema: { type: "object", properties: { library: { type: "string" } } } },
    ]);
    expect(second.changed).toBe(true);
    expect(second.state).toMatchObject({
      toolDescriptorReviewStatus: "needs-review",
    });
    expect(second.state.toolDescriptorReviewReason).toContain("MCP tool descriptors changed");

    const trusted = await service.trustInstalledServerToolDescriptors("ambient-context7", second.descriptorHash);
    expect(trusted).toMatchObject({
      descriptorHash: second.descriptorHash,
      wasReviewRequired: true,
    });
    const finalState = await service.readState();
    expect(finalState.installedServers[0]).toMatchObject({
      toolDescriptorReviewStatus: "trusted",
    });
    expect(finalState.installedServers[0].toolDescriptorReviewReason).toBeUndefined();

    await expect(service.trustInstalledServerToolDescriptors("ambient-context7", "stale")).rejects.toThrow("snapshot changed");
  });

  it("persists per-tool Ambient policy overrides without changing descriptor trust", async () => {
    const { service } = await fixtureService(async () => ok("{}"), new Date("2026-05-22T12:00:00.000Z"));
    await service.writeState({
      schemaVersion: "ambient-toolhive-runtime-state-v1",
      installedServers: [
        {
          serverId: "io.github.stacklok/context7",
          workloadName: "ambient-context7",
          permissionProfilePath: "/tmp/context7.permissions.json",
          permissionProfileSha256: "abc123",
          toolDescriptorReviewStatus: "trusted",
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      ],
    });

    await service.updateInstalledServerToolPolicy("ambient-context7", "delete-docs", {
      visibility: "hidden",
      callPolicy: "blocked",
      reason: "Destructive tool hidden until per-tool review exists.",
    });

    const withPolicy = await service.readState();
    expect(withPolicy.installedServers[0]).toMatchObject({
      toolDescriptorReviewStatus: "trusted",
      toolPolicies: {
        "delete-docs": {
          visibility: "hidden",
          callPolicy: "blocked",
          reason: "Destructive tool hidden until per-tool review exists.",
          updatedAt: "2026-05-22T12:00:00.000Z",
        },
      },
    });

    await service.updateInstalledServerToolPolicy("ambient-context7", "delete-docs", {
      visibility: "visible",
      callPolicy: "default",
    });

    expect((await service.readState()).installedServers[0].toolPolicies).toBeUndefined();
  });

  it("rejects arbitrary protocol, URL, local path, broad workload names, and secret-like server args", async () => {
    const { service } = await fixtureService(async () => ok("{}"));

    await expect(service.registryInfo("npx://@modelcontextprotocol/server-everything")).rejects.toThrow("must be a registry/server identifier");
    await expect(service.registryInfo("../local-server")).rejects.toThrow("Invalid ToolHive serverId");
    await expect(service.stopWorkload("context7")).rejects.toThrow("Invalid Ambient ToolHive workload name");
    await expect(service.runRegistryServer({
      serverId: "io.github.stacklok/context7",
      workloadName: "ambient-context7",
      permissionProfile: {},
      serverArgs: ["--token", "sk-thisshouldneverbepassed"],
    })).rejects.toThrow("server arguments must be bounded non-secret strings");
  });

  it("reports runtime preflight failures without throwing", async () => {
    const { service } = await fixtureService(async () => ({ stdout: "", stderr: "Docker is not running", exitCode: 1 }));

    await expect(service.preflightRuntime(2)).resolves.toMatchObject({
      ok: false,
      message: "Docker is not running",
      command: {
        command: "runtime-check",
        exitCode: 1,
      },
    });
  });
});

async function fixtureService(executor: ToolHiveCommandExecutor, now = new Date("2026-05-22T00:00:00.000Z")): Promise<{
  service: ToolHiveRuntimeService;
  userData: string;
  calls: ToolHiveCommandInvocation[];
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-toolhive-runtime-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const service = new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => now,
    timeoutMs: 5_000,
  });
  return { service, userData, calls };
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(stderr: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout: "", stderr, exitCode: 1 };
}
