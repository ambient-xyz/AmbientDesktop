import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import { createMcpAutowireCandidateRefStore } from "./mcpAutowireCandidateRefs";
import { validateMcpAutowireCandidate } from "./mcpAutowireSchemas";

describe("MCP autowire candidate refs", () => {
  it("persists candidate refs across recreated stores", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-candidate-refs-"));
    const storagePath = join(root, "thread-1.json");
    const candidate = mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>;
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash;

    const first = createMcpAutowireCandidateRefStore({
      storagePath,
      now: () => "2026-06-08T00:00:00.000Z",
    });
    const candidateRef = first.put(candidate, candidateHash);

    const second = createMcpAutowireCandidateRefStore({ storagePath });

    expect(second.get(candidateRef)).toMatchObject({
      id: "scrapling-github-server-json",
      displayName: "Scrapling MCP Server",
    });
    const raw = JSON.parse(await readFile(storagePath, "utf8")) as {
      schemaVersion: number;
      entries: Array<{ candidateRef: string; candidateHash: string; updatedAt: string }>;
    };
    expect(raw).toMatchObject({
      schemaVersion: 1,
      entries: [
        {
          candidateRef,
          candidateHash,
          updatedAt: "2026-06-08T00:00:00.000Z",
        },
      ],
    });
  });

  it("ignores missing or malformed persisted state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-candidate-refs-bad-"));
    const store = createMcpAutowireCandidateRefStore({
      storagePath: join(root, "missing", "refs.json"),
    });

    expect(store.get("ambient-mcp-candidate:missing:0000000000000000")).toBeUndefined();
  });
});
