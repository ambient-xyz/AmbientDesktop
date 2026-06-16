import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

import JSZip from "jszip";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { AMBIENT_KIMI_K2_7_CODE_MODEL } from "../shared/ambientModels";
import { validateSubagentResultArtifactForSynthesis } from "../shared/subagentProtocol";
import type { ChatMessage, PermissionPromptResponseMode, PermissionRequest, WorkspaceContextReference } from "../shared/types";
import { AgentRuntime } from "./agentRuntime";
import { createChatExportBundle } from "./chatExport";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { createDocxFixture } from "./officeTestFixtures";
import { createPdfFixture } from "./pdfTestFixtures";
import { ProjectStore } from "./projectStore";
import { forbiddenClaimLooksPromised, forbiddenClaimPromises, termsPresent } from "./subagentScenarioDogfoodAssertions";

const itScenario = process.env.AMBIENT_SUBAGENT_SCENARIO_DOGFOOD === "1" ? it : it.skip;
const RESULTS_DIR = join(process.cwd(), "test-results", "subagent-scenario-dogfood");
const SCENARIO_TIMEOUT_MS = Number(process.env.AMBIENT_SUBAGENT_SCENARIO_TIMEOUT_MS ?? 20 * 60 * 1000);
const SEND_TIMEOUT_MS = Number(process.env.AMBIENT_SUBAGENT_SCENARIO_SEND_TIMEOUT_MS ?? 18 * 60 * 1000);
const PROVIDER_PRE_STREAM_TIMEOUT_MS = Number(process.env.AMBIENT_SUBAGENT_SCENARIO_PROVIDER_PRE_STREAM_TIMEOUT_MS ?? 120_000);
const PROVIDER_STREAM_IDLE_TIMEOUT_MS = Number(process.env.AMBIENT_SUBAGENT_SCENARIO_PROVIDER_STREAM_IDLE_TIMEOUT_MS ?? 120_000);
const scenarioFilter = process.env.AMBIENT_SUBAGENT_SCENARIO_FILTER?.trim();

interface ScenarioSpec {
  id: string;
  title: string;
  pattern: string;
  prompt: string;
  expectedMinChildren: number;
  expectedMinStartedChildren?: number;
  requiredFinalTerms: string[];
  requiredFinalTermAlternatives?: Array<{
    label: string;
    alternatives: string[];
  }>;
  requiredTranscriptTerms?: string[];
  forbiddenFinalTerms?: string[];
  requiresHtmlArtifact?: boolean;
  preparesDocumentFixtures?: boolean;
}

interface ScenarioRecord {
  id: string;
  title: string;
  pattern: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  provider: string;
  model: string;
  threadId?: string;
  workspacePath?: string;
  assistantTextPreview?: string;
  childRuns: Array<{
    id: string;
    childThreadId: string;
    roleId: string;
    status: string;
    title?: string;
    started: boolean;
    resultArtifactStatus?: string;
    resultArtifactPartial: boolean;
    resultSynthesisAllowed: boolean;
    assistantTextPreview: string;
    runtimeEventTypes: string[];
  }>;
  childThreadCount: number;
  waitBarrierCount: number;
  parentMailboxEventCount: number;
  permissionRequests: Array<{
    toolName: string;
    risk: string;
    threadId?: string;
    targetLabel?: string;
  }>;
  export: {
    path?: string;
    bytes?: number;
    childThreadCount?: number;
    includedFiles?: string[];
  };
  workspaceHtmlArtifacts: string[];
  checks: Record<string, unknown>;
  error?: string;
}

