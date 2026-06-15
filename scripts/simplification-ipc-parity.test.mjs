import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopTypes = readSource("src/shared/desktopTypes.ts");
const preloadSource = readSource("src/preload/index.ts");
const mainSources = readMainHandleSources();

test("preload API stays aligned with AmbientDesktopApi", () => {
  const declaredMethods = ambientDesktopApiMethods();
  const { methods: exposedMethods } = preloadApiSurface();

  assert.ok(declaredMethods.size > 0, "No AmbientDesktopApi methods were found");
  assert.ok(exposedMethods.size > 0, "No preload API methods were found");
  assert.deepEqual(
    difference(declaredMethods, exposedMethods),
    [],
    "AmbientDesktopApi methods missing from preload api",
  );
  assert.deepEqual(
    difference(exposedMethods, declaredMethods),
    [],
    "preload api methods missing from AmbientDesktopApi",
  );
});

test("preload invoke channels are backed by main-process handlers", () => {
  const { invokeChannels } = preloadApiSurface();
  const handledChannels = mainHandleIpcChannels();

  assert.ok(invokeChannels.size > 0, "No preload ipcRenderer.invoke channels were found");
  assert.ok(handledChannels.size > 0, "No main handleIpc channels were found");
  assert.deepEqual(
    difference(invokeChannels, handledChannels),
    [],
    "preload ipcRenderer.invoke channels missing handleIpc registration",
  );
});

function readSource(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function ambientDesktopApiMethods() {
  const body = extractBlockAfter(desktopTypes, "export interface AmbientDesktopApi");
  return new Set([...body.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\??\s*(?:\(|:)/gm)].map((match) => match[1]));
}

function preloadApiSurface() {
  const body = extractBlockAfter(preloadSource, "const api: AmbientDesktopApi =");
  const methods = new Set([...body.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => match[1]));
  const invokeChannels = new Set(
    [...body.matchAll(/ipcRenderer\.invoke\(\s*["']([^"']+)["']/g)].map((match) => match[1]),
  );
  return { methods, invokeChannels };
}

function mainHandleIpcChannels() {
  return new Set([...mainSources.matchAll(/handleIpc\(\s*["']([^"']+)["']/g)].map((match) => match[1]));
}

function readMainHandleSources() {
  const sources = [readSource("src/main/index.ts")];
  const ipcDir = resolve(repoRoot, "src/main/ipc");
  if (!existsSync(ipcDir)) return sources.join("\n");
  for (const entry of readdirSync(ipcDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      sources.push(readFileSync(resolve(ipcDir, entry.name), "utf8"));
    }
  }
  return sources.join("\n");
}

function extractBlockAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Could not find marker: ${marker}`);

  const openBraceIndex = text.indexOf("{", markerIndex);
  assert.notEqual(openBraceIndex, -1, `Could not find opening brace after marker: ${marker}`);

  const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
  assert.notEqual(closeBraceIndex, -1, `Could not find closing brace after marker: ${marker}`);

  return text.slice(openBraceIndex + 1, closeBraceIndex);
}

function findMatchingBrace(text, openBraceIndex) {
  let depth = 0;
  let state = "code";

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }

    if (state === "single-quote" || state === "double-quote" || state === "template") {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (state === "single-quote" && char === "'") state = "code";
      if (state === "double-quote" && char === "\"") state = "code";
      if (state === "template" && char === "`") state = "code";
      continue;
    }

    if (char === "/" && next === "/") {
      state = "line-comment";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }
    if (char === "'") {
      state = "single-quote";
      continue;
    }
    if (char === "\"") {
      state = "double-quote";
      continue;
    }
    if (char === "`") {
      state = "template";
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function difference(left, right) {
  return [...left].filter((item) => !right.has(item)).sort();
}
