import { describe, expect, it } from "vitest";
import type { WorkflowProgramIR } from "../shared/workflowProgramIr";
import { firstPartyDesktopToolDescriptors } from "./desktopToolRegistry";
import { googleWorkspaceConnectorDescriptors } from "./googleWorkspaceConnectors";
import type { WorkflowConnectorDescriptor } from "./workflowConnectors";
import { compileWorkflowProgramIr, type WorkflowProgramAmbientCliCapability } from "./workflowProgramCompiler";

function arxivCapability(overrides: Partial<WorkflowProgramAmbientCliCapability> = {}): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search",
    registryPluginId: "pi-catalog",
    packageId: "pi-catalog:pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
    availability: "available",
    missingEnv: [],
    ...overrides,
  };
}

function braveSearchCapability(overrides: Partial<WorkflowProgramAmbientCliCapability> = {}): WorkflowProgramAmbientCliCapability {
  return {
    capabilityId: "installed:ambient-brave-api-search:tool:brave_search",
    registryPluginId: "ambient-cli",
    packageId: "installed:ambient-brave-api-search",
    packageName: "ambient-brave-api-search",
    command: "brave_search",
    availability: "available",
    missingEnv: ["BRAVE_API_KEY"],
    ...overrides,
  };
}

async function compilePlanCase(
  program: WorkflowProgramIR,
  options: { ambientCliCapabilities?: WorkflowProgramAmbientCliCapability[]; connectorDescriptors?: WorkflowConnectorDescriptor[] } = {},
) {
  return await compileWorkflowProgramIr({
    toolDescriptors: firstPartyDesktopToolDescriptors(),
    connectorDescriptors: options.connectorDescriptors,
    ambientCliCapabilities: options.ambientCliCapabilities,
    program,
  });
}

function dryRunCallNames(result: Awaited<ReturnType<typeof compilePlanCase>>): string[] {
  return result.dryRun.calls.map((call) => `${call.kind}:${call.name}`);
}