const scenarios: ScenarioSpec[] = [
  {
    id: "weekend-trip-triage",
    title: "Weekend Trip Triage",
    pattern: "Map-Reduce",
    expectedMinChildren: 3,
    prompt: [
      "I have three possible long-weekend trips and I am overwhelmed. Can you compare them for cost, travel hassle, weather risk, and how relaxing they are, then tell me which one you would choose?",
      "",
      "I live in Phoenix. I can leave Friday, June 26, 2026 after 3:00 PM and need to be home by Monday, June 29, 2026 at 8:00 PM. This is for two adults. Total budget target is $900, but I can stretch to $1,050 if the trip is clearly less stressful. I care about low stress 35%, good food 25%, walkability 20%, avoiding extreme heat 10%, and novelty 10%. Compare these options:",
      "",
      "- Santa Fe by car: about 7.5 hours each way, possible stop in Holbrook, interested in museums, food, and a relaxed historic district.",
      "- San Diego by car: about 5.5 hours each way if traffic behaves, interested in ocean air, Little Italy, Balboa Park, and not overspending.",
      "- Denver by flight: assume a nonstop flight if reasonable, light rail or rideshare locally, interested in breweries, bookstores, and cooler weather.",
    ].join("\n"),
    requiredFinalTerms: ["Phoenix", "35%", "25%", "20%"],
    requiredFinalTermAlternatives: [
      {
        label: "June 26 departure constraint",
        alternatives: ["June 26", "Friday", "after 3 PM", "after 3:00 PM"],
      },
      {
        label: "June 29 return date",
        alternatives: ["June 29", "Monday", "June 26-29", "June 26–29", "26-29", "26–29"],
      },
      {
        label: "budget target or stretch context",
        alternatives: ["$900", "$1,050", "stretch budget", "budget target"],
      },
    ],
    requiredTranscriptTerms: ["Santa Fe", "San Diego", "Denver"],
  },
  {
    id: "document-reading-permissions",
    title: "Document Reading And Permissions",
    pattern: "Map-Reduce",
    expectedMinChildren: 3,
    preparesDocumentFixtures: true,
    prompt: [
      "Can you read these three local documents and tell me what they agree on, what they contradict, and what I should verify before relying on them?",
      "",
      "The documents are attached to this chat as selected context:",
      "- docs/field-notes.md",
      "- docs/vendor-memo.pdf",
      "- docs/finance-summary.docx",
      "",
      "I care about the project owner, budget, launch date, and any vendor risk. Please be clear about which facts are consistent and which facts conflict.",
    ].join("\n"),
    requiredFinalTerms: ["Sonoran", "Priya", "Marco", "$42,000", "$45,000"],
    requiredFinalTermAlternatives: [
      {
        label: "launch date disagreement",
        alternatives: ["July 15", "July 22", "launch date", "date conflict"],
      },
      {
        label: "verification recommendation",
        alternatives: ["verify", "confirm", "check with", "ask finance", "ask the owner"],
      },
    ],
    requiredTranscriptTerms: ["field-notes.md", "vendor-memo.pdf", "finance-summary.docx"],
  },
  {
    id: "risky-product-decision",
    title: "Risky Product Decision",
    pattern: "Debate",
    expectedMinChildren: 4,
    prompt: [
      "I am considering removing a complicated feature from my app because it slows the team down. Can you help me think through whether that is wise before I decide?",
      "",
      "The app is a small team knowledge-base product called Northstar Notes. The feature is \"Smart Outline,\" which auto-generates nested document outlines. It was built for enterprise buyers, but only 7% of monthly active users clicked it in the last 90 days. It creates 31% of support tickets, mostly around wrong headings and confusing permissions. Maintenance takes about 8 engineering days per month and has delayed the mobile editor twice. One $48k/year enterprise customer says Smart Outline is part of why they bought the product, but their admin also complained that it is unreliable. I am considering removing it in Q3 2026 and replacing it later with a simpler manual outline mode.",
    ].join("\n"),
    requiredFinalTerms: ["Smart Outline", "7%", "31%", "$48k"],
    requiredFinalTermAlternatives: [
      {
        label: "8 engineering days maintenance cost",
        alternatives: ["8 engineering", "8 days", "8 eng", "eight engineering", "eight days"],
      },
      {
        label: "weighted evaluation rubric",
        alternatives: ["rubric", "scorecard", "weighted", "weights"],
      },
      {
        label: "convergence summary",
        alternatives: ["convergence", "agree", "agreement", "common ground"],
      },
      {
        label: "dissent or minority objection summary",
        alternatives: ["dissent", "minority", "objection", "disagreement", "strongest objection"],
      },
    ],
  },
  {
    id: "announcement-polish",
    title: "Announcement Polish",
    pattern: "Imitate and Verify",
    expectedMinChildren: 2,
    prompt: [
      "Here is a rough announcement for customers. Please make it sound clear and confident, but do not let it become hypey. I want it checked carefully before I use it.",
      "",
      "Rough announcement: \"Hey everyone, we finally fixed the notification mess. Starting July 8, 2026, all workspace notifications will move to the new Notifications Center. It should be way less annoying and probably more reliable. You do not have to do anything unless you want to change your settings. Admins can still set defaults, but people can override them. Some old email-only alerts are going away because they were duplicative. We are sorry this took so long. Docs are coming soon.\"",
      "",
      "Audience: existing small-business customers, not developers.",
      "Tone target: calm, accountable, practical, not salesy.",
      "Facts that must remain: July 8, no action required, admin defaults remain, user overrides remain, some old email-only alerts are removed, docs are not ready yet.",
      "Forbidden claims: do not promise zero missed notifications, instant delivery, or \"finally perfect.\"",
    ].join("\n"),
    requiredFinalTerms: ["July 8", "Admin", "override", "email-only"],
    requiredFinalTermAlternatives: [
      {
        label: "no action required fact",
        alternatives: ["no action", "nothing, unless", "nothing unless", "do not need", "don't need", "you do not have to"],
      },
      {
        label: "docs not ready fact",
        alternatives: ["docs", "documentation", "coming soon", "not ready"],
      },
    ],
    forbiddenFinalTerms: ["zero missed notifications", "instant delivery", "finally perfect"],
  },
  {
    id: "dinner-party-plan",
    title: "Dinner Party Plan",
    pattern: "Pipeline",
    expectedMinChildren: 3,
    prompt: [
      "I am hosting six friends this weekend and I want dinner to feel thoughtful but easy. Can you help me turn that into a menu, shopping list, and day-of timing plan?",
      "",
      "Dinner is Saturday, July 11, 2026 at 7:00 PM in a small Phoenix apartment. There will be six guests plus me. I have one oven, two stovetop burners, no grill, one large sheet pan, one Dutch oven, one blender, and limited counter space. I can shop Friday evening at Trader Joe's and Safeway. Budget is $170. I want Mediterranean-ish food that feels generous but not fussy.",
      "",
      "Diet constraints: one pescatarian, one gluten-free guest, one person dislikes cilantro, no pork.",
      "Time constraints: maximum 90 minutes active cooking on Saturday, with anything possible prepped Friday night.",
      "Host preferences: one main, two sides, one make-ahead dessert, one nonalcoholic drink option, minimal last-minute chopping.",
      "Risk: Phoenix heat makes heavy oven use unpleasant, so oven time should be batched or limited.",
    ].join("\n"),
    requiredFinalTerms: ["Trader Joe", "Safeway", "$170", "gluten-free", "pescatarian", "cilantro", "pork"],
    requiredFinalTermAlternatives: [
      {
        label: "Saturday active cooking constraint",
        alternatives: ["90 minutes", "under 90", "under thirty", "under 30", "25-30", "25–30", "active cooking"],
      },
    ],
  },
  {
    id: "habit-tracker-app",
    title: "Habit Tracker App",
    pattern: "Self-Healing",
    expectedMinChildren: 3,
    expectedMinStartedChildren: 2,
    prompt: [
      "Can you make me a simple habit tracker web page for the next month and keep checking it until it seems ready for me to actually use?",
      "",
      "I want a single-file HTML habit tracker for July 2026. It should come with four starter habits: Walk 20 minutes, Stretch, Read 10 pages, and No late snacks. I want to add or delete habits, click days on a July calendar grid, see each habit's current streak and total completed days, and keep data in browser local storage. I do not need accounts, sync, notifications, or a backend. Please make it clean enough to use on a laptop and a phone.",
      "",
      "Tester edge cases to check: add a habit with a long name, delete a habit, reload the page, mark July 1 and July 31, and clear all data.",
      "Mutation boundary: write only inside this scenario workspace or generated artifact path.",
      "Repair budget: maximum three repair loops after tester findings.",
    ].join("\n"),
    requiredFinalTerms: ["July 2026", "Walk 20", "Stretch", "Read 10", "No late snacks", "local storage", "clear all data"],
    requiresHtmlArtifact: true,
  },
].filter((scenario) => !scenarioFilter || scenario.id.includes(scenarioFilter) || scenario.title.toLowerCase().includes(scenarioFilter.toLowerCase()));

