import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

describe("live-seeded UI model review wrapper", () => {
  it("builds a dry-run report without exposing secret values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ui-model-live-seeded-test-"));
    const sourceUserData = join(tempRoot, "source-userData");
    const sourceWorkspace = join(tempRoot, "source-workspace");
    const runRoot = join(tempRoot, "run");
    const summaryPath = join(tempRoot, "latest.json");
    const secretValue = "gmi-secret-value-that-must-not-leak";
    await mkdir(sourceUserData, { recursive: true });
    await mkdir(sourceWorkspace, { recursive: true });

    try {
      const result = await execNode([
        "scripts/ui-model/live-seeded-review.mjs",
        "--dry-run",
        `--source-user-data=${sourceUserData}`,
        `--source-workspace=${sourceWorkspace}`,
        `--run-root=${runRoot}`,
        `--summary=${summaryPath}`,
      ], {
        GMI_CLOUD_API_KEY: secretValue,
        AMBIENT_PROVIDER: "gmi-cloud",
      });

      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Live-seeded UI review dry run prepared");
      const report = JSON.parse(await readFile(summaryPath, "utf8"));
      expect(report).toMatchObject({
        status: "dry-run",
        dryRun: true,
        providerId: "gmi-cloud",
        credentialSources: ["env:GMI_CLOUD_API_KEY"],
      });
      expect(report.collector.env.GMI_CLOUD_API_KEY).toBe("set");
      expect(JSON.stringify(report)).not.toContain(secretValue);
      expect(result.stdout).not.toContain(secretValue);
      expect(result.stderr).not.toContain(secretValue);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function execNode(args, env = {}) {
  return new Promise((resolveExec, rejectExec) => {
    execFile(process.execPath, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        rejectExec(error);
        return;
      }
      resolveExec({ stdout, stderr });
    });
  });
}
