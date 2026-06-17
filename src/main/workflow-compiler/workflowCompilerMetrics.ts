import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import { fixtureWorkflowConnector, workspaceInventoryConnectorDescriptor, type WorkflowConnectorDescriptor } from "../workflowConnectors";
import {
  compileWorkflowProgramIr,
  WorkflowProgramCompileError,
  type CompileWorkflowProgramIrInput,
  type WorkflowProgramAmbientCliCapability,
  type WorkflowProgramCompileMetrics,
  type WorkflowProgramDiagnostic,
} from "../workflow-program/workflowProgramCompiler";

export interface WorkflowCompilerBenchmarkCase {
  id: string;
  label: string;
  description: string;
  input: CompileWorkflowProgramIrInput;
}

export interface WorkflowCompilerBenchmarkCaseResult {
  id: string;
  label: string;
  status: "passed" | "failed";
  description: string;
  totalWallClockMs: number;
  piCallCount: number;
  piPromptChars: number;
  piResponseChars: number;
  retryCount: number;
  patchCount: number;
  staticPassMs: number;
  dryRunMs: number;
  generatedSourceBytes: number;
  graphNodeCount: number;
  irNodeCount: number;
  dryRunCallCount: number;
  compilerMetrics?: WorkflowProgramCompileMetrics;
  diagnostics?: WorkflowProgramDiagnostic[];
  failedPhase?: string;
  error?: string;
}

export interface WorkflowCompilerBenchmarkSummary {
  schemaVersion: 1;
  generatedAt: string;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  totals: {
    totalWallClockMs: number;
    piCallCount: number;
    retryCount: number;
    patchCount: number;
    generatedSourceBytes: number;
    graphNodeCount: number;
    irNodeCount: number;
  };
  cases: WorkflowCompilerBenchmarkCaseResult[];
}

export interface WorkflowCompilerBenchmarkReportPaths {
  jsonPath: string;
  markdownPath: string;
}

export async function runWorkflowCompilerBenchmarks(input: {
  cases?: WorkflowCompilerBenchmarkCase[];
  outputDir?: string;
  generatedAt?: string;
} = {}): Promise<{ summary: WorkflowCompilerBenchmarkSummary; paths?: WorkflowCompilerBenchmarkReportPaths }> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const cases = input.cases ?? workflowCompilerBenchmarkCases();
  const results: WorkflowCompilerBenchmarkCaseResult[] = [];
  for (const benchmarkCase of cases) {
    results.push(await runWorkflowCompilerBenchmarkCase(benchmarkCase));
  }
  const summary: WorkflowCompilerBenchmarkSummary = {
    schemaVersion: 1,
    generatedAt,
    caseCount: results.length,
    passedCount: results.filter((result) => result.status === "passed").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    totals: {
      totalWallClockMs: roundMs(results.reduce((sum, result) => sum + result.totalWallClockMs, 0)),
      piCallCount: results.reduce((sum, result) => sum + result.piCallCount, 0),
      retryCount: results.reduce((sum, result) => sum + result.retryCount, 0),
      patchCount: results.reduce((sum, result) => sum + result.patchCount, 0),
      generatedSourceBytes: results.reduce((sum, result) => sum + result.generatedSourceBytes, 0),
      graphNodeCount: results.reduce((sum, result) => sum + result.graphNodeCount, 0),
      irNodeCount: results.reduce((sum, result) => sum + result.irNodeCount, 0),
    },
    cases: results,
  };
  const paths = input.outputDir ? await writeWorkflowCompilerBenchmarkReports(summary, input.outputDir) : undefined;
  return { summary, paths };
}