const records: ScenarioRecord[] = [];
let workspacePath = "";
let store: ProjectStore;
let runtime: AgentRuntime | undefined;

function createScenarioBrowserStub(): any {
  const state = {
    running: false,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: false,
    copiedProfileAvailable: false,
    chromeAvailable: false,
    browserLoginBrokerAvailable: false,
    chromeUnavailableReason: "Browser automation is not available inside the sub-agent scenario dogfood harness.",
    lastActivity: "Browser automation disabled for this harness.",
  };
  const unavailable = async () => {
    throw new Error("Browser automation is not available inside the sub-agent scenario dogfood harness.");
  };
  return {
    getState: async () => state,
    start: async () => state,
    copyChromeProfile: async () => state,
    refreshWorkspaceArtifact: async () => false,
    navigate: unavailable,
    content: unavailable,
    search: unavailable,
    evaluate: unavailable,
    keypress: unavailable,
    login: unavailable,
    screenshot: unavailable,
    pick: unavailable,
  };
}

describe.sequential("sub-agent scenario dogfood from subagentTestPlan.html", () => {
  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-subagent-scenario-"));
    await writeFile(join(workspacePath, "README.md"), "# Subagent scenario dogfood workspace\n", "utf8");
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });
    store.setModelRuntimeSettings({
      aggressiveRetries: false,
      providerPreStreamTimeoutMs: PROVIDER_PRE_STREAM_TIMEOUT_MS,
      providerStreamIdleTimeoutMs: PROVIDER_STREAM_IDLE_TIMEOUT_MS,
    });
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    if (process.env.AMBIENT_SUBAGENT_SCENARIO_KEEP_WORKSPACE !== "1") {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await writeAggregateReport();
  });

  for (const scenario of scenarios) {
    itScenario(`runs ${scenario.title} as ${scenario.pattern}`, async () => {
      await runScenario(scenario);
    }, SCENARIO_TIMEOUT_MS);
  }
});

