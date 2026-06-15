import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ambientWorkflowsDescribeText,
  ambientWorkflowsArchiveText,
  ambientWorkflowsInjectText,
  ambientWorkflowsSearchText,
  ambientWorkflowsUpdateText,
  archiveAmbientWorkflowPlaybook,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  searchAmbientWorkflowPlaybooks,
  updateAmbientWorkflowPlaybook,
} from "./ambientWorkflows";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("Ambient Workflows playbook package tools", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflows-playbooks-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("searches, describes, and injects saved playbooks as bounded non-executing guidance", () => {
    const thread = store.createWorkflowRecordingThread({
      goal: "Find romantic live theatrical events in Scottsdale for a date night.",
      workspacePath,
    });
    store.addMessage({ threadId: thread.id, role: "user", content: "Find Scottsdale theater events for a date night." });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "browser_search completed\nFound Arizona Theatre Company and Scottsdale Center listings.",
      metadata: {
        toolName: "browser_search",
        toolCallId: "search-1",
        status: "done",
        input: { query: "Scottsdale upcoming theater date night" },
      },
    });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "bash failed\nDo not feed raw CLI stdout into collection map steps.",
      metadata: { toolName: "bash", toolCallId: "bash-1", status: "error" },
    });
    store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "Use live event search results, rank venue/date/fit, and note blocked or noisy sources.",
      metadata: { status: "done" },
    });

    store.stopWorkflowRecording(thread.id);
    store.updateWorkflowRecordingReviewDraft(thread.id, {
      intent: "Find romantic live theatrical events in Scottsdale for a date night.",
      inputs: ["Location", "Date-night fit criteria", "Date window"],
      successfulExamples: [
        {
          toolName: "browser_search",
          inputPreview: '{"query":"Scottsdale upcoming theater date night"}',
          resultPreview: "Typed search results with venue listing pages.",
        },
      ],
      doNot: [{ toolName: "bash", status: "failed", reason: "Do not feed raw CLI stdout into collection map steps." }],
      validation: ["Final answer ranks live theatrical events with venue, date, link, fit rationale, and caveats."],
      outputShape: ["Ranked shortlist with venue, date, link, romantic fit rationale, and caveats."],
    });
    const first = store.confirmWorkflowRecordingReview(thread.id).review!.savedPlaybook!;

    store.updateWorkflowRecordingReviewDraft(thread.id, {
      intent: "Find Scottsdale date-night theatre options with current venue pages.",
      inputs: ["Location", "Date window"],
      successfulExamples: [
        {
          toolName: "browser_search",
          inputPreview: '{"query":"Scottsdale theater performances couples date night"}',
          resultPreview: "Current venue pages and ticket links.",
        },
      ],
      doNot: [{ toolName: "bash", status: "failed", reason: "Avoid transforming raw CLI stdout as if it were structured event arrays." }],
      validation: ["Final answer links to source pages and calls out uncertainty."],
      outputShape: ["Shortlist with source notes."],
    });
    const second = store.confirmWorkflowRecordingReview(thread.id).review!.savedPlaybook!;
    expect(second).toMatchObject({ id: first.id, version: 2 });

    const search = searchAmbientWorkflowPlaybooks(store, { query: "romantic Scottsdale theatrical events", limit: 5 });
    expect(search.catalogVersion).toMatch(/^ambient-workflows-v1:/);
    expect(search.results[0]).toMatchObject({
      id: first.id,
      version: 2,
      toolNames: ["browser_search"],
      outputShape: ["Shortlist with source notes."],
    });
    expect(ambientWorkflowsSearchText(search)).toContain("Next: call ambient_workflows_describe");

    const currentDescription = describeAmbientWorkflowPlaybook(store, { id: first.id, includeMarkdown: true, maxMarkdownChars: 220 });
    expect(currentDescription).toMatchObject({
      id: first.id,
      version: 2,
      markdownIncluded: true,
      markdownTruncated: true,
      playbook: {
        intent: "Find Scottsdale date-night theatre options with current venue pages.",
      },
    });
    expect(ambientWorkflowsDescribeText(currentDescription)).toContain("Injection is non-executing guidance only");

    const versionOneDescription = describeAmbientWorkflowPlaybook(store, { id: first.id, version: 1 });
    expect(versionOneDescription).toMatchObject({
      id: first.id,
      version: 1,
      playbook: {
        intent: "Find romantic live theatrical events in Scottsdale for a date night.",
      },
    });

    const injection = injectAmbientWorkflowPlaybook(store, { id: first.id, version: 1, maxMarkdownChars: 180 });
    expect(injection.guidanceMarkdown).toContain("Injected Workflow Playbook");
    expect(injection.guidanceMarkdown).toContain("browser_search");
    expect(injection.guidanceMarkdown).toContain("Do not feed raw CLI stdout");
    expect(ambientWorkflowsInjectText(injection)).toContain("Ambient Workflows playbook injected");

    store.setWorkflowRecordingEnabled(first.id, false);
    expect(searchAmbientWorkflowPlaybooks(store, { query: "Scottsdale date night" }).results).toEqual([]);
    expect(searchAmbientWorkflowPlaybooks(store, { query: "Scottsdale date night", includeDisabled: true }).results[0]).toMatchObject({
      id: first.id,
      enabled: false,
    });
    expect(() => injectAmbientWorkflowPlaybook(store, { id: first.id })).toThrow(/disabled/);

    store.setWorkflowRecordingEnabled(first.id, true);
    const updated = updateAmbientWorkflowPlaybook(store, {
      id: first.id,
      baseVersion: 2,
      draft: {
        intent: "Find polished Scottsdale theatre date-night options.",
        inputs: ["Location", "Date window", "Date-night fit criteria"],
        successfulExamples: [
          {
            toolName: "browser_search",
            inputPreview: '{"query":"Scottsdale theatre date night"}',
            resultPreview: "Venue pages and ticket links.",
          },
        ],
        doNot: [{ toolName: "bash", status: "failed", reason: "Avoid treating unstructured CLI output as event rows." }],
        validation: ["Final answer links source pages and ranks fit."],
        outputShape: ["Ranked theatre shortlist with source notes."],
      },
    });
    expect(updated).toMatchObject({
      id: first.id,
      version: 3,
      playbook: { intent: "Find polished Scottsdale theatre date-night options." },
    });
    expect(ambientWorkflowsUpdateText(updated)).toContain("playbook updated");

    const archived = archiveAmbientWorkflowPlaybook(store, {
      id: first.id,
      baseVersion: 3,
      reason: "Testing archived workflow behavior.",
    });
    expect(archived.archivedAt).toBeTruthy();
    expect(ambientWorkflowsArchiveText(archived)).toContain("hidden from default search");
    expect(searchAmbientWorkflowPlaybooks(store, { query: "polished Scottsdale" }).results).toEqual([]);
    expect(searchAmbientWorkflowPlaybooks(store, { query: "polished Scottsdale", includeArchived: true }).results[0]).toMatchObject({
      id: first.id,
      archivedReason: "Testing archived workflow behavior.",
    });
    expect(() => describeAmbientWorkflowPlaybook(store, { id: first.id })).toThrow(/not found/);
    expect(describeAmbientWorkflowPlaybook(store, { id: first.id, includeArchived: true })).toMatchObject({
      id: first.id,
      archivedReason: "Testing archived workflow behavior.",
    });
    expect(() => injectAmbientWorkflowPlaybook(store, { id: first.id })).toThrow(/not found|archived/);
  });
});
