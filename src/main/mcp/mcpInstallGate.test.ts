import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ContainerRuntimeProbeResult } from "../container-runtime/containerRuntimeProbeService";
import {
  evaluateMcpInstallGate,
  mcpDefaultCapabilityStatePathForUserData,
  mcpInstallGateSummary,
} from "./mcpInstallGate";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { MCP_DEFAULT_CATALOG_SCHEMA_VERSION, mcpDefaultCatalogDescriptorHash, parseDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import {
  TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
} from "../tool-runtime/toolHiveRuntimeService";

describe("MCP install gate", () => {
  it("allows custom MCP installs while Scrapling default capability approval is pending", async () => {
    const fixture = await fixtureGate();
    try {
      const gate = await evaluateMcpInstallGate({
        toolHive: fixture.service,
        catalog: fixture.catalog,
        defaultCapabilityStatePath: mcpDefaultCapabilityStatePathForUserData(fixture.userData),
        appVersion: "0.1.25",
        defaultCatalog: [scraplingDescriptor()],
        containerRuntimeProbe: () => fakeReadyContainerRuntimeProbe(fixture.service),
      });

      expect(gate).toMatchObject({
        status: "ready",
        pendingDefaultCapabilities: [
          {
            capabilityId: "scrapling",
            status: "blocked_approval",
            nextAction: "approve-default-capability",
          },
        ],
      });
      expect(mcpInstallGateSummary(gate)).toContain("Default capability diagnostics (non-blocking):");
      expect(mcpInstallGateSummary(gate)).toContain("Scrapling: blocked_approval");
      expect(mcpInstallGateSummary(gate)).toContain("ambient_mcp_server_install with serverId=io.github.d4vinci/scrapling");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("allows custom MCP installs after the default capability is installed", async () => {
    const fixture = await fixtureGate();
    const descriptor = scraplingDescriptor();
    try {
      await fixture.service.writeState({
        schemaVersion: TOOLHIVE_RUNTIME_STATE_SCHEMA_VERSION,
        installedServers: [
          {
            serverId: descriptor.serverId,
            workloadName: descriptor.defaultCapability!.workloadName,
            defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(descriptor),
            defaultCatalogReviewedAt: descriptor.source.reviewedAt,
            permissionProfilePath: "/tmp/ambient-scrapling-profile.json",
            permissionProfileSha256: "profile-sha",
            createdAt: "2026-05-23T20:00:00.000Z",
            updatedAt: "2026-05-23T20:00:00.000Z",
          },
        ],
      });

      const gate = await evaluateMcpInstallGate({
        toolHive: fixture.service,
        catalog: fixture.catalog,
        defaultCapabilityStatePath: mcpDefaultCapabilityStatePathForUserData(fixture.userData),
        appVersion: "0.1.25",
        defaultCatalog: [descriptor],
        containerRuntimeProbe: () => fakeReadyContainerRuntimeProbe(fixture.service),
      });

      expect(gate).toMatchObject({
        status: "ready",
        defaultCapabilities: [
          {
            capabilityId: "scrapling",
            status: "installed",
          },
        ],
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

async function fixtureGate(): Promise<{
  root: string;
  userData: string;
  service: ToolHiveRuntimeService;
  catalog: McpInstallCatalog;
}> {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-install-gate-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    if (invocation.args[0] === "list") {
      return ok(JSON.stringify([{ name: "ambient-scrapling", status: "running", group: "ambient", proxy_url: "http://127.0.0.1:4412/mcp" }]));
    }
    if (invocation.args.slice(0, 2).join(" ") === "runtime check") return ok("runtime ok\n");
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
    now: () => new Date("2026-05-23T20:00:00.000Z"),
  });
  return {
    root,
    userData,
    service,
    catalog: new McpInstallCatalog(service, { defaultCatalog: [scraplingDescriptor()] }),
  };
}

async function fakeReadyContainerRuntimeProbe(service: ToolHiveRuntimeService): Promise<ContainerRuntimeProbeResult> {
  const preflight = await service.preflightRuntime(5);
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-23T20:00:00.000Z",
    durationMs: preflight.command.durationMs,
    message: preflight.message,
    nextAction: "none",
    toolHive: {
      status: "ready",
      preflight,
      message: preflight.message,
    },
    hosts: [
      {
        kind: "docker",
        status: "ready",
        message: "docker CLI and daemon are reachable.",
        commands: [],
      },
    ],
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: "queued",
      },
    ],
  };
}

function scraplingDescriptor() {
  return parseDefaultCatalogDescriptor({
    schemaVersion: MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
    serverId: "io.github.d4vinci/scrapling",
    title: "Scrapling",
    description: "Default isolated web extraction capability.",
    source: {
      type: "ambient-default-oci",
      repositoryUrl: "https://github.com/D4Vinci/Scrapling",
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
        status: "not-run",
        summary: "Smoke pending release gate.",
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
    },
  });
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}
