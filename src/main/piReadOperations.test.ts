import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { createDocxFixture, createXlsxFixture } from "./officeTestFixtures";
import { createPdfFixture } from "./pdfTestFixtures";
import {
  createAmbientEditOperations,
  createAmbientFindOperations,
  createAmbientGrepOperations,
  createAmbientLsOperations,
  createAmbientReadOperations,
  createAmbientWriteOperations,
} from "./piReadOperations";

describe("createAmbientReadOperations", () => {
  it("allows project-root reads from an active managed worktree authority", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-pi-project-root-"));
    const worktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    try {
      await mkdir(worktree, { recursive: true });
      await writeFile(join(projectRoot, "project-note.txt"), "project root readable\n", "utf8");

      const readTool = createReadTool(worktree, {
        operations: createAmbientReadOperations(worktree, { authorityRootPaths: [projectRoot] }),
      });
      const result = await readTool.execute(
        "call-read",
        { path: join(projectRoot, "project-note.txt") },
        new AbortController().signal,
      );

      expect(extractToolText(result)).toContain("project root readable");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("can disable implicit workspace reads and allow only explicit authority roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-child-authority-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });
      await writeFile(join(workspace, "allowed", "note.txt"), "allowed child read\n", "utf8");
      await writeFile(join(workspace, "denied.txt"), "denied workspace read\n", "utf8");

      const readTool = createReadTool(workspace, {
        operations: createAmbientReadOperations(workspace, {
          authorityRootPaths: [join(workspace, "allowed")],
          includeWorkspaceRootAuthority: false,
        }),
      });

      await expect(readTool.execute("call-denied", { path: "denied.txt" }, new AbortController().signal)).rejects.toThrow(
        /outside/,
      );
      const result = await readTool.execute("call-allowed", { path: "allowed/note.txt" }, new AbortController().signal);
      expect(extractToolText(result)).toContain("allowed child read");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requests file authority and retries reads against refreshed roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-authority-request-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });
      await writeFile(join(workspace, "denied.txt"), "approved child read\n", "utf8");
      const roots = [join(workspace, "allowed")];
      const requestFileAuthority = vi.fn(async (request) => {
        expect(request).toMatchObject({
          access: "read",
          toolName: "read",
          absolutePath: join(workspace, "denied.txt"),
          reason: "Path is outside the current workspace authority.",
        });
        roots.push(request.absolutePath);
        return true;
      });

      const readTool = createReadTool(workspace, {
        operations: createAmbientReadOperations(workspace, {
          authorityRootPaths: () => roots,
          includeWorkspaceRootAuthority: false,
          requestFileAuthority,
          toolName: "read",
        }),
      });

      const result = await readTool.execute("call-approved", { path: "denied.txt" }, new AbortController().signal);
      expect(extractToolText(result)).toContain("approved child read");
      expect(requestFileAuthority).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("feeds extracted PDF text through Pi's native read tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-pdf-"));
    try {
      await writeFile(join(workspace, "brief.pdf"), createPdfFixture(["Decision: native PDF extraction.", "Owner: Anika Rao."]));

      const readTool = createReadTool(workspace, { operations: createAmbientReadOperations(workspace) });
      const result = await readTool.execute("call-read", { path: "brief.pdf" }, new AbortController().signal);
      const text = extractToolText(result);

      expect(text).toContain("PDF text extracted from brief.pdf");
      expect(text).toContain("Decision: native PDF extraction.");
      expect(text).toContain("Owner: Anika Rao.");
      expect(text).not.toContain("%PDF-1.4");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("feeds extracted Office text through Pi's native read tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-office-"));
    try {
      await writeFile(join(workspace, "brief.docx"), await createDocxFixture(["Decision: approve the Saguaro launch plan.", "Owner: Anika Rao."]));

      const readTool = createReadTool(workspace, { operations: createAmbientReadOperations(workspace) });
      const result = await readTool.execute("call-read", { path: "brief.docx" }, new AbortController().signal);
      const text = extractToolText(result);

      expect(text).toContain("Office document text extracted from brief.docx");
      expect(text).toContain("Decision: approve the Saguaro launch plan.");
      expect(text).toContain("Owner: Anika Rao.");
      expect(text).not.toContain("[Content_Types].xml");
      expect(text).not.toContain("PK\u0003\u0004");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("feeds extracted xlsx text through Pi's native read tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-xlsx-"));
    try {
      await writeFile(join(workspace, "budget.xlsx"), await createXlsxFixture([{ name: "Budget", rows: [["Owner", "Amount"], ["Anika Rao", 1200]] }]));

      const readTool = createReadTool(workspace, { operations: createAmbientReadOperations(workspace) });
      const result = await readTool.execute("call-read", { path: "budget.xlsx" }, new AbortController().signal);
      const text = extractToolText(result);

      expect(text).toContain("Office document text extracted from budget.xlsx");
      expect(text).toContain("xlsx");
      expect(text).toContain("Sheet: Budget");
      expect(text).toContain("A2: Anika Rao");
      expect(text).toContain("B2: 1200");
      expect(text).not.toContain("[Content_Types].xml");
      expect(text).not.toContain("PK\u0003\u0004");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("returns a clear unsupported message for unsupported Office containers", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-office-unsupported-"));
    try {
      await writeFile(join(workspace, "sheet.xls"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));

      const readTool = createReadTool(workspace, { operations: createAmbientReadOperations(workspace) });
      const result = await readTool.execute("call-read", { path: "sheet.xls" }, new AbortController().signal);
      const text = extractToolText(result);

      expect(text).toContain("Spreadsheet Office files are not supported by native read yet.");
      expect(text).not.toContain("\xd0\xcf\x11\xe0");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects Pi read requests when a workspace symlink resolves outside the workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-read-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside secret", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-secret.txt"));

      const readTool = createReadTool(workspace, { operations: createAmbientReadOperations(workspace) });
      await expect(readTool.execute("call-read", { path: "linked-secret.txt" }, new AbortController().signal)).rejects.toThrow(
        /outside/,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("allows Pi read requests for declared read-only dependency roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-workspace-"));
    const dependency = await mkdtemp(join(tmpdir(), "ambient-pi-read-dependency-"));
    try {
      await writeFile(join(dependency, "converter.mjs"), "export const answer = 42;\n", "utf8");

      const readTool = createReadTool(workspace, {
        operations: createAmbientReadOperations(workspace, { readOnlyAllowedPaths: [dependency] }),
      });
      const result = await readTool.execute(
        "call-read",
        { path: join(dependency, "converter.mjs") },
        new AbortController().signal,
      );
      expect(extractToolText(result)).toContain("export const answer = 42;");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(dependency, { recursive: true, force: true });
    }
  });

  it("does not broaden missing read-only dependency roots to their existing parent directory", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-workspace-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-read-outside-"));
    try {
      await writeFile(join(outside, "other.txt"), "not a declared dependency", "utf8");

      const readTool = createReadTool(workspace, {
        operations: createAmbientReadOperations(workspace, { readOnlyAllowedPaths: [join(outside, "missing-dependency")] }),
      });
      await expect(readTool.execute("call-read", { path: join(outside, "other.txt") }, new AbortController().signal)).rejects.toThrow(
        /outside/,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("does not follow symlinks out of declared read-only dependency roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-read-workspace-"));
    const dependency = await mkdtemp(join(tmpdir(), "ambient-pi-read-dependency-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-read-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside secret", "utf8");
      await symlink(join(outside, "secret.txt"), join(dependency, "linked-secret.txt"));

      const readTool = createReadTool(workspace, {
        operations: createAmbientReadOperations(workspace, { readOnlyAllowedPaths: [dependency] }),
      });
      await expect(
        readTool.execute("call-read", { path: join(dependency, "linked-secret.txt") }, new AbortController().signal),
      ).rejects.toThrow(/outside the allowed read-only context|outside/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(dependency, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("allows Pi list requests for declared read-only dependency roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-list-workspace-"));
    const dependency = await mkdtemp(join(tmpdir(), "ambient-pi-list-dependency-"));
    try {
      await writeFile(join(dependency, "converter.mjs"), "export {};\n", "utf8");

      const lsTool = createLsTool(workspace, {
        operations: createAmbientLsOperations(workspace, { readOnlyAllowedPaths: [dependency] }),
      });
      const lsText = extractToolText(await lsTool.execute("call-ls", { path: dependency }, new AbortController().signal));
      expect(lsText).toContain("converter.mjs");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(dependency, { recursive: true, force: true });
    }
  });
});

describe("Pi write and edit workspace operations", () => {
  it("allows project-root writes and edits from an active managed worktree authority", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-pi-project-write-"));
    const worktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    try {
      await mkdir(worktree, { recursive: true });
      await writeFile(join(projectRoot, "edit-root.txt"), "alpha\n", "utf8");

      const writeTool = createWriteTool(worktree, {
        operations: createAmbientWriteOperations(worktree, { authorityRootPaths: [projectRoot] }),
      });
      await writeTool.execute(
        "call-write",
        { path: join(projectRoot, "generated-root.txt"), content: "root write\n" },
        new AbortController().signal,
      );
      await expect(readFile(join(projectRoot, "generated-root.txt"), "utf8")).resolves.toBe("root write\n");

      const editTool = createEditTool(worktree, {
        operations: createAmbientEditOperations(worktree, { authorityRootPaths: [projectRoot] }),
      });
      await editTool.execute(
        "call-edit",
        { path: join(projectRoot, "edit-root.txt"), edits: [{ oldText: "alpha", newText: "beta" }] },
        new AbortController().signal,
      );
      await expect(readFile(join(projectRoot, "edit-root.txt"), "utf8")).resolves.toBe("beta\n");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("can disable implicit workspace writes and allow only explicit authority roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-write-child-authority-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });

      const writeTool = createWriteTool(workspace, {
        operations: createAmbientWriteOperations(workspace, {
          authorityRootPaths: [join(workspace, "allowed")],
          includeWorkspaceRootAuthority: false,
        }),
      });

      await expect(
        writeTool.execute("call-denied", { path: "denied.txt", content: "denied\n" }, new AbortController().signal),
      ).rejects.toThrow(/outside/);
      await writeTool.execute(
        "call-allowed",
        { path: "allowed/generated.txt", content: "allowed\n" },
        new AbortController().signal,
      );
      await expect(readFile(join(workspace, "allowed", "generated.txt"), "utf8")).resolves.toBe("allowed\n");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requests file authority and retries writes against refreshed roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-write-authority-request-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });
      const roots = [join(workspace, "allowed")];
      const requestFileAuthority = vi.fn(async (request) => {
        expect(request).toMatchObject({
          access: "write",
          toolName: "write",
          absolutePath: join(workspace, "generated.txt"),
          reason: "Path is outside the current workspace authority.",
        });
        roots.push(workspace);
        return true;
      });

      const writeTool = createWriteTool(workspace, {
        operations: createAmbientWriteOperations(workspace, {
          authorityRootPaths: () => roots,
          includeWorkspaceRootAuthority: false,
          requestFileAuthority,
          toolName: "write",
        }),
      });

      await writeTool.execute("call-approved", { path: "generated.txt", content: "approved write\n" }, new AbortController().signal);
      await expect(readFile(join(workspace, "generated.txt"), "utf8")).resolves.toBe("approved write\n");
      expect(requestFileAuthority).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects Pi write requests through workspace symlinks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-write-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-write-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "outside", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-secret.txt"));

      const writeTool = createWriteTool(workspace, { operations: createAmbientWriteOperations(workspace) });
      await expect(
        writeTool.execute("call-write", { path: "linked-secret.txt", content: "changed" }, new AbortController().signal),
      ).rejects.toThrow(/symlink|outside/);
      await expect(readFile(join(outside, "secret.txt"), "utf8")).resolves.toBe("outside");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects Pi edit requests through workspace symlinks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-edit-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-edit-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "alpha\n", "utf8");
      await symlink(join(outside, "secret.txt"), join(workspace, "linked-secret.txt"));

      const editTool = createEditTool(workspace, { operations: createAmbientEditOperations(workspace) });
      await expect(
        editTool.execute(
          "call-edit",
          { path: "linked-secret.txt", edits: [{ oldText: "alpha", newText: "beta" }] },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/outside|File not found/);
      await expect(readFile(join(outside, "secret.txt"), "utf8")).resolves.toBe("alpha\n");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("Pi search and list workspace operations", () => {
  it("allows project-root grep, find, and ls from an active managed worktree authority", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-pi-project-search-"));
    const worktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    try {
      await mkdir(join(projectRoot, "notes"), { recursive: true });
      await mkdir(worktree, { recursive: true });
      await writeFile(join(projectRoot, "notes", "root-target.txt"), "root needle\n", "utf8");

      const options = { authorityRootPaths: [projectRoot] };
      const grepTool = createGrepTool(worktree, { operations: createAmbientGrepOperations(worktree, options) });
      const grepText = extractToolText(
        await grepTool.execute("call-grep", { pattern: "root needle", path: join(projectRoot, "notes"), literal: true }, new AbortController().signal),
      );
      expect(grepText).toContain("root-target.txt");

      const findTool = createFindTool(worktree, { operations: createAmbientFindOperations(worktree, options) });
      const findText = extractToolText(
        await findTool.execute("call-find", { pattern: "*target*.txt", path: join(projectRoot, "notes") }, new AbortController().signal),
      );
      expect(findText).toContain("root-target.txt");

      const lsTool = createLsTool(worktree, { operations: createAmbientLsOperations(worktree, options) });
      const lsText = extractToolText(await lsTool.execute("call-ls", { path: join(projectRoot, "notes") }, new AbortController().signal));
      expect(lsText).toContain("root-target.txt");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not follow outside workspace symlinks through grep, find, or ls", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-search-symlink-"));
    const outside = await mkdtemp(join(tmpdir(), "ambient-pi-search-outside-"));
    try {
      await mkdir(join(workspace, "src"), { recursive: true });
      await mkdir(join(workspace, "list-dir"), { recursive: true });
      await writeFile(join(workspace, "src", "inside-target.txt"), "inside needle\n", "utf8");
      await writeFile(join(workspace, "list-dir", "inside.txt"), "inside\n", "utf8");
      await writeFile(join(outside, "outside-target.txt"), "outside-secret-needle\n", "utf8");
      await symlink(join(outside, "outside-target.txt"), join(workspace, "linked-outside-target.txt"));
      await symlink(join(outside, "outside-target.txt"), join(workspace, "list-dir", "outside-link.txt"));

      const grepTool = createGrepTool(workspace, { operations: createAmbientGrepOperations(workspace) });
      const grepText = extractToolText(
        await grepTool.execute("call-grep", { pattern: "outside-secret-needle", path: ".", literal: true }, new AbortController().signal),
      );
      expect(grepText).not.toContain("outside-secret-needle");
      await expect(
        grepTool.execute(
          "call-grep",
          { pattern: "outside-secret-needle", path: "linked-outside-target.txt", literal: true },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/outside|Path not found/);

      const findTool = createFindTool(workspace, { operations: createAmbientFindOperations(workspace) });
      const findText = extractToolText(
        await findTool.execute("call-find", { pattern: "**/*target*.txt", path: "." }, new AbortController().signal),
      );
      expect(findText).toContain("src/inside-target.txt");
      expect(findText).not.toContain("linked-outside-target.txt");
      expect(findText).not.toContain("outside-target.txt");

      const lsTool = createLsTool(workspace, { operations: createAmbientLsOperations(workspace) });
      const lsText = extractToolText(await lsTool.execute("call-ls", { path: "list-dir" }, new AbortController().signal));
      expect(lsText).toContain("inside.txt");
      expect(lsText).not.toContain("outside-link.txt");
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

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
