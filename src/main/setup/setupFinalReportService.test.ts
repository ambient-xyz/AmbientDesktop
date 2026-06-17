import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildSetupFinalReport,
  setupFinalReportText,
  type SetupFinalReportCommandInput,
  type SetupFinalReportCommandRunner,
} from "./setupFinalReportService";

describe("setup final report service", () => {
  it("reports local URL readiness, listening process, git changes, and env template placeholders", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    await writeFile(join(workspace, ".env.example"), [
      "DATABASE_URL=postgres://user:pass@localhost:5432/app",
      "OPENAI_API_KEY=your_api_key_here",
      "EMPTY_SECRET=",
    ].join("\n"));

    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      activeUrl: "http://127.0.0.1:3000/",
      startCommand: "pnpm dev",
      commandsRun: ["pnpm install", "pnpm test"],
      validationSummary: "HTTP page loaded and unit tests passed.",
      validationChecks: [
        { name: "HTTP readiness", status: "passed", evidence: "GET / returned 200" },
        { name: "OAuth callback", status: "skipped", evidence: "Requires user credentials" },
      ],
      knownLimitations: ["OAuth callback was not tested."],
      editsRequiredToRun: "yes",
      editSummary: "Patched the dev server host binding so the app could be reached locally.",
    }, {
      fetchImpl: async () => new Response("ok", { status: 200, statusText: "OK" }),
      browserPageProbe: async ({ url }) => ({
        status: "passed",
        url,
        title: "Ambient test app",
        textChars: 512,
        linkCount: 4,
      }),
      commandRunner: fakeRunner({
        gitStatus: " M src/app.ts\n M package.json\n?? .env.example\n?? .ambient/setup-final-reports/latest.json\n?? dist/app.js\n",
        lsofOutput: "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nnode    12345 neo   21u  IPv4 0x00      0t0  TCP 127.0.0.1:3000 (LISTEN)\n",
      }),
      now: () => new Date("2026-05-25T10:00:00.000Z"),
    });

    expect(result.generatedAt).toBe("2026-05-25T10:00:00.000Z");
    expect(result.runtimeStatus).toBe("running");
    expect(result.validationStatus).toBe("partially-validated");
    expect(result.httpReadiness).toMatchObject({ status: "passed", statusCode: 200 });
    expect(result.browserPageLoad).toMatchObject({
      status: "passed",
      url: "http://127.0.0.1:3000/",
      title: "Ambient test app",
      textChars: 512,
      linkCount: 4,
    });
    expect(result.editsRequiredToRun).toBe("yes");
    expect(result.editSummary).toBe("Patched the dev server host binding so the app could be reached locally.");
    expect(result.validationChecks).toEqual([
      { name: "HTTP readiness", status: "passed", evidence: "GET / returned 200" },
      { name: "OAuth callback", status: "skipped", evidence: "Requires user credentials" },
    ]);
    expect(result.listeningProcess).toMatchObject({ status: "found", port: 3000, command: "node", pid: "12345" });
    expect(result.gitStatus.changedFiles).toEqual([
      { status: " M", path: "src/app.ts", category: "modified" },
      { status: " M", path: "package.json", category: "modified" },
      { status: "??", path: ".env.example", category: "untracked" },
      { status: "??", path: ".ambient/setup-final-reports/latest.json", category: "untracked" },
      { status: "??", path: "dist/app.js", category: "untracked" },
    ]);
    expect(result.changedFileSummary).toEqual({
      total: 5,
      groups: [
        { role: "app-source", count: 1, files: ["src/app.ts"] },
        { role: "setup-or-dependency", count: 1, files: ["package.json"] },
        { role: "env-template", count: 1, files: [".env.example"] },
        { role: "ambient-evidence", count: 1, files: [".ambient/setup-final-reports/latest.json"] },
        { role: "generated-artifact", count: 1, files: ["dist/app.js"] },
      ],
    });
    expect(result.envTemplates.placeholders).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: ".env.example", key: "OPENAI_API_KEY", reason: "placeholder-looking value" }),
      expect.objectContaining({ file: ".env.example", key: "EMPTY_SECRET", reason: "empty placeholder" }),
    ]));
    expect(result.evidenceArtifacts).toMatchObject({
      runId: "2026-05-25T10-00-00-000Z",
      latestJsonPath: join(workspace, ".ambient", "setup-final-reports", "latest.json"),
      latestMarkdownPath: join(workspace, ".ambient", "setup-final-reports", "latest.md"),
      archiveJsonPath: join(workspace, ".ambient", "setup-final-reports", "runs", "2026-05-25T10-00-00-000Z", "report.json"),
      archiveMarkdownPath: join(workspace, ".ambient", "setup-final-reports", "runs", "2026-05-25T10-00-00-000Z", "report.md"),
    });
    await expect(readFile(result.evidenceArtifacts!.latestJsonPath, "utf8")).resolves.toContain("\"schemaVersion\": \"ambient-setup-final-report-v1\"");
    await expect(readFile(result.evidenceArtifacts!.latestJsonPath, "utf8")).resolves.toContain("\"runtimeStatus\": \"running\"");
    await expect(readFile(result.evidenceArtifacts!.latestJsonPath, "utf8")).resolves.toContain("\"changedFileSummary\"");
    await expect(readFile(result.evidenceArtifacts!.latestJsonPath, "utf8")).resolves.toContain("\"browserPageLoad\"");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("# Ambient Setup Final Report");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("Runtime status: running");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("Validation status: partially-validated");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("Browser page load: passed");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("passed: HTTP readiness");
    await expect(readFile(result.evidenceArtifacts!.archiveMarkdownPath, "utf8")).resolves.toContain("Edits required to run: yes");
    expect(result.warnings.join("\n")).toContain("Env template placeholders remain");

    const text = setupFinalReportText(result);
    expect(text).toContain("Active URL: http://127.0.0.1:3000/");
    expect(text).toContain("Runtime status: running");
    expect(text).toContain("Validation status: partially-validated");
    expect(text).toContain("Browser page load: passed");
    expect(text).toContain("Validation checks:");
    expect(text).toContain("skipped: OAuth callback");
    expect(text).toContain("Edits required to run: yes");
    expect(text).toContain("Patched the dev server host binding");
    expect(text).toContain("Listening process: found port=3000 command=node pid=12345");
    expect(text).toContain("Changed file summary:");
    expect(text).toContain("app-source: 1 (src/app.ts)");
    expect(text).toContain("ambient-evidence: 1 (.ambient/setup-final-reports/latest.json)");
    expect(text).toContain("M src/app.ts");
    expect(text).toContain("OPENAI_API_KEY=your_api_key_here");
    expect(text).toContain("Evidence artifacts:");
    expect(text).not.toContain("postgres://user:pass");
  });

  it("skips external URL probing by default and warns Pi not to overstate validation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      activeUrl: "https://example.com/",
    }, {
      commandRunner: fakeRunner({ gitStatus: "" }),
      fetchImpl: async () => {
        throw new Error("external fetch should not run");
      },
    });

    expect(result.httpReadiness).toMatchObject({
      status: "skipped",
      reason: "External URL probing is disabled by default.",
    });
    expect(result.browserPageLoad).toMatchObject({
      status: "skipped",
      reason: "External browser page-load probing is disabled by default.",
    });
    expect(result.listeningProcess).toMatchObject({
      status: "skipped",
      reason: "Only local active URL ports are mapped to listening processes by default.",
    });
    expect(result.runtimeStatus).toBe("unknown");
    expect(result.validationStatus).toBe("not-validated");
    expect(result.finalReportChecklist.join("\n")).toContain("HTTP readiness did not pass");
    expect(result.finalReportChecklist.join("\n")).toContain("Browser page-load validation did not pass");
  });

  it("records browser page-load failures without failing report generation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      activeUrl: "http://localhost:5173/",
      includeHttpProbe: false,
    }, {
      browserPageProbe: async () => ({
        status: "user-action-required",
        reason: "Login required.",
      }),
      commandRunner: fakeRunner({ gitStatus: "" }),
    });

    expect(result.browserPageLoad).toMatchObject({
      status: "user-action-required",
      url: "http://localhost:5173/",
      reason: "Login required.",
    });
    expect(result.runtimeStatus).toBe("not-running");
    expect(result.validationStatus).toBe("not-validated");
    expect(result.warnings.join("\n")).toContain("Browser page-load validation needs user action");
    expect(setupFinalReportText(result)).toContain("Browser page load: user-action-required");
  });

  it("warns when changed files exist but edit requirement is not reported", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      includeHttpProbe: false,
      includeBrowserProbe: false,
    }, {
      commandRunner: fakeRunner({
        gitStatus: " M package.json\n",
      }),
    });

    expect(result.editsRequiredToRun).toBe("unknown");
    expect(result.warnings.join("\n")).toContain("whether edits were required to run was not specified");
    expect(result.finalReportChecklist.join("\n")).toContain("Edit requirement is unknown");
  });

  it("surfaces failed validation checks as final report warnings", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      includeHttpProbe: false,
      includeBrowserProbe: false,
      validationChecks: [
        { name: "Unit tests", status: "failed", evidence: "pnpm test exited 1" },
      ],
      editsRequiredToRun: "no",
    }, {
      commandRunner: fakeRunner({ gitStatus: "" }),
    });

    expect(result.validationChecks).toEqual([
      { name: "Unit tests", status: "failed", evidence: "pnpm test exited 1" },
    ]);
    expect(result.validationStatus).toBe("failed");
    expect(result.warnings.join("\n")).toContain("Validation check failed: Unit tests");
    expect(result.finalReportChecklist.join("\n")).toContain("One or more validation checks failed");
    expect(setupFinalReportText(result)).toContain("failed: Unit tests");
  });

  it("marks running apps with passed checks and no caveats as validated", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      activeUrl: "http://localhost:3000/",
      validationChecks: [
        { name: "Home page", status: "passed", evidence: "Browser rendered title" },
      ],
      editsRequiredToRun: "no",
    }, {
      fetchImpl: async () => new Response("ok", { status: 200, statusText: "OK" }),
      browserPageProbe: async ({ url }) => ({
        status: "passed",
        url,
        title: "Ready",
        textChars: 128,
        linkCount: 1,
      }),
      commandRunner: fakeRunner({
        gitStatus: "",
        lsofOutput: "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nnode    12345 neo   21u  IPv4 0x00      0t0  TCP 127.0.0.1:3000 (LISTEN)\n",
      }),
    });

    expect(result.runtimeStatus).toBe("running");
    expect(result.validationStatus).toBe("validated");
    expect(setupFinalReportText(result)).toContain("Validation status: validated");
  });

  it("handles non-git workspaces without failing final report generation", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      includeHttpProbe: false,
    }, {
      commandRunner: fakeRunner({
        gitExitCode: 128,
        gitStderr: "fatal: not a git repository",
      }),
    });

    expect(result.gitStatus).toMatchObject({
      status: "not-git",
      clean: false,
    });
    expect(result.finalReportChecklist.join("\n")).toContain("Git changed-file evidence is unavailable");
  });

  it("can skip evidence export for strictly read-only diagnostics", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-final-report-"));
    const result = await buildSetupFinalReport({
      workspacePath: workspace,
      includeHttpProbe: false,
      includeGitStatus: false,
      includeEnvTemplateScan: false,
      exportEvidence: false,
    }, {
      commandRunner: fakeRunner({}),
    });

    expect(result.evidenceArtifacts).toBeUndefined();
    expect(setupFinalReportText(result)).toContain("Evidence artifacts:\n- not exported");
  });
});

function fakeRunner(input: {
  gitStatus?: string;
  gitExitCode?: number;
  gitStderr?: string;
  lsofOutput?: string;
}): SetupFinalReportCommandRunner {
  return async (command) => {
    if (command.command === "git") {
      return {
        command: command.command,
        args: command.args,
        stdout: input.gitStatus ?? "",
        stderr: input.gitStderr ?? "",
        exitCode: input.gitExitCode ?? 0,
      };
    }
    if (command.command === "lsof") {
      return {
        command: command.command,
        args: command.args,
        stdout: input.lsofOutput ?? "",
        stderr: "",
        exitCode: input.lsofOutput ? 0 : 1,
      };
    }
    return fail(command, `unexpected command ${command.command}`);
  };
}

function fail(command: SetupFinalReportCommandInput, stderr: string) {
  return {
    command: command.command,
    args: command.args,
    stdout: "",
    stderr,
    exitCode: 1,
  };
}
