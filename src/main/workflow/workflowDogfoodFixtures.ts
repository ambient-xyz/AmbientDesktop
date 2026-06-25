import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { vi } from "vitest";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type {
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
} from "../../shared/localRuntimeTypes";
import type { CodexPluginSummary } from "../../shared/pluginTypes";
import type { WorkflowDashboard, WorkflowRunEvent, WorkflowRunSummary } from "../../shared/workflowTypes";
import { BrowserService, type BrowserCredentialSafeStorage } from "../browser/browserAgentRuntimeContract";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./workflowAmbientFacade";
import {
  GoogleWorkspaceCliAdapter,
  googleWorkspaceConnectorRegistrations,
  type GoogleWorkspaceConnectorDescriptorOptions,
} from "./workflowGoogleWorkspaceFacade";
import { workflowPluginCapabilityGrant } from "./workflowPluginCapabilities";
import { type WorkflowExplorationAction, type WorkflowExplorationProvider } from "./workflowExplorationService";
import { workflowApprovalsFromEvents } from "./workflowApprovals";
import { runWorkflowArtifact } from "./workflowRunService";
import type { WorkflowBrowserAdapter } from "./workflowDesktopTools";
import { commitWorkflowVersionRepo } from "./workflowVersioning";

type HarnessTraceArtifactsModule = {
  snapshotHarnessWorkspace: (workspacePath: string) => Promise<unknown>;
  writeHarnessTraceArtifacts: (input: Record<string, unknown>) => Promise<unknown>;
};

export function fakeBrowser(targetUrl: string, searchResults: Array<{ title: string; url: string; snippet: string }> = []) {
  return {
    search: vi.fn(async () => searchResults),
    navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: "Dogfood QA Fixture" })),
    content: vi.fn(async () => ({ url: targetUrl, text: "Dogfood QA Fixture\nStatus: ready", links: [] })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(dirname(targetUrl.replace("file://", "")), "qa-fixture.png") })),
    pick: vi.fn(),
  };
}

export const fakeBrowserCredentialSafeStorage: BrowserCredentialSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8"),
};

export async function createPlanEditFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Plan Edit Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list.",
    projectPath: workspacePath,
    phase: "ready_for_review",
    traceMode: "debug",
  });
  const graph = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request", label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call",
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output", label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow", label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow", label: "list" },
    ],
  });
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "plan-edit-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  await writeFile(
    sourcePath,
    [
      "const listSchema = {",
      "  parse(value) {",
      "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
      "    return value;",
      "  }",
      "};",
      "",
      "export default async function run({ workflow, ambient }) {",
      "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
      "    task: 'dogfood.plan_edit_fixture',",
      "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
      "    schema: listSchema,",
      "    cacheKey: ['dogfood', 'plan-edit-fixture'],",
      "    nodeId: 'draft-list'",
      "  }));",
      "  await workflow.checkpoint('readingList', result);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Plan Edit Dogfood Workflow",
    status: "approved",
    manifest: {
      tools: ["ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 2,
      maxModelCalls: 1,
      maxRunMs: 120_000,
    },
    spec: {
      goal: "Call Ambient once to draft a concise local reading list.",
      summary: "Uses one Ambient model call and checkpoints the returned reading list.",
      successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
      inputs: {},
    },
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graph.id,
    sourcePath,
    repoPath: workspacePath,
    gitCommitHash: "plan-edit-dogfood",
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graph.id, artifactId: artifact.id, versionId: version.id };
}