async function runScenario(scenario: ScenarioSpec): Promise<void> {
  applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: `sub-agent scenario dogfood: ${scenario.title}` }));
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const model = liveAmbientProviderModel({
    preferredModelEnvNames: ["AMBIENT_LIVE_MODEL", "AMBIENT_WORKFLOW_MODEL"],
    fallbackModel: AMBIENT_KIMI_K2_7_CODE_MODEL,
  });
  const context = await prepareScenarioWorkspace(scenario);
  const permissionRequests: ScenarioRecord["permissionRequests"] = [];
  const thread = store.updateThreadSettings(store.createThread(`Scenario: ${scenario.title}`).id, {
    permissionMode: "workspace",
    collaborationMode: "agent",
    model,
    thinkingLevel: "medium",
  });
  runtime = new AgentRuntime(store, createScenarioBrowserStub(), {} as any, () => undefined, {
    request: async (request, options) => {
      const captured = {
        id: `scenario-${scenario.id}-permission-${permissionRequests.length + 1}`,
        ...request,
      } as PermissionRequest;
      options?.onRequest?.(captured);
      permissionRequests.push({
        toolName: request.toolName,
        risk: request.risk,
        threadId: request.threadId,
        targetLabel: request.grantTargetLabel ?? request.title,
      });
      return { allowed: true, mode: "always_thread" as PermissionPromptResponseMode };
    },
    denyThread: () => undefined,
  }, {
      ambientCli: {
        autoInstallFirstParty: false,
      },
    });
  const scenarioRuntime = runtime;

  let record: ScenarioRecord | undefined;
  record = provisionalScenarioRecord({
    scenario,
    startedAt,
    startedMs,
    model,
    threadId: thread.id,
    permissionRequests,
    context,
    error: "Scenario started but did not reach the normal completion recorder yet.",
  });
  rememberRecord(record);
  await writeScenarioReport(record);
  await writeAggregateReport();
  try {
    await sendWithTimeout({
      runtime: scenarioRuntime,
      store,
      threadId: thread.id,
      send: () => scenarioRuntime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model,
        thinkingLevel: "medium",
        content: scenario.prompt,
        context,
      }, { awaitInternalRetryCompletion: true }),
      timeoutMs: SEND_TIMEOUT_MS,
    });

    record = await buildScenarioRecord({
      scenario,
      status: "passed",
      startedAt,
      startedMs,
      model,
      threadId: thread.id,
      permissionRequests,
      context,
    });
    assertScenarioPassed(scenario, record);
  } catch (error) {
    record = await buildScenarioRecord({
      scenario,
      status: "failed",
      startedAt,
      startedMs,
      model,
      threadId: thread.id,
      permissionRequests,
      context,
      error,
    });
    throw error;
  } finally {
    if (record) {
      rememberRecord(record);
      await writeScenarioReport(record);
      await writeAggregateReport();
    }
  }
}

