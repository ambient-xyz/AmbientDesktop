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
    `
export default function activate(pi) {
  pi.registerTool({
    name: "local_echo",
    description: "Echo through the local sandbox fixture.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    async execute(_callId, params) {
      return { content: [{ type: "text", text: "local:" + params.text }] };
    },
  });
}
`,
    "utf8",
  );
}
