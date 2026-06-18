import { describe, expect, it, vi } from "vitest";

import type { BrowserPageContent, BrowserUserActionState } from "../../shared/browserTypes";
import { BrowserUnavailableError } from "./agentRuntimeBrowserFacade";
import type {
  SetupFinalReportBrowserPageLoad,
  SetupFinalReportResult,
} from "./agentRuntimeSetupFacade";
import {
  optionalSetupFinalReportEditRequirement,
  optionalSetupFinalReportValidationChecks,
  registerSetupFinalReportTool,
  type SetupFinalReportToolRegistrationOptions,
} from "./agentRuntimeSetupFinalReportTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimeSetupFinalReportTools", () => {
  it("registers ambient_setup_final_report and builds a final report with browser probe evidence", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    const signal = new AbortController().signal;
    const pageContent = browserContent();
    const browserNavigate = vi.fn(async (input: any) => {
      input.onActivity?.("Browser page readable.");
      return pageContent;
    });
    const emitBrowserState = vi.fn(async () => undefined);
    const recordSetupFinalReportBrowserAudit = vi.fn();
    const withBrowserToolHeartbeat = vi.fn(async (_toolName: string, _message: string, operation: any, _onUpdate: any, _options: any) =>
      operation(() => undefined),
    );
    const buildSetupFinalReport = vi.fn(async (input: any, buildOptions: any) => {
      const browserPageLoad = await buildOptions.browserPageProbe({ workspacePath: input.workspacePath, url: input.activeUrl });
      return setupFinalReportResult({
        activeUrl: input.activeUrl,
        browserPageLoad,
        validationChecks: input.validationChecks,
        editsRequiredToRun: input.editsRequiredToRun,
      });
    });
    const formatSetupFinalReport = vi.fn(() => "formatted setup final report");

    registerSetupFinalReportTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate,
      emitBrowserState,
      recordSetupFinalReportBrowserAudit,
      withBrowserToolHeartbeat,
      buildSetupFinalReport: buildSetupFinalReport as any,
      formatSetupFinalReport,
    }));

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_setup_final_report"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const input = {
      activeUrl: "http://127.0.0.1:3000",
      startCommand: "pnpm dev",
      commandsRun: ["pnpm test"],
      validationSummary: "Unit tests passed.",
      validationChecks: [
        { name: "Unit tests", status: "passed", evidence: "test output" },
        { name: "Smoke", status: "failed" },
      ],
      knownLimitations: ["Manual visual QA pending."],
      editsRequiredToRun: "yes",
      editSummary: "Updated app entry.",
      includeHttpProbe: false,
      includeBrowserProbe: true,
      includeGitStatus: true,
      includeEnvTemplateScan: false,
      allowExternalUrlProbe: false,
      exportEvidence: true,
    };
    const result = await registeredTools[0]!.execute("setup-report", input, signal, (update: any) => updates.push(update));

    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "Collecting final setup report evidence: URL readiness, browser page load, process, git changes, and env placeholders." }],
      details: {
        runtime: "ambient-setup-final-report",
        toolName: "ambient_setup_final_report",
        status: "running",
        workspacePath: "/workspace",
        activeUrl: "http://127.0.0.1:3000",
      },
    });
    expect(buildSetupFinalReport).toHaveBeenCalledWith({
      workspacePath: "/workspace",
      activeUrl: "http://127.0.0.1:3000",
      startCommand: "pnpm dev",
      commandsRun: ["pnpm test"],
      validationSummary: "Unit tests passed.",
      validationChecks: [
        { name: "Unit tests", status: "passed", evidence: "test output" },
        { name: "Smoke", status: "failed" },
      ],
      knownLimitations: ["Manual visual QA pending."],
      editsRequiredToRun: "yes",
      editSummary: "Updated app entry.",
      includeHttpProbe: false,
      includeBrowserProbe: true,
      includeGitStatus: true,
      includeEnvTemplateScan: false,
      allowExternalUrlProbe: false,
      exportEvidence: true,
    }, { browserPageProbe: expect.any(Function) });
    expect(withBrowserToolHeartbeat).toHaveBeenCalledWith(
      "ambient_setup_final_report",
      "Browser page-load validation is still running. If a local app is still compiling, Ambient is waiting for the page to become readable.",
      expect.any(Function),
      expect.any(Function),
      { signal },
    );
    expect(browserNavigate).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:3000",
      profileMode: "isolated",
      runtime: "internal",
      waitForUserAction: false,
      sourceThreadId: "thread-1",
      onActivity: expect.any(Function),
    }));
    expect(emitBrowserState).toHaveBeenCalledOnce();
    expect(recordSetupFinalReportBrowserAudit).toHaveBeenCalledWith({ url: pageContent.url });
    expect(formatSetupFinalReport).toHaveBeenCalledWith(expect.objectContaining({
      browserPageLoad: {
        status: "passed",
        url: pageContent.url,
        title: pageContent.title,
        textChars: pageContent.text.length,
        linkCount: pageContent.links.length,
      },
    }));
    expect(result).toEqual({
      content: [{ type: "text", text: "formatted setup final report" }],
      details: expect.objectContaining({
        runtime: "ambient-setup-final-report",
        toolName: "ambient_setup_final_report",
        status: "complete",
        workspacePath: "/workspace",
        activeUrl: "http://127.0.0.1:3000",
        validationCheckCount: 2,
        failedValidationCheckCount: 1,
        editsRequiredToRun: "yes",
        changedFileCount: 1,
        gitStatus: "available",
        envTemplateFileCount: 1,
        placeholderCount: 1,
        warningCount: 1,
      }),
    });
  });

  it("maps browser unavailable probe failures into failed browser page-load evidence", async () => {
    const registeredTools: RegisteredTool[] = [];
    const recordSetupFinalReportBrowserAudit = vi.fn();
    const buildSetupFinalReport = vi.fn(async (input: any, buildOptions: any) => {
      const browserPageLoad = await buildOptions.browserPageProbe({ workspacePath: input.workspacePath, url: input.activeUrl });
      return setupFinalReportResult({ activeUrl: input.activeUrl, browserPageLoad });
    });

    registerSetupFinalReportTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => {
        throw new BrowserUnavailableError("Chrome missing");
      },
      recordSetupFinalReportBrowserAudit,
      buildSetupFinalReport: buildSetupFinalReport as any,
    }));

    const result = await registeredTools[0]!.execute("setup-report", { activeUrl: "http://127.0.0.1:3000" });

    expect(result.details.browserPageLoad).toMatchObject({
      status: "failed",
      url: "http://127.0.0.1:3000",
    });
    expect(result.details.browserPageLoad.reason).toContain("Browser unavailable.");
    expect(recordSetupFinalReportBrowserAudit).not.toHaveBeenCalled();
  });

  it("maps browser user-action probe results into user-action-required evidence", async () => {
    const registeredTools: RegisteredTool[] = [];
    const action = browserUserAction();
    const buildSetupFinalReport = vi.fn(async (input: any, buildOptions: any) => {
      const browserPageLoad = await buildOptions.browserPageProbe({ workspacePath: input.workspacePath, url: input.activeUrl });
      return setupFinalReportResult({ activeUrl: input.activeUrl, browserPageLoad });
    });

    registerSetupFinalReportTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({
      browserNavigate: async () => action,
      buildSetupFinalReport: buildSetupFinalReport as any,
    }));

    const result = await registeredTools[0]!.execute("setup-report", { activeUrl: "http://127.0.0.1:3000" });

    expect(result.details.browserPageLoad).toEqual({
      status: "user-action-required",
      url: action.url,
      title: action.title,
      reason: action.message,
    });
  });

  it("validates setup-final-report structured fields before building", async () => {
    const registeredTools: RegisteredTool[] = [];
    const buildSetupFinalReport = vi.fn();

    registerSetupFinalReportTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, options({ buildSetupFinalReport: buildSetupFinalReport as any }));

    await expect(registeredTools[0]!.execute("setup-report", {
      validationChecks: [{ name: "Unit tests", status: "unknown" }],
    })).rejects.toThrow("Validation check status must be passed, failed, or skipped.");
    await expect(registeredTools[0]!.execute("setup-report", {
      commandsRun: "pnpm test",
    })).rejects.toThrow("Expected an array of strings.");
    await expect(registeredTools[0]!.execute("setup-report", {
      editsRequiredToRun: "maybe",
    })).rejects.toThrow("editsRequiredToRun must be yes, no, or unknown.");
    expect(buildSetupFinalReport).not.toHaveBeenCalled();
  });

  it("preserves optional setup-final-report parser behavior", () => {
    expect(optionalSetupFinalReportEditRequirement("yes")).toBe("yes");
    expect(optionalSetupFinalReportEditRequirement(" ")).toBeUndefined();
    expect(() => optionalSetupFinalReportEditRequirement("maybe")).toThrow("editsRequiredToRun must be yes, no, or unknown.");

    expect(optionalSetupFinalReportValidationChecks([
      { name: "Unit tests", status: "passed", evidence: "green" },
    ])).toEqual([{ name: "Unit tests", status: "passed", evidence: "green" }]);
    expect(optionalSetupFinalReportValidationChecks(undefined)).toBeUndefined();
    expect(() => optionalSetupFinalReportValidationChecks({})).toThrow("validationChecks must be an array.");
  });
});