function provisionalScenarioRecord(input: {
  scenario: ScenarioSpec;
  startedAt: string;
  startedMs: number;
  model: string;
  threadId: string;
  permissionRequests: ScenarioRecord["permissionRequests"];
  context: WorkspaceContextReference[];
  error: string;
}): ScenarioRecord {
  const completedAt = new Date().toISOString();
  return {
    id: input.scenario.id,
    title: input.scenario.title,
    pattern: input.scenario.pattern,
    status: "failed",
    startedAt: input.startedAt,
    completedAt,
    durationMs: Date.now() - input.startedMs,
    provider: liveAmbientProviderLabel(),
    model: input.model,
    threadId: input.threadId,
    workspacePath,
    assistantTextPreview: "",
    childRuns: [],
    childThreadCount: 0,
    waitBarrierCount: 0,
    parentMailboxEventCount: 0,
    permissionRequests: input.permissionRequests,
    export: {},
    workspaceHtmlArtifacts: [],
    checks: {
      expectedMinChildren: input.scenario.expectedMinChildren,
      expectedMinStartedChildren: input.scenario.expectedMinStartedChildren ?? input.scenario.expectedMinChildren,
      selectedContextPaths: input.context.map((item) => item.path),
      provisional: true,
    },
    error: input.error,
  };
}

function rememberRecord(record: ScenarioRecord): void {
  const existingIndex = records.findIndex((candidate) => candidate.id === record.id);
  if (existingIndex >= 0) {
    records[existingIndex] = record;
    return;
  }
  records.push(record);
}

