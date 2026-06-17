import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { validateAmbientCuratedMarketplace } from "./codexCuratedMarketplace";
import {
  ambientCuratedMarketplaceFixtureKeyId,
  ambientCuratedMarketplaceFixturePublicKey,
  verifyAmbientCuratedMarketplaceSignature,
} from "./codexCuratedMarketplaceSignature";

const execFileAsync = promisify(execFile);
const scriptPath = join(process.cwd(), "scripts", "build-curated-marketplace.mjs");
const fixtureSourcePath = join(process.cwd(), "fixtures", "curated-marketplace", "source.json");
const fixtureOutputPath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.json");
const fixtureSignaturePath = join(process.cwd(), "fixtures", "curated-marketplace", "marketplace.signature.json");

describe("curated marketplace publish script", () => {
  it("generates a validated marketplace artifact from the checked-in source", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    try {
      const outputPath = join(root, "marketplace.json");
      const signaturePath = join(root, "marketplace.signature.json");
      const { stdout } = await execFileAsync("node", [scriptPath, "--source", fixtureSourcePath, "--out", outputPath]);
      expect(stdout).toContain("Wrote 6 curated plugins");

      const marketplaceContent = await readFile(outputPath, "utf8");
      const signature = JSON.parse(await readFile(signaturePath, "utf8"));
      const marketplace = JSON.parse(await readFile(outputPath, "utf8"));
      expect(validateAmbientCuratedMarketplace(marketplace)).toMatchObject({
        marketplaceName: "ambient-curated",
        pluginCount: 6,
        pluginNames: expect.arrayContaining(["documents-fixture", "github-app-fixture", "binary-dependency-fixture"]),
      });
      expect(
        verifyAmbientCuratedMarketplaceSignature({
          marketplaceContent,
          marketplace,
          signature,
          trustedPublicKeys: { [ambientCuratedMarketplaceFixtureKeyId]: ambientCuratedMarketplaceFixturePublicKey },
        }),
      ).toMatchObject({
        status: "verified",
        keyId: "ambient-curated-fixture-2026-05",
      });

      const check = await execFileAsync("node", [scriptPath, "--source", fixtureSourcePath, "--out", outputPath, "--check"]);
      expect(check.stdout).toContain("Validated 6 curated plugins");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails check mode when the artifact is stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    try {
      const outputPath = join(root, "marketplace.json");
      const signaturePath = join(root, "marketplace.signature.json");
      await execFileAsync("node", [scriptPath, "--source", fixtureSourcePath, "--out", outputPath]);
      await writeFile(signaturePath, "{}\n", "utf8");

      await expect(execFileAsync("node", [scriptPath, "--source", fixtureSourcePath, "--out", outputPath, "--check"])).rejects.toMatchObject({
        stderr: expect.stringContaining("Curated marketplace signature artifact is stale"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects source entries without pinned provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-curated-marketplace-"));
    try {
      const sourcePath = join(root, "source.json");
      const outputPath = join(root, "marketplace.json");
      await writeFile(
        sourcePath,
        JSON.stringify(
          {
            name: "invalid-curated",
            generatedAt: "2026-05-01T00:00:00.000Z",
            plugins: [
              {
                name: "unpinned-git-fixture",
                source: {
                  source: "git-subdir",
                  url: "https://github.com/AmbientCrypto/ambient-codex-plugin-fixtures.git",
                  path: "./plugins/unpinned-git-fixture",
                  ref: "main",
                },
                publisher: "Ambient",
                license: "MIT",
                checksum: `sha256:${"a".repeat(64)}`,
                capabilitySummary: ["Unpinned fixture"],
                compatibility: {
                  status: "Invalid fixture",
                  tier: "partial",
                },
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );

      await expect(execFileAsync("node", [scriptPath, "--source", sourcePath, "--out", outputPath])).rejects.toMatchObject({
        stderr: expect.stringContaining("git curated sources must pin source.sha"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the checked-in artifact current with the source definition", async () => {
    await expect(
      execFileAsync("node", [scriptPath, "--source", fixtureSourcePath, "--out", fixtureOutputPath, "--signature-out", fixtureSignaturePath, "--check"]),
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("Validated 6 curated plugins"),
    });
  });
});
