import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { discoverPiExtensionHostTools, runPiExtensionHostTool } from "./piExtensionCompatibilityHost";

const execFileAsync = promisify(execFile);
const itLivePiExtension = process.env.AMBIENT_PI_EXTENSION_HOST_LIVE === "1" ? it : it.skip;

describe("Pi extension compatibility host", () => {
  it("captures registered tools from a TypeScript Pi extension", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-"));
    try {
      await seedEchoExtension(workspace);
      const tools = await discoverPiExtensionHostTools({ packageRoot: workspace });
      expect(tools).toEqual([
        expect.objectContaining({
          name: "echo",
          description: "Echo input.",
          parameters: expect.objectContaining({ type: "object" }),
        }),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("executes registered tools with bounded text output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-"));
    try {
      await seedEchoExtension(workspace);
      const result = await runPiExtensionHostTool({
        packageRoot: workspace,
        toolName: "echo",
        params: { text: "abcdef" },
        outputLimitBytes: 4,
      });
      expect(result).toMatchObject({
        toolName: "echo",
        content: [{ type: "text", text: "abcd" }],
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("denies process, filesystem imports, child process imports, and disallowed network", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-hostile-"));
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({
    name: "hostile",
    description: "Try denied capabilities.",
    async execute() {
      const results = [];
      try { results.push(typeof process); } catch (error) { results.push("process-denied"); }
      try { require("fs"); results.push("fs-allowed"); } catch (error) { results.push("fs-denied"); }
      try { require("child_process"); results.push("child-process-allowed"); } catch (error) { results.push("child-process-denied"); }
      try { await fetch("https://example.com"); results.push("network-allowed"); } catch (error) { results.push("network-denied"); }
      return { content: [{ type: "text", text: results.join(",") }] };
    },
  });
};
`,
        "utf8",
      );
      const result = await runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "hostile" });
      expect(result.content[0]?.text).toBe("undefined,fs-denied,child-process-denied,network-denied");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("denies node-prefixed imports, dynamic imports, eval, Function, and parent env access", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-escape-"));
    const previousSecret = process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET;
    process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET = "should-not-leak";
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({
    name: "escape",
    async execute() {
      const results = [];
      try { require("node:fs"); results.push("node-fs-allowed"); } catch (error) { results.push("node-fs-denied"); }
      try { require("fs/promises"); results.push("fs-promises-allowed"); } catch (error) { results.push("fs-promises-denied"); }
      try { await import("node:fs"); results.push("dynamic-import-allowed"); } catch (error) { results.push("dynamic-import-denied"); }
      try { eval("1 + 1"); results.push("eval-allowed"); } catch (error) { results.push("eval-denied"); }
      try { Function("return 1")(); results.push("function-allowed"); } catch (error) { results.push("function-denied"); }
      try { results.push(process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET || "env-empty"); } catch (error) { results.push("env-denied"); }
      return { content: [{ type: "text", text: results.join(",") }] };
    },
  });
};
`,
        "utf8",
      );
      const result = await runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "escape" });
      expect(result.content[0]?.text).toBe(
        "node-fs-denied,fs-promises-denied,dynamic-import-denied,eval-denied,function-denied,env-denied",
      );
    } finally {
      if (previousSecret === undefined) {
        delete process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET;
      } else {
        process.env.AMBIENT_PI_EXTENSION_HOST_FAKE_SECRET = previousSecret;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("times out tools that never resolve even when they ignore the abort signal", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-timeout-"));
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({
    name: "hang",
    async execute() {
      await new Promise(() => {});
    },
  });
};
`,
        "utf8",
      );
      await expect(runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "hang", timeoutMs: 25 })).rejects.toThrow(
        'Pi extension tool "hang" timed out.',
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("bounds output floods without failing the host", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-output-"));
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({
    name: "flood",
    async execute() {
      return { content: [{ type: "text", text: "x".repeat(1024 * 1024) }] };
    },
  });
};
`,
        "utf8",
      );
      const result = await runPiExtensionHostTool({
        packageRoot: workspace,
        entrypoint: "index.js",
        toolName: "flood",
        outputLimitBytes: 1024,
      });
      expect(Buffer.byteLength(result.content[0]?.text ?? "", "utf8")).toBe(1024);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails clearly for malformed or missing tool definitions", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-malformed-"));
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({ name: "no_execute" });
};
`,
        "utf8",
      );
      const tools = await discoverPiExtensionHostTools({ packageRoot: workspace, entrypoint: "index.js" });
      expect(tools).toEqual([expect.objectContaining({ name: "no_execute" })]);
      await expect(runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "no_execute" })).rejects.toThrow(
        'does not expose execute()',
      );
      await expect(runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "missing" })).rejects.toThrow(
        'was not registered',
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("allows only configured network hosts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-extension-host-network-"));
    try {
      await writeFile(
        join(workspace, "index.js"),
        `
module.exports = function(pi) {
  pi.registerTool({
    name: "net",
    async execute() {
      const response = await fetch("https://example.com");
      return { content: [{ type: "text", text: String(response.status) }] };
    },
  });
};
`,
        "utf8",
      );
      await expect(runPiExtensionHostTool({ packageRoot: workspace, entrypoint: "index.js", toolName: "net" })).rejects.toThrow(
        "network denied",
      );
      const result = await runPiExtensionHostTool({
        packageRoot: workspace,
        entrypoint: "index.js",
        toolName: "net",
        allowedNetworkHosts: ["example.com"],
      });
      expect(result.content[0]?.text).toBe("200");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  itLivePiExtension("loads pi-arxiv from its pinned repo and runs arxiv_paper through the compatibility host", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-arxiv-host-"));
    try {
      await execFileAsync("git", ["clone", "--quiet", "https://github.com/nicehiro/dotfiles.git", workspace]);
      await execFileAsync("git", ["-C", workspace, "checkout", "--quiet", "0229e73282708adcb2d2d9057699bd655b6ce6de"]);
      const packageRoot = join(workspace, ".pi", "agent", "extensions", "arxiv");
      const tools = await discoverPiExtensionHostTools({ packageRoot });
      expect(tools.map((tool) => tool.name).sort()).toEqual(["arxiv_paper", "arxiv_search"]);
      const result = await runPiExtensionHostTool({
        packageRoot,
        toolName: "arxiv_paper",
        params: { id: "2303.04137" },
        allowedNetworkHosts: ["export.arxiv.org"],
      });
      expect(result.content[0]?.text).toContain("Diffusion Policy");
      expect(result.content[0]?.text).toMatch(/\b2303\.04137(v\d+)?\b/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 180_000);
});

async function seedEchoExtension(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "index.ts"),
    `
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function(pi: ExtensionAPI) {
  pi.registerTool({
    name: "echo",
    description: "Echo input.",
    parameters: Type.Object({ text: Type.String({ description: "Text to echo." }) }),
    async execute(_toolCallId, params: any) {
      return { content: [{ type: "text", text: params.text }] };
    },
  });
}
`,
    "utf8",
  );
}
