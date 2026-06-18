import type { SearchRoutingSettings } from "../../shared/webResearchTypes";
import type { McpToolDescriptor } from "../mcp/mcpToolBridge";
import { buildLocalDeepResearchSetupContract, type LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import { normalizeWebResearchProviderStackSettings, webResearchSettingsWithDynamicProviderCatalogs } from "./localDeepResearchWebResearchFacade";
import { writeWorkspaceTextFile } from "./localDeepResearchWorkspaceFacade";

const gib = 1024 ** 3;
const smokeRoot = ".ambient/local-deep-research/provider-preference-smoke";

export type LocalDeepResearchProviderPreferenceSmokeStatus = "passed" | "failed";

export interface LocalDeepResearchProviderPreferenceSmokeCheck {
  id: string;
  title: string;
  status: LocalDeepResearchProviderPreferenceSmokeStatus;
  detail: string;
  nextAction?: string;
}

export interface LocalDeepResearchProviderPreferenceSmokeResult {
  schemaVersion: "ambient-local-deep-research-provider-preference-smoke-v1";
  checkedAt: string;
  status: LocalDeepResearchProviderPreferenceSmokeStatus;
  checks: LocalDeepResearchProviderPreferenceSmokeCheck[];
  artifactPath: string;
  markdownPath: string;
}

export async function runLocalDeepResearchProviderPreferenceSmoke(input: {
  workspacePath: string;
  now?: () => Date;
}): Promise<LocalDeepResearchProviderPreferenceSmokeResult> {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  const checks = localDeepResearchProviderPreferenceSmokeChecks(checkedAt);
  const status: LocalDeepResearchProviderPreferenceSmokeStatus = checks.every((check) => check.status === "passed") ? "passed" : "failed";
  const basePath = `${smokeRoot}/${checkedAt.replace(/[:.]/g, "-")}-${status}`;
  const withoutArtifacts = {
    schemaVersion: "ambient-local-deep-research-provider-preference-smoke-v1" as const,
    checkedAt,
    status,
    checks,
  };
  const json = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.json`, `${JSON.stringify(withoutArtifacts, null, 2)}\n`);
  const markdown = await writeWorkspaceTextFile(input.workspacePath, `${basePath}.md`, localDeepResearchProviderPreferenceSmokeMarkdown(withoutArtifacts));
  return {
    ...withoutArtifacts,
    artifactPath: json.path,
    markdownPath: markdown.path,
  };
}

function localDeepResearchProviderPreferenceSmokeChecks(checkedAt: string): LocalDeepResearchProviderPreferenceSmokeCheck[] {
  return [
    smokeCheck(
      "default-exa-scrapling",
      "Default Exa/Scrapling route",
      () => {
        const setup = readySetup({ now: checkedAt });
        assertEqual(setup.providerSnapshot.searchOrder, ["exa-mcp-default", "ambient-browser"], "default search route");
        assertEqual(setup.providerSnapshot.fetchOrder, ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"], "default fetch route");
        return "Default route tries Exa for search, Scrapling first for fetch, then Exa and Ambient Browser fallback.";
      },
    ),
    smokeCheck(
      "brave-search-custom-fetch",
      "Preferred Brave search and custom fetch",
      () => {
        const setup = readySetup({
          now: checkedAt,
          searchSettings: {
            webResearch: normalizeWebResearchProviderStackSettings({
              providers: [
                {
                  providerId: "ambient-brave-search",
                  label: "Brave Search",
                  kind: "ambient-cli",
                  roles: ["search"],
                  status: "enabled",
                  privacyLabel: "Queries may be sent to Brave Search.",
                  ambientCli: {
                    packageId: "ambient-cli:ambient-brave-search",
                    packageName: "ambient-brave-search",
                    commandName: "search",
                    capabilityId: "ambient-cli:ambient-brave-search:tool:search",
                  },
                },
                {
                  providerId: "custom-fetch",
                  label: "Custom Fetch",
                  kind: "toolhive-mcp",
                  roles: ["fetch"],
                  status: "enabled",
                  mcp: {
                    serverId: "custom-fetch",
                    workloadName: "ambient-custom-fetch",
                    toolName: "fetch_page",
                    argumentName: "url",
                  },
                },
              ],
              preferences: {
                search: ["ambient-brave-search", "exa-mcp-default", "ambient-browser"],
                fetch: ["custom-fetch", "scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
              fallbackPolicy: { allowBrowserFallback: true },
            }),
          },
        });
        assertEqual(setup.providerSnapshot.searchOrder.slice(0, 2), ["ambient-brave-search", "exa-mcp-default"], "Brave-preferred search route");
        assertEqual(setup.providerSnapshot.fetchOrder.slice(0, 2), ["custom-fetch", "scrapling-mcp-default"], "custom fetch-preferred route");
        return "A user preference can move Brave Search first for search and a custom fetch provider first for page reads without changing the model profile.";
      },
    ),
    smokeCheck(
      "browser-fallback",
      "Browser fallback route",
      () => {
        const setup = readySetup({
          now: checkedAt,
          searchSettings: {
            webResearch: normalizeWebResearchProviderStackSettings({
              providers: [
                { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "disabled" },
                { providerId: "scrapling-mcp-default", label: "Scrapling", kind: "toolhive-mcp", roles: ["fetch"], status: "disabled" },
                { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "enabled" },
              ],
              preferences: {
                search: ["ambient-browser"],
                fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
              },
              fallbackPolicy: { allowBrowserFallback: true },
            }),
          },
        });
        assertEqual(setup.providerSnapshot.searchOrder, ["ambient-browser"], "browser-only search route");
        assertEqual(setup.providerSnapshot.fetchOrder, ["ambient-browser"], "browser-only fetch route");
        assertSkipped(setup.providerSnapshot.skippedFetchProviders, "scrapling-mcp-default", "disabled");
        assertSkipped(setup.providerSnapshot.skippedFetchProviders, "exa-mcp-default", "disabled");
        return "When remote/scraping providers are disabled but browser fallback is allowed, Local Deep Research degrades to Ambient Browser for both search and fetch.";
      },
    ),
    smokeCheck(
      "strict-no-fallback-block",
      "Strict no-fallback block",
      () => {
        const setup = readySetup({
          now: checkedAt,
          searchSettings: {
            webResearch: normalizeWebResearchProviderStackSettings({
              providers: [
                { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "disabled" },
                { providerId: "scrapling-mcp-default", label: "Scrapling", kind: "toolhive-mcp", roles: ["fetch"], status: "disabled" },
                { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "enabled" },
              ],
              preferences: {
                search: ["exa-mcp-default", "ambient-browser"],
                fetch: ["scrapling-mcp-default", "ambient-browser"],
              },
              fallbackPolicy: { allowBrowserFallback: false },
            }),
          },
        });
        assertEqual(setup.providerSnapshot.searchOrder, [], "strict search route");
        assertEqual(setup.providerSnapshot.fetchOrder, [], "strict fetch route");
        if (setup.status !== "blocked") throw new Error(`Expected strict no-fallback setup to block, got ${setup.status}.`);
        assertSkipped(setup.providerSnapshot.skippedSearchProviders, "ambient-browser", "fallback is disabled");
        assertSkipped(setup.providerSnapshot.skippedFetchProviders, "ambient-browser", "fallback is disabled");
        return "Strict no-fallback settings block Local Deep Research when no non-browser search/fetch route remains.";
      },
    ),
    smokeCheck(
      "installed-provider-refresh",
      "Installed provider refresh",
      () => {
        const before = readySetup({ now: checkedAt });
        const searchTool = mcpTool({
          serverId: "io.example/research-search",
          workloadName: "ambient-research-search",
          toolRef: "io.example/research-search/web_search",
          endpoint: "http://127.0.0.1:3131/mcp",
          name: "web_search",
          description: "Search the public web with an installed provider.",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        });
        const fetchTool = mcpTool({
          serverId: "io.example/page-reader",
          workloadName: "ambient-page-reader",
          toolRef: "io.example/page-reader/fetch_page",
          endpoint: "http://127.0.0.1:3132/mcp",
          name: "fetch_page",
          description: "Fetch a public web page as markdown content.",
          inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        });
        const after = readySetup({
          now: checkedAt,
          searchSettings: webResearchSettingsWithDynamicProviderCatalogs(undefined, { mcpTools: [searchTool, fetchTool] }),
        });
        const dynamicSearchId = "mcp:io.example/research-search/web_search";
        const dynamicFetchId = "mcp:io.example/page-reader/fetch_page";
        if (before.providerSnapshot.searchOrder.includes(dynamicSearchId)) throw new Error("Dynamic search provider appeared before installed-provider refresh.");
        if (!after.providerSnapshot.searchOrder.includes(dynamicSearchId)) throw new Error("Dynamic search provider did not appear after installed-provider refresh.");
        if (!after.providerSnapshot.fetchOrder.includes(dynamicFetchId)) throw new Error("Dynamic fetch provider did not appear after installed-provider refresh.");
        if (before.modelInstall.selectedProfileId !== after.modelInstall.selectedProfileId) throw new Error("Installed-provider refresh changed the selected model profile.");
        return "Newly discovered MCP-backed search and fetch providers appear in the next run-start snapshot without changing the selected LiteResearcher profile.";
      },
    ),
  ];
}

function smokeCheck(id: string, title: string, run: () => string): LocalDeepResearchProviderPreferenceSmokeCheck {
  try {
    return {
      id,
      title,
      status: "passed",
      detail: run(),
    };
  } catch (error) {
    return {
      id,
      title,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      nextAction: "Inspect Search & Web provider normalization and Local Deep Research provider snapshot planning.",
    };
  }
}

function readySetup(input: { now: string; searchSettings?: SearchRoutingSettings }): LocalDeepResearchSetupContract {
  return buildLocalDeepResearchSetupContract({
    now: () => new Date(input.now),
    modelInstallState: "installed",
    runtimeInstalled: true,
    machineFacts: {
      platform: "darwin",
      arch: "arm64",
      memoryBytes: 32 * gib,
      memoryPressure: "normal",
      activeLocalModelCount: 0,
    },
    ...(input.searchSettings ? { searchSettings: input.searchSettings } : {}),
  });
}

function assertEqual(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Unexpected ${label}: ${actual.join(" -> ") || "none"}; expected ${expected.join(" -> ") || "none"}.`);
  }
}

