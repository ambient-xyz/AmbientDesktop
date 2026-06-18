import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ambientWorkflowsDescribeText,
  ambientWorkflowsInjectText,
  describeAmbientWorkflowPlaybook,
  injectAmbientWorkflowPlaybook,
  searchAmbientWorkflowPlaybooks,
} from "./workflowRecordingAmbientFacade";
import { ProjectStore } from "./workflowRecordingProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

interface RecorderGateCase {
  goal: string;
  userRequest: string;
  searchQueries: string[];
  inputs: string[];
  successfulExamples: Array<{ toolName: string; inputPreview: string; resultPreview: string }>;
  doNot: Array<{ toolName: string; status: "failed" | "skipped" | "permission_blocked"; reason: string }>;
  validation: string[];
  outputShape: string[];
}

const RELEASE_GATE_CASES: RecorderGateCase[] = [
  {
    goal: "Find romantic live theatrical events near Scottsdale for a date night.",
    userRequest: "Please discover live upcoming theatrical events around Scottsdale that work for a romantic date night.",
    searchQueries: [
      "romantic Scottsdale theatrical events couples date night",
      "upcoming Scottsdale live theater date night booking links",
      "date night live performance options near Scottsdale",
    ],
    inputs: ["Location: Scottsdale", "Occasion: romantic date night", "Need current event pages and booking links"],
    successfulExamples: [
      {
        toolName: "browser_search",
        inputPreview: '{"query":"Scottsdale romantic theatrical events couples date night"}',
        resultPreview: "Returned current venue listing pages with titles, dates, and booking URLs.",
      },
      {
        toolName: "browser_open",
        inputPreview: '{"url":"https://example.test/scottsdale-performing-arts"}',
        resultPreview: "Confirmed event date, venue, and ticket link from the venue page.",
      },
    ],
    doNot: [
      {
        toolName: "ambient_cli",
        status: "failed",
        reason: "Avoid treating raw CLI stdout as a typed collection of theatrical events.",
      },
    ],
    validation: ["Rank live/current events with venue, date, booking URL, source caveat, and date-night fit rationale."],
    outputShape: ["Ranked shortlist of date-night events with source links and caveats."],
  },
  {
    goal: "Build a tiny animated hello-world app and verify it renders.",
    userRequest: "Create a silly animated hello world page, preview it, and confirm the animation is visible.",
    searchQueries: [
      "animated hello world local app render verification",
      "tiny hello-world animation browser preview",
    ],
    inputs: ["Small static web app", "Animation must be visible", "Browser preview proof required"],
    successfulExamples: [
      {
        toolName: "file_write",
        inputPreview: '{"path":"index.html","content":"animated hello world markup"}',
        resultPreview: "Created the durable HTML artifact.",
      },
      {
        toolName: "browser_snapshot",
        inputPreview: '{"url":"file:///tmp/hello-world/index.html"}',
        resultPreview: "Snapshot showed the page text and animation container.",
      },
    ],
    doNot: [
      {
        toolName: "browser_snapshot",
        status: "failed",
        reason: "Do not accept a blank page snapshot as proof of a successful preview.",
      },
    ],
    validation: ["HTML file exists, preview loads, text is visible, and animation state can be observed."],
    outputShape: ["Created file path, preview proof, and a concise validation note."],
  },
  {
    goal: "Summarize Gmail action items without leaking private message bodies into the playbook.",
    userRequest: "Review recent Gmail threads for action items and summarize only safe metadata and agreed next steps.",
    searchQueries: [
      "Gmail action item extraction metadata safe summary",
      "email follow-up workflow connector summary no private bodies",
    ],
    inputs: ["Recent Gmail threads", "Action-item extraction", "Privacy-preserving summary"],
    successfulExamples: [
      {
        toolName: "gmail_search",
        inputPreview: '{"q":"newer_than:14d has:attachment OR label:inbox"}',
        resultPreview: "Returned thread ids, senders, dates, and subject metadata for triage.",
      },
      {
        toolName: "gmail_thread_read",
        inputPreview: '{"threadId":"redacted-thread-id","maxMessages":3}',
        resultPreview: "Extracted decisions and follow-ups from approved thread context.",
      },
    ],
    doNot: [
      {
        toolName: "file_write",
        status: "permission_blocked",
        reason: "Do not write raw email bodies into workflow markdown or sidecar files.",
      },
    ],
    validation: ["Output names owners, due dates when present, and omits raw private email text beyond approved excerpts."],
    outputShape: ["Action queue grouped by urgent, needs reply, waiting, and FYI."],
  },
  {
    goal: "Classify a small local folder and save a concise evidence report.",
    userRequest: "Look at a tiny local folder, classify files by type, and write a short report with counts.",
    searchQueries: [
      "local folder file classification evidence report",
      "classify local files write short report workflow",
    ],
    inputs: ["Workspace-local folder", "Counts by extension", "Short report artifact"],
    successfulExamples: [
      {
        toolName: "file_list",
        inputPreview: '{"path":"./demo-files"}',
        resultPreview: "Returned filenames and sizes for a bounded local folder.",
      },
      {
        toolName: "file_write",
        inputPreview: '{"path":"./demo-files/report.md"}',
        resultPreview: "Wrote a summary report with file counts and notes.",
      },
    ],
    doNot: [
      {
        toolName: "file_read",
        status: "skipped",
        reason: "Do not read large binary file contents when metadata is enough for classification.",
      },
    ],
    validation: ["Report count matches listed files and no large binary content is copied into the answer."],
    outputShape: ["Markdown report path plus counts by category."],
  },
  {
    goal: "Use an installed Ambient CLI package only after search and describe preflight.",
    userRequest: "Find the right installed CLI package for a bounded markdown transform and avoid unsafe command guessing.",
    searchQueries: [
      "Ambient CLI package preflight search describe command guidance",
      "installed cli workflow search describe before command execution",
    ],
    inputs: ["Installed package catalog", "Bounded markdown transform", "Explicit describe-before-use"],
    successfulExamples: [
      {
        toolName: "ambient_cli_search",
        inputPreview: '{"query":"markdown transform"}',
        resultPreview: "Returned candidate packages and told Pi to describe before use.",
      },
      {
        toolName: "ambient_cli_describe",
        inputPreview: '{"packageId":"markdown-tools","commandName":"summarize"}',
        resultPreview: "Returned command schema, env requirements, and bounded skill text.",
      },
    ],
    doNot: [
      {
        toolName: "ambient_cli",
        status: "failed",
        reason: "Do not execute a guessed package command without exact package id and command schema.",
      },
    ],
    validation: ["Final answer names the chosen package, exact command shape, and approval boundary before execution."],
    outputShape: ["Package recommendation with exact command preflight and safety note."],
  },
];

