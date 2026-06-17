import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import {
  selectWorkflowCompilerConnectorDescriptors,
  selectWorkflowCompilerToolDescriptors,
  workflowCompilerRequiredBuiltinToolIntents,
  type WorkflowCompilerAmbientCliCapability,
} from "./workflowCompiler";
import { buildWorkflowProgramIrPromptParts, type WorkflowCompilerPromptParts } from "./workflowCompilerService";
import { fixtureWorkflowConnector, type WorkflowConnectorDescriptor } from "../workflowConnectors";
import type { WorkflowDiscoveryQuestion } from "../../shared/types";

const allToolDescriptors = firstPartyDesktopToolDescriptors();

function selectedTools(names: string[]) {
  const wanted = new Set(names);
  const tools = allToolDescriptors.filter((tool) => wanted.has(tool.name));
  expect(tools.map((tool) => tool.name).sort()).toEqual([...wanted].sort());
  return tools;
}

function connectorDescriptor(id: string, description?: string): WorkflowConnectorDescriptor {
  const fixture = fixtureWorkflowConnector().descriptor;
  return {
    ...fixture,
    id,
    label: id,
    description: description ?? `${id} connector for abstraction regression tests.`,
  };
}

function moduleIds(parts: WorkflowCompilerPromptParts): string[] {
  return parts.promptAssembly.modules.map((module) => module.id);
}

function selectedRecipeIds(parts: WorkflowCompilerPromptParts): string[] {
  return parts.selectedRecipes.map((recipe) => recipe.id);
}

function expectNoModuleFragments(ids: string[], fragments: string[]) {
  expect(ids.filter((id) => fragments.some((fragment) => id.includes(fragment)))).toEqual([]);
}

function expectNoPromptText(prompt: string, fragments: string[]) {
  for (const fragment of fragments) {
    expect(prompt, `Unexpected prompt text: ${fragment}`).not.toContain(fragment);
  }
}