export async function createApplyRestoreFixtureWorkflow(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowAgentThreadSummary({
    title: "Apply Restore Dogfood Workflow",
    initialRequest: "Call Ambient once to draft a concise local reading list, then keep the workflow versioned.",
    projectPath: workspacePath,
    phase: "approved",
    traceMode: "debug",
  });
  store.ensureWorkflowAgentChatThread(thread.id);
  const workflowDir = join(workspacePath, ".ambient-codex", "workflows", "apply-restore-dogfood");
  await mkdir(workflowDir, { recursive: true });
  const sourcePath = join(workflowDir, "main.ts");
  const statePath = join(workflowDir, "state.json");
  const manifest = {
    tools: ["ambient.responses"],
    mutationPolicy: "read_only" as const,
    maxToolCalls: 2,
    maxModelCalls: 1,
    maxRunMs: 120_000,
  };
  const spec = {
    goal: "Call Ambient once to draft a concise local reading list.",
    summary: "Uses one Ambient model call and checkpoints the returned reading list.",
    successCriteria: ["Ambient returns structured JSON", "The workflow writes a readingList checkpoint"],
    inputs: {},
  };
  const graph = {
    summary: "request to Ambient model call to output",
    nodes: [
      { id: "request", type: "request" as const, label: "Request", description: "User asks for a local reading list." },
      {
        id: "draft-list",
        type: "model_call" as const,
        label: "Draft list",
        modelRole: "Draft concise reading-list recommendations.",
        inputSummary: "instruction for a concise reading-list JSON response",
        outputSummary: "JSON object with summary string",
        retryPolicy: "no retry in fixture",
      },
      { id: "output", type: "output" as const, label: "Output", description: "Return the list to the user." },
    ],
    edges: [
      { id: "request-to-draft", source: "request", target: "draft-list", type: "data_flow" as const, label: "prompt" },
      { id: "draft-to-output", source: "draft-list", target: "output", type: "data_flow" as const, label: "list" },
    ],
  };
  const source = [
    "const listSchema = {",
    "  parse(value) {",
    "    if (!value || typeof value.summary !== 'string') throw new Error('Invalid list response.');",
    "    return value;",
    "  }",
    "};",
    "",
    "export default async function run({ workflow, ambient }) {",
    "  const result = await workflow.step('draft-list', { nodeId: 'draft-list' }, () => ambient.call({",
    "    task: 'dogfood.apply_restore_fixture',",
    "    input: { instruction: 'Return JSON with summary:string for a concise reading list.' },",
    "    schema: listSchema,",
    "    cacheKey: ['dogfood', 'apply-restore-fixture'],",
    "    nodeId: 'draft-list'",
    "  }));",
    "  await workflow.checkpoint('readingList', result);",
    "}",
    "",
  ].join("\n");

  await writeFile(join(workflowDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  await writeFile(join(workflowDir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  await writeFile(sourcePath, source, "utf8");
  await writeFile(join(workflowDir, "preview.md"), "# Apply Restore Dogfood Workflow\n", "utf8");
  await writeFile(join(workflowDir, "compile-context.json"), `${JSON.stringify({ fixture: "apply-restore" }, null, 2)}\n`, "utf8");
  const commit = await commitWorkflowVersionRepo({ repoPath: workflowDir, message: "Create apply restore dogfood workflow" });
  const graphSnapshot = store.createWorkflowGraphSnapshot({
    workflowThreadId: thread.id,
    source: "compile",
    summary: graph.summary,
    nodes: graph.nodes,
    edges: graph.edges,
    artifactPath: join(workflowDir, "graph.json"),
  });
  const artifact = store.createWorkflowArtifact({
    workflowThreadId: thread.id,
    title: "Apply Restore Dogfood Workflow",
    status: "approved",
    manifest,
    spec,
    sourcePath,
    statePath,
  });
  const version = store.createWorkflowVersion({
    workflowThreadId: thread.id,
    artifactId: artifact.id,
    graphSnapshotId: graphSnapshot.id,
    sourcePath,
    repoPath: workflowDir,
    gitCommitHash: commit.commitHash,
    status: "approved",
    createdBy: "compiler",
  });
  return { threadId: thread.id, graphId: graphSnapshot.id, artifactId: artifact.id, versionId: version.id, workflowDir };
}

export function fakeResearchBrowser() {
  const results = [
    {
      title: "PagedAttention and vLLM",
      url: "https://example.test/research/pagedattention",
      snippet:
        "PagedAttention stores KV cache in non-contiguous blocks so serving can reduce memory waste and support more concurrent requests.",
    },
    {
      title: "StreamingLLM attention sinks",
      url: "https://example.test/research/streamingllm",
      snippet:
        "StreamingLLM keeps attention sink tokens and recent tokens so long-context generation can continue with a bounded KV cache.",
    },
  ];
  const pages = new Map(
    results.map((result) => [
      result.url,
      [
        result.title,
        result.snippet,
        "Source evidence: KV cache pressure is a primary serving bottleneck for long-context inference.",
        "Operational implication: deterministic workflows should cite which source supported each optimization claim.",
      ].join("\n"),
    ]),
  );
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Research source",
    })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Research source",
      text: pages.get(input.url ?? "") ?? "No page content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "research-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

export function fakeScottsdaleEntertainmentBrowser() {
  const results = [
    {
      title: "Scottsdale Couples Movie Listings",
      url: "https://example.test/scottsdale/couples-movies",
      snippet:
        "This week: romantic drama at Harkins Camelview, late comedy at RoadHouse Cinemas, and a quiet weekday matinee option for date-night planning.",
    },
    {
      title: "Scottsdale Live Shows Calendar",
      url: "https://example.test/scottsdale/live-shows",
      snippet:
        "This week: acoustic jazz at Scottsdale Center for the Performing Arts, an intimate magic show, and a dinner-friendly lounge set.",
    },
    {
      title: "Old Town Scottsdale Date Night Guide",
      url: "https://example.test/scottsdale/date-night",
      snippet: "Neighborhood guide with walkable dinner, movie, and live-entertainment pairings near Old Town Scottsdale.",
    },
  ];
  const pages = new Map([
    [
      "https://example.test/scottsdale/couples-movies",
      [
        "Scottsdale Couples Movie Listings",
        "Current week highlights:",
        "- Harkins Camelview: Moonlit Letters, a romantic drama with reserved seating and post-film dining nearby.",
        "- RoadHouse Cinemas Scottsdale: Late Laughs, an easy comedy pick with in-theater dinner service.",
        "- Matinee option: quiet weekday screening for couples who prefer lower crowds.",
        "Evidence note: movie times should be verified before booking.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/live-shows",
      [
        "Scottsdale Live Shows Calendar",
        "Current week highlights:",
        "- Scottsdale Center for the Performing Arts: Desert Jazz Duo, a seated acoustic show with date-night atmosphere.",
        "- Old Town Lounge: Sunset Standards, a low-volume lounge set suitable for conversation.",
        "- Intimate Magic Room: close-up show near restaurants; ticket availability changes quickly.",
        "Evidence note: live show dates and tickets should be verified before attending.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/date-night",
      [
        "Old Town Scottsdale Date Night Guide",
        "Pair a movie or acoustic show with walkable dinner options.",
        "Prefer venues where conversation is possible and parking is straightforward.",
      ].join("\n"),
    ],
  ]);
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source",
    })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source",
      text: pages.get(input.url ?? "") ?? "No Scottsdale source content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "scottsdale-entertainment-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

export function fakeScottsdaleEntertainmentBrowserWithIntervention() {
  const result = {
    title: "Scottsdale Family Shows Calendar",
    url: "https://example.test/scottsdale/family-shows",
    snippet:
      "Next week: puppet theater, family-friendly magic matinee, and an outdoor kids concert. The source requires browser verification before content loads.",
  };
  const userAction = {
    id: "browser-action-family-shows",
    active: true,
    status: "waiting",
    kind: "captcha",
    provider: "recaptcha",
    toolName: "browser_nav",
    runtime: "chrome",
    profileMode: "copied",
    url: result.url,
    title: "Scottsdale Family Shows - Verify",
    origin: "https://example.test",
    pageExcerpt: "Scottsdale Family Shows Calendar. Complete the CAPTCHA in the managed browser before the source content loads.",
    screenshot: {
      path: join(tmpdir(), "scottsdale-family-shows-verification.png"),
      artifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
      mimeType: "image/png",
      bytes: 14321,
      width: 1200,
      height: 800,
      title: "Scottsdale Family Shows - Verify",
      url: result.url,
    },
    message: "Complete the CAPTCHA in the managed browser, then return to Ambient and continue.",
    startedAt: "2026-05-12T00:00:00.000Z",
    lastCheckedAt: "2026-05-12T00:00:00.000Z",
    canAutoResume: true,
  };
  return {
    search: vi.fn(async () => [result]),
    navigate: vi.fn(async (input: { url: string; userActionId?: string }) => {
      if (input.url === result.url && input.userActionId !== userAction.id) return userAction;
      return { url: input.url, title: result.title };
    }),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: result.title,
      text: [
        "Scottsdale Family Shows Calendar",
        "Next-week child-friendly highlights:",
        "- Puppet Adventures: a 45-minute puppet theater show recommended for ages 3-7.",
        "- Magic Matinee: family-friendly close-up magic with early afternoon seating.",
        "- Kids Concert in the Park: outdoor sing-along with shaded seating and food trucks.",
        "Evidence note: dates and tickets should be verified before attending.",
      ].join("\n"),
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => userAction.screenshot),
    pick: vi.fn(),
  };
}

export function recordingWorkflowBrowser(browserService: BrowserService): {
  browser: WorkflowBrowserAdapter;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    search: [],
    navigate: [],
    content: [],
    evaluate: [],
    screenshot: [],
    pick: [],
  };
  return {
    calls,
    browser: {
      search: async (input) => {
        calls.search.push(input);
        return browserService.search(input);
      },
      navigate: async (input) => {
        calls.navigate.push(input);
        return browserService.navigate(input);
      },
      content: async (input) => {
        calls.content.push(input);
        return browserService.content(input);
      },
      evaluate: async (input) => {
        calls.evaluate.push(input);
        return browserService.evaluate(input);
      },
      screenshot: async (input) => {
        calls.screenshot.push(input);
        return browserService.screenshot(input);
      },
      pick: async (input) => {
        calls.pick.push(input);
        return browserService.pick(input);
      },
    },
  };
}

export async function createManagedBrowserChallengeServer(): Promise<{
  url: string;
  hits: { shows: number };
  close: () => Promise<void>;
}> {
  const hits = { shows: 0 };
  const server: Server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "/";
    if (path !== "/shows") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    hits.shows += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Verify you are human</title>
    <script>
      function whenBodyReady(fn) {
        if (document.body) {
          fn();
          return;
        }
        window.addEventListener("DOMContentLoaded", fn, { once: true });
      }
      function renderReady() {
        document.title = "Scottsdale Managed Browser Shows Ready";
        document.body.innerHTML = [
          "<main>",
          "<h1>Scottsdale family-friendly live shows next week</h1>",
          "<p>This page is the unlocked managed-browser dogfood source.</p>",
          "<article><h2>Puppet Adventures</h2><p>Recommended ages 3-7. A 45-minute puppet theater matinee with reserved seating.</p></article>",
          "<article><h2>Magic Matinee</h2><p>Family-friendly close-up magic in early afternoon time slots.</p></article>",
          "<article><h2>Kids Concert in the Park</h2><p>Outdoor sing-along with shaded seating and food trucks.</p></article>",
          "<p>Evidence note: dates and tickets should be verified before attending.</p>",
          "</main>"
        ].join("");
      }
      if (window.localStorage.getItem("ambientDogfoodHuman") === "1") {
        whenBodyReady(renderReady);
      } else {
        window.addEventListener("DOMContentLoaded", function () {
          setTimeout(function () {
            window.localStorage.setItem("ambientDogfoodHuman", "1");
            renderReady();
          }, 2200);
        });
      }
    </script>
  </head>
  <body>
    <main>
      <h1>Verify you are human</h1>
      <p>Complete the CAPTCHA-style human verification in the managed browser to continue.</p>
      <p>This is a deterministic human-verification interstitial for Ambient workflow dogfooding.</p>
    </main>
  </body>
</html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/shows`,
    hits,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function liveAmbientApiKey(): string {
  return readLiveAmbientProviderApiKey({ purpose: "live Workflow Agent dogfood" });
}

export function liveAmbientBaseUrl(): string | undefined {
  return liveAmbientProviderBaseUrl();
}

export function liveWorkflowModel(preferredModelEnvNames: string[] = ["AMBIENT_WORKFLOW_MODEL", "AMBIENT_LIVE_MODEL"]): string {
  return liveAmbientProviderModel({ preferredModelEnvNames, fallbackModel: AMBIENT_DEFAULT_MODEL });
}

export function liveGmailConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.gmail": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export function liveCalendarConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.calendar": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export function liveDriveConnectorOptions(accountHint: string): GoogleWorkspaceConnectorDescriptorOptions {
  return {
    adapter: "gws",
    states: {
      "google.drive": {
        status: "available",
        accounts: [{ id: accountHint, label: accountHint }],
      },
    },
  };
}

export async function runWorkflowApprovingReviews(input: {
  store: ProjectStore;
  artifactId: string;
  workspacePath: string;
  adapter: GoogleWorkspaceCliAdapter;
  connectorOptions: GoogleWorkspaceConnectorDescriptorOptions;
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerRequestTimeoutMs: number;
  maxApprovalRounds: number;
}): Promise<WorkflowDashboard> {
  const connectorRegistrations = googleWorkspaceConnectorRegistrations({ sidecar: input.adapter }, input.connectorOptions);
  let dashboard = await runWorkflowArtifact({
    store: input.store,
    artifactId: input.artifactId,
    workspacePath: input.workspacePath,
    permissionMode: "full-access",
    connectorRegistrations,
    connectorApprovalDecision: () => "approved",
    model: input.model,
    baseUrl: input.baseUrl,
    ambientProvider: new AmbientWorkflowRunProvider({
      model: input.model,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
      idleTimeoutMs: 90_000,
      absoluteTimeoutMs: input.providerRequestTimeoutMs,
      enforceAbsoluteTimeout: true,
    }),
  });
  for (let round = 0; round < input.maxApprovalRounds; round += 1) {
    const run = latestRunForArtifact(dashboard, input.artifactId);
    if (run.status !== "paused") return dashboard;
    const approved = approvePendingWorkflowReviews(input.store, run.id);
    if (approved === 0) throw new Error(`Workflow paused without pending approvals: ${run.id}`);
    dashboard = await runWorkflowArtifact({
      store: input.store,
      artifactId: input.artifactId,
      workspacePath: input.workspacePath,
      permissionMode: "full-access",
      connectorRegistrations,
      connectorApprovalDecision: () => "approved",
      model: input.model,
      baseUrl: input.baseUrl,
      resumeFromRunId: run.id,
      ambientProvider: new AmbientWorkflowRunProvider({
        model: input.model,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        workflowThreadId: input.store.getWorkflowArtifact(input.artifactId).workflowThreadId,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: input.providerRequestTimeoutMs,
        enforceAbsoluteTimeout: true,
      }),
    });
  }
  return dashboard;
}

export function approvePendingWorkflowReviews(store: ProjectStore, runId: string): number {
  const events = store.listWorkflowRunEvents(runId);
  const requiredById = new Map(
    events
      .filter((event) => event.type === "approval.required" || event.type === "connector.review.required")
      .map((event) => [typeof event.data?.id === "string" ? event.data.id : "", event]),
  );
  const approvals = workflowApprovalsFromEvents(events).filter((approval) => approval.status === "pending");
  for (const approval of approvals) {
    const required = requiredById.get(approval.id);
    const type = required?.type === "approval.required" ? "approval.approved" : "connector.review.approved";
    store.appendWorkflowRunEvent({
      runId,
      type,
      message: approval.id,
      data: { id: approval.id, changeSet: approval.changeSet, source: "live-dogfood" },
    });
  }
  return approvals.length;
}

export function latestRunForArtifact(dashboard: WorkflowDashboard, artifactId: string): WorkflowRunSummary {
  const run = dashboard.runs.find((candidate) => candidate.artifactId === artifactId);
  if (!run) throw new Error(`No workflow run found for artifact ${artifactId}.`);
  return run;
}

export function eventCountsByType(events: WorkflowRunEvent[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

export function requiredWorkflowApprovalId(store: ProjectStore, runId: string): string {
  const id = store
    .listWorkflowRunEvents(runId)
    .find((event) => event.type === "approval.required" || event.type === "connector.review.required")?.data?.id;
  if (typeof id !== "string") throw new Error(`Missing workflow approval event for run ${runId}.`);
  return id;
}

export function fixtureCodexMcpPlugin(rootPath: string): CodexPluginSummary {
  return {
    id: "marketplace:ambient-fixture",
    name: "ambient-fixture",
    version: "0.1.0",
    description: "Fixture plugin used by Workflow Agent MCP dogfood.",
    marketplaceName: "Ambient Fixture",
    marketplacePath: join(dirname(rootPath), ".agents", "plugins", "marketplace.json"),
    rootPath,
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [{ name: "ambient-fixture", command: "node", args: ["./scripts/fixture-mcp.js"], envKeys: [] }],
    enabled: true,
    trusted: true,
    errors: [],
  };
}

export function sequenceExplorationProvider(actions: WorkflowExplorationAction[]): WorkflowExplorationProvider {
  let index = 0;
  return {
    next: async () => {
      const action = actions[index];
      index += 1;
      if (!action) throw new Error("No more exploration actions.");
      return action;
    },
  };
}

export async function writeLiveGmailRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeGmailGrantReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-gmail-grant-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeGraphFirstReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-graph-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function snapshotHarnessWorkspaceIfEnabled(workspacePath: string): Promise<unknown | undefined> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR) return undefined;
  const { snapshotHarnessWorkspace } = await importHarnessTraceArtifacts();
  return snapshotHarnessWorkspace(workspacePath);
}

export async function writeWorkflowGraphReviewHarnessTrace(
  workspacePath: string,
  beforeWorkspace: unknown | undefined,
  review: unknown,
): Promise<void> {
  if (!process.env.AMBIENT_HARNESS_TRACE_DIR || !beforeWorkspace) return;
  const { writeHarnessTraceArtifacts } = await importHarnessTraceArtifacts();
  await writeHarnessTraceArtifacts({
    workspace: workspacePath,
    beforeWorkspace,
    summary: {
      status: review ? "passed" : "failed",
      task: "workflow-graph-review",
      review,
    },
  });
}

export async function importHarnessTraceArtifacts(): Promise<HarnessTraceArtifactsModule> {
  return import(pathToFileURL(join(process.cwd(), "scripts", "harness-trace-artifacts.mjs")).href) as Promise<HarnessTraceArtifactsModule>;
}

export async function writeRetentionTraceDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-retention-trace-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalFileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-file-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalDirectoryRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-directory-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLocalImageRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-local-image-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserResearchRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-research-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserExplorationReviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-exploration-review-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeBrowserInterventionRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-browser-intervention-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeManagedBrowserInterventionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-managed-browser-intervention-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeExternalManagedBrowserDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-external-managed-browser-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeArtifactReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-artifact-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeMutationReviewRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-mutation-review-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditActionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-action-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditPreviewDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-preview-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditRunVersionDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-run-version-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePlanEditApplyRestoreDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plan-edit-apply-restore-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writePluginMcpRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-plugin-mcp-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeExplorationToDeterministicDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-exploration-deterministic-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCapabilityAwareDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCapabilityAwareAmbientCliDiscoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-capability-aware-ambient-cli-discovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeAmbientCliExplorationCompileRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-ambient-cli-exploration-compile-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeRecoveryActionsDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-recovery-actions-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeRuntimeComposerDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-runtime-composer-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeLiveDebugRewriteDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-live-debug-rewrite-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeScheduledCalendarRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-calendar-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeScheduledLocalTimeoutRecoveryDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-scheduled-local-timeout-recovery-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeDriveRunDogfoodArtifact(value: unknown): Promise<void> {
  const dir = join(process.cwd(), "test-results", "workflow-drive-run-dogfood");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function scottsdaleWeekendRequest(): string {
  return [
    "Find weekend activities in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that searches for current weekend activities, collects candidate events or places, asks Ambient to rank a concise shortlist, and checkpoints the evidence.",
    "The workflow should be safe to run repeatedly and should leave an audit trail with search inputs, result summaries, and the ranked plan.",
  ].join(" ");
}

export function scottsdaleFamilyActivitiesRequest(): string {
  return [
    "Research activities suitable for a 4 year old girl that are occurring in the next week in Scottsdale Arizona.",
    "Build a read-only, repeatable workflow that identifies current family-friendly activities, records source evidence, asks Ambient to rank or summarize options, and clearly notes when real-time web or event-listing data is unavailable.",
    "The workflow should be safe to rerun and should retain enough trace data to debug provider/compiler behavior.",
  ].join(" ");
}

export function dogfoodNodeId(prefix: string, value: string, index: number): string {
  const normalized = value
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96)
    .replace(/[-_.:]+$/, "");
  return `${prefix}-${index + 1}${normalized ? `-${normalized}` : ""}`;
}

export async function createLocalDownloadsFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-fixture-"));
  await mkdir(join(root, "Invoices"), { recursive: true });
  await mkdir(join(root, "Irish music sets"), { recursive: true });
  await mkdir(join(root, "Project exports"), { recursive: true });
  await writeFile(join(root, "Resume draft.pdf"), "fixture pdf placeholder\n", "utf8");
  await writeFile(join(root, "Invoices", "2026-05 vendor receipt.txt"), "Vendor receipt for office supplies.\n", "utf8");
  await writeFile(join(root, "Irish music sets", "scottsdale-celtic-lineup.md"), "# Upcoming folk and Celtic shows\n", "utf8");
  await writeFile(join(root, "Project exports", "workflow-compiler-notes.txt"), "Workflow compiler investigation notes.\n", "utf8");
  await writeFile(join(root, ".hidden-local-token.txt"), "hidden fixture file should not be listed by default.\n", "utf8");
  await writeFile(join(root, "secret-api-key.txt"), "secret-like fixture should be skipped by local directory policy.\n", "utf8");
  return root;
}

export async function createLocalDownloadsImageFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ambient-downloads-image-fixture-"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  const names = [
    "01-ui-screenshot.png",
    "02-receipt-photo.png",
    "03-travel-snapshot.png",
    "04-whiteboard-diagram.png",
    "05-product-label.png",
    "06-map-crop.png",
    "07-event-poster.png",
    "08-form-scan.png",
    "09-chart-export.png",
    "10-reference-design.png",
  ];
  for (const name of names) await writeFile(join(root, name), png);
  return root;
}

export function fakeMiniCpmVision() {
  return {
    setupMiniCpm: vi.fn(
      async (_workspacePath: string, input: MiniCpmVisionSetupInput): Promise<MiniCpmVisionSetupResult> => ({
        provider: "minicpm-v",
        action: input.action ?? "validate",
        status: "ready",
        packageName: "ambient-minicpm-v-vision",
        installStatuses: [],
        runtimeCandidates: [],
        validation: {
          schemaVersion: "ambient-minicpm-v-provider-validation-v1",
          provider: "minicpm-v",
          packageName: "ambient-minicpm-v-vision",
          status: "passed",
          updatedAt: new Date("2026-05-16T00:00:00.000Z").toISOString(),
          platform: "fixture",
          arch: "fixture",
          lane: "fixture",
          missingHints: [],
        },
        diagnostics: [],
        nextSteps: [],
      }),
    ),
    analyzeMiniCpm: vi.fn(async (_workspacePath: string, input: MiniCpmVisionAnalyzeInput): Promise<MiniCpmVisionAnalysisResult> => {
      const imagePath = input.image?.path ?? input.imagePath ?? "unknown-image.png";
      const basename = imagePath.split(/[\\/]/).pop() ?? imagePath;
      return {
        provider: "minicpm-v",
        status: "passed",
        packageName: "ambient-minicpm-v-vision",
        task: input.task ?? "image_description",
        prompt: input.prompt ?? "fixture prompt",
        model: "fixture-minicpm",
        durationMs: 1,
        summary: `MiniCPM fixture analysis for ${basename}`,
        observations: [
          {
            kind: "uncertainty",
            description: `Fixture visual observation for ${basename}`,
            confidence: "low",
            evidence: imagePath,
          },
        ],
        limitations: ["Fixture MiniCPM runner did not inspect pixels."],
        image: {
          path: imagePath,
          basename,
          bytes: 67,
          sha256: "b".repeat(64),
          source: input.image?.source ?? "external_file",
          label: input.image?.label,
          copiedFromExternalPath: Boolean(input.allowExternalMediaPaths || input.allowExternalImagePaths),
        },
        artifacts: { jsonPath: input.outputJsonPath ?? `workflow-vision/${basename}.json` },
        installStatuses: [],
        commands: [],
        validation: { valid: true, errors: [] },
        redaction: {
          returnedImagePathIsWorkspaceRelative: false,
          stdoutDoesNotContainAbsoluteImagePath: true,
          artifactPathIsWorkspaceRelative: true,
        },
      };
    }),
  };
}

export function localDirectoryClassificationCompilerOutput(directoryPath: string) {
  return {
    version: 1,
    title: "Local Downloads Classification Dogfood",
    goal: "Review a user-approved local Downloads-style directory and classify visible entries into a concise set of categories.",
    summary:
      "Lists bounded local directory metadata, asks Ambient to classify the entries, and checkpoints the classification with directory provenance.",
    successCriteria: [
      "The workflow uses local_directory_list instead of Google Drive or shell",
      "Hidden and secret-like paths are not required for classification",
      "Ambient returns up to seven categories with evidence from visible directory metadata",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-local-downloads",
        kind: "tool.call" as const,
        label: "List local Downloads fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 200, maxDepth: 2, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      {
        id: "classify-local-downloads",
        kind: "model.call" as const,
        dependsOn: ["list-local-downloads"],
        task: "dogfood.local_downloads_classification",
        input: {
          instruction:
            "Return JSON with summary:string and categories:array. Use at most seven categories. Base the categories only on visible directory metadata, and mention skipped hidden or secret-like paths only as safety exclusions.",
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          truncated: { fromNode: "list-local-downloads", path: "truncated" },
        },
        output: { schema: { summary: "string", categories: "array" } },
      },
      {
        id: "local-directory-classification-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-local-downloads"],
        key: "localDirectoryClassification",
        value: {
          directory: { fromNode: "list-local-downloads", path: "rootPath" },
          entries: { fromNode: "list-local-downloads", path: "entries" },
          skipped: { fromNode: "list-local-downloads", path: "skipped" },
          classification: { fromNode: "classify-local-downloads" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-directory-classification-checkpoint"],
        value: { localDirectoryClassification: { fromNode: "local-directory-classification-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function localImageCategorizationCompilerOutput(directoryPath: string) {
  const imageAnalysisNodes = Array.from({ length: 10 }, (_, index) => {
    const imageNumber = index + 1;
    return {
      id: `analyze-downloads-image-${imageNumber}`,
      kind: "tool.call" as const,
      label: `Analyze Downloads image ${imageNumber}`,
      tool: "ambient_visual_analyze",
      dependsOn: ["list-downloads-images"],
      args: {
        image: {
          path: { fromNode: "list-downloads-images", path: `entries.${index}.absolutePath` },
          label: { fromNode: "list-downloads-images", path: `entries.${index}.name` },
          source: "external_file",
        },
        task: "image_description",
        prompt: "Describe visible subject matter and safe categorization cues for this image. Do not infer hidden content.",
        outputJsonPath: `workflow-vision/downloads-image-${imageNumber}.json`,
        allowExternalMediaPaths: true,
      },
      output: { type: "minicpmVisualAnalysis" },
    };
  });
  return {
    version: 1,
    title: "Local Downloads Image Categorization Dogfood",
    goal: "Categorize exactly 10 images from a user-approved local Downloads-style directory using MiniCPM-V visual evidence.",
    summary:
      "Lists bounded local image metadata, analyzes 10 image files with MiniCPM-V, asks Ambient to categorize the visual evidence, and checkpoints the result.",
    successCriteria: [
      "The workflow uses local_directory_list for the local folder inventory",
      "The workflow uses ambient_visual_analyze for MiniCPM-V visual evidence",
      "The workflow does not route local images through Google Drive, shell, raw ambient_cli, or a generic external LLM provider",
    ],
    inputs: { directoryPath },
    nodes: [
      {
        id: "list-downloads-images",
        kind: "tool.call" as const,
        label: "List local Downloads image fixture",
        tool: "local_directory_list",
        args: { path: directoryPath, maxEntries: 300, maxDepth: 1, includeHidden: false },
        output: { type: "localDirectoryListResult" },
      },
      ...imageAnalysisNodes,
      {
        id: "categorize-downloads-images",
        kind: "model.call" as const,
        dependsOn: imageAnalysisNodes.map((node) => node.id),
        task: "dogfood.local_downloads_image_categorization",
        input: {
          instruction:
            "Categorize exactly 10 local Downloads images from MiniCPM-V visual observations. Return summary:string, categories:array, assignments:array, and uncertaintyNotes:array.",
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          entries: { fromNode: "list-downloads-images", path: "entries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
        },
        output: { schema: { summary: "string", categories: "array", assignments: "array", uncertaintyNotes: "array" } },
      },
      {
        id: "local-image-categorization-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["categorize-downloads-images"],
        key: "localImageCategorization",
        value: {
          directory: { fromNode: "list-downloads-images", path: "rootPath" },
          images: { fromNode: "list-downloads-images", path: "entries" },
          visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
          imageCategories: { fromNode: "categorize-downloads-images" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-image-categorization-checkpoint"],
        value: { localImageCategorization: { fromNode: "local-image-categorization-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 11, maxModelCalls: 1, maxRunMs: 900_000 },
    openQuestions: [],
  };
}

export function localFileReportCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Local File Report Dogfood",
    goal: "Read local workspace notes and synthesize a concise planning report.",
    summary: "Reads local text files, asks Ambient to summarize the evidence, and checkpoints the report.",
    successCriteria: [
      "All files are read through file_read",
      "Ambient produces a report",
      "The report is checkpointed with file provenance",
    ],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "local-file-report",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.local_file_report",
        input: {
          instruction:
            "Return JSON with report:string and files:string[]. Summarize the planning implications, mention registration/travel constraints when present, and cite the file paths.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
          })),
        },
        output: { schema: { report: "string", files: "array" } },
      },
      {
        id: "local-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["local-file-report"],
        key: "localFileReport",
        value: { files: paths, report: { fromNode: "local-file-report" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["local-file-report-checkpoint"],
        value: { localFileReport: { fromNode: "local-file-report-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function scheduledLocalFileTimeoutRecoveryCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-scheduled-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
    output: { type: "fileReadResult" },
  }));
  return {
    version: 1,
    title: "Scheduled Local File Timeout Recovery Dogfood",
    goal: "Read a local directory on a schedule, recover from a one-off timeout, and produce a compact HTML classification report.",
    summary:
      "Checkpoints normalized local-file evidence before a bounded preparation step and live Ambient classification, so a scheduled timeout can resume without rereading the files.",
    successCriteria: [
      "Local evidence is checkpointed before the recoverable timeout",
      "A resumed run keeps the schedule linkage",
      "Ambient produces a compact HTML report",
    ],
    inputs: { paths },
    nodes: [
      ...readNodes,
      {
        id: "scheduled-local-evidence",
        kind: "checkpoint.write" as const,
        label: "Checkpoint local evidence",
        dependsOn: readNodes.map((node) => node.id),
        key: "scheduledLocalEvidence",
        resumeKey: "scheduledLocalEvidence",
        value: {
          files: readNodes.map((node, index) => ({
            path: paths[index],
            content: { fromNode: node.id, path: "content" },
            truncated: { fromNode: node.id, path: "truncated" },
            kind: { fromNode: node.id, path: "kind" },
          })),
        },
      },
      {
        id: "scheduled-timeout-probe",
        kind: "tool.call" as const,
        label: "wait for scheduled watchdog",
        dependsOn: ["scheduled-local-evidence"],
        tool: "bash",
        args: { command: "sleep 2" },
        resumeKey: "scheduledTimeoutProbe",
        output: { type: "bashResult" },
      },
      {
        id: "classify-files",
        kind: "model.call" as const,
        label: "Classify files",
        dependsOn: ["scheduled-timeout-probe", "scheduled-local-evidence"],
        task: "dogfood.scheduled_local_report",
        input: {
          instruction:
            "Return JSON with summary:string, html:string, files:string[]. Classify each file by likely workflow category, mention concrete evidence from the content, and keep html compact.",
          files: { fromNode: "scheduled-local-evidence", path: "files" },
        },
        output: { schema: { summary: "string", html: "string", files: "array" } },
      },
      {
        id: "scheduled-local-report",
        kind: "checkpoint.write" as const,
        label: "Checkpoint report",
        dependsOn: ["classify-files"],
        key: "scheduledLocalReport",
        value: { files: paths, report: { fromNode: "classify-files" } },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scheduled local report ready.",
        dependsOn: ["scheduled-local-report"],
        value: {
          format: "html",
          summary: { fromNode: "classify-files", path: "summary" },
          html: { fromNode: "classify-files", path: "html" },
          artifactPath: "reports/scheduled-local-report.html",
        },
      },
    ],
    budgets: { maxToolCalls: paths.length + 1, maxModelCalls: 1, maxRunMs: 180_000 },
    previewSummary: "Schedule local-file classification, recover from timeout, and render an HTML report.",
    dryRunStrategy: "Dry run reads the same local files and records checkpoint/output structure without external mutations.",
    openQuestions: [],
  };
}

export function browserResearchCompilerOutput(query: string) {
  const urls = ["https://example.test/research/pagedattention", "https://example.test/research/streamingllm"];
  return {
    version: 1,
    title: "Browser Research Dogfood",
    goal: "Research KV cache optimization techniques using browser source evidence and synthesize a cited report.",
    summary:
      "Searches browser sources, opens two deterministic source URLs, reads page content, asks Ambient to synthesize a compact cited report, and checkpoints the result.",
    successCriteria: [
      "Browser search returns source candidates",
      "Two sources are opened and read through browser tools",
      "Ambient produces a cited report",
      "The checkpoint includes source URLs and report output",
    ],
    inputs: { query },
    nodes: [
      {
        id: "search-browser-research-sources",
        kind: "tool.call" as const,
        label: "search browser research sources",
        tool: "browser_search",
        args: { query, maxResults: 5, fetchContent: false },
      },
      ...urls.flatMap((url, index) => [
        {
          id: `open-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `open source ${index + 1}`,
          tool: "browser_nav",
          dependsOn: ["search-browser-research-sources"],
          args: { url },
        },
        {
          id: `read-source-${index + 1}`,
          kind: "tool.call" as const,
          label: `read source ${index + 1}`,
          tool: "browser_content",
          dependsOn: [`open-source-${index + 1}`],
          args: { url },
        },
      ]),
      {
        id: "browser-research-report",
        kind: "model.call" as const,
        dependsOn: ["search-browser-research-sources", "read-source-1", "read-source-2"],
        task: "dogfood.browser_research_report",
        input: {
          instruction:
            "Return JSON with report:string and sources:string[]. Summarize the techniques, mention tradeoffs, and cite the provided source URLs. Do not invent additional sources.",
          query,
          searchResults: { fromNode: "search-browser-research-sources" },
          pages: urls.map((url, index) => ({
            url,
            page: { fromNode: `open-source-${index + 1}` },
            content: { fromNode: `read-source-${index + 1}`, path: "text" },
          })),
        },
        output: { schema: { report: "string", sources: "array" } },
      },
      {
        id: "browser-research-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["browser-research-report"],
        key: "browserResearchReport",
        value: { query, sources: urls, report: { fromNode: "browser-research-report" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["browser-research-checkpoint"],
        value: { browserResearchReport: { fromNode: "browser-research-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 8, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function browserExplorationReviewCompilerOutput(query: string) {
  return {
    title: "Scottsdale Couples Entertainment Browser Review",
    spec: {
      goal: "Find current Scottsdale couples entertainment sources, pause for user feedback, and produce a final rendered report.",
      summary:
        "Uses the exploration-observed browser search/content pattern, checkpoints normalized source evidence, asks Ambient for a source-backed shortlist, pauses with an HTML review artifact, then produces final recommendations from user feedback.",
      successCriteria: [
        "Compiler prompt includes retained exploration trace evidence",
        "Browser calls are bounded to one search and two source pages during the deterministic run",
        "The source shortlist review gate includes an HTML artifact and source context",
        "Final output renders as HTML/Markdown cards rather than raw JSON",
      ],
      inputs: {
        query,
        shortlistArtifactPath: "reports/scottsdale-entertainment-shortlist.html",
        finalArtifactPath: "reports/scottsdale-entertainment-final.html",
      },
    },
    manifest: {
      tools: ["browser_search", "browser_nav", "browser_content", "ambient.responses"],
      mutationPolicy: "read_only",
      maxToolCalls: 5,
      maxModelCalls: 2,
      maxRunMs: 360_000,
    },
    graph: {
      summary: "Request -> browser search -> read source pages -> Ambient shortlist -> user review -> final report.",
      nodes: [
        {
          id: "request",
          type: "request",
          label: "Entertainment request",
          description: "User asks for current couples-friendly movies and live shows in Scottsdale.",
        },
        {
          id: "search-sources",
          type: "data_source",
          label: "Search entertainment sources",
          description: "Run one bounded browser search for current Scottsdale entertainment evidence.",
          toolNames: ["browser_search"],
        },
        {
          id: "read-source-pages",
          type: "data_source",
          label: "Read top sources",
          description: "Open and read two selected source pages in the same managed browser adapter.",
          toolNames: ["browser_nav", "browser_content"],
        },
        {
          id: "draft-shortlist",
          type: "model_call",
          label: "Draft source shortlist",
          modelRole: "Turn browser evidence into a concise, source-backed shortlist for user review.",
          inputSummary: "Search result cards plus bounded page text from two Scottsdale entertainment sources.",
          outputSummary: "Draft picks, sources, HTML preview, markdown preview, and summary.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains source evidence and model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        {
          id: "review-shortlist",
          type: "review_gate",
          label: "Review shortlist",
          description: "Pause with an artifact-backed shortlist and collect qualitative user feedback.",
          reviewPolicy: "Resume from the same source evidence and draft shortlist with user feedback applied.",
        },
        {
          id: "final-recommendations",
          type: "model_call",
          label: "Final recommendations",
          modelRole: "Apply user feedback and produce a readable final entertainment report.",
          inputSummary: "Draft shortlist, browser provenance, and runtime user feedback.",
          outputSummary: "Final HTML/Markdown recommendations with source notes.",
          retryPolicy: "Retry once when structured output validation fails.",
          retentionPolicy: "Debug trace retains final model output for dogfood inspection.",
          toolNames: ["ambient.responses"],
        },
        {
          id: "output",
          type: "output",
          label: "Rendered report",
          description: "Checkpoint and emit the final rendered recommendation artifact.",
        },
      ],
      edges: [
        { id: "request-search", source: "request", target: "search-sources", type: "control_flow", label: "needs current listings" },
        { id: "search-read", source: "search-sources", target: "read-source-pages", type: "data_flow", label: "top sources" },
        { id: "read-draft", source: "read-source-pages", target: "draft-shortlist", type: "data_flow", label: "source evidence" },
        { id: "draft-review", source: "draft-shortlist", target: "review-shortlist", type: "control_flow", label: "ask user" },
        { id: "review-final", source: "review-shortlist", target: "final-recommendations", type: "data_flow", label: "feedback" },
        { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow", label: "report" },
      ],
    },
    source: `
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizePick(item, index) {
  return {
    title: typeof item?.title === "string" ? item.title : "Pick " + (index + 1),
    kind: typeof item?.kind === "string" ? item.kind : "entertainment",
    venue: typeof item?.venue === "string" ? item.venue : "Scottsdale",
    timing: typeof item?.timing === "string" ? item.timing : "This week",
    whyCouplesFriendly: typeof item?.whyCouplesFriendly === "string" ? item.whyCouplesFriendly : "Good date-night fit.",
    sourceUrl: typeof item?.sourceUrl === "string" ? item.sourceUrl : ""
  };
}

function renderHtml(picks, heading, summary) {
  return [
    "<!doctype html>",
    "<html><body>",
    "<h1>" + escapeHtml(heading) + "</h1>",
    "<p>" + escapeHtml(summary) + "</p>",
    "<section>",
    ...picks.map((pick) => [
      "<article>",
      "<h2>" + escapeHtml(pick.title) + "</h2>",
      "<p><strong>Type:</strong> " + escapeHtml(pick.kind) + " · <strong>Venue:</strong> " + escapeHtml(pick.venue) + " · <strong>Timing:</strong> " + escapeHtml(pick.timing) + "</p>",
      "<p>" + escapeHtml(pick.whyCouplesFriendly) + "</p>",
      pick.sourceUrl ? "<p><small>Source: " + escapeHtml(pick.sourceUrl) + "</small></p>" : "",
      "</article>"
    ].join("\\n")),
    "</section>",
    "</body></html>"
  ].join("\\n");
}

function renderMarkdown(picks, heading, summary) {
  return [
    "# " + heading,
    "",
    summary,
    "",
    ...picks.map((pick) => "- " + pick.title + " (" + pick.kind + ", " + pick.venue + "): " + pick.whyCouplesFriendly + (pick.sourceUrl ? " Source: " + pick.sourceUrl : ""))
  ].join("\\n");
}

const shortlistSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Browser source shortlist must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Draft Scottsdale entertainment shortlist is ready for review.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Scottsdale couples entertainment shortlist", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Scottsdale couples entertainment shortlist", summary)
    };
  }
};

const finalSchema = {
  parse(value) {
    if (!value || !Array.isArray(value.picks)) {
      throw new Error("Final browser recommendations must include picks[].");
    }
    const picks = value.picks.map(normalizePick);
    const summary = typeof value.summary === "string" ? value.summary : "Final Scottsdale couples entertainment recommendations.";
    return {
      summary,
      picks,
      sources: Array.isArray(value.sources) ? value.sources : [],
      artifactPath: "reports/scottsdale-entertainment-final.html",
      html: typeof value.html === "string" ? value.html : renderHtml(picks, "Best Scottsdale movies and live shows for couples this week", summary),
      markdown: typeof value.markdown === "string" ? value.markdown : renderMarkdown(picks, "Best Scottsdale movies and live shows for couples this week", summary)
    };
  }
};

export default async function run({ workflow, tools, ambient }) {
  const query = ${JSON.stringify(query)};
  const sourceEvidence = await workflow.resumePoint("sourceEvidence", async () => {
    const results = await workflow.step("search current entertainment sources", { nodeId: "search-sources" }, () =>
      tools.browser_search({ query, maxResults: 5, fetchContent: false })
    );
    const selected = Array.isArray(results) ? results.slice(0, 2) : [];
    const sources = [];
    for (const result of selected) {
      await workflow.step("open " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_nav({ url: result.url }));
      const page = await workflow.step("read " + result.url, { nodeId: "read-source-pages" }, () => tools.browser_content({ url: result.url }));
      sources.push({
        title: String(result.title ?? page.title ?? "Source"),
        url: String(result.url ?? page.url ?? ""),
        snippet: String(result.snippet ?? "").slice(0, 600),
        text: String(page.text ?? "").slice(0, 4000),
        textTruncated: Boolean(page.textTruncated)
      });
    }
    return { query, results: selected, sources };
  });

  const draft = await workflow.resumePoint("draftShortlist", async () => {
    const shortlist = await ambient.call({
      task: "dogfood.browser_source_shortlist",
      nodeId: "draft-shortlist",
      input: {
        instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Use only provided browser evidence. Include at least one movie and one live show when source evidence supports it. Keep the HTML concise and readable.",
        query,
        sources: sourceEvidence.sources
      },
      schema: shortlistSchema,
      cacheKey: ["dogfood", "browser_source_shortlist", query]
    });
    return shortlist;
  });

  const answer = await workflow.askUser(
    "Review the Scottsdale entertainment shortlist. What should change before final recommendations?",
    {
      choices: [
        { id: "approve", label: "Looks right", description: "Use the source-backed shortlist as-is." },
        { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." }
      ],
      allowFreeform: true,
      data: {
        report: {
          title: "Source shortlist",
          artifactPath: "reports/scottsdale-entertainment-shortlist.html",
          html: draft.html,
          markdown: draft.markdown
        },
        sources: sourceEvidence.sources.map((source) => ({ title: source.title, url: source.url, snippet: source.snippet })),
        summary: draft.summary
      }
    },
    { nodeId: "review-shortlist" }
  );

  const final = await ambient.call({
    task: "dogfood.browser_final_recommendations",
    nodeId: "final-recommendations",
    input: {
      instruction: "Return JSON with summary:string, picks:[{title,kind,venue,timing,whyCouplesFriendly,sourceUrl}], sources:string[], html:string, and markdown:string. Apply user feedback. The report must be readable HTML and should mention that listings/times should be verified before booking.",
      query,
      sourceEvidence,
      draft,
      userFeedback: { choiceId: answer.choiceId, text: answer.text }
    },
    schema: finalSchema,
    cacheKey: ["dogfood", "browser_final_recommendations", query, answer.choiceId ?? "", answer.text ?? ""]
  });

  await workflow.checkpoint("final_output", final);
  await workflow.emit({
    type: "workflow.output.ready",
    message: "Scottsdale couples entertainment recommendations are ready.",
    graphNodeId: "output",
    data: { artifactPath: final.artifactPath, html: final.html, markdown: final.markdown, summary: final.summary, picks: final.picks, sources: final.sources }
  });
}
`,
    previewSummary: "Compile from browser exploration into a bounded browser workflow with a reviewable shortlist artifact.",
    dryRunStrategy: "Dry run repeats the bounded browser search/read shape and pauses with the same source shortlist review artifact.",
    openQuestions: [],
  };
}

export function browserInterventionRecoveryCompilerOutput(query: string) {
  return {
    version: 1,
    title: "Scottsdale Family Shows Browser Intervention Recovery",
    goal: "Find child-friendly Scottsdale live shows, pause if browser verification blocks the source page, then resume into a rendered report.",
    summary:
      "Searches current Scottsdale family-show sources, checkpoints search evidence, uses a first-class browser.intervention node for user-action handoff and same-session retry, then asks Ambient to produce a readable report.",
    successCriteria: [
      "Search results are checkpointed before any browser intervention pause",
      "Browser user-action state becomes a runtime input card with bounded context",
      "Resume retries the same browser operation with the preserved userActionId instead of repeating search",
      "Final output is a rendered HTML/Markdown card rather than raw JSON",
    ],
    inputs: { query, finalArtifactPath: "reports/scottsdale-family-shows.html" },
    nodes: [
      {
        id: "search-sources",
        kind: "tool.call" as const,
        label: "Search current sources",
        tool: "browser_search",
        args: { query, maxResults: 4, fetchContent: false },
        output: { type: "browserSearchResults" },
      },
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Browser intervention",
        dependsOn: ["search-sources"],
        tool: "browser_nav" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          {
            id: "skip",
            label: "Skip this source",
            description: "Continue without this source if browser verification cannot be completed.",
          },
        ],
        allowFreeform: true,
        output: { type: "browserInterventionEvidence" },
      },
      {
        id: "read-source-pages",
        kind: "browser.intervention" as const,
        label: "Read source page",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: { fromNode: "search-sources", path: "0.url" } },
        source: {
          title: { fromNode: "search-sources", path: "0.title" },
          url: { fromNode: "search-sources", path: "0.url" },
          snippet: { fromNode: "search-sources", path: "0.snippet" },
        },
        prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
        choices: [
          { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
          {
            id: "skip",
            label: "Skip this source",
            description: "Continue without this source if browser verification cannot be completed.",
          },
        ],
        allowFreeform: true,
        output: { type: "browserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source-pages"],
        key: "sourceEvidence",
        value: {
          query,
          results: { fromNode: "search-sources" },
          sources: [{ fromNode: "read-source-pages" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.browser_intervention_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the provided browser evidence. Mention that dates/tickets should be verified before attending.",
          query,
          artifactPath: "reports/scottsdale-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/scottsdale-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Scottsdale family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-search", source: "request", target: "search-sources", type: "control_flow" as const, label: "needs current listings" },
      { id: "search-open", source: "search-sources", target: "browser-intervention", type: "data_flow" as const, label: "top source" },
      { id: "open-read", source: "browser-intervention", target: "read-source-pages", type: "data_flow" as const, label: "verified page" },
      {
        id: "read-final",
        source: "read-source-pages",
        target: "final-recommendations",
        type: "data_flow" as const,
        label: "source evidence",
      },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 7, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

export function managedBrowserInterventionCompilerOutput(sourceUrl: string) {
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue without this source if verification cannot be completed." },
  ];
  return {
    version: 1,
    title: "Real Managed Browser Family Shows Dogfood",
    goal: "Use the real managed browser to read a web source for child-friendly Scottsdale shows, pause on human verification, then resume into a rendered report.",
    summary:
      "Opens a deterministic web source in an isolated managed-browser profile through first-class browser.intervention nodes, reuses the preserved userActionId after user confirmation, captures source content and one screenshot, and asks Ambient to produce a readable report.",
    successCriteria: [
      "The workflow pauses with typed browser-intervention metadata when the real browser detects human verification",
      "The browser reveal action receives the preserved targetId and isolated profile context",
      "Resume retries the same browser operation with the preserved userActionId without opening extra tabs",
      "Graph events cover the intervention, content read, model call, and output nodes",
      "Final output renders as HTML instead of truncated JSON",
    ],
    inputs: { sourceUrl, finalArtifactPath: "reports/managed-browser-family-shows.html" },
    nodes: [
      {
        id: "browser-intervention",
        kind: "browser.intervention" as const,
        label: "Open managed source",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet:
            "Deterministic managed-browser source with a human-verification interstitial followed by Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
        },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        output: { type: "managedBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read verified source",
        dependsOn: ["browser-intervention"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Family shows challenge source",
          url: sourceUrl,
          snippet: "Verified Scottsdale family-show listings.",
          interventionTitle: "Managed browser verification",
          browserIntervention: { fromNode: "browser-intervention", path: "browserIntervention" },
        },
        skipIf: { fromNode: "browser-intervention", path: "skipped" },
        prompt: "Browser needs user action before reading Family shows challenge source.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "fail" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "managedBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query: "live shows appropriate for children in Scottsdale next week",
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-recommendations",
        kind: "model.call" as const,
        label: "Final family-show report",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.real_managed_browser_family_shows",
        input: {
          instruction:
            "Return JSON with summary:string, picks:[{title,venue,timing,ageFit,why,sourceUrl}], sources:string[], artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. Use only the verified browser source evidence. Mention that dates/tickets should be verified before attending.",
          artifactPath: "reports/managed-browser-family-shows.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: { summary: "string", picks: "array", sources: "array", artifactPath: "string", html: "string", markdown: "string" },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-recommendations"],
        key: "final_output",
        value: {
          artifactPath: "reports/managed-browser-family-shows.html",
          html: { fromNode: "final-recommendations", path: "html" },
          markdown: { fromNode: "final-recommendations", path: "markdown" },
          summary: { fromNode: "final-recommendations", path: "summary" },
          picks: { fromNode: "final-recommendations", path: "picks" },
          sources: { fromNode: "final-recommendations", path: "sources" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "Managed-browser family-friendly live shows report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      {
        id: "request-open",
        source: "request",
        target: "browser-intervention",
        type: "control_flow" as const,
        label: "needs source evidence",
      },
      { id: "open-read", source: "browser-intervention", target: "read-source", type: "data_flow" as const, label: "verified page" },
      { id: "read-final", source: "read-source", target: "final-recommendations", type: "data_flow" as const, label: "source evidence" },
      { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 360_000 },
    openQuestions: [],
  };
}

export function externalManagedBrowserArxivCompilerOutput(input: { query: string; sourceUrl: string }) {
  const { query, sourceUrl } = input;
  const choices = [
    { id: "completed", label: "I completed it", description: "Retry the same browser operation in the preserved browser session." },
    { id: "skip", label: "Skip source", description: "Continue with a clear note that the external source was blocked." },
  ];
  return {
    version: 1,
    title: "External Managed Browser Arxiv Summary",
    goal: "Use the isolated managed browser to inspect a real external arxiv search page and summarize placebo-effect papers from bounded page evidence.",
    summary:
      "Opens an external arxiv search URL through browser.intervention, records browser-intervention evidence if blocked, skips later browser reads when the user skips the source, otherwise captures bounded source text and one screenshot, then asks Ambient for a readable HTML/Markdown report.",
    successCriteria: [
      "The workflow uses the real managed browser against an external site without opening extra tabs",
      "Browser user-action pauses preserve preview evidence and can be skipped or retried",
      "Page text passed to Ambient is bounded and does not flood the event stream",
      "The final output renders as HTML instead of raw JSON",
    ],
    inputs: { query, sourceUrl, finalArtifactPath: "reports/external-arxiv-placebo-summary.html" },
    nodes: [
      {
        id: "open-source",
        kind: "browser.intervention" as const,
        label: "Open external arxiv page",
        tool: "browser_nav" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
        },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        output: { type: "externalBrowserOpenEvidence" },
      },
      {
        id: "read-source",
        kind: "browser.intervention" as const,
        label: "Read source evidence",
        dependsOn: ["open-source"],
        tool: "browser_content" as const,
        args: { url: sourceUrl },
        source: {
          title: "Arxiv placebo-effect search",
          url: sourceUrl,
          snippet: "External arxiv search page for placebo-effect papers.",
          interventionTitle: "External browser source needs attention",
          browserIntervention: { fromNode: "open-source", path: "browserIntervention" },
        },
        skipIf: { fromNode: "open-source", path: "skipped" },
        prompt: "Browser needs user action before reading Arxiv placebo-effect search.",
        choices,
        allowFreeform: true,
        retry: { maxAttempts: 1, onStillBlocked: "return_skipped" as const },
        screenshot: { enabled: true, args: {} },
        output: { type: "externalBrowserSourceEvidence" },
      },
      {
        id: "sourceEvidence",
        kind: "checkpoint.write" as const,
        dependsOn: ["read-source"],
        key: "sourceEvidence",
        value: {
          query,
          sourceUrl,
          sources: [{ fromNode: "read-source" }],
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        label: "Summarize papers",
        dependsOn: ["sourceEvidence"],
        task: "dogfood.external_managed_browser_arxiv",
        input: {
          instruction:
            "Use only the bounded managed-browser evidence to summarize recent arxiv search results about the placebo effect. Return JSON with summary:string, papers:[{title,summary,sourceUrl}], sourceEvidence:object, artifactPath:string, html:string, and markdown:string. Use artifactPath exactly as provided. If the source was blocked or skipped, clearly explain that and include the browser evidence status instead of inventing paper details.",
          query,
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
        output: {
          schema: {
            summary: "string",
            papers: "array",
            sourceEvidence: "object",
            artifactPath: "string",
            html: "string",
            markdown: "string",
          },
        },
      },
      {
        id: "final_output",
        kind: "checkpoint.write" as const,
        dependsOn: ["final-report"],
        key: "final_output",
        value: {
          artifactPath: "reports/external-arxiv-placebo-summary.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          papers: { fromNode: "final-report", path: "papers" },
          sourceEvidence: { fromNode: "sourceEvidence" },
        },
      },
      {
        id: "output",
        kind: "output.final" as const,
        label: "External arxiv managed-browser report is ready.",
        dependsOn: ["final_output"],
        value: { fromNode: "final_output" },
      },
    ],
    edges: [
      { id: "request-open", source: "request", target: "open-source", type: "control_flow" as const, label: "needs live evidence" },
      { id: "open-read", source: "open-source", target: "read-source", type: "data_flow" as const, label: "page opened or skipped" },
      { id: "read-final", source: "read-source", target: "final-report", type: "data_flow" as const, label: "bounded evidence" },
      { id: "final-output", source: "final-report", target: "output", type: "data_flow" as const, label: "report" },
    ],
    budgets: { maxToolCalls: 5, maxModelCalls: 1, maxRunMs: 420_000 },
    openQuestions: [],
  };
}

export function artifactReviewClassificationCompilerOutput(paths: string[]) {
  const readNodes = paths.map((path, index) => ({
    id: dogfoodNodeId("read-classification-file", path, index),
    kind: "tool.call" as const,
    label: `read ${path}`,
    tool: "file_read",
    args: { path },
  }));
  return {
    version: 1,
    title: "Artifact Review Classification Dogfood",
    goal: "Classify local files, pause for qualitative artifact feedback, then produce a final labeled HTML report.",
    summary:
      "Reads a small directory through file_read, uses Ambient to draft file classifications, pauses with a bounded HTML preview attached to workflow.askUser, then uses the feedback to produce the final report.",
    successCriteria: [
      "Local files are read through file_read without mutations",
      "Draft classifications are checkpointed before the runtime-input pause",
      "The runtime input card includes a review artifact path and bounded HTML preview",
      "Resuming with feedback produces readable final output cards instead of raw JSON-only output",
    ],
    inputs: { paths, previewArtifactPath: "reports/classification-preview.html", finalArtifactPath: "reports/classification-final.html" },
    nodes: [
      ...readNodes,
      {
        id: "classify-files",
        kind: "model.call" as const,
        dependsOn: readNodes.map((node) => node.id),
        task: "dogfood.file_classification_draft",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, and markdown:string. Classify each file into practical user-facing categories. Include receipts as Finance when appropriate and notes/todos as Planning when appropriate. Keep reasons concise.",
          files: readNodes.map((node, index) => ({
            path: paths[index],
            kind: { fromNode: node.id, path: "kind" },
            truncated: { fromNode: node.id, path: "truncated" },
            content: { fromNode: node.id, path: "content" },
          })),
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string" } },
      },
      {
        id: "classification-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["classify-files"],
        key: "classificationDraft",
        value: { files: paths, draft: { fromNode: "classify-files" } },
      },
      {
        id: "review-classifications",
        kind: "review.input" as const,
        dependsOn: ["classification-draft-checkpoint"],
        prompt: "Review the classification preview. What should change before creating the final report?",
        choices: [
          { id: "approve", label: "Looks right", description: "Use the draft classifications without further changes." },
          { id: "revise", label: "Use my feedback", description: "Apply the freeform feedback in the final report." },
        ],
        allowFreeform: true,
        data: {
          report: {
            title: "Classification preview",
            artifactPath: "reports/classification-preview.html",
            html: { fromNode: "classify-files", path: "html" },
            markdown: { fromNode: "classify-files", path: "markdown" },
          },
          summary: { fromNode: "classify-files", path: "summary" },
        },
      },
      {
        id: "final-report",
        kind: "model.call" as const,
        dependsOn: ["review-classifications"],
        task: "dogfood.file_classification_final",
        input: {
          instruction:
            "Return JSON with summary:string, items:[{path,label,confidence,reason}], html:string, markdown:string, and artifactPath:string. Apply the user's feedback when it is provided. The HTML should be a readable report, not raw JSON.",
          files: paths,
          draft: { fromNode: "classify-files" },
          userFeedback: {
            choiceId: { fromNode: "review-classifications", path: "choiceId" },
            text: { fromNode: "review-classifications", path: "text" },
          },
          artifactPath: "reports/classification-final.html",
        },
        output: { schema: { summary: "string", items: "array", html: "string", markdown: "string", artifactPath: "string" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["final-report"],
        label: "Classification report ready.",
        value: {
          artifactPath: "reports/classification-final.html",
          html: { fromNode: "final-report", path: "html" },
          markdown: { fromNode: "final-report", path: "markdown" },
          summary: { fromNode: "final-report", path: "summary" },
          items: { fromNode: "final-report", path: "items" },
        },
      },
    ],
    budgets: { maxToolCalls: paths.length, maxModelCalls: 2, maxRunMs: 300_000 },
    openQuestions: [],
  };
}

export function mutationReviewCompilerOutput(outputPath: string) {
  return {
    version: 1,
    title: "Mutation Review Dogfood",
    goal: "Draft a report and stage writing it to a workspace file for approval.",
    summary:
      "Uses Ambient to draft report content, checkpoints the draft, stages a local file write, applies it only after approval, and checkpoints the write result.",
    successCriteria: [
      "Ambient draft is generated and checkpointed before the review pause",
      "The file write is staged and not applied before approval",
      "Resume after approval writes the file",
      "The final checkpoint records the output path and bytes",
    ],
    inputs: { outputPath },
    nodes: [
      {
        id: "draft-report",
        kind: "model.call" as const,
        task: "dogfood.mutation_review_draft",
        input: {
          instruction:
            "Return JSON with title:string, summary:string, and content:string. The content must be markdown for a short report explaining that this workflow staged a write, paused for approval, and then wrote the approved file.",
        },
        output: { schema: { title: "string", summary: "string", content: "string" } },
      },
      {
        id: "mutation-review-draft-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["draft-report"],
        key: "mutationReviewDraft",
        value: { fromNode: "draft-report" },
      },
      {
        id: "write-report",
        kind: "mutation.stage" as const,
        dependsOn: ["mutation-review-draft-checkpoint"],
        tool: "file_write",
        args: { path: outputPath, content: { fromNode: "draft-report", path: "content" } },
        changeSet: {
          kind: "file_write",
          path: outputPath,
          title: { fromNode: "draft-report", path: "title" },
          summary: { fromNode: "draft-report", path: "summary" },
          preview: { fromNode: "draft-report", path: "content" },
        },
      },
      {
        id: "mutation-review-output-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["write-report", "draft-report"],
        key: "mutationReviewOutput",
        value: {
          path: { fromNode: "write-report", path: "path" },
          bytes: { fromNode: "write-report", path: "bytes" },
          title: { fromNode: "draft-report", path: "title" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["mutation-review-output-checkpoint"],
        value: { mutationReviewOutput: { fromNode: "mutation-review-output-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function pluginMcpSummaryCompilerOutput(pluginCapability: ReturnType<typeof workflowPluginCapabilityGrant>) {
  void pluginCapability;
  return {
    version: 1,
    title: "Plugin MCP Summary Dogfood",
    goal: "Call a trusted workflow-safe plugin MCP tool and summarize its evidence.",
    summary: "Invokes the ambient fixture MCP plugin, asks Ambient to summarize the tool result, and checkpoints the summary.",
    successCriteria: [
      "The plugin MCP tool is declared in the manifest",
      "The plugin tool call is routed through workflow plugin supervision",
      "Ambient summarizes the plugin result",
      "The checkpoint records plugin evidence and model output",
    ],
    inputs: { pluginTool: "ambient_fixture_workspace_summary" },
    nodes: [
      {
        id: "plugin-evidence",
        kind: "tool.call" as const,
        label: "Call fixture MCP plugin",
        tool: "ambient_fixture_workspace_summary",
        args: { includeFiles: true },
      },
      {
        id: "plugin-summary",
        kind: "model.call" as const,
        dependsOn: ["plugin-evidence"],
        task: "dogfood.plugin_mcp_summary",
        input: {
          instruction:
            "Return JSON with summary:string, pluginTool:string, and evidence:string[]. Summarize this workflow-safe plugin MCP result and mention whether workspace files were included.",
          pluginTool: "ambient_fixture_workspace_summary",
          pluginResult: { fromNode: "plugin-evidence" },
        },
        output: { schema: { summary: "string", pluginTool: "string", evidence: "array" } },
      },
      {
        id: "plugin-summary-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["plugin-evidence", "plugin-summary"],
        key: "pluginMcpSummary",
        value: {
          pluginTool: "ambient_fixture_workspace_summary",
          pluginText: { fromNode: "plugin-evidence" },
          summary: { fromNode: "plugin-summary" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["plugin-summary-checkpoint"],
        value: { pluginMcpSummary: { fromNode: "plugin-summary-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function explorationDrivenCompilerOutput(path: string) {
  return {
    version: 1,
    title: "Exploration Driven Strategy Dogfood",
    goal: "Compile a deterministic workflow from an exploration trace that observed local file reads.",
    summary: "Reads the explored local seed file, asks Ambient to summarize the deterministic source strategy, and checkpoints the result.",
    successCriteria: [
      "Compile prompt includes the persisted exploration trace",
      "The generated workflow repeats the observed file_read pattern deterministically",
      "Ambient summarizes the strategy from the file evidence",
      "The checkpoint preserves source provenance",
    ],
    inputs: { path },
    nodes: [
      { id: "read-seed-file", kind: "tool.call" as const, label: "Read explored seed file", tool: "file_read", args: { path } },
      {
        id: "summarize-strategy",
        kind: "model.call" as const,
        dependsOn: ["read-seed-file"],
        task: "dogfood.exploration_driven_strategy",
        input: {
          instruction:
            "Return JSON with summary:string and provenance:string[]. Summarize how this deterministic workflow should use the explored local file as seed evidence, and mention that current dates still require verification.",
          file: {
            path,
            content: { fromNode: "read-seed-file", path: "content" },
            truncated: { fromNode: "read-seed-file", path: "truncated" },
          },
        },
        output: { schema: { summary: "string", provenance: "array" } },
      },
      {
        id: "exploration-strategy-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["summarize-strategy"],
        key: "explorationDrivenStrategy",
        value: { path, strategy: { fromNode: "summarize-strategy" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["exploration-strategy-checkpoint"],
        value: { explorationDrivenStrategy: { fromNode: "exploration-strategy-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 1, maxModelCalls: 1, maxRunMs: 240_000 },
    openQuestions: [],
  };
}

export function debugRewriteCompilerOutput() {
  return {
    version: 1,
    title: "Debug Rewrite Dogfood Repaired",
    goal: "Repair a workflow after a graph-mapped failure.",
    summary: "Replaces the unsafe classifier with a deterministic repaired classifier while preserving the classify graph node.",
    successCriteria: ["The classify node runs without throwing", "The repaired workflow checkpoints classification output"],
    nodes: [
      {
        id: "classify",
        kind: "branch.if",
        label: "classify safely",
        condition: true,
        then: { literal: { label: "fixed", recovered: true } },
        else: { literal: { label: "unreachable", recovered: false } },
      },
      {
        id: "classification-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["classify"],
        key: "classification",
        value: { fromNode: "classify", path: "value" },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["classification-checkpoint"],
        value: { classification: { fromNode: "classification-checkpoint" } },
      },
    ],
    budgets: { maxRunMs: 120_000 },
    openQuestions: [],
  };
}

export function calendarBriefCompilerOutput(accountHint: string) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const timeZone = "America/Phoenix";
  return {
    version: 1,
    title: "Calendar Brief Dogfood",
    goal: "Summarize upcoming Google Calendar events into a concise schedule brief.",
    summary:
      "Lists upcoming primary-calendar events through the Google Calendar connector, asks Ambient to summarize the schedule, and checkpoints the brief.",
    successCriteria: [
      "Calendar events are listed through google.calendar.listEvents",
      "Ambient produces a brief from the returned event metadata",
      "The checkpoint records the event count and brief",
    ],
    inputs: { accountHint, windowDays: 14, timeZone },
    nodes: [
      {
        id: "list-calendar-events",
        kind: "connector.call" as const,
        connectorId: "google.calendar",
        operation: "listEvents",
        accountId: accountHint,
        input: { calendarId: "primary", timeMin, timeMax, timeZone, maxResults: 10, singleEvents: true, orderBy: "startTime" },
        output: { schema: { items: "array", events: "array" } },
      },
      {
        id: "calendar-brief",
        kind: "model.call" as const,
        dependsOn: ["list-calendar-events"],
        task: "dogfood.calendar_brief",
        input: {
          instruction:
            "Return JSON with summary:string, eventCount:number, and highlights:string[]. Use only the provided calendar metadata. If there are no events, say there are no upcoming events in the checked range.",
          timeRange: { timeMin, timeMax, timeZone },
          events: { fromNode: "list-calendar-events" },
        },
        output: { schema: { summary: "string", eventCount: "number", highlights: "array" } },
      },
      {
        id: "calendar-brief-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["list-calendar-events", "calendar-brief"],
        key: "calendarBrief",
        value: {
          accountId: accountHint,
          timeMin,
          timeMax,
          timeZone,
          events: { fromNode: "list-calendar-events" },
          brief: { fromNode: "calendar-brief" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["calendar-brief-checkpoint"],
        value: { calendarBrief: { fromNode: "calendar-brief-checkpoint" } },
      },
    ],
    budgets: { maxConnectorCalls: 1, maxModelCalls: 1, maxRunMs: 600_000 },
    openQuestions: [],
  };
}

export function driveFileReportCompilerOutput(accountHint: string) {
  return {
    version: 1,
    title: "Drive File Evidence Dogfood",
    goal: "Search Google Drive files and summarize file evidence from safe metadata.",
    summary:
      "Searches Drive files, reads metadata for top matches with bounded connector fan-out, asks Ambient to summarize the file evidence, and checkpoints the report.",
    successCriteria: [
      "Drive search runs through google.drive.search",
      "Top file metadata is read through google.drive.readFile when matches exist",
      "Ambient produces a report from the returned file evidence",
      "The checkpoint records file count and report output",
    ],
    inputs: { accountHint, maxFiles: 5 },
    nodes: [
      {
        id: "search-drive-files",
        kind: "connector.call" as const,
        label: "Search Drive files",
        connectorId: "google.drive",
        operation: "search",
        accountId: accountHint,
        input: {
          query: "trashed = false",
          pageSize: 5,
          fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
        },
        output: { schema: { files: "array", items: "array", nextPageToken: "string|null" } },
      },
      {
        id: "drive-files",
        kind: "error.handle" as const,
        label: "Normalize Drive search files",
        dependsOn: ["search-drive-files"],
        try: { fromNode: "search-drive-files", path: "files" },
        fallback: { fromNode: "search-drive-files", path: "items" },
        errorMessage: "Drive search returned no files array; falling back to items.",
      },
      {
        id: "read-drive-file-details",
        kind: "connector.map" as const,
        label: "Read Drive file details",
        dependsOn: ["drive-files"],
        connectorId: "google.drive",
        operation: "readFile",
        accountId: accountHint,
        items: { fromNode: "drive-files", path: "value" },
        itemName: "file",
        input: {
          fileId: { fromItem: "file", path: "id" },
          fields: "id,name,mimeType,modifiedTime,size,webViewLink",
        },
        maxItems: 2,
        maxConcurrency: 4,
        output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
      },
      {
        id: "drive-file-report",
        kind: "model.call" as const,
        label: "Summarize Drive file evidence",
        dependsOn: ["read-drive-file-details"],
        task: "dogfood.drive_file_report",
        input: {
          instruction:
            "Return JSON with summary:string, fileCount:number, and highlights:string[]. Use only the provided Drive file metadata. If no files are returned, say no files were found in the checked Drive search.",
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          files: { fromNode: "read-drive-file-details", path: "items" },
        },
        output: { schema: { summary: "string", fileCount: "number", highlights: "array" } },
      },
      {
        id: "drive-file-report-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["drive-file-report", "read-drive-file-details"],
        key: "driveFileReport",
        value: {
          accountId: accountHint,
          fileCount: { fromNode: "read-drive-file-details", path: "sourceCount" },
          inspectedCount: { fromNode: "read-drive-file-details", path: "count" },
          report: { fromNode: "drive-file-report" },
        },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["drive-file-report-checkpoint"],
        value: { driveFileReport: { fromNode: "drive-file-report-checkpoint" } },
      },
    ],
    budgets: { maxConnectorCalls: 3, maxModelCalls: 1, maxRunMs: 600_000 },
    previewSummary: "Read-only Google Drive file evidence workflow.",
    dryRunStrategy: "Dry run records connector intent and report shape without writing Drive data.",
    openQuestions: [],
  };
}

export function retentionTraceCompilerOutput(mode: "production" | "debug") {
  return {
    version: 1,
    title: `${mode === "debug" ? "Debug" : "Production"} Retention Trace Dogfood`,
    goal: `Run a tiny ${mode} trace workflow and verify retention review labels from live Ambient evidence.`,
    summary: `Calls Ambient once and checkpoints the result for ${mode} trace review.`,
    successCriteria: [
      "Ambient call succeeds",
      "Model call is retained in run detail",
      "Retention review model reports the expected trace mode",
    ],
    inputs: { mode },
    nodes: [
      {
        id: "retention-trace",
        kind: "model.call" as const,
        task: `dogfood.retention_trace.${mode}`,
        input: {
          mode,
          instruction: "Return a JSON object with a single summary string confirming this live retention trace call completed.",
        },
        output: { schema: { summary: "string" } },
      },
      {
        id: "retention-trace-checkpoint",
        kind: "checkpoint.write" as const,
        dependsOn: ["retention-trace"],
        key: "retentionTrace",
        value: { mode, result: { fromNode: "retention-trace" } },
      },
      {
        id: "final_output",
        kind: "output.final" as const,
        dependsOn: ["retention-trace-checkpoint"],
        value: { retentionTrace: { fromNode: "retention-trace-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 2, maxModelCalls: 1, maxRunMs: 180_000 },
    openQuestions: [],
  };
}

export function browserQaCompilerOutput(targetUrl: string) {
  return {
    version: 1,
    title: "Browser QA Dogfood",
    goal: "Run deterministic browser QA against a local fixture and store evidence.",
    summary:
      "Navigates to a local HTML page, captures content and screenshot evidence, asks Ambient for diagnosis, and checkpoints the result.",
    successCriteria: ["Page content is collected", "Screenshot evidence is recorded", "Ambient diagnosis is checkpointed"],
    nodes: [
      { id: "open-local-fixture", kind: "tool.call", label: "open local fixture", tool: "browser_nav", args: { url: targetUrl } },
      {
        id: "collect-page-content",
        kind: "tool.call",
        label: "collect page content",
        tool: "browser_content",
        dependsOn: ["open-local-fixture"],
        args: {},
      },
      {
        id: "capture-visual-evidence",
        kind: "tool.call",
        label: "capture visual evidence",
        tool: "browser_screenshot",
        dependsOn: ["collect-page-content"],
        args: {},
      },
      {
        id: "diagnosis",
        kind: "model.call",
        dependsOn: ["open-local-fixture", "collect-page-content", "capture-visual-evidence"],
        task: "dogfood.browser_qa",
        input: {
          page: { fromNode: "open-local-fixture" },
          content: { fromNode: "collect-page-content" },
          screenshot: { fromNode: "capture-visual-evidence" },
        },
        output: { schema: { summary: "string", issues: "array", evidence: "object" } },
      },
      {
        id: "browser-qa-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["diagnosis", "capture-visual-evidence"],
        key: "browserQa",
        value: { targetUrl, diagnosis: { fromNode: "diagnosis" }, screenshot: { fromNode: "capture-visual-evidence" } },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["browser-qa-checkpoint"],
        value: { browserQa: { fromNode: "browser-qa-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 6, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: [],
  };
}

export function scottsdaleActivitiesCompilerOutput() {
  return {
    version: 1,
    title: "Scottsdale Weekend Activities",
    goal: "Find weekend activities in Scottsdale Arizona and produce an auditable shortlist.",
    summary: "Searches for Scottsdale weekend activities, ranks likely options with Ambient, and checkpoints the result.",
    successCriteria: ["Search results are collected", "Ambient ranking is recorded", "A weekend shortlist is checkpointed"],
    nodes: [
      {
        id: "search-scottsdale-weekend-activities",
        kind: "tool.call",
        label: "search Scottsdale weekend activities",
        tool: "browser_search",
        args: { query: "weekend activities Scottsdale Arizona", maxResults: 8 },
      },
      {
        id: "shortlist",
        kind: "model.call",
        dependsOn: ["search-scottsdale-weekend-activities"],
        task: "dogfood.scottsdale_weekend",
        input: { query: "weekend activities Scottsdale Arizona", results: { fromNode: "search-scottsdale-weekend-activities" } },
        output: { schema: { summary: "string", picks: "array", evidence: "object" } },
      },
      {
        id: "scottsdale-weekend-checkpoint",
        kind: "checkpoint.write",
        dependsOn: ["search-scottsdale-weekend-activities", "shortlist"],
        key: "scottsdaleWeekend",
        value: {
          query: "weekend activities Scottsdale Arizona",
          results: { fromNode: "search-scottsdale-weekend-activities" },
          shortlist: { fromNode: "shortlist" },
        },
      },
      {
        id: "output",
        kind: "output.final",
        dependsOn: ["scottsdale-weekend-checkpoint"],
        value: { scottsdaleWeekend: { fromNode: "scottsdale-weekend-checkpoint" } },
      },
    ],
    budgets: { maxToolCalls: 4, maxModelCalls: 1, maxRunMs: 10_000 },
    openQuestions: ["Should the workflow prefer family-friendly, nightlife, outdoors, or budget activities?"],
  };
}