describe("fixWorkflowCompiler deterministic plan coverage", () => {
  it("case 1: compiles browser search, browser content, and staged file report output", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Browser Search To File Report",
      goal: "Search public web results for upcoming folk music performances in Scottsdale and save a markdown report.",
      nodes: [
        { id: "search-web", kind: "tool.call", tool: "browser_search", args: { query: "Scottsdale upcoming Celtic folk music performances", maxResults: 5 } },
        {
          id: "read-top-result",
          kind: "tool.call",
          tool: "browser_content",
          dependsOn: ["search-web"],
          args: { url: { fromNode: "search-web", path: "0.url" } },
        },
        {
          id: "summarize-results",
          kind: "model.call",
          dependsOn: ["read-top-result"],
          task: "summarize.scottsdale.folk.venues",
          input: { searchResults: { fromNode: "search-web" }, page: { fromNode: "read-top-result" } },
          output: { schema: { summary: "string", venues: "array" } },
        },
        {
          id: "build-report",
          kind: "transform.template",
          dependsOn: ["summarize-results"],
          template: "# Scottsdale Folk Music\n\n{{summary.summary}}",
          vars: { summary: { fromNode: "summarize-results" } },
        },
        {
          id: "write-report",
          kind: "tool.call",
          tool: "file_write",
          dependsOn: ["build-report"],
          args: { path: "reports/scottsdale-folk.md", content: { fromNode: "build-report", path: "value" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["write-report"], value: { report: { fromNode: "write-report", path: "path" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_search", "browser_content", "ambient.responses", "file_write"]));
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.source).toContain("tools.browser_search");
    expect(result.output.source).toContain("tools.browser_content");
    expect(result.output.source).toContain("workflow.stageMutation");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:browser_search", "tool:browser_content", "tool:file_write"]));
  });

  it("case 2: compiles browser navigation, screenshot evidence, model QA, and checkpointing", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Browser Navigation Screenshot QA",
      goal: "Open a local fixture page, inspect content, capture a screenshot, ask Ambient for a QA diagnosis, and checkpoint evidence.",
      nodes: [
        { id: "open-fixture", kind: "tool.call", tool: "browser_nav", args: { url: "http://127.0.0.1:5173/fixture.html" } },
        { id: "read-fixture", kind: "tool.call", tool: "browser_content", dependsOn: ["open-fixture"], args: {} },
        { id: "capture-screenshot", kind: "tool.call", tool: "browser_screenshot", dependsOn: ["read-fixture"], args: {} },
        {
          id: "checkpoint-evidence",
          kind: "checkpoint.write",
          dependsOn: ["capture-screenshot"],
          key: "browserQaEvidence",
          value: {
            content: { fromNode: "read-fixture" },
            screenshotPath: { fromNode: "capture-screenshot", path: "screenshotPath" },
          },
        },
        {
          id: "diagnose-page",
          kind: "model.call",
          dependsOn: ["checkpoint-evidence"],
          task: "diagnose.browser.qa",
          input: { evidence: { fromNode: "checkpoint-evidence" } },
          output: { schema: { summary: "string", issues: "array", screenshotReviewed: "boolean" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["diagnose-page"], value: { diagnosis: { fromNode: "diagnose-page" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["browser_nav", "browser_content", "browser_screenshot", "ambient.responses"]));
    expect(result.output.source).toContain("outputContract");
    expect(result.output.source).toContain('workflow.checkpoint("browserQaEvidence"');
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:browser_nav", "tool:browser_content", "tool:browser_screenshot", "model:diagnose.browser.qa"]));
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["checkpoint:browserQaEvidence"]));
  });

  it("case 3: compiles browser login and picker flows with first-class intervention handoff", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Browser Intervention Handling",
      goal: "Visit a site that may require login or CAPTCHA and collect page evidence if accessible.",
      nodes: [
        { id: "open-login", kind: "tool.call", tool: "browser_nav", args: { url: "https://example.com/login" } },
        { id: "pick-login-fields", kind: "tool.call", tool: "browser_pick", dependsOn: ["open-login"], args: { prompt: "Select the login form fields." } },
        {
          id: "login",
          kind: "browser.intervention",
          tool: "browser_login",
          dependsOn: ["pick-login-fields"],
          args: { credentialId: "stored-example-login", expectedOrigin: "https://example.com", submit: true },
          prompt: "Complete any MFA, CAPTCHA, passkey, or device confirmation in the browser, then continue or skip.",
          choices: [
            { id: "completed", label: "I completed it" },
            { id: "skip", label: "Skip" },
          ],
          retry: { maxAttempts: 0 },
          screenshot: { enabled: true, args: {} },
        },
        {
          id: "read-account",
          kind: "browser.intervention",
          tool: "browser_content",
          dependsOn: ["login"],
          args: { url: "https://example.com/account" },
          source: { browserIntervention: { fromNode: "login", path: "browserIntervention" } },
          skipIf: { fromNode: "login", path: "skipped" },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["read-account"], value: { page: { fromNode: "read-account" } } },
      ],
    });

    expect(result.output.graph?.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "login", type: "data_source" })]));
    expect(result.output.source).toContain("workflow.askUser");
    expect(result.output.source).toContain("browser-login-user-action-completed");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:browser_pick", "tool:browser_login", "tool:browser_screenshot", "tool:browser_content"]));
  });

  it("case 4: compiles local file read summarization without write grants", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Local File Read Summarization",
      goal: "Read a workspace markdown file and create a summary checkpoint.",
      nodes: [
        { id: "read-notes", kind: "tool.call", tool: "file_read", args: { path: "notes/project.md" } },
        {
          id: "summarize-notes",
          kind: "model.call",
          dependsOn: ["read-notes"],
          task: "summarize.local.markdown",
          input: { markdown: { fromNode: "read-notes", path: "content" } },
          output: { schema: { summary: "string", actionItems: "array" } },
        },
        { id: "checkpoint-summary", kind: "checkpoint.write", dependsOn: ["summarize-notes"], key: "localFileSummary", value: { fromNode: "summarize-notes" } },
        { id: "final-output", kind: "output.final", dependsOn: ["checkpoint-summary"], value: { summary: { fromNode: "checkpoint-summary" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["file_read", "ambient.responses"]));
    expect(result.output.manifest.tools).not.toContain("file_write");
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.source).toContain('readPath(outputs["read-notes"], "content")');
  });

  it("case 5: compiles deterministic CSV transform and staged markdown write", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Local File Transform And Write",
      goal: "Read a CSV, create a cleaned markdown table, and write it to reports/table.md.",
      nodes: [
        { id: "read-csv", kind: "tool.call", tool: "file_read", args: { path: "data/source.csv" } },
        {
          id: "build-table",
          kind: "transform.template",
          dependsOn: ["read-csv"],
          template: "# Clean Table\n\nSource CSV:\n\n```csv\n{{csv.content}}\n```",
          vars: { csv: { fromNode: "read-csv" } },
        },
        {
          id: "write-table",
          kind: "tool.call",
          tool: "file_write",
          dependsOn: ["build-table"],
          args: { path: "reports/table.md", content: { fromNode: "build-table", path: "value" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["write-table"], value: { table: { fromNode: "write-table" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["file_read", "file_write"]));
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(result.output.source).toContain("workflow.stageMutation");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:file_read", "tool:file_write"]));
  });

  it("case 6: compiles bounded bash test execution and Ambient failure classification without raw process access", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Bash Test Runner With Failure Classification",
      goal: "Run the local test command and classify failures.",
      nodes: [
        { id: "run-tests", kind: "tool.call", tool: "bash", args: { command: "pnpm exec vitest run src/main/workflowProgramCompiler.test.ts --reporter=dot" } },
        {
          id: "classify-failure",
          kind: "model.call",
          dependsOn: ["run-tests"],
          task: "classify.test.failure",
          input: { testResult: { fromNode: "run-tests" } },
          output: { schema: { classification: "string", summary: "string", productIssue: "boolean" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["classify-failure"], value: { classification: { fromNode: "classify-failure" } } },
      ],
      budgets: { maxRunMs: 120000 },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["bash", "ambient.responses"]));
    expect(result.output.source).not.toMatch(/\bprocess\b|child_process|require\(/);
    expect(result.output.source).toContain("tools.bash");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:bash", "model:classify.test.failure"]));
  });

  it("case 7: compiles Ambient CLI search, describe, exact command execution, and summary", async () => {
    const result = await compilePlanCase(
      {
        version: 1,
        title: "Ambient CLI Search Describe Run",
        goal: "Use an installed Ambient CLI package to search arXiv and summarize the result.",
        nodes: [
          { id: "search-cli-capabilities", kind: "tool.call", tool: "ambient_cli_search", args: { query: "arXiv paper search", kind: "command", limit: 5 } },
          {
            id: "describe-arxiv",
            kind: "tool.call",
            tool: "ambient_cli_describe",
            dependsOn: ["search-cli-capabilities"],
            args: { packageName: "pi-arxiv", command: "arxiv_search" },
          },
          {
            id: "search-arxiv",
            kind: "tool.call",
            tool: "ambient_cli",
            dependsOn: ["describe-arxiv"],
            args: { packageName: "pi-arxiv", command: "arxiv_search", args: ["workflow compiler", "--max-results", "3"] },
          },
          {
            id: "summarize-arxiv",
            kind: "model.call",
            dependsOn: ["search-arxiv"],
            task: "summarize.ambient.cli.arxiv",
            input: { stdout: { fromNode: "search-arxiv", path: "stdout" } },
            output: { schema: { summary: "string", citations: "array" } },
          },
          { id: "final-output", kind: "output.final", dependsOn: ["summarize-arxiv"], value: { summary: { fromNode: "summarize-arxiv" } } },
        ],
      },
      { ambientCliCapabilities: [arxivCapability()] },
    );

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["ambient_cli_search", "ambient_cli_describe", "ambient_cli", "ambient.responses"]));
    expect(result.output.manifest.ambientCliCapabilities).toEqual([
      expect.objectContaining({ packageName: "pi-arxiv", command: "arxiv_search", capabilityId: "pi-catalog:pi-arxiv:tool:arxiv_search" }),
    ]);
    expect(result.output.source).toContain("tools.ambient_cli_search");
    expect(result.output.source).toContain("tools.ambient_cli_describe");
    expect(result.output.source).toContain("tools.ambient_cli");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:ambient_cli_search", "tool:ambient_cli_describe", "tool:ambient_cli"]));
  });

  it("case 8: blocks Ambient CLI execution while declared env requirements remain unsatisfied", async () => {
    await expect(
      compilePlanCase(
        {
          version: 1,
          title: "Ambient CLI Missing Secret Blocker",
          goal: "Use an installed cloud-backed CLI package that requires an API key.",
          nodes: [
            { id: "describe-brave", kind: "tool.call", tool: "ambient_cli_describe", args: { packageName: "ambient-brave-api-search", command: "brave_search" } },
            {
              id: "request-secret",
              kind: "tool.call",
              tool: "ambient_cli_secret_request",
              dependsOn: ["describe-brave"],
              args: { packageName: "ambient-brave-api-search", envName: "BRAVE_API_KEY" },
            },
            {
              id: "bind-secret-file",
              kind: "mutation.stage",
              tool: "ambient_cli_env_bind",
              dependsOn: ["request-secret"],
              args: { packageName: "ambient-brave-api-search", envName: "BRAVE_API_KEY", filePath: "./brave_api_key.txt" },
            },
            {
              id: "run-brave",
              kind: "tool.call",
              tool: "ambient_cli",
              dependsOn: ["describe-brave", "bind-secret-file"],
              args: { packageName: "ambient-brave-api-search", command: "brave_search", args: ["Ambient workflow compiler", "-n", "1"] },
            },
          ],
        },
        { ambientCliCapabilities: [braveSearchCapability()] },
      ),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "ambient_cli.capability_missing_env", nodeId: "run-brave" })],
    });
  });

  it("case 9: compiles Google Workspace status readiness as read-only evidence", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Google Workspace Status And Readiness",
      goal: "Check whether Google Workspace is connected and summarize available accounts.",
      nodes: [
        { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
        { id: "checkpoint-status", kind: "checkpoint.write", dependsOn: ["google-status"], key: "googleWorkspaceStatus", value: { fromNode: "google-status" } },
        { id: "final-output", kind: "output.final", dependsOn: ["checkpoint-status"], value: { status: { fromNode: "checkpoint-status" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(["google_workspace_status"]);
    expect(result.output.manifest.googleWorkspaceMethods).toBeUndefined();
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:google_workspace_status", "checkpoint:googleWorkspaceStatus"]));
  });

  it("case 10: compiles Google Drive read-only method search and file listing", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Google Drive Read-Only Search",
      goal: 'Find recent Google Drive files matching "quarterly planning" and summarize their names and modified times.',
      nodes: [
        { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
        {
          id: "search-drive-methods",
          kind: "tool.call",
          tool: "google_workspace_search_methods",
          dependsOn: ["google-status"],
          args: { service: "drive", query: "list files", sideEffect: "personal_content_read", httpMethod: "GET" },
        },
        {
          id: "list-drive-files",
          kind: "tool.call",
          tool: "google_workspace_call",
          dependsOn: ["search-drive-methods"],
          args: {
            accountHint: { fromNode: "google-status", path: "accounts.0.accountHint" },
            methodId: "drive.files.list",
            params: {
              q: "name contains 'quarterly planning'",
              pageSize: 10,
              fields: "files(id,name,mimeType,modifiedTime)",
            },
          },
        },
        {
          id: "summarize-drive-files",
          kind: "model.call",
          dependsOn: ["list-drive-files"],
          task: "summarize.google.drive.files",
          input: { files: { fromNode: "list-drive-files", path: "files" } },
          output: { schema: { summary: "string", files: "array" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["summarize-drive-files"], value: { summary: { fromNode: "summarize-drive-files" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["google_workspace_status", "google_workspace_search_methods", "google_workspace_call", "ambient.responses"]));
    expect(result.output.manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({ methodId: "drive.files.list", service: "drive", httpMethod: "GET", sideEffect: "personal_content_read" }),
    ]);
    expect(JSON.stringify(result.output.manifest.googleWorkspaceMethods)).not.toMatch(/create|update|delete|copy|share/i);
  });

  it("case 11: compiles Google Calendar read-only agenda with explicit timezone policy", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Google Calendar Read-Only Agenda",
      goal: "Read tomorrow's Google Calendar events and summarize schedule conflicts.",
      nodes: [
        { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
        {
          id: "search-calendar-methods",
          kind: "tool.call",
          tool: "google_workspace_search_methods",
          dependsOn: ["google-status"],
          args: { service: "calendar", query: "events list", sideEffect: "personal_content_read", httpMethod: "GET" },
        },
        {
          id: "list-events",
          kind: "tool.call",
          tool: "google_workspace_call",
          dependsOn: ["search-calendar-methods"],
          args: {
            accountHint: { fromNode: "google-status", path: "accounts.0.accountHint" },
            methodId: "calendar.events.list",
            params: {
              calendarId: "primary",
              timeMin: "2026-05-16T00:00:00-07:00",
              timeMax: "2026-05-17T00:00:00-07:00",
              timeZone: "America/Phoenix",
              singleEvents: true,
              orderBy: "startTime",
            },
          },
        },
        {
          id: "summarize-conflicts",
          kind: "model.call",
          dependsOn: ["list-events"],
          task: "summarize.google.calendar.conflicts",
          input: { events: { fromNode: "list-events", path: "events" } },
          output: { schema: { summary: "string", conflicts: "array" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["summarize-conflicts"], value: { agenda: { fromNode: "summarize-conflicts" } } },
      ],
    });

    expect(result.output.manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({
        methodId: "calendar.events.list",
        service: "calendar",
        requiresTimeRange: true,
        accountProvenance: "google_workspace_status",
      }),
    ]);
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:google_workspace_call", "model:summarize.google.calendar.conflicts"]));
  });

  it("case 12: compiles Google Docs read-only export, local materialization, and file inspection", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Google Docs Read And Local Materialization",
      goal: "Read a Google Doc by handle, extract its text, and save a local workspace copy for review.",
      nodes: [
        { id: "google-status", kind: "tool.call", tool: "google_workspace_status", args: {} },
        {
          id: "search-doc-methods",
          kind: "tool.call",
          tool: "google_workspace_search_methods",
          dependsOn: ["google-status"],
          args: { service: "drive", query: "export Google Docs as text", sideEffect: "personal_content_read", httpMethod: "GET" },
        },
        {
          id: "export-doc",
          kind: "tool.call",
          tool: "google_workspace_call",
          dependsOn: ["search-doc-methods"],
          args: {
            accountHint: { fromNode: "google-status", path: "accounts.0.accountHint" },
            methodId: "drive.files.export",
            params: { fileId: "doc-123", mimeType: "text/plain" },
          },
        },
        {
          id: "materialize-doc",
          kind: "tool.call",
          tool: "google_workspace_materialize_file",
          dependsOn: ["export-doc"],
          args: { handle: { fromNode: "export-doc", path: "fileHandle" }, path: "Google Workspace Downloads/doc-123.txt" },
        },
        {
          id: "read-local-copy",
          kind: "tool.call",
          tool: "file_read",
          dependsOn: ["materialize-doc"],
          args: { path: { fromNode: "materialize-doc", path: "path" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["read-local-copy"], value: { text: { fromNode: "read-local-copy", path: "content" } } },
      ],
    });

    expect(result.output.manifest.tools).toEqual(
      expect.arrayContaining(["google_workspace_status", "google_workspace_search_methods", "google_workspace_call", "google_workspace_materialize_file", "file_read"]),
    );
    expect(result.output.manifest.googleWorkspaceMethods).toEqual([
      expect.objectContaining({ methodId: "drive.files.export", service: "drive", httpMethod: "GET", sideEffect: "personal_content_read" }),
    ]);
    expect(result.output.manifest.mutationPolicy).toBe("staged_until_approved");
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:google_workspace_call", "tool:google_workspace_materialize_file", "tool:file_read"]));
  });

  it("case 13: compiles local Downloads inventory and categorization without Drive or shell", async () => {
    const result = await compilePlanCase({
      version: 1,
      title: "Downloads Folder Categorization",
      goal: "Review the documents and folders in the user's Downloads directory and classify them into up to 7 categories.",
      nodes: [
        {
          id: "list-downloads",
          kind: "tool.call",
          tool: "local_directory_list",
          args: { path: "~/Downloads", maxEntries: 300, maxDepth: 1 },
          output: { type: "local-directory-inventory" },
        },
        {
          id: "classify-downloads",
          kind: "model.call",
          dependsOn: ["list-downloads"],
          task: "classify.local.downloads.inventory",
          input: {
            directory: { fromNode: "list-downloads", path: "rootPath" },
            entries: { fromNode: "list-downloads", path: "entries" },
            skipped: { fromNode: "list-downloads", path: "skipped" },
            truncated: { fromNode: "list-downloads", path: "truncated" },
            totalKnownEntries: { fromNode: "list-downloads", path: "totalKnownEntries" },
            instruction: "Classify the visible documents and folders into up to 7 practical categories using metadata only.",
          },
          output: { schema: { categories: "array", summary: "string", skippedNote: "string" } },
        },
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: ["classify-downloads", "list-downloads"],
          value: {
            classification: { fromNode: "classify-downloads" },
            skipped: { fromNode: "list-downloads", path: "skipped" },
            truncated: { fromNode: "list-downloads", path: "truncated" },
          },
        },
      ],
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient.responses"]));
    expect(result.output.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash"]));
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.graph?.nodes.find((node) => node.id === "list-downloads")).toMatchObject({
      type: "data_source",
      toolNames: ["local_directory_list"],
    });
    expect(result.output.source).toContain('"skipped": readPath(outputs["list-downloads"], "skipped")');
    expect(result.output.source).toContain('"truncated": readPath(outputs["list-downloads"], "truncated")');
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:local_directory_list", "model:classify.local.downloads.inventory"]));
  });

  it("case 14: compiles Gmail read-only categorization with Ambient Desktop model calls", async () => {
    const connectorDescriptors = googleWorkspaceConnectorDescriptors({
      adapter: "gws",
      states: {
        "google.gmail": {
          status: "available",
          accounts: [{ id: "default", label: "Default Gmail" }],
        },
      },
    }).filter((descriptor) => descriptor.id === "google.gmail");
    const result = await compilePlanCase(
      {
        version: 1,
        title: "Gmail Categorization Report",
        goal: "Review the last 100 Gmail emails and categorize them without mutating Gmail.",
        nodes: [
          {
            id: "search-gmail",
            kind: "connector.call",
            connectorId: "google.gmail",
            operation: "search",
            accountId: "default",
            input: { query: "", maxResults: 100 },
            output: { schema: { messages: "array", threads: "array", nextPageToken: "string|null" } },
          },
          {
            id: "gmail-items",
            kind: "error.handle",
            dependsOn: ["search-gmail"],
            try: { fromNode: "search-gmail", path: "messages" },
            fallback: { fromNode: "search-gmail", path: "threads" },
            errorMessage: "Gmail search returned no messages array; falling back to threads.",
          },
          {
            id: "read-gmail-threads",
            kind: "connector.map",
            dependsOn: ["gmail-items"],
            connectorId: "google.gmail",
            operation: "readThread",
            accountId: "default",
            items: { fromNode: "gmail-items", path: "value" },
            itemName: "message",
            input: { threadId: { fromItem: "message", path: "threadId" }, format: "metadata" },
            maxItems: 100,
            maxConcurrency: 4,
            output: { schema: { items: "array", count: "number", sourceCount: "number", truncated: "boolean" } },
          },
          {
            id: "gmail-thread-chunks",
            kind: "collection.chunk",
            dependsOn: ["read-gmail-threads"],
            items: { fromNode: "read-gmail-threads", path: "items" },
            chunkSize: 25,
            maxChunks: 4,
          },
          {
            id: "categorize-email-chunks",
            kind: "model.map",
            dependsOn: ["gmail-thread-chunks"],
            items: { fromNode: "gmail-thread-chunks", path: "chunks" },
            itemName: "chunk",
            task: "categorize.gmail.email.chunk",
            input: {
              instruction:
                "Categorize this bounded Gmail thread chunk with concise labels, evidence examples, action items, and recurring themes.",
              threads: { fromItem: "chunk", path: "items" },
            },
            output: { schema: { chunkId: "string", categories: "array", actionItems: "array", recurringThemes: "array" } },
            maxItems: 4,
            maxConcurrency: 2,
          },
          {
            id: "categorize-emails",
            kind: "model.reduce",
            dependsOn: ["categorize-email-chunks"],
            items: { fromNode: "categorize-email-chunks", path: "results" },
            task: "reduce.gmail.email.categories",
            input: {
              instruction:
                "Merge chunk category outputs into a final report with summary:string, up to 7 categories, actionItems:array, and recurringThemes:array.",
              sourceCount: { fromNode: "read-gmail-threads", path: "sourceCount" },
              truncated: { fromNode: "read-gmail-threads", path: "truncated" },
            },
            output: { schema: { summary: "string", categories: "array", actionItems: "array", recurringThemes: "array" } },
            maxInputItems: 4,
            strategy: "tree",
            maxFanIn: 4,
            maxLevels: 1,
          },
          {
            id: "checkpoint-email-categories",
            kind: "checkpoint.write",
            dependsOn: ["categorize-emails"],
            key: "gmailCategorization",
            value: {
              search: { fromNode: "search-gmail" },
              readSummary: { fromNode: "read-gmail-threads" },
              report: { fromNode: "categorize-emails" },
            },
          },
          {
            id: "final-output",
            kind: "output.final",
            dependsOn: ["checkpoint-email-categories"],
            value: { gmailCategorization: { fromNode: "checkpoint-email-categories" } },
          },
        ],
        budgets: { maxConnectorCalls: 101, maxModelCalls: 5, maxRunMs: 900_000 },
      },
      { connectorDescriptors },
    );

    expect(result.output.manifest.tools).toEqual(["ambient.responses"]);
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.manifest.connectors).toEqual([
      expect.objectContaining({
        connectorId: "google.gmail",
        accountId: "default",
        scopes: expect.arrayContaining(["gmail.readonly"]),
        operations: expect.arrayContaining(["search", "readThread"]),
        dataRetention: "redacted_audit",
      }),
    ]);
    expect(result.output.manifest.connectors?.[0]?.operations).not.toEqual(expect.arrayContaining(["createDraft", "updateDraft", "deleteDraft", "sendDraft"]));
    expect(result.output.source).toContain("connectors.call");
    expect(result.output.source).toContain("ambient.call");
    expect(result.output.source).toContain("workflow.chunkCollection");
    expect(result.output.source).toContain("workflow.mapModel");
    expect(result.output.source).toContain("workflow.reduceModel");
    expect(result.output.source).toContain("google.gmail");
    expect(result.output.source).toContain("readThread");
    expect(dryRunCallNames(result)).toEqual(
      expect.arrayContaining(["connector:google.gmail.search", "connector:google.gmail.readThread", "model:categorize.gmail.email.chunk", "model:reduce.gmail.email.categories"]),
    );
  });

  it("case 15: compiles local Downloads image categorization with MiniCPM visual evidence", async () => {
    const imageAnalysisNodes: WorkflowProgramIR["nodes"] = Array.from({ length: 10 }, (_, index) => {
      const imageNumber = index + 1;
      return {
        id: `analyze-image-${imageNumber}`,
        kind: "tool.call",
        tool: "ambient_visual_analyze",
        dependsOn: ["list-downloads"],
        args: {
          image: {
            path: { fromNode: "list-downloads", path: `entries.${index}.absolutePath` },
            label: { fromNode: "list-downloads", path: `entries.${index}.name` },
          },
          task: "image_description",
          prompt: "Describe the visible subject, document type if visible, and any safe categorization cues. Do not infer hidden content.",
          outputJsonPath: `workflow-vision/downloads-image-${imageNumber}.json`,
          allowExternalMediaPaths: true,
        },
      } as const;
    });
    const result = await compilePlanCase({
      version: 1,
      title: "Downloads Image Categorization",
      goal: "Categorize 10 local images from the user's Downloads directory using MiniCPM-V visual evidence.",
      nodes: [
        {
          id: "list-downloads",
          kind: "tool.call",
          tool: "local_directory_list",
          args: { path: "~/Downloads", maxEntries: 300, maxDepth: 1 },
          output: { type: "local-directory-inventory" },
        },
        ...imageAnalysisNodes,
        {
          id: "categorize-images",
          kind: "model.call",
          dependsOn: imageAnalysisNodes.map((node) => node.id),
          task: "categorize.local.downloads.images",
          input: {
            instruction:
              "Categorize up to 10 Downloads images from the supplied MiniCPM-V visual observations. Return practical categories, item assignments, and uncertainty notes.",
            directory: { fromNode: "list-downloads", path: "rootPath" },
            visualEvidence: imageAnalysisNodes.map((node) => ({ fromNode: node.id })),
          },
          output: { schema: { categories: "array", assignments: "array", summary: "string", uncertaintyNotes: "array" } },
        },
        { id: "final-output", kind: "output.final", dependsOn: ["categorize-images"], value: { imageCategories: { fromNode: "categorize-images" } } },
      ],
      budgets: { maxToolCalls: 11, maxModelCalls: 1, maxRunMs: 900_000 },
    });

    expect(result.output.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient_visual_analyze", "ambient.responses"]));
    expect(result.output.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash"]));
    expect(result.output.manifest.mutationPolicy).toBe("read_only");
    expect(result.output.source).toContain("tools.ambient_visual_analyze");
    expect(dryRunCallNames(result).filter((call) => call === "tool:ambient_visual_analyze")).toHaveLength(10);
    expect(dryRunCallNames(result)).toEqual(expect.arrayContaining(["tool:local_directory_list", "model:categorize.local.downloads.images"]));
  });
});
