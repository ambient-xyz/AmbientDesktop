import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyMcpDefaultCatalog } from "./verify-mcp-default-catalog.mjs";

describe("MCP default catalog verifier", () => {
  it("accepts packaged reviewed defaults with pinned ToolHive runtime metadata", async () => {
    const root = await writeCatalogDescriptor(defaultDescriptor());
    try {
      const report = verifyMcpDefaultCatalog({ resources: root });

      expect(report).toMatchObject({
        descriptorCount: 1,
        descriptors: ["context7.json"],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects packaged defaults without passed smoke evidence", async () => {
    const descriptor = defaultDescriptor();
    descriptor.promotion.smokeTest.status = "not-run";
    const root = await writeCatalogDescriptor(descriptor);
    try {
      expect(() => verifyMcpDefaultCatalog({ resources: root })).toThrow("promotion.smokeTest.status must be passed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unpackaged or floating ToolHive registry image references", async () => {
    const descriptor = defaultDescriptor();
    descriptor.registryInfo.image = "ghcr.io/stacklok/dockyard/npx/context7:latest";
    const root = await writeCatalogDescriptor(descriptor);
    try {
      expect(() => verifyMcpDefaultCatalog({ resources: root })).toThrow("registryInfo.image must not use latest");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("verifies the checked-in default catalog resources", () => {
    const report = verifyMcpDefaultCatalog({ resources: join(process.cwd(), "resources") });

    expect(report.descriptorCount).toBeGreaterThanOrEqual(2);
    expect(report.descriptors).toContain("context7.json");
    expect(report.descriptors).toContain("scrapling.json");
  });

  it("accepts an Ambient default OCI descriptor pinned by digest", async () => {
    const descriptor = defaultDescriptor();
    descriptor.serverId = "io.github.d4vinci/scrapling";
    descriptor.title = "Scrapling";
    descriptor.source = {
      type: "ambient-default-oci",
      repositoryUrl: "https://github.com/D4Vinci/Scrapling",
      upstreamServerJsonUrl: "https://raw.githubusercontent.com/D4Vinci/Scrapling/main/server.json",
      upstreamServerName: "scrapling-github-server-json",
      license: "BSD-3-Clause",
      reviewedAt: "2026-05-23T20:00:00.000Z",
      reviewedBy: "Ambient",
      evidenceRefs: ["scrapling"],
    };
    descriptor.defaultCapability = {
      capabilityId: "scrapling",
      workloadName: "ambient-scrapling",
      autoInstall: true,
    };
    descriptor.registryInfo = {
      name: "io.github.d4vinci/scrapling",
      title: "Scrapling",
      description: "Default isolated web extraction capability.",
      transport: "stdio",
      tools: ["get", "fetch", "screenshot"],
      repository_url: "https://github.com/D4Vinci/Scrapling",
      image: "ghcr.io/d4vinci/scrapling@sha256:bc71e9132fe4289b97da720dabb626599d090892b5eae7378bf9204918c0e9a3",
      imageVerificationPolicy: "ambient-reviewed",
      server_args: ["mcp"],
      env_vars: [],
    };
    const root = await writeCatalogDescriptor(descriptor, "scrapling.json");
    try {
      expect(verifyMcpDefaultCatalog({ resources: root })).toMatchObject({
        descriptorCount: 1,
        descriptors: ["scrapling.json"],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeCatalogDescriptor(descriptor, fileName = "context7.json") {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-catalog-verify-"));
  const catalogDir = join(root, "mcp-catalog", "default");
  await mkdir(catalogDir, { recursive: true });
  await writeFile(join(catalogDir, fileName), `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
  return root;
}

function defaultDescriptor() {
  return {
    schemaVersion: "ambient-mcp-default-catalog-v1",
    serverId: "io.github.stacklok/context7",
    title: "Context7",
    description: "Up-to-date documentation lookup for LLM coding agents.",
    source: {
      type: "toolhive-registry",
      registryId: "io.github.stacklok/context7",
      repositoryUrl: "https://github.com/upstash/context7",
      upstreamServerJsonUrl: "https://raw.githubusercontent.com/upstash/context7/master/server.json",
      upstreamServerName: "io.github.upstash/context7",
      license: "MIT",
      reviewedAt: "2026-05-22T20:00:00.000Z",
      reviewedBy: "Ambient",
      evidenceRefs: ["context7-toolhive-registry", "context7-license"],
    },
    promotion: {
      reviewStatus: "reviewed",
      promotionReason: "Reviewed default candidate.",
      smokeTest: {
        status: "passed",
        summary: "Live ToolHive bridge smoke passed.",
        evidenceRefs: ["mcpToolBridge.live.test.ts"],
      },
      riskNotes: ["Optional secret must use Ambient-managed secret flow."],
    },
    registryInfo: {
      name: "io.github.stacklok/context7",
      title: "Context7",
      description: "Up-to-date documentation lookup for LLM coding agents.",
      transport: "stdio",
      tools: ["resolve-library-id", "query-docs"],
      repository_url: "https://github.com/upstash/context7",
      image: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
      env_vars: [],
    },
  };
}
