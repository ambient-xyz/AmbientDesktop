import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
  loadDefaultMcpCatalog,
  mcpDefaultCatalogDescriptorHash,
  parseDefaultCatalogDescriptor,
} from "./mcpDefaultCatalog";

describe("MCP default catalog", () => {
  it("loads packaged default descriptors from a resource directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-default-catalog-"));
    const catalogDir = join(root, "mcp-catalog", "default");
    await mkdir(catalogDir, { recursive: true });
    await writeFile(join(catalogDir, "context7.json"), JSON.stringify(context7DefaultDescriptor(), null, 2), "utf8");

    const catalog = loadDefaultMcpCatalog({ resourcesPath: root, env: {} as NodeJS.ProcessEnv });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      serverId: "io.github.stacklok/context7",
      source: {
        registryId: "io.github.stacklok/context7",
        license: "MIT",
      },
      promotion: {
        reviewStatus: "reviewed",
      },
    });
  });

  it("rejects descriptors whose registry identity does not match serverId", () => {
    const descriptor = context7DefaultDescriptor();
    const registryInfo = descriptor.registryInfo as Record<string, unknown>;
    expect(() => parseDefaultCatalogDescriptor({
      ...descriptor,
      registryInfo: {
        ...registryInfo,
        name: "wrong",
      },
    })).toThrow("registryInfo.name must match serverId");
  });

  it("hashes default descriptors stably for installed-state update comparisons", () => {
    const descriptor = parseDefaultCatalogDescriptor(context7DefaultDescriptor());
    const reordered = parseDefaultCatalogDescriptor({
      ...context7DefaultDescriptor(),
      registryInfo: {
        tools: ["resolve-library-id"],
        description: "Docs lookup.",
        title: "Context7",
        name: "io.github.stacklok/context7",
        transport: "stdio",
        repository_url: "https://github.com/upstash/context7",
      },
    });

    expect(mcpDefaultCatalogDescriptorHash(descriptor)).toBe(mcpDefaultCatalogDescriptorHash(reordered));
  });

  it("accepts Ambient default OCI capability descriptors", () => {
    const descriptor = parseDefaultCatalogDescriptor(scraplingDefaultDescriptor());

    expect(descriptor).toMatchObject({
      serverId: "io.github.d4vinci/scrapling",
      source: {
        type: "ambient-default-oci",
        repositoryUrl: "https://github.com/D4Vinci/Scrapling",
      },
      defaultCapability: {
        capabilityId: "scrapling",
        workloadName: "ambient-scrapling",
        autoInstall: true,
      },
    });
  });
});

function context7DefaultDescriptor(): Record<string, unknown> {
  return {
    schemaVersion: MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
    serverId: "io.github.stacklok/context7",
    title: "Context7",
    description: "Docs lookup.",
    source: {
      type: "toolhive-registry",
      registryId: "io.github.stacklok/context7",
      repositoryUrl: "https://github.com/upstash/context7",
      license: "MIT",
      reviewedAt: "2026-05-22T20:00:00.000Z",
      reviewedBy: "Ambient",
      evidenceRefs: ["evidence"],
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
      name: "io.github.stacklok/context7",
      title: "Context7",
      description: "Docs lookup.",
      transport: "stdio",
      tools: ["resolve-library-id"],
      repository_url: "https://github.com/upstash/context7",
    },
  };
}

function scraplingDefaultDescriptor(): Record<string, unknown> {
  return {
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
      evidenceRefs: ["evidence"],
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
  };
}
