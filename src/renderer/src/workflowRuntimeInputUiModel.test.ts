import { describe, expect, it } from "vitest";
import type { WorkflowArtifactSummary, WorkflowRunDetail, WorkflowRunEvent } from "../../shared/workflowTypes";
import { workflowRuntimeInputCards } from "./workflowRuntimeInputUiModel";

const artifact: WorkflowArtifactSummary = {
  id: "artifact-1",
  title: "Runtime input workflow",
  status: "approved",
  manifest: {
    tools: [],
    pluginCapabilities: [],
    ambientCliCapabilities: [],
    mutationPolicy: "read_only",
    maxToolCalls: 1,
    maxModelCalls: 0,
    maxConnectorCalls: 0,
    connectors: [],
  },
  spec: {
    goal: "Ask the user before continuing.",
    summary: "Fixture",
  },
  sourcePath: "/tmp/main.ts",
  statePath: "/tmp/state.json",
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

function detail(events: WorkflowRunEvent[]): WorkflowRunDetail {
  return {
    artifact,
    run: {
      id: "run-1",
      artifactId: artifact.id,
      status: "paused",
      startedAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:30.000Z",
    },
    events,
    modelCalls: [],
    checkpoints: [],
    approvals: [],
    auditReport: "",
  };
}

describe("workflowRuntimeInputUiModel", () => {
  it("surfaces unanswered runtime input requests", () => {
    const cards = workflowRuntimeInputCards(
      detail([
        {
          id: "event-1",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.input.required",
          message: "Which account should the workflow use?",
          graphNodeId: "choose-account",
          itemKey: "account-lookup",
          createdAt: "2026-05-09T00:00:10.000Z",
          data: {
            id: "input-1",
            prompt: "Which account should the workflow use?",
            choices: [{ id: "primary", label: "Primary account", description: "Use the default account." }],
            allowFreeform: false,
          },
        },
      ]),
    );

    expect(cards).toEqual([
      {
        id: "workflow-input:input-1",
        eventId: "event-1",
        seq: 1,
        runId: "run-1",
        requestId: "input-1",
        prompt: "Which account should the workflow use?",
        choices: [{ id: "primary", label: "Primary account", description: "Use the default account." }],
        allowFreeform: false,
        graphNodeId: "choose-account",
        itemKey: "account-lookup",
        contextItems: [],
      },
    ]);
  });

  it("hides requests that already have a matching response", () => {
    const cards = workflowRuntimeInputCards(
      detail([
        {
          id: "event-1",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.input.required",
          message: "Choose a format.",
          createdAt: "2026-05-09T00:00:10.000Z",
          data: { id: "input-1", prompt: "Choose a format." },
        },
        {
          id: "event-2",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 2,
          type: "workflow.input.received",
          message: "input-1",
          createdAt: "2026-05-09T00:00:12.000Z",
          data: { requestId: "input-1", text: "Markdown" },
        },
      ]),
    );

    expect(cards).toEqual([]);
  });

  it("orders multiple pending requests by newest event sequence", () => {
    const cards = workflowRuntimeInputCards(
      detail([
        {
          id: "event-1",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.input.required",
          message: "First?",
          createdAt: "2026-05-09T00:00:10.000Z",
          data: { id: "input-1", prompt: "First?" },
        },
        {
          id: "event-2",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 2,
          type: "workflow.input.required",
          message: "Second?",
          createdAt: "2026-05-09T00:00:20.000Z",
          data: { id: "input-2", prompt: "Second?" },
        },
      ]),
    );

    expect(cards.map((card) => card.requestId)).toEqual(["input-2", "input-1"]);
  });

  it("attaches artifact-backed context to runtime input requests", () => {
    const cards = workflowRuntimeInputCards(
      detail([
        {
          id: "event-1",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.input.required",
          message: "Do these labels look right?",
          createdAt: "2026-05-09T00:00:10.000Z",
          data: {
            id: "input-1",
            prompt: "Do these labels look right?",
            status: "pending",
            graphNodeId: "review-labels",
            data: {
              report: {
                title: "Classification preview",
                artifactPath: "/tmp/classification-preview.html",
                preview: "<section><h1>Classification preview</h1><p>12 files labeled.</p></section>",
              },
              summary: "Please review the generated HTML labels before the workflow applies them to every file.",
            },
          },
        },
      ]),
    );

    expect(cards[0]?.contextItems).toEqual([
      {
        id: "context-0",
        kind: "artifact",
        label: "Classification preview",
        detail: "Artifact for review",
        format: "html",
        value: "<section><h1>Classification preview</h1><p>12 files labeled.</p></section>",
        artifactPath: "/tmp/classification-preview.html",
      },
      {
        id: "context-1",
        kind: "preview",
        label: "Summary",
        detail: "Preview",
        format: "text",
        value: "Please review the generated HTML labels before the workflow applies them to every file.",
      },
    ]);
  });

  it("promotes browser intervention details while keeping source context readable", () => {
    const cards = workflowRuntimeInputCards(
      detail([
        {
          id: "event-1",
          runId: "run-1",
          artifactId: artifact.id,
          seq: 1,
          type: "workflow.input.required",
          message: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
          graphNodeId: "browser-intervention",
          createdAt: "2026-05-09T00:00:10.000Z",
          data: {
            id: "browser-input-1",
            prompt: "Browser needs user action before reading Scottsdale Family Shows Calendar.",
            choices: [
              { id: "completed", label: "I completed it", description: "Retry the same browser operation." },
              { id: "skip", label: "Skip this source", description: "Continue without this source." },
            ],
            allowFreeform: true,
            data: {
              browserIntervention: {
                title: "Browser challenge",
                kind: "captcha",
                provider: "recaptcha",
                status: "waiting",
                toolName: "browser_nav",
                profileMode: "isolated",
                browserUserActionId: "browser-action-family-shows",
                targetId: "target-1",
                url: "https://example.test/scottsdale/family-shows",
                message: "Complete the verification page in managed Chrome.",
                pageExcerpt: "Please verify you are human before viewing Scottsdale family shows.",
                screenshot: {
                  artifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
                  path: "/tmp/scottsdale-family-shows-verification.png",
                  bytes: 14321,
                  width: 1200,
                  height: 800,
                  url: "https://example.test/scottsdale/family-shows",
                },
              },
              browserPreview: {
                title: "Verification page",
                detail: "Captured when the browser paused.",
              },
              source: {
                title: "Scottsdale Family Shows Calendar",
                url: "https://example.test/scottsdale/family-shows",
                snippet: "Family shows and children's events.",
              },
              guidance: "Complete the browser challenge in the managed browser, then return here and continue.",
            },
          },
        },
      ]),
    );

    expect(cards[0]?.browserIntervention).toEqual({
      title: "Browser challenge",
      kind: "captcha",
      provider: "recaptcha",
      status: "waiting",
      toolName: "browser_nav",
      profileMode: "isolated",
      browserUserActionId: "browser-action-family-shows",
      targetId: "target-1",
      url: "https://example.test/scottsdale/family-shows",
      message: "Complete the verification page in managed Chrome.",
      preview: {
        title: "Verification page",
        detail: "Captured when the browser paused.",
        url: "https://example.test/scottsdale/family-shows",
        textExcerpt: "Please verify you are human before viewing Scottsdale family shows.",
        screenshotArtifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
        screenshotPath: "/tmp/scottsdale-family-shows-verification.png",
        screenshotBytes: 14321,
        screenshotWidth: 1200,
        screenshotHeight: 800,
      },
    });
    expect(cards[0]?.contextItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Scottsdale Family Shows Calendar",
          kind: "data",
          format: "json",
          value: expect.stringMatching(/Family shows/),
        }),
        expect.objectContaining({
          label: "Guidance",
          kind: "preview",
          format: "text",
          value: expect.stringMatching(/managed browser/),
        }),
      ]),
    );
    expect(cards[0]?.contextItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: "Browser challenge" })]));
    expect(cards[0]?.contextItems).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: "Browser preview" })]));
  });
});
