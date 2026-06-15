import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Electron hardening source inventory", () => {
  it("keeps the main renderer sandboxed with context isolation and no node integration", async () => {
    const index = await readFile(resolve(repoRoot, "src/main/index.ts"), "utf8");
    const mainWindowOptions = extractObjectLiteral(index, "mainWindow = new BrowserWindow");

    expect(mainWindowOptions).toContain('preload: resolveBuiltOutputPath("preload", "index.cjs")');
    expect(mainWindowOptions).toMatch(/\bcontextIsolation:\s*true\b/);
    expect(mainWindowOptions).toMatch(/\bnodeIntegration:\s*false\b/);
    expect(mainWindowOptions).toMatch(/\bsandbox:\s*true\b/);
    expect(index).not.toMatch(/\bsandbox:\s*false\b/);
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

    expect(index).toContain("parseExternalOpenUrl");
    expect(index).toContain("installExternalNavigationGuards(mainWindow");
    expect(index).toContain("installExternalNavigationGuards(miniWindow");
    expect(index).not.toMatch(/setWindowOpenHandler\(\(\{\s*url\s*\}\)\s*=>\s*\{[\s\S]{0,120}shell\.openExternal\(url\)/);
    expect(index).not.toMatch(/protocol\s*===\s*["']file:["'][\s\S]{0,160}opened externally/i);
  });
});

function extractObjectLiteral(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  const openIndex = source.indexOf("{", markerIndex);
  expect(openIndex).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, index + 1);
    }
  }

  throw new Error(`Could not extract object literal after ${marker}.`);
}