describeNative("workflow recorder release gate", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recorder-release-gate-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("records, confirms, searches, describes, and injects varied workflow playbooks", () => {
    const savedIds = new Set<string>();

    for (const [index, testCase] of RELEASE_GATE_CASES.entries()) {
      const thread = store.createWorkflowRecordingThread({
        goal: jitterGoal(testCase.goal, index),
        workspacePath,
      });
      store.addMessage({ threadId: thread.id, role: "user", content: testCase.userRequest });
      for (const [toolIndex, example] of testCase.successfulExamples.entries()) {
        store.addMessage({
          threadId: thread.id,
          role: "tool",
          content: [
            `${example.toolName} completed`,
            "",
            "Input",
            example.inputPreview,
            "",
            "Result",
            example.resultPreview,
          ].join("\n"),
          metadata: {
            toolName: example.toolName,
            toolCallId: `${thread.id}-success-${toolIndex}`,
            status: "done",
          },
        });
      }
      for (const [toolIndex, avoid] of testCase.doNot.entries()) {
        store.addMessage({
          threadId: thread.id,
          role: "tool",
          content: `${avoid.toolName} ${avoid.status}\n${avoid.reason}`,
          metadata: {
            toolName: avoid.toolName,
            toolCallId: `${thread.id}-avoid-${toolIndex}`,
            status: avoid.status === "failed" ? "error" : avoid.status,
          },
        });
      }
      store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: testCase.validation[0],
        metadata: { status: "done" },
      });

      const stopped = store.stopWorkflowRecording(thread.id);
      expect(stopped.capture).toMatchObject({
        successfulToolResultCount: testCase.successfulExamples.length,
        failedToolResultCount: testCase.doNot.filter((item) => item.status === "failed").length,
      });

      store.updateWorkflowRecordingReviewDraft(thread.id, {
        intent: testCase.goal,
        inputs: testCase.inputs,
        successfulExamples: testCase.successfulExamples,
        doNot: testCase.doNot,
        validation: testCase.validation,
        outputShape: testCase.outputShape,
      });
      const confirmed = store.confirmWorkflowRecordingReview(thread.id);
      const saved = confirmed.review?.savedPlaybook;
      expect(saved).toMatchObject({ enabled: true, version: 1 });
      expect(savedIds.has(saved!.id)).toBe(false);
      savedIds.add(saved!.id);

      for (const query of testCase.searchQueries) {
        const search = searchAmbientWorkflowPlaybooks(store, { query, limit: 3 });
        expect(search.results[0]).toMatchObject({
          id: saved!.id,
          version: 1,
          enabled: true,
        });
      }

      const described = describeAmbientWorkflowPlaybook(store, { id: saved!.id, includeMarkdown: true, maxMarkdownChars: 260 });
      expect(described.playbook).toMatchObject({
        intent: testCase.goal,
        outputShape: testCase.outputShape,
      });
      expect(ambientWorkflowsDescribeText(described)).toContain("Injection is non-executing guidance only");

      const injected = injectAmbientWorkflowPlaybook(store, { id: saved!.id, version: 1, maxMarkdownChars: 320 });
      const injectionText = ambientWorkflowsInjectText(injected);
      expect(injectionText).toContain("Injected Workflow Playbook");
      expect(injectionText).toContain(testCase.successfulExamples[0].toolName);
      expect(injectionText).toContain(testCase.doNot[0].reason);
      expect(injected.guidanceMarkdown).not.toContain("WorkflowProgramIR");
    }

    expect(savedIds.size).toBe(RELEASE_GATE_CASES.length);
  });
});

function jitterGoal(goal: string, index: number): string {
  const prefixes = [
    "Repeatable workflow:",
    "Record this as a reusable playbook:",
    "Capture successful tool calls for:",
    "Make this easy to run again:",
    "Workflow recording target:",
  ];
  return `${prefixes[index % prefixes.length]} ${goal}`;
}
