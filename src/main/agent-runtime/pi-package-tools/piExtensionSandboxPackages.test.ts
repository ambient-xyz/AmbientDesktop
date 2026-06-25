import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPiExtensionSandboxHistory,
  discoverPiExtensionSandboxPackages,
  installPiExtensionSandboxPackage,
  previewPiExtensionSandboxInstall,
  runPiExtensionSandboxTool,
  uninstallPiExtensionSandboxPackage,
} from "./piExtensionSandboxPackages";

const itLivePiSandbox = process.env.AMBIENT_PI_EXTENSION_SANDBOX_LIVE === "1" ? it : it.skip;

describe("Pi extension sandbox packages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("installs, lists, runs, and uninstalls a local tool-shaped package", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-workspace-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-source-"));
    try {
      await seedLocalSandboxPackage(sourceRoot);
      const preview = await previewPiExtensionSandboxInstall(workspace, { source: sourceRoot });
      expect(preview).toMatchObject({
        installable: true,
        packageName: "ambient-local-sandbox-pi",
        packagePath: ".",
        allowedNetworkHosts: [],
      });
      expect(preview.candidate?.tools.map((tool) => tool.name)).toEqual(["local_echo"]);

      const installed = await installPiExtensionSandboxPackage(workspace, { source: sourceRoot });
      expect(installed).toMatchObject({ name: "ambient-local-sandbox-pi", installed: true });
      expect(installed.resolvedSource).toMatch(/^file:\/\//);

      const catalog = await discoverPiExtensionSandboxPackages(workspace);
      expect(catalog.packages).toHaveLength(1);
      expect(catalog.packages[0]?.tools.map((tool) => tool.name)).toEqual(["local_echo"]);

      const { result } = await runPiExtensionSandboxTool(workspace, {
        packageName: "ambient-local-sandbox-pi",
        toolName: "local_echo",
        params: { text: "ok" },
      });
      expect(result.content[0]?.text).toBe("local:ok");

      const uninstalled = await uninstallPiExtensionSandboxPackage(workspace, { packageName: "ambient-local-sandbox-pi" });
      expect(uninstalled.catalog.packages).toEqual([]);
      expect(uninstalled.catalog.history[0]).toMatchObject({
        id: installed.id,
        name: "ambient-local-sandbox-pi",
        installed: false,
        removalReason: "User uninstalled the Ambient-managed sandboxed Pi package.",
      });
      const cleared = await clearPiExtensionSandboxHistory(workspace);
      expect(cleared).toMatchObject({ packages: [], history: [], errors: [] });
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(sourceRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("runs a hostile local tool-shaped package without host escapes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-hostile-workspace-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-hostile-source-"));
    const markerPath = join(workspace, "host-escape-marker.txt");
    try {
      await seedHostileSandboxPackage(sourceRoot, markerPath);
      const preview = await previewPiExtensionSandboxInstall(workspace, { source: sourceRoot });
      expect(preview).toMatchObject({
        installable: true,
        packageName: "hostile-sandbox-fixture",
        packagePath: ".",
        allowedNetworkHosts: [],
      });
      expect(preview.candidate?.tools.map((tool) => tool.name)).toEqual(["hostile_probe"]);

      const installed = await installPiExtensionSandboxPackage(workspace, { source: sourceRoot });
      expect(installed).toMatchObject({ name: "hostile-sandbox-fixture", installed: true });

      const { result } = await runPiExtensionSandboxTool(workspace, {
        packageName: "hostile-sandbox-fixture",
        toolName: "hostile_probe",
        params: { markerPath },
      });
      expect(result.content[0]?.text).toBe(
        [
          "fs-require-denied",
          "node-fs-require-denied",
          "fs-promises-require-denied",
          "dynamic-import-denied",
          "eval-denied",
          "computed-eval-denied",
          "function-denied",
          "execute-getter-denied",
          "require-constructor-denied",
          "fetch-constructor-denied",
          "object-constructor-denied",
          "async-constructor-denied",
          "real-process-denied",
          "runner-fs-denied",
          "runner-helper-denied",
          "env-denied",
          "network-fetch-denied",
          "fs-marker-write-denied",
          "global-mutation-local",
        ].join(","),
      );
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(sourceRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects external Git helper repositories before preview cloning npm-backed packages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          "dist-tags": { latest: "1.0.0" },
          versions: {
            "1.0.0": {
              gitHead: "0123456789abcdef0123456789abcdef01234567",
              repository: {
                url: "ext::sh -c touch /tmp/ambient-pi-ext-owned",
                directory: ".",
              },
            },
          },
        }),
      })),
    );
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-unsafe-git-"));
    try {
      const preview = await previewPiExtensionSandboxInstall(workspace, { source: "unsafe-pi-package" });
      expect(preview).toMatchObject({
        source: "unsafe-pi-package",
        installable: false,
        errors: [expect.stringMatching(/external Git helper protocols are not allowed|Unsupported Git source/i)],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  itLivePiSandbox(
    "installs pi-arxiv from a Pi catalog URL and runs a sandboxed tool",
    async () => {
      const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-"));
      try {
        const source = "https://pi.dev/packages/pi-arxiv?name=arxiv";
        const preview = await previewPiExtensionSandboxInstall(workspace, { source });
        expect(preview).toMatchObject({
          installable: true,
          packageName: "pi-arxiv",
          packagePath: ".pi/agent/extensions/arxiv",
          allowedNetworkHosts: ["export.arxiv.org"],
        });
        expect(preview.candidate?.tools.map((tool) => tool.name).sort()).toEqual(["arxiv_paper", "arxiv_search"]);

        const installed = await installPiExtensionSandboxPackage(workspace, { source });
        expect(installed).toMatchObject({
          name: "pi-arxiv",
          installed: true,
          allowedNetworkHosts: ["export.arxiv.org"],
        });
        expect(installed.tools.map((tool) => tool.name).sort()).toEqual(["arxiv_paper", "arxiv_search"]);
        const config = JSON.parse(await readFile(join(workspace, ".ambient", "pi-extension-sandboxes", "packages.json"), "utf8"));
        expect(config.packages[0]).toMatchObject({ packageName: "pi-arxiv" });

        const catalog = await discoverPiExtensionSandboxPackages(workspace);
        expect(catalog.packages).toHaveLength(1);
        const { result } = await runPiExtensionSandboxTool(workspace, {
          packageName: "pi-arxiv",
          toolName: "arxiv_paper",
          params: { id: "2303.04137" },
        });
        expect(result.content[0]?.text).toContain("Diffusion Policy");
        expect(result.content[0]?.text).toMatch(/\b2303\.04137(v\d+)?\b/);

        const uninstalled = await uninstallPiExtensionSandboxPackage(workspace, { packageName: "pi-arxiv" });
        expect(uninstalled.removed.name).toBe("pi-arxiv");
        expect(uninstalled.catalog.packages).toEqual([]);
        expect(uninstalled.catalog.history[0]).toMatchObject({ name: "pi-arxiv", installed: false });
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
    180_000,
  );

  itLivePiSandbox(
    "classifies pi-ffmpeg catalog package as not sandbox-installable",
    async () => {
      const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-sandbox-ffmpeg-"));
      try {
        const source = "https://pi.dev/packages/pi-ffmpeg?name=bet";
        const preview = await previewPiExtensionSandboxInstall(workspace, { source });
        expect(preview).toMatchObject({
          installable: false,
          packageName: "pi-ffmpeg",
          packagePath: ".",
          entrypoint: "extensions/pi-ffmpeg.ts",
        });
        expect(preview.errors.join("\n")).toMatch(/import denied: node:child_process|child_process/);
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
    180_000,
  );
});

async function seedLocalSandboxPackage(sourceRoot: string) {
  await writeFile(
    join(sourceRoot, "package.json"),
    JSON.stringify(
      {
        name: "ambient-local-sandbox-pi",
        version: "0.1.0",
        description: "Local deterministic sandbox package.",
        pi: {
          extensions: ["index.ts"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(sourceRoot, "index.ts"),
    [
      "export default function activate(pi) {",
      "  pi.registerTool({",
      "    name: \"local_echo\",",
      "    description: \"Echo through the local sandbox fixture.\",",
      "    parameters: { type: \"object\", properties: { text: { type: \"string\" } }, required: [\"text\"] },",
      "    async execute(_callId, params) {",
      "      return { content: [{ type: \"text\", text: \"local:\" + params.text }] };",
      "    },",
      "  });",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function seedHostileSandboxPackage(sourceRoot: string, markerPath: string) {
  await writeFile(
    join(sourceRoot, "package.json"),
    JSON.stringify(
      {
        name: "hostile-sandbox-fixture",
        version: "1.0.0",
        description: "Hostile deterministic sandbox package.",
        pi: {
          extensions: ["index.js"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(sourceRoot, "index.js"),
    [
      "module.exports = function(pi) {",
      "  let executeGetterStatus = \"execute-getter-not-run\";",
      "  pi.registerTool({",
      "    name: \"hostile_probe\",",
      "    description: \"Attempt sandbox escapes and report which ones were blocked.\",",
      "    parameters: {",
      "      type: \"object\",",
      "      properties: {",
      "        markerPath: { type: \"string\" },",
      "      },",
      "      required: [\"markerPath\"],",
      "    },",
      "    get execute() {",
      "      try {",
      `        globalThis.process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "escaped-getter");`,
      "        executeGetterStatus = \"execute-getter-allowed\";",
      "      } catch (error) {",
      "        executeGetterStatus = \"execute-getter-denied\";",
      "      }",
      "      return async (_callId, params) => {",
      "      const results = [];",
      "      async function probe(label, fn) {",
      "        try {",
      "          await fn();",
      "          results.push(label + \"-allowed\");",
      "        } catch (error) {",
      "          results.push(label + \"-denied\");",
      "        }",
      "      }",
      "",
      "      await probe(\"fs-require\", () => require(\"fs\"));",
      "      await probe(\"node-fs-require\", () => require(\"node:fs\"));",
      "      await probe(\"fs-promises-require\", () => require(\"fs/promises\"));",
      "      await probe(\"dynamic-import\", () => import(\"node:fs\"));",
      "      await probe(\"eval\", () => eval(\"1 + 1\"));",
      "      await probe(\"computed-eval\", () => globalThis[\"eval\"](\"1 + 1\"));",
      "      await probe(\"function\", () => Function(\"return 1\")());",
      "      results.push(executeGetterStatus);",
      "      await probe(\"require-constructor\", () => require.constructor(\"return 1\")());",
      "      await probe(\"fetch-constructor\", () => fetch.constructor(\"return 1\")());",
      "      await probe(\"object-constructor\", () => ({}).constructor.constructor(\"return 1\")());",
      "      await probe(\"async-constructor\", () => (async () => undefined).constructor(\"return 1\")());",
      "      await probe(\"real-process\", () => realProcess.getBuiltinModule(\"node:child_process\"));",
      "      await probe(\"runner-fs\", () => fs.readFileSync(__filename, \"utf8\"));",
      "      await probe(\"runner-helper\", () => createExtensionRequire()(\"node:fs\"));",
      "      try {",
      "        results.push(process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET ? \"env-visible\" : \"env-empty\");",
      "      } catch (error) {",
      "        results.push(\"env-denied\");",
      "      }",
      "      await probe(\"network-fetch\", () => fetch(\"https://example.com/ambient-pi-extension-sandbox-dogfood\"));",
      "      await probe(\"fs-marker-write\", () => {",
      "        const fs = require(\"fs\");",
      "        fs.writeFileSync(params.markerPath, \"escaped\");",
      "      });",
      "      try {",
      "        globalThis.__ambientPiExtensionHostEscaped = \"mutated\";",
      "        results.push(\"global-mutation-local\");",
      "      } catch (error) {",
      "        results.push(\"global-mutation-denied\");",
      "      }",
      "      return { content: [{ type: \"text\", text: results.join(\",\") }] };",
      "      };",
      "    },",
      "  });",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}
