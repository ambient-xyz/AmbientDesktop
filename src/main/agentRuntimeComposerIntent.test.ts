import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localDeepResearchComposerPrompt, symphonyWorkflowComposerPrompt } from "./agentRuntime";

describe("agent runtime composer intents", () => {
  it("routes Local Deep Research composer prompts to the first-party run tool", () => {
    const prompt = localDeepResearchComposerPrompt("Compare local search agents.");

    expect(prompt).toContain("ambient_local_deep_research_run");
    expect(prompt).toContain("ambient_local_deep_research_setup");
    expect(prompt).toContain("Do not answer from general knowledge");
    expect(prompt).toContain("Research query:\nCompare local search agents.");
  });

  it("routes Symphony run-once intents to the exact callable workflow tool", () => {
    const prompt = symphonyWorkflowComposerPrompt("Audit the plan file.", {
      kind: "symphony-workflow",
      action: "run-once",
      patternId: "map_reduce",
      blocking: true,
      stepAnswers: {
        "pattern-scope": { choiceId: "files" },
        "limits-and-policy": { customText: "Read-only, small slice first." },
      },
      metricCustomizations: {
        "map_reduce-metric": "Reducer must cite every changed section.",
      },
    });

    expect(prompt).toContain("Composer action: Symphony Run Once.");
    expect(prompt).toContain("ambient_workflow_symphony_map_reduce");
    expect(prompt).toContain('"goal": "Audit the plan file."');
    expect(prompt).toContain('"blocking": true');
    expect(prompt).toContain('"builderSelections"');
    expect(prompt).toContain('"selectedChoiceId": "files"');
    expect(prompt).toContain('"metricCriteria"');
    expect(prompt).toContain('"templateId": "map_reduce-metric"');
    expect(prompt).toContain("Read-only, small slice first.");
    expect(prompt).toContain("Reducer must cite every changed section.");
    expect(prompt).toContain("Do not spawn child agents directly");
  });

  it("keeps Symphony save-recipe intents from launching the workflow tool", () => {
    const prompt = symphonyWorkflowComposerPrompt("Create a reusable verifier recipe.", {
      kind: "symphony-workflow",
      action: "save-recipe",
      patternId: "imitate_and_verify",
      blocking: false,
      metricCustomizations: {
        "imitate_and_verify-metric": "Run the verifier checks and preserve any dissenting evidence.",
      },
    });

    expect(prompt).toContain("Composer action: Symphony Save Recipe.");
    expect(prompt).toContain("not to run it yet");
    expect(prompt).toContain("Do not call ambient_workflow_symphony_imitate_and_verify");
    expect(prompt).toContain("searchable workflow catalog");
    expect(prompt).toContain("finite JSON Schema parameters");
  });

  it("rejects Symphony composer intents that omit required metrics or rubrics", () => {
    expect(() =>
      symphonyWorkflowComposerPrompt("Create a reusable verifier recipe.", {
        kind: "symphony-workflow",
        action: "save-recipe",
        patternId: "imitate_and_verify",
        blocking: false,
      })
    ).toThrow("Complete required verifier criteria before saving the Symphony recipe.");
  });

  it("preserves Local Deep Research composer intent through the message IPC schema", () => {
    const source = readFileSync(new URL("./ipc/registerMessageIpc.ts", import.meta.url), "utf8");
    const schemaStart = source.indexOf("const composerIntentSchema = z.discriminatedUnion");
    const schemaEnd = source.indexOf("const sendMessageSchema = z.object({", schemaStart);
    const schemaSource = source.slice(schemaStart, schemaEnd);

    expect(schemaStart).toBeGreaterThan(-1);
    expect(schemaEnd).toBeGreaterThan(schemaStart);
    expect(schemaSource).toContain('kind: z.literal("local-deep-research")');
    expect(schemaSource).toContain('kind: z.literal("symphony-workflow")');
    expect(schemaSource).toContain('action: z.enum(["run-once", "save-recipe"])');
    expect(schemaSource).toContain('"self_healing_loop"');
  });
});
