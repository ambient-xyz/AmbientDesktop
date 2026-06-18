import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowDiscoveryQuestionCategory } from "../../shared/workflowTypes";
import { AGGRESSIVE_RETRY_BACKOFF_MS, aggressiveAmbientRetryPolicy } from "../ambient/aggressiveRetries";
import { pluginMcpToolDescriptor } from "./workflowDiscoveryDesktopToolFacade";
import type { PluginMcpToolRegistration } from "./workflowDiscoveryPluginsFacade";
import { permissionGrantTargetHash } from "../permissions/permissionGrants";
import {
  describeWorkflowDiscoveryCapability,
  searchWorkflowDiscoveryCapabilities,
  workflowDiscoveryCapabilityAwarePolicySummary,
} from "./workflowDiscoveryCapabilitySearch";
import {
  AmbientWorkflowDiscoveryProvider,
  buildAmbientWorkflowDiscoveryPrompt,
  buildAmbientWorkflowDiscoveryPromptParts,
  DeterministicWorkflowDiscoveryProvider,
  normalizeWorkflowDiscoveryProviderOutput,
} from "./workflowDiscoveryProvider";
import { buildWorkflowDiscoveryPolicyContext, workflowDiscoveryPolicyContextSummary } from "./workflowDiscoveryPolicy";
import type { WorkflowPiTextCallInput } from "./workflowDiscoveryWorkflowFacade";

