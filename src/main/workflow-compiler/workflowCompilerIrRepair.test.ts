import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktop-tools/desktopToolRegistry";
import {
  applyWorkflowProgramIrPatch,
  buildWorkflowProgramIrRepairPrompt,
  classifyWorkflowProgramIrRepairValidationError,
  parseWorkflowProgramIrPatchResponse,
} from "./workflowCompilerIrRepair";

describe("workflowCompilerIrRepair", () => {
  it("applies bounded JSON Patch repairs without mutating the original program", () => {
    const program = {
      version: 1,
      title: "Repair",
      goal: "Repair a tool name.",
      nodes: [{ id: "search", kind: "tool.call", tool: "browserSearch", args: {} }],
    };

    const patched = applyWorkflowProgramIrPatch(program, [
      { op: "replace", path: "/nodes/0/tool", value: "browser_search" },
      { op: "add", path: "/nodes/0/args/query", value: "workflow compiler QA" },
      { op: "add", path: "/nodes/-", value: { id: "final", kind: "output.final", dependsOn: ["search"], value: { fromNode: "search" } } },
    ]);

    expect(program.nodes).toHaveLength(1);
    expect(patched).toMatchObject({
      nodes: [
        { tool: "browser_search", args: { query: "workflow compiler QA" } },
        { id: "final", kind: "output.final" },
      ],
    });
  });

  it("normalizes diagnostic locator paths to the owning collection reference field", () => {
    const program = {
      version: 1,
      title: "Repair locator path",
      goal: "Repair Gmail collection references.",
      nodes: [
        { id: "search-emails", kind: "connector.call", connectorId: "google.gmail", operation: "search", input: {} },
        { id: "read-threads", kind: "connector.map", items: { fromNode: "search-emails", path: "items" }, operation: "getThread" },
        { id: "summarize", kind: "model.call", input: {}, output: { schema: { summary: "string" } } },
        { id: "redacted-audit", kind: "collection.map", items: { fromNode: "search-emails", path: "items" }, map: {} },
      ],
    };

    const patched = applyWorkflowProgramIrPatch(program, [
      { op: "replace", path: "/nodes/1/0/path", value: "threads" },
      { op: "replace", path: "/nodes/3/0/path", value: "threads" },
    ]);

    expect(patched).toMatchObject({
      nodes: [
        {},
        { items: { fromNode: "search-emails", path: "threads" } },
        {},
        { items: { fromNode: "search-emails", path: "threads" } },
      ],
    });
  });

  it("normalizes diagnostic locator paths for model input references", () => {
    const program = {
      version: 1,
      title: "Repair model input reference",
      goal: "Repair model input source metadata.",
      nodes: [
        { id: "search-sources", kind: "tool.paginate", tool: "browser_search", pageQueries: [] },
        {
          id: "synthesize-report",
          kind: "model.reduce",
          items: { fromNode: "search-sources", path: "items" },
          task: "synthesize.report",
          input: {},
          output: { schema: { markdown: "string" } },
          maxInputItems: 10,
        },
      ],
    };

    const patched = applyWorkflowProgramIrPatch(program, [
      { op: "replace", path: "/nodes/1/1/sourceCandidateCount/fromNode", value: "search-sources" },
      { op: "replace", path: "/nodes/1/input/sourceCandidateCount/path", value: "count" },
    ]);

    expect(patched).toMatchObject({
      nodes: [
        {},
        {
          input: {
            sourceCandidateCount: { fromNode: "search-sources", path: "count" },
          },
        },
      ],
    });
  });

  it("normalizes exact invalid-path failure locators from repair diagnostics", () => {
    const program = {
      version: 1,
      title: "Repair exact failure locators",
      goal: "Freeze numeric diagnostic pointers that should not be applied literally.",
      nodes: [
        { id: "search-sources", kind: "tool.paginate", tool: "browser_search", pageQueries: [], maxItems: 4, maxPages: 1 },
        { id: "prepare-a", kind: "transform.template", template: "a", vars: {} },
        { id: "prepare-b", kind: "transform.template", template: "b", vars: {} },
        { id: "final-output", kind: "output.final", value: { fromNode: "search-sources", path: "results" } },
        { id: "prepare-c", kind: "transform.template", template: "c", vars: {} },
        { id: "prepare-d", kind: "transform.template", template: "d", vars: {} },
        { id: "prepare-e", kind: "transform.template", template: "e", vars: {} },
        {
          id: "synthesize-report",
          kind: "model.reduce",
          items: { fromNode: "search-sources", path: "items" },
          task: "synthesize.report",
          input: {},
          output: { schema: { markdown: "string" } },
          maxInputItems: 4,
        },
      ],
    };

    const patched = applyWorkflowProgramIrPatch(program, [
      { op: "replace", path: "/nodes/3/0/path", value: "items" },
      { op: "replace", path: "/nodes/7/1/sourceCandidateCount/fromNode", value: "search-sources" },
      { op: "replace", path: "/nodes/7/input/sourceCandidateCount/path", value: "count" },
    ]);

    expect(patched).toMatchObject({
      nodes: [
        {},
        {},
        {},
        { value: { fromNode: "search-sources", path: "items" } },
        {},
        {},
        {},
        { input: { sourceCandidateCount: { fromNode: "search-sources", path: "count" } } },
      ],
    });
  });

  it("parses wrapped repair responses and rejects unsafe patch targets", () => {
    expect(parseWorkflowProgramIrPatchResponse({ patch: [{ op: "remove", path: "/nodes/0/openQuestion" }] })).toEqual([
      { op: "remove", path: "/nodes/0/openQuestion" },
    ]);
    expect(() => parseWorkflowProgramIrPatchResponse({ patch: [{ op: "copy", path: "/nodes/0" }] })).toThrow(/unsupported op/);
    expect(() => applyWorkflowProgramIrPatch({}, [{ op: "add", path: "/__proto__/polluted", value: true }])).toThrow(/Unsafe JSON Pointer/);
  });

  it("parses typed repair operations into bounded compiler-owned patch operations", () => {
    const program = {
      version: 1,
      title: "Typed repair",
      goal: "Repair without arbitrary patch authorship.",
      nodes: [
        { id: "search", kind: "tool.call", tool: "browserSearch", args: {} },
        { id: "classify", kind: "model.call", input: { records: [] }, output: {} },
        { id: "optional-approval", kind: "approval.required", dependsOn: ["classify"] },
      ],
    };

    const patch = parseWorkflowProgramIrPatchResponse(
      {
        repairOperations: [
          {
            kind: "replace_with_alternative",
            path: "/nodes/0/tool",
            value: "browser_search",
            alternatives: ["browser_search", "browser_nav"],
          },
          { kind: "add_semantic_slot", path: "/nodes/1/output/schema/labels", value: "array" },
          { kind: "remove_optional_node", nodeId: "optional-approval" },
        ],
      },
      program,
    );

    expect(patch).toEqual([
      { op: "replace", path: "/nodes/0/tool", value: "browser_search" },
      { op: "add", path: "/nodes/1/output/schema/labels", value: "array" },
      { op: "remove", path: "/nodes/2" },
    ]);
    expect(applyWorkflowProgramIrPatch(program, patch)).toMatchObject({
      nodes: [
        { id: "search", tool: "browser_search" },
        { id: "classify", output: { schema: { labels: "array" } } },
      ],
    });
  });

  it("treats typed user-choice repair responses as deterministic non-retryable failures", () => {
    let error: unknown;
    try {
      parseWorkflowProgramIrPatchResponse({
        repairOperations: [
          {
            kind: "ask_user_for_missing_choice",
            question: "Should the workflow send the drafted email or leave it for review?",
            choices: ["draft only", "send after approval"],
          },
        ],
      });
    } catch (caught) {
      error = caught;
    }

    expect(classifyWorkflowProgramIrRepairValidationError(error)).toMatchObject({
      failureClass: "user_choice_required",
      retryable: false,
      alternatives: ["draft only", "send after approval"],
    });
  });

  it("turns missing output schema slots into deterministic add operations", () => {
    const program = {
      version: 1,
      title: "Repair output schema",
      goal: "Repair a model output schema.",
      nodes: [
        {
          id: "classify",
          kind: "model.call",
          task: "classify.records",
          input: { records: [] },
          output: {},
        },
      ],
    };

    const patched = applyWorkflowProgramIrPatch(program, [{ op: "replace", path: "/nodes/0/output/schema/labels", value: "array" }]);

    expect(patched).toMatchObject({
      nodes: [{ output: { schema: { labels: "array" } } }],
    });
  });

  it("classifies impossible patch paths as non-retryable repair failures", () => {
    let error: unknown;
    try {
      applyWorkflowProgramIrPatch({ version: 1, nodes: [] }, [{ op: "replace", path: "/nodes/-", value: { id: "unused" } }]);
    } catch (caught) {
      error = caught;
    }

    expect(classifyWorkflowProgramIrRepairValidationError(error)).toMatchObject({
      failureClass: "invalid_array_index",
      retryable: false,
      alternatives: expect.arrayContaining(['Use add with "/-" only when appending to an array.']),
    });
  });

  it("builds a repair prompt that asks for typed repair operations", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: { version: 1, title: "Repair", goal: "Repair", nodes: [] },
      diagnostics: [{ code: "ir.unavailable_tool", severity: "error", message: "No tool.", path: "/nodes/0/tool", nodeId: "search" }],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "browser_search"),
      ambientCliCapabilities: [
        {
          capabilityId: "pi-arxiv:tool:arxiv_search",
          registryPluginId: "cli:pi-arxiv",
          packageId: "pi-arxiv",
          packageName: "pi-arxiv",
          command: "arxiv_search",
          availability: "available",
          missingEnv: [],
        },
      ],
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("\"repairOperations\"");
    expect(prompt).toContain("replace_with_alternative");
    expect(prompt).toContain("ask_user_for_missing_choice");
    expect(prompt).toContain("Do not return source code");
    expect(prompt).toContain("browser_search");
    expect(prompt).toContain("pi-arxiv:arxiv_search");
    expect(prompt).toContain("ir.unavailable_tool");
  });

  it("includes policy-specific browser intervention repair guidance", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Repair browser policy",
        goal: "Open a page.",
        nodes: [{ id: "open-page", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com", waitForUserAction: false } }],
      },
      diagnostics: [
        {
          code: "browser.intervention_review_required",
          severity: "error",
          message: "browser_nav with waitForUserAction:false must feed a review.input node.",
          path: "/nodes/0/args/waitForUserAction",
          nodeId: "open-page",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "browser_nav"),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("Policy-specific repair guidance");
    expect(prompt).toContain("prefer removing args.waitForUserAction");
    expect(prompt).toContain("add a review.input node");
  });

  it("includes original request context and guidance for missing pageQueries repairs", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Current web report",
        goal: "Collect current web sources.",
        nodes: [
          {
            id: "search-sources",
            kind: "tool.paginate",
            tool: "browser_search",
            input: { fetchContent: false },
            maxItems: 6,
            maxPages: 2,
            pageSize: 3,
            itemsPath: "",
            queryInputPath: "query",
            pageSizeInputPath: "maxResults",
          },
        ],
      },
      diagnostics: [
        {
          code: "tool.pagination_page_queries_required",
          severity: "error",
          message: "tool.paginate for browser_search needs pageQueries for multi-page collection.",
          path: "/nodes/0/pageQueries",
          nodeId: "search-sources",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "browser_search"),
      userRequest: "Use two pageQueries covering IANA example domains and reserved test domains documentation.",
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("Original user request:");
    expect(prompt).toContain("IANA example domains");
    expect(prompt).toContain("For tool.pagination_page_queries_required");
    expect(prompt).toContain("at least maxPages distinct query strings");
    expect(prompt).toContain("pageSizeInputPath should normally be maxResults");
  });

  it("includes repair guidance for unavailable file_write in read-only workflows", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Read-only audit",
        goal: "Checkpoint an audit trail.",
        nodes: [{ id: "write-audit-report", kind: "mutation.stage", tool: "file_write", args: { path: "reports/audit.md", content: "audit" } }],
      },
      diagnostics: [
        {
          code: "ir.unavailable_tool",
          severity: "error",
          message: "Node write-audit-report references unavailable tool file_write.",
          path: "/nodes/0/tool",
          nodeId: "write-audit-report",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => tool.name === "browser_search"),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("For unavailable file_write");
    expect(prompt).toContain("checkpoint.write");
  });

  it("includes repair guidance for redundant staged mutation approvals", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Redundant approval",
        goal: "Stage a report write.",
        nodes: [
          { id: "stage-write", kind: "mutation.stage", tool: "file_write", args: { path: "reports/audit.md", content: "audit" } },
          { id: "approve-write", kind: "approval.required", dependsOn: ["stage-write"], changeSet: { fromNode: "stage-write", path: "path" } },
        ],
      },
      diagnostics: [
        {
          code: "ir.redundant_stage_approval",
          severity: "error",
          message: "Node approve-write tries to approve staged mutation stage-write.",
          path: "/nodes/1/changeSet/fromNode",
          nodeId: "approve-write",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("For ir.redundant_stage_approval");
    expect(prompt).toContain("remove the approval.required node");
    expect(prompt).toContain("/nodes/3");
    expect(prompt).toContain("mutation.stage already pauses");
  });

  it("includes repair guidance for review.input output path aliases", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Repair review path",
        goal: "Ask before writing the report.",
        nodes: [
          { id: "review-report", kind: "review.input", prompt: "Approve the report?", choices: [{ id: "approve", label: "Approve" }] },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["review-report"],
            value: { decision: { fromNode: "review-report", path: "choice" } },
          },
        ],
      },
      diagnostics: [
        {
          code: "ir.unknown_output_path",
          severity: "error",
          message: "Node final-output references path choice on review-report, but that output path is not known for user input response.",
          path: "/nodes/1/value/decision/path",
          nodeId: "final-output",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("review.input outputs requestId, choiceId, text, and prompt");
    expect(prompt).toContain("replace review/input aliases such as choice or selectedChoice with choiceId");
  });

  it("includes repair guidance for collection references that need concrete array paths", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Repair image fan-out",
        goal: "Analyze selected images.",
        nodes: [
          { id: "list-images", kind: "tool.call", tool: "local_directory_list", args: { path: "~/Downloads" } },
          { id: "analyze-images", kind: "loop.map", items: { fromNode: "list-images" }, itemName: "item", map: { kind: "tool.call", tool: "ambient_visual_analyze", args: {} } },
        ],
      },
      diagnostics: [
        {
          code: "ir.array_reference_path_required",
          severity: "error",
          message: "Collection reference must include a concrete array path.",
          path: "/nodes/1/items",
          nodeId: "analyze-images",
        },
        {
          code: "ir.array_reference_wrapped",
          severity: "error",
          message: "Collection reference is wrapped in a literal array.",
          path: "/nodes/1/items",
          nodeId: "analyze-images",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => ["local_directory_list", "ambient_visual_analyze"].includes(tool.name)),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("For ir.array_reference_path_required");
    expect(prompt).toContain('{"fromNode":"list-images","path":"entries"}');
    expect(prompt).toContain("For ir.array_reference_wrapped");
    expect(prompt).toContain("one-element array wrapper");
  });

  it("tells repair to replace unavailable MiniCPM CLI lifecycle nodes with the visual desktop tool", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Repair visual CLI leak",
        goal: "Analyze selected images.",
        nodes: [
          { id: "check-vision-status", kind: "ambient_cli", packageName: "ambient-minicpm-vision", command: "minicpm_vision_status", args: {} },
          { id: "start-vision-server", kind: "ambient_cli", packageName: "ambient-minicpm-vision", command: "minicpm_vision_start", args: {} },
          { id: "analyze-images", kind: "loop.map", items: { fromNode: "select-visible-images", path: "items" }, itemName: "item", map: { kind: "ambient_cli", packageName: "ambient-minicpm-vision", command: "minicpm_vision_analyze", args: {} } },
        ],
      },
      diagnostics: [
        {
          code: "ambient_cli.capability_required",
          severity: "error",
          message: "ambient_cli node check-vision-status must match a selected Ambient CLI capability grant before codegen for ambient-minicpm-vision:minicpm_vision_status.",
          path: "/nodes/0/args",
          nodeId: "check-vision-status",
        },
        {
          code: "ambient_cli.describe_required",
          severity: "error",
          message: "ambient_cli node start-vision-server must depend on ambient_cli_describe for ambient-minicpm-vision:minicpm_vision_start before first execution.",
          path: "/nodes/1/dependsOn",
          nodeId: "start-vision-server",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors().filter((tool) => ["ambient_visual_analyze", "local_directory_list"].includes(tool.name)),
      ambientCliCapabilities: [],
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("For MiniCPM ambient_cli capability_required diagnostics");
    expect(prompt).toContain("Replace the analysis branch with the selected desktop tool ambient_visual_analyze");
    expect(prompt).toContain("remove the unavailable MiniCPM ambient_cli nodes");
    expect(prompt).toContain("provider startup, health checks, retries, and cleanup");
  });

  it("includes repair guidance for read-only connector write rejections", () => {
    const prompt = buildWorkflowProgramIrRepairPrompt({
      program: {
        version: 1,
        title: "Repair Gmail write",
        goal: "Summarize Gmail without mutations.",
        nodes: [{ id: "draft", kind: "connector.call", connectorId: "google.gmail", operation: "createDraft", input: { subject: "Draft" } }],
      },
      diagnostics: [
        {
          code: "connector.read_only_write_operation_rejected",
          severity: "error",
          message: "Google connector operation google.gmail.createDraft writes external state.",
          path: "/nodes/0/operation",
          nodeId: "draft",
          validatorId: "workflow.connector.operation_policy",
        },
      ],
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      attempt: 1,
      maxAttempts: 2,
    });

    expect(prompt).toContain("For connector.read_only_write_operation_rejected");
    expect(prompt).toContain("remove Gmail/Google connector draft/send/update/delete/create operations");
    expect(prompt).toContain("review.input");
  });
});