function assertSkipped(skipped: Array<{ providerId: string; reason: string }>, providerId: string, reasonPattern: string): void {
  const entry = skipped.find((candidate) => candidate.providerId === providerId);
  if (!entry) throw new Error(`Expected skipped provider ${providerId}.`);
  if (!entry.reason.toLowerCase().includes(reasonPattern.toLowerCase())) {
    throw new Error(`Skipped provider ${providerId} reason "${entry.reason}" did not include "${reasonPattern}".`);
  }
}

function mcpTool(input: Omit<McpToolDescriptor, "reviewStatus" | "workloadStatus">): McpToolDescriptor {
  return {
    ...input,
    reviewStatus: "trusted",
    workloadStatus: "running",
  };
}

function localDeepResearchProviderPreferenceSmokeMarkdown(input: {
  checkedAt: string;
  status: LocalDeepResearchProviderPreferenceSmokeStatus;
  checks: LocalDeepResearchProviderPreferenceSmokeCheck[];
}): string {
  return [
    "# Local Deep Research Provider Preference Smoke",
    "",
    `Checked: ${input.checkedAt}`,
    `Status: ${input.status}`,
    "",
    "## Checks",
    "",
    ...input.checks.map((check) => [
      `- ${check.title}: ${check.status}. ${check.detail}`,
      check.nextAction ? `  Next: ${check.nextAction}` : undefined,
    ].filter(Boolean).join("\n")),
    "",
  ].join("\n");
}
