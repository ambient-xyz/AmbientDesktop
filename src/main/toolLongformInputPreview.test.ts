import { describe, expect, it } from "vitest";
import { buildToolLongformInputPreview } from "./toolLongformInputPreview";

describe("buildToolLongformInputPreview", () => {
  it("builds write-style previews before transcript truncation", () => {
    const preview = buildToolLongformInputPreview("write", {
      path: "src/generated.ts",
      content: "a".repeat(1200),
    });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Input",
      runningTitle: "Writing",
      summary: "src/generated.ts",
      items: [
        {
          label: "File",
          fieldPath: "content",
          path: "src/generated.ts",
          language: "typescript",
          chars: 1200,
          truncated: true,
        },
      ],
    });
    expect(preview?.items[0]?.preview).toHaveLength(1004);
    expect(preview?.items[0]?.preview).toContain("\n...");
  });

  it("treats file_write like write", () => {
    expect(
      buildToolLongformInputPreview("file_write", {
        path: "reports/out.md",
        content: "done",
      }),
    ).toMatchObject({
      runningTitle: "Writing file",
      summary: "reports/out.md",
      items: [{ path: "reports/out.md", language: "markdown", preview: "done", chars: 4, truncated: false }],
    });
  });

  it("preserves every apply-repair file as separate metadata", () => {
    const preview = buildToolLongformInputPreview("ambient_capability_builder_apply_repair", {
      packageName: "ambient-example",
      files: [
        { path: "ambient-cli.json", content: "{}\n", rationale: "Descriptor." },
        { path: "scripts/run.mjs", content: "console.log('ok');\n" },
      ],
    });

    expect(preview).toMatchObject({
      title: "Repair files",
      runningTitle: "Applying repair",
      summary: "ambient-example · 2 files · 22 chars",
      items: [
        { label: "File 1", fieldPath: "files[0].content", path: "ambient-cli.json", chars: 3, note: "Descriptor." },
        { label: "File 2", fieldPath: "files[1].content", path: "scripts/run.mjs", chars: 19 },
      ],
    });
  });

  it("builds browser_eval previews only for long JavaScript", () => {
    expect(buildToolLongformInputPreview("browser_eval", { code: "return document.title;" })).toBeUndefined();

    const preview = buildToolLongformInputPreview("browser_eval", { code: "x".repeat(1200) });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Code",
      runningTitle: "Evaluating code",
      summary: "JavaScript · 1,200 chars",
      items: [
        {
          label: "Code",
          fieldPath: "code",
          language: "javascript",
          chars: 1200,
          truncated: true,
        },
      ],
    });
    expect(preview?.items[0]?.preview).toHaveLength(1004);
  });

  it("builds Google Workspace previews for long Gmail draft bodies", () => {
    const preview = buildToolLongformInputPreview("google_workspace_call", {
      methodId: "gmail.users.drafts.create",
      params: { userId: "me" },
      gmailDraft: {
        to: "nobody@example.test",
        subject: "Draft",
        textBody: "a".repeat(700),
        htmlBody: "b".repeat(800),
      },
    });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Request body",
      runningTitle: "Calling Google Workspace",
      summary: "gmail.users.drafts.create · 2 bodies · 1,500 chars",
      items: [
        {
          label: "Gmail text body",
          fieldPath: "gmailDraft.textBody",
          language: "text",
          chars: 700,
          truncated: false,
        },
        {
          label: "Gmail HTML body",
          fieldPath: "gmailDraft.htmlBody",
          language: "html",
          chars: 800,
          truncated: false,
        },
      ],
    });
  });

  it("builds Google Workspace previews for structured request bodies", () => {
    const preview = buildToolLongformInputPreview("google_workspace_call", {
      methodId: "docs.documents.batchUpdate",
      body: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: "c".repeat(700),
            },
          },
        ],
      },
    });

    expect(preview).toMatchObject({
      summary: expect.stringContaining("docs.documents.batchUpdate · 1 body · "),
      items: [
        {
          label: "Request body",
          fieldPath: "body",
          language: "json",
          truncated: false,
        },
      ],
    });
    expect(preview?.items[0]?.chars).toBeGreaterThan(700);
  });

  it("does not preview sensitive-looking Google Workspace request bodies", () => {
    expect(
      buildToolLongformInputPreview("google_workspace_call", {
        methodId: "example.sensitive",
        body: { apiKey: "x".repeat(700) },
      }),
    ).toBeUndefined();
  });

  it("builds Ambient CLI previews for long string args only", () => {
    expect(
      buildToolLongformInputPreview("ambient_cli", {
        packageName: "ambient-json-cli",
        command: "json-pick",
        args: ["payload.json", "message"],
      }),
    ).toBeUndefined();

    const preview = buildToolLongformInputPreview("ambient_cli", {
      packageName: "ambient-tts",
      command: "tts",
      args: ["--text", "a".repeat(1200), "--format", "wav"],
    });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Arguments",
      runningTitle: "Running Ambient CLI",
      summary: "ambient-tts · tts · 1 arg · 1,200 chars",
      items: [
        {
          label: "args[1]",
          fieldPath: "args[1]",
          language: "text",
          note: "Flag: --text",
          chars: 1200,
          truncated: true,
        },
      ],
    });
    expect(preview?.items[0]?.preview).toHaveLength(1004);
  });

  it("builds workflow update previews for structured playbook drafts", () => {
    const preview = buildToolLongformInputPreview("ambient_workflows_update", {
      id: "workflow-date-night",
      baseVersion: 3,
      draft: {
        intent: "Find date-night theatre events in a target city.",
        inputs: ["city", "date window"],
        successfulExamples: [
          {
            toolName: "web_research_search",
            inputPreview: "Scottsdale theatre this weekend",
            resultPreview: "Returned venue listings.",
          },
        ],
        doNot: [
          {
            toolName: "browser_nav",
            status: "failed",
            reason: "Do not rely on search result pages that require CAPTCHA.",
          },
        ],
        validation: ["Confirm date, venue, price, and source URL."],
        outputShape: ["Shortlist of 3-5 options with source links."],
      },
    });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Workflow update",
      runningTitle: "Updating workflow playbook",
      summary: "Find date-night theatre events in a target city. · base v3 · 1 example · 1 do-not pattern",
      items: [
        { label: "Intent", fieldPath: "draft.intent", chars: 48, truncated: false },
        { label: "Inputs", fieldPath: "draft.inputs", language: "markdown" },
        { label: "Successful examples", fieldPath: "draft.successfulExamples", language: "markdown" },
        { label: "Do not", fieldPath: "draft.doNot", language: "markdown" },
        { label: "Validation", fieldPath: "draft.validation", language: "markdown" },
        { label: "Output shape", fieldPath: "draft.outputShape", language: "markdown" },
      ],
    });
    expect(preview?.items.find((item) => item.label === "Successful examples")?.preview).toContain("web_research_search");
    expect(preview?.items.find((item) => item.label === "Do not")?.preview).toContain("CAPTCHA");
  });

  it("does not preview sensitive-looking Ambient CLI args", () => {
    expect(
      buildToolLongformInputPreview("ambient_cli", {
        packageName: "secret-cli",
        command: "run",
        args: ["--api-key", "x".repeat(700)],
      }),
    ).toBeUndefined();

    expect(
      buildToolLongformInputPreview("ambient_cli", {
        packageName: "secret-cli",
        command: "run",
        args: [`API_KEY=${"x".repeat(700)}`],
      }),
    ).toBeUndefined();

    expect(
      buildToolLongformInputPreview("ambient_cli", {
        packageName: "secret-cli",
        command: "run",
        args: [JSON.stringify({ apiKey: "x".repeat(700) })],
      }),
    ).toBeUndefined();
  });

  it("builds generic plugin previews for long markdown fields", () => {
    expect(
      buildToolLongformInputPreview("remote_plugin_render_markdown", {
        markdown: "short",
      }),
    ).toBeUndefined();

    const preview = buildToolLongformInputPreview("remote_plugin_render_markdown", {
      title: "Weekly note",
      markdown: "# Heading\n\n".concat("body ".repeat(160)),
    });

    expect(preview).toMatchObject({
      kind: "longform-input",
      title: "Long input",
      runningTitle: "Calling tool",
      summary: "remote_plugin_render_markdown · 1 field · 811 chars",
      items: [
        {
          label: "Markdown",
          fieldPath: "markdown",
          language: "markdown",
          chars: 811,
          truncated: false,
        },
      ],
    });
  });

  it("builds generic plugin previews for nested structured body fields", () => {
    const preview = buildToolLongformInputPreview("remote_plugin_batch", {
      request: {
        body: {
          sections: [{ text: "hello" }],
          payload: "x".repeat(650),
        },
      },
    });

    expect(preview).toMatchObject({
      summary: expect.stringContaining("remote_plugin_batch · 1 field · "),
      items: [
        {
          label: "Body",
          fieldPath: "request.body",
          language: "json",
        },
      ],
    });
    expect(preview?.items[0]?.chars).toBeGreaterThan(650);
  });

  it("does not preview generic plugin fields under sensitive-looking paths", () => {
    expect(
      buildToolLongformInputPreview("remote_plugin_sensitive", {
        credentials: {
          markdown: "x".repeat(700),
        },
      }),
    ).toBeUndefined();

    expect(
      buildToolLongformInputPreview("remote_plugin_sensitive", {
        body: {
          apiKey: "x".repeat(700),
          content: "safe-looking content",
        },
      }),
    ).toBeUndefined();
  });
});
