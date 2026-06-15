import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = new URL("../scripts/run.mjs", import.meta.url);

describe("ambient-hyperframes package script", () => {
  it("reports fast readiness without installing dependencies", async () => {
    const { stdout } = await execFileAsync("node", [script.pathname, "doctor", "--fast", "--json"], { timeout: 30_000 });
    const parsed = JSON.parse(stdout);
    expect(parsed.packageName).toBe("ambient-hyperframes");
    expect(parsed.nonMutating).toBe(true);
    expect(parsed.checks.map((check) => check.id)).toContain("hyperframes-cli");
    expect(parsed.checks.find((check) => check.id === "hyperframes-cli")?.status).toBe("skipped");
  });

  it("scaffolds, inspects, and fake-renders a deterministic composition", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-hyperframes-smoke-"));
    try {
      const env = { ...process.env, AMBIENT_WORKSPACE_PATH: workspace, AMBIENT_HYPERFRAMES_FAKE_RENDER: "1" };
      const init = await execFileAsync("node", [script.pathname, "init", "--project-dir", "scene", "--title", "Smoke", "--subtitle", "Rendered metadata"], {
        cwd: workspace,
        env,
        timeout: 30_000,
      });
      const initJson = JSON.parse(init.stdout);
      expect(existsSync(initJson.sourcePath)).toBe(true);

      const inspect = await execFileAsync("node", [script.pathname, "inspect", "--source", "scene/comp.html", "--json"], { cwd: workspace, env, timeout: 30_000 });
      const inspectJson = JSON.parse(inspect.stdout);
      expect(inspectJson.status).toBe("passed");
      expect(inspectJson.composition).toMatchObject({ width: 1280, height: 720, duration: 3, fps: 30 });

      const outputPath = ".ambient/hyperframes/renders/smoke.mp4";
      const render = await execFileAsync("node", [script.pathname, "render", "--source", "scene/comp.html", "--output", outputPath, "--json"], {
        cwd: workspace,
        env,
        timeout: 30_000,
      });
      const renderJson = JSON.parse(render.stdout);
      expect(renderJson.status).toBe("rendered");
      expect(renderJson.mode).toBe("fake");
      expect(renderJson.media.bytes).toBeGreaterThan(0);
      expect(existsSync(join(workspace, outputPath))).toBe(true);
      const metadata = JSON.parse(await readFile(renderJson.metadataPath, "utf8"));
      expect(metadata.artifactContract).toHaveProperty("renderedMediaPath");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
