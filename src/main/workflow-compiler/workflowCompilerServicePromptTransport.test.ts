import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { aggressiveAmbientRetryPolicy } from "./workflowCompilerAmbientFacade";
import { firstPartyDesktopToolDescriptors } from "./workflowCompilerDesktopToolFacade";
import { googleWorkspaceConnectorDescriptors } from "./workflowCompilerGoogleWorkspaceFacade";
import {
  AmbientWorkflowCompilerProvider,
  buildWorkflowPlanDslPromptParts,
  buildWorkflowProgramIrPromptParts,
} from "./workflowCompilerService";
import type { WorkflowPiTextCallInput } from "./workflowCompilerWorkflowFacade";
import {
  callableRecordedWorkflowInvocationContext,
  callableSymphonyWorkflowInvocationContext,
  childCallableWorkflowCallerProvenance,
} from "./workflowCompilerServiceTestSupport";

describe("AmbientWorkflowCompilerProvider", () => {
  it("keeps in-app HTML and report outputs separate from staged file-write exports in the Plan DSL prompt", () => {
    const planPrompt = buildWorkflowPlanDslPromptParts({
      userRequest: "Create a simple HTML study card and return it in the workflow output.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });

    expect(planPrompt.stablePrefix).toContain("Output and mutation semantics:");
    expect(planPrompt.stablePrefix).toContain(
      "For a simple in-app HTML page, report, card, preview, or final answer, use model_interaction",
    );
    expect(planPrompt.stablePrefix).toContain(
      "Use staged_document_export only when the user explicitly asks to save, write, export to a local path",
    );
    expect(planPrompt.stablePrefix).toContain(
      "Do not infer a local file write merely from words like artifact, report, HTML, card, preview, or output.",
    );
  });

  it("adds callable workflow invocation provenance to compiler prompt mutable context", () => {
    const callableWorkflowInvocation = callableRecordedWorkflowInvocationContext({
      callerProvenance: childCallableWorkflowCallerProvenance(),
    });
    const programPrompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Compile the supplied recorded workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });
    const planPrompt = buildWorkflowPlanDslPromptParts({
      userRequest: "Compile the supplied recorded workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });

    expect(programPrompt.stablePrefix).not.toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Task: callable-task-1 / launch callable-launch-1");
    expect(programPrompt.mutableSuffix).toContain(
      "Caller: subagent_child_thread thread child-thread-1, run child-run-1, message child-message-1",
    );
    expect(programPrompt.mutableSuffix).toContain("Child bridge: sub-agent run subagent-run-1, task path parent/1");
    expect(programPrompt.mutableSuffix).toContain("Worktree isolation: required, isolated, path /tmp/ambient-child-worktree");
    expect(programPrompt.mutableSuffix).toContain("Approval provenance: required via child_bridge_policy, scope this_child_thread");
    expect(programPrompt.mutableSuffix).toContain("Recorded playbook: release-triage v4");
    expect(programPrompt.mutableSuffix).toContain("Compact invocation artifact: ./workflow-invocation.json");
    expect(programPrompt.mutableSuffix).toContain("Diagnostics trace artifact: ./diagnostics/full-trace.jsonl");
    expect(programPrompt.mutableSuffix).toContain('"goal": "Triage the supplied release notes."');
    expect(programPrompt.promptAssembly.modules.map((module) => module.id)).toContain("dynamic-callable-workflow-invocation");
    expect(planPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(planPrompt.promptAssembly.modules.map((module) => module.id)).toContain("dynamic-callable-workflow-invocation");
  });

  it("adds Symphony invocation choices and criteria to compiler prompt mutable context", () => {
    const callableWorkflowInvocation = callableSymphonyWorkflowInvocationContext();
    const programPrompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Compile the supplied Symphony workflow invocation.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
      callableWorkflowInvocation,
    });

    expect(programPrompt.mutableSuffix).toContain("Callable workflow invocation context:");
    expect(programPrompt.mutableSuffix).toContain("Symphony recipe: map_reduce");
    expect(programPrompt.mutableSuffix).toContain("Symphony invocation customization: ambient-callable-workflow-symphony-invocation-v1");
    expect(programPrompt.mutableSuffix).toContain(
      "Selected builder choices: pattern-scope=Files: Split across selected workspace files or search results.",
    );
    expect(programPrompt.mutableSuffix).toContain(
      "Required metric criteria: map_reduce-metric=Every mapped implementation section has cited evidence.",
    );
  });

  it("instructs local directory workflows to preserve skipped metadata through final artifacts", () => {
    const localDirectoryTool = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "local_directory_list");
    expect(localDirectoryTool).toBeTruthy();

    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Categorize my Downloads folder using metadata only.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: [localDirectoryTool!],
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Capability guidance local-directory-skipped-metadata");
    expect(fullPrompt).toContain("Local-directory workflow guidance");
    expect(fullPrompt).toContain('{"fromHandle":"listNode.skipped"}');
    expect(fullPrompt).toContain("checkpoint.write");
    expect(fullPrompt).toContain("model.call input");
    expect(fullPrompt).toContain("document.render input");
    expect(fullPrompt).toContain("output.final");
    expect(fullPrompt).toContain("never read or expose skipped file contents");
  });

  it("instructs large Gmail metadata-first workflows to gate full-body detail reads", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Categorize 1,000 Gmail messages, but ask before reading full bodies.",
      workspaceSummary: "Test workspace with Gmail available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Recipe metadata_first_personal_data_review");
    expect(fullPrompt).toContain("connector.paginate with google.gmail search");
    expect(fullPrompt).toContain("metadata-only");
    expect(fullPrompt).toContain("review.input");
    expect(fullPrompt).toContain("google.gmail readThread or readAttachment");
    expect(fullPrompt).toContain("never include Gmail draft/send/delete/update operations");
  });

  it("instructs bounded Gmail detail workflows to read threads before synthesis", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest:
        "Review the last 100 emails in Gmail, fetch enough message or thread detail, and report action required, urgency, sender/domain, and recurring themes.",
      workspaceSummary: "Test workspace with Gmail available.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: googleWorkspaceConnectorDescriptors({
        adapter: "gws",
        states: {
          "google.gmail": {
            status: "available",
            accounts: [{ id: "default", label: "Default Google account" }],
          },
        },
      }).filter((connector) => connector.id === "google.gmail"),
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Gmail detail rule");
    expect(fullPrompt).toContain("do not synthesize from search snippets alone");
    expect(fullPrompt).toContain("connector.map google.gmail readThread");
    expect(fullPrompt).not.toContain("Recipe metadata_first_personal_data_review");
  });

  it("instructs current-data workflows to preserve location in final output", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Recommend whether to go to a movie tonight in Scottsdale.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Recipe current_web_research");
    expect(fullPrompt).not.toContain("Current-data rule");
    expect(fullPrompt).toContain("location when location-specific");
    expect(fullPrompt).toContain("Do not rely on model knowledge for current facts");
  });

  it("publishes stable output reference paths for review gates and rendered documents", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Build a PDF report and ask before writing it.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain("Known reference path contract");
    expect(fullPrompt).toContain("review.input outputs requestId, choiceId, text, and prompt");
    expect(fullPrompt).toContain("use choiceId, never choice or selectedChoice");
    expect(fullPrompt).toContain("document.render outputs artifactPath, path, content, bytes, and mimeType");
    expect(fullPrompt).toContain("mutation.stage/file_write outputs path and bytes");
  });

  it("teaches WorkflowProgramIR planning to prefer registry handles over raw paths", () => {
    const prompt = buildWorkflowProgramIrPromptParts({
      userRequest: "Ask for one decision, synthesize a short report, and stage a rendered file.",
      workspaceSummary: "Test workspace.",
      toolDescriptors: firstPartyDesktopToolDescriptors(),
      ambientCliCapabilities: [],
      connectorDescriptors: [],
      discoveryQuestions: [],
      explorationTraces: [],
    });
    const fullPrompt = `${prompt.stablePrefix}\n${prompt.mutableSuffix}`;

    expect(fullPrompt).toContain('use {"fromHandle":"producerAlias.outputField"}');
    expect(fullPrompt).toContain("askUser.choiceId");
    expect(fullPrompt).toContain("renderReport.artifactPath");
    expect(fullPrompt).toContain('"fromHandle": "askUser.choiceId"');
    expect(fullPrompt).toContain('"fromHandle": "synthesize.summary"');
    expect(fullPrompt).not.toContain('Reference prior outputs with {"fromNode":"node-id","path":"optional.field.path"}');
  });

  it("uses a no-reasoning JSON-only Pi call for compiler capability discovery", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        input.onProgress?.({
          outputChars: 64,
          thinkingChars: 0,
          elapsedMs: 250,
          idleElapsedMs: 0,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        return '{"queries":[{"query":"web research"}],"requiredToolNames":["browser_content"],"openQuestions":[]}';
      },
    });
    const progress: string[] = [];

    await expect(
      provider.discoverCapabilities({
        prompt: "discover",
        model: AMBIENT_DEFAULT_MODEL,
        onProgress: (event) => progress.push(event.stage),
      }),
    ).resolves.toEqual({
      queries: [{ query: "web research" }],
      requiredToolNames: ["browser_content"],
      requiredConnectorIds: [],
      openQuestions: [],
    });
    expect(calls[0]).toMatchObject({
      prompt: "discover",
      maxTokens: 1_200,
      reasoning: false,
      responseFormat: {
        type: "json_schema",
        json_schema: expect.objectContaining({
          name: "workflow_compiler_capability_discovery",
          strict: true,
        }),
      },
      idleTimeoutMs: 60_000,
      absoluteTimeoutMs: 120_000,
    });
    expect(progress).toContain("streaming");
  });

  it("uses a no-source JSON-only Pi call for WorkflowProgramIR planning", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return '{"version":1,"title":"IR","goal":"Compile IR.","nodes":[{"id":"final","kind":"output.final","value":{"literal":"ok"}}]}';
      },
    });
    const cacheCheckpoint = {
      id: "cache",
      stage: "compile" as const,
      workflowThreadId: "thread-1",
      stablePrefixHash: "stable",
      stablePrefixChars: 1,
      stablePrefixEstimatedTokens: 1,
      mutableSuffixHash: "mutable",
      mutableSuffixChars: 1,
      mutableSuffixEstimatedTokens: 1,
      requestHash: "request",
      requestEstimatedTokens: 1,
      boundaryLabel: "boundary",
      createdAt: "2026-05-15T00:00:00.000Z",
    };

    await provider.compileProgramIr?.({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, cacheCheckpoint });

    expect(calls[0]).toMatchObject({
      prompt: "program-ir",
      sessionId: "thread-1",
      responseFormat: { type: "json_object" },
      reasoning: false,
      maxTokens: 6_000,
    });
    expect(calls[0].systemPrompt).toContain("WorkflowProgramIR");
    expect(calls[0].systemPrompt).toContain("Do not generate source code");
  });

  it("uses a typed-operation no-source Pi call for WorkflowProgramIR repair", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return '{"repairOperations":[{"kind":"replace_with_alternative","path":"/nodes/0/tool","value":"browser_search"}]}';
      },
    });
    const cacheCheckpoint = {
      id: "cache",
      stage: "compile" as const,
      workflowThreadId: "thread-1",
      stablePrefixHash: "stable",
      stablePrefixChars: 1,
      stablePrefixEstimatedTokens: 1,
      mutableSuffixHash: "mutable",
      mutableSuffixChars: 1,
      mutableSuffixEstimatedTokens: 1,
      requestHash: "request",
      requestEstimatedTokens: 1,
      boundaryLabel: "boundary",
      createdAt: "2026-05-15T00:00:00.000Z",
    };

    await expect(
      provider.repairProgramIr?.({ prompt: "repair-ir", model: AMBIENT_DEFAULT_MODEL, cacheCheckpoint, attempt: 1 }),
    ).resolves.toEqual({
      repairOperations: [{ kind: "replace_with_alternative", path: "/nodes/0/tool", value: "browser_search" }],
    });

    expect(calls[0]).toMatchObject({
      prompt: "repair-ir",
      sessionId: "thread-1",
      responseFormat: { type: "json_object" },
      reasoning: false,
      maxTokens: 2_000,
    });
    expect(calls[0].systemPrompt).toContain("WorkflowProgramIR repairer");
    expect(calls[0].systemPrompt).toContain('"repairOperations"');
    expect(calls[0].systemPrompt).toContain("typed repair operations");
    expect(calls[0].systemPrompt).toContain("Do not generate source code");
  });

  it("uses Pi transport with the workflow compiler idle watchdog", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        input.onProgress?.({
          outputChars: 17,
          thinkingChars: 3,
          elapsedMs: 500,
          idleElapsedMs: 0,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        return '{"title":"Compiled"}';
      },
    });
    const progress: string[] = [];

    await expect(
      provider.compileProgramIr({
        prompt: "program-ir",
        model: AMBIENT_DEFAULT_MODEL,
        onProgress: (event) => progress.push(event.timeoutMode ?? ""),
      }),
    ).resolves.toEqual({
      title: "Compiled",
    });
    expect(calls[0]).toMatchObject({
      idleTimeoutMs: 120_000,
      reasoning: false,
      responseFormat: { type: "json_object" },
      sessionId: undefined,
    });
    expect(calls[0].timeoutMs).toBe(480_000);
    expect(progress).toContain("idle_watchdog");
  });

  it("retries an empty Pi compiler response with the same compiler contract", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return calls.length === 1 ? "" : '{"title":"Compiled after retry"}';
      },
    });
    const stages: string[] = [];

    await expect(
      provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) }),
    ).resolves.toEqual({
      title: "Compiled after retry",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).toBe("program-ir");
    expect(calls[1].prompt).toContain("Workflow compiler retry instruction:");
    expect(calls[1].prompt).toContain("Ambient workflow compiler returned an empty response.");
    expect(calls[1].prompt).toContain("Do not generate TypeScript or JavaScript.");
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(stages).toContain("retrying");
  });

  it("retries transient Pi compiler provider failures before surfacing them", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        if (calls.length === 1) throw new Error("429 Upstream request failed after 378ms");
        return '{"title":"Compiled after provider retry"}';
      },
    });
    const stages: string[] = [];

    await expect(
      provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) }),
    ).resolves.toEqual({
      title: "Compiled after provider retry",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toBe("program-ir");
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(stages).toContain("retrying");
  });

  it("passes aggressive retry policy to compiler Pi calls", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      retryPolicy: aggressiveAmbientRetryPolicy(),
      textCall: async (input) => {
        calls.push(input);
        return '{"title":"Compiled with aggressive policy"}';
      },
    });

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL })).resolves.toEqual({
      title: "Compiled with aggressive policy",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].retryPolicy).toMatchObject({ enabled: true, maxRetries: 10, providerMaxRetryDelayMs: 5_000 });
    expect(calls[0].retryPolicy?.backoffMs).toEqual([1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000]);
  });

  it("retries compiler calls without thinking when Pi emits only thinking and no JSON output", async () => {
    const previousThinkingChars = process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS;
    process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = "10";
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        if (calls.length === 1) {
          input.onProgress?.({
            outputChars: 0,
            thinkingChars: 10,
            elapsedMs: 1_000,
            idleElapsedMs: 0,
            idleTimeoutMs: input.idleTimeoutMs,
            timeoutMode: "idle_watchdog",
            stage: "thinking",
          });
          if (input.signal?.aborted) throw input.signal.reason ?? new Error("aborted");
        }
        return '{"title":"Compiled without thinking"}';
      },
    });
    const stages: string[] = [];

    try {
      await expect(
        provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL, onProgress: (event) => stages.push(event.stage) }),
      ).resolves.toEqual({
        title: "Compiled without thinking",
      });
    } finally {
      if (previousThinkingChars === undefined) delete process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS;
      else process.env.AMBIENT_WORKFLOW_COMPILER_NO_OUTPUT_THINKING_CHARS = previousThinkingChars;
    }

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.reasoning)).toEqual([false, false]);
    expect(calls[1].prompt).toContain("thinking without emitting workflow JSON output");
    expect(stages).toEqual(expect.arrayContaining(["thinking", "retrying"]));
  });

  it("surfaces the validation error when Pi compiler retry still returns invalid JSON", async () => {
    const calls: WorkflowPiTextCallInput[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        calls.push(input);
        return calls.length === 1 ? "" : "{";
      },
    });

    await expect(provider.compileProgramIr({ prompt: "program-ir", model: AMBIENT_DEFAULT_MODEL })).rejects.toThrow(
      "Ambient workflow compiler did not return valid JSON",
    );
    expect(calls).toHaveLength(2);
  });

  it("forwards compiler output progress character counts", async () => {
    const progress: number[] = [];
    const provider = new AmbientWorkflowCompilerProvider({
      apiKey: "test-key",
      textCall: async (input) => {
        input.onProgress?.({
          outputChars: 9,
          thinkingChars: 0,
          elapsedMs: 100,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        input.onProgress?.({
          outputChars: 20,
          thinkingChars: 0,
          elapsedMs: 200,
          idleTimeoutMs: input.idleTimeoutMs,
          timeoutMode: "idle_watchdog",
          stage: "streaming",
        });
        return '{"title":"Streamed"}';
      },
    });

    await expect(
      provider.compileProgramIr({
        prompt: "program-ir",
        model: AMBIENT_DEFAULT_MODEL,
        onProgress: (event) => progress.push(event.outputChars),
      }),
    ).resolves.toEqual({
      title: "Streamed",
    });
    expect(progress).toEqual([9, 20]);
  });
});
