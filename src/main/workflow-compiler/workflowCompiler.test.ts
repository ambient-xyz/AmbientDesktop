import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktop-tools/desktopToolRegistry";
import {
  buildWorkflowCompilerCapabilityDiscoveryPrompt,
  canonicalizeWorkflowGraphLayout,
  selectWorkflowCompilerConnectorDescriptors,
  selectWorkflowCompilerToolDescriptors,
  validateWorkflowCompilerCapabilityDiscoveryOutput,
  validateWorkflowCompilerOutput,
  validateWorkflowSourceGraphMappings,
  workflowGraphWithSourceMappings,
  type WorkflowCompilerOutput,
} from "./workflowCompiler";
import { fixtureWorkflowConnector } from "./workflowCompilerWorkflowFacade";

const descriptors = firstPartyDesktopToolDescriptors();
const connectorDescriptors = [fixtureWorkflowConnector().descriptor];

function connectorDescriptor(id: string) {
  const fixture = fixtureWorkflowConnector().descriptor;
  return {
    ...fixture,
    id,
    label: id,
    description: `${id} test connector`,
  };
}

function validOutput(): WorkflowCompilerOutput {
  return {
    title: "Local project health check",
    spec: {
      goal: "Run local deterministic project checks and write an audit report.",
      successCriteria: ["Shell command completes", "Report is recorded"],
    },
    manifest: {
      tools: ["bash", "ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 10,
      maxModelCalls: 3,
    },
    source: `
export default async function run({ workflow, tools, ambient }) {
  await workflow.step("test", async () => {
    const result = await tools.bash({ command: "pnpm test" });
    await ambient.call({ task: "summarize.tests", input: { result, outputContract: { summary: "string" } }, schema: summarySchema });
  });
}
`,
    previewSummary: "Runs project tests and summarizes the result.",
    dryRunStrategy: "Preview the shell command without applying mutations.",
    openQuestions: [],
  };
}

describe("workflow compiler capability discovery", () => {
  it("selects a compact capability set for a web report workflow", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Run a search on the venues in Scottsdale featuring upcoming celtic or folk music performances. Render a PDF report and store it in the Documents folder.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.availableToolCount).toBeGreaterThan(selection.selectedToolNames.length);
    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["browser_search", "browser_content", "file_write", "bash"]));
    expect(selection.selectedToolNames).not.toContain("ambient_voice_status");
    expect(selection.selectedToolNames).not.toContain("ambient_messaging_gateway_status");
  });

  it("uses discovery queries and required tool names when selecting compiler capabilities", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Prepare the requested artifact.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["web research", "browser page content", "PDF report file writing"],
      requiredToolNames: ["browser_content"],
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["browser_search", "browser_content", "file_write", "bash"]));
    expect(selection.selectedToolNames).not.toContain("ambient_voice_status");
  });

  it("does not let blocked capability-search results re-enter through model-required tool names", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Find current public webpages and summarize them.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["current web research", "Browser web research blocked by search routing"],
      requiredToolNames: ["browser_search"],
      blockedToolNames: [
        "browser_search",
        "browser_nav",
        "browser_content",
        "browser_eval",
        "browser_keypress",
        "browser_login",
        "browser_screenshot",
        "browser_pick",
      ],
    });

    expect(selection.selectedToolNames.filter((name) => name.startsWith("browser_"))).toEqual([]);
  });

  it("does not infer browser or file-write capabilities for model-only HTML output workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Use the Ambient model as the only knowledge source, ask the user one quiz question, and return a compact HTML study card in the final workflow output. Do not use browser, web, network, file writes, or workspace mutations.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames).not.toContain("file_write");
    expect(selection.selectedToolNames.filter((name) => name.startsWith("browser_"))).toEqual([]);
  });

  it("does not let model capability discovery override user-negated tools", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Use file_read to read dogfood-notes/admin.md and classify it. Do not use workspace.inventory, browser, search, web, network, file writes, or workspace mutations.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["browser search", "file writing", "local file read"],
      requiredToolNames: ["browser_search", "browser_content", "file_write", "file_read"],
    });

    expect(selection.selectedToolNames).toContain("file_read");
    expect(selection.selectedToolNames).not.toContain("file_write");
    expect(selection.selectedToolNames.filter((name) => name.startsWith("browser_"))).toEqual([]);
  });

  it("does not infer Google Workspace tools from generic local workspace wording", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Use file_read to read a local workspace note and classify it.",
      workspaceSummary: "Local workflow project workspace.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames.filter((name) => name.startsWith("google_workspace_"))).toEqual([]);
  });

  it("keeps browser reads while excluding search and writes for read-only provided URL workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Create a read-only Workflow Agent that uses managed browser tools to read https://example.com. Do not use browser_search; the URL is provided. Call browser_nav and browser_content.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["browser_nav", "browser_content"]));
    expect(selection.selectedToolNames).not.toContain("browser_search");
    expect(selection.selectedToolNames).not.toContain("file_write");
    expect(selection.selectedToolNames).not.toContain("ambient_visual_analyze");
  });

  it("does not select visual analysis only because exploration observed installed vision capabilities", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Create a read-only Workflow Agent that uses browser_nav and browser_content to read https://example.com and return a compact HTML source report.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["browser public source read", "MiniCPM vision provider available"],
      explorationTraces: [
        {
          id: "trace-1",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "capability-search",
          request: "Capability search found ambient-minicpm-v-vision:minicpm_vision_analyze.",
          capabilityManifest: { tools: ["ambient-minicpm-v-vision:minicpm_vision_analyze"] },
          observations: [{ message: "MiniCPM vision analyze is installed." }],
          events: [],
          distillation: { summary: "Vision provider available; browser_nav and browser_content handle the requested source read." },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["browser_nav", "browser_content"]));
    expect(selection.selectedToolNames).not.toContain("ambient_visual_analyze");
    expect(selection.selectedToolNames).not.toContain("ambient_visual_minicpm_setup");
  });

  it("does not select visual analysis only because a discovery question proposed visual proof", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Recommend whether a couple in Scottsdale should go to a movie tonight using current public web evidence from browser_search. Do not use file writes or Google Workspace.",
      workspaceSummary: "Movie-night workflow project.",
      toolDescriptors: descriptors,
      requiredToolNames: ["browser_search", "ambient_visual_analyze"],
      discoveryQuestions: [
        {
          id: "visual-proof",
          workflowThreadId: "thread-1",
          category: "review",
          context: "Generated planner question mentioned visual screenshots.",
          question: "Should this workflow collect visual proof or screenshot evidence for movie listings?",
          choices: [],
          allowFreeform: true,
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    expect(selection.selectedToolNames).toContain("browser_search");
    expect(selection.selectedToolNames).not.toContain("ambient_visual_analyze");
    expect(selection.selectedToolNames).not.toContain("ambient_visual_minicpm_setup");
  });

  it("selects local filesystem tools for explicit Downloads folder workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Please review the documents and folders in my Downloads directory and classify them into up to 7 categories. Use local filesystem tools, not Google Drive or shell.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["local Downloads directory inventory", "local file read"],
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["local_directory_list", "local_file_read"]));
    expect(selection.selectedToolNames).not.toContain("google_workspace_call");
    expect(selection.selectedToolNames).not.toContain("google_workspace_status");
    expect(selection.selectedToolNames).not.toContain("google_workspace_materialize_file");
    expect(selection.selectedToolNames).not.toContain("bash");
  });

  it("selects MiniCPM visual analysis for explicit Downloads image categorization workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Please categorize 10 images from my Downloads directory.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["local_directory_list", "local_file_read", "ambient_visual_analyze"]));
    expect(selection.selectedToolNames).not.toContain("ambient_visual_minicpm_setup");
    expect(selection.selectedToolNames).not.toContain("google_workspace_call");
    expect(selection.selectedToolNames).not.toContain("bash");
  });

  it("selects MiniCPM setup only for explicit provider setup intent", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Set up and validate the MiniCPM visual provider before I use screenshot QA.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames).toContain("ambient_visual_minicpm_setup");
  });

  it("honors exact tool-name denials even when the denied tool name appears in the request", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Please categorize 10 images from my Downloads directory using ambient_visual_analyze. Do not call ambient_visual_minicpm_setup.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
    });

    expect(selection.selectedToolNames).toContain("ambient_visual_analyze");
    expect(selection.selectedToolNames).not.toContain("ambient_visual_minicpm_setup");
  });

  it("keeps browser screenshot available as a companion for browser workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Open a managed browser page that may require verification and produce a readable report.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      requiredToolNames: ["browser_nav"],
    });

    expect(selection.selectedToolNames).toEqual(expect.arrayContaining(["browser_nav", "browser_screenshot"]));
  });

  it("keeps login broker companion tools available for browser login workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Log into a website with a stored credential, handle MFA or CAPTCHA if needed, and read the account page.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      requiredToolNames: ["browser_login"],
    });

    expect(selection.selectedToolNames).toEqual(
      expect.arrayContaining(["browser_login", "browser_nav", "browser_content", "browser_pick", "browser_screenshot"]),
    );
  });

  it("keeps Ambient CLI discovery and secret setup companions available for cloud-backed CLI workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest: "Use an installed Ambient CLI cloud API package that may need an API key secret before running.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      requiredToolNames: ["ambient_cli"],
    });

    expect(selection.selectedToolNames).toEqual(
      expect.arrayContaining(["ambient_cli", "ambient_cli_search", "ambient_cli_describe", "ambient_cli_secret_request", "ambient_cli_env_bind"]),
    );
  });

  it("does not let Ambient CLI discovery replace explicitly requested browser_search", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Collect exactly 6 public source candidates using browser_search through tool.paginate with pageQueries, pageSize, maxItems, maxPages, itemsPath root array, queryInputPath query, pageSizeInputPath maxResults, and dedupeKeyPath url.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["ambient-brave-search search", "installed Ambient CLI command search", "browser public source search"],
      explorationTraces: [
        {
          id: "trace-1",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "capability-search",
          request: "Capability search found ambient-brave-search:search.",
          capabilityManifest: { tools: ["ambient_cli_search", "ambient_cli_describe", "ambient_cli"] },
          observations: [{ message: "ambient-brave-search installed." }],
          events: [],
          distillation: {
            summary: "Brave Ambient CLI search is available, but browser_search was explicitly requested for source collection.",
          },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    expect(selection.selectedToolNames).toContain("browser_search");
    expect(selection.selectedToolNames.filter((name) => name.startsWith("ambient_cli"))).toEqual([]);
  });

  it("does not let Ambient CLI traces leak into personal connector workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Create a read-only Workflow Agent that categorizes 1,000 Gmail messages using metadata first and asks before reading full bodies.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["installed Ambient CLI command search", "Gmail search", "metadata categorization"],
      explorationTraces: [
        {
          id: "trace-1",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "capability-search",
          request: "Capability search listed local Ambient CLI commands and Gmail connector metadata.",
          capabilityManifest: { tools: ["ambient_cli_search", "ambient_cli_describe", "ambient_cli"] },
          observations: [{ message: "Ambient CLI commands are available but the workflow request is a Gmail connector workflow." }],
          events: [],
          distillation: { recommendedManifest: { tools: ["ambient_cli", "ambient_cli_search", "ambient_cli_describe"] } },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    expect(selection.selectedToolNames.filter((name) => name.startsWith("ambient_cli"))).toEqual([]);
  });

  it("does not substitute raw Google Workspace tools for explicit Google connector workflows", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Create a read-only Workflow Agent that reviews recent Gmail threads using the Gmail connector and asks before reading full bodies.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["Gmail search", "Google Workspace raw tools", "Google Workspace method call"],
      requiredToolNames: ["google_workspace_call", "google_workspace_status", "google_workspace_search_methods"],
    });

    expect(selection.selectedToolNames.filter((name) => name.startsWith("google_workspace_"))).toEqual([]);
    expect(selection.selectedToolNames.filter((name) => name.startsWith("ambient_cli"))).toEqual([]);
  });

  it("allows raw Google Workspace tools only when the user explicitly names the raw tool path", () => {
    const selection = selectWorkflowCompilerToolDescriptors({
      userRequest:
        "Use google_workspace_call as the raw Google Workspace tool path to list Drive files, then summarize the method result.",
      workspaceSummary: "Workflow project.",
      toolDescriptors: descriptors,
      capabilityQueries: ["Google Workspace method call"],
      requiredToolNames: ["google_workspace_call"],
    });

    expect(selection.selectedToolNames).toContain("google_workspace_call");
  });

  it("honors explicit Google Workspace connector denials over capability traces", () => {
    const selection = selectWorkflowCompilerConnectorDescriptors({
      userRequest:
        "Collect current public web evidence with browser_search. Do not use Google Workspace tools/connectors, Gmail, Calendar, Drive, or external connector data.",
      workspaceSummary: "Workflow project.",
      connectorDescriptors: [
        connectorDescriptor("google.gmail"),
        connectorDescriptor("google.calendar"),
        connectorDescriptor("google.drive"),
        connectorDescriptor("workspace.inventory"),
      ],
      capabilityQueries: ["gmail search", "calendar read", "drive read", "workspace inventory"],
      requiredConnectorIds: ["google.gmail", "google.calendar", "google.drive"],
      explorationTraces: [
        {
          id: "trace-1",
          workflowThreadId: "thread-1",
          explorationId: "exploration-1",
          explorationNodeId: "capability-search",
          request: "Capability search listed Google Workspace connector grants.",
          capabilityManifest: {
            connectors: ["google.gmail", "google.calendar", "google.drive", "workspace.inventory"],
          },
          observations: [],
          events: [],
          distillation: {
            recommendedManifest: {
              connectors: [
                { connectorId: "google.gmail" },
                { connectorId: "google.calendar" },
                { connectorId: "google.drive" },
              ],
            },
          },
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    expect(selection.selectedConnectorIds).not.toContain("google.gmail");
    expect(selection.selectedConnectorIds).not.toContain("google.calendar");
    expect(selection.selectedConnectorIds).not.toContain("google.drive");
  });

  it("keeps workspace inventory out when local_directory_list is the requested local-folder capability", () => {
    const selection = selectWorkflowCompilerConnectorDescriptors({
      userRequest:
        "Use local_directory_list exactly once to categorize my Downloads folder from metadata only. Do not call connectors or workspace.inventory.",
      workspaceSummary: "Workflow project.",
      connectorDescriptors: [connectorDescriptor("workspace.inventory"), connectorDescriptor("google.drive")],
      capabilityQueries: ["workspace inventory", "local Downloads metadata"],
      requiredConnectorIds: ["workspace.inventory"],
      graphSnapshot: {
        id: "graph-1",
        workflowThreadId: "thread-1",
        version: 1,
        source: "discovery",
        summary: "Initial graph incorrectly mentioned workspace inventory while the request requires local_directory_list.",
        createdAt: "2026-05-17T00:00:00.000Z",
        nodes: [
          {
            id: "inventory",
            type: "data_source",
            label: "Local directory inventory",
            connectorIds: ["workspace.inventory"],
            toolNames: ["local_directory_list"],
          },
        ],
        edges: [],
      },
    });

    expect(selection.selectedConnectorIds).not.toContain("workspace.inventory");
  });

  it("builds and validates a small JSON-only capability discovery phase", () => {
    const prompt = buildWorkflowCompilerCapabilityDiscoveryPrompt({
      userRequest: "Search Scottsdale folk music events and write a PDF report.",
      workspaceSummary: "Workflow project.",
    });

    expect(prompt).toContain("Return only JSON with: queries, requiredToolNames, requiredConnectorIds, openQuestions.");
    expect(prompt).toContain("Do not generate the workflow artifact or source code in this phase.");
    expect(prompt).toContain("safe capability metadata");
    expect(prompt).toContain("Exact local tool rule");
    expect(prompt).toContain("requiredToolNames");
    expect(prompt).toContain("local_directory_list");
    expect(prompt).toContain("ambient_visual_analyze");
    expect(prompt).toContain("ambient_visual_minicpm_setup");
    expect(prompt).not.toContain("inputSchema");

    expect(
      validateWorkflowCompilerCapabilityDiscoveryOutput({
        queries: [{ query: "  web   research  ", reason: "  find venues  " }, " Gmail search "],
        requiredToolNames: [" browser_content ", "browser_content"],
        requiredConnectorIds: [" fixture.readonly ", "fixture.readonly"],
        openQuestions: ["  Need a date range?  "],
      }),
    ).toEqual({
      queries: [{ query: "web research", reason: "find venues" }, { query: "Gmail search" }],
      requiredToolNames: ["browser_content"],
      requiredConnectorIds: ["fixture.readonly"],
      openQuestions: ["Need a date range?"],
    });
  });

  it("selects compact connector descriptors and operation subsets from discovery context", () => {
    const fixture = fixtureWorkflowConnector().descriptor;
    const baseOperation = fixture.operations[0]!;
    const calendar = {
      ...fixture,
      id: "google.calendar",
      label: "Google Calendar",
      description: "Read Google Calendar events and availability.",
      operations: [
        {
          ...baseOperation,
          name: "listEvents",
          label: "List events",
          description: "Read Calendar events in a time range.",
          sideEffects: "read_personal_data" as const,
        },
        {
          ...baseOperation,
          name: "freeBusy",
          label: "Free/busy query",
          description: "Read Calendar free busy availability.",
          sideEffects: "read_personal_data" as const,
        },
        {
          ...baseOperation,
          name: "insertEvent",
          label: "Insert event",
          description: "Create a Calendar event.",
          sideEffects: "write_external" as const,
        },
      ],
    };
    const slack = {
      ...fixture,
      id: "slack.workspace",
      label: "Slack",
      description: "Read and send Slack messages.",
      operations: [
        { ...baseOperation, name: "searchMessages", label: "Search messages", description: "Search Slack messages." },
        {
          ...baseOperation,
          name: "postMessage",
          label: "Post message",
          description: "Send a Slack message.",
          sideEffects: "write_external" as const,
        },
      ],
    };

    const selection = selectWorkflowCompilerConnectorDescriptors({
      userRequest: "Read tomorrow's Google Calendar agenda and summarize conflicts.",
      connectorDescriptors: [slack, calendar],
      capabilityQueries: ["Calendar read"],
      maxOperationsPerConnector: 2,
    });

    expect(selection.availableConnectorCount).toBe(2);
    expect(selection.availableOperationCount).toBe(5);
    expect(selection.selectedConnectorIds).toEqual(["google.calendar"]);
    expect(selection.selectedConnectorDescriptors[0]?.operations.map((operation) => operation.name)).toEqual(["listEvents", "freeBusy"]);
    expect(selection.selectedOperationCount).toBe(2);
  });

  it("honors exact connector ids discovered from prior context", () => {
    const fixture = fixtureWorkflowConnector().descriptor;
    const selection = selectWorkflowCompilerConnectorDescriptors({
      userRequest: "Use the known connector from the graph.",
      connectorDescriptors: [fixture],
      requiredConnectorIds: ["fixture.readonly"],
      maxOperationsPerConnector: 1,
    });

    expect(selection.selectedConnectorIds).toEqual(["fixture.readonly"]);
    expect(selection.selectedOperationCount).toBe(1);
  });
});

describe("validateWorkflowCompilerOutput", () => {
  it("accepts source that uses declared tools and Ambient calls", () => {
    expect(validateWorkflowCompilerOutput(validOutput(), descriptors)).toMatchObject({
      toolNames: ["bash", "ambient.responses"],
      output: {
        title: "Local project health check",
      },
    });
  });

  it("accepts workflow manifests that pin exact Ambient CLI command capabilities", () => {
    const output = validOutput();
    output.manifest = {
      tools: ["ambient_cli"],
      ambientCliCapabilities: [
        {
          capabilityId: "pkg-youtube:tool:youtube_transcript",
          registryPluginId: "cli:pkg-youtube",
          packageId: "pkg-youtube",
          packageName: "youtube-transcript",
          command: "youtube_transcript",
        },
      ],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
    };
    output.source = `
export default async function run({ tools }) {
  await tools.ambient_cli({ packageName: "youtube-transcript", command: "youtube_transcript", args: ["https://youtu.be/example"] });
}
`;

    expect(validateWorkflowCompilerOutput(output, descriptors).output.manifest.ambientCliCapabilities).toEqual([
      expect.objectContaining({ capabilityId: "pkg-youtube:tool:youtube_transcript" }),
    ]);
  });

  it("rejects Ambient CLI source calls that are not pinned by manifest grants", () => {
    const output = validOutput();
    output.manifest = {
      tools: ["ambient_cli"],
      ambientCliCapabilities: [
        {
          capabilityId: "pkg-youtube:tool:youtube_transcript",
          registryPluginId: "cli:pkg-youtube",
          packageId: "pkg-youtube",
          packageName: "youtube-transcript",
          command: "youtube_transcript",
        },
      ],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
    };
    output.source = `
export default async function run({ tools }) {
  await tools.ambient_cli({ packageName: "pi-arxiv", command: "arxiv_search", args: ["placebo effect"] });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("undeclared Ambient CLI command: pi-arxiv.arxiv_search");
  });

  it("rejects Ambient CLI source calls without literal package and command fields", () => {
    const output = validOutput();
    output.manifest = {
      tools: ["ambient_cli"],
      ambientCliCapabilities: [
        {
          capabilityId: "pkg-youtube:tool:youtube_transcript",
          registryPluginId: "cli:pkg-youtube",
          packageId: "pkg-youtube",
          packageName: "youtube-transcript",
          command: "youtube_transcript",
        },
      ],
      mutationPolicy: "read_only",
      maxToolCalls: 1,
    };
    output.source = `
export default async function run({ tools }) {
  const packageName = "youtube-transcript";
  await tools.ambient_cli({ packageName, command: "youtube_transcript", args: ["https://youtu.be/example"] });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow(
      "tools.ambient_cli without literal packageName/packageId and command fields",
    );
  });

  it("rejects Ambient CLI manifest grants without the ambient_cli workflow tool", () => {
    const output = validOutput();
    output.manifest = {
      tools: [],
      ambientCliCapabilities: [
        {
          capabilityId: "pkg-youtube:tool:youtube_transcript",
          registryPluginId: "cli:pkg-youtube",
          packageId: "pkg-youtube",
          packageName: "youtube-transcript",
          command: "youtube_transcript",
        },
      ],
      mutationPolicy: "read_only",
    };
    output.source = "export default async function run() { return undefined; }";

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without declaring tool: ambient_cli");
  });

  it("accepts compiler graph output with model-call metadata", () => {
    const output = validOutput();
    output.source = `
export default async function run({ ambient }) {
  await ambient.call({ task: "classify.tests", input: { outputContract: { classifications: "array" } }, schema: { parse: (value) => value }, nodeId: "classify" });
}
`;
    output.graph = {
      summary: "Request through model classification to report.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize failures",
          inputSummary: "test output",
          outputSummary: "failure categories",
          retryPolicy: "retry with same retained output",
          toolNames: ["ambient.responses"],
        },
        { id: "report", type: "output", label: "Report" },
      ],
      edges: [
        { id: "request-to-classify", source: "request", target: "classify", type: "control_flow" },
        { id: "classify-to-report", source: "classify", target: "report", type: "data_flow" },
      ],
    };

    expect(validateWorkflowCompilerOutput(output, descriptors).output.graph?.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "classify", type: "model_call" })]),
    );
  });

  it("normalizes common live compiler graph type aliases", () => {
    const output = {
      ...validOutput(),
      graph: {
        summary: "Request through browser action to report.",
        nodes: [
          { id: "request", type: "input", label: "Request" },
          { id: "browser", type: "browser-action", label: "Inspect page" },
          { id: "report", type: "report", label: "Report" },
        ],
        edges: [
          { id: "request-browser", source: "request", target: "browser", type: "sequence" },
          { id: "browser-report", source: "browser", target: "report", type: "data" },
        ],
      },
    };

    expect(validateWorkflowCompilerOutput(output, descriptors).output.graph).toMatchObject({
      nodes: [
        { id: "request", type: "request" },
        { id: "browser", type: "deterministic_step" },
        { id: "report", type: "output" },
      ],
      edges: [
        { id: "request-browser", type: "control_flow" },
        { id: "browser-report", type: "data_flow" },
      ],
    });
  });

  it("canonicalizes compiler graph layout coordinates before persistence", () => {
    const graph: NonNullable<WorkflowCompilerOutput["graph"]> = {
      summary: "Provider supplied unstable coordinates.",
      nodes: [
        { id: "output", type: "output", label: "Output", x: -9999, y: 40000, width: 9999, height: 3 },
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "classify",
          inputSummary: "records",
          outputSummary: "labels",
          retryPolicy: "same input",
          x: 7,
          y: 7,
          width: 1,
          height: 1,
          sourceRanges: [{ kind: "ambient_call", start: 0, end: 1, startLine: 1, startColumn: 1, endLine: 1, endColumn: 2, snippet: "ambient.call" }],
        },
        { id: "request", type: "request", label: "Request", x: 100000, y: -100000, width: 42, height: 42 },
        { id: "review", type: "review_gate", label: "Review", x: 40, y: 40, width: 40, height: 40 },
      ],
      edges: [
        { id: "request-classify", source: "request", target: "classify", type: "control_flow" },
        { id: "classify-review", source: "classify", target: "review", type: "condition" },
        { id: "review-output", source: "review", target: "output", type: "data_flow" },
      ],
    };

    const canonical = canonicalizeWorkflowGraphLayout(graph);

    expect(canonical.nodes).toEqual([
      expect.objectContaining({ id: "output", x: 900, y: 0, width: 220, height: 92 }),
      expect.objectContaining({
        id: "classify",
        x: 300,
        y: 0,
        width: 220,
        height: 92,
        sourceRanges: graph.nodes[1].sourceRanges,
      }),
      expect.objectContaining({ id: "request", x: 0, y: 0, width: 220, height: 92 }),
      expect.objectContaining({ id: "review", x: 600, y: 0, width: 220, height: 92 }),
    ]);
    expect(canonical.edges).toEqual(graph.edges);
    expect(canonical.nodes.every((node) => node.x! >= 0 && node.y! >= 0)).toBe(true);
  });

  it("validates required graph node mappings in generated source", () => {
    const output = validOutput();
    output.manifest = {
      tools: ["ambient.responses"],
      connectors: [
        {
          connectorId: "fixture.readonly",
          accountId: "fixture",
          scopes: ["fixture.records.read"],
          operations: ["listRecords"],
          dataRetention: "redacted_audit",
        },
      ],
      mutationPolicy: "staged_until_approved",
      maxModelCalls: 1,
      maxConnectorCalls: 1,
    };
    output.graph = {
      summary: "Request to connector to model to review and mutation.",
      nodes: [
        { id: "request", type: "request", label: "Request" },
        {
          id: "records",
          type: "connector_call",
          label: "Read records",
          connectorIds: ["fixture.readonly"],
        },
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize records",
          inputSummary: "fixture records",
          outputSummary: "categories",
          retryPolicy: "retry with same retained records",
          toolNames: ["ambient.responses"],
        },
        { id: "review", type: "review_gate", label: "Review", reviewPolicy: "Approve generated report." },
        { id: "write-report", type: "mutation", label: "Write report" },
        { id: "output", type: "output", label: "Output" },
      ],
      edges: [
        { id: "request-records", source: "request", target: "records", type: "control_flow" },
        { id: "records-classify", source: "records", target: "classify", type: "data_flow" },
        { id: "classify-review", source: "classify", target: "review", type: "condition" },
        { id: "review-write", source: "review", target: "write-report", type: "control_flow" },
        { id: "write-output", source: "write-report", target: "output", type: "data_flow" },
      ],
    };
    output.source = `
export default async function run({ workflow, ambient, connectors }) {
  const rows = await workflow.resumePoint("fixture-records", async () =>
    connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 10 }, nodeId: "records" })
  );
  const labels = await workflow.resumePoint("classified-record-labels", async () =>
    ambient.call({ task: "classify.records", nodeId: "classify", input: { rows, outputContract: { labels: "array" } }, schema: { parse: (value) => value } })
  );
  await workflow.requireApproval({ labels }, { nodeId: "review" });
  await workflow.stageMutation({ file: "report.md", labels }, async () => labels, { nodeId: "write-report" });
}
`;

    expect(validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors).output.graph?.nodes).toHaveLength(6);
  });

  it("rejects unmapped required graph node types", () => {
    const graph: NonNullable<WorkflowCompilerOutput["graph"]> = {
      summary: "Required mappings.",
      nodes: [
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize",
          inputSummary: "records",
          outputSummary: "labels",
          retryPolicy: "same input",
        },
        { id: "records", type: "connector_call", label: "Read records", connectorIds: ["fixture.readonly"] },
        { id: "review", type: "review_gate", label: "Review" },
        { id: "write", type: "mutation", label: "Write" },
      ],
      edges: [],
    };

    expect(() => validateWorkflowSourceGraphMappings(`ambient.call({ task: "x", input: {}, schema, nodeId: "other" });`, graph)).toThrow(
      "unknown graph node id: other",
    );
    expect(() => validateWorkflowSourceGraphMappings(`ambient.call({ task: "x", input: {}, schema });`, graph)).toThrow(
      "model node classify",
    );
    expect(() =>
      validateWorkflowSourceGraphMappings(`ambient.call({ task: "x", input: {}, schema, nodeId: "classify" });`, graph),
    ).toThrow("connector node records");
    expect(() =>
      validateWorkflowSourceGraphMappings(
        `
ambient.call({ task: "x", input: {}, schema, nodeId: "classify" });
connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" });
`,
        graph,
      ),
    ).toThrow("review gate node review");
    expect(() =>
      validateWorkflowSourceGraphMappings(
        `
ambient.call({ task: "x", input: {}, schema, nodeId: "classify" });
connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" });
workflow.requireApproval({}, { nodeId: "review" });
`,
        graph,
      ),
    ).toThrow("mutation node write");
  });

  it("maps workflow.askUser review gates and still allows wrapper step node ids that are not graph nodes", () => {
    const graph: NonNullable<WorkflowCompilerOutput["graph"]> = {
      summary: "Wrapper and runtime-input source anchors.",
      nodes: [
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize",
          inputSummary: "records",
          outputSummary: "labels",
          retryPolicy: "same input",
        },
        { id: "review", type: "review_gate", label: "Review classifications" },
      ],
      edges: [],
    };

    expect(() =>
      validateWorkflowSourceGraphMappings(
        `
export default async function run({ workflow, ambient }) {
  const formatted = await workflow.step("Format output", { nodeId: "format" }, async () => ({}));
  await ambient.call({ task: "classify", input: formatted, schema, nodeId: "classify" });
  await workflow.askUser("Review generated artifact?", { data: { report: { artifactPath: "reports/preview.html" } } }, { nodeId: "review" });
}
`,
        graph,
      ),
    ).not.toThrow();
  });

  it("annotates graph nodes with generated source ranges", () => {
    const graph: NonNullable<WorkflowCompilerOutput["graph"]> = {
      summary: "Mapped source regions.",
      nodes: [
        {
          id: "classify",
          type: "model_call",
          label: "Classify",
          modelRole: "categorize",
          inputSummary: "records",
          outputSummary: "labels",
          retryPolicy: "same input",
        },
        { id: "records", type: "connector_call", label: "Read records", connectorIds: ["fixture.readonly"] },
        { id: "review", type: "review_gate", label: "Review" },
        { id: "write", type: "mutation", label: "Write" },
      ],
      edges: [],
    };
    const source = `
export default async function run({ workflow, ambient, connectors }) {
  const rows = await workflow.step("Read", { nodeId: "records" }, () =>
    connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" })
  );
  const labels = await ambient.call({ task: "classify", input: rows, schema, nodeId: "classify" });
  await workflow.requireApproval({ labels }, { nodeId: "review" });
  await workflow.stageMutation({ labels }, async () => labels, { nodeId: "write" });
}
`;

    const annotated = workflowGraphWithSourceMappings(source, graph);

    expect(annotated.nodes.find((node) => node.id === "classify")?.sourceRanges).toEqual([
      expect.objectContaining({ kind: "ambient_call", startLine: 6, snippet: expect.stringContaining('nodeId: "classify"') }),
    ]);
    expect(annotated.nodes.find((node) => node.id === "records")?.sourceRanges).toEqual([
      expect.objectContaining({ kind: "connector_call", snippet: expect.stringContaining("connectors.call") }),
      expect.objectContaining({ kind: "workflow_step", snippet: expect.stringContaining("workflow.step") }),
    ]);
    expect(annotated.nodes.find((node) => node.id === "review")?.sourceRanges?.[0]).toEqual(
      expect.objectContaining({ kind: "review_gate", startLine: 7 }),
    );
    expect(annotated.nodes.find((node) => node.id === "write")?.sourceRanges?.[0]).toEqual(
      expect.objectContaining({ kind: "mutation", startLine: 8 }),
    );
  });

  it("annotates workflow.askUser review gates as review source ranges", () => {
    const graph: NonNullable<WorkflowCompilerOutput["graph"]> = {
      summary: "Runtime input review.",
      nodes: [{ id: "review", type: "review_gate", label: "Review generated classifications" }],
      edges: [],
    };
    const source = `
export default async function run({ workflow }) {
  await workflow.askUser("Do these classifications look right?", {
    choices: [{ id: "approve", label: "Looks right" }],
    allowFreeform: true,
    data: { report: { title: "Preview", artifactPath: "reports/preview.html" } }
  }, { nodeId: "review" });
}
`;

    const annotated = workflowGraphWithSourceMappings(source, graph);

    expect(() => validateWorkflowSourceGraphMappings(source, graph)).not.toThrow();
    expect(annotated.nodes[0].sourceRanges).toEqual([
      expect.objectContaining({ kind: "review_gate", snippet: expect.stringContaining("workflow.askUser") }),
    ]);
  });

  it("rejects invalid compiler graph mappings", () => {
    const missingModelMetadata = validOutput();
    missingModelMetadata.graph = {
      summary: "Invalid model graph.",
      nodes: [{ id: "classify", type: "model_call", label: "Classify" }],
      edges: [],
    };
    expect(() => validateWorkflowCompilerOutput(missingModelMetadata, descriptors)).toThrow("missing modelRole");

    const missingEdgeNode = validOutput();
    missingEdgeNode.graph = {
      summary: "Invalid edge graph.",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [{ id: "request-to-missing", source: "request", target: "missing", type: "control_flow" }],
    };
    expect(() => validateWorkflowCompilerOutput(missingEdgeNode, descriptors)).toThrow("missing target node");
  });

  it("accepts source that uses declared connector grants", () => {
    const output = validOutput();
    output.manifest.tools = [];
    output.manifest.connectors = [
      {
        connectorId: "fixture.readonly",
        accountId: "fixture",
        scopes: ["fixture.records.read"],
        operations: ["listRecords"],
        dataRetention: "redacted_audit",
      },
    ];
    output.source = `
export default async function run({ connectors }) {
  await connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 10 } });
}
`;

    expect(validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors)).toMatchObject({
      output: { title: "Local project health check" },
    });
  });

  it("accepts source that uses declared Google Workspace method grants", () => {
    const output = validOutput();
    output.manifest.tools = ["google_workspace_call"];
    output.manifest.googleWorkspaceMethods = [
      {
        methodId: "drive.files.list",
        accountHint: "user@example.com",
        accountProvenance: "literal",
        service: "drive",
        resource: "files",
        method: "list",
        httpMethod: "GET",
        path: "drive/v3/files",
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        sideEffect: "personal_content_read",
        dataRetention: "run_artifact",
        dryRunSupported: false,
        catalogVersion: "test",
      },
    ];
    output.source = `
export default async function run({ tools }) {
  await tools.google_workspace_call({ accountHint: "user@example.com", methodId: "drive.files.list", params: { pageSize: 10 } });
}
`;

    expect(validateWorkflowCompilerOutput(output, descriptors)).toMatchObject({
      output: { manifest: { googleWorkspaceMethods: [expect.objectContaining({ methodId: "drive.files.list" })] } },
    });
  });

  it("rejects Google Workspace source calls that are not pinned by manifest method grants", () => {
    const output = validOutput();
    output.manifest.tools = ["google_workspace_call"];
    output.source = `
export default async function run({ tools }) {
  await tools.google_workspace_call({ accountHint: "user@example.com", methodId: "drive.files.list", params: { pageSize: 10 } });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without matching manifest Google Workspace method grants");
  });

  it("accepts zero call limits from compiler output", () => {
    const output = validOutput();
    output.manifest.maxToolCalls = 0;
    output.manifest.maxModelCalls = 0;
    output.manifest.maxConnectorCalls = 0;
    output.manifest.tools = [];
    output.source = "export default async function run() { return undefined; }";

    expect(validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors).output.manifest).toMatchObject({
      maxToolCalls: 0,
      maxModelCalls: 0,
      maxConnectorCalls: 0,
    });
  });

  it("rejects unavailable declared tools", () => {
    const output = validOutput();
    output.manifest.tools = ["gmail.search"];

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("unavailable tool: gmail.search");
  });

  it("rejects plugin capability grants for tools not declared in the manifest", () => {
    const output = validOutput();
    output.manifest.tools = [];
    output.manifest.pluginCapabilities = [
      {
        capabilityId: "plugin-1:mcp-tool:server:fixture_original",
        pluginId: "plugin-1",
        pluginName: "Fixture",
        serverName: "server",
        toolName: "fixture_original",
        registeredName: "fixture_tool",
      },
    ];
    output.source = "export default async function run() { return undefined; }";

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow(
      "plugin capability for undeclared tool: fixture_tool",
    );
  });

  it("rejects unavailable connector grants and undeclared connector operations", () => {
    const output = validOutput();
    output.manifest.connectors = [
      {
        connectorId: "gmail.mailbox",
        scopes: ["gmail.messages.read"],
        operations: ["listMessages"],
        dataRetention: "redacted_audit",
      },
    ];
    output.source = `
export default async function run({ connectors }) {
  await connectors.call({ connectorId: "gmail.mailbox", operation: "listMessages", input: {} });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors)).toThrow(
      "unavailable connector: gmail.mailbox",
    );

    const undeclared = validOutput();
    undeclared.manifest.connectors = [
      {
        connectorId: "fixture.readonly",
        scopes: ["fixture.records.read"],
        operations: ["getRecord"],
        dataRetention: "redacted_audit",
      },
    ];
    undeclared.source = `
export default async function run({ connectors }) {
  await connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {} });
}
`;

    expect(() => validateWorkflowCompilerOutput(undeclared, descriptors, connectorDescriptors)).toThrow(
      "undeclared connector operation",
    );
  });

  it("rejects source references to undeclared tools", () => {
    const output = validOutput();
    output.manifest.tools = ["ambient.responses"];

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("undeclared tool: bash");
  });

  it("requires ambient.responses when source calls Ambient", () => {
    const output = validOutput();
    output.manifest.tools = ["bash"];
    output.source = "export default async function run({ ambient }) { await ambient.call({ task: 'classify', input: {}, schema }); }";

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("ambient.responses");
  });

  it("requires runtime-valid ambient.call task, input, and schema fields", () => {
    const output = validOutput();
    output.manifest.tools = ["ambient.responses"];
    output.source = "export default async function run({ ambient }) { await ambient.call({ prompt: 'Classify this', schema: { parse: (value) => value } }); }";

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("literal task field");

    output.source = "export default async function run({ ambient }) { await ambient.call({ task: 'classify.email', schema: { parse: (value) => value } }); }";
    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without an input field");

    output.source = "export default async function run({ ambient }) { await ambient.call({ task: 'classify.email', input: {} }); }";
    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without a schema field");

    output.source = "export default async function run({ ambient }) { await ambient.call({ task: 'classify.email', input: {}, schema: { parse: (value) => value } }); }";
    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without outputContract or expectedOutput");

    output.source =
      "export default async function run({ ambient }) { await ambient.call({ task: 'classify.email', input: {}, outputContract: { labels: 'array' }, schema: { parse: (value) => value } }); }";
    expect(() => validateWorkflowCompilerOutput(output, descriptors)).toThrow("without outputContract or expectedOutput");

    output.source = `export default async function run({ ambient }) { await ambient.call({ task: "Select a word such as 'obfuscate' or 'perfunctory'", input: { outputContract: { word: "string" } }, schema: { parse: (value) => value } }); }`;
    expect(() => validateWorkflowCompilerOutput(output, descriptors)).not.toThrow();
  });

  it("rejects non-read-only policy when generated source has no staged mutation or write connector", () => {
    const output = validOutput();
    output.manifest = {
      tools: ["ambient.responses"],
      mutationPolicy: "staged_until_approved",
      maxModelCalls: 1,
      connectors: [
        {
          connectorId: "fixture.readonly",
          accountId: "fixture",
          scopes: ["fixture.records.read"],
          operations: ["listRecords"],
          dataRetention: "redacted_audit",
        },
      ],
    };
    output.source = `
export default async function run({ ambient, connectors }) {
  const rows = await connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" });
  await ambient.call({ task: "summarize.records", input: { rows, outputContract: { summary: "string" } }, schema: { parse: (value) => value }, nodeId: "summarize" });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors)).toThrow(/non-read-only mutation policy/);
  });

  it("rejects connector grant aliases instead of repairing compiler output", () => {
    const output = validOutput() as unknown as WorkflowCompilerOutput & { manifest: { connectors: unknown[] } };
    output.manifest = {
      tools: ["ambient.responses"],
      mutationPolicy: "read_only",
      connectors: [
        {
          id: "fixture.readonly",
          account: "fixture",
          scopes: ["fixture.records.read"],
          operationNames: ["listRecords"],
          retention: "redacted_audit",
        },
      ],
    } as WorkflowCompilerOutput["manifest"] & { connectors: unknown[] };
    output.source = `
export default async function run({ ambient, connectors }) {
  const rows = await connectors.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {}, nodeId: "records" });
  await ambient.call({ task: "summarize.records", input: { rows, outputContract: { summary: "string" } }, schema: { parse: (value) => value }, nodeId: "summarize" });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors, connectorDescriptors)).toThrow(/connectorId/);
  });

  it("rejects raw Node and unbounded control-flow escapes", () => {
    const cases: Array<{ source: string; message: string }> = [
      { source: `import { readFile } from "node:fs";`, message: "forbidden Node module load" },
      {
        source: `export default async function run() { const fs = require("fs/promises"); }`,
        message: "forbidden CommonJS module load",
      },
      { source: `export default async function run() { await import("node:fs"); }`, message: "dynamic module loading" },
      { source: `export default async function run() { return process.env.HOME; }`, message: "raw process access" },
      { source: `export default async function run() { return globalThis.process; }`, message: "global object access" },
      { source: `export default async function run() { return Function("return 1")(); }`, message: "runtime code generation" },
      { source: `export default async function run({ workflow }) { return workflow.emit.constructor; }`, message: "constructor reflection" },
      { source: `export default async function run() { await fetch("https://example.com"); }`, message: "raw network API access" },
      { source: "while (true) {}", message: "unbounded while loop" },
      { source: "while (1) {}", message: "unbounded while loop" },
    ];

    for (const testCase of cases) {
      expect(() => validateWorkflowCompilerOutput({ ...validOutput(), source: testCase.source }, descriptors)).toThrow(testCase.message);
    }
  });

  it("allows forbidden global words inside strings and comments", () => {
    const output = validOutput();
    output.source = `
export default async function run({ ambient }) {
  // The generated prompt may mention window, document, or self-directed learning as text.
  const instruction = "Create a self-checking study card. Do not use a browser window or document APIs.";
  await ambient.call({
    task: "study.card",
    input: {
      instruction,
      outputContract: { html: "string" }
    },
    schema: { parse: (value) => value },
    nodeId: "classify"
  });
}
`;

    expect(() => validateWorkflowCompilerOutput(output, descriptors)).not.toThrow();
  });

  it("rejects dynamic or unknown workflow SDK references", () => {
    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: [], mutationPolicy: "read_only" },
          source: `export default async function run({ workflow }) { await workflow.askUser("Choose an output format.", { choices: [{ id: "md", label: "Markdown" }] }); }`,
        },
        descriptors,
      ),
    ).not.toThrow();

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: [], mutationPolicy: "read_only" },
          source: `export default async function run({ workflow }) { await workflow.emit({ type: "workflow.status_update", message: "Still running" }); }`,
        },
        descriptors,
      ),
    ).not.toThrow();

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: ["bash"], mutationPolicy: "read_only" },
          source: `
export default async function run({ tools }) {
  const name = "bash";
  await tools[name]({ command: "true" });
}
`,
        },
        descriptors,
      ),
    ).toThrow("dynamic tool reference");

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: [], mutationPolicy: "read_only" },
          source: `export default async function run({ workflow }) { await workflow.shell({ command: "true" }); }`,
        },
        descriptors,
      ),
    ).toThrow("unknown workflow SDK primitive: shell");

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: [], mutationPolicy: "read_only" },
          source: `export default async function run({ workflow }) { const method = "emit"; await workflow[method]({ type: "x" }); }`,
        },
        descriptors,
      ),
    ).toThrow("dynamic workflow SDK reference");
  });

  it("rejects runtime input after expensive work unless prompt data is protected by a resume point", () => {
    const unsafe = validOutput();
    unsafe.manifest = { tools: ["ambient.responses"], mutationPolicy: "read_only" };
    unsafe.source = `
export default async function run({ workflow, ambient }) {
  const classification = await ambient.call({
    task: "classify.notes",
    input: { outputContract: { categories: "array" } },
    schema: { parse: (value) => value }
  });
  await workflow.askUser("Do these look right?", { data: { classification } });
}
`;
    expect(() => validateWorkflowCompilerOutput(unsafe, descriptors)).toThrow("without wrapping that prior work in workflow.resumePoint");

    const safe = validOutput();
    safe.manifest = { tools: ["ambient.responses"], mutationPolicy: "read_only" };
    safe.source = `
export default async function run({ workflow, ambient }) {
  const classification = await workflow.resumePoint("classifications", async () =>
    ambient.call({
      task: "classify.notes",
      input: { outputContract: { categories: "array" } },
      schema: { parse: (value) => value }
    })
  );
  await workflow.askUser("Do these look right?", { data: { classification } });
}
`;
    expect(() => validateWorkflowCompilerOutput(safe, descriptors)).not.toThrow();
  });

  it("rejects staged mutations after expensive work unless mutation payload is protected by a resume point", () => {
    const unsafe = validOutput();
    unsafe.manifest = { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" };
    unsafe.source = `
export default async function run({ workflow, ambient }) {
  const report = await ambient.call({
    task: "report",
    input: { outputContract: { html: "string" } },
    schema: { parse: (value) => value }
  });
  await workflow.stageMutation({ file: "report.html" }, async () => report.html);
}
`;
    expect(() => validateWorkflowCompilerOutput(unsafe, descriptors)).toThrow("without wrapping that prior work in workflow.resumePoint");

    const safe = validOutput();
    safe.manifest = { tools: ["ambient.responses"], mutationPolicy: "staged_until_approved" };
    safe.source = `
export default async function run({ workflow, ambient }) {
  const report = await workflow.resumePoint("report-payload", async () =>
    ambient.call({
      task: "report",
      input: { outputContract: { html: "string" } },
      schema: { parse: (value) => value }
    })
  );
  await workflow.stageMutation({ file: "report.html" }, async () => report.html);
}
`;
    expect(() => validateWorkflowCompilerOutput(safe, descriptors)).not.toThrow();
  });

  it("rejects source that treats file_read results as raw strings", () => {
    const unsafe = validOutput();
    unsafe.manifest = { tools: ["file_read"], mutationPolicy: "read_only" };
    unsafe.source = `
export default async function run({ tools }) {
  const result = await tools.file_read({ path: "dogfood-notes/admin.md" });
  if (!result || typeof result !== "string") throw new Error("Failed to read file");
}
`;
    expect(() => validateWorkflowCompilerOutput(unsafe, descriptors)).toThrow("tools.file_read returns { path, content, truncated, kind }");

    const safe = validOutput();
    safe.manifest = { tools: ["file_read"], mutationPolicy: "read_only" };
    safe.source = `
export default async function run({ tools }) {
  const result = await tools.file_read({ path: "dogfood-notes/admin.md" });
  if (!result || typeof result.content !== "string") throw new Error("Failed to read file");
  return result.content;
}
`;
    expect(() => validateWorkflowCompilerOutput(safe, descriptors)).not.toThrow();
  });

  it("validates literal bracket SDK calls without allowing dynamic access", () => {
    expect(
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: ["bash", "ambient.responses"], mutationPolicy: "read_only" },
          source: `
export default async function run({ workflow, tools, ambient }) {
  await workflow["emit"]({ type: "fixture" });
  await tools["bash"]({ command: "true" });
  await ambient["call"]({ task: "classify", input: { outputContract: { labels: "array" } }, schema });
}
`,
        },
        descriptors,
      ),
    ).toMatchObject({ toolNames: ["bash", "ambient.responses"] });

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...validOutput(),
          manifest: { tools: [], mutationPolicy: "read_only" },
          source: `export default async function run({ ambient }) { await ambient["call"]({ task: "classify", input: {}, schema }); }`,
        },
        descriptors,
      ),
    ).toThrow("ambient.responses");
  });

  it("requires literal connector calls that match declared grants", () => {
    const output = validOutput();
    output.manifest.tools = [];
    output.manifest.connectors = [
      {
        connectorId: "fixture.readonly",
        accountId: "fixture",
        scopes: ["fixture.records.read"],
        operations: ["listRecords"],
        dataRetention: "redacted_audit",
      },
    ];

    expect(
      validateWorkflowCompilerOutput(
        {
          ...output,
          source: `
export default async function run({ connectors }) {
  await connectors["call"]({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 10 } });
}
`,
        },
        descriptors,
        connectorDescriptors,
      ),
    ).toMatchObject({ output: { title: "Local project health check" } });

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...output,
          source: `
export default async function run({ connectors }) {
  const call = { connectorId: "fixture.readonly", operation: "listRecords", input: {} };
  await connectors.call(call);
}
`,
        },
        descriptors,
        connectorDescriptors,
      ),
    ).toThrow("without literal connectorId and operation");

    expect(() =>
      validateWorkflowCompilerOutput(
        {
          ...output,
          source: `
export default async function run({ connectors }) {
  const method = "call";
  await connectors[method]({ connectorId: "fixture.readonly", operation: "listRecords", input: {} });
}
`,
        },
        descriptors,
        connectorDescriptors,
      ),
    ).toThrow("dynamic connector SDK reference");
  });
});
