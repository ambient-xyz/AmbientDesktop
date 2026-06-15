import { describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { fallbackSubagentCapacityLease } from "../shared/subagentCapacity";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import { resolveSubagentToolScope } from "../shared/subagentToolScope";
import {
  buildSubagentChildPrompt,
  buildSubagentFollowupPrompt,
  buildSubagentPromptSnapshot,
  classifySubagentAssistantResult,
  summarizeSubagentAssistantResult,
} from "./subagentPromptRuntime";
import { REVIEWER_FINDINGS_HELP, REVIEWER_VERDICT_HELP, SUBAGENT_RESULT_JSON_MARKER, subagentStructuredResultTemplate } from "./subagentStructuredOutput";

describe("subagentPromptRuntime", () => {
  it("builds a bounded child prompt without parent-facing orchestration capability", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const input = {
      run: {
        id: "child-run",
        protocolVersion: "ambient-subagent-v1",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        roleId: role.id,
        roleProfileSnapshot: role,
        roleProfileSnapshotSource: "resolved",
        dependencyMode: "required",
        status: "running",
        featureFlagSnapshot: resolveAmbientFeatureFlags(),
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(role.defaultModelId),
        capacityLeaseSnapshot: fallbackSubagentCapacityLease({
          parentThreadId: "parent-thread",
          parentRunId: "parent-run",
          canonicalTaskPath: "root/0:explorer",
          roleId: role.id,
          model: createAmbientModelRuntimeSnapshot(role.defaultModelId).profile,
          now: "2026-06-05T00:00:00.000Z",
        }),
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      },
      role,
      task: "Inspect the implementation and report risks.",
      forkMode: "recent_turns",
      promptMode: "append",
      toolScope: resolveSubagentToolScope({
        role,
        model: createAmbientModelRuntimeSnapshot(role.defaultModelId).profile,
        workspacePolicy: {
          hardDeniedCategories: ["secrets.read", "subagent.spawn"],
          approvalMode: "interactive",
          worktreeIsolated: false,
          allowNestedFanout: false,
        },
      }),
      inheritedContext: [{
        sourceMessageId: "m-user",
        role: "user",
        contentPreview: "Please inspect the implementation.",
      }],
      strippedRefs: [{
        sourceMessageId: "m-tool",
        role: "tool",
        reason: "tool_message",
      }],
      parentThreadTitle: "Parent",
    } as const;
    const prompt = buildSubagentChildPrompt(input);

    expect(prompt).toContain("childRunId: child-run");
    expect(prompt).toContain("activeAgentTag: Explorer[root/0:explorer]");
    expect(prompt).toContain("Do not spawn sub-agents.");
    expect(prompt).toContain("Persistent memory is disabled for this child.");
    expect(prompt).toContain("persistentMemory: disabled; Ambient may snapshot this run contract");
    expect(prompt).toContain("nestedFanoutAvailable: false");
    expect(prompt).toContain("allowPartialResult: true");
    expect(prompt).toContain(SUBAGENT_RESULT_JSON_MARKER);
    expect(prompt).toContain("ambient-subagent-structured-result-v1");
    expect(prompt).toContain("SUBAGENT_RESULT_STATUS: partial");
    expect(prompt).toContain("SUBAGENT_RESULT_STATUS: needs_attention");
    expect(prompt).toContain("If the task asks for an exact reply, include that exact text in the structured summary or evidence");
    expect(prompt).toContain("evidence, artifacts, risks, and nextActions must each be arrays of plain strings");
    expect(prompt).toContain("Put any objects, tables, scored findings, or detailed records inside roleOutput instead");
    expect(prompt).toContain("user m-user");
    expect(prompt).toContain("tool m-tool: tool_message");
    expect(prompt).toContain("Inspect the implementation and report risks.");
    expect(buildSubagentPromptSnapshot(input)).toMatchObject({
      schemaVersion: "ambient-subagent-prompt-snapshot-v1",
      runId: "child-run",
      activeAgentTag: "Explorer[root/0:explorer]",
      modelScope: {
        schemaVersion: "ambient-subagent-prompt-model-scope-v1",
        requestedModelId: role.defaultModelId,
        modelId: role.defaultModelId,
      },
      memoryPolicy: "run_snapshot_only",
      persistentMemory: {
        schemaVersion: "ambient-subagent-persistent-memory-snapshot-v1",
        enabled: false,
        policy: "run_snapshot_only",
      },
      inheritedRefs: [{ sourceMessageId: "m-user" }],
      strippedRefs: [{ sourceMessageId: "m-tool", reason: "tool_message" }],
      boundaryInstructions: expect.arrayContaining(["persistent_memory_disabled_by_default", "max_turn_wrapup_status_marker"]),
    });
  });

  it("bounds assistant result summaries", () => {
    expect(summarizeSubagentAssistantResult("")).toContain("without visible assistant text");
    expect(summarizeSubagentAssistantResult("abcdef", 4)).toBe("a...");
  });

  it("builds a follow-up prompt that restates run identity and the structured result contract", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const prompt = buildSubagentFollowupPrompt({
      message: "The selected fixture is restart-smoke. Complete now.",
      role,
      run: {
        id: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        parentRunId: "parent-run",
      },
    });

    expect(prompt).toContain("Ambient sub-agent follow-up turn.");
    expect(prompt).toContain("You are still the child sub-agent for your existing assignment");
    expect(prompt).toContain("treat the transcript as authoritative");
    expect(prompt).toContain("- childRunId: child-run");
    expect(prompt).toContain("- childThreadId: child-thread");
    expect(prompt).toContain("- canonicalTaskPath: root/0:explorer");
    expect(prompt).toContain("- activeAgentTag: Explorer[root/0:explorer]");
    expect(prompt).toContain("- memoryPolicy: run_snapshot_only");
    expect(prompt).toContain("- persistentMemory: disabled; Ambient may snapshot this run contract");
    expect(prompt).toContain("The selected fixture is restart-smoke. Complete now.");
    expect(prompt).toContain(SUBAGENT_RESULT_JSON_MARKER);
    expect(prompt).toContain("ambient-subagent-structured-result-v1");
    expect(prompt).toContain("SUBAGENT_RESULT_STATUS: complete");
    expect(prompt).toContain("SUBAGENT_RESULT_STATUS: needs_attention");
    expect(prompt).toContain("evidence, artifacts, risks, and nextActions must each be arrays of plain strings");
    expect(prompt).not.toContain("ambient_subagent tool");
  });

  it("tells reviewer children which structured verdicts are valid", () => {
    const role = getDefaultSubagentRoleProfile("reviewer");
    const prompt = buildSubagentFollowupPrompt({
      message: "Compare the alternatives and select the safest plan.",
      role,
      run: {
        id: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:reviewer",
        parentRunId: "parent-run",
      },
    });

    expect(prompt).toContain(`Reviewer roleOutput.verdict must be one of: ${REVIEWER_VERDICT_HELP}`);
    expect(prompt).toContain("Use winner_selected or ranked only when comparing alternatives");
    expect(prompt).toContain(`Reviewer ${REVIEWER_FINDINGS_HELP}`);
    expect(prompt).toContain("If the parent follow-up describes schema field locations differently");
  });

  it("classifies explicit complete, partial, failed, and needs-attention child results", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const reviewer = getDefaultSubagentRoleProfile("reviewer");

    expect(classifySubagentAssistantResult(structuredChildText(explorer, "complete", {
      summary: "Done.",
      roleOutput: { findings: [{ summary: "Found the answer.", provenance: ["file:a"] }], openQuestions: [] },
    }), explorer)).toMatchObject({
      status: "completed",
      partial: false,
      explicitStatus: "complete",
      structuredOutput: expect.objectContaining({
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "explorer",
        status: "complete",
      }),
    });
    expect(classifySubagentAssistantResult(structuredChildText(explorer, "partial", {
      summary: "Found some evidence.",
      roleOutput: { findings: [{ summary: "Partial evidence.", provenance: ["file:b"] }], openQuestions: ["Need more time."] },
    }), explorer)).toMatchObject({
      status: "aborted_partial",
      partial: true,
      explicitStatus: "partial",
    });
    expect(classifySubagentAssistantResult(structuredChildText(reviewer, "partial", {
      summary: "Found some evidence.",
      roleOutput: { verdict: "blocked", findings: [] },
    }), reviewer)).toMatchObject({
      status: "failed",
      partial: false,
      explicitStatus: "partial",
      reason: "Role guard policy does not allow partial child results.",
    });
    expect(classifySubagentAssistantResult("Could not inspect it.\nSUBAGENT_RESULT_STATUS: failed", explorer)).toMatchObject({
      status: "failed",
      partial: false,
      explicitStatus: "failed",
    });
    expect(classifySubagentAssistantResult(structuredChildText(explorer, "needs_attention", {
      summary: "Need the parent to choose which credential-free fixture to inspect.",
      evidence: [],
      risks: ["Cannot safely proceed without choosing a fixture."],
      nextActions: ["Ask the user which fixture should be inspected, then send the decision back to the child."],
      roleOutput: { findings: [], openQuestions: ["Which fixture should be inspected?"] },
    }), explorer)).toMatchObject({
      status: "needs_attention",
      partial: false,
      explicitStatus: "needs_attention",
      structuredOutput: expect.objectContaining({
        roleId: "explorer",
        status: "needs_attention",
      }),
    });
  });

  it("fails structured-output roles that claim completion with prose only", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");

    expect(classifySubagentAssistantResult("Done.\nSUBAGENT_RESULT_STATUS: complete", explorer)).toMatchObject({
      status: "failed",
      partial: false,
      explicitStatus: "complete",
      reason: `Structured-output role result is missing ${SUBAGENT_RESULT_JSON_MARKER} JSON.`,
    });
  });

  it("uses schema-valid structured JSON when the status marker is present but malformed", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const text = structuredChildText(explorer, "complete", {
      summary: "SUBAGENT_FOLLOWUP_LIVE_DONE",
      evidence: ["Parent follow-up supplied SUBAGENT_FOLLOWUP_LIVE_DONE."],
      roleOutput: {
        findings: [{ summary: "The follow-up token was received and applied.", provenance: ["parent follow-up"] }],
        openQuestions: [],
      },
    }).replace("SUBAGENT_RESULT_STATUS: complete", "SUBAGENT_RESULT_STATUS:");
    const noColonText = text.replace("SUBAGENT_RESULT_STATUS:", "SUBAGENT_RESULT_STATUS");

    expect(classifySubagentAssistantResult(text, explorer)).toMatchObject({
      status: "completed",
      partial: false,
      structuredOutput: expect.objectContaining({
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "explorer",
        status: "complete",
        summary: "SUBAGENT_FOLLOWUP_LIVE_DONE",
      }),
    });
    expect(classifySubagentAssistantResult(noColonText, explorer)).toMatchObject({
      status: "completed",
      partial: false,
      structuredOutput: expect.objectContaining({
        schemaVersion: "ambient-subagent-structured-result-v1",
        roleId: "explorer",
        status: "complete",
        summary: "SUBAGENT_FOLLOWUP_LIVE_DONE",
      }),
    });
  });

  it("still fails structured-output roles when the status marker is absent", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const text = structuredChildText(explorer, "complete", {
      summary: "Done.",
      roleOutput: { findings: [{ summary: "Found the answer.", provenance: ["file:a"] }], openQuestions: [] },
    }).replace("SUBAGENT_RESULT_STATUS: complete", "");

    expect(classifySubagentAssistantResult(text, explorer)).toMatchObject({
      status: "failed",
      partial: false,
      reason: "Structured-output role result is missing the SUBAGENT_RESULT_STATUS status line.",
    });
  });
});

function structuredChildText(
  role: ReturnType<typeof getDefaultSubagentRoleProfile>,
  status: "complete" | "partial" | "failed" | "needs_attention",
  overrides: Partial<ReturnType<typeof subagentStructuredResultTemplate>> = {},
): string {
  const structured = {
    ...subagentStructuredResultTemplate(role),
    ...overrides,
    status,
    summary: overrides.summary ?? `${role.label} result.`,
  };
  return [
    structured.summary,
    SUBAGENT_RESULT_JSON_MARKER,
    "```json",
    JSON.stringify(structured, null, 2),
    "```",
    `SUBAGENT_RESULT_STATUS: ${status}`,
  ].join("\n");
}
