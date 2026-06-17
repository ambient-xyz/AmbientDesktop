import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adoptExistingMcpDefaultCapability, installMcpDefaultCapability } from "./mcpDefaultCapabilityInstaller";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { mcpDefaultCatalogDescriptorHash, parseDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import {
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "../tool-runtime/toolHiveRuntimeService";
import type { PullContainerRuntimeImageInput } from "../container-runtime/containerRuntimeImagePuller";

describe("MCP default capability installer", () => {
  it("runs the pinned Scrapling OCI image with fixed MCP args and records default catalog identity", async () => {
    const fixture = await fixtureInstaller();
    try {
      const descriptor = scraplingDescriptor();
      const imagePulls: PullContainerRuntimeImageInput[] = [];
      const progress: string[] = [];
      const result = await installMcpDefaultCapability({
        capabilityId: "scrapling",
        catalog: new McpInstallCatalog(fixture.service, { defaultCatalog: [descriptor] }),
        toolHive: fixture.service,
        now: () => new Date("2026-05-23T22:00:00.000Z"),
        platform: "darwin",
        arch: "arm64",
        preferredContainerRuntime: "podman",
        imagePuller: async (input) => {
          imagePulls.push(input);
          return {
            runtime: "podman",
            command: "podman",
            args: ["pull", input.image],
            stdout: "pulled\n",
            stderr: "",
            exitCode: 0,
            durationMs: 10,
            image: input.image,
            targetPlatform: input.targetPlatform,
          };
        },
        onProgress: (event) => progress.push(event.phase),
        imageResolver: async ({ image }) => ({
          status: "index-resolved",
          originalImage: image,
          resolvedImage: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
          registry: "ghcr.io",
          repository: "d4vinci/scrapling",
          targetPlatform: { os: "linux", architecture: "arm64" },
          indexDigest: "sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
          platformDigest: "sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
        }),
      });

      expect(result.preview.runPlan).toMatchObject({
        workloadName: "ambient-scrapling",
        sourceRef: "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
        transport: "stdio",
      });
      expect(result.workload).toMatchObject({
        name: "ambient-scrapling",
        status: "running",
        endpoint: "http://127.0.0.1:4711/mcp",
      });
      expect(result.imagePull).toMatchObject({
        runtime: "podman",
        image: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
      });
      expect(imagePulls).toEqual([
        expect.objectContaining({
          image: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
          preferredRuntime: "podman",
          targetPlatform: { os: "linux", architecture: "arm64" },
        }),
      ]);
      expect(progress).toEqual([
        "image-resolving",
        "image-resolved",
        "image-pull-started",
        "image-pull-succeeded",
        "toolhive-run-started",
        "waiting-workload",
        "completed",
      ]);

      const runCall = fixture.calls.find((call) => call.args[0] === "run");
      expect(runCall?.args).toEqual(expect.arrayContaining([
        "--name",
        "ambient-scrapling",
        "--group",
        "ambient",
        "--isolate-network",
        "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
        "--",
        "mcp",
      ]));
      expect(runCall?.args).toEqual(expect.arrayContaining([
        "--label",
        "ambient.importSource=ambient-default-oci",
      ]));
      expect(runCall?.args).toEqual(expect.arrayContaining([
        "--image-verification",
        "disabled",
      ]));

      const state = await fixture.service.readState();
      expect(state.installedServers).toEqual([
        expect.objectContaining({
          serverId: "io.github.d4vinci/scrapling",
          workloadName: "ambient-scrapling",
          registrySource: "ambient-default-oci",
          defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(descriptor),
          defaultCatalogReviewedAt: "2026-05-23T20:00:00.000Z",
          sourceIdentity: expect.objectContaining({
            runtimeLane: "ambient-default-oci",
            sourceKind: "image",
            packageRegistryType: "oci",
            packageDigest: "sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
            toolHiveRunSource: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
          }),
          installReview: expect.objectContaining({
            status: "reviewed",
            reviewedAt: "2026-05-23T22:00:00.000Z",
          }),
          imageVerificationPolicy: "ambient-reviewed",
        }),
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("adopts an already-running matching Scrapling default workload without reinstalling it", async () => {
    const fixture = await fixtureInstaller();
    try {
      const descriptor = scraplingDescriptor();
      const result = await adoptExistingMcpDefaultCapability({
        capabilityId: "scrapling",
        catalog: new McpInstallCatalog(fixture.service, { defaultCatalog: [descriptor] }),
        toolHive: fixture.service,
        now: () => new Date("2026-05-23T22:00:00.000Z"),
      });

      expect(result?.workload).toMatchObject({
        name: "ambient-scrapling",
        status: "running",
        endpoint: "http://127.0.0.1:4711/mcp",
      });
      expect(fixture.calls.some((call) => call.args[0] === "run")).toBe(false);
      expect(fixture.calls.map((call) => call.args.slice(0, 4))).toContainEqual(["list", "--format", "json", "--all"]);

      const state = await fixture.service.readState();
      expect(state.installedServers).toEqual([
        expect.objectContaining({
          serverId: "io.github.d4vinci/scrapling",
          workloadName: "ambient-scrapling",
          endpoint: "http://127.0.0.1:4711/mcp",
          registrySource: "ambient-default-oci",
          defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(descriptor),
          imageVerificationPolicy: "ambient-reviewed",
        }),
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("adopts an already-running matching Scrapling default workload into the current profile", async () => {
    const fixture = await fixtureInstaller({ runImportConflict: true });
    try {
      const descriptor = scraplingDescriptor();
      const result = await installMcpDefaultCapability({
        capabilityId: "scrapling",
        catalog: new McpInstallCatalog(fixture.service, { defaultCatalog: [descriptor] }),
        toolHive: fixture.service,
        now: () => new Date("2026-05-23T22:00:00.000Z"),
        imagePuller: async (input) => ({
          runtime: "docker",
          command: "docker",
          args: ["pull", input.image],
          stdout: "pulled\n",
          stderr: "",
          exitCode: 0,
          durationMs: 10,
          image: input.image,
          targetPlatform: input.targetPlatform,
        }),
        imageResolver: async ({ image }) => ({
          status: "single-manifest",
          originalImage: image,
          resolvedImage: image,
          registry: "ghcr.io",
          repository: "d4vinci/scrapling",
          targetPlatform: { os: "linux", architecture: "amd64" },
        }),
      });

      expect(result.command.exitCode).toBe(0);
      expect(result.command.stdout).toContain("Adopted existing ToolHive workload ambient-scrapling.");
      expect(result.adoptedExistingWorkload).toBe(true);
      expect(result.workload).toMatchObject({
        name: "ambient-scrapling",
        status: "running",
        endpoint: "http://127.0.0.1:4711/mcp",
      });

      const state = await fixture.service.readState();
      expect(state.installedServers).toEqual([
        expect.objectContaining({
          serverId: "io.github.d4vinci/scrapling",
          workloadName: "ambient-scrapling",
          endpoint: "http://127.0.0.1:4711/mcp",
          registrySource: "ambient-default-oci",
          defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(descriptor),
          imageVerificationPolicy: "ambient-reviewed",
        }),
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails before ToolHive when the pinned default image cannot be verified", async () => {
    const fixture = await fixtureInstaller();
    try {
      await expect(installMcpDefaultCapability({
        capabilityId: "scrapling",
        catalog: new McpInstallCatalog(fixture.service, { defaultCatalog: [scraplingDescriptor()] }),
        toolHive: fixture.service,
        imageResolver: async () => {
          throw new Error("registry denied");
        },
        imagePuller: async (input) => ({
          runtime: "docker",
          command: "docker",
          args: ["pull", input.image],
          stdout: "pulled\n",
          stderr: "",
          exitCode: 0,
          durationMs: 10,
          image: input.image,
          targetPlatform: input.targetPlatform,
        }),
      })).rejects.toThrow("Default MCP capability image preflight failed");
      expect(fixture.calls.some((call) => call.args[0] === "run")).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

async function fixtureInstaller(options: { runImportConflict?: boolean } = {}): Promise<{
  root: string;
  service: ToolHiveRuntimeService;
  calls: ToolHiveCommandInvocation[];
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-install-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    const command = invocation.args.slice(0, 2).join(" ");
    if (command === "group list") return ok("NAME\nambient\n");
    if (command === "group create") return ok("");
    if (invocation.args[0] === "run" && options.runImportConflict) {
      return {
        stdout: "",
        stderr: "Error: workload with name 'ambient-scrapling' already exists\n",
        exitCode: 1,
      };
    }
    if (invocation.args[0] === "run") return ok("running\n");
    if (invocation.args[0] === "list") {
      return ok(JSON.stringify([
        {
          name: "ambient-scrapling",
          package: "ghcr.io/d4vinci/scrapling@sha256:985d67067bd74bef4bea6bb8da6da666b6d063b151284b2d85485c1599460862",
          status: "running",
          group: "ambient",
          proxy_url: "http://127.0.0.1:4711/mcp",
          labels: {
            "ambient.serverId": "io.github.d4vinci.scrapling",
            "ambient.importSource": "ambient-default-oci",
          },
        },
      ]));
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
    now: () => new Date("2026-05-23T22:00:00.000Z"),
  });
  return { root, service, calls };
}

function scraplingDescriptor() {
  return parseDefaultCatalogDescriptor({
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
        filesystem: {
          workspace_read: false,
          workspace_write: false,
        },
      },
      env_vars: [],
    },
  });
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}
