import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFacade";
import { mcpPermissionCorpusFixtureEntries } from "./mcpPermissionCorpusFixtures";
import {
  buildMcpPermissionCorpusReport,
  defaultMcpPermissionCorpusPatterns,
  evaluateMcpPermissionCorpusFixturePolicy,
  mcpPermissionCorpusReportMarkdown,
  parseAwesomeMcpMarkdownCorpus,
  writeMcpPermissionCorpusReport,
} from "./mcpPermissionCorpusService";

describe("MCP permission corpus service", () => {
  it("covers the V1 permission normalizer corpus with at least 50 reusable fixture entries", () => {
    const report = buildMcpPermissionCorpusReport({
      now: new Date("2026-05-23T12:00:00.000Z"),
      entries: mcpPermissionCorpusFixtureEntries,
      expectedPatterns: defaultMcpPermissionCorpusPatterns,
      maxRepresentativesPerPattern: 10,
    });

    expect(mcpPermissionCorpusFixtureEntries).toHaveLength(57);
    expect(report).toMatchObject({
      schemaVersion: "ambient-mcp-permission-corpus-report-v1",
      generatedAt: "2026-05-23T12:00:00.000Z",
      entryCount: 57,
      missingPatterns: [],
    });
    expect(new Set(report.entries.map((entry) => entry.category))).toEqual(new Set([
      "browser-runtime",
      "database",
      "external-account",
      "filesystem",
      "fixed-remote-api",
      "local-bridge",
      "memory",
      "public-web",
      "runtime-process",
      "unknown",
    ]));
    expect(pattern(report, "fixed_remote_api").count).toBeGreaterThanOrEqual(10);
    expect(pattern(report, "public_web_egress").count).toBeGreaterThanOrEqual(10);
    expect(pattern(report, "local_app_bridge").count).toBeGreaterThanOrEqual(6);
    expect(pattern(report, "database").count).toBeGreaterThanOrEqual(8);
    expect(pattern(report, "filesystem_access").count).toBeGreaterThanOrEqual(10);
    expect(pattern(report, "persistent_memory").count).toBeGreaterThanOrEqual(10);
    expect(pattern(report, "runtime_process").count).toBeGreaterThanOrEqual(15);
    expect(pattern(report, "browser_runtime").count).toBeGreaterThanOrEqual(5);
    expect(pattern(report, "external_account").count).toBeGreaterThanOrEqual(12);
    expect(pattern(report, "unknown_install").count).toBeGreaterThanOrEqual(5);
    expect(pattern(report, "ambient_secret").count).toBeGreaterThanOrEqual(15);
    expect(report.entries.find((entry) => entry.id === "fixture-unknown-readme-only")?.patterns).toEqual(["unknown_install"]);
    expect(report.entries.find((entry) => entry.id === "fixture-local-ghidra")?.patterns).toEqual(expect.arrayContaining([
      "local_app_bridge",
      "local_endpoint",
    ]));
    expect(report.entries.find((entry) => entry.id === "fixture-browser-playwright")?.patterns).toEqual(expect.arrayContaining([
      "browser_runtime",
      "public_web_egress",
      "runtime_process",
    ]));
  });

  it("enforces that static corpus fixtures are normalizer calibration, not a hidden install registry", () => {
    const policy = evaluateMcpPermissionCorpusFixturePolicy({
      now: new Date("2026-05-23T12:00:00.000Z"),
      entries: mcpPermissionCorpusFixtureEntries,
    });

    expect(policy).toMatchObject({
      schemaVersion: "ambient-mcp-permission-corpus-fixture-policy-v1",
      generatedAt: "2026-05-23T12:00:00.000Z",
      status: "passed",
      entryCount: 57,
      diagnostics: [],
      hiddenRegistryViolations: [],
      policy: {
        purpose: "normalizer-calibration-not-registry",
        minimumEntries: 50,
        minimumEntriesPerCategory: 3,
        minimumEntriesPerPattern: 5,
        requireSyntheticFixtureIds: true,
        forbidStaticSourceUrls: true,
        forbidEmbeddedCandidates: true,
      },
    });
    expect(policy.categoryCounts).toEqual(expect.arrayContaining([
      { category: "public-web", count: 6 },
      { category: "unknown", count: 6 },
    ]));
    expect(policy.patternCounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ pattern: "public_web_egress", count: expect.any(Number) }),
      expect.objectContaining({ pattern: "unknown_install", count: expect.any(Number) }),
    ]));

    const badPolicy = evaluateMcpPermissionCorpusFixturePolicy({
      now: new Date("2026-05-23T12:00:00.000Z"),
      entries: [
        ...mcpPermissionCorpusFixtureEntries,
        {
          id: "context7-hidden-catalog-entry",
          label: "Context7 install record",
          category: "fixed-remote-api",
          sourceUrl: "https://github.com/upstash/context7",
          evidenceText: "Install with npx @upstash/context7-mcp@2.0.0 and run thv run io.github.stacklok/context7.",
        },
      ],
    });

    expect(badPolicy.status).toBe("failed");
    expect(badPolicy.hiddenRegistryViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryId: "context7-hidden-catalog-entry",
        reason: expect.stringContaining("fixture-* ids"),
      }),
      expect.objectContaining({
        entryId: "context7-hidden-catalog-entry",
        reason: expect.stringContaining("sourceUrl"),
      }),
      expect.objectContaining({
        entryId: "context7-hidden-catalog-entry",
        reason: expect.stringContaining("ToolHive run commands"),
      }),
    ]));
  });

  it("builds a repeatable permission-pattern report from autowire fixtures", () => {
    const report = buildMcpPermissionCorpusReport({
      now: new Date("2026-05-23T12:00:00.000Z"),
      candidates: Object.values(mcpAutowirePhase0Fixtures),
      maxRepresentativesPerPattern: 5,
      expectedPatterns: [
        "fixed_remote_api",
        "public_web_egress",
        "local_app_bridge",
        "local_endpoint",
        "filesystem_access",
        "persistent_memory",
        "ambient_secret",
        "runtime_process",
        "unknown_install",
      ],
    });

    expect(report).toMatchObject({
      schemaVersion: "ambient-mcp-permission-corpus-report-v1",
      generatedAt: "2026-05-23T12:00:00.000Z",
      entryCount: Object.values(mcpAutowirePhase0Fixtures).length,
      missingPatterns: [],
    });
    expect(pattern(report, "public_web_egress")).toMatchObject({
      count: expect.any(Number),
      representativeEntryIds: expect.arrayContaining(["anybrowse-awesome-search-evidence-gap", "awesome-mcp-search-seed", "rippr-awesome-search-standard"]),
    });
    expect(pattern(report, "local_app_bridge").representativeEntryIds).toContain("ghidramcp-guided-local-bridge");
    expect(pattern(report, "ambient_secret").representativeEntryIds).toContain("context7-remote-mcp");
    expect(pattern(report, "persistent_memory").representativeEntryIds).toEqual(expect.arrayContaining([
      "awesome-mcp-knowledge-memory-seed",
      "instinct-toolhive-registry-memory",
      "waypath-awesome-memory-evidence-gap",
    ]));
    expect(report.entries.find((entry) => entry.id === "waypath-awesome-memory-evidence-gap")?.patterns).toEqual(expect.arrayContaining([
      "filesystem_access",
      "persistent_memory",
      "unknown_install",
    ]));
    expect(mcpPermissionCorpusReportMarkdown(report)).toContain("| persistent_memory |");
  });

  it("parses awesome-mcp markdown snippets and classifies pattern entries without registry rules", () => {
    const entries = parseAwesomeMcpMarkdownCorpus({
      sourceUrl: "https://github.com/punkpeye/awesome-mcp-servers",
      sections: ["Search", "Knowledge & Memory"],
      markdown: [
        "## Search",
        "- [BrowserFind](https://example.com/browserfind) - Browser automation with Playwright screenshots, public web crawling, and an API token.",
        "## Knowledge & Memory",
        "- [PgMemory](https://example.com/pgmemory) - Stores embeddings in Postgres with remember, recall, forget, and retention controls.",
      ].join("\n"),
    });

    expect(entries).toHaveLength(2);
    const report = buildMcpPermissionCorpusReport({
      now: new Date("2026-05-23T12:00:00.000Z"),
      entries,
      expectedPatterns: ["public_web_egress", "browser_runtime", "ambient_secret", "database", "persistent_memory"],
    });

    expect(report.missingPatterns).toEqual([]);
    expect(report.entries.find((entry) => entry.label === "BrowserFind")?.patterns).toEqual(expect.arrayContaining([
      "ambient_secret",
      "browser_runtime",
      "public_web_egress",
      "runtime_process",
    ]));
    expect(report.entries.find((entry) => entry.label === "PgMemory")?.patterns).toEqual(expect.arrayContaining([
      "database",
      "persistent_memory",
    ]));
  });

  it("writes JSON and Markdown corpus reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcp-permission-corpus-"));
    try {
      const report = buildMcpPermissionCorpusReport({
        now: new Date("2026-05-23T12:00:00.000Z"),
        candidates: [mcpAutowirePhase0Fixtures.context7],
        expectedPatterns: ["fixed_remote_api", "ambient_secret"],
      });

      const paths = await writeMcpPermissionCorpusReport(report, root);

      await expect(readFile(paths.jsonPath, "utf8").then(JSON.parse)).resolves.toMatchObject({
        schemaVersion: "ambient-mcp-permission-corpus-report-v1",
        entryCount: 1,
        missingPatterns: [],
      });
      await expect(readFile(paths.markdownPath, "utf8")).resolves.toContain("# MCP Permission Corpus Report");
      await expect(readFile(join(root, "mcp-permission-corpus-report.md"), "utf8")).resolves.toContain("Context7 MCP");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function pattern(report: ReturnType<typeof buildMcpPermissionCorpusReport>, name: string) {
  const summary = report.patterns.find((item) => item.pattern === name);
  if (!summary) throw new Error(`Missing pattern ${name}`);
  return summary;
}