async function buildScenarioRecord(input: {
  scenario: ScenarioSpec;
  status: ScenarioRecord["status"];
  startedAt: string;
  startedMs: number;
  model: string;
  threadId: string;
  permissionRequests: ScenarioRecord["permissionRequests"];
  context: WorkspaceContextReference[];
  error?: unknown;
}): Promise<ScenarioRecord> {
  const runs = store.listSubagentRunsForParentThread(input.threadId);
  const waitBarriers = uniqueById(runs.flatMap((run) => store.listSubagentWaitBarriersForParentRun(run.parentRunId)));
  const parentMailboxEvents = store.listSubagentParentMailboxEventsForParentThread(input.threadId);
  const assistantText = threadAssistantText(store, input.threadId);
  const transcript = threadTranscript(store, input.threadId);
  const workspaceHtmlArtifacts = await findWorkspaceHtmlArtifacts(workspacePath);
  const exportInfo = await exportAndInspectChat(input.scenario.id, input.threadId);
  const completedAt = new Date().toISOString();
  return {
    id: input.scenario.id,
    title: input.scenario.title,
    pattern: input.scenario.pattern,
    status: input.status,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Date.now() - input.startedMs,
    provider: liveAmbientProviderLabel(),
    model: input.model,
    threadId: input.threadId,
    workspacePath,
    assistantTextPreview: assistantText.slice(0, 4_000),
    childRuns: runs.map((run) => {
      const childThread = store.getThread(run.childThreadId);
      const runtimeEvents = store.listSubagentRunEvents(run.id);
      const runtimeEventTypes = runtimeEvents.map((event) => event.type);
      const resultArtifactValidation = validateSubagentResultArtifactForSynthesis(run.resultArtifact);
      return {
        id: run.id,
        childThreadId: run.childThreadId,
        roleId: run.roleId,
        status: run.status,
        title: childThread.title,
        started: subagentRunStarted(runtimeEventTypes),
        ...(resultArtifactValidation.status ? { resultArtifactStatus: resultArtifactValidation.status } : {}),
        resultArtifactPartial: resultArtifactValidation.partial,
        resultSynthesisAllowed: resultArtifactValidation.synthesisAllowed,
        assistantTextPreview: threadAssistantText(store, run.childThreadId).slice(0, 2_000),
        runtimeEventTypes,
      };
    }),
    childThreadCount: runs.length,
    waitBarrierCount: waitBarriers.length,
    parentMailboxEventCount: parentMailboxEvents.length,
    permissionRequests: input.permissionRequests,
    export: exportInfo,
    workspaceHtmlArtifacts,
    checks: {
      expectedMinChildren: input.scenario.expectedMinChildren,
      expectedMinStartedChildren: input.scenario.expectedMinStartedChildren ?? input.scenario.expectedMinChildren,
      requiredFinalTerms: termsPresent(assistantText, input.scenario.requiredFinalTerms),
      requiredFinalTermAlternatives: requiredAlternativesPresent(assistantText, input.scenario.requiredFinalTermAlternatives ?? []),
      requiredTranscriptTerms: termsPresent(transcript, input.scenario.requiredTranscriptTerms ?? []),
      forbiddenFinalClaimsPromised: forbiddenClaimPromises(assistantText, input.scenario.forbiddenFinalTerms ?? []),
      toolNames: threadToolNames(store, input.threadId),
      childThreadKinds: runs.map((run) => store.getThread(run.childThreadId).kind),
      childThreadCollapsedByDefault: runs.map((run) => store.getThread(run.childThreadId).collapsedByDefault),
      terminalChildStatuses: runs.map((run) => run.status),
      startedChildCount: runs.filter((run) => subagentRunStarted(store.listSubagentRunEvents(run.id).map((event) => event.type))).length,
      recoverableLaunchFailureCount: runs.filter((run) => subagentRunLaunchRejected(store.listSubagentRunEvents(run.id).map((event) => event.type))).length,
      hasHtmlArtifact: workspaceHtmlArtifacts.length > 0,
      selectedContextPaths: input.context.map((item) => item.path),
    },
    ...(input.error ? { error: input.error instanceof Error ? input.error.stack ?? input.error.message : String(input.error) } : {}),
  };
}

