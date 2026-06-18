import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { buildCallableWorkflowRegistry, recordedWorkflowToolName } from "./projectStoreCallableWorkflowFacade";
import { ProjectStore } from "./projectStore";

describe("ProjectStore Symphony workflow recipes", () => {
  let workspacePath = "";
  let store: ProjectStore;
  const enabledFlags = resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt: "2026-06-07T18:00:00.000Z",
  });
  const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-07T18:00:00.000Z" });

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-symphony-recipes-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("saves Symphony recipes as versioned confirmed workflow catalog playbooks", () => {
    const thread = store.createThread("Parent Symphony Thread", workspacePath);
    const first = store.saveSymphonyWorkflowRecipe({
      threadId: thread.id,
      patternId: "map_reduce",
      goal: "Compare the workflow planning documents and cite every source.",
      blocking: true,
      stepAnswers: {
        "pattern-scope": { choiceId: "files", customText: "Use the docs and local plan files." },
      },
      metricCustomizations: {
        "map_reduce-metric": "Every cited document is represented in the reducer output.",
      },
    }, { featureFlagSnapshot: enabledFlags });
    const second = store.saveSymphonyWorkflowRecipe({
      threadId: thread.id,
      patternId: "map_reduce",
      goal: "Compare the workflow planning documents and cite every source.",
      blocking: true,
      stepAnswers: {
        "pattern-scope": { choiceId: "files", customText: "Use the docs and local plan files." },
      },
      metricCustomizations: {
        "map_reduce-metric": "Every cited document is represented in the reducer output.",
      },
    }, { featureFlagSnapshot: enabledFlags });

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.playbook).toMatchObject({
      status: "confirmed",
      source: "symphony_recipe",
      intent: "Symphony Map-Reduce: Compare the workflow planning documents and cite every source.",
      inputs: expect.arrayContaining([
        expect.stringContaining("pattern preset: Map-Reduce"),
        expect.stringContaining("Default blocking preference: parent blocks"),
        expect.stringContaining("Readable recipe source preview: symphony_recipe map_reduce"),
        expect.stringContaining("Every cited document"),
      ]),
      validation: expect.arrayContaining([
        expect.stringContaining("launch card"),
        expect.stringContaining("JSON Schema"),
      ]),
      outputShape: expect.arrayContaining([
        expect.stringContaining("Default-collapsed child threads"),
        expect.stringContaining("compact workflow invocation"),
      ]),
    });
    expect(second.markdownPreview).toContain("## Provenance");
    expect(second.versions.map((version) => version.version)).toEqual([2, 1]);

    const registry = buildCallableWorkflowRegistry({
      featureFlagSnapshot: resolveAmbientFeatureFlags({
        settings: { subagents: true },
        generatedAt: "2026-06-07T18:00:00.000Z",
      }),
      recordedWorkflowPlaybooks: [second],
    });

    expect(registry.tools.map((tool) => tool.name)).toContain(recordedWorkflowToolName(second));
  });

  it("rejects Symphony catalog recipes without required metric criteria", () => {
    const thread = store.createThread("Parent Symphony Thread", workspacePath);

    expect(() =>
      store.saveSymphonyWorkflowRecipe({
        threadId: thread.id,
        patternId: "ensemble",
        goal: "Compare implementation approaches.",
      }, { featureFlagSnapshot: enabledFlags })
    ).toThrow("Complete required selection rubric before saving the Symphony recipe.");
  });

  it("refuses direct Symphony recipe persistence while ambient.subagents is disabled", () => {
    const thread = store.createThread("Parent Symphony Thread", workspacePath);

    expect(() =>
      store.saveSymphonyWorkflowRecipe({
        threadId: thread.id,
        patternId: "map_reduce",
        goal: "Compare the workflow planning documents and cite every source.",
        metricCustomizations: {
          "map_reduce-metric": "Every cited document is represented in the reducer output.",
        },
      }, { featureFlagSnapshot: disabledFlags })
    ).toThrow("ambient.subagents is off");
  });
});