export async function writeWorkflowCompilerBenchmarkReports(
  summary: WorkflowCompilerBenchmarkSummary,
  outputDir: string,
): Promise<WorkflowCompilerBenchmarkReportPaths> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "latest.json");
  const markdownPath = join(outputDir, "latest.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderWorkflowCompilerBenchmarkMarkdown(summary), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

export function renderWorkflowCompilerBenchmarkMarkdown(summary: WorkflowCompilerBenchmarkSummary): string {
  const lines = [
    "# Workflow Compiler Benchmark",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    `Cases: ${summary.passedCount}/${summary.caseCount} passed`,
    "",
    "| Case | Status | Total ms | Static ms | Dry-run ms | Source bytes | Graph nodes | IR nodes | Dry-run calls |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summary.cases.map((result) =>
      `| ${[
        result.label,
        result.status,
        formatMs(result.totalWallClockMs),
        formatMs(result.staticPassMs),
        formatMs(result.dryRunMs),
        String(result.generatedSourceBytes),
        String(result.graphNodeCount),
        String(result.irNodeCount),
        String(result.dryRunCallCount),
      ].join(" | ")} |`,
    ),
    "",
    "## Totals",
    "",
    `- total wall-clock: ${formatMs(summary.totals.totalWallClockMs)} ms`,
    `- Pi calls: ${summary.totals.piCallCount}`,
    `- retries: ${summary.totals.retryCount}`,
    `- patches: ${summary.totals.patchCount}`,
    `- generated source bytes: ${summary.totals.generatedSourceBytes}`,
    `- graph nodes: ${summary.totals.graphNodeCount}`,
    `- IR nodes: ${summary.totals.irNodeCount}`,
    "",
  ];
  const failures = summary.cases.filter((result) => result.status === "failed");
  if (failures.length) {
    lines.push("## Failures", "");
    for (const failure of failures) {
      lines.push(`### ${failure.label}`, "", `- phase: ${failure.failedPhase ?? "unknown"}`, `- error: ${failure.error ?? "unknown"}`, "");
      if (failure.diagnostics?.length) {
        lines.push("Diagnostics:", "");
        for (const diagnostic of failure.diagnostics) {
          lines.push(`- ${diagnostic.code} at ${diagnostic.path}${diagnostic.nodeId ? ` (${diagnostic.nodeId})` : ""}: ${diagnostic.message}`);
        }
        lines.push("");
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function workflowCompilerBenchmarkCases(): WorkflowCompilerBenchmarkCase[] {
  const tools = firstPartyDesktopToolDescriptors();
  const ambientCliCapabilities = [arxivAmbientCliCapability()];
  const connectorDescriptors = [
    fixtureWorkflowConnector([
      { id: "fixture-1", title: "Alpha" },
      { id: "fixture-2", title: "Beta" },
      { id: "fixture-3", title: "Gamma" },
    ]).descriptor,
    workspaceInventoryConnectorDescriptor(),
  ];
  return [
    {
      id: "linear-browser-qa",
      label: "Linear Browser QA",
      description: "Browser navigation, content, screenshot, model diagnosis, checkpoint, and final output.",
      input: {
        toolDescriptors: tools,
        program: {
          version: 1,
          title: "Browser QA",
          goal: "Inspect a fixture page and checkpoint QA evidence.",
          nodes: [
            { id: "open-page", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com" } },
            { id: "read-page", kind: "tool.call", tool: "browser_content", dependsOn: ["open-page"], args: {} },
            { id: "capture", kind: "tool.call", tool: "browser_screenshot", dependsOn: ["read-page"], args: {} },
            {
              id: "diagnose",
              kind: "model.call",
              dependsOn: ["read-page", "capture"],
              task: "diagnose.browser.qa",
              input: { page: { fromNode: "read-page" }, screenshot: { fromNode: "capture" } },
              output: { schema: { summary: "string", issues: "array" } },
            },
            { id: "checkpoint", kind: "checkpoint.write", dependsOn: ["diagnose"], key: "browserQa", value: { diagnosis: { fromNode: "diagnose" } } },
            { id: "final", kind: "output.final", dependsOn: ["checkpoint"], value: { diagnosis: { fromNode: "diagnose" } } },
          ],
        },
      },
    },
    {
      id: "parallel-multi-source-research",
      label: "Parallel Multi-source Research",
      description: "Independent browser, connector, file, and Google metadata reads that converge into one model summary.",
      input: {
        toolDescriptors: tools,
        connectorDescriptors,
        program: {
          version: 1,
          title: "Multi-source Research",
          goal: "Collect independent evidence and summarize it.",
          nodes: [
            { id: "search-web", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler metrics", maxResults: 5 } },
            { id: "read-notes", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
            { id: "list-records", kind: "connector.call", connectorId: "fixture.readonly", operation: "listRecords", accountId: "fixture", input: { limit: 5 }, output: { schema: { records: "array" } } },
            { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
            {
              id: "summarize",
              kind: "model.call",
              dependsOn: ["search-web", "read-notes", "list-records", "google-status"],
              task: "summarize.multi.source.research",
              input: {
                web: { fromNode: "search-web" },
                notes: { fromNode: "read-notes", path: "content" },
                records: { fromNode: "list-records", path: "records" },
                google: { fromNode: "google-status" },
              },
              output: { schema: { summary: "string", evidenceCount: "number" } },
            },
            { id: "final", kind: "output.final", dependsOn: ["summarize"], value: { summary: { fromNode: "summarize", path: "summary" } } },
          ],
        },
      },
    },
    {
      id: "bounded-connector-fanout",
      label: "Bounded Connector Fan-out",
      description: "Connector list plus bounded parallel connector.map detail reads before model summarization.",
      input: {
        toolDescriptors: tools,
        connectorDescriptors,
        program: {
          version: 1,
          title: "Connector Fan-out",
          goal: "List records, read a bounded set of details, and summarize them.",
          nodes: [
            { id: "list-records", kind: "connector.call", connectorId: "fixture.readonly", operation: "listRecords", accountId: "fixture", input: { limit: 3 }, output: { schema: { records: "array" } } },
            {
              id: "read-record-details",
              kind: "connector.map",
              connectorId: "fixture.readonly",
              operation: "getRecord",
              accountId: "fixture",
              dependsOn: ["list-records"],
              items: { fromNode: "list-records", path: "records" },
              itemName: "record",
              input: { id: { fromItem: "record", path: "id" } },
              maxItems: 3,
              maxConcurrency: 3,
              output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
            },
            {
              id: "summarize",
              kind: "model.call",
              dependsOn: ["read-record-details"],
              task: "summarize.connector.fanout",
              input: { details: { fromNode: "read-record-details", path: "items" }, sourceCount: { fromNode: "read-record-details", path: "sourceCount" } },
              output: { schema: { summary: "string", highlights: "array" } },
            },
            { id: "final", kind: "output.final", dependsOn: ["summarize"], value: { summary: { fromNode: "summarize", path: "summary" } } },
          ],
        },
      },
    },
    {
      id: "file-read-report",
      label: "File Read Report",
      description: "Local file read, deterministic template render, staged write, and final output.",
      input: {
        toolDescriptors: tools,
        program: {
          version: 1,
          title: "File Report",
          goal: "Read a local file and stage a markdown report.",
          nodes: [
            { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "README.md" } },
            {
              id: "render-report",
              kind: "transform.template",
              dependsOn: ["read-source"],
              template: "# File Report\n\n{{source.content}}",
              vars: { source: { fromNode: "read-source" } },
            },
            { id: "write-report", kind: "mutation.stage", tool: "file_write", dependsOn: ["render-report"], args: { path: "reports/file-report.md", content: { fromNode: "render-report", path: "value" } } },
            { id: "final", kind: "output.final", dependsOn: ["write-report"], value: { path: { fromNode: "write-report", path: "path" } } },
          ],
        },
      },
    },
    {
      id: "ambient-cli",
      label: "Ambient CLI",
      description: "Descriptor-backed Ambient CLI execution and model summarization.",
      input: {
        toolDescriptors: tools,
        ambientCliCapabilities,
        program: {
          version: 1,
          title: "Ambient CLI Research",
          goal: "Search arXiv with an installed CLI command and summarize the result.",
          nodes: [
            { id: "describe-arxiv", kind: "tool.call", tool: "ambient_cli_describe", args: { packageName: "pi-arxiv", command: "arxiv_search" } },
            {
              id: "search-arxiv",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-arxiv"],
              args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler", "--max-results", "3"] },
            },
            {
              id: "summarize",
              kind: "model.call",
              dependsOn: ["search-arxiv"],
              task: "summarize.ambient.cli",
              input: { stdout: { fromNode: "search-arxiv", path: "stdout" } },
              output: { schema: { summary: "string", citations: "array" } },
            },
            { id: "final", kind: "output.final", dependsOn: ["summarize"], value: { summary: { fromNode: "summarize", path: "summary" } } },
          ],
        },
      },
    },
    {
      id: "google-drive-read-only",
      label: "Google Drive Read-only",
      description: "Google method search, read-only Drive list call, local materialization, and final output.",
      input: {
        toolDescriptors: tools,
        program: {
          version: 1,
          title: "Google Drive Read-only",
          goal: "Read Drive metadata and save a local materialized review artifact.",
          nodes: [
            { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
            { id: "search-methods", kind: "tool.call", tool: "google_workspace_search_methods", dependsOn: ["google-status"], args: { service: "drive", query: "list files", sideEffect: "metadata_read" } },
            { id: "list-files", kind: "tool.call", tool: "google_workspace_call", dependsOn: ["search-methods"], args: { accountHint: "user@example.com", methodId: "drive.files.list", params: { pageSize: 10 } } },
            {
              id: "materialize-file",
              kind: "mutation.stage",
              tool: "google_workspace_materialize_file",
              dependsOn: ["list-files"],
              args: { handle: { fromNode: "list-files", path: "fileHandle" }, path: "Google Workspace Downloads/drive-list.json" },
            },
            { id: "final", kind: "output.final", dependsOn: ["materialize-file"], value: { path: { fromNode: "materialize-file", path: "path" } } },
          ],
        },
      },
    },
  ];
}

async function runWorkflowCompilerBenchmarkCase(input: WorkflowCompilerBenchmarkCase): Promise<WorkflowCompilerBenchmarkCaseResult> {
  const startedAtMs = nowMs();
  const responseChars = JSON.stringify(input.input.program).length;
  try {
    const compiled = await compileWorkflowProgramIr(input.input);
    return {
      id: input.id,
      label: input.label,
      status: "passed",
      description: input.description,
      totalWallClockMs: roundMs(nowMs() - startedAtMs),
      piCallCount: 0,
      piPromptChars: 0,
      piResponseChars: responseChars,
      retryCount: 0,
      patchCount: 0,
      staticPassMs: compiled.metrics.staticValidationMs,
      dryRunMs: compiled.metrics.dryRunMs,
      generatedSourceBytes: Buffer.byteLength(compiled.output.source, "utf8"),
      graphNodeCount: compiled.output.graph?.nodes.length ?? 0,
      irNodeCount: compiled.program.nodes.length,
      dryRunCallCount: compiled.dryRun.calls.length,
      compilerMetrics: compiled.metrics,
    };
  } catch (error) {
    const diagnostics = error instanceof WorkflowProgramCompileError ? error.diagnostics : undefined;
    const failedPhase = error instanceof WorkflowProgramCompileError ? error.failureReport?.phase ?? workflowCompilerFailurePhaseFromDiagnostics(diagnostics) : "unknown";
    return {
      id: input.id,
      label: input.label,
      status: "failed",
      description: input.description,
      totalWallClockMs: roundMs(nowMs() - startedAtMs),
      piCallCount: 0,
      piPromptChars: 0,
      piResponseChars: responseChars,
      retryCount: 0,
      patchCount: 0,
      staticPassMs: 0,
      dryRunMs: 0,
      generatedSourceBytes: 0,
      graphNodeCount: 0,
      irNodeCount: Array.isArray((input.input.program as { nodes?: unknown[] })?.nodes) ? (input.input.program as { nodes: unknown[] }).nodes.length : 0,
      dryRunCallCount: 0,
      diagnostics,
      failedPhase,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function workflowCompilerFailurePhaseFromDiagnostics(diagnostics: WorkflowProgramDiagnostic[] | undefined): string {
  const code = diagnostics?.[0]?.code;
  if (!code) return "unknown";
  if (code.startsWith("ir.") || code.startsWith("tool.") || code.startsWith("connector.") || code.startsWith("google.") || code.startsWith("ambient_cli.") || code.startsWith("budget.")) {
    return "static_validation";
  }
  if (code.startsWith("dry_run.")) return "dry_run";
  return "unknown";
}

function arxivAmbientCliCapability(): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search",
    registryPluginId: "pi-catalog",
    packageId: "pi-catalog:pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
    availability: "available",
    missingEnv: [],
  };
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

function formatMs(value: number): string {
  return value.toFixed(2);
}