function options(
  overrides: Partial<SetupFinalReportToolRegistrationOptions> = {},
): SetupFinalReportToolRegistrationOptions {
  return {
    threadId: "thread-1",
    workspace: { path: "/workspace" },
    browserNavigate: async () => browserContent(),
    emitBrowserState: async () => undefined,
    recordSetupFinalReportBrowserAudit: () => undefined,
    withBrowserToolHeartbeat: async (_toolName, _message, operation) => operation(() => undefined),
    buildSetupFinalReport: async (input) => setupFinalReportResult({ activeUrl: input.activeUrl }),
    formatSetupFinalReport: () => "formatted setup final report",
    ...overrides,
  };
}

function browserContent(overrides: Partial<BrowserPageContent> = {}): BrowserPageContent {
  return {
    title: "Example",
    url: "http://127.0.0.1:3000/",
    text: "Readable page text.",
    links: [{ text: "Home", url: "http://127.0.0.1:3000/" }],
    ...overrides,
  };
}

function browserUserAction(): BrowserUserActionState {
  return {
    id: "browser-action-1",
    active: true,
    status: "waiting",
    kind: "captcha",
    toolName: "ambient_setup_final_report",
    runtime: "internal",
    profileMode: "isolated",
    url: "http://127.0.0.1:3000/challenge",
    title: "Challenge",
    message: "Complete the browser challenge.",
    startedAt: "2026-06-10T00:00:00.000Z",
    lastCheckedAt: "2026-06-10T00:00:00.000Z",
    canAutoResume: false,
  };
}