function assertScenarioPassed(scenario: ScenarioSpec, record: ScenarioRecord): void {
  const startedChildRuns = record.childRuns.filter((run) => run.started);
  const launchRejectedRuns = record.childRuns.filter((run) => subagentRunLaunchRejected(run.runtimeEventTypes));
  const expectedMinStartedChildren = scenario.expectedMinStartedChildren ?? scenario.expectedMinChildren;
  expect(record.childThreadCount, `${scenario.title} should spawn visible child threads`).toBeGreaterThanOrEqual(scenario.expectedMinChildren);
  expect(record.export.childThreadCount, `${scenario.title} export should include child threads`).toBeGreaterThanOrEqual(scenario.expectedMinChildren);
  expect(record.waitBarrierCount, `${scenario.title} should record wait-barrier evidence`).toBeGreaterThan(0);
  expect(startedChildRuns.length, `${scenario.title} should start enough child sessions after any recoverable launch rejections`).toBeGreaterThanOrEqual(expectedMinStartedChildren);
  expect(startedChildRuns.every((run) => run.runtimeEventTypes.includes("subagent.runtime_event"))).toBe(true);
  expect(startedChildRuns.every((run) => run.resultSynthesisAllowed), `${scenario.title} should synthesize only from completed or explicit-partial child results`).toBe(true);
  expect(
    record.childRuns.filter((run) => !run.started && !subagentRunLaunchRejected(run.runtimeEventTypes)),
    `${scenario.title} non-started child rows should be explicit launch rejections, not ambiguous dead rows`,
  ).toEqual([]);
  for (const child of record.childRuns) {
    expect(store.getThread(child.childThreadId), `${scenario.title} child thread ${child.id} should be visible and collapsed`).toMatchObject({
      kind: "subagent_child",
      parentThreadId: record.threadId,
      collapsedByDefault: true,
    });
  }
  const assistant = record.threadId ? threadAssistantText(store, record.threadId) : record.assistantTextPreview ?? "";
  if (startedChildRuns.some((run) => run.resultArtifactPartial)) {
    expect(finalAnswerLabelsPartialWork(assistant), `${scenario.title} final answer should clearly label explicit partial child results`).toBe(true);
  }
  if (launchRejectedRuns.length > 0) {
    expect(startedChildRuns.length, `${scenario.title} should recover from launch rejections by starting replacement child sessions`).toBeGreaterThanOrEqual(expectedMinStartedChildren);
  }
  for (const term of scenario.requiredFinalTerms) {
    expect(assistant.toLowerCase(), `${scenario.title} final answer should include ${term}`).toContain(term.toLowerCase());
  }
  for (const group of scenario.requiredFinalTermAlternatives ?? []) {
    expect(
      group.alternatives.some((term) => assistant.toLowerCase().includes(term.toLowerCase())),
      `${scenario.title} final answer should include ${group.label} as one of: ${group.alternatives.join(", ")}`,
    ).toBe(true);
  }
  expect(record.threadId, `${scenario.title} record should include the parent thread id`).toBeTruthy();
  if (!record.threadId) return;
  const transcript = threadTranscript(store, record.threadId);
  for (const term of scenario.requiredTranscriptTerms ?? []) {
    expect(transcript.toLowerCase(), `${scenario.title} transcript should include ${term}`).toContain(term.toLowerCase());
  }
  for (const term of scenario.forbiddenFinalTerms ?? []) {
    expect(forbiddenClaimLooksPromised(assistant, term), `${scenario.title} final answer should avoid promising ${term}`).toBe(false);
  }
  if (scenario.requiresHtmlArtifact) {
    expect(record.workspaceHtmlArtifacts.length, `${scenario.title} should create a workspace HTML artifact`).toBeGreaterThan(0);
  }
}

async function prepareScenarioWorkspace(scenario: ScenarioSpec): Promise<WorkspaceContextReference[]> {
  if (!scenario.preparesDocumentFixtures) return [];
  const docsDir = join(workspacePath, "docs");
  await mkdir(docsDir, { recursive: true });
  const markdownPath = join(docsDir, "field-notes.md");
  const pdfPath = join(docsDir, "vendor-memo.pdf");
  const docxPath = join(docsDir, "finance-summary.docx");
  await writeFile(markdownPath, [
    "# Sonoran Launch Field Notes",
    "",
    "Owner: Priya Shah.",
    "Budget: $42,000.",
    "Launch date: July 15, 2026.",
    "Vendor risk: Acme Maps license renewal is not confirmed.",
  ].join("\n"), "utf8");
  await writeFile(pdfPath, createPdfFixture([
    "Sonoran Launch vendor memo.",
    "Owner: Priya Shah.",
    "Budget: $45,000.",
    "Launch date: July 22, 2026.",
    "Vendor risk: Acme Maps renewal must be verified.",
  ]));
  await writeFile(docxPath, await createDocxFixture([
    "Sonoran Launch finance summary.",
    "Owner: Marco Lee.",
    "Budget: $42,000.",
    "Launch date: July 15, 2026.",
    "Vendor risk: finance has not received final Acme Maps terms.",
  ]));
  return [
    { kind: "file", path: "docs/field-notes.md", name: "field-notes.md" },
    { kind: "file", path: "docs/vendor-memo.pdf", name: "vendor-memo.pdf" },
    { kind: "file", path: "docs/finance-summary.docx", name: "finance-summary.docx" },
  ];
}