describe("workflowDiscoveryProvider", () => {
  let workspacePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-discovery-provider-"));
    await writeFile(join(workspacePath, "requirements.md"), "# Requirements\n", "utf8");
    await writeFile(join(workspacePath, ".env"), "SECRET=value\n", "utf8");
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("generates a bounded deterministic batch from safe policy metadata", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const output = await new DeterministicWorkflowDiscoveryProvider().generate({
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope", "data_sources", "model_role", "side_effects", "error_handling"],
    });

    expect(output.provider).toBe("deterministic");
    expect(output.questions.map((question) => question.category)).toEqual(["scope", "data_sources", "model_role"]);
    expect(output.questions[1].context).toContain("requirements.md");
    expect(output.questions[1].context).toContain("Secret-like paths skipped: 1");
  });

  it("redacts skipped secret path names from the Ambient prompt payload", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope", "data_sources"],
    });

    expect(prompt).toContain("requirements.md");
    expect(prompt).toContain("blockedAccessSummary");
    expect(prompt).toContain("Secret-like paths skipped: 1");
    expect(prompt).toContain("secret-like file skipped");
    expect(prompt).not.toContain(".env");
    expect(prompt).not.toContain("SECRET=value");
  });

  it("tells Ambient discovery not to substitute workspace inventory for explicit local_directory_list requests", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const capabilitySearch = searchWorkflowDiscoveryCapabilities({
      query: "Use local_directory_list exactly once to categorize my Downloads folder using metadata only.",
      context: policyContext,
    });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Use local_directory_list exactly once to categorize my Downloads folder using metadata only.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryCapabilityAwarePolicySummary(policyContext, capabilitySearch),
      capabilitySearch,
      remainingCategories: ["data_sources"],
    });

    expect(prompt).toContain("Built-in local directory rule");
    expect(prompt).toContain("do not say local_directory_list is unavailable");
    expect(prompt).toContain("do not substitute workspace.inventory");
    expect(prompt).toContain("Local filesystem: Downloads directory");
    expect(prompt).toContain("local_directory_list workflow tool");
  });

  it("defaults model-role discovery to Ambient Desktop's selected model instead of external LLM provider choice", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Review my last 100 emails and categorize them.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["model_role"],
    });
    const output = normalizeWorkflowDiscoveryProviderOutput(
      {
        questions: [
          {
            category: "model_role",
            context: "The workflow needs a categorization model call.",
            question: "Which model should perform the text-based email categorization?",
            choices: [
              {
                id: "cloud",
                label: "Cloud LLM (e.g., GPT-4, Claude)",
                description: "Use a powerful cloud-based language model. Requires internet access and an API key grant.",
                recommended: true,
              },
              {
                id: "local",
                label: "Local LLM",
                description: "Use a local language model. Requires a local inference server or Ollama setup.",
              },
            ],
            allowFreeform: true,
          },
        ],
      },
      {
        provider: "ambient",
        policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
        remainingCategories: ["model_role"],
      },
    );

    expect(prompt).toContain("Ambient Desktop already provides the selected LLM");
    expect(output.questions[0]).toMatchObject({
      category: "model_role",
      question: "What should the selected Ambient Desktop model do inside this workflow?",
    });
    expect(output.questions[0].choices.map((choice) => choice.label)).toEqual(["Extract/classify", "Summarize", "Rank/review"]);
    expect(output.questions[0].context).toContain("no separate cloud LLM, local LLM, or API-key grant is needed");
  });

  it("includes grant-approved content excerpts in the Ambient prompt payload", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      workflowThreadId: "workflow-thread-1",
      threadId: "workflow-thread-1",
      grants: [
        {
          id: "grant-requirements",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          createdBy: "user",
          permissionModeAtCreation: "workspace",
          scopeKind: "workflow_thread",
          workflowThreadId: "workflow-thread-1",
          actionKind: "file_content_read",
          targetKind: "path",
          targetHash: permissionGrantTargetHash("file_content_read", "path", "requirements.md"),
          targetLabel: "requirements.md",
          source: "permission_prompt",
          reason: "Allowed discovery content.",
        },
      ],
    });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope", "data_sources"],
    });

    expect(prompt).toContain("contentExcerpts");
    expect(prompt).toContain("# Requirements");
    expect(prompt).toContain("grant-requirements");
    expect(prompt).not.toContain("SECRET=value");
  });

  it("passes capability search results instead of the full plugin inventory to Ambient discovery", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      pluginRegistrations: [
        fixturePluginRegistration("arxiv_search", "arXiv paper search", "Search arXiv paper metadata."),
        fixturePluginRegistration("slack_search", "Slack message search", "Search Slack messages."),
      ],
    });
    const capabilitySearch = searchWorkflowDiscoveryCapabilities({
      query: "Find recent papers on the placebo effect from arxiv and create summaries.",
      context: policyContext,
    });
    const capabilityDescription = describeWorkflowDiscoveryCapability({
      capabilityId: capabilitySearch.results[0]!.id,
      query: capabilitySearch.query,
      context: policyContext,
    });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Find recent papers on the placebo effect from arxiv and create summaries.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryCapabilityAwarePolicySummary(policyContext, capabilitySearch),
      capabilitySearch,
      capabilityDescriptions: capabilityDescription ? [capabilityDescription] : [],
      remainingCategories: ["data_sources"],
    });

    expect(prompt).toContain("capabilitySearch");
    expect(prompt).toContain("capabilityDescriptions");
    expect(prompt).toContain("arXiv paper search via Fixture");
    expect(prompt).toContain("Browser research on arxiv.org");
    expect(prompt).toContain("Describe exposes plugin metadata only");
    expect(prompt).toContain("plugin_defined");
    expect(prompt).not.toContain("Slack message search");
    expect(prompt).toContain("prefer matching workflow-safe plugin/tool/Ambient CLI results before browser fallbacks");
  });

  it("passes search routing state into the Ambient discovery prompt", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({
      projectPath: workspacePath,
      searchRoutingSettings: {
        webSearch: { activity: "web_search", preferredProvider: "brave-search", mode: "require", fallback: "block" },
      },
    });
    const capabilitySearch = searchWorkflowDiscoveryCapabilities({
      query: "Find current public webpages about compact workflow engines.",
      context: policyContext,
    });
    const prompt = buildAmbientWorkflowDiscoveryPrompt({
      workflowThreadId: "workflow-thread-1",
      request: "Find current public webpages about compact workflow engines.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryCapabilityAwarePolicySummary(policyContext, capabilitySearch),
      capabilitySearch,
      remainingCategories: ["data_sources"],
    });

    expect(prompt).toContain("Search routing: web_search requires Ambient CLI provider");
    expect(prompt).toContain("Browser web research blocked by search routing");
    expect(prompt).toContain('"recommendation": "blocked"');
  });

  it("keeps Ambient discovery policy metadata in the stable cache prefix", () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const baseInput = {
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope", "data_sources"] as WorkflowDiscoveryQuestionCategory[],
    };
    const first = buildAmbientWorkflowDiscoveryPromptParts(baseInput);
    const second = buildAmbientWorkflowDiscoveryPromptParts({
      ...baseInput,
      existingQuestions: [
        {
          id: "question-1",
          workflowThreadId: "workflow-thread-1",
          category: "scope",
          context: "Scope context",
          question: "What output should be generated?",
          choices: [
            { id: "brief", label: "Brief", description: "Generate a concise brief.", recommended: true },
            { id: "table", label: "Table", description: "Generate a structured table." },
          ],
          allowFreeform: true,
          createdAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    });

    expect(first.cacheCheckpoint.stage).toBe("discovery");
    expect(first.cacheCheckpoint.stablePrefixHash).toBe(second.cacheCheckpoint.stablePrefixHash);
    expect(first.cacheCheckpoint.mutableSuffixHash).not.toBe(second.cacheCheckpoint.mutableSuffixHash);
  });

  it("normalizes Ambient JSON into planner-style discovery questions", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    let requestBody: unknown;
    const fetchImpl: typeof fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `\`\`\`json
{
  "graphSummary": "Manual digest workflow with a scoped input directory.",
  "graphPatch": {
    "summary": "Requirements digest plan with source metadata.",
    "upsertNodes": [
      {
        "id": "requirements-source",
        "type": "data_source",
        "label": "Requirements source",
        "description": "Safe requirements metadata."
      }
    ],
    "upsertEdges": [
      {
        "id": "request-to-requirements-source",
        "source": "request",
        "target": "requirements-source",
        "type": "data_flow"
      }
    ]
  },
  "questions": [
    {
      "category": "scope",
      "context": "The request mentions a weekly requirements digest; scope determines trigger and output shape.",
      "question": "What should count as a successful requirements digest?",
      "choices": [
        {
          "id": "summary-report",
          "label": "Summary report",
          "description": "Produce a concise report for review.",
          "recommended": true
        },
        {
          "id": "structured-table",
          "label": "Structured table",
          "description": "Extract requirements into a typed table."
        }
      ],
      "allowFreeform": true,
      "graphImpact": "Updates the request and output nodes."
    }
  ]
}
\`\`\``,
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const output = await new AmbientWorkflowDiscoveryProvider({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      fetchImpl,
    }).generate({
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope"],
    });

    expect(output.provider).toBe("ambient");
    expect(output.providerModel).toBe(AMBIENT_DEFAULT_MODEL);
    expect(output.graphSummary).toContain("Manual digest");
    expect(output.graphPatch).toMatchObject({
      summary: "Requirements digest plan with source metadata.",
      upsertNodes: [expect.objectContaining({ id: "requirements-source", type: "data_source" })],
    });
    expect(output.questions[0]).toMatchObject({
      category: "scope",
      question: "What should count as a successful requirements digest?",
      allowFreeform: true,
      graphImpact: "Updates the request and output nodes.",
    });
    expect(output.questions[0].choices[0]).toMatchObject({ id: "summary-report", recommended: true });
    expect(requestBody).toMatchObject({
      reasoning: { effort: "none", enabled: false, exclude: true },
      enable_thinking: false,
      stream: false,
    });
    expect(JSON.stringify(requestBody)).not.toContain(".env");
    expect(JSON.stringify(requestBody)).not.toContain("SECRET=value");
  });

  it("retries an empty Pi discovery response before surfacing failure", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const calls: WorkflowPiTextCallInput[] = [];
    const progressStages: string[] = [];
    const textCall = async (input: WorkflowPiTextCallInput): Promise<string> => {
      calls.push(input);
      if (calls.length === 1) return "";
      return JSON.stringify({
        questions: [
          {
            category: "scope",
            context: "The workflow needs an output scope.",
            question: "What should the workflow produce?",
            choices: [
              { id: "brief", label: "Brief", description: "Write a short brief.", recommended: true },
              { id: "table", label: "Table", description: "Write a structured table." },
            ],
            allowFreeform: true,
          },
        ],
      });
    };

    const output = await new AmbientWorkflowDiscoveryProvider({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall,
    }).generate(
      {
        workflowThreadId: "workflow-thread-1",
        request: "Build a weekly requirements digest.",
        projectPath: workspacePath,
        policyContext,
        policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
        remainingCategories: ["scope"],
      },
      {
        onProgress: (progress) => progressStages.push(progress.stage),
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.sessionId)).toEqual(["workflow-thread-1", "workflow-thread-1"]);
    expect(calls.map((call) => call.idleTimeoutMs)).toEqual([120_000, 120_000]);
    expect(calls[0].retryPolicy).toMatchObject({ enabled: true, maxRetries: 3 });
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(progressStages).toContain("retrying");
    expect(output.questions[0]).toMatchObject({ category: "scope", question: "What should the workflow produce?" });
  });

  it("passes the aggressive retry policy to Pi discovery calls", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const calls: WorkflowPiTextCallInput[] = [];
    const textCall = async (input: WorkflowPiTextCallInput): Promise<string> => {
      calls.push(input);
      return JSON.stringify({
        questions: [
          {
            category: "scope",
            context: "The workflow needs an output scope.",
            question: "What should the workflow produce?",
            choices: [
              { id: "brief", label: "Brief", description: "Write a short brief.", recommended: true },
              { id: "table", label: "Table", description: "Write a structured table." },
            ],
            allowFreeform: true,
          },
        ],
      });
    };

    const output = await new AmbientWorkflowDiscoveryProvider({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      retryPolicy: aggressiveAmbientRetryPolicy(),
      textCall,
    }).generate({
      workflowThreadId: "workflow-thread-1",
      request: "Build a weekly requirements digest.",
      projectPath: workspacePath,
      policyContext,
      policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
      remainingCategories: ["scope"],
    });

    expect(output.questions[0]).toMatchObject({ category: "scope", question: "What should the workflow produce?" });
    expect(calls).toHaveLength(1);
    expect(calls[0].retryPolicy).toMatchObject({ enabled: true, maxRetries: AGGRESSIVE_RETRY_BACKOFF_MS.length, providerMaxRetryDelayMs: 5_000 });
    expect(calls[0].retryPolicy?.backoffMs).toEqual([...AGGRESSIVE_RETRY_BACKOFF_MS]);
  });

  it("retries malformed Pi discovery JSON before pausing discovery", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const calls: WorkflowPiTextCallInput[] = [];
    const progressStages: string[] = [];
    const textCall = async (input: WorkflowPiTextCallInput): Promise<string> => {
      calls.push(input);
      if (calls.length === 1) return '{"questions":[{"category":"scope" "context":"missing comma"}]}';
      return JSON.stringify({
        questions: [
          {
            category: "scope",
            context: "The retry returned valid JSON.",
            question: "What should the workflow produce?",
            choices: [
              { id: "brief", label: "Brief", description: "Write a short brief.", recommended: true },
              { id: "table", label: "Table", description: "Write a structured table." },
            ],
            allowFreeform: true,
          },
        ],
      });
    };

    const output = await new AmbientWorkflowDiscoveryProvider({
      apiKey: "test-key",
      model: AMBIENT_DEFAULT_MODEL,
      textCall,
    }).generate(
      {
        workflowThreadId: "workflow-thread-1",
        request: "Build a weekly requirements digest.",
        projectPath: workspacePath,
        policyContext,
        policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
        remainingCategories: ["scope"],
      },
      {
        onProgress: (progress) => progressStages.push(progress.stage),
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("Retry instruction:");
    expect(calls[1].prompt).toContain("previous discovery response failed validation");
    expect(calls[1].prompt).toContain("Return exactly one complete JSON object");
    expect(calls[1].idleTimeoutMs).toBe(120_000);
    expect(progressStages).toContain("retrying");
    expect(output.questions[0]).toMatchObject({ category: "scope", context: "The retry returned valid JSON." });
  });

  it("aborts Ambient discovery requests after the configured timeout", async () => {
    const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
    const fetchImpl: typeof fetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
          return;
        }
        signal?.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          },
          { once: true },
        );
      });

    await expect(
      new AmbientWorkflowDiscoveryProvider({
        apiKey: "test-key",
        model: AMBIENT_DEFAULT_MODEL,
        fetchImpl,
        timeoutMs: 5,
      }).generate({
        workflowThreadId: "workflow-thread-1",
        request: "Build a weekly requirements digest.",
        projectPath: workspacePath,
        policyContext,
        policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
        remainingCategories: ["scope"],
      }),
    ).rejects.toThrow("Ambient workflow discovery timed out after 5ms.");
  });

  it("rejects out-of-scope categories from provider output", () => {
    expect(() =>
      normalizeWorkflowDiscoveryProviderOutput(
        {
          questions: [
            {
              category: "side_effects",
              context: "context",
              question: "question",
              choices: [
                { id: "a", label: "A", description: "A", recommended: true },
                { id: "b", label: "B", description: "B" },
              ],
              allowFreeform: true,
            },
          ],
        },
        {
          provider: "ambient",
          providerModel: AMBIENT_DEFAULT_MODEL,
          policyContextSummary: "summary",
          remainingCategories: ["scope"],
        },
      ),
    ).toThrow(/out-of-scope category/);
  });

  const liveIt = process.env.AMBIENT_WORKFLOW_DISCOVERY_LIVE === "1" ? it : it.skip;
  liveIt(
    "generates live Ambient revision discovery questions against the configured API",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      expect(apiKey).toBeTruthy();
      const policyContext = buildWorkflowDiscoveryPolicyContext({ projectPath: workspacePath });
      const output = await new AmbientWorkflowDiscoveryProvider({
        apiKey,
        baseUrl: process.env.AMBIENT_BASE_URL || process.env.AMBIENT_AGENT_AMBIENT_BASE_URL,
        model: process.env.AMBIENT_WORKFLOW_DISCOVERY_MODEL || AMBIENT_DEFAULT_MODEL,
        retryPolicy: aggressiveAmbientRetryPolicy(),
        timeoutMs: 85_000,
      }).generate({
        workflowThreadId: "workflow-thread-live",
        request: "Revise the weekly requirements digest to add review for uncertain extraction results.",
        projectPath: workspacePath,
        policyContext,
        policyContextSummary: workflowDiscoveryPolicyContextSummary(policyContext),
        remainingCategories: ["scope", "data_sources", "model_role"],
        revisionContext: {
          baseTitle: "Weekly requirements digest",
          baseGoal: "Build a weekly requirements digest from local notes.",
          baseSummary: "Read local notes and generate a concise requirements digest.",
          requestedChange: "Add review for uncertain extraction results.",
        },
      });

      expect(output.provider).toBe("ambient");
      expect(output.questions.length).toBeGreaterThanOrEqual(1);
      expect(output.questions.length).toBeLessThanOrEqual(3);
      expect(output.questions[0].choices.length).toBeGreaterThanOrEqual(2);
    },
    90_000,
  );
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
    originalName: registeredName,
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