function setupFinalReportResult(overrides: Partial<SetupFinalReportResult> & {
  browserPageLoad?: SetupFinalReportBrowserPageLoad;
} = {}): SetupFinalReportResult {
  return {
    schemaVersion: "ambient-setup-final-report-v1",
    generatedAt: "2026-06-10T00:00:00.000Z",
    workspacePath: "/workspace",
    activeUrl: "http://127.0.0.1:3000",
    startCommand: "pnpm dev",
    commandsRun: ["pnpm test"],
    validationSummary: "Unit tests passed.",
    validationChecks: [{ name: "Unit tests", status: "passed" }],
    knownLimitations: [],
    editsRequiredToRun: "no",
    editSummary: "No edits required.",
    runtimeStatus: "running",
    validationStatus: "validated",
    httpReadiness: { status: "passed", url: "http://127.0.0.1:3000", statusCode: 200 },
    browserPageLoad: { status: "skipped", reason: "not requested", ...overrides.browserPageLoad },
    listeningProcess: { status: "found", port: 3000, command: "vite", pid: "123" },
    gitStatus: {
      status: "available",
      clean: false,
      message: "1 changed file",
      changedFiles: [{ path: "src/App.tsx", status: "M", category: "modified" }],
    },
    changedFileSummary: {
      total: 1,
      groups: [{ role: "app-source", count: 1, files: ["src/App.tsx"] }],
    },
    envTemplates: {
      status: "scanned",
      files: ["env.example"],
      placeholders: [{ file: "env.example", key: "API_KEY", valuePreview: "changeme", reason: "placeholder" }],
    },
    warnings: ["Manual visual QA pending."],
    finalReportChecklist: ["Report the validation evidence."],
    ...overrides,
  };
}