describe("workflow compiler abstraction regression boundaries", () => {
  it("keeps model-only workflows free of source tool, connector, and provider guidance", () => {
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Use Ambient as the only knowledge source to ask one short quiz question and return a compact HTML answer card. Do not use browser, web, network, file tools, local files, connectors, Gmail, Google Workspace, Ambient CLI, visual analysis, or workspace writes.",
      workspaceSummary: "Phase 7 abstraction regression: model-only workflow.",
      toolDescriptors: [],
      connectorDescriptors: [],
    });
    const ids = moduleIds(parts);

    expect(ids).toEqual(expect.arrayContaining(["core-workflow-program-ir-semantics", "dynamic-user-request"]));
    expect(selectedRecipeIds(parts)).toEqual(["interactive_model_study_card"]);
    expectNoModuleFragments(ids, ["browser", "gmail", "google-workspace", "current_web", "current-data", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expectNoPromptText(parts.prompt, [
      "Browser recovery provenance rule",
      "Gmail metadata-first detail gate rule",
      "Visual-analysis rule",
      "Ambient CLI execution must depend",
      "Google transcript action-item pattern",
    ]);

    const selectedToolModule = parts.promptAssembly.modules.find((module) => module.id === "capability-selected-desktop-tools");
    const selectedConnectorModule = parts.promptAssembly.modules.find((module) => module.id === "connector-selected-workflow-connectors");
    expect(selectedToolModule?.selectedToolNames ?? []).toEqual([]);
    expect(selectedConnectorModule?.selectedConnectorIds ?? []).toEqual([]);
  });

  it("keeps local-file workflows capability-only unless a recipe signal is actually present", () => {
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Use file_read to read dogfood-notes/admin.md and dogfood-notes/learning.md, classify them, ask for review, then return the final card. Do not use browser, web, search, Google Workspace, Gmail, Ambient CLI, visual analysis, file writes, or external connectors.",
      workspaceSummary: "Phase 7 abstraction regression: local file workflow.",
      toolDescriptors: selectedTools(["file_read"]),
      connectorDescriptors: [],
    });
    const ids = moduleIds(parts);

    expect(ids).toEqual(expect.arrayContaining(["capability-selected-desktop-tools", "dynamic-user-request"]));
    expect(selectedRecipeIds(parts)).toEqual([]);
    expectNoModuleFragments(ids, ["browser", "gmail", "google-workspace", "current_web", "current-data", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expect(parts.prompt).toContain("file_read");
    expectNoPromptText(parts.prompt, [
      "Browser recovery provenance rule",
      "Gmail metadata-first detail gate rule",
      "Visual-analysis rule",
      "Ambient CLI execution must depend",
      "Recipe current_web_research",
      "Recipe staged_document_export",
    ]);
  });

  it("does not treat file_read plus approval feedback as a model-only study-card recipe", () => {
    const userRequest = [
      "Create a Workflow Agent that uses the file_read workflow tool directly to read these three known workspace-local files: dogfood-notes/admin.md, dogfood-notes/family-events.md, and dogfood-notes/learning.md.",
      "Use those relative paths exactly; do not embed absolute temporary paths in the workflow source.",
      "Do not use workspace.inventory, browser, search, Google Workspace, Google Drive, Ambient CLI, or connector listing for this scenario.",
      "Do not write files or create workspace mutations; return the labeled HTML in the final workflow output card.",
      "Classify the notes into useful categories, ask the user for qualitative feedback on the classifications, then returns a labeled HTML document.",
    ].join(" ");
    const toolSelection = selectWorkflowCompilerToolDescriptors({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: local file approval workflow.",
      toolDescriptors: allToolDescriptors,
      capabilityQueries: ["workspace.inventory", "Google Drive read", "browser search", "ambient cli search"],
      requiredToolNames: ["file_read", "google_workspace_call", "browser_search", "ambient_cli"],
    });
    const requiredIntents = workflowCompilerRequiredBuiltinToolIntents({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: local file approval workflow.",
      toolDescriptors: allToolDescriptors,
    });
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: local file approval workflow.",
      toolDescriptors: toolSelection.selectedToolDescriptors,
      connectorDescriptors: [],
    });
    const ids = moduleIds(parts);

    expect(toolSelection.selectedToolNames).toContain("file_read");
    for (const forbiddenToolName of ["google_workspace_call", "browser_search", "ambient_cli", "local_directory_list"]) {
      expect(toolSelection.selectedToolNames).not.toContain(forbiddenToolName);
    }
    expect(requiredIntents.map((intent) => intent.toolName)).toContain("file_read");
    expect(requiredIntents.map((intent) => intent.toolName)).not.toContain("local_directory_list");
    expect(selectedRecipeIds(parts)).toEqual([]);
    expect(ids).not.toContain("recipe-interactive_model_study_card");
    expectNoModuleFragments(ids, ["browser", "gmail", "google-workspace", "current_web", "current-data", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expect(parts.prompt).toContain("file_read");
    expectNoPromptText(parts.prompt, ["Recipe interactive_model_study_card", "Do not introduce browser, connector, CLI, local file"]);
  });

  it("keeps current-web export recipes free of Gmail, Google Workspace, visual, and Ambient CLI leakage", () => {
    const userRequest = [
      "Create a current public web research report from 6 source candidates using browser_search, then render Markdown and stage a file_write mutation.",
      "Do not use Google Workspace tools/connectors, Gmail, Calendar, Drive, local file reads, shell/bash, browser_nav, browser_content, visual analysis, or Ambient CLI.",
    ].join(" ");
    const toolSelection = selectWorkflowCompilerToolDescriptors({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: current web report.",
      toolDescriptors: allToolDescriptors,
      capabilityQueries: ["ambient-brave-search search", "browser public source search", "Gmail search", "Google Drive read"],
      requiredToolNames: ["browser_search", "file_write", "ambient_cli", "google_workspace_call"],
      explorationTraces: [
        {
          id: "trace-ambient-cli",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "capability-search",
          request: "Capability search found ambient-brave-search:search and Google Workspace connectors.",
          capabilityManifest: { tools: ["ambient_cli", "ambient_cli_search", "google_workspace_call"] },
          observations: [{ message: "ambient-brave-search is installed but browser_search is the requested source collector." }],
          events: [],
          distillation: {
            recommendedManifest: {
              tools: ["ambient_cli", "google_workspace_call"],
              connectors: [{ connectorId: "google.gmail" }, { connectorId: "google.drive" }],
            },
          },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });
    const connectorSelection = selectWorkflowCompilerConnectorDescriptors({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: current web report.",
      connectorDescriptors: [
        connectorDescriptor("google.gmail", "Read Gmail metadata."),
        connectorDescriptor("google.calendar", "Read Calendar events."),
        connectorDescriptor("google.drive", "Read Drive files."),
      ],
      capabilityQueries: ["Gmail search", "Drive read"],
      requiredConnectorIds: ["google.gmail", "google.drive"],
      explorationTraces: [
        {
          id: "trace-google",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "connector-search",
          request: "Capability search listed Google Workspace connector grants.",
          capabilityManifest: { connectors: ["google.gmail", "google.drive"] },
          observations: [],
          events: [],
          distillation: { recommendedManifest: { connectors: [{ connectorId: "google.gmail" }, { connectorId: "google.drive" }] } },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: current web report.",
      toolDescriptors: toolSelection.selectedToolDescriptors,
      connectorDescriptors: connectorSelection.selectedConnectorDescriptors,
    });
    const ids = moduleIds(parts);

    expect(toolSelection.selectedToolNames).toEqual(expect.arrayContaining(["browser_search", "file_write"]));
    expect(toolSelection.selectedToolNames.filter((name) => name.startsWith("ambient_cli"))).toEqual([]);
    expect(toolSelection.selectedToolNames.filter((name) => name.startsWith("google_workspace_"))).toEqual([]);
    expect(connectorSelection.selectedConnectorIds).toEqual([]);
    expect(selectedRecipeIds(parts)).toEqual(
      expect.arrayContaining(["current_web_research", "large_collection_summarization", "staged_document_export"]),
    );
    expect(ids).toEqual(
      expect.arrayContaining(["recipe-current_web_research", "recipe-large_collection_summarization", "recipe-staged_document_export"]),
    );
    expectNoModuleFragments(ids, ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expectNoPromptText(parts.prompt, [
      "Gmail metadata-first detail gate rule",
      "Visual-analysis rule",
      "Ambient CLI execution must depend",
      "Google transcript action-item pattern",
    ]);
  });

  it("honors read-only browser source authority over noisy discovery output targets", () => {
    const userRequest = [
      "Create a read-only Workflow Agent that reads https://example.com and https://www.iana.org/help/example-domains with browser_nav and browser_content.",
      "Do not use browser_search, file_write, file reads, workspace mutations, Google Workspace, Gmail, visual analysis, or Ambient CLI.",
      "Return the compact HTML report only in the final workflow output card.",
    ].join(" ");
    const discoveryQuestions: WorkflowDiscoveryQuestion[] = [
      {
        id: "output-target",
        workflowThreadId: "thread-phase-7-read-only",
        category: "side_effects",
        context: "No local file output is allowed for this read-only browser workflow.",
        question: "Where should the workflow write the final HTML report?",
        choices: [],
        allowFreeform: true,
        answer: { freeform: "Write the HTML report to Documents/example-domain-report.html.", answeredAt: "2026-05-17T00:00:00.000Z" },
        createdAt: "2026-05-17T00:00:00.000Z",
      },
    ];
    const toolSelection = selectWorkflowCompilerToolDescriptors({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: read-only provided browser URLs.",
      toolDescriptors: allToolDescriptors,
      capabilityQueries: ["browser provided URL read", "Gmail search", "Google Drive read"],
      requiredToolNames: ["browser_nav", "browser_content", "file_write", "google_workspace_call", "ambient_visual_analyze"],
      discoveryQuestions,
    });
    const connectorSelection = selectWorkflowCompilerConnectorDescriptors({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: read-only provided browser URLs.",
      connectorDescriptors: [connectorDescriptor("google.gmail", "Read Gmail metadata."), connectorDescriptor("google.drive", "Read Drive files.")],
      capabilityQueries: ["Gmail search", "Drive read"],
      requiredConnectorIds: ["google.gmail", "google.drive"],
      discoveryQuestions,
    });
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest,
      workspaceSummary: "Phase 7 abstraction regression: read-only provided browser URLs.",
      toolDescriptors: toolSelection.selectedToolDescriptors,
      connectorDescriptors: connectorSelection.selectedConnectorDescriptors,
    });
    const ids = moduleIds(parts);

    expect(toolSelection.selectedToolNames).toEqual(expect.arrayContaining(["browser_nav", "browser_content"]));
    expect(toolSelection.selectedToolNames).not.toContain("browser_search");
    expect(toolSelection.selectedToolNames).not.toContain("file_write");
    expect(toolSelection.selectedToolNames).not.toContain("ambient_visual_analyze");
    expect(toolSelection.selectedToolNames.filter((name) => name.startsWith("google_workspace_"))).toEqual([]);
    expect(connectorSelection.selectedConnectorIds).toEqual([]);
    expect(selectedRecipeIds(parts)).not.toContain("staged_document_export");
    expectNoModuleFragments(ids, ["gmail", "google-workspace", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expectNoPromptText(parts.prompt, [
      "Gmail metadata-first detail gate rule",
      "Visual-analysis rule",
      "Ambient CLI execution must depend",
      "Recipe staged_document_export",
    ]);
  });

  it("keeps browser_nav when provided URLs deny web search but still need browser recovery", () => {
    const userRequest = [
      "Create a read-only Workflow Agent that deliberately exercises retry and skip recovery for browser source fetching.",
      "Use exactly these source records: { id: 'example-source', url: 'https://example.com' }, { id: 'iana-source', url: 'https://www.iana.org/help/example-domains' }, and { id: 'bad-source', url: 'https://workflow-dogfood-invalid.invalid/recovery-check' }.",
      "For each item, call browser_nav with the item URL as the item-scoped browser read.",
      "Do not use web search, file reads, connectors, Google Workspace, shell, or writes.",
      "The fetch node must allow retrying the failed item and skipping it to continue with partial coverage.",
    ].join(" ");
    const toolSelection = selectWorkflowCompilerToolDescriptors({
      userRequest,
      workspaceSummary: "Phase 9 abstraction regression: browser recovery with provided URLs.",
      toolDescriptors: allToolDescriptors,
      capabilityQueries: ["browser provided URL recovery", "web search", "Google Drive read"],
      requiredToolNames: ["browser_nav", "browser_search", "file_read", "file_write", "google_workspace_call"],
    });
    const requiredIntents = workflowCompilerRequiredBuiltinToolIntents({
      userRequest,
      workspaceSummary: "Phase 9 abstraction regression: browser recovery with provided URLs.",
      toolDescriptors: allToolDescriptors,
      requiredToolNames: ["browser_nav", "browser_search"],
    });
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest,
      workspaceSummary: "Phase 9 abstraction regression: browser recovery with provided URLs.",
      toolDescriptors: toolSelection.selectedToolDescriptors,
      connectorDescriptors: [],
    });

    expect(toolSelection.selectedToolNames).toContain("browser_nav");
    expect(toolSelection.selectedToolNames).not.toContain("browser_search");
    expect(toolSelection.selectedToolNames).not.toContain("file_read");
    expect(toolSelection.selectedToolNames).not.toContain("file_write");
    expect(toolSelection.selectedToolNames.filter((name) => name.startsWith("google_workspace_"))).toEqual([]);
    expect(requiredIntents.map((intent) => intent.toolName)).toContain("browser_nav");
    expect(requiredIntents.map((intent) => intent.toolName)).not.toContain("browser_search");
    expect(selectedRecipeIds(parts)).toContain("browser_item_recovery");
    expect(selectedRecipeIds(parts)).not.toContain("current_web_research");
  });

  it("routes Google meeting transcript action-item workflows through the typed recipe instead of prompt-only rules", () => {
    const userRequest = [
      "Create a read-only workflow that pulls Google meeting recording transcripts from the last two weeks.",
      "Use Google Calendar events for provenance and Google Drive transcript files.",
      "Extract action items, owners, due dates, decisions, and unresolved questions.",
      "Use long_context_process before the final model.call because transcript evidence can be long.",
      "Do not use browser, web search, local files, file writes, Ambient CLI, Google Workspace raw tools, or Google mutations.",
    ].join(" ");
    const toolSelection = selectWorkflowCompilerToolDescriptors({
      userRequest,
      workspaceSummary: "Phase 8 abstraction regression: Google transcript action-item workflow.",
      toolDescriptors: allToolDescriptors,
      capabilityQueries: ["Google Calendar events", "Google Drive transcript read", "long context transcript extraction"],
      requiredToolNames: ["long_context_process", "ambient_cli", "browser_search", "file_write"],
    });
    const connectorSelection = selectWorkflowCompilerConnectorDescriptors({
      userRequest,
      workspaceSummary: "Phase 8 abstraction regression: Google transcript action-item workflow.",
      connectorDescriptors: [
        connectorDescriptor("google.gmail", "Read Gmail metadata."),
        connectorDescriptor("google.calendar", "Read Google Calendar meeting events."),
        connectorDescriptor("google.drive", "Search and read Google Drive transcript files."),
      ],
      capabilityQueries: ["Google Calendar listEvents", "Google Drive search readFile"],
      requiredConnectorIds: ["google.calendar", "google.drive"],
    });
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest,
      workspaceSummary: "Phase 8 abstraction regression: Google transcript action-item workflow.",
      toolDescriptors: toolSelection.selectedToolDescriptors,
      connectorDescriptors: connectorSelection.selectedConnectorDescriptors,
    });
    const ids = moduleIds(parts);

    expect(toolSelection.selectedToolNames).toContain("long_context_process");
    expect(toolSelection.selectedToolNames.filter((name) => name.startsWith("ambient_cli"))).toEqual([]);
    expect(toolSelection.selectedToolNames).not.toContain("browser_search");
    expect(toolSelection.selectedToolNames).not.toContain("file_write");
    expect(connectorSelection.selectedConnectorIds).toEqual(expect.arrayContaining(["google.calendar", "google.drive"]));
    expect(selectedRecipeIds(parts)).toEqual(
      expect.arrayContaining([
        "metadata_first_personal_data_review",
        "google_meeting_transcript_action_items",
      ]),
    );
    expect(ids).toContain("recipe-google_meeting_transcript_action_items");
    expect(parts.prompt).toContain("Recipe google_meeting_transcript_action_items");
    expect(parts.prompt).toContain("connector.paginate for google.calendar listEvents");
    expect(parts.prompt).toContain("connector.map for google.drive readFile");
    expect(parts.prompt).toContain("long_context_process");
    expect(parts.prompt).toContain('{"id":{"fromItem":"file","path":"id"}}');
    expect(parts.prompt).toContain('exportMimeType:"text/plain"');
    expect(parts.prompt).toContain("maxContentChars:4000");
    expect(parts.prompt).toContain("never use bare field-name strings");
    expectNoPromptText(parts.prompt, [
      "Google transcript action-item pattern",
      "Ambient CLI execution must depend",
      "Recipe current_web_research",
      "Recipe staged_document_export",
    ]);
  });

  it("keeps Gmail metadata review personal-data scoped without browser or Ambient CLI guidance", () => {
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Review 80 Gmail messages using metadata first, categorize the threads, and ask before reading any full message bodies or attachments. Do not use browser tools, local files, shell/bash, Ambient CLI, or any write operations.",
      workspaceSummary: "Phase 7 abstraction regression: Gmail metadata workflow.",
      toolDescriptors: [],
      connectorDescriptors: [connectorDescriptor("google.gmail", "Read Gmail messages and metadata.")],
    });
    const ids = moduleIds(parts);

    expect(selectedRecipeIds(parts)).toEqual(expect.arrayContaining(["metadata_first_personal_data_review", "large_collection_summarization"]));
    expect(ids).toEqual(expect.arrayContaining(["recipe-metadata_first_personal_data_review"]));
    expect(ids).not.toContain("policy-recipe-gmail-metadata-first-detail-gate");
    expectNoModuleFragments(ids, ["browser", "current_web", "visual-analysis", "ambient-cli", "ambient_cli"]);
    expect(parts.prompt).toContain("Recipe metadata_first_personal_data_review");
    expect(parts.prompt).toContain("connector.paginate with google.gmail search");
    expect(parts.prompt).toContain("google.gmail readThread or readAttachment");
    expect(parts.prompt).toContain("never include Gmail draft/send/delete/update operations");
    expect(parts.prompt).not.toContain("Gmail metadata-first detail gate rule");
    expectNoPromptText(parts.prompt, ["Browser recovery provenance rule", "Visual-analysis rule", "Ambient CLI execution must depend"]);
  });

  it("includes Ambient CLI capability guidance only when Ambient CLI tools and grants are selected", () => {
    const grant: WorkflowCompilerAmbientCliCapability = {
      capabilityId: "cli:demo-package:demo_search",
      registryPluginId: "cli:demo-package",
      packageId: "demo-package",
      packageName: "demo-package",
      command: "demo_search",
      description: "Run a demo command through Ambient CLI.",
      availability: "available",
      risk: [],
      missingEnv: [],
      whyMatched: ["explicit Ambient CLI workflow request"],
    };
    const parts = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Use the installed Ambient CLI demo-package demo_search command. Describe the exact command before running it and do not use browser, Gmail, Google Workspace, or visual analysis.",
      workspaceSummary: "Phase 7 abstraction regression: Ambient CLI workflow.",
      toolDescriptors: selectedTools(["ambient_cli", "ambient_cli_describe", "ambient_cli_secret_request", "ambient_cli_env_bind"]),
      ambientCliCapabilities: [grant],
      connectorDescriptors: [],
    });
    const ids = moduleIds(parts);

    expect(ids).toEqual(
      expect.arrayContaining([
        "ambient-cli-selected-capabilities",
        "capability-guidance-ambient-cli-describe-before-run",
        "capability-guidance-ambient-cli-missing-env-setup",
        "capability-guidance-ambient-cli-secret-redaction",
      ]),
    );
    expect(parts.prompt).toContain("Ambient CLI workflow guidance");
    expect(parts.prompt).toContain("ambient_cli.secret_value_rejected");
    expect(parts.prompt).toContain("demo-package");
    expectNoModuleFragments(ids, ["browser", "gmail", "google-workspace", "visual-analysis"]);
    expectNoPromptText(parts.prompt, [
      "Browser recovery provenance rule",
      "Gmail metadata-first detail gate rule",
      "Visual-analysis rule",
      "Ambient CLI execution must depend on a matching ambient_cli_describe node",
      "Ambient CLI missing-env rule:",
      "Ambient CLI secret rule:",
    ]);
  });
});
