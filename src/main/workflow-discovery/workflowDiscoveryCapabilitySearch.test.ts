import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pluginMcpToolDescriptor } from "../desktopToolRegistry";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { googleWorkspaceConnectorDescriptors } from "../google-workspace/googleWorkspaceConnectors";
import { validateWorkflowConnectorDescriptor, workspaceInventoryConnectorDescriptor } from "../workflow/workflowConnectors";
import { buildWorkflowDiscoveryPolicyContext } from "./workflowDiscoveryPolicy";
import {
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
  workflowDiscoveryCapabilityAwarePolicySummary,
} from "./workflowDiscoveryCapabilitySearch";

describe("workflowDiscoveryCapabilitySearch", () => {
  let workspacePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-capability-search-"));
    await writeFile(join(workspacePath, "notes.md"), "# Notes\n", "utf8");
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("returns request-specific plugin matches without dumping unrelated plugin labels into the summary", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      pluginRegistrations: [fixturePluginRegistration("arxiv_search", "arXiv paper search", "Search arXiv paper metadata."), fixturePluginRegistration("slack_search", "Slack message search", "Search Slack messages.")],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Find recent papers on the placebo effect from arxiv and create summaries of them",
      context: policyContext,
    });
    const summary = workflowDiscoveryCapabilityAwarePolicySummary(policyContext, search);

    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "plugin_tool",
          label: "arXiv paper search via Fixture",
          status: "workflow_safe",
          recommendation: "recommended",
          permissionCapability: "plugin_tool_execute",
        }),
      ]),
    );
    expect(search.results.find((result) => result.id === "plugin:slack_search")).toBeUndefined();
    expect(summary).toContain("arXiv paper search via Fixture");
    expect(summary).not.toContain("Slack message search");
  });

  it("keeps browser research as fallback when a source-specific plugin matched", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      pluginRegistrations: [fixturePluginRegistration("arxiv_search", "arXiv paper search", "Search arXiv paper metadata.")],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Find recent arxiv papers on placebo effects",
      context: policyContext,
    });

    expect(search.results.map((result) => result.kind)).toContain("plugin_tool");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "browser_fallback",
          label: "Browser research on arxiv.org",
          recommendation: "fallback",
          targetLabel: "web research via https://arxiv.org",
        }),
      ]),
    );
    expect(search.results.findIndex((result) => result.kind === "plugin_tool")).toBeLessThan(
      search.results.findIndex((result) => result.kind === "browser_fallback"),
    );
  });

  it("describes a selected plugin capability without executing it", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      pluginRegistrations: [fixturePluginRegistration("arxiv_search", "arXiv paper search", "Search arXiv paper metadata.")],
    });

    const description = describeWorkflowDiscoveryCapability({
      capabilityId: "plugin:arxiv_search",
      query: "recent arxiv papers",
      context: policyContext,
    });

    expect(description).toEqual(
      expect.objectContaining({
        id: "plugin:arxiv_search",
        kind: "plugin_tool",
        label: "arXiv paper search via Fixture",
        permissionCapability: "plugin_tool_execute",
        mutationClass: "plugin_defined",
        availabilitySummary: expect.stringContaining("startable"),
      }),
    );
    expect(description?.policy).toContain("metadata");
    expect(description?.warnings.join("\n")).toContain("does not execute");
  });

  it("returns installed Ambient CLI command matches as workflow capabilities without health checks", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      ambientCliCapabilities: [
        {
          capabilityId: "ambient-cli-pi-arxiv:tool:arxiv_search",
          registryPluginId: "cli:ambient-cli-pi-arxiv",
          packageId: "ambient-cli-pi-arxiv",
          packageName: "pi-arxiv",
          command: "arxiv_search",
          description: "Search arXiv paper metadata by query.",
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
          risk: ["run_process"],
          missingEnv: [],
          whyMatched: ["arxiv", "paper"],
        },
      ],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Find recent papers on the placebo effect from arxiv and create summaries of them",
      context: policyContext,
    });
    const description = describeWorkflowDiscoveryCapability({
      capabilityId: "ambient-cli-pi-arxiv:tool:arxiv_search",
      query: "Find recent arxiv papers",
      context: policyContext,
    });

    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ambient_cli",
          label: "pi-arxiv:arxiv_search",
          recommendation: "recommended",
          permissionCapability: "plugin_tool_execute",
          targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
        }),
      ]),
    );
    expect(description).toEqual(
      expect.objectContaining({
        kind: "ambient_cli",
        label: "pi-arxiv:arxiv_search",
        mutationClass: "plugin_defined",
        availabilitySummary: expect.stringContaining("requires ambient_cli approval"),
      }),
    );
    expect(description?.warnings.join("\n")).toContain("does not execute");
  });

  it("keeps search routing visible while allowing browser fallback when the preferred provider is available", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      searchRoutingSettings: {
        webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "prefer", fallback: "allow" },
      },
      ambientCliCapabilities: [
        {
          capabilityId: "ambient-cli-brave-search:tool:brave_search",
          registryPluginId: "cli:ambient-cli-brave-search",
          packageId: "ambient-cli-brave-search",
          packageName: "brave-search",
          command: "brave_search",
          description: "Search the public web with Brave Search.",
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
          risk: ["network_access"],
          missingEnv: [],
          whyMatched: ["latest", "web", "search"],
        },
      ],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Find current public webpages about compact workflow engines.",
      context: policyContext,
    });
    const summary = workflowDiscoveryCapabilityAwarePolicySummary(policyContext, search);

    expect(search.policy).toContain('web_search prefers Ambient CLI provider "brave-search"');
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ambient_cli",
          label: "brave-search:brave_search",
          recommendation: "recommended",
        }),
        expect.objectContaining({
          kind: "browser_fallback",
          recommendation: "fallback",
        }),
      ]),
    );
    expect(summary).toContain("Search routing: web_search prefers Ambient CLI provider \"brave-search\"");
    expect(search.results.findIndex((result) => result.kind === "ambient_cli")).toBeLessThan(
      search.results.findIndex((result) => result.kind === "browser_fallback"),
    );
  });

  it("blocks browser fallback when search routing requires an unavailable provider", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      searchRoutingSettings: {
        webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "require", fallback: "block" },
      },
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Find current public webpages about compact workflow engines.",
      context: policyContext,
    });
    const description = describeWorkflowDiscoveryCapability({
      capabilityId: "browser-web-research-blocked",
      query: "Find current public webpages about compact workflow engines.",
      context: policyContext,
    });

    expect(search.policy).toContain("browser fallback blocked");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-web-research-blocked",
          kind: "browser_fallback",
          recommendation: "blocked",
          label: "Browser web research blocked by search routing",
        }),
      ]),
    );
    expect(search.results).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-web-research",
          recommendation: "fallback",
        }),
      ]),
    );
    expect(description?.availabilitySummary).toBe("Blocked by search routing.");
  });

  it("allows an explicit browser override even when saved routing blocks fallback", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      searchRoutingSettings: {
        webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "require", fallback: "block" },
      },
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Use browser search for this one and find current public webpages about compact workflow engines.",
      context: policyContext,
    });

    expect(search.policy).toContain("browser fallback allowed by explicit request override");
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "browser-web-research",
          kind: "browser_fallback",
          recommendation: "fallback",
        }),
      ]),
    );
  });

  it("keeps local Downloads image categorization paired with MiniCPM visual analysis capability metadata", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      ambientCliCapabilities: [
        {
          capabilityId: "installed:ambient-minicpm-v-vision:tool:minicpm_vision_analyze",
          registryPluginId: "ambient-cli",
          packageId: "installed:ambient-minicpm-v-vision",
          packageName: "ambient-minicpm-v-vision",
          command: "minicpm_vision_analyze",
          description: "Analyze one bounded local image through the MiniCPM-V visual-understanding provider.",
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
          risk: ["run_process"],
          missingEnv: [],
          whyMatched: [],
        },
      ],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Please categorize 10 images from my Downloads directory.",
      context: policyContext,
    });

    expect(search.results[0]).toMatchObject({ id: "local-directory-downloads" });
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ambient_cli",
          label: "ambient-minicpm-v-vision:minicpm_vision_analyze",
          recommendation: "recommended",
          targetLabel: "Ambient CLI/ambient-minicpm-v-vision:minicpm_vision_analyze",
        }),
      ]),
    );
  });

  it("treats geographically local public events as web research, not workspace files or Google Calendar", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [
        validateWorkflowConnectorDescriptor({
          id: "google.calendar",
          label: "Google Calendar",
          description: "Read and manage calendar events.",
          auth: { type: "oauth2_pkce", providerId: "google", status: "available" },
          accounts: [{ id: "primary", label: "Primary" }],
          scopes: [{ id: "calendar.readonly", label: "Read calendar", description: "Read calendar events.", personalData: true }],
          rateLimit: { requestsPerMinute: 60, burst: 10 },
          sync: { cursorKind: "timestamp", supportsIncremental: true },
          defaultDataRetention: "redacted_audit",
          dataMinimization: ["Calendar test descriptor only exposes operation metadata."],
          operations: [
            {
              name: "listEvents",
              label: "List events",
              description: "List events from a calendar.",
              inputSchema: { type: "object", additionalProperties: false },
              requiredScopes: ["calendar.readonly"],
              sideEffects: "none",
              supportsDryRun: true,
              idempotencyKey: "not-supported",
              mutationPolicy: "unsupported",
              defaultTimeoutMs: 5_000,
            },
          ],
        }),
      ],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Research upcoming local live music events in Scottsdale AZ",
      context: policyContext,
    });

    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "browser_fallback",
          label: "Browser web research",
          permissionCapability: "browser_network",
        }),
      ]),
    );
    expect(search.results.find((result) => result.kind === "base_directory")).toBeUndefined();
    expect(search.results.find((result) => result.connectorId === "google.calendar")).toBeUndefined();
  });

  it("does not let generic read-only reporting terms pull Drive into Gmail discovery", () => {
    const [gmail, calendar, drive] = googleWorkspaceConnectorDescriptors({
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Gmail" }],
        },
        "google.calendar": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Calendar" }],
        },
        "google.drive": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Drive" }],
        },
      },
    });
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [gmail, calendar, drive],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Review my last 10 Gmail emails and produce a read-only categorization report grouped by urgency, action required, sender domain, and recurring theme.",
      context: policyContext,
    });

    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "connector",
          connectorId: "google.gmail",
          permissionCapability: "connector_content",
        }),
      ]),
    );
    expect(search.results.find((result) => result.connectorId === "google.drive")).toBeUndefined();
    expect(search.results.find((result) => result.connectorId === "google.calendar")).toBeUndefined();
  });

  it("classifies Downloads document/folder review as local filesystem access instead of Drive", () => {
    const [, , drive] = googleWorkspaceConnectorDescriptors({
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Drive" }],
        },
      },
    });
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [drive],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: "Please review the documents and folders in my Downloads directory and classify them into up to 7 categories",
      context: policyContext,
    });

    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-directory-downloads",
          kind: "base_directory",
          label: "Local filesystem: Downloads directory",
          description: expect.stringContaining("local_directory_list"),
          permissionCapability: "file_content",
          targetLabel: "local Downloads directory (~/Downloads) contents",
        }),
      ]),
    );
    expect(search.results[0]).toMatchObject({ id: "local-directory-downloads" });
    expect(search.results.find((result) => result.connectorId === "google.drive")).toBeUndefined();
  });

  it("keeps exact workspace file_read workflows free of connector and Ambient CLI candidates", () => {
    const [, , drive] = googleWorkspaceConnectorDescriptors({
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Drive" }],
        },
      },
    });
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [workspaceInventoryConnectorDescriptor(), drive],
      ambientCliCapabilities: [
        {
          capabilityId: "ambient-cli-brave-search:tool:brave_search",
          registryPluginId: "cli:ambient-cli-brave-search",
          packageId: "ambient-cli-brave-search",
          packageName: "brave-search",
          command: "brave_search",
          description: "Search the public web with Brave Search.",
          availability: "available",
          availabilityReason: "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
          risk: ["network_access"],
          missingEnv: [],
          whyMatched: ["search"],
        },
      ],
    });

	    const search = searchWorkflowDiscoveryCapabilities({
	      query: [
	        "Create a Workflow Agent that uses Ambient Desktop's local/workspace file_read workflow tool directly to read dogfood-notes/admin.md and dogfood-notes/learning.md.",
	        "Use those relative paths exactly. Forbidden external sources: Google Drive, Google Workspace, google.drive, connector content, connector account data, cloud accounts, and external accounts.",
	        "Do not use workspace.inventory, search, browser, Ambient CLI, or connector listing.",
	      ].join(" "),
	      context: policyContext,
	    });

    expect(search.results.some((result) => result.kind === "connector")).toBe(false);
    expect(search.results.some((result) => result.kind === "ambient_cli")).toBe(false);
    expect(search.results.some((result) => result.kind === "base_directory")).toBe(false);
  });

  it("does not substitute workspace inventory when local_directory_list is explicitly requested", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
    });

    const search = searchWorkflowDiscoveryCapabilities({
      query: [
        "Use local_directory_list exactly once to inventory the seeded Downloads fixture directory.",
        "Do not call connectors or workspace.inventory.",
      ].join(" "),
      context: policyContext,
    });

    expect(search.results[0]).toMatchObject({
      id: "local-directory-downloads",
      label: "Local filesystem: Downloads directory",
    });
    expect(search.results.some((result) => result.kind === "connector")).toBe(false);
  });

  it("describes connector operations and permission requirements from metadata only", () => {
    const connector = validateWorkflowConnectorDescriptor({
      id: "google.gmail",
      label: "Gmail",
      description: "Read Gmail messages.",
      auth: { type: "oauth2_pkce", providerId: "google", status: "available" },
      accounts: [{ id: "primary", label: "Primary Gmail" }],
      scopes: [{ id: "gmail.readonly", label: "Read Gmail", description: "Read Gmail messages.", personalData: true }],
      rateLimit: { requestsPerMinute: 60, burst: 10 },
      sync: { cursorKind: "timestamp", supportsIncremental: true },
      defaultDataRetention: "redacted_audit",
      dataMinimization: ["Only message metadata/content requested by the workflow is retained."],
      operations: [
        {
          name: "listMessages",
          label: "List messages",
          description: "List messages matching a query.",
          inputSchema: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "number" } }, required: ["query"], additionalProperties: false },
          outputSchema: { type: "object", properties: { messages: { type: "array" } }, additionalProperties: false },
          requiredScopes: ["gmail.readonly"],
          sideEffects: "read_personal_data",
          supportsDryRun: true,
          idempotencyKey: "not-supported",
          mutationPolicy: "unsupported",
          defaultTimeoutMs: 10_000,
        },
      ],
    });
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      connectorDescriptors: [connector],
    });

    const description = describeWorkflowDiscoveryCapability({
      capabilityId: "connector:google.gmail",
      context: policyContext,
      query: "review my last 10 emails",
    });

    expect(description).toEqual(
      expect.objectContaining({
        id: "connector:google.gmail",
        kind: "connector",
        label: "Gmail",
        permissionCapability: "connector_content",
        mutationClass: "read_only",
        accountSummary: expect.stringContaining("Primary Gmail"),
        inputShapeSummary: expect.stringContaining("query"),
      }),
    );
    expect(description?.operations?.[0]).toEqual(expect.objectContaining({ name: "listMessages", supportsDryRun: true }));
    expect(description?.warnings.join("\n")).toContain("Connector content reads");
  });
});

function fixturePluginRegistration(registeredName: string, label: string, description: string): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName,
    label,
    description,
    promptSnippet: `${registeredName}: ${description}`,
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName,
    originalName: registeredName.replace(/^fixture_/, ""),
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-plugin",
      serverName: "fixture-server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "fixture-plugin",
      pluginName: "Fixture",
      serverName: "fixture-server",
      name: registeredName,
    },
  };
}
