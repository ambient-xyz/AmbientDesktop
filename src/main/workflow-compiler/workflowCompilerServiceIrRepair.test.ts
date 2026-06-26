import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowCompileProgress } from "../../shared/workflowTypes";
import { firstPartyDesktopToolDescriptors } from "./workflowCompilerDesktopToolFacade";
import { WorkflowProgramIrRepairRejectedError } from "./workflowCompilerIrRepair";
import { ProjectStore } from "./workflowCompilerProjectStoreFacade";
import { compileWorkflowArtifact } from "./workflowCompilerService";
import { readWorkflowRunDetail } from "./workflowCompilerWorkflowDashboardFacade";
import { WorkflowProgramCompileError } from "./workflowCompilerWorkflowProgramFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("compileWorkflowArtifact IR repair and validation", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-compile-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("repairs invalid WorkflowProgramIR with typed operations instead of regenerating source", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR repair",
      initialRequest: "Search and write a report.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];
    const repairPrompts: string[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search for workflow compiler QA evidence and write a report.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Repairable IR QA Report",
          goal: "Search and write a deterministic report.",
          nodes: [
            { id: "search", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler QA", maxResults: 3 } },
            {
              id: "write",
              kind: "tool.call",
              tool: "file_write",
              dependsOn: ["search"],
              args: { path: "reports/ir-repair.md", content: { fromNode: "search" } },
            },
            { id: "final", kind: "output.final", dependsOn: ["write"], value: { path: { fromNode: "write", path: "path" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          repairPrompts.push(input.prompt);
          if (input.attempt === 2) {
            return {
              repairOperations: [
                {
                  kind: "replace_with_alternative",
                  path: "/nodes/1/args/content",
                  value: { template: "{{results}}", vars: { results: { fromNode: "search", path: "items" } } },
                },
              ],
            };
          }
          return { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(repairPrompts).toHaveLength(2);
    expect(repairPrompts[0]).toContain('"repairOperations"');
    expect(repairPrompts[0]).toContain("ir.unavailable_tool");
    expect(repairPrompts[0]).toContain("browserSearch");
    expect(repairPrompts[1]).toContain("ir.reference_path_required");
    expect(repairPrompts[1]).toContain("/nodes/1/args/content");
    expect(progress.map((event) => event.message)).toEqual(
      expect.arrayContaining([
        "Repairing workflow program IR with typed repair operations.",
        "Applied workflow program IR repair operations.",
        "Workflow program IR passed static validation, codegen, and dry-run.",
      ]),
    );
    expect(
      progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics,
    ).toMatchObject({
      repairAttemptCount: 2,
      patchOperationCount: 2,
      incrementalValidationCacheHits: 1,
      incrementalValidationCacheMisses: 2,
      incrementalValidationLevelCount: expect.any(Number),
      loweringCacheHits: 0,
      loweringCacheMisses: 3,
    });
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    const modelCall = store
      .listWorkflowModelCalls({ artifactId: dashboard.artifacts[0].id })
      .find((call) => call.task === "workflow.compiler");
    expect(modelCall?.output).toMatchObject({
      normalizedProgram: expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "search", tool: "browser_search" }),
          expect.objectContaining({
            id: "write",
            args: expect.objectContaining({ content: expect.objectContaining({ template: "{{results}}" }) }),
          }),
        ]),
      }),
      repairHistory: [
        expect.objectContaining({ attempt: 1, patch: [{ op: "replace", path: "/nodes/0/tool", value: "browser_search" }] }),
        expect.objectContaining({ attempt: 2 }),
      ],
    });
    const artifactRoot = dirname(dashboard.artifacts[0].sourcePath);
    const repairHistory = JSON.parse(await readFile(join(artifactRoot, "repair-history.json"), "utf8"));
    expect(repairHistory).toMatchObject({
      schemaVersion: 1,
      repairAttemptCount: 2,
      patchOperationCount: 2,
      attempts: [
        {
          attempt: 1,
          diagnosticCount: 2,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: "ir.unavailable_tool", nodeId: "search" }),
            expect.objectContaining({ code: "ir.reference_path_required", nodeId: "write" }),
          ]),
          patchOperationCount: 1,
          patch: [{ op: "replace", path: "/nodes/0/tool", value: "browser_search" }],
          rawPatch: { repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }] },
        },
        {
          attempt: 2,
          diagnostics: expect.arrayContaining([expect.objectContaining({ code: "ir.reference_path_required", nodeId: "write" })]),
          patchOperationCount: 1,
        },
      ],
    });
    const compileRun = dashboard.runs.find((run) => run.artifactId === dashboard.artifacts[0].id)!;
    const compileEvent = store.listWorkflowRunEvents(compileRun.id).find((event) => event.type === "workflow.compile");
    expect(compileEvent?.data).toMatchObject({
      repairHistoryPath: join(artifactRoot, "repair-history.json"),
      validationReportPath: join(artifactRoot, "validation-report.json"),
      repairAttemptCount: 2,
      patchOperationCount: 2,
    });
    const detail = readWorkflowRunDetail(store, compileRun.id);
    expect(detail?.sourceProvenance?.repairHistoryPath).toBe(join(artifactRoot, "repair-history.json"));
    expect(detail?.sourceProvenance?.validationReportPath).toBe(join(artifactRoot, "validation-report.json"));
  });

  it("emits phase-aware failed progress when WorkflowProgramIR cannot be repaired", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR failure",
      initialRequest: "Search with an unavailable tool.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];

    await expect(
      compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Search for workflow compiler QA evidence.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid IR",
            goal: "Reference an unavailable browser alias.",
            nodes: [{ id: "search", kind: "tool.call", tool: "browserSearch", args: { query: "workflow compiler QA" } }],
          }),
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toThrow("ir.unavailable_tool");

    const failedValidation = progress.find((event) => event.message === "Workflow program IR failed static validation.");
    expect(failedValidation).toMatchObject({
      phase: "validated",
      status: "failed",
      metrics: {
        compilerMode: "program_ir",
        compilerFailurePhase: "static_validation",
        failureDiagnosticCode: "ir.unavailable_tool",
        failureNodeId: "search",
        compilerDiagnosticCount: 1,
        repairAttemptCount: 0,
        compilerTotalMs: expect.any(Number),
        staticValidationMs: expect.any(Number),
      },
    });
    expect(progress.at(-1)).toMatchObject({ phase: "failed", status: "failed" });
    expect(store.getWorkflowAgentThreadSummary(thread.id).phase).toBe("failed");
  });

  it("validates WorkflowProgramIR tools against the full registry, not just the prompt subset", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "IR registry fallback",
      initialRequest: "Search for workflow compiler QA evidence.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const toolDescriptors = firstPartyDesktopToolDescriptors().filter(
      (tool) => tool.name === "browser_search" || tool.name === "file_write",
    );
    const progress: WorkflowCompileProgress[] = [];
    let prompt = "";

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Search for workflow compiler QA evidence.",
      workspaceSummary: "Temp workspace",
      toolDescriptors,
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        discoverCapabilities: async () => ({
          queries: [{ query: "web search" }],
          requiredToolNames: ["browser_search"],
          openQuestions: [],
        }),
        compileProgramIr: async (input) => {
          prompt = input.prompt;
          return {
            version: 1,
            title: "IR Registry Fallback",
            goal: "Search and persist a local QA note.",
            nodes: [
              { id: "search", kind: "tool.call", tool: "browser_search", args: { query: "workflow compiler QA", maxResults: 2 } },
              {
                id: "write",
                kind: "tool.call",
                tool: "file_write",
                dependsOn: ["search"],
                args: {
                  path: "reports/ir-registry-fallback.md",
                  content: { template: "{{results}}", vars: { results: { fromNode: "search" } } },
                },
              },
              { id: "final", kind: "output.final", dependsOn: ["write"], value: { path: { fromNode: "write", path: "path" } } },
            ],
          };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    const selectedCapabilitySection = prompt.slice(
      prompt.indexOf("Selected Desktop workflow capabilities:"),
      prompt.indexOf("No workflow connectors were selected."),
    );
    expect(prompt).toContain("browser_search");
    expect(selectedCapabilitySection).toContain("browser_search");
    expect(selectedCapabilitySection).not.toContain("file_write");
    expect(prompt).not.toContain("Ambient CLI workflow capabilities:");
    expect(prompt).not.toContain("Ambient CLI execution must depend on a matching ambient_cli_describe node");
    expect(progress.find((event) => event.phase === "context" && event.status === "completed")?.metrics).toMatchObject({
      selectedToolCount: 1,
    });
    expect(dashboard.artifacts[0].manifest.tools).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("tools.file_write");
  });

  it("reports IR dependency-level validation concurrency for independent branches", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Parallel compile",
      initialRequest: "Compile independent branches and combine them.",
      projectPath: workspacePath,
      phase: "planned",
    });
    const progress: WorkflowCompileProgress[] = [];
    const branches = ["branch-1", "branch-2", "branch-3", "branch-4", "branch-5"];

    const dashboard = await compileWorkflowArtifact({
      store,
      workflowThreadId: thread.id,
      userRequest: "Compile independent branch components and then combine them.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Parallel Branch Workflow",
          goal: "Render independent branch values and combine their outputs.",
          summary: "Five independent branches feed one final combiner.",
          nodes: [
            ...branches.map((id) => ({
              id,
              kind: "transform.template",
              template: id,
            })),
            {
              id: "combine",
              kind: "output.final",
              dependsOn: branches,
              value: Object.fromEntries(branches.map((id) => [id, { fromNode: id, path: "value" }])),
            },
          ],
        }),
      },
      onProgress: (event) => progress.push(event),
    });

    expect(dashboard.artifacts).toHaveLength(1);
    expect(dashboard.artifacts[0].manifest.tools).toEqual([]);
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain('outputs["combine"]');
    expect(
      progress.find((event) => event.message === "Workflow program IR passed static validation, codegen, and dry-run.")?.metrics,
    ).toMatchObject({
      compilerMode: "program_ir",
      incrementalValidationConcurrency: 4,
      incrementalValidationLevelCount: 2,
      incrementalValidationMaxLevelWidth: 5,
      loweredOperationCount: 6,
    });
  });

  it("does not retry invalid Pi-authored source because legacy source repair is disabled", async () => {
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Write a report file.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {},
      }),
    ).rejects.toThrow("Workflow compiler requires a WorkflowProgramIR provider");
  });

  it("repairs invalid model IR with typed operations instead of source validation retry", async () => {
    const prompts: string[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"repairOperations"');
    expect(prompts[0]).toContain("Do not generate source code");
    expect(prompts[0]).toContain("ir.unknown_output_path");
    expect(dashboard.artifacts[0]).toMatchObject({
      title: "Invalid Classifier",
      status: "ready_for_preview",
    });
    await expect(readFile(dashboard.artifacts[0].sourcePath, "utf8")).resolves.toContain("outputContract");
  });

  it("persists WorkflowProgramIR compile-failure evidence under stateRoot", async () => {
    const progress: WorkflowCompileProgress[] = [];
    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Read a file and return its content.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid File Read",
            goal: "Return a file read result.",
            nodes: [
              { id: "read-source", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } },
              {
                id: "final-output",
                kind: "output.final",
                dependsOn: ["read-source"],
                value: { text: { fromNode: "read-source", path: "contents" } },
              },
            ],
          }),
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toBeInstanceOf(WorkflowProgramCompileError);

    const failed = progress.find((event) => event.status === "failed" && typeof event.metrics?.failureArtifactPath === "string");
    const failureArtifactPath = failed?.metrics?.failureArtifactPath;
    expect(failureArtifactPath).toEqual(expect.stringContaining(join(store.getWorkspace().statePath, "workflow-compile-failures")));

    const artifact = JSON.parse(await readFile(String(failureArtifactPath), "utf8"));
    expect(artifact).toMatchObject({
      attempt: 0,
      context: expect.objectContaining({
        selectedToolNames: expect.arrayContaining(["file_read"]),
      }),
      failureReport: expect.objectContaining({
        firstDiagnosticCode: "ir.unknown_output_path",
        firstDiagnosticSourceNodeId: "read-source",
        firstDiagnosticInvalidOutputPath: "contents",
        firstDiagnosticValidAlternatives: "path, content, truncated, kind",
        firstDiagnosticProducerOutputContract: "read-source (file_read result): path, content, truncated, kind",
        diagnostics: [
          expect.objectContaining({
            producerOutputContract: "read-source (file_read result): path, content, truncated, kind",
          }),
        ],
      }),
      repairHistory: [],
    });
  });

  it("retries malformed WorkflowProgramIR repair responses with patch-shape feedback", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return prompts.length === 1
            ? { version: 1, title: "Still not a patch", nodes: [] }
            : { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("repair response validation error");
    expect(prompts[1]).toContain('"repairOperations"');
    expect(progress.map((event) => event.message)).toContain(
      "WorkflowProgramIR repair response failed deterministic validation; retrying.",
    );
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("retries oversized WorkflowProgramIR repair responses with operation-limit feedback", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return prompts.length === 1
            ? {
                repairOperations: Array.from({ length: 21 }, () => ({
                  kind: "add_semantic_slot",
                  path: "/nodes/0/output/schema",
                  value: { labels: "array" },
                })),
              }
            : { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema", value: { labels: "array" } }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("maximum is 20");
    expect(prompts[1]).toContain("Return at most 20 repair operations");
    expect(
      progress.find((event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; retrying.")?.metrics,
    ).toMatchObject({
      repairFailureClass: "too_many_operations",
      repairRetryable: true,
    });
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("deterministically converts missing output schema repair paths instead of re-prompting Pi", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    const dashboard = await compileWorkflowArtifact({
      store,
      userRequest: "Classify records.",
      workspaceSummary: "Temp workspace",
      toolDescriptors: [],
      stateRoot: store.getWorkspace().statePath,
      model: AMBIENT_DEFAULT_MODEL,
      provider: {
        compileProgramIr: async () => ({
          version: 1,
          title: "Invalid Classifier",
          goal: "Classify records.",
          nodes: [
            {
              id: "classify",
              kind: "model.call",
              task: "classify.records",
              input: { records: [] },
              output: {},
            },
            { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
          ],
        }),
        repairProgramIr: async (input) => {
          prompts.push(input.prompt);
          return { repairOperations: [{ kind: "add_semantic_slot", path: "/nodes/0/output/schema/labels", value: "array" }] };
        },
      },
      onProgress: (event) => progress.push(event),
    });

    expect(prompts).toHaveLength(1);
    expect(progress.map((event) => event.message)).not.toContain(
      "WorkflowProgramIR repair response failed deterministic validation; retrying.",
    );
    expect(dashboard.artifacts[0]).toMatchObject({ status: "ready_for_preview" });
  });

  it("fails closed on impossible WorkflowProgramIR repair paths and persists rejected patch diagnostics", async () => {
    const prompts: string[] = [];
    const progress: WorkflowCompileProgress[] = [];

    await expect(
      compileWorkflowArtifact({
        store,
        userRequest: "Classify records.",
        workspaceSummary: "Temp workspace",
        toolDescriptors: [],
        stateRoot: store.getWorkspace().statePath,
        model: AMBIENT_DEFAULT_MODEL,
        provider: {
          compileProgramIr: async () => ({
            version: 1,
            title: "Invalid Classifier",
            goal: "Classify records.",
            nodes: [
              {
                id: "classify",
                kind: "model.call",
                task: "classify.records",
                input: { records: [] },
                output: {},
              },
              { id: "report", kind: "output.final", dependsOn: ["classify"], value: { labels: { fromNode: "classify", path: "labels" } } },
            ],
          }),
          repairProgramIr: async (input) => {
            prompts.push(input.prompt);
            return {
              repairOperations: [
                { kind: "replace_with_alternative", path: "/nodes/-", value: { id: "unused", kind: "output.final", value: {} } },
              ],
            };
          },
        },
        onProgress: (event) => progress.push(event),
      }),
    ).rejects.toBeInstanceOf(WorkflowProgramIrRepairRejectedError);

    const retryEvents = progress.filter(
      (event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; retrying.",
    );
    const failClosedEvent = progress.find(
      (event) => event.message === "WorkflowProgramIR repair response failed deterministic validation; failing closed.",
    );
    const failedEvent = progress.find(
      (event) => event.message === "WorkflowProgramIR repair failed deterministic validation; retained diagnostics.",
    );
    expect(prompts).toHaveLength(1);
    expect(retryEvents).toHaveLength(0);
    expect(failClosedEvent?.metrics).toMatchObject({ repairFailureClass: "invalid_array_index", repairRetryable: false });
    expect(failedEvent?.metrics).toMatchObject({ repairFailureClass: "invalid_array_index", repairRetryable: false });

    const failureArtifactPath = String(failedEvent?.metrics?.failureArtifactPath);
    expect(failureArtifactPath).toEqual(expect.stringContaining(join(store.getWorkspace().statePath, "workflow-compile-failures")));
    const artifact = JSON.parse(await readFile(failureArtifactPath, "utf8"));
    expect(artifact.context.repairFailure).toMatchObject({
      failureClass: "invalid_array_index",
      retryable: false,
      rawPatch: {
        repairOperations: [
          { kind: "replace_with_alternative", path: "/nodes/-", value: { id: "unused", kind: "output.final", value: {} } },
        ],
      },
    });
  });
});
