import { describe, expect, it } from "vitest";
import { workflowSourceHighlightChunks, workflowSourceHighlightModel, workflowSourceMappingRows } from "./workflowSourceHighlightUiModel";

describe("workflow source highlight UI model", () => {
  it("builds highlighted source chunks and version proof for selected graph nodes", () => {
    const source = "before\nawait ambient.call({ nodeId: \"classify\" });\nafter";
    const start = source.indexOf("await ambient.call");
    const end = source.indexOf(";\nafter") + 1;

    expect(workflowSourceHighlightChunks(source, { start, end })).toEqual([
      { text: "before\n", highlighted: false },
      { text: 'await ambient.call({ nodeId: "classify" });', highlighted: true },
      { text: "\nafter", highlighted: false },
    ]);

    expect(
      workflowSourceHighlightModel({
        source,
        node: {
          id: "classify",
          label: "Classify",
          sourceRanges: [
            {
              kind: "ambient_call",
              start,
              end,
              startLine: 2,
              startColumn: 1,
              endLine: 2,
              endColumn: 44,
              snippet: 'await ambient.call({ nodeId: "classify" });',
            },
          ],
        },
        version: {
          version: 3,
          gitCommitHash: "abcdef1234567890",
        },
      }),
    ).toMatchObject({
      nodeLabel: "Classify (classify)",
      rangeLabel: "Line 2, columns 1-44",
      callKindLabel: "Ambient Call",
      versionLabel: "Version 3",
      commitLabel: "abcdef1",
      chunks: expect.arrayContaining([expect.objectContaining({ highlighted: true })]),
    });
  });

  it("returns no model when the selected graph node has no source range", () => {
    expect(workflowSourceHighlightModel({ source: "source", node: { id: "request", label: "Request" } })).toBeUndefined();
  });

  it("summarizes graph-node source mappings for source review", () => {
    expect(
      workflowSourceMappingRows([
        {
          id: "arxiv-search",
          label: "Search arXiv",
          sourceRanges: [
            {
              kind: "workflow_step",
              start: 12,
              end: 84,
              startLine: 4,
              startColumn: 3,
              endLine: 7,
              endColumn: 5,
              snippet: "await workflow.step('search', { nodeId: 'arxiv-search' }, () => tools.ambient_cli(...))",
            },
          ],
        },
        { id: "output", label: "Output" },
      ]),
    ).toEqual([
      {
        id: "arxiv-search:workflow_step:12:84:0",
        nodeId: "arxiv-search",
        nodeLabel: "Search arXiv (arxiv-search)",
        kindLabel: "Workflow Step",
        rangeLabel: "Lines 4-7",
        snippet: "await workflow.step('search', { nodeId: 'arxiv-search' }, () => tools.ambient_cli(...))",
      },
    ]);
  });
});
