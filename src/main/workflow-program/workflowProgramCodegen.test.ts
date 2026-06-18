import { describe, expect, it } from "vitest";
import type { WorkflowProgramNode } from "../../shared/workflowProgramIr";
import { firstPartyDesktopToolDescriptors } from "./workflowProgramDesktopToolFacade";
import { generateWorkflowProgramSource } from "./workflowProgramCodegen";

const toolDescriptors = firstPartyDesktopToolDescriptors();

function sourceFor(nodes: WorkflowProgramNode[]): string {
  return generateWorkflowProgramSource({ nodes, toolDescriptors, connectorDescriptors: [] });
}

describe("workflowProgramCodegen", () => {
  it("generates byte-stable source and batches parallel-safe nodes with a bounded concurrency cap", () => {
    const nodes: WorkflowProgramNode[] = [
      { id: "search-1", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler 1" } },
      { id: "search-2", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler 2" } },
      { id: "search-3", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler 3" } },
      { id: "search-4", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler 4" } },
      { id: "search-5", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler 5" } },
      {
        id: "final-output",
        kind: "output.final",
        dependsOn: ["search-1", "search-2", "search-3", "search-4", "search-5"],
        value: { searches: [{ fromNode: "search-1" }, { fromNode: "search-5" }] },
      },
    ];

    const first = sourceFor(nodes);
    const second = sourceFor(nodes);

    expect(first).toBe(second);
    expect(first).toContain("await Promise.all([");
    expect(first.match(/\(async \(\) => \{/g)).toHaveLength(4);
    expect(first).toContain("tools.browser_search");
    expect(first).toContain("workflow.output.ready");
  });

  it("keeps workspace writes inside staged mutation boundaries", () => {
    const source = sourceFor([
      {
        id: "write-report",
        kind: "mutation.stage",
        tool: "file_write",
        args: { path: "reports/output.md", content: "done" },
        changeSet: { tool: "file_write", args: { path: "reports/output.md" } },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["write-report"], value: { report: { fromNode: "write-report" } } },
    ]);

    expect(source).toContain("workflow.stageMutation");
    expect(source).toContain("tools.file_write");
    expect(source).toContain("\"tool\": \"file_write\"");
  });

  it("renders document artifacts before explicit staged file writes", () => {
    const source = sourceFor([
      {
        id: "render-report",
        kind: "document.render",
        input: { content: "# Report\n\nDone" },
        title: "Compiler Report",
        format: "pdf",
        path: "reports/compiler-report.pdf",
      },
      {
        id: "write-report",
        kind: "mutation.stage",
        tool: "file_write",
        dependsOn: ["render-report"],
        args: { path: { fromNode: "render-report", path: "artifactPath" }, content: { fromNode: "render-report", path: "content" } },
        changeSet: { path: { fromNode: "render-report", path: "artifactPath" }, summary: "Write rendered PDF report." },
      },
    ]);

    expect(source).toContain("workflow.renderDocument");
    expect(source).toContain('"format": "pdf"');
    expect(source).toContain("workflow.stageMutation");
    expect(source).toContain('readPath(outputs["render-report"], "content")');
  });

  it("emits first-class collection dedupe before downstream collection work", () => {
    const source = sourceFor([
      {
        id: "dedupe-sources",
        kind: "collection.dedupe",
        items: [{ url: "https://example.test/a" }, { url: "https://example.test/a?utm_source=x" }],
        keyPath: "url",
        strategy: "url_canonical",
        maxItems: 25,
      },
    ]);

    expect(source).toContain("workflow.dedupeCollection");
    expect(source).toContain('"keyPath": "url"');
    expect(source).toContain('"strategy": "url_canonical"');
    expect(() => new Function(source.replace(/^export default /, "return "))).not.toThrow();
  });

  it("wraps loop.map object expressions and emits bounded tool fan-out", () => {
    const objectMapSource = sourceFor([
      {
        id: "map-objects",
        kind: "loop.map",
        items: [{ name: "alpha" }],
        itemName: "item",
        map: { name: { fromItem: "item", path: "name" }, kind: "fixture" },
      },
    ]);
    expect(() => new Function(objectMapSource.replace(/^export default /, "return "))).not.toThrow();
    expect(objectMapSource).toContain("=> ({");

    const toolFanoutSource = sourceFor([
      {
        id: "analyze-images",
        kind: "loop.map",
        items: [{ absolutePath: "/tmp/a.png", name: "a.png" }],
        itemName: "item",
        maxItems: 10,
        maxConcurrency: 4,
        map: {
          kind: "tool.call",
          tool: "ambient_visual_analyze",
          args: {
            image: { path: { fromItem: "item", path: "absolutePath" }, source: "external_file", absolute: true, label: { fromItem: "item", path: "name" } },
            allowExternalMediaPaths: true,
          },
        },
      },
    ]);
    expect(() => new Function(toolFanoutSource.replace(/^export default /, "return "))).not.toThrow();
    expect(toolFanoutSource).toContain("workflow.batch");
    expect(toolFanoutSource).toContain("tools.ambient_visual_analyze");
    expect(toolFanoutSource).toContain("maxConcurrency: 4");
    expect(toolFanoutSource).not.toContain("error instanceof Error ? error.message : String(error)");
  });

  it("serializes browser intervention handoffs with user review, retry, and screenshot capture", () => {
    const source = sourceFor([
      {
        id: "read-blocked-source",
        kind: "browser.intervention",
        tool: "browser_content",
        args: { url: "https://example.com/protected" },
        source: { title: "Protected source", url: "https://example.com/protected" },
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" },
        screenshot: { enabled: true, args: { fullPage: false } },
      },
      { id: "final-output", kind: "output.final", dependsOn: ["read-blocked-source"], value: { source: { fromNode: "read-blocked-source" } } },
    ]);

    expect(source).toContain("workflow.askUser");
    expect(source).toContain("browserInterventionData");
    expect(source).toContain("userActionId");
    expect(source).toContain("tools.browser_screenshot");
    expect(source).toContain("browser-intervention-still-blocked");
  });
});
