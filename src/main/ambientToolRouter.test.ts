import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES,
  AMBIENT_DIRECT_LOCAL_DEEP_RESEARCH_TOOL_NAMES,
  AMBIENT_DIRECT_LOCAL_RUNTIME_TOOL_NAMES,
  AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES,
  AMBIENT_TOOL_CALL,
  AMBIENT_TOOL_DESCRIBE,
  AMBIENT_TOOL_SEARCH,
  ambientToolRouterTargetFromInput,
  createAmbientToolRouterTools,
} from "./ambientToolRouter";

describe("ambient tool router", () => {
  it("keeps only the fast core tools directly active in normal agent sessions", () => {
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).toEqual([
      "read",
      "bash",
      "edit",
      "write",
      AMBIENT_TOOL_SEARCH,
      AMBIENT_TOOL_DESCRIBE,
      AMBIENT_TOOL_CALL,
      "ambient_git_status",
    ]);
  });

  it("keeps Git status direct while leaving mutating Git tools discoverable", async () => {
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).toContain("ambient_git_status");
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain("ambient_git_commit");
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain("ambient_git_finish_to_main");

    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL, "ambient_git_status"],
      tools: [fakeTool("ambient_git_status"), fakeTool("ambient_git_commit"), fakeTool("ambient_git_finish_to_main")],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const search = tools.find((tool) => tool.name === AMBIENT_TOOL_SEARCH)!;
    const describe = tools.find((tool) => tool.name === AMBIENT_TOOL_DESCRIBE)!;

    const result = await search.execute("search-git", { query: "merge main push worktree", limit: 5 }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");
    expect(text).toContain("ambient_git_finish_to_main");
    expect(text).not.toContain("ambient_git_status");

    const described = await describe.execute("describe-git", { name: "ambient_git_finish_to_main" }, undefined, undefined, {} as any);
    expect(described.content.map((part: any) => part.text ?? "").join("\n")).toContain("validationCommands");
  });

  it("routes web research broker and preference tools through progressive discovery by default", () => {
    for (const toolName of AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES) {
      expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain(toolName);
    }
  });

  it("routes Local Deep Research status/setup/run through progressive discovery by default", () => {
    for (const toolName of [...AMBIENT_DIRECT_LOCAL_RUNTIME_TOOL_NAMES, ...AMBIENT_DIRECT_LOCAL_DEEP_RESEARCH_TOOL_NAMES]) {
      expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain(toolName);
    }
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain("ambient_local_model_runtime_start");
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain("ambient_local_model_runtime_stop");
    expect(AMBIENT_DEFAULT_ACTIVE_TOOL_NAMES).not.toContain("ambient_local_model_runtime_restart");
  });

  it("hides unsupported plugin install tools from router discovery", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [fakeTool("ambient_plugin_install_preview"), fakeTool("ambient_install_route_plan")],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute("search-plugins", { query: "plugin install", limit: 5, includeActive: true }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(text).not.toContain("ambient_plugin_install_preview");
    expect(text).not.toContain("ambient_plugin_install_commit");
  });

  it("hides raw sandboxed Pi extension install from router discovery and execution", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [fakeTool("ambient_pi_extension_install_sandboxed"), fakeTool("ambient_cli_package_install_pi_catalog")],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const search = tools.find((tool) => tool.name === AMBIENT_TOOL_SEARCH)!;
    const describe = tools.find((tool) => tool.name === AMBIENT_TOOL_DESCRIBE)!;
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await search.execute("search-pi-extension", { query: "install sandboxed pi extension", limit: 10, includeActive: true }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(text).not.toContain("ambient_pi_extension_install_sandboxed");
    expect(text).toContain("ambient_cli_package_install_pi_catalog");
    await expect(describe.execute("describe-pi-extension", { name: "ambient_pi_extension_install_sandboxed" }, undefined, undefined, {} as any)).rejects.toThrow(
      "Unknown or unsupported first-party Ambient tool",
    );
    await expect(
      call.execute(
        "call-pi-extension",
        { toolName: "ambient_pi_extension_install_sandboxed", toolInput: { source: "https://pi.dev/packages/pi-arxiv?name=arxiv" } },
        undefined,
        undefined,
        {} as any,
      ),
    ).rejects.toThrow("Unknown or unsupported first-party Ambient tool");
  });

  it("searches compact first-party tool metadata without exposing full schemas up front", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [fakeTool("browser_search"), fakeTool("ambient_voice_status")],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute("search-1", { query: "browser search", limit: 5 }, undefined, undefined, {} as any);

    const text = result.content.map((part: any) => part.text ?? "").join("\n");
    expect(text).toContain("browser_search");
    expect(text).not.toContain("properties");
    expect(result.details).toMatchObject({
      runtime: "ambient-tool-router",
      toolName: AMBIENT_TOOL_SEARCH,
      status: "complete",
    });
  });

  it("prioritizes the web research broker for ordinary public research searches", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_search"),
        fakeTool("browser_local_preview"),
        fakeTool("browser_nav"),
        fakeTool("web_research_status"),
        fakeTool("web_research_preferences_update"),
        fakeTool("web_research_search"),
        fakeTool("web_research_fetch"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-public-research",
      { query: "research verified inference formal verification approaches", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames[0]).toBe("web_research_search");
    expect(text).toContain("For ordinary public web research, select web_research_search first");
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([...AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES]));
  });

  it("keeps explicit browser navigation searches routed to browser tools", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_nav", {
          parameters: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          } as any,
        }),
        fakeTool("web_research_search"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-known-url",
      { query: "open a known URL in the browser", category: "browser", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames[0]).toBe("browser_nav");
    expect(candidateNames).not.toContain("web_research_search");
  });

  it("routes MCP GitHub capability install searches to install routing before Capability Builder", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_capability_builder_plan"),
        fakeTool("ambient_capability_builder_install_deps"),
        fakeTool("ambient_install_route_plan"),
        fakeTool("ambient_mcp_autowire_plan"),
        fakeTool("ambient_mcp_server_search"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-mcp-install",
      { query: "install capability from GitHub repository MCP server", category: "capability", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string; category: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames.slice(0, 2)).toEqual(["ambient_install_route_plan", "ambient_mcp_autowire_plan"]);
    expect(text).toContain("ambient_install_route_plan [install-routing]");
    expect(text).toContain("ambient_mcp_autowire_plan [mcp]");
  });

  it("routes installed MCP tool-use searches to the compact MCP bridge", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_install_route_plan"),
        fakeTool("ambient_mcp_autowire_plan"),
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_server_list"),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
        fakeTool("ambient_mcp_tool_call"),
      ],
    });
    const [search] = createAmbientToolRouterTools({
      getSession: () => session,
      getInstalledMcpSearchAliases: async () => [
        "modelcontextprotocol-server-everything-standard-mcp",
        "ambient-modelcontextprotocol-server-everything-standard-mcp-87a99ff6",
        "@modelcontextprotocol/server-everything",
        "echo",
      ],
    });

    const result = await search.execute(
      "search-installed-mcp-tool-use",
      { query: "Use the installed Everything MCP to echo diagnostic sample", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string; category: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames.slice(0, 3)).toEqual([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]);
    expect(candidateNames).not.toContain("ambient_install_route_plan");
    expect(result.details).toMatchObject({ installedMcpToolUse: true });
    expect(text).toContain("For installed MCP tool use, select ambient_mcp_tool_search first");
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]));
  });

  it("prioritizes saved Workflow Recorder playbook tools for workflow run searches", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("workflow_capability_search"),
        fakeTool("ambient_capability_builder_plan"),
        fakeTool("ambient_workflows_search"),
        fakeTool("ambient_workflows_describe"),
        fakeTool("ambient_workflows_inject"),
        fakeTool("ambient_workflows_callable_catalog"),
        fakeTool("ambient_workflows_callable_describe"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-saved-workflow-run",
      { query: "prepare meeting pack workflow", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames).toEqual([
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_inject",
      "ambient_workflows_callable_catalog",
      "ambient_workflows_callable_describe",
    ]);
    expect(candidateNames).not.toContain("workflow_capability_search");
    expect(candidateNames).not.toContain("ambient_capability_builder_plan");
    expect(result.details).toMatchObject({ recordedWorkflowPlaybookUse: true });
    expect(text).toContain("For saved Workflow Recorder playbook use, select ambient_workflows_search first");
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_inject",
    ]));

    const directRunResult = await search.execute(
      "search-saved-workflow-run-title",
      { query: "Can you run Prepare A Meeting Pack for my next Ambient-related meeting?", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const directCandidateNames = ((directRunResult.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    expect(directCandidateNames[0]).toBe("ambient_workflows_search");

    const exactTitleResult = await search.execute(
      "search-saved-workflow-title",
      { query: "Prepare A Meeting Pack", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const exactTitleCandidateNames = ((exactTitleResult.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    expect(exactTitleCandidateNames[0]).toBe("ambient_workflows_search");
  });

  it("routes installed skill and workflow inventory questions to Ambient wrappers", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_cli_search"),
        fakeTool("ambient_cli_describe"),
        fakeTool("ambient_cli"),
        fakeTool("ambient_workflows_search"),
        fakeTool("ambient_workflows_describe"),
        fakeTool("ambient_workflows_inject"),
        fakeTool("ambient_pi_privileged_scan"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-installed-skills-and-workflows",
      { query: "What skills do you have installed, and what workflows do you have installed?", limit: 6 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames).toEqual([
      "ambient_cli_search",
      "ambient_workflows_search",
      "ambient_cli_describe",
      "ambient_workflows_describe",
      "ambient_cli",
      "ambient_workflows_inject",
    ]);
    expect(candidateNames).not.toContain("ambient_pi_privileged_scan");
    expect(result.details).toMatchObject({
      ambientCliCapabilityUse: true,
      recordedWorkflowPlaybookUse: true,
    });
    expect(text).toContain("For installed Ambient CLI skills and capabilities");
    expect(text).toContain("Do not inspect raw Pi skill directories");
    expect(text).toContain("For saved Workflow Recorder playbook use");
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_cli_search",
      "ambient_cli_describe",
      "ambient_cli",
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_inject",
    ]));
  });

  it("uses installed MCP aliases when the user omits the MCP acronym", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
        fakeTool("ambient_mcp_tool_call"),
      ],
    });
    const [search] = createAmbientToolRouterTools({
      getSession: () => session,
      getInstalledMcpSearchAliases: async () => ["everything", "echo"],
    });

    const result = await search.execute(
      "search-installed-mcp-alias",
      { query: "Use Everything to echo diagnostic sample", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames).toEqual([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]);
  });

  it("uses installed MCP aliases for category-filtered capability queries without explicit use verbs", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
        fakeTool("ambient_mcp_tool_call"),
      ],
    });
    const [search] = createAmbientToolRouterTools({
      getSession: () => session,
      getInstalledMcpSearchAliases: async () => ["brasil-data-mcp-standard-mcp", "ambient-brasil-data-mcp-standard-mcp-e9baa907"],
    });

    const result = await search.execute(
      "search-brasil-installed-mcp",
      { query: "brasil data CEP holiday", category: "mcp", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames).toEqual([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]);
    expect(result.details).toMatchObject({ installedMcpToolUse: true });
  });

  it("routes installed MCP alias tool searches through the compact MCP bridge", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_install_route_plan"),
        fakeTool("ambient_mcp_autowire_plan"),
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
        fakeTool("ambient_mcp_tool_call"),
      ],
    });
    const [search] = createAmbientToolRouterTools({
      getSession: () => session,
      getInstalledMcpSearchAliases: async () => ["csvglow-standard-mcp", "csvglow", "generate_dashboard"],
    });

    const result = await search.execute(
      "search-csvglow-installed-tool-use",
      { query: "csvglow tools", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames.slice(0, 3)).toEqual([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]);
    expect(candidateNames).not.toContain("ambient_install_route_plan");
    expect(result.details).toMatchObject({ installedMcpToolUse: true });
    expect(text).toContain("For installed MCP tool use, select ambient_mcp_tool_search first");
  });

  it("activates the installed MCP bridge after a standard import install tool is called", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_standard_import_install"),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
        fakeTool("ambient_mcp_tool_call"),
        fakeTool("ambient_mcp_tool_review_accept"),
        fakeTool("ambient_mcp_tool_policy_update"),
        fakeTool("ambient_mcp_aggregation_status"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    await call.execute(
      "call-standard-import-install",
      { toolName: "ambient_mcp_standard_import_install", toolInput: { query: "install reviewed MCP" } },
      undefined,
      undefined,
      {} as any,
    );

    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]));
  });

  it("activates Standard MCP continuation tools after an autowire handoff", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_autowire_review"),
        fakeTool("ambient_mcp_standard_import_describe"),
        fakeTool("ambient_mcp_standard_import_install"),
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_server_describe"),
        fakeTool("ambient_mcp_server_install"),
        fakeTool("ambient_mcp_remote_proxy_describe"),
        fakeTool("ambient_mcp_remote_proxy_install"),
        fakeTool("ambient_mcp_guided_bridge_describe"),
        fakeTool("ambient_mcp_guided_bridge_preflight"),
        fakeTool("ambient_mcp_guided_bridge_register"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    await call.execute(
      "call-autowire-review",
      { toolName: "ambient_mcp_autowire_review", toolInput: { query: "review candidate" } },
      undefined,
      undefined,
      {} as any,
    );

    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_server_describe",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_guided_bridge_describe",
    ]));
  });

  it("prioritizes the Standard MCP import install tool for reviewed import install searches", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_standard_import_describe"),
        fakeTool("ambient_mcp_standard_import_install"),
        fakeTool("ambient_mcp_server_search"),
        fakeTool("ambient_mcp_server_install"),
        fakeTool("ambient_install_route_plan"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-standard-import-install",
      { query: "install reviewed Standard MCP import candidate", category: "mcp", limit: 5 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames.slice(0, 2)).toEqual([
      "ambient_mcp_standard_import_install",
      "ambient_mcp_standard_import_describe",
    ]);
  });

  it("finds Standard MCP import handoff tools for generic next-tool searches", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_standard_import_describe"),
        fakeTool("ambient_mcp_standard_import_install"),
        fakeTool("ambient_mcp_runtime_repair_describe"),
        fakeTool("ambient_mcp_secret_request"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-standard-import-next-tool",
      { query: "next Standard import tool", category: "mcp", limit: 4 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames.slice(0, 2)).toEqual([
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
    ]);
  });

  it("prioritizes a named Ambient tool even when the query includes surrounding words", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_standard_import_describe"),
        fakeTool("ambient_mcp_runtime_repair_describe"),
        fakeTool("ambient_mcp_secret_request"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-embedded-tool-name",
      { query: "please describe ambient_mcp_standard_import_describe directly", category: "mcp", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);

    expect(candidateNames[0]).toBe("ambient_mcp_standard_import_describe");
  });

  it("includes active MCP autowire review tools for continuation searches", async () => {
    const session = fakeSession({
      active: [
        "read",
        AMBIENT_TOOL_SEARCH,
        AMBIENT_TOOL_DESCRIBE,
        AMBIENT_TOOL_CALL,
        "ambient_mcp_autowire_plan",
        "ambient_mcp_autowire_review",
      ],
      tools: [
        fakeTool("ambient_mcp_autowire_plan"),
        fakeTool("ambient_mcp_autowire_review"),
        fakeTool("ambient_mcp_standard_import_describe"),
        fakeTool("ambient_mcp_server_search"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-active-autowire-review",
      { query: "review autowire candidate", category: "mcp", limit: 4 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string; active?: boolean }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames[0]).toBe("ambient_mcp_autowire_review");
    expect(text).toContain("ambient_mcp_autowire_review [mcp] (active)");
  });

  it("returns exact tool-name matches even when the tool is already active", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL, "ambient_mcp_autowire_review"],
      tools: [
        fakeTool("ambient_mcp_autowire_plan"),
        fakeTool("ambient_mcp_autowire_review"),
        fakeTool("ambient_mcp_server_search"),
      ],
    });
    const [search] = createAmbientToolRouterTools({ getSession: () => session });

    const result = await search.execute(
      "search-exact-review",
      { query: "ambient_mcp_autowire_review", limit: 3 },
      undefined,
      undefined,
      {} as any,
    );
    const candidateNames = ((result.details as any).candidates as Array<{ name: string }>).map((candidate) => candidate.name);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(candidateNames[0]).toBe("ambient_mcp_autowire_review");
    expect(text).toContain("ambient_mcp_autowire_review [mcp] (active)");
  });

  it("executes valid wrapped input without a prior describe round trip", async () => {
    let executeCount = 0;
    const calledInputs: unknown[] = [];
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_nav", {
          parameters: {
            type: "object",
            properties: {
              url: { type: "string" },
            },
            required: ["url"],
            additionalProperties: false,
          } as any,
          execute: async (_toolCallId, params) => {
            executeCount += 1;
            calledInputs.push(params);
            return { content: [{ type: "text" as const, text: "navigation complete" }], details: { ok: true } };
          },
        }),
      ],
    });
    const authorizeCalls: Array<{ toolName: string; input: unknown }> = [];
    const tools = createAmbientToolRouterTools({
      getSession: () => session,
      authorizeToolCall: async (toolName, input) => {
        authorizeCalls.push({ toolName, input });
      },
    });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute("call-1", { toolName: "browser_nav", toolInput: { url: "https://example.com" } }, undefined, undefined, {} as any);
    expect(executeCount).toBe(1);
    expect(authorizeCalls).toEqual([{ toolName: "browser_nav", input: { url: "https://example.com" } }]);
    expect(calledInputs).toEqual([{ url: "https://example.com" }]);
    expect(result.content).toEqual([{ type: "text", text: "navigation complete" }]);
  });

  it("activates a small related direct bundle after describing a routed tool", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_search"),
        fakeTool("browser_local_preview"),
        fakeTool("browser_nav"),
        fakeTool("browser_content"),
        fakeTool("browser_eval"),
        fakeTool("browser_click"),
        fakeTool("browser_get_value"),
        fakeTool("browser_wait_for"),
        fakeTool("browser_assert"),
        fakeTool("browser_keypress"),
        fakeTool("browser_screenshot"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const describeTool = tools.find((tool) => tool.name === AMBIENT_TOOL_DESCRIBE)!;

    await describeTool.execute("describe-browser", { name: "browser_search" }, undefined, undefined, {} as any);

    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "browser_search",
      "browser_local_preview",
      "browser_nav",
      "browser_content",
      "browser_eval",
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
      "browser_keypress",
      "browser_screenshot",
    ]));
  });

  it("unwraps nested Pi tool-call payloads before validating routed input", async () => {
    const calledInputs: unknown[] = [];
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_eval", {
          parameters: {
            type: "object",
            properties: {
              code: { type: "string" },
            },
            required: ["code"],
            additionalProperties: false,
          } as any,
          execute: async (_toolCallId, params) => {
            calledInputs.push(params);
            return { content: [{ type: "text" as const, text: "eval complete" }], details: { ok: true } };
          },
        }),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-1",
      {
        toolName: "browser_eval",
        toolInput: {
          type: "toolCall",
          name: "browser_eval",
          arguments: JSON.stringify({ code: "return document.title;" }),
        },
      },
      undefined,
      undefined,
      {} as any,
    );

    expect(calledInputs).toEqual([{ code: "return document.title;" }]);
    expect(result.content).toEqual([{ type: "text", text: "eval complete" }]);
  });

  it("unwraps recursively nested routed wrapper arguments before validating browser actions", async () => {
    const calledInputs: unknown[] = [];
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_click", {
          parameters: {
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          } as any,
          execute: async (_toolCallId, params) => {
            calledInputs.push(params);
            return { content: [{ type: "text" as const, text: "click complete" }], details: { ok: true } };
          },
        }),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-click",
      {
        toolName: "browser_click",
        toolInput: {
          type: "toolCall",
          name: "browser_click",
          arguments: JSON.stringify({
            toolName: "browser_click",
            toolInput: { text: "7" },
          }),
        },
      },
      undefined,
      undefined,
      {} as any,
    );

    expect(calledInputs).toEqual([{ text: "7" }]);
    expect(result.content).toEqual([{ type: "text", text: "click complete" }]);
  });

  it("returns the wrapped tool contract instead of throwing for invalid input", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [fakeTool("browser_search")],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const describeTool = tools.find((tool) => tool.name === AMBIENT_TOOL_DESCRIBE)!;
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    await describeTool.execute("describe-1", { name: "browser_search" }, undefined, undefined, {} as any);

    const result = await call.execute("call-1", { name: "browser_search", input: {} }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");
    expect(text).toContain("No execution performed. Invalid input for browser_search");
    expect(text).toContain("$.query is required");
    expect(text).toContain("Input schema:");
    expect(result.details).toMatchObject({ status: "invalid-input", executionSkipped: true });
  });

  it("points malformed empty router calls back to the last described routed tool", async () => {
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [fakeTool("browser_search")],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const describeTool = tools.find((tool) => tool.name === AMBIENT_TOOL_DESCRIBE)!;
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    await describeTool.execute("describe-1", { name: "browser_search" }, undefined, undefined, {} as any);
    const result = await call.execute("call-1", {}, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(text).toContain("Most recently described routed tool: browser_search");
    expect(text).toContain("\"toolName\": \"browser_search\"");
    expect(result.details).toMatchObject({
      status: "invalid-input",
      executionSkipped: true,
      suggestedToolName: "browser_search",
    });
  });

  it("routes installed MCP tool refs passed through ambient_tool_call into the MCP bridge", async () => {
    let receivedInput: unknown;
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("ambient_mcp_tool_call", {
          parameters: {
            type: "object",
            properties: {
              toolName: { type: "string" },
              arguments: { type: "object", additionalProperties: true },
            },
            required: ["toolName"],
            additionalProperties: false,
          } as any,
          execute: async (_id, input) => {
            receivedInput = input;
            return { content: [{ type: "text" as const, text: "mcp bridge called" }], details: { ok: true } };
          },
        }),
        fakeTool("ambient_mcp_tool_search"),
        fakeTool("ambient_mcp_tool_describe"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-mcp-ref",
      {
        toolName: "modelcontextprotocol-server-filesystem-standard-mcp/read_file",
        toolInput: { arguments: { path: "/projects/filesystem-fixture/notes.txt" } },
      },
      undefined,
      undefined,
      {} as any,
    );

    expect(receivedInput).toEqual({
      toolName: "modelcontextprotocol-server-filesystem-standard-mcp/read_file",
      arguments: { path: "/projects/filesystem-fixture/notes.txt" },
    });
    expect(result.content.map((part: any) => part.text ?? "").join("\n")).toContain("mcp bridge called");
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]));
  });

  it("routes web research tools and activates the web research bundle", async () => {
    let executeCount = 0;
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("web_research_status"),
        fakeTool("web_research_preferences_update", {
          execute: async () => {
            executeCount += 1;
            return { content: [{ type: "text" as const, text: "preferences updated" }], details: {} };
          },
        }),
        fakeTool("web_research_search"),
        fakeTool("web_research_fetch"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    await call.execute("call-1", { toolName: "web_research_preferences_update", toolInput: { query: "prefs" } }, undefined, undefined, {} as any);

    expect(executeCount).toBe(1);
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([...AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES]));
  });

  it("blocks search-engine browser_nav URLs and redirects to web research search without executing", async () => {
    let executeCount = 0;
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_nav", {
          parameters: {
            type: "object",
            properties: {
              url: { type: "string" },
              userActionId: { type: "string" },
            },
            required: ["url"],
            additionalProperties: false,
          } as any,
          execute: async () => {
            executeCount += 1;
            return { content: [{ type: "text" as const, text: "navigated" }], details: {} };
          },
        }),
        fakeTool("web_research_status"),
        fakeTool("web_research_preferences_update"),
        fakeTool("web_research_search"),
        fakeTool("web_research_fetch"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-search-url",
      { toolName: "browser_nav", toolInput: { url: "https://www.google.com/search?q=verified+inference+proof" } },
      undefined,
      undefined,
      {} as any,
    );
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(executeCount).toBe(0);
    expect(text).toContain("No execution performed. browser_nav is for explicit browser interaction");
    expect(text).toContain("\"toolName\": \"web_research_search\"");
    expect(result.details).toMatchObject({
      status: "invalid-route",
      executionSkipped: true,
      suggestedToolName: "web_research_search",
      suggestedToolInput: { query: "verified inference proof" },
    });
    expect(session.getActiveToolNames()).toEqual(expect.arrayContaining([...AMBIENT_DIRECT_WEB_RESEARCH_TOOL_NAMES]));
  });

  it("blocks routed browser_search and redirects to web research search without executing", async () => {
    let executeCount = 0;
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_search", {
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              maxResults: { type: "number" },
            },
            required: ["query"],
            additionalProperties: false,
          } as any,
          execute: async () => {
            executeCount += 1;
            return { content: [{ type: "text" as const, text: "searched" }], details: {} };
          },
        }),
        fakeTool("web_research_status"),
        fakeTool("web_research_preferences_update"),
        fakeTool("web_research_search"),
        fakeTool("web_research_fetch"),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-browser-search",
      { toolName: "browser_search", toolInput: { query: "verified inference proof", maxResults: 7 } },
      undefined,
      undefined,
      {} as any,
    );

    expect(executeCount).toBe(0);
    expect(result.content.map((part: any) => part.text ?? "").join("\n")).toContain("\"toolName\": \"web_research_search\"");
    expect(result.details).toMatchObject({
      status: "invalid-route",
      executionSkipped: true,
      suggestedToolName: "web_research_search",
      suggestedToolInput: { query: "verified inference proof", maxResults: 7 },
      reason: "public-web-discovery-via-browser-search",
    });
  });

  it("marks routed browser user-action results as blocked errors", async () => {
    const userAction = {
      id: "browser-action-1",
      active: true,
      status: "waiting",
      kind: "captcha",
      toolName: "browser_nav",
      runtime: "chrome",
      profileMode: "isolated",
      message: "Complete the verification in the browser.",
      startedAt: "2026-06-12T16:00:00.000Z",
      lastCheckedAt: "2026-06-12T16:00:01.000Z",
      canAutoResume: false,
    };
    const session = fakeSession({
      active: ["read", AMBIENT_TOOL_SEARCH, AMBIENT_TOOL_DESCRIBE, AMBIENT_TOOL_CALL],
      tools: [
        fakeTool("browser_nav", {
          parameters: {
            type: "object",
            properties: { url: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          } as any,
          execute: async () => ({
            content: [{ type: "text" as const, text: "Browser needs user action." }],
            details: { toolName: "browser_nav", userAction },
          }),
        }),
      ],
    });
    const tools = createAmbientToolRouterTools({ getSession: () => session });
    const call = tools.find((tool) => tool.name === AMBIENT_TOOL_CALL)!;

    const result = await call.execute(
      "call-user-action",
      { toolName: "browser_nav", toolInput: { url: "https://example.com" } },
      undefined,
      undefined,
      {} as any,
    );

    expect((result as any).isError).toBe(true);
    expect(result.content.map((part: any) => part.text ?? "").join("\n")).toContain("blocked further routed browser automation");
    expect(result.details).toMatchObject({
      status: "blocked-user-action",
      executionBlocked: true,
      userAction,
    });
  });

  it("recovers the recurrent inline arg encoding shape from malformed router names", () => {
    const target = ambientToolRouterTargetFromInput(AMBIENT_TOOL_CALL, {
      name: 'browser_nav<arg_key>input</arg_key><arg_value>{"url":"http://localhost:5176/","newTab":true}',
    });

    expect(target).toEqual({
      toolName: "browser_nav",
      input: { url: "http://localhost:5176/", newTab: true },
    });
  });

  it("unwraps an outer ambient_tool_call envelope when computing router targets", () => {
    const target = ambientToolRouterTargetFromInput(AMBIENT_TOOL_CALL, {
      toolName: AMBIENT_TOOL_CALL,
      toolInput: {
        toolName: "browser_click",
        toolInput: { text: "7" },
      },
    });

    expect(target).toEqual({
      toolName: "browser_click",
      input: { text: "7" },
    });
  });
});

function fakeSession(input: { active: string[]; tools: ToolDefinition<any, any, any>[] }) {
  let active = [...input.active];
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  return {
    getActiveToolNames: () => active,
    setActiveToolsByName: (toolNames: string[]) => {
      active = toolNames;
    },
    getAllTools: () =>
      input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        sourceInfo: { source: "test" },
      })),
    getToolDefinition: (name: string) => toolsByName.get(name),
  };
}

function fakeTool(name: string, overrides: Partial<ToolDefinition<any, any, any>> = {}): ToolDefinition<any, any, any> {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    } as any,
    execute: async () => ({ content: [{ type: "text" as const, text: `${name} executed` }], details: {} }),
    ...overrides,
  };
}
