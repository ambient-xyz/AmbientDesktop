import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("Electron hardening source inventory", () => {
  it("keeps the main renderer sandboxed with context isolation and no node integration", async () => {
    const mainWindowBootstrap = await readFile(resolve(repoRoot, "src/main/desktop-shell/mainWindowBootstrapService.ts"), "utf8");

    expect(mainWindowBootstrap).toContain("preload: preloadPath");
    expect(mainWindowBootstrap).toMatch(/\bcontextIsolation:\s*true\b/);
    expect(mainWindowBootstrap).toMatch(/\bnodeIntegration:\s*false\b/);
    expect(mainWindowBootstrap).toMatch(/\bsandbox:\s*true\b/);
    expect(mainWindowBootstrap).not.toMatch(/\bsandbox:\s*false\b/);
  });

  it("keeps the preload compatible with sandboxed-renderer constraints", async () => {
    const preload = await readFile(resolve(repoRoot, "src/preload/index.ts"), "utf8");

    expect(preload).toContain("contextBridge.exposeInMainWorld");
    expect(preload).toContain("ipcRenderer.invoke");
    expect(preload).not.toMatch(/\bfrom\s+["']node:/);
    expect(preload).not.toMatch(/\brequire\(/);
    expect(preload).not.toMatch(/\bprocess\./);
  });

  it("funnels renderer/window external URL opens through the allowlisted policy helper", async () => {
    const index = await readFile(resolve(repoRoot, "src/main/index.ts"), "utf8");
    const externalNavigation = await readFile(resolve(repoRoot, "src/main/security/externalNavigationService.ts"), "utf8");
    const inspectedSource = `${index}\n${externalNavigation}`;

    expect(externalNavigation).toContain("parseExternalOpenUrl");
    expect(externalNavigation).toContain("setWindowOpenHandler");
    expect(index).toContain('source: "main-window"');
    expect(index).toContain('source: "thread-mini-window"');
    expect(index).toContain("installExternalNavigationGuards: (window) => installExternalNavigationGuards(window");
    expect(inspectedSource).not.toMatch(/setWindowOpenHandler\(\(\{\s*url\s*\}\)\s*=>\s*\{[\s\S]{0,160}shell\.openExternal\(url\)/);
    expect(inspectedSource).not.toMatch(/protocol\s*===\s*["']file:["'][\s\S]{0,160}opened externally/i);
  });
});
