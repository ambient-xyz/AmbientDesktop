import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

async function initializeGitWorkspace(workspacePath: string): Promise<void> {
  await git(workspacePath, ["init"]);
  await git(workspacePath, ["config", "user.email", "ambient-test@example.invalid"]);
  await git(workspacePath, ["config", "user.name", "Ambient Test"]);
  await writeFile(join(workspacePath, ".gitignore"), ".ambient/\n", "utf8");
  await writeFile(join(workspacePath, "README.md"), "# Ambient worker worktree test\n", "utf8");
  await git(workspacePath, ["add", ".gitignore", "README.md"]);
  await git(workspacePath, ["commit", "-m", "initial"]);
}

describe("AgentRuntime sub-agent local runtime routing", () => {
  it("uses structured child JSON when the result status marker is present without a colon", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-malformed-status-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("malformed status sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "summarizer",
          status: "complete",
          summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          evidence: ["SUBAGENT_CHILD_DONE"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            keyPoints: ["SUBAGENT_CHILD_DONE"],
            sourceRefs: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "SUBAGENT_RESULT_JSON:",
            "```json",
            JSON.stringify(structuredOutput, null, 2),
            "```",
            "SUBAGENT_RESULT_STATUS",
            "The model emitted explanatory prose after a malformed status marker.",
          ].join("\n"),
          metadata: { status: "done" },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: "Trailing assistant prose should not replace the structured child result.",
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-malformed-status-child", {
        action: "spawn_agent",
        roleId: "summarizer",
        task: "Complete the child smoke result.",
        dependencyMode: "required",
        idempotencyKey: "spawn:malformed-status-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-malformed-status-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          structuredOutput: {
            roleId: "summarizer",
            status: "complete",
            summary: "Live child smoke completed with SUBAGENT_CHILD_DONE.",
          },
        },
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([]);
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(expect.arrayContaining(["subagent.result_ready"]));
      expect(store.listMessages(run.childThreadId).filter((message) => message.metadata?.runtime === "ambient-recovery")).toEqual([]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("recovers missing child result contracts without reusing stale assistant output", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-result-contract-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("result contract follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I found the requested answer, but forgot the structured result contract.",
            metadata: { status: "done" },
          });
          return;
        }
        if (sent.length === 2) {
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered the child result contract after a blank recovery turn.",
          evidence: ["The first child answer contained useful prose."],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [
              { summary: "The child task result was recovered from the visible transcript.", provenance: ["visible child transcript"] },
            ],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the missing result contract.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-result-contract-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:result-contract-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-result-contract-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(3);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Structured-output role result is missing"),
      });
      expect(sent[1].modelContentOverride).toContain("Do not redo long prose unless required");
      expect(sent[2].modelContentOverride).toContain("The previous turn did not leave a usable assistant answer");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
        { hadAssistantText: false, reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered the missing result contract."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("repairs invalid structured child result envelopes before terminal policy failure", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-invalid-structured-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("invalid structured follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: [
              "The fixture answer is blue, but this envelope uses the wrong role id.",
              `SUBAGENT_RESULT_JSON: ${JSON.stringify({
                schemaVersion: "ambient-subagent-structured-result-v1",
                roleId: "summarizer",
                status: "complete",
                summary: "The fixture answer is blue.",
                evidence: ["visible child transcript"],
                artifacts: [],
                risks: [],
                nextActions: [],
                roleOutput: {
                  keyPoints: ["The fixture answer is blue."],
                  sourceRefs: ["visible child transcript"],
                },
              })}`,
              "SUBAGENT_RESULT_STATUS: complete",
            ].join("\n"),
            metadata: { status: "done" },
          });
          return;
        }
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered the structured envelope with the correct explorer role.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "explorer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                findings: [{ summary: "The fixture answer is blue.", provenance: ["visible child transcript"] }],
                openQuestions: [],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-invalid-structured-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:invalid-structured-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-invalid-structured-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const contractFollowups = store
        .listSubagentRunEvents(runId)
        .filter((event) => event.type === "subagent.result_contract_followup_required")
        .map((event) => event.preview as { hadAssistantText?: boolean; reason?: string });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining(
          "Sub-agent runtime follow-up: Structured result roleId must match child role explorer.",
        ),
      });
      expect(sent[1].modelContentOverride).toContain("summarize that answer in the structured result");
      expect(contractFollowups).toMatchObject([
        { hadAssistantText: true, reason: "Structured result roleId must match child role explorer." },
      ]);
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("The fixture answer is blue."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "subagent.result_contract_followup_required",
          "subagent.internal_post_tool_followup_started",
          "subagent.result_ready",
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records terminal evidence when structured child result repair is exhausted", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-structured-repair-exhausted-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("structured repair exhausted sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "I keep returning the wrong structured envelope.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify({
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "summarizer",
              status: "complete",
              summary: "The fixture answer is blue.",
              evidence: ["visible child transcript"],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                keyPoints: ["The fixture answer is blue."],
                sourceRefs: ["visible child transcript"],
              },
            })}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-structured-repair-exhausted-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Answer a bounded fixture question and return the child result contract.",
        dependencyMode: "required",
        idempotencyKey: "spawn:structured-repair-exhausted-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-structured-repair-exhausted-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const eventTypes = store.listSubagentRunEvents(runId).map((event) => event.type);

      expect(sendSpy).toHaveBeenCalledTimes(4);
      expect(sent.slice(1).every((input) => input.delivery === "follow-up")).toBe(true);
      expect(eventTypes.filter((type) => type === "subagent.result_contract_followup_required")).toHaveLength(4);
      expect(eventTypes.filter((type) => type === "subagent.internal_post_tool_followup_started")).toHaveLength(3);
      expect(eventTypes).toEqual(expect.arrayContaining(["subagent.result_contract_repair_exhausted", "subagent.child_session_failed"]));
      expect(run).toMatchObject({
        status: "failed",
        resultArtifact: {
          status: "failed",
          summary: expect.stringContaining("Ambient exhausted automatic child post-tool finalization follow-ups"),
        },
      });
      expect(waited.details).toMatchObject({
        status: "failed",
        waitSatisfied: true,
        synthesisAllowed: false,
        waitBarrier: {
          status: "failed",
        },
        waitBarrierEvaluation: {
          impossible: true,
          terminalUnsafeChildRunIds: [runId],
        },
        waitBarrierBlockers: [
          expect.objectContaining({
            childRunId: runId,
            blockingState: "terminal_unsafe",
            resultRepairState: expect.objectContaining({
              state: "result_contract_repair_exhausted",
              reason: "Structured result roleId must match child role explorer.",
              maxAttempts: 3,
            }),
          }),
        ],
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("continues a child turn that ends after tool results without a structured result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-post-tool-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("post-tool follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        if (sent.length === 1) {
          store.addMessage({
            threadId: input.threadId,
            role: "assistant",
            content: "I'll inspect the granted file first.",
            metadata: { status: "done" },
          });
          store.addMessage({
            threadId: input.threadId,
            role: "tool",
            content: "read completed\n\nResult\nTEXT_AUTHORITY_OK: native text read is allowed.",
            metadata: {
              status: "done",
              toolName: "read",
              registeredName: "read",
              toolCallId: "call-read-1",
            },
          });
          return;
        }
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "explorer",
          status: "complete",
          summary: "Recovered after post-tool follow-up.",
          evidence: ["TEXT_AUTHORITY_OK"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            findings: [{ summary: "The granted file was readable.", provenance: ["read tool result"] }],
            openQuestions: [],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Recovered after post-tool follow-up.",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
            "SUBAGENT_RESULT_STATUS: complete",
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-post-tool-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Read the granted note and report the result.",
        dependencyMode: "required",
        toolScope: { requestedCategories: ["workspace.read"] },
        idempotencyKey: "spawn:post-tool-followup-child",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-post-tool-followup-child", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: expect.stringContaining("Sub-agent runtime follow-up: Child produced tool results"),
      });
      expect(sent[1].modelContentOverride).toContain("Continue from the visible child transcript.");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(waited.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Recovered after post-tool follow-up."),
          structuredOutput: {
            roleId: "explorer",
            status: "complete",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "subagent.post_tool_followup_required",
          "subagent.internal_post_tool_followup_started",
          "subagent.result_ready",
        ]),
      );
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "tool",
        "user",
        "assistant",
      ]);
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("runs an idle Pi child follow-up turn through mailbox delivery and wait", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-followup-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("follow-up sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: any[] = [];
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        sent.push(input);
        store.addMessage({
          threadId: input.threadId,
          role: "user",
          content: input.visibleUserContent ?? input.content,
          metadata: { delivery: input.delivery, internal: input.internal },
        });
        const firstTurn = sent.length === 1;
        const completeSummary = `Inspected restart-smoke fixture. ${"Preserved full child output in the transcript artifact. ".repeat(40)}`;
        const structuredOutput = firstTurn
          ? {
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "explorer",
              status: "needs_attention",
              summary: "Need the parent to pick a fixture.",
              evidence: [],
              artifacts: [],
              risks: [],
              nextActions: ["Send the chosen fixture name as a follow-up."],
              roleOutput: { findings: [], openQuestions: ["Which fixture should I inspect?"] },
            }
          : {
              schemaVersion: "ambient-subagent-structured-result-v1",
              roleId: "explorer",
              status: "complete",
              summary: completeSummary,
              evidence: ["Parent follow-up selected restart-smoke."],
              artifacts: [],
              risks: [],
              nextActions: [],
              roleOutput: {
                findings: [{ summary: "restart-smoke fixture is ready.", provenance: ["parent follow-up"] }],
                openQuestions: [],
              },
            };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            structuredOutput.summary,
            `SUBAGENT_RESULT_STATUS: ${firstTurn ? "needs_attention" : "complete"}`,
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-followup-child", {
        action: "spawn_agent",
        roleId: "explorer",
        task: "Inspect a fixture after asking the parent which one to use.",
        dependencyMode: "required",
        idempotencyKey: "spawn:agent-runtime-followup",
      });
      const runId = spawned.details.run.id as string;
      const firstWait = await subagentTool.execute("wait-needs-attention", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      expect(firstWait.details).toMatchObject({
        status: "needs_attention",
        synthesisAllowed: false,
        parentResolution: {
          action: "ask_user",
          requiresUserInput: true,
        },
      });

      const followed = await subagentTool.execute("followup-idle-child", {
        action: "followup_agent",
        childRunId: runId,
        message: "Use the restart-smoke fixture.",
        idempotencyKey: "follow:restart-smoke",
      });
      expect(followed.details).toMatchObject({
        status: "queued",
        runtimeFollowup: {
          accepted: true,
        },
      });
      expect(["delivered", "consumed"]).toContain(followed.details.mailboxEvent.deliveryState);

      const secondWait = await subagentTool.execute("wait-followup-complete", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const followupMailbox = store.listSubagentMailboxEvents(runId).find((event) => event.type === "subagent.followup");
      const assistantRuntimeEvents = store.listSubagentRunEvents(runId).filter((event) => {
        const preview = event.preview as { type?: string } | undefined;
        return preview?.type === "assistant_delta";
      });

      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sendSpy.mock.calls[1]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "prompt",
        preserveActiveThread: true,
        internal: true,
      });
      expect(sent[1]).toMatchObject({
        threadId: run.childThreadId,
        delivery: "follow-up",
        preserveActiveThread: true,
        internal: true,
        visibleUserContent: "Child follow-up: Use the restart-smoke fixture.",
      });
      expect(sent[1].modelContentOverride).toContain("Parent follow-up:");
      expect(sent[1].modelContentOverride).toContain("Use the restart-smoke fixture.");
      expect(sent[1].modelContentOverride).toContain("Ambient sub-agent follow-up turn.");
      expect(sent[1].modelContentOverride).toContain("treat the transcript as authoritative");
      expect(sent[1].modelContentOverride).toContain("- childRunId:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_JSON:");
      expect(sent[1].modelContentOverride).toContain("SUBAGENT_RESULT_STATUS: complete");
      expect(followupMailbox).toMatchObject({
        type: "subagent.followup",
        direction: "parent_to_child",
        deliveryState: "consumed",
      });
      expect(secondWait.details).toMatchObject({
        status: "completed",
        waitSatisfied: true,
        synthesisAllowed: true,
        resultValidation: {
          valid: true,
          synthesisAllowed: true,
        },
      });
      expect(run).toMatchObject({
        status: "completed",
        resultArtifact: {
          status: "completed",
          summary: expect.stringContaining("Inspected restart-smoke fixture."),
          structuredOutput: {
            status: "complete",
            roleId: "explorer",
          },
        },
      });
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "subagent.followup_child_session_starting",
          "subagent.followup_child_session_started",
          "subagent.followup_consumed",
          "subagent.result_ready",
        ]),
      );
      expect(assistantRuntimeEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
            preview: expect.objectContaining({
              type: "assistant_delta",
              artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
              textPreview: expect.stringMatching(/\.\.\.$/),
            }),
          }),
        ]),
      );
      expect(store.listMessages(run.childThreadId).map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "system",
        "user",
        "assistant",
      ]);
      expect(store.listMessages(run.childThreadId)[3]).toMatchObject({
        role: "system",
        metadata: {
          status: "queued",
          mailboxEventId: followupMailbox?.id,
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("prepares an isolated git worktree before starting worker child sessions", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-worker-subagent-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      await initializeGitWorkspace(workspacePath);
      store.openWorkspace(workspacePath);
      const parent = store.createThread("worker sub-agent parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const getWindow = () =>
        ({
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            isCrashed: () => false,
            send: (_channel: string, event: any) => emitted.push(event),
          },
        }) as any;
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        getWindow,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          featureFlags: {
            readSnapshot: () =>
              resolveAmbientFeatureFlags({
                startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
                generatedAt: "2026-06-05T00:00:00.000Z",
              }),
          },
        },
      );
      const sent: Array<{ input: any; childThread: any }> = [];
      let permissionAuditId: string | undefined;
      const sendSpy = vi.spyOn(runtime as any, "send").mockImplementation(async (input: any) => {
        const childThread = store.getThread(input.threadId);
        sent.push({ input, childThread });
        const audit = store.addPermissionAudit({
          threadId: input.threadId,
          permissionMode: childThread.permissionMode,
          toolName: "write",
          risk: "workspace-command",
          decision: "allowed",
          detail: "README.md",
          reason: "Allowed by isolated worker worktree policy.",
          decisionSource: "policy",
        });
        permissionAuditId = audit.id;
        store.addMessage({
          threadId: input.threadId,
          role: "tool",
          content: [
            "write done",
            "",
            "Input",
            JSON.stringify({ path: "README.md", content: "Worker update." }),
            "",
            "Result",
            "Wrote README.md",
          ].join("\n"),
          metadata: {
            status: "done",
            toolCallId: "tool-call-worker",
            toolName: "write",
          },
        });
        const structuredOutput = {
          schemaVersion: "ambient-subagent-structured-result-v1",
          roleId: "worker",
          status: "complete",
          summary: "Worker completed in the isolated worktree.",
          evidence: ["stubbed worker send"],
          artifacts: [],
          risks: [],
          nextActions: [],
          roleOutput: {
            changes: ["README.md"],
            validation: ["stubbed"],
            mutationEvidence: [
              {
                toolCallId: "tool-call-worker",
                path: "README.md",
                category: "workspace.write",
                worktreeIsolated: true,
                worktreePath: childThread.workspacePath,
                approvalId: "approval-worker",
              },
            ],
          },
        };
        store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: [
            "Worker completed in the isolated worktree.",
            "SUBAGENT_RESULT_STATUS: complete",
            `SUBAGENT_RESULT_JSON: ${JSON.stringify(structuredOutput)}`,
          ].join("\n"),
          metadata: { status: "done" },
        });
      });
      (runtime as any).activeRunIds.set(parent.id, parentRun.id);
      const registeredTools: any[] = [];
      (runtime as any).controllers.subagentToolExtensions.createToolExtension(parent.id)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });
      const subagentTool = registeredTools.find((tool) => tool.name === "ambient_subagent");
      if (!subagentTool) throw new Error("ambient_subagent tool was not registered.");

      const spawned = await subagentTool.execute("spawn-worker-worktree", {
        action: "spawn_agent",
        roleId: "worker",
        task: "Make a scoped README change.",
        idempotencyKey: "spawn:agent-runtime-worker-worktree",
      });
      const runId = spawned.details.run.id as string;
      const waited = await subagentTool.execute("wait-worker-worktree", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 5000 },
      });
      const run = store.getSubagentRun(runId);
      const childThread = store.getThread(run.childThreadId);
      const [toolScopeSnapshot] = store.listSubagentToolScopeSnapshots(runId);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0]?.[1]).toMatchObject({ awaitInternalRetryCompletion: true });
      expect(sent[0]).toMatchObject({
        input: {
          threadId: run.childThreadId,
          permissionMode: childThread.permissionMode,
          model: run.modelRuntimeSnapshot.profile.modelId,
          preserveActiveThread: true,
          internal: true,
        },
        childThread: {
          id: run.childThreadId,
          workspacePath: childThread.workspacePath,
          gitWorktree: expect.objectContaining({
            status: "active",
            worktreePath: childThread.workspacePath,
          }),
        },
      });
      expect(childThread.workspacePath).not.toBe(workspacePath);
      expect(childThread.gitWorktree).toMatchObject({
        threadId: run.childThreadId,
        projectRoot: workspacePath,
        worktreePath: childThread.workspacePath,
        status: "active",
      });
      expect(toolScopeSnapshot.scope).toMatchObject({
        worktreeIsolated: true,
        loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        deniedCategories: [],
      });
      expect(waited.details).toMatchObject({
        status: "completed",
        synthesisAllowed: true,
        resultValidation: {
          completionGuardValidation: {
            valid: true,
            synthesisAllowed: true,
            ambientEvidenceCount: 1,
            isolatedWorktreeEvidenceCount: 1,
            approvalEvidenceCount: 1,
          },
        },
      });
      expect(store.listSubagentRunEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.runtime_event",
            preview: expect.objectContaining({
              type: "tool_result",
              source: "child_runtime",
              runId,
              childThreadId: run.childThreadId,
              toolName: "write",
              details: expect.objectContaining({
                status: "done",
                toolCallId: "tool-call-worker",
                category: "workspace.write",
                path: "README.md",
                worktreeIsolated: true,
                worktreePath: childThread.workspacePath,
                approvalId: permissionAuditId,
                approvalSource: "policy",
              }),
            }),
          }),
        ]),
      );
      expect(store.listSubagentRunEvents(runId).map((event) => event.type)).toEqual(
        expect.arrayContaining(["subagent.worktree_prepared", "subagent.spawn_requested", "subagent.child_session_starting"]),
      );
      expect(spawned.details).toMatchObject({
        childWorktree: {
          threadId: run.childThreadId,
          status: "active",
          worktreePath: childThread.workspacePath,
        },
        toolScopeSnapshot: {
          worktreeIsolated: true,
          loadedCategories: expect.arrayContaining(["workspace.write", "artifact.write"]),
        },
      });
      expect(emitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "thread-updated",
            thread: expect.objectContaining({
              id: run.childThreadId,
              workspacePath: childThread.workspacePath,
              gitWorktree: expect.objectContaining({ status: "active" }),
            }),
          }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("refuses direct child runtime starts when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-start-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled runtime start");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("explorer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Disabled child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const started = await (runtime as any).controllers.subagentToolExtensions.startResolvedChildRun({
        parentThread: parent,
        run: created,
        task: "This should not start while the feature flag is off.",
        role,
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "fresh",
        toolScope: {} as any,
        toolScopeSnapshot: {} as any,
        turnBudgetPolicy: {} as any,
        idempotencyKey: "start:disabled-feature",
        emitEvent: (event: any) => {
          runtimeEvents.push(event);
          return {} as any;
        },
      });

      expect(started).toMatchObject({
        started: false,
        message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
        run: {
          id: created.id,
          status: "failed",
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: created.id,
            status: "failed",
            partial: false,
            summary: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
            childThreadId: created.childThreadId,
          },
        },
      });
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "error",
          source: "child_runtime",
          status: "failed",
          message: "ambient.subagents is disabled; refusing to start sub-agent child runtime.",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            featureFlagSnapshot: expect.objectContaining({
              flags: expect.objectContaining({
                [AMBIENT_SUBAGENTS_FEATURE_FLAG]: expect.objectContaining({ enabled: false }),
              }),
            }),
          }),
        }),
      ]);
      expect(store.listSubagentMailboxEvents(created.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "failed",
            reason: "ambient_subagents_disabled",
            childThreadId: created.childThreadId,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(created.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "subagent.status_changed" }),
          expect.objectContaining({ type: "subagent.lifecycle_stopped" }),
          expect.objectContaining({
            type: "subagent.child_runtime_refused",
            preview: expect.objectContaining({
              reason: "ambient_subagents_disabled",
              idempotencyKey: "start:disabled-feature",
            }),
          }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps followups and approval responses queued when ambient.subagents is disabled", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-flag-mailbox-"));
    const store = new ProjectStore();
    const runtimeEvents: any[] = [];
    const respond = vi.fn();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with disabled child mailbox");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const role = getDefaultSubagentRoleProfile("reviewer");
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Mailbox child",
        roleId: role.id,
        roleProfileSnapshot: role,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const waiting = store.markSubagentRunStatus(created.id, "waiting");
      const followupMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Please inspect the retry path." },
      });
      const approvalMailbox = store.appendSubagentMailboxEvent(waiting.id, {
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: { approvalId: "approval-disabled", decision: "approved", effectiveScope: "this_child_thread" },
      });
      store.setFeatureFlagSettings({ subagents: false });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
        listPending: () => [
          {
            id: "approval-disabled",
            threadId: waiting.childThreadId,
            toolName: "read",
            title: "Allow child read?",
            message: "The child wants to read a file.",
            risk: "workspace-command",
          },
        ],
        respond,
      });
      const markFollowupDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "delivered"));
      const markFollowupConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(followupMailbox.id, "consumed"));
      const markApprovalDelivered = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "delivered"));
      const markApprovalConsumed = vi.fn(() => store.updateSubagentMailboxEventDeliveryState(approvalMailbox.id, "consumed"));
      const emitEvent = (event: any) => {
        runtimeEvents.push(event);
        return {} as any;
      };

      const followup = await (runtime as any).controllers.subagentToolExtensions.followupResolvedChildRun({
        run: waiting,
        message: "Please inspect the retry path.",
        mailboxEvent: followupMailbox,
        idempotencyKey: "followup:disabled-feature",
        emitEvent,
        markMailboxDelivered: markFollowupDelivered,
        markMailboxConsumed: markFollowupConsumed,
      });
      const approval = await (runtime as any).controllers.subagentToolExtensions.resolveResolvedChildApprovalResponse({
        run: waiting,
        mailboxEvent: approvalMailbox,
        approvalId: "approval-disabled",
        decision: "approved",
        effectiveScope: "this_child_thread",
        idempotencyKey: "approval:disabled-feature",
        emitEvent,
        markMailboxDelivered: markApprovalDelivered,
        markMailboxConsumed: markApprovalConsumed,
      });

      expect(followup).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver sub-agent follow-up. The follow-up remains queued.",
        mailboxEvent: {
          id: followupMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(approval).toMatchObject({
        accepted: false,
        message: "ambient.subagents is disabled; refusing to deliver child approval response. The approval response remains queued.",
        mailboxEvent: {
          id: approvalMailbox.id,
          deliveryState: "queued",
        },
      });
      expect(markFollowupDelivered).not.toHaveBeenCalled();
      expect(markFollowupConsumed).not.toHaveBeenCalled();
      expect(markApprovalDelivered).not.toHaveBeenCalled();
      expect(markApprovalConsumed).not.toHaveBeenCalled();
      expect(respond).not.toHaveBeenCalled();
      expect(store.getSubagentMailboxEvent(followupMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentMailboxEvent(approvalMailbox.id).deliveryState).toBe("queued");
      expect(store.getSubagentRun(waiting.id).status).toBe("waiting");
      expect(runtimeEvents).toEqual([
        expect.objectContaining({
          type: "status",
          source: "followup_agent",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: followupMailbox.id,
          }),
        }),
        expect.objectContaining({
          type: "status",
          source: "approval_response",
          status: "waiting",
          details: expect.objectContaining({
            reason: "ambient_subagents_disabled",
            mailboxEventId: approvalMailbox.id,
            approvalId: "approval-disabled",
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(waiting.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.followup_refused",
            preview: expect.objectContaining({
              reason: "ambient_subagents_disabled",
              mailboxEventId: followupMailbox.id,
              idempotencyKey: "followup:disabled-feature",
            }),
          }),
          expect.objectContaining({
            type: "subagent.approval_response.refused",
            preview: expect.objectContaining({
              reason: "ambient_subagents_disabled",
              mailboxEventId: approvalMailbox.id,
              approvalId: "approval-disabled",
              effectiveScope: "this_child_thread",
              idempotencyKey: "approval:disabled-feature",
            }),
          }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("stops only the selected child thread and returns a structured cancellation result to the parent", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-child-stop-"));
    const store = new ProjectStore();
    const emitted: any[] = [];
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Required child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const sibling = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Sibling child",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      store.markSubagentRunStatus(child.id, "running");
      store.markSubagentRunStatus(sibling.id, "running");
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "Inspect this branch." },
      });
      store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Also check restart recovery." },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const childAbort = vi.fn(async () => undefined);
      const siblingAbort = vi.fn(async () => undefined);
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () =>
          ({
            isDestroyed: () => false,
            webContents: {
              isDestroyed: () => false,
              isCrashed: () => false,
              send: (_channel: string, event: any) => emitted.push(event),
            },
          }) as any,
        {
          request: vi.fn(),
          denyThread: () => undefined,
        },
      );
      (runtime as any).activeRuns.set(child.childThreadId, {
        abort: childAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRuns.set(sibling.childThreadId, {
        abort: siblingAbort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).activeRunIds.set(child.childThreadId, "child-runtime-run");
      (runtime as any).activeRunIds.set(sibling.childThreadId, "sibling-runtime-run");

      await runtime.abort(child.childThreadId);

      expect(childAbort).toHaveBeenCalledTimes(1);
      expect(siblingAbort).not.toHaveBeenCalled();
      expect((runtime as any).activeRuns.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRuns.has(sibling.childThreadId)).toBe(true);
      expect((runtime as any).activeRunIds.has(child.childThreadId)).toBe(false);
      expect((runtime as any).activeRunIds.has(sibling.childThreadId)).toBe(true);
      expect(store.getSubagentRun(child.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: {
          status: "cancelled",
          partial: false,
          summary: "Sub-agent child thread stopped by user.",
          childThreadId: child.childThreadId,
        },
      });
      expect(store.getSubagentRun(sibling.id).status).toBe("running");
      expect(store.getThread(child.childThreadId).childStatus).toBe("cancelled");
      expect(store.getThread(sibling.childThreadId).childStatus).toBe("running");
      expect(store.listSubagentMailboxEvents(child.id)).toHaveLength(3);
      expect(store.listSubagentMailboxEvents(child.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.task",
            direction: "parent_to_child",
            deliveryState: "cancelled",
          }),
          expect.objectContaining({
            type: "subagent.followup",
            direction: "parent_to_child",
            deliveryState: "cancelled",
          }),
          expect.objectContaining({
            type: "subagent.cancelled",
            direction: "child_to_parent",
            payload: expect.objectContaining({
              status: "cancelled",
              source: "child_stop",
              childThreadId: child.childThreadId,
            }),
          }),
        ]),
      );
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
          childStatuses: [{ childRunId: child.id, status: "cancelled" }],
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_cancelled",
            source: "cancel_agent",
            childRunId: child.id,
            reason: "Sub-agent child thread stopped by user.",
            idempotencyKey: `direct-child-stop:${child.id}`,
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: false,
            terminalUnsafeChildRunIds: [child.id],
          }),
          resultArtifact: expect.objectContaining({
            status: "cancelled",
            summary: "Sub-agent child thread stopped by user.",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.child_stopped",
            preview: expect.objectContaining({
              previousStatus: "running",
              source: "direct_child_stop",
              cancelledMailboxEvents: expect.arrayContaining([
                expect.objectContaining({ type: "subagent.task", deliveryState: "cancelled" }),
                expect.objectContaining({ type: "subagent.followup", deliveryState: "cancelled" }),
              ]),
            }),
          }),
        ]),
      );
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: assistant.id,
            childRunId: child.id,
            childThreadId: child.childThreadId,
            previousStatus: "running",
            status: "cancelled",
            source: "direct_child_stop",
            waitBarrierIds: [barrier.id],
            resultArtifact: expect.objectContaining({
              status: "cancelled",
              partial: false,
            }),
          }),
        }),
      ]);
      expect(store.listMessages(child.childThreadId)).toEqual([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Sub-agent stopped by user."),
          metadata: expect.objectContaining({
            status: "cancelled",
            subagentRunId: child.id,
          }),
        }),
      ]);
      expect(emitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent-run-updated",
            run: expect.objectContaining({ id: child.id, status: "cancelled" }),
            workspacePath,
          }),
          expect.objectContaining({
            type: "subagent-wait-barrier-updated",
            barrier: expect.objectContaining({ id: barrier.id, status: "cancelled" }),
            workspacePath,
          }),
          expect.objectContaining({
            type: "subagent-parent-mailbox-event-updated",
            mailboxEvent: expect.objectContaining({
              type: "subagent.lifecycle_interrupted",
              parentMessageId: assistant.id,
            }),
            workspacePath,
          }),
          expect.objectContaining({
            type: "runtime-activity",
            activity: expect.objectContaining({
              threadId: parent.id,
              message: expect.stringContaining("sibling children continue"),
            }),
            workspacePath,
          }),
          expect.objectContaining({
            type: "run-status",
            threadId: child.childThreadId,
            status: "idle",
            workspacePath,
          }),
        ]),
      );
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
