import { describe, expect, it } from "vitest";
import { formatPromptWithContext, formatWorkflowRecordingEditPrompt } from "./contextFormatting";

describe("formatPromptWithContext", () => {
  it("returns the original prompt when no context is selected", () => {
    expect(formatPromptWithContext("Build the thing.", [])).toBe("Build the thing.");
  });

  it("prepends explicit workspace path references", () => {
    expect(
      formatPromptWithContext("Update this.", [
        { path: "src/App.tsx", name: "App.tsx", kind: "file", size: 1536 },
        { path: "docs", name: "docs", kind: "directory" },
      ]),
    ).toBe(
      [
        "Selected workspace context for this turn:",
        "- file: src/App.tsx (1.5 KB)",
        "- directory: docs",
        "",
        "Use these workspace-relative paths as explicit context. Inspect files or folders before making related changes.",
        "",
        "Update this.",
      ].join("\n"),
    );
  });

  it("marks absolute context references distinctly", () => {
    expect(
      formatPromptWithContext("Compare these.", [
        { path: "/Users/neo/Desktop/reference.txt", name: "reference.txt", kind: "file", size: 512, absolute: true },
      ]),
    ).toBe(
      [
        "Selected context for this turn:",
        "- file: /Users/neo/Desktop/reference.txt (512 B) [absolute]",
        "",
        "Use these explicit paths as context. Absolute paths may require full-access tools to inspect before making related changes.",
        "",
        "Compare these.",
      ].join("\n"),
    );
  });

  it("prepends exact saved workflow edit context", () => {
    expect(
      formatWorkflowRecordingEditPrompt("I'd like to edit this workflow \"Date night\" to add booking links.", {
        id: "date-night",
        title: "Date night",
        version: 4,
        manifestPath: "/workspace/.ambient/workflows/date-night/ambient-workflow.json",
        markdownPath: "/workspace/.ambient/workflows/date-night/workflow.md",
        sidecarPath: "/workspace/.ambient/workflows/date-night/workflow.json",
        transcriptPath: "/workspace/.ambient/workflows/date-night/transcript.jsonl",
      }),
    ).toContain("Use ambient_workflows_describe with this exact id before proposing changes.");
  });
});
