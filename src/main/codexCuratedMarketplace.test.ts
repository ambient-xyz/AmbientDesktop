import { describe, expect, it } from "vitest";
import { buildAmbientCuratedMarketplace, validateAmbientCuratedMarketplace } from "./codexCuratedMarketplace";

const checksum = `sha256:${"a".repeat(64)}`;
const secondChecksum = `sha256:${"b".repeat(64)}`;
const sourceSha = "abcdef1234567890abcdef1234567890abcdef12";

describe("Ambient curated Codex marketplace validation", () => {
  it("builds and validates representative curated marketplace entries", () => {
    const marketplace = buildAmbientCuratedMarketplace({
      name: "ambient-curated-fixture",
      displayName: "Ambient Curated Fixture",
      plugins: [
        plugin("documents-fixture", ["Skill-only artifact"], { skills: "./skills/" }),
        plugin("github-fixture", ["App connector descriptor"], { apps: "./.app.json" }),
        plugin("mcp-fixture", ["MCP tool server"], { mcpServers: "./.mcp.json" }),
        plugin("browser-fixture", ["Browser control skill"], { skills: "./skills/" }),
        plugin("native-fixture", ["Native helper MCP tool"], { mcpServers: "./.mcp.json" }),
        plugin("binary-fixture", ["Binary dependency package"], { mcpServers: "./.mcp.json" }),
      ],
    });

    expect(validateAmbientCuratedMarketplace(marketplace)).toEqual({
      marketplaceName: "ambient-curated-fixture",
      pluginCount: 6,
      pluginNames: ["documents-fixture", "github-fixture", "mcp-fixture", "browser-fixture", "native-fixture", "binary-fixture"],
    });
    expect(marketplace).toMatchObject({
      interface: { displayName: "Ambient Curated Fixture" },
      plugins: expect.arrayContaining([
        expect.objectContaining({
          name: "documents-fixture",
          ambient: {
            marketplace: expect.objectContaining({
              publisher: "Ambient",
              license: "MIT",
              checksum,
              capabilitySummary: ["Skill-only artifact"],
              compatibility: { status: "Ambient verified fixture", tier: "supported" },
            }),
          },
        }),
      ]),
    });
  });

  it("rejects missing metadata, mutable git refs, and unreviewed generated shims", () => {
    expect(() =>
      validateAmbientCuratedMarketplace({
        name: "invalid-curated",
        plugins: [
          {
            name: "invalid-helper",
            source: { source: "git-subdir", url: "https://github.com/ambient/plugin-fixtures.git", path: "./plugins/helper", ref: "main" },
            ambient: {
              marketplace: {
                publisher: "Ambient",
                license: "MIT",
                checksum,
                capabilitySummary: ["Fixture"],
                compatibility: { status: "Fixture", tier: "supported" },
                generatedShim: true,
              },
            },
          },
        ],
      }),
    ).toThrow(/source\.sha.*generated shims require/);
  });

  it("rejects raw Codex cache redistributions unless explicitly marked redistributable", () => {
    const rawCachePlugin = {
      name: "documents-cache-copy",
      source: { source: "local", path: "/Users/neo/.codex/plugins/cache/openai-primary-runtime/documents/1.0.0", ref: "1.0.0" },
      ambient: {
        marketplace: {
          publisher: "Ambient",
          license: "MIT",
          checksum: secondChecksum,
          capabilitySummary: ["Skill-only artifact"],
          compatibility: { status: "Redistribution reviewed", tier: "supported" },
        },
      },
    };

    expect(() => validateAmbientCuratedMarketplace({ name: "invalid-cache-copy", plugins: [rawCachePlugin] })).toThrow(/redistributable/);
    expect(() =>
      validateAmbientCuratedMarketplace({
        name: "valid-cache-copy",
        plugins: [{ ...rawCachePlugin, ambient: { marketplace: { ...rawCachePlugin.ambient.marketplace, redistributable: true } } }],
      }),
    ).not.toThrow();
  });
});

function plugin(name: string, capabilitySummary: string[], manifest: Record<string, unknown>) {
  return {
    name,
    version: "0.1.0",
    description: `${name} curated fixture.`,
    displayName: name,
    source: {
      source: "git-subdir",
      url: "https://github.com/ambient/plugin-fixtures.git",
      path: `./plugins/${name}`,
      sha: sourceSha,
    },
    publisher: "Ambient",
    license: "MIT",
    checksum,
    capabilitySummary,
    compatibility: {
      status: "Ambient verified fixture",
      tier: "supported" as const,
    },
    manifest,
  };
}
