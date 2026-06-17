import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserUserActionState,
  WorkspaceState,
} from "../../shared/types";
import {
  browserToolFallback,
  browserUnavailableText,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserUnavailableFallback,
} from "../agent/agentBrowserRuntime";
import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";
import type { BrowserToolTextResult } from "./browser-tools/agentRuntimeBrowserToolFormatting";
import {
  buildSetupFinalReport as defaultBuildSetupFinalReport,
  setupFinalReportText as defaultSetupFinalReportText,
  type SetupFinalReportBrowserPageProbe,
  type SetupFinalReportEditRequirement,
  type SetupFinalReportValidationCheckInput,
} from "../setup/setupFinalReportService";

type SetupFinalReportToolUpdate = BrowserToolTextResult;
type SetupFinalReportToolUpdateHandler = (update: SetupFinalReportToolUpdate) => void;
type BrowserNavigateWithActivityInput = BrowserNavigateInput & { onActivity?: (activityMessage?: string) => void };
type BrowserPageProbeResult = BrowserPageContent | BrowserUserActionState | BrowserUnavailableFallback;
type BuildSetupFinalReport = typeof defaultBuildSetupFinalReport;
type FormatSetupFinalReport = typeof defaultSetupFinalReportText;

export interface SetupFinalReportToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  browserNavigate: (input: BrowserNavigateWithActivityInput) => Promise<BrowserPageContent | BrowserUserActionState>;
  emitBrowserState: () => Promise<void>;
  recordSetupFinalReportBrowserAudit: (input: { url: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: SetupFinalReportToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  buildSetupFinalReport?: BuildSetupFinalReport;
  formatSetupFinalReport?: FormatSetupFinalReport;
}

export function registerSetupFinalReportTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SetupFinalReportToolRegistrationOptions,
): void {
  const buildSetupFinalReport = options.buildSetupFinalReport ?? defaultBuildSetupFinalReport;
  const formatSetupFinalReport = options.formatSetupFinalReport ?? defaultSetupFinalReportText;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_setup_final_report"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: SetupFinalReportToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const activeUrl = optionalString(input.activeUrl);
      const startCommand = optionalString(input.startCommand);
      const commandsRun = optionalStringArray(input.commandsRun);
      const validationSummary = optionalString(input.validationSummary);
      const validationChecks = optionalSetupFinalReportValidationChecks(input.validationChecks);
      const knownLimitations = optionalStringArray(input.knownLimitations);
      const editsRequiredToRun = optionalSetupFinalReportEditRequirement(input.editsRequiredToRun);
      const editSummary = optionalString(input.editSummary);
      const includeHttpProbe = optionalBoolean(input.includeHttpProbe);
      const includeBrowserProbe = optionalBoolean(input.includeBrowserProbe);
      const includeGitStatus = optionalBoolean(input.includeGitStatus);
      const includeEnvTemplateScan = optionalBoolean(input.includeEnvTemplateScan);
      const allowExternalUrlProbe = optionalBoolean(input.allowExternalUrlProbe);
      const exportEvidence = optionalBoolean(input.exportEvidence);
      onUpdate?.({
        content: [{ type: "text", text: "Collecting final setup report evidence: URL readiness, browser page load, process, git changes, and env placeholders." }],
        details: {
          runtime: "ambient-setup-final-report",
          toolName: "ambient_setup_final_report",
          status: "running",
          workspacePath: options.workspace.path,
          activeUrl,
        },
      });
      const browserPageProbe: SetupFinalReportBrowserPageProbe = async ({ url }) => {
        const content: BrowserPageProbeResult = await options.withBrowserToolHeartbeat(
          "ambient_setup_final_report",
          "Browser page-load validation is still running. If a local app is still compiling, Ambient is waiting for the page to become readable.",
          (markActivity) =>
            options.browserNavigate({
              url,
              profileMode: "isolated",
              runtime: "internal",
              waitForUserAction: false,
              sourceThreadId: options.threadId,
              onActivity: markActivity,
            }),
          onUpdate,
          { signal },
        )
          .catch((error) => browserToolFallback(error));
        await options.emitBrowserState();
        if (isBrowserUnavailableFallback(content)) {
          return { status: "failed", url, reason: browserUnavailableText(content) };
        }
        if (isBrowserUserActionState(content)) {
          return {
            status: "user-action-required",
            url: content.url ?? url,
            ...(content.title ? { title: content.title } : {}),
            reason: content.message || "Browser user action required.",
          };
        }
        options.recordSetupFinalReportBrowserAudit({ url: content.url ?? url });
        return {
          status: "passed",
          url: content.url ?? url,
          ...(content.title ? { title: content.title } : {}),
          textChars: content.text.length,
          linkCount: content.links.length,
        };
      };
      const result = await buildSetupFinalReport({
        workspacePath: options.workspace.path,
        ...(activeUrl ? { activeUrl } : {}),
        ...(startCommand ? { startCommand } : {}),
        ...(commandsRun ? { commandsRun } : {}),
        ...(validationSummary ? { validationSummary } : {}),
        ...(validationChecks ? { validationChecks } : {}),
        ...(knownLimitations ? { knownLimitations } : {}),
        ...(editsRequiredToRun ? { editsRequiredToRun } : {}),
        ...(editSummary ? { editSummary } : {}),
        ...(includeHttpProbe !== undefined ? { includeHttpProbe } : {}),
        ...(includeBrowserProbe !== undefined ? { includeBrowserProbe } : {}),
        ...(includeGitStatus !== undefined ? { includeGitStatus } : {}),
        ...(includeEnvTemplateScan !== undefined ? { includeEnvTemplateScan } : {}),
        ...(allowExternalUrlProbe !== undefined ? { allowExternalUrlProbe } : {}),
        ...(exportEvidence !== undefined ? { exportEvidence } : {}),
      }, {
        browserPageProbe,
      });
      return {
        content: [{ type: "text" as const, text: formatSetupFinalReport(result) }],
        details: {
          runtime: "ambient-setup-final-report",
          toolName: "ambient_setup_final_report",
          status: "complete",
          workspacePath: options.workspace.path,
          activeUrl: result.activeUrl,
          httpReadiness: result.httpReadiness,
          browserPageLoad: result.browserPageLoad,
          listeningProcess: result.listeningProcess,
          runtimeStatus: result.runtimeStatus,
          validationStatus: result.validationStatus,
          validationCheckCount: result.validationChecks.length,
          failedValidationCheckCount: result.validationChecks.filter((check) => check.status === "failed").length,
          editsRequiredToRun: result.editsRequiredToRun,
          changedFileSummary: result.changedFileSummary,
          changedFileCount: result.gitStatus.changedFiles.length,
          gitStatus: result.gitStatus.status,
          envTemplateFileCount: result.envTemplates.files.length,
          placeholderCount: result.envTemplates.placeholders.length,
          evidenceArtifacts: result.evidenceArtifacts,
          warningCount: result.warnings.length,
        },
      };
    },
  });
}

export function optionalSetupFinalReportEditRequirement(value: unknown): SetupFinalReportEditRequirement | undefined {
  const parsed = optionalString(value);
  if (!parsed) return undefined;
  if (parsed === "yes" || parsed === "no" || parsed === "unknown") return parsed;
  throw new Error("editsRequiredToRun must be yes, no, or unknown.");
}

export function optionalSetupFinalReportValidationChecks(value: unknown): SetupFinalReportValidationCheckInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("validationChecks must be an array.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each validation check must be an object.");
    const raw = item as Record<string, unknown>;
    const name = optionalString(raw.name);
    const status = optionalString(raw.status);
    if (!name) throw new Error("Each validation check requires a name.");
    if (status !== "passed" && status !== "failed" && status !== "skipped") throw new Error("Validation check status must be passed, failed, or skipped.");
    return {
      name,
      status,
      ...(optionalString(raw.evidence) ? { evidence: optionalString(raw.evidence) } : {}),
    };
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings.");
  return value.map((item) => {
    if (typeof item !== "string") throw new Error("Expected an array of strings.");
    return item;
  });
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
