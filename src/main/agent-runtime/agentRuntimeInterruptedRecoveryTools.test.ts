import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  applyInterruptedWriteSuffix,
  createInterruptedToolCallRecoveryToolExtension,
  readInterruptedToolCallRecoveryArtifact,
} from "./agentRuntimeInterruptedRecoveryTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("createInterruptedToolCallRecoveryToolExtension", () => {
  it("registers the recovery reader and returns exact saved arguments", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-reader-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-write.partial-args.txt");
    const exactArgs = JSON.stringify({ path: "report.md", content: "x".repeat(200) });
    const sha256 = createHash("sha256").update(exactArgs).digest("hex");
    const registeredTools: RegisteredTool[] = [];
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, exactArgs, "utf8");

      createInterruptedToolCallRecoveryToolExtension({
        workspacePath: root,
        readAuthorityRootPaths: () => [root],
        writeAuthorityRootPaths: () => [root],
      })({
        registerTool: (tool: any) => registeredTools.push(tool),
      } as any);

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "recovery_read_interrupted_tool_call",
        "recovery_apply_interrupted_write_suffix",
      ]);
      expect(registeredTools[0]!.executionMode).toBe("sequential");

      const result = await registeredTools[0]!.execute("tool-call-1", {
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
      });

      expect(result.content).toEqual([{ type: "text", text: exactArgs }]);
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_read_interrupted_tool_call",
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
        artifactPath,
        chars: exactArgs.length,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("applyInterruptedWriteSuffix", () => {
  it("appends only the missing suffix to saved write arguments", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-write-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-write.partial-args.txt");
    const exactArgs = JSON.stringify({ path: "report.md", content: "alpha beta" });
    const sha256 = createHash("sha256").update(exactArgs).digest("hex");
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, exactArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-1",
          toolCallId: "call-write",
          sha256,
          suffix: "beta gamma\n",
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      await expect(readFile(join(root, "report.md"), "utf8")).resolves.toBe("alpha beta gamma\n");
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_apply_interrupted_write_suffix",
        runId: "run-1",
        toolCallId: "call-write",
        sha256,
        artifactPath,
        prefixChars: "alpha beta".length,
        suffixChars: " gamma\n".length,
        overlapChars: "beta".length,
        finalChars: "alpha beta gamma\n".length,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recovers from partial JSON write arguments captured mid-content string", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-partial-write-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-write.partial-args.txt");
    const partialArgs = '{"path":"nested/report.md","content":"alpha\\nbe';
    const sha256 = createHash("sha256").update(partialArgs).digest("hex");
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, partialArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-1",
          toolCallId: "call-write",
          sha256,
          suffix: "beta gamma\n",
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      await expect(readFile(join(root, "nested", "report.md"), "utf8")).resolves.toBe("alpha\nbeta gamma\n");
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_apply_interrupted_write_suffix",
        prefixChars: "alpha\nbe".length,
        suffixChars: "ta gamma\n".length,
        overlapChars: "be".length,
        finalChars: "alpha\nbeta gamma\n".length,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("composes suffixes when recovery_apply_interrupted_write_suffix is itself interrupted", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-nested-write-"));
    const originalDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-original");
    const nestedDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-nested");
    const originalArgs = JSON.stringify({ path: "src/lib.rs", content: "alpha beta" });
    const originalSha256 = createHash("sha256").update(originalArgs).digest("hex");
    const savedSuffixPrefix = "beta gamma";
    const providedSuffixTail = "gamma delta\n";
    const nestedArgs = JSON.stringify({
      runId: "run-original",
      toolCallId: "call-write",
      sha256: originalSha256,
      suffix: {
        preview: savedSuffixPrefix,
        chars: "beta gamma delta\n".length,
        truncated: true,
        omittedChars: " delta\n".length,
      },
    });
    const nestedSha256 = createHash("sha256").update(nestedArgs).digest("hex");
    try {
      await mkdir(originalDir, { recursive: true });
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(originalDir, "call-write.partial-args.txt"), originalArgs, "utf8");
      await writeFile(join(nestedDir, "call-recovery.partial-args.txt"), nestedArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-nested",
          toolCallId: "call-recovery",
          sha256: nestedSha256,
          suffix: providedSuffixTail,
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      await expect(readFile(join(root, "src", "lib.rs"), "utf8")).resolves.toBe("alpha beta gamma delta\n");
      expect(result.details).toMatchObject({
        status: "done",
        toolName: "recovery_apply_interrupted_write_suffix",
        runId: "run-nested",
        toolCallId: "call-recovery",
        sha256: nestedSha256,
        nestedRecovery: true,
        originalRunId: "run-original",
        originalToolCallId: "call-write",
        originalSha256,
        savedSuffixPrefixChars: savedSuffixPrefix.length,
        savedSuffixTotalChars: "beta gamma delta\n".length,
        savedSuffixTruncated: true,
        savedSuffixOmittedChars: " delta\n".length,
        providedSuffixTailChars: providedSuffixTail.length,
        savedSuffixPrefixOverlapChars: "beta".length,
        suffixTailOverlapChars: "gamma".length,
        overlapChars: "betagamma".length,
        finalChars: "alpha beta gamma delta\n".length,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires the missing tail when a nested recovery suffix prefix is truncated", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-nested-tail-"));
    const originalDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-original");
    const nestedDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-nested");
    const originalArgs = JSON.stringify({ path: "src/lib.rs", content: "alpha beta" });
    const originalSha256 = createHash("sha256").update(originalArgs).digest("hex");
    const nestedArgs = JSON.stringify({
      runId: "run-original",
      toolCallId: "call-write",
      sha256: originalSha256,
      suffix: {
        preview: "beta gamma",
        chars: "beta gamma delta\n".length,
        truncated: true,
        omittedChars: " delta\n".length,
      },
    });
    const nestedSha256 = createHash("sha256").update(nestedArgs).digest("hex");
    try {
      await mkdir(originalDir, { recursive: true });
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(originalDir, "call-write.partial-args.txt"), originalArgs, "utf8");
      await writeFile(join(nestedDir, "call-recovery.partial-args.txt"), nestedArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-nested",
          toolCallId: "call-recovery",
          sha256: nestedSha256,
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("missing tail after the saved suffix prefix preview"),
      });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "recovery_apply_interrupted_write_suffix",
        issue: "nested_recovery_suffix_tail_required",
        nestedRecovery: true,
        savedSuffixTruncated: true,
        providedSuffixTailChars: 0,
      });
      await expect(readFile(join(root, "src", "lib.rs"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("parses partial JSON recovery-apply arguments as a saved suffix prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-nested-partial-"));
    const originalDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-original");
    const nestedDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-nested");
    const originalArgs = JSON.stringify({ path: "src/lib.rs", content: "alpha beta" });
    const originalSha256 = createHash("sha256").update(originalArgs).digest("hex");
    const nestedArgs = `{"runId":"run-original","toolCallId":"call-write","sha256":"${originalSha256}","suffix":"beta gamma`;
    const nestedSha256 = createHash("sha256").update(nestedArgs).digest("hex");
    try {
      await mkdir(originalDir, { recursive: true });
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(originalDir, "call-write.partial-args.txt"), originalArgs, "utf8");
      await writeFile(join(nestedDir, "call-recovery.partial-args.txt"), nestedArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-nested",
          toolCallId: "call-recovery",
          sha256: nestedSha256,
          suffix: "gamma delta\n",
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      await expect(readFile(join(root, "src", "lib.rs"), "utf8")).resolves.toBe("alpha beta gamma delta\n");
      expect(result.details).toMatchObject({
        status: "done",
        nestedRecovery: true,
        savedSuffixSource: "partial",
        savedSuffixTruncated: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects suffixes that look copied from JSON-escaped previews", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-escaped-suffix-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-write.partial-args.txt");
    const exactArgs = JSON.stringify({ path: "index.html", content: "<script>\nfunction winner() {\n" });
    const sha256 = createHash("sha256").update(exactArgs).digest("hex");
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, exactArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        {
          runId: "run-1",
          toolCallId: "call-write",
          sha256,
          suffix: "  return null;\\n}\\nfunction isDraw() {\\n  return true;\\n}",
          overlapStrategy: "auto",
        },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("double-escaped"),
      });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "recovery_apply_interrupted_write_suffix",
        issue: "double_escaped_newlines",
      });
      await expect(readFile(join(root, "index.html"), "utf8")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects saved arguments that are not write-compatible JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-not-write-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-read.partial-args.txt");
    const exactArgs = JSON.stringify({ path: "report.md" });
    const sha256 = createHash("sha256").update(exactArgs).digest("hex");
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, exactArgs, "utf8");

      const result = await applyInterruptedWriteSuffix(
        { runId: "run-1", toolCallId: "call-read", sha256, suffix: "missing content" },
        {
          workspacePath: root,
          readAuthorityRootPaths: [root],
          writeAuthorityRootPaths: () => [root],
        },
      );

      expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("not write-compatible JSON") });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "recovery_apply_interrupted_write_suffix",
        runId: "run-1",
        toolCallId: "call-read",
        artifactPath,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("readInterruptedToolCallRecoveryArtifact", () => {
  it("reports sha mismatches without returning saved arguments", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-runtime-recovery-sha-"));
    const artifactDir = join(root, ".ambient-codex", "interrupted-tool-calls", "run-1");
    const artifactPath = join(artifactDir, "call-write.prepared-args.txt");
    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, "prepared", "utf8");

      const result = readInterruptedToolCallRecoveryArtifact(
        { runId: "run-1", toolCallId: "call-write", sha256: "wrong" },
        { authorityRootPaths: [root] },
      );

      expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("failed sha256 verification") });
      expect(result.details).toMatchObject({
        status: "error",
        toolName: "recovery_read_interrupted_tool_call",
        runId: "run-1",
        toolCallId: "call-write",
        expectedSha256: "wrong",
        artifactPath,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects missing stable ids", () => {
    const result = readInterruptedToolCallRecoveryArtifact({}, { authorityRootPaths: ["/tmp"] });

    expect(result).toEqual({
      content: [{ type: "text", text: "runId and toolCallId are required." }],
      details: { status: "error", toolName: "recovery_read_interrupted_tool_call" },
    });
  });
});