function finalAnswerLabelsPartialWork(text: string): boolean {
  const haystack = text.toLowerCase();
  return [
    "partial",
    "caveat",
    "unavailable",
    "not live",
    "not verified",
    "planning estimate",
    "planning estimates",
    "verify before booking",
  ].some((term) => haystack.includes(term));
}

function requiredAlternativesPresent(
  text: string,
  groups: NonNullable<ScenarioSpec["requiredFinalTermAlternatives"]>,
): Record<string, boolean> {
  const haystack = text.toLowerCase();
  return Object.fromEntries(groups.map((group) => [
    group.label,
    group.alternatives.some((term) => haystack.includes(term.toLowerCase())),
  ]));
}

function subagentRunStarted(runtimeEventTypes: string[]): boolean {
  return runtimeEventTypes.includes("subagent.child_session_started")
    || runtimeEventTypes.includes("subagent.retry_child_session_started")
    || runtimeEventTypes.includes("subagent.followup_child_session_started");
}

function subagentRunLaunchRejected(runtimeEventTypes: string[]): boolean {
  return runtimeEventTypes.includes("subagent.spawn_rejected");
}

async function exportAndInspectChat(scenarioId: string, threadId: string): Promise<ScenarioRecord["export"]> {
  const payload = await createChatExportBundle(store, threadId, {
    appName: "Ambient Desktop",
    appVersion: "scenario-dogfood",
    now: new Date("2026-06-14T12:00:00.000Z"),
  });
  const exportPath = join(RESULTS_DIR, `${scenarioId}-chat-export.zip`);
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(exportPath, payload.archive);
  const zip = await JSZip.loadAsync(payload.archive);
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  const childIndexFile = zip.file("child-threads/index.json");
  const childIndex = childIndexFile ? JSON.parse(await childIndexFile.async("string")) : undefined;
  return {
    path: exportPath,
    bytes: payload.archive.length,
    childThreadCount: childIndex?.childThreadCount ?? manifest.export?.childThreadCount ?? 0,
    includedFiles: manifest.export?.includedFiles ?? [],
  };
}

async function writeScenarioReport(record: ScenarioRecord): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

async function writeAggregateReport(): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const aggregate = {
    schemaVersion: "ambient-subagent-scenario-dogfood-v1",
    generatedAt: new Date().toISOString(),
    provider: liveAmbientProviderLabel(),
    model: liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_LIVE_MODEL", "AMBIENT_WORKFLOW_MODEL"],
      fallbackModel: AMBIENT_KIMI_K2_7_CODE_MODEL,
    }),
    plan: "subagentTestPlan.html",
    scenarioCount: scenarios.length,
    passedCount: records.filter((record) => record.status === "passed" && !record.error).length,
    failedCount: records.filter((record) => record.status === "failed" || record.error).length,
    records,
  };
  await writeFile(join(RESULTS_DIR, "latest.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
}

async function findWorkspaceHtmlArtifacts(root: string): Promise<string[]> {
  const found: string[] = [];
  await visit(root);
  return found;

  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".ambient" || entry.name === ".ambient-codex" || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (extname(entry.name).toLowerCase() === ".html") {
        const content = await readFile(path, "utf8").catch(() => "");
        if (/habit|july|localStorage|local storage/i.test(content)) found.push(relative(root, path));
      }
    }
  }
}

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  store: ProjectStore;
  threadId: string;
  send: () => Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void (async () => {
        await abortWithBoundedWait(input.runtime, input.threadId, 10_000);
        reject(new Error(`Sub-agent scenario dogfood timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
      })();
    }, input.timeoutMs);
  });
  const send = new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      input.send().then(resolve, reject);
    });
  });
  try {
    await Promise.race([send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function abortWithBoundedWait(runtime: AgentRuntime, threadId: string, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      runtime.abort(threadId).catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function threadAssistantText(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .filter((message) => message.role === "assistant" && message.metadata?.kind !== "thinking")
    .map((message) => message.content)
    .join("\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message: ChatMessage) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .slice(-10)
    .map((message) => {
      const tool = message.metadata?.toolName ? ` tool=${message.metadata.toolName}` : "";
      return `${message.role}${tool}: ${message.content.replace(/\s+/g, " ").slice(0, 800)}`;
    })
    .join("\n");
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
