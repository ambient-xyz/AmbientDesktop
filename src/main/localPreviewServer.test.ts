import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalPreviewServerManager, localPreviewSummary } from "./localPreviewServer";

const managers: LocalPreviewServerManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.closeAll()));
});

describe("LocalPreviewServerManager", () => {
  it("serves a workspace-local HTML file on an assigned localhost URL", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-preview-"));
    await mkdir(join(workspacePath, "webgl-hello-world"), { recursive: true });
    await writeFile(join(workspacePath, "webgl-hello-world", "index.html"), "<!doctype html><title>Hello</title><canvas></canvas>", "utf8");
    const manager = new LocalPreviewServerManager();
    managers.push(manager);

    const preview = await manager.open({ workspacePath, path: "webgl-hello-world/index.html", ttlMs: 30_000 });
    const response = await fetch(preview.url);

    expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/);
    expect(preview.status).toBe("started");
    expect(preview.workspaceRelativeRequestedPath).toBe("webgl-hello-world/index.html");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<canvas>");
    expect(localPreviewSummary(preview)).toContain(preview.url);
  });

  it("reuses an open preview for the same workspace target and refreshes its expiry", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-preview-reuse-"));
    await writeFile(join(workspacePath, "index.html"), "<!doctype html><title>Reuse</title>", "utf8");
    const manager = new LocalPreviewServerManager();
    managers.push(manager);

    const first = await manager.open({ workspacePath, path: "index.html", ttlMs: 30_000 });
    const second = await manager.open({ workspacePath, path: "index.html", ttlMs: 30_000 });

    expect(second.id).toBe(first.id);
    expect(second.url).toBe(first.url);
    expect(second.port).toBe(first.port);
    expect(second.status).toBe("reused");
    expect(Date.parse(second.expiresAt)).toBeGreaterThanOrEqual(Date.parse(first.expiresAt));
    expect(await fetch(second.url).then((response) => response.text())).toContain("Reuse");
  });

  it("rejects preview paths outside the workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-preview-boundary-"));
    const manager = new LocalPreviewServerManager();
    managers.push(manager);

    await expect(manager.open({ workspacePath, path: "../outside.html" })).rejects.toThrow(/inside the current workspace/);
  });

  it("serves workflow markdown as readable text", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-preview-md-"));
    await mkdir(join(workspacePath, ".ambient", "workflows", "date-night"), { recursive: true });
    await writeFile(join(workspacePath, ".ambient", "workflows", "date-night", "workflow.md"), "# Date night workflow\n", "utf8");
    const manager = new LocalPreviewServerManager();
    managers.push(manager);

    const preview = await manager.open({ workspacePath, path: ".ambient/workflows/date-night/workflow.md", ttlMs: 30_000 });
    const response = await fetch(preview.url);

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("# Date night workflow");
  });
});
