import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import {
  isMcpDefaultCapabilityInstalledServerAvailable,
  reconcileMcpDefaultCapabilities,
  readMcpDefaultCapabilityState,
  writeMcpDefaultCapabilitySummary,
} from "./mcpDefaultCapabilityReconciler";
import {
  MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
  mcpDefaultCatalogDescriptorHash,
  parseDefaultCatalogDescriptor,
  type McpDefaultCatalogDescriptor,
} from "./mcpDefaultCatalog";
import type { McpInstalledServerSummary } from "./mcpInstallCatalog";

describe("MCP default capability reconciler", () => {
  it("blocks Scrapling on runtime readiness before install planning", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    try {
      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath: join(root, "default-capabilities.json"),
        runtime: runtimeProbe("missing"),
        defaultCatalog: [scraplingDescriptor()],
        installedServers: [],
        appVersion: "0.1.25",
        now: fixedNow,
      });

      expect(summary).toMatchObject({
        capabilityId: "scrapling",
        status: "blocked_runtime",
        nextAction: "install-runtime",
        workloadName: "ambient-scrapling",
        imageDigest: "sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("treats malformed persisted default capability state as empty state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    const statePath = join(root, "default-capabilities.json");
    try {
      await writeFile(statePath, "{", "utf8");

      await expect(readMcpDefaultCapabilityState(statePath)).resolves.toMatchObject({
        capabilities: {},
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a ready runtime handoff as approval-blocked until the default capability is approved", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    const statePath = join(root, "default-capabilities.json");
    try {
      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath,
        runtime: runtimeProbe("ready"),
        defaultCatalog: [scraplingDescriptor()],
        installedServers: [],
        appVersion: "0.1.25",
        now: fixedNow,
      });
      const state = await readMcpDefaultCapabilityState(statePath);

      expect(summary).toMatchObject({
        status: "blocked_approval",
        nextAction: "approve-default-capability",
        serverId: "io.github.d4vinci/scrapling",
      });
      expect(state.capabilities.scrapling).toMatchObject({
        status: "blocked_approval",
        descriptorHash: summary.descriptorHash,
      });
      expect(JSON.parse(await readFile(statePath, "utf8")).capabilities.scrapling.status).toBe("blocked_approval");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves a failed approved install attempt until a repair install succeeds", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    const statePath = join(root, "default-capabilities.json");
    try {
      const descriptor = scraplingDescriptor();
      const [initial] = await reconcileMcpDefaultCapabilities({
        statePath,
        runtime: runtimeProbe("ready"),
        defaultCatalog: [descriptor],
        installedServers: [],
        appVersion: "0.1.25",
        now: fixedNow,
      });
      await writeMcpDefaultCapabilitySummary(statePath, {
        ...initial,
        status: "failed",
        nextAction: "install-default-capability",
        message: "Failed to set up Scrapling: digest pull failed.",
      }, {
        appVersion: "0.1.25",
        now: fixedNow,
      });

      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath,
        runtime: runtimeProbe("ready"),
        defaultCatalog: [descriptor],
        installedServers: [],
        appVersion: "0.1.25",
        now: fixedNow,
      });

      expect(summary).toMatchObject({
        status: "failed",
        nextAction: "install-default-capability",
        message: "Failed to set up Scrapling: digest pull failed.",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recognizes an installed matching Scrapling workload", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    try {
      const descriptor = scraplingDescriptor();
      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath: join(root, "default-capabilities.json"),
        runtime: runtimeProbe("ready"),
        defaultCatalog: [descriptor],
        installedServers: [
          installedScrapling({
            serverId: descriptor.serverId,
            workloadName: descriptor.defaultCapability!.workloadName,
            defaultCatalogDescriptorHash: undefined,
          }),
        ],
        appVersion: "0.1.25",
        now: fixedNow,
      });

      expect(summary).toMatchObject({
        status: "installed",
        nextAction: "none",
        installedEndpoint: "http://127.0.0.1:4412/mcp",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not mark cached Scrapling state installed when ToolHive has no running endpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    try {
      const descriptor = scraplingDescriptor();
      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath: join(root, "default-capabilities.json"),
        runtime: runtimeProbe("ready"),
        defaultCatalog: [descriptor],
        installedServers: [
          installedScrapling({
            serverId: descriptor.serverId,
            workloadName: descriptor.defaultCapability!.workloadName,
            endpoint: undefined,
            workloadStatus: undefined,
            installedDefaultCatalogDescriptorHash: "old-hash",
            defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(descriptor),
          }),
        ],
        appVersion: "0.1.25",
        now: fixedNow,
      });

      expect(summary).toMatchObject({
        status: "failed",
        nextAction: "install-default-capability",
      });
      expect(summary.message).toContain("does not report a running workload endpoint");
      expect(summary.message).not.toContain("is installed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires both a running ToolHive workload and endpoint before a default capability is available", () => {
    expect(isMcpDefaultCapabilityInstalledServerAvailable(installedScrapling())).toBe(true);
    expect(isMcpDefaultCapabilityInstalledServerAvailable(installedScrapling({ endpoint: undefined }))).toBe(false);
    expect(isMcpDefaultCapabilityInstalledServerAvailable(installedScrapling({ workloadStatus: "stopped" }))).toBe(false);
  });

  it("marks Scrapling as descriptor-blocked if the packaged descriptor is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-capability-"));
    try {
      const [summary] = await reconcileMcpDefaultCapabilities({
        statePath: join(root, "default-capabilities.json"),
        runtime: runtimeProbe("ready"),
        defaultCatalog: [],
        installedServers: [],
        appVersion: "0.1.25",
        now: fixedNow,
      });

      expect(summary).toMatchObject({
        status: "blocked_descriptor",
        nextAction: "inspect-failure",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function fixedNow(): Date {
  return new Date("2026-05-23T20:00:00.000Z");
}

function runtimeProbe(status: ContainerRuntimeProbeResult["status"]): Pick<ContainerRuntimeProbeResult, "status" | "checkedAt" | "message"> {
  return {
    status,
    checkedAt: "2026-05-23T20:00:00.000Z",
    message: status === "ready" ? "runtime ready" : "runtime missing",
  };
}

function installedScrapling(overrides: Partial<McpInstalledServerSummary> = {}): McpInstalledServerSummary {
  return {
    serverId: "io.github.d4vinci/scrapling",
    workloadName: "ambient-scrapling",
    permissionProfilePath: "/tmp/ambient-scrapling.json",
    permissionProfileSha256: "profile-sha",
    createdAt: "2026-05-23T20:00:00.000Z",
    updatedAt: "2026-05-23T20:00:00.000Z",
    workloadStatus: "running",
    endpoint: "http://127.0.0.1:4412/mcp",
    ...overrides,
  };
}

function scraplingDescriptor(): McpDefaultCatalogDescriptor {
  return parseDefaultCatalogDescriptor({
    schemaVersion: MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
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
      riskNotes: [],
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
