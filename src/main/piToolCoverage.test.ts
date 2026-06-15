import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createAmbientEditOperations,
  createAmbientFindOperations,
  createAmbientGrepOperations,
  createAmbientLsOperations,
  createAmbientReadOperations,
  createAmbientWriteOperations,
} from "./piReadOperations";
import { createToolRunnerBashOperations } from "./toolRunner";

const expectedPiToolNames = ["bash", "edit", "find", "grep", "ls", "read", "write"] as const;

type PiToolName = (typeof expectedPiToolNames)[number];

type PiTool = {
  name: string;
  execute: (
    toolCallId: string,
    input: unknown,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
  ) => Promise<unknown>;
};

type PiToolsModule = {
  allToolNames: Set<string>;
  createAllTools: (cwd: string, options?: unknown) => Record<PiToolName, PiTool>;
};

describe("Pi tool coverage", () => {
  it("guards the complete built-in Pi tool set", async () => {
    const piTools = await loadPiToolsModule();
    expect([...piTools.allToolNames].sort()).toEqual([...expectedPiToolNames].sort());
  });

  it("executes every built-in Pi tool with non-empty output and expected side effects", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-tools-"));
    try {
      await seedToolMatrixWorkspace(workspace);
      const piTools = await loadPiToolsModule();
      const tools = piTools.createAllTools(workspace, toolOptions(workspace, "full-access"));

      expect(Object.keys(tools).sort()).toEqual([...expectedPiToolNames].sort());
      for (const name of expectedPiToolNames) expect(tools[name].name).toBe(name);

      const writeText = extractToolText(await executeTool(tools.write, { path: "nested/generated.txt", content: "generated body\n" }));
      expect(writeText).toContain("Successfully wrote");
      expect(await readFile(join(workspace, "nested", "generated.txt"), "utf8")).toBe("generated body\n");

      const readText = extractToolText(await executeTool(tools.read, { path: "README.md" }));
      expect(readText).toContain("Ambient tool matrix README");

      const editResult = await executeTool(tools.edit, {
        path: "edit-me.txt",
        edits: [{ oldText: "beta", newText: "gamma" }],
      });
      const editText = extractToolText(editResult);
      expect(editText).toContain("Successfully replaced");
      expect(extractToolDetails(editResult).diff).toContain("+");
      expect(await readFile(join(workspace, "edit-me.txt"), "utf8")).toContain("gamma");

      const grepText = extractToolText(await executeTool(tools.grep, { pattern: "needle-target", path: ".", literal: true }));
      expect(grepText).toContain("src/app.js");
      expect(grepText).toContain("needle-target");

      const findText = extractToolText(await executeTool(tools.find, { pattern: "**/*target*.txt", path: "." }));
      expect(findText).toContain("nested/target-file.txt");

      const lsText = extractToolText(await executeTool(tools.ls, { path: "list-dir" }));
      expect(lsText).toContain("alpha.txt");
      expect(lsText).toContain("folder/");

      const bashUpdates: unknown[] = [];
      const bashText = extractToolText(
        await executeTool(tools.bash, { command: "printf bash-output" }, (update) => bashUpdates.push(update)),
      );
      expect(bashText).toContain("bash-output");
      expect(bashText).not.toContain("(no output)");
      expect(bashUpdates.some((update) => extractToolText(update).includes("bash-output"))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("streams bash output through Ambient's workspace-mode tool runner", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-tools-workspace-"));
    try {
      await seedToolMatrixWorkspace(workspace);
      const piTools = await loadPiToolsModule();
      const tools = piTools.createAllTools(workspace, toolOptions(workspace, "workspace"));
      const updates: unknown[] = [];
      const resultText = extractToolText(
        await executeTool(tools.bash, { command: "ls -1 nested/target-file.txt" }, (update) => updates.push(update)),
      );

      expect(resultText).toContain("nested/target-file.txt");
      expect(resultText).not.toContain("(no output)");
      expect(updates.some((update) => extractToolText(update).includes("nested/target-file.txt"))).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function loadPiToolsModule(): Promise<PiToolsModule> {
  const packageEntry = fileURLToPath(import.meta.resolve("@mariozechner/pi-coding-agent"));
  const toolsIndex = join(dirname(packageEntry), "core", "tools", "index.js");
  return (await import(pathToFileURL(toolsIndex).href)) as PiToolsModule;
}

function toolOptions(workspace: string, permissionMode: "full-access" | "workspace"): unknown {
  return {
    read: {
      operations: createAmbientReadOperations(workspace),
    },
    bash: {
      operations: createToolRunnerBashOperations(() => ({
        permissionMode,
        workspacePath: workspace,
        subject: "pi-bash",
      })),
    },
    write: {
      operations: createAmbientWriteOperations(workspace),
    },
    edit: {
      operations: createAmbientEditOperations(workspace),
    },
    grep: {
      operations: createAmbientGrepOperations(workspace),
    },
    find: {
      operations: createAmbientFindOperations(workspace),
    },
    ls: {
      operations: createAmbientLsOperations(workspace),
    },
  };
}

async function seedToolMatrixWorkspace(root: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "nested"), { recursive: true });
  await mkdir(join(root, "list-dir", "folder"), { recursive: true });
  await writeFile(join(root, "README.md"), "Ambient tool matrix README\n", "utf8");
  await writeFile(join(root, "src", "app.js"), 'export const marker = "needle-target";\n', "utf8");
  await writeFile(join(root, "nested", "target-file.txt"), "target file body\n", "utf8");
  await writeFile(join(root, "edit-me.txt"), "alpha\nbeta\n", "utf8");
  await writeFile(join(root, "list-dir", "alpha.txt"), "alpha\n", "utf8");
}

async function executeTool(tool: PiTool, input: unknown, onUpdate?: (update: unknown) => void): Promise<unknown> {
  return tool.execute(`call-${tool.name}`, input, new AbortController().signal, onUpdate);
}

function extractToolText(result: unknown): string {
  if (!result || typeof result !== "object" || !("content" in result)) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractToolDetails(result: unknown): Record<string, string> {
  if (!result || typeof result !== "object" || !("details" in result)) return {};
  const details = (result as { details?: unknown }).details;
  return details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, string>) : {};
}
