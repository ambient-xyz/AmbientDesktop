import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SetupFinalReportInput {
  workspacePath: string;
  activeUrl?: string;
  startCommand?: string;
  commandsRun?: string[];
  validationSummary?: string;
  validationChecks?: SetupFinalReportValidationCheckInput[];
  knownLimitations?: string[];
  editsRequiredToRun?: SetupFinalReportEditRequirement;
  editSummary?: string;
  includeHttpProbe?: boolean;
  includeBrowserProbe?: boolean;
  includeGitStatus?: boolean;
  includeEnvTemplateScan?: boolean;
  allowExternalUrlProbe?: boolean;
  exportEvidence?: boolean;
}

export interface SetupFinalReportCommandInput {
  cwd: string;
  command: string;
  args: string[];
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}

export interface SetupFinalReportCommandResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  errorCode?: string;
}

export type SetupFinalReportCommandRunner = (input: SetupFinalReportCommandInput) => Promise<SetupFinalReportCommandResult>;
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type SetupFinalReportEditRequirement = "yes" | "no" | "unknown";
export type SetupFinalReportValidationCheckStatus = "passed" | "failed" | "skipped";
export type SetupFinalReportRuntimeStatus = "running" | "not-running" | "unknown";
export type SetupFinalReportValidationStatus = "validated" | "partially-validated" | "failed" | "not-validated";

export interface SetupFinalReportValidationCheckInput {
  name: string;
  status: SetupFinalReportValidationCheckStatus;
  evidence?: string;
}

export interface SetupFinalReportValidationCheck {
  name: string;
  status: SetupFinalReportValidationCheckStatus;
  evidence?: string;
}

export interface SetupFinalReportHttpReadiness {
  status: "passed" | "failed" | "skipped";
  url?: string;
  statusCode?: number;
  statusText?: string;
  reason?: string;
  durationMs?: number;
}

export interface SetupFinalReportBrowserProbeInput {
  workspacePath: string;
  url: string;
}

export interface SetupFinalReportBrowserPageLoad {
  status: "passed" | "failed" | "skipped" | "user-action-required";
  url?: string;
  title?: string;
  textChars?: number;
  linkCount?: number;
  reason?: string;
  durationMs?: number;
}

export type SetupFinalReportBrowserPageProbe = (input: SetupFinalReportBrowserProbeInput) => Promise<SetupFinalReportBrowserPageLoad>;

export interface SetupFinalReportListeningProcess {
  status: "found" | "not-found" | "skipped" | "unknown";
  port?: number;
  command?: string;
  pid?: string;
  raw?: string;
  reason?: string;
}

export interface SetupFinalReportChangedFile {
  path: string;
  status: string;
  category: "modified" | "added" | "deleted" | "renamed" | "untracked" | "unknown";
}

export type SetupFinalReportChangedFileRole =
  | "app-source"
  | "setup-or-dependency"
  | "env-template"
  | "ambient-evidence"
  | "generated-artifact"
  | "unknown";

export interface SetupFinalReportChangedFileGroup {
  role: SetupFinalReportChangedFileRole;
  count: number;
  files: string[];
}

export interface SetupFinalReportChangedFileSummary {
  total: number;
  groups: SetupFinalReportChangedFileGroup[];
}

export interface SetupFinalReportGitStatus {
  status: "available" | "not-git" | "error" | "skipped";
  changedFiles: SetupFinalReportChangedFile[];
  clean: boolean;
  message: string;
}

export interface SetupFinalReportEnvPlaceholder {
  file: string;
  key: string;
  valuePreview: string;
  reason: string;
}

export interface SetupFinalReportEnvTemplateScan {
  status: "scanned" | "none" | "skipped";
  files: string[];
  placeholders: SetupFinalReportEnvPlaceholder[];
}

export interface SetupFinalReportEvidenceArtifacts {
  runId: string;
  latestJsonPath: string;
  latestMarkdownPath: string;
  archiveJsonPath: string;
  archiveMarkdownPath: string;
}

export interface SetupFinalReportResult {
  schemaVersion: "ambient-setup-final-report-v1";
  generatedAt: string;
  workspacePath: string;
  activeUrl?: string;
  startCommand?: string;
  commandsRun: string[];
  validationSummary?: string;
  validationChecks: SetupFinalReportValidationCheck[];
  knownLimitations: string[];
  editsRequiredToRun: SetupFinalReportEditRequirement;
  editSummary?: string;
  runtimeStatus: SetupFinalReportRuntimeStatus;
  validationStatus: SetupFinalReportValidationStatus;
  httpReadiness: SetupFinalReportHttpReadiness;
  browserPageLoad: SetupFinalReportBrowserPageLoad;
  listeningProcess: SetupFinalReportListeningProcess;
  gitStatus: SetupFinalReportGitStatus;
  changedFileSummary: SetupFinalReportChangedFileSummary;
  envTemplates: SetupFinalReportEnvTemplateScan;
  warnings: string[];
  finalReportChecklist: string[];
  evidenceArtifacts?: SetupFinalReportEvidenceArtifacts;
}

export async function buildSetupFinalReport(
  input: SetupFinalReportInput,
  options: {
    commandRunner?: SetupFinalReportCommandRunner;
    fetchImpl?: FetchLike;
    browserPageProbe?: SetupFinalReportBrowserPageProbe;
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
  } = {},
): Promise<SetupFinalReportResult> {
  const commandRunner = options.commandRunner ?? defaultSetupFinalReportCommandRunner;
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const activeUrl = cleanOptional(input.activeUrl);
  const warnings: string[] = [];
  const includeHttpProbe = input.includeHttpProbe !== false;
  const includeBrowserProbe = input.includeBrowserProbe !== false;
  const includeGitStatus = input.includeGitStatus !== false;
  const includeEnvTemplateScan = input.includeEnvTemplateScan !== false;
  const exportEvidence = input.exportEvidence !== false;
  const editsRequiredToRun = normalizeEditRequirement(input.editsRequiredToRun);
  const editSummary = cleanOptional(input.editSummary);
  const validationChecks = normalizeValidationChecks(input.validationChecks);

  const [httpReadiness, browserPageLoad, listeningProcess, gitStatus, envTemplates] = await Promise.all([
    includeHttpProbe
      ? probeHttpReadiness(activeUrl, { fetchImpl, allowExternalUrlProbe: input.allowExternalUrlProbe === true, warnings })
      : Promise.resolve({ status: "skipped" as const, reason: "HTTP readiness probe disabled." }),
    includeBrowserProbe
      ? probeBrowserPageLoad(activeUrl, {
          workspacePath: input.workspacePath,
          browserPageProbe: options.browserPageProbe,
          allowExternalUrlProbe: input.allowExternalUrlProbe === true,
        })
      : Promise.resolve({ status: "skipped" as const, reason: "Browser page-load probe disabled." }),
    activeUrl
      ? probeListeningProcess(input.workspacePath, activeUrl, commandRunner, env)
      : Promise.resolve({ status: "skipped" as const, reason: "No active URL was provided." }),
    includeGitStatus
      ? collectGitStatus(input.workspacePath, commandRunner, env)
      : Promise.resolve({ status: "skipped" as const, changedFiles: [], clean: false, message: "Git status collection disabled." }),
    includeEnvTemplateScan
      ? scanEnvTemplates(input.workspacePath)
      : Promise.resolve({ status: "skipped" as const, files: [], placeholders: [] }),
  ]);

  if (httpReadiness.status === "failed") warnings.push(`Active URL did not pass HTTP readiness: ${httpReadiness.reason ?? httpReadiness.statusText ?? "unknown failure"}.`);
  if (browserPageLoad.status === "failed") warnings.push(`Browser page-load validation failed: ${browserPageLoad.reason ?? "unknown failure"}.`);
  if (browserPageLoad.status === "user-action-required") warnings.push(`Browser page-load validation needs user action: ${browserPageLoad.reason ?? "browser challenge or login required"}.`);
  if (listeningProcess.status === "not-found" && activeUrl) warnings.push("No local listening process was found for the active URL port.");
  if (gitStatus.status === "error") warnings.push(`Could not collect git status: ${gitStatus.message}`);
  if (envTemplates.placeholders.length > 0) warnings.push("Env template placeholders remain and may require user-provided values before full validation.");
  if (editsRequiredToRun === "unknown" && gitStatus.changedFiles.length > 0) warnings.push("Changed files were detected, but whether edits were required to run was not specified.");
  if (editsRequiredToRun === "yes" && !editSummary) warnings.push("Edits were marked as required to run, but no edit summary was provided.");
  for (const check of validationChecks) {
    if (check.status === "failed") warnings.push(`Validation check failed: ${check.name}${check.evidence ? ` (${check.evidence})` : ""}.`);
  }
  const knownLimitations = (input.knownLimitations ?? []).map((limitation) => limitation.trim()).filter(Boolean).slice(0, 30);
  const runtimeStatus = computeRuntimeStatus({ activeUrl, httpReadiness, browserPageLoad, listeningProcess });
  const validationStatus = computeValidationStatus({
    runtimeStatus,
    validationChecks,
    validationSummary: cleanOptional(input.validationSummary),
    knownLimitations,
    envTemplates,
  });
  const changedFileSummary = summarizeChangedFiles(gitStatus.changedFiles);

  const evidenceArtifacts = exportEvidence ? setupFinalReportArtifactPaths(input.workspacePath, generatedAt) : undefined;
  const result: SetupFinalReportResult = {
    schemaVersion: "ambient-setup-final-report-v1",
    generatedAt,
    workspacePath: input.workspacePath,
    ...(activeUrl ? { activeUrl } : {}),
    ...(cleanOptional(input.startCommand) ? { startCommand: cleanOptional(input.startCommand) } : {}),
    commandsRun: (input.commandsRun ?? []).map((command) => command.trim()).filter(Boolean).slice(0, 30),
    ...(cleanOptional(input.validationSummary) ? { validationSummary: cleanOptional(input.validationSummary) } : {}),
    validationChecks,
    knownLimitations,
    editsRequiredToRun,
    ...(editSummary ? { editSummary } : {}),
    runtimeStatus,
    validationStatus,
    httpReadiness,
    browserPageLoad,
    listeningProcess,
    gitStatus,
    changedFileSummary,
    envTemplates,
    warnings,
    finalReportChecklist: buildFinalReportChecklist({ activeUrl, httpReadiness, browserPageLoad, listeningProcess, gitStatus, envTemplates, editsRequiredToRun, validationChecks, input }),
    ...(evidenceArtifacts ? { evidenceArtifacts } : {}),
  };
  if (evidenceArtifacts) await writeSetupFinalReportEvidence(result, evidenceArtifacts);
  return result;
}

export function setupFinalReportText(result: SetupFinalReportResult): string {
  const changedFiles = result.gitStatus.changedFiles.length
    ? result.gitStatus.changedFiles.map((file) => `- ${file.status} ${file.path} (${file.category})`)
    : ["- none detected"];
  const changedFileSummary = result.changedFileSummary.groups.length
    ? result.changedFileSummary.groups.map((group) => `- ${group.role}: ${group.count}${group.files.length ? ` (${group.files.join(", ")})` : ""}`)
    : ["- none detected"];
  const placeholders = result.envTemplates.placeholders.length
    ? result.envTemplates.placeholders.map((placeholder) => `- ${placeholder.file}: ${placeholder.key}=${placeholder.valuePreview} (${placeholder.reason})`)
    : ["- none detected"];
  const commands = result.commandsRun.length ? result.commandsRun.map((command) => `- ${command}`) : ["- none supplied"];
  const validationChecks = result.validationChecks.length ? result.validationChecks.map((check) => `- ${formatValidationCheck(check)}`) : ["- none supplied"];
  const limitations = result.knownLimitations.length ? result.knownLimitations.map((item) => `- ${item}`) : ["- none supplied"];
  const warnings = result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- none"];
  const artifacts = result.evidenceArtifacts
    ? [
        `- latest JSON: ${result.evidenceArtifacts.latestJsonPath}`,
        `- latest Markdown: ${result.evidenceArtifacts.latestMarkdownPath}`,
        `- archive JSON: ${result.evidenceArtifacts.archiveJsonPath}`,
        `- archive Markdown: ${result.evidenceArtifacts.archiveMarkdownPath}`,
      ]
    : ["- not exported"];

  return [
    "Ambient setup final report.",
    `Generated at: ${result.generatedAt}`,
    `Workspace: ${result.workspacePath}`,
    `Active URL: ${result.activeUrl ?? "not supplied"}`,
    `Runtime status: ${result.runtimeStatus}`,
    `Validation status: ${result.validationStatus}`,
    `HTTP readiness: ${result.httpReadiness.status}${result.httpReadiness.statusCode ? ` ${result.httpReadiness.statusCode}` : ""}${result.httpReadiness.reason ? ` (${result.httpReadiness.reason})` : ""}`,
    `Browser page load: ${formatBrowserPageLoad(result.browserPageLoad)}`,
    `Listening process: ${formatListeningProcess(result.listeningProcess)}`,
    `Start command: ${result.startCommand ?? "not supplied"}`,
    "Commands run:",
    ...commands,
    `Validation summary: ${result.validationSummary ?? "not supplied"}`,
    "Validation checks:",
    ...validationChecks,
    `Edits required to run: ${result.editsRequiredToRun}`,
    `Edit summary: ${result.editSummary ?? "not supplied"}`,
    `Git status: ${result.gitStatus.status}; ${result.gitStatus.message}`,
    `Changed file total: ${result.changedFileSummary.total}`,
    "Changed file summary:",
    ...changedFileSummary,
    "Changed files:",
    ...changedFiles,
    `Env templates scanned: ${result.envTemplates.status}${result.envTemplates.files.length ? ` (${result.envTemplates.files.join(", ")})` : ""}`,
    "Placeholder env values:",
    ...placeholders,
    "Known limitations:",
    ...limitations,
    "Warnings:",
    ...warnings,
    "Evidence artifacts:",
    ...artifacts,
    "Final report checklist for Pi:",
    ...result.finalReportChecklist.map((item) => `- ${item}`),
  ].join("\n");
}

function setupFinalReportArtifactPaths(workspacePath: string, generatedAt: string): SetupFinalReportEvidenceArtifacts {
  const runId = generatedAt.replace(/[:.]/g, "-");
  const root = join(workspacePath, ".ambient", "setup-final-reports");
  const archiveRoot = join(root, "runs", runId);
  return {
    runId,
    latestJsonPath: join(root, "latest.json"),
    latestMarkdownPath: join(root, "latest.md"),
    archiveJsonPath: join(archiveRoot, "report.json"),
    archiveMarkdownPath: join(archiveRoot, "report.md"),
  };
}

async function writeSetupFinalReportEvidence(
  result: SetupFinalReportResult,
  artifacts: SetupFinalReportEvidenceArtifacts,
): Promise<void> {
  await mkdir(join(result.workspacePath, ".ambient", "setup-final-reports", "runs", artifacts.runId), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const markdown = renderSetupFinalReportMarkdown(result);
  await Promise.all([
    writeFile(artifacts.latestJsonPath, json, "utf8"),
    writeFile(artifacts.latestMarkdownPath, markdown, "utf8"),
    writeFile(artifacts.archiveJsonPath, json, "utf8"),
    writeFile(artifacts.archiveMarkdownPath, markdown, "utf8"),
  ]);
}

function renderSetupFinalReportMarkdown(result: SetupFinalReportResult): string {
  const lines = [
    "# Ambient Setup Final Report",
    "",
    `Generated at: ${result.generatedAt}`,
    `Workspace: ${result.workspacePath}`,
    `Active URL: ${result.activeUrl ?? "not supplied"}`,
    `Runtime status: ${result.runtimeStatus}`,
    `Validation status: ${result.validationStatus}`,
    `HTTP readiness: ${result.httpReadiness.status}${result.httpReadiness.statusCode ? ` ${result.httpReadiness.statusCode}` : ""}`,
    `Browser page load: ${formatBrowserPageLoad(result.browserPageLoad)}`,
    `Listening process: ${formatListeningProcess(result.listeningProcess)}`,
    `Start command: ${result.startCommand ?? "not supplied"}`,
    "",
    "## Commands Run",
    ...(result.commandsRun.length ? result.commandsRun.map((command) => `- ${command}`) : ["- none supplied"]),
    "",
    "## Validation",
    result.validationSummary ?? "not supplied",
    "",
    "### Validation Checks",
    ...(result.validationChecks.length ? result.validationChecks.map((check) => `- ${formatValidationCheck(check)}`) : ["- none supplied"]),
    "",
    `Edits required to run: ${result.editsRequiredToRun}`,
    `Edit summary: ${result.editSummary ?? "not supplied"}`,
    "",
    "## Changed Files",
    `Total: ${result.changedFileSummary.total}`,
    "",
    "### Changed File Summary",
    ...(result.changedFileSummary.groups.length
      ? result.changedFileSummary.groups.map((group) => `- ${group.role}: ${group.count}${group.files.length ? ` (${group.files.join(", ")})` : ""}`)
      : ["- none detected"]),
    "",
    "### Changed File List",
    ...(result.gitStatus.changedFiles.length
      ? result.gitStatus.changedFiles.map((file) => `- ${file.status} ${file.path} (${file.category})`)
      : ["- none detected"]),
    "",
    "## Placeholder Env Values",
    ...(result.envTemplates.placeholders.length
      ? result.envTemplates.placeholders.map((placeholder) => `- ${placeholder.file}: ${placeholder.key}=${placeholder.valuePreview} (${placeholder.reason})`)
      : ["- none detected"]),
    "",
    "## Known Limitations",
    ...(result.knownLimitations.length ? result.knownLimitations.map((item) => `- ${item}`) : ["- none supplied"]),
    "",
    "## Warnings",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Final Report Checklist For Pi",
    ...result.finalReportChecklist.map((item) => `- ${item}`),
    "",
  ];
  return lines.join("\n");
}

async function probeHttpReadiness(
  activeUrl: string | undefined,
  input: { fetchImpl: FetchLike; allowExternalUrlProbe: boolean; warnings: string[] },
): Promise<SetupFinalReportHttpReadiness> {
  if (!activeUrl) return { status: "skipped", reason: "No active URL was provided." };
  const parsed = parseUrl(activeUrl);
  if (!parsed) return { status: "skipped", url: activeUrl, reason: "Active URL is not a valid HTTP(S) URL." };
  if (!isLocalHttpUrl(parsed) && !input.allowExternalUrlProbe) {
    return { status: "skipped", url: activeUrl, reason: "External URL probing is disabled by default." };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const startedAt = Date.now();
  try {
    const response = await input.fetchImpl(parsed, {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
    });
    const passed = response.status >= 200 && response.status < 500;
    return {
      status: passed ? "passed" : "failed",
      url: parsed.toString(),
      statusCode: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      ...(passed ? {} : { reason: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      status: "failed",
      url: parsed.toString(),
      reason: errorMessage(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeBrowserPageLoad(
  activeUrl: string | undefined,
  input: {
    workspacePath: string;
    browserPageProbe?: SetupFinalReportBrowserPageProbe;
    allowExternalUrlProbe: boolean;
  },
): Promise<SetupFinalReportBrowserPageLoad> {
  if (!activeUrl) return { status: "skipped", reason: "No active URL was provided." };
  const parsed = parseUrl(activeUrl);
  if (!parsed) return { status: "skipped", url: activeUrl, reason: "Active URL is not a valid HTTP(S) URL." };
  if (!isLocalHttpUrl(parsed) && !input.allowExternalUrlProbe) {
    return { status: "skipped", url: activeUrl, reason: "External browser page-load probing is disabled by default." };
  }
  if (!input.browserPageProbe) return { status: "skipped", url: parsed.toString(), reason: "Browser page-load probe is unavailable in this context." };
  const startedAt = Date.now();
  try {
    const result = await input.browserPageProbe({
      workspacePath: input.workspacePath,
      url: parsed.toString(),
    });
    return {
      ...result,
      url: result.url ?? parsed.toString(),
      durationMs: result.durationMs ?? Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "failed",
      url: parsed.toString(),
      reason: errorMessage(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function probeListeningProcess(
  workspacePath: string,
  activeUrl: string,
  runner: SetupFinalReportCommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<SetupFinalReportListeningProcess> {
  const parsed = parseUrl(activeUrl);
  if (!parsed) return { status: "skipped", reason: "Active URL is not a valid HTTP(S) URL." };
  if (!isLocalHttpUrl(parsed)) return { status: "skipped", reason: "Only local active URL ports are mapped to listening processes by default." };
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (!Number.isInteger(port) || port <= 0) return { status: "skipped", reason: "Active URL port could not be determined." };

  const command = process.platform === "win32" ? "netstat" : "lsof";
  const args = process.platform === "win32" ? ["-ano", "-p", "tcp"] : ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"];
  const result = await runner({ cwd: workspacePath, command, args, timeoutMs: 5_000, env });
  const output = [result.stdout, result.stderr].join("\n");
  if (process.platform === "win32") {
    const line = output.split(/\r?\n/).find((entry) => new RegExp(`[:.]${port}\\s+.*LISTENING`, "i").test(entry));
    if (!line) return { status: result.exitCode === 0 ? "not-found" : "unknown", port, reason: cleanOutput(output) || result.errorCode || "netstat did not report the port" };
    const parts = line.trim().split(/\s+/);
    return { status: "found", port, pid: parts.at(-1), raw: line.trim() };
  }

  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataLine = lines.find((line) => !/^command\b/i.test(line));
  if (!dataLine) return { status: result.exitCode === 0 ? "not-found" : "not-found", port, reason: cleanOutput(output) || result.errorCode || "lsof did not report the port" };
  const parts = dataLine.split(/\s+/);
  return {
    status: "found",
    port,
    command: parts[0],
    pid: parts[1],
    raw: dataLine,
  };
}

async function collectGitStatus(
  workspacePath: string,
  runner: SetupFinalReportCommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<SetupFinalReportGitStatus> {
  const result = await runner({
    cwd: workspacePath,
    command: "git",
    args: ["status", "--porcelain=v1"],
    timeoutMs: 5_000,
    env,
  });
  if (result.exitCode !== 0) {
    const output = [result.stderr, result.stdout].join("\n");
    if (/not a git repository/i.test(output)) {
      return { status: "not-git", changedFiles: [], clean: false, message: "Workspace is not a git repository." };
    }
    return { status: "error", changedFiles: [], clean: false, message: cleanOutput(output) || result.errorCode || "git status failed" };
  }
  const changedFiles = parseGitStatus(result.stdout);
  return {
    status: "available",
    changedFiles,
    clean: changedFiles.length === 0,
    message: changedFiles.length === 0 ? "No git changes detected." : `${changedFiles.length} changed file(s) detected.`,
  };
}

async function scanEnvTemplates(workspacePath: string): Promise<SetupFinalReportEnvTemplateScan> {
  const files = await findEnvTemplateFiles(workspacePath);
  if (!files.length) return { status: "none", files: [], placeholders: [] };
  const placeholders: SetupFinalReportEnvPlaceholder[] = [];
  for (const file of files) {
    let text = "";
    try {
      text = await readFile(join(workspacePath, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/).slice(0, 500)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const reason = placeholderReason(parsed.value);
      if (!reason) continue;
      placeholders.push({
        file,
        key: parsed.key,
        valuePreview: previewEnvValue(parsed.value),
        reason,
      });
    }
  }
  return { status: "scanned", files, placeholders };
}

async function findEnvTemplateFiles(workspacePath: string): Promise<string[]> {
  const rootCandidates = [
    ".env.example",
    ".env.sample",
    ".env.template",
    ".env.defaults",
    "env.example",
    "example.env",
  ];
  const found: string[] = [];
  for (const candidate of rootCandidates) {
    if (await fileExists(join(workspacePath, candidate))) found.push(candidate);
  }
  for (const dir of ["config", "configs", "docker", "infra"]) {
    const dirPath = join(workspacePath, dir);
    if (!(await fileExists(dirPath))) continue;
    let entries: string[] = [];
    try {
      entries = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (/^\.?env\.(?:example|sample|template|defaults)$/i.test(entry) || /^example\.env$/i.test(entry)) {
        found.push(`${dir}/${entry}`);
      }
    }
  }
  return found.slice(0, 20);
}

function buildFinalReportChecklist(input: {
  activeUrl: string | undefined;
  httpReadiness: SetupFinalReportHttpReadiness;
  browserPageLoad: SetupFinalReportBrowserPageLoad;
  listeningProcess: SetupFinalReportListeningProcess;
  gitStatus: SetupFinalReportGitStatus;
  envTemplates: SetupFinalReportEnvTemplateScan;
  editsRequiredToRun: SetupFinalReportEditRequirement;
  validationChecks: SetupFinalReportValidationCheck[];
  input: SetupFinalReportInput;
}): string[] {
  const checklist = [
    "Use the computed runtimeStatus and validationStatus as the baseline for the user-facing final status.",
    "Include the active URL if one is known and whether HTTP readiness passed, failed, or was skipped.",
    "Include the listening process and PID if detected.",
    "Include the start command and validation commands actually run; do not imply validation that was not performed.",
    "List changed files from git status and separate app edits from generated or ignored artifacts when known.",
    "Call out placeholder env template values and any known limitations or unvalidated features.",
  ];
  if (!input.activeUrl) checklist.push("No active URL was supplied; ask Pi to avoid claiming a running web app unless it has other evidence.");
  if (input.httpReadiness.status !== "passed") checklist.push("HTTP readiness did not pass; final report should mark runtime validation as partial or failed.");
  if (input.browserPageLoad.status !== "passed") checklist.push("Browser page-load validation did not pass; final report should not claim the UI was opened and inspected unless prior browser evidence supports it.");
  if (input.listeningProcess.status !== "found" && input.activeUrl) checklist.push("No listening process was found for the active URL; final report should not overstate running state.");
  if (input.gitStatus.status !== "available") checklist.push("Git changed-file evidence is unavailable; final report should say changed files could not be determined automatically.");
  if (input.editsRequiredToRun === "unknown") checklist.push("Edit requirement is unknown; final report should explicitly say whether setup required code/config edits if Pi knows from prior tool evidence.");
  if (input.validationChecks.length === 0) checklist.push("No structured validation checks were supplied; final report should avoid claiming specific behavior was tested unless prior tool evidence supports it.");
  if (input.validationChecks.some((check) => check.status === "failed")) checklist.push("One or more validation checks failed; final report should mark validation as partial or failed and include the failed check evidence.");
  if (input.envTemplates.placeholders.length > 0) checklist.push("Placeholder env values remain; final report should call out required user configuration before full validation.");
  return checklist;
}

function parseGitStatus(stdout: string): SetupFinalReportChangedFile[] {
  return stdout.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 200)
    .map((line) => {
      const status = line.slice(0, 2);
      const path = line.slice(3).trim();
      return { path, status, category: gitStatusCategory(status) };
    });
}

function gitStatusCategory(status: string): SetupFinalReportChangedFile["category"] {
  if (status.includes("?")) return "untracked";
  if (status.includes("D")) return "deleted";
  if (status.includes("R")) return "renamed";
  if (status.includes("A")) return "added";
  if (status.includes("M")) return "modified";
  return "unknown";
}

function summarizeChangedFiles(files: SetupFinalReportChangedFile[]): SetupFinalReportChangedFileSummary {
  const order: SetupFinalReportChangedFileRole[] = [
    "app-source",
    "setup-or-dependency",
    "env-template",
    "ambient-evidence",
    "generated-artifact",
    "unknown",
  ];
  const groups = new Map<SetupFinalReportChangedFileRole, string[]>();
  for (const file of files) {
    const role = changedFileRole(file.path);
    const current = groups.get(role) ?? [];
    current.push(file.path);
    groups.set(role, current);
  }
  return {
    total: files.length,
    groups: order
      .map((role) => {
        const groupedFiles = groups.get(role) ?? [];
        return {
          role,
          count: groupedFiles.length,
          files: groupedFiles.slice(0, 12),
        };
      })
      .filter((group) => group.count > 0),
  };
}

function changedFileRole(path: string): SetupFinalReportChangedFileRole {
  const normalized = path.replace(/\\/g, "/");
  const basename = normalized.split("/").at(-1) ?? normalized;
  if (normalized.startsWith(".ambient/setup-final-reports/")) return "ambient-evidence";
  if (isGeneratedArtifactPath(normalized)) return "generated-artifact";
  if (isEnvTemplatePath(normalized)) return "env-template";
  if (isSetupOrDependencyPath(normalized, basename)) return "setup-or-dependency";
  if (isAppSourcePath(normalized, basename)) return "app-source";
  return "unknown";
}

function isGeneratedArtifactPath(path: string): boolean {
  return /^(?:dist|build|out|coverage|\.next|\.nuxt|\.svelte-kit|target|tmp|temp)\//.test(path) ||
    /(?:^|\/)(?:bundle|generated|\.cache)\//.test(path) ||
    /\.(?:map|min\.js|pyc|class)$/.test(path);
}

function isEnvTemplatePath(path: string): boolean {
  const basename = path.split("/").at(-1) ?? path;
  return /^(?:\.?env\.(?:example|sample|template|defaults)|example\.env|sample\.env)$/i.test(basename);
}

function isSetupOrDependencyPath(path: string, basename: string): boolean {
  return [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "pyproject.toml",
    "poetry.lock",
    "requirements.txt",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    "Dockerfile",
    "Containerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.mjs",
    "tsconfig.json",
  ].includes(basename) || /^(?:docker|compose|config|configs|infra)\//.test(path);
}

function isAppSourcePath(path: string, basename: string): boolean {
  return /^(?:src|app|pages|components|lib|server|client|public)\//.test(path) ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|cs|c|cc|cpp|h|hpp|html|css|scss|sass|vue|svelte|md|mdx)$/.test(basename);
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return undefined;
  const [key, ...valueParts] = trimmed.split("=");
  const normalizedKey = key.trim().replace(/^export\s+/, "");
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(normalizedKey)) return undefined;
  return { key: normalizedKey, value: valueParts.join("=").trim().replace(/^['"]|['"]$/g, "") };
}

function placeholderReason(value: string): string | undefined {
  if (!value) return "empty placeholder";
  if (/your[_-]|replace[_-]|change[_-]?me|changeme|todo|placeholder|example|dummy|sample|<[^>]+>|\$\{[^}]+\}/i.test(value)) {
    return "placeholder-looking value";
  }
  return undefined;
}

function previewEnvValue(value: string): string {
  if (!value) return "(empty)";
  if (value.length <= 40) return value;
  return `${value.slice(0, 37)}...`;
}

function parseUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function isLocalHttpUrl(url: URL): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(url.hostname);
}

function formatListeningProcess(process: SetupFinalReportListeningProcess): string {
  if (process.status === "found") return `found port=${process.port ?? "unknown"} command=${process.command ?? "unknown"} pid=${process.pid ?? "unknown"}`;
  return `${process.status}${process.port ? ` port=${process.port}` : ""}${process.reason ? ` (${process.reason})` : ""}`;
}

function formatBrowserPageLoad(pageLoad: SetupFinalReportBrowserPageLoad): string {
  const parts = [
    pageLoad.status,
    pageLoad.title ? `title="${pageLoad.title}"` : undefined,
    pageLoad.url ? `url=${pageLoad.url}` : undefined,
    pageLoad.textChars !== undefined ? `textChars=${pageLoad.textChars}` : undefined,
    pageLoad.linkCount !== undefined ? `links=${pageLoad.linkCount}` : undefined,
    pageLoad.reason ? `(${pageLoad.reason})` : undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

function formatValidationCheck(check: SetupFinalReportValidationCheck): string {
  return `${check.status}: ${check.name}${check.evidence ? ` (${check.evidence})` : ""}`;
}

function computeRuntimeStatus(input: {
  activeUrl: string | undefined;
  httpReadiness: SetupFinalReportHttpReadiness;
  browserPageLoad: SetupFinalReportBrowserPageLoad;
  listeningProcess: SetupFinalReportListeningProcess;
}): SetupFinalReportRuntimeStatus {
  if (input.httpReadiness.status === "passed" || input.browserPageLoad.status === "passed" || input.listeningProcess.status === "found") {
    return "running";
  }
  if (!input.activeUrl) return "unknown";
  const explicitFailure =
    input.httpReadiness.status === "failed" ||
    input.browserPageLoad.status === "failed" ||
    input.listeningProcess.status === "not-found";
  return explicitFailure ? "not-running" : "unknown";
}

function computeValidationStatus(input: {
  runtimeStatus: SetupFinalReportRuntimeStatus;
  validationChecks: SetupFinalReportValidationCheck[];
  validationSummary: string | undefined;
  knownLimitations: string[];
  envTemplates: SetupFinalReportEnvTemplateScan;
}): SetupFinalReportValidationStatus {
  const failedChecks = input.validationChecks.filter((check) => check.status === "failed");
  if (failedChecks.length > 0) return "failed";
  const passedChecks = input.validationChecks.filter((check) => check.status === "passed");
  const skippedChecks = input.validationChecks.filter((check) => check.status === "skipped");
  const hasKnownLimitations = input.knownLimitations.length > 0 || input.envTemplates.placeholders.length > 0 || skippedChecks.length > 0;
  if (passedChecks.length > 0 && input.runtimeStatus === "running" && !hasKnownLimitations) return "validated";
  if (passedChecks.length > 0 || skippedChecks.length > 0 || input.validationSummary || input.runtimeStatus === "running") return "partially-validated";
  return "not-validated";
}

function cleanOptional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function normalizeEditRequirement(value: SetupFinalReportEditRequirement | undefined): SetupFinalReportEditRequirement {
  return value === "yes" || value === "no" ? value : "unknown";
}

function normalizeValidationChecks(input: SetupFinalReportValidationCheckInput[] | undefined): SetupFinalReportValidationCheck[] {
  if (!Array.isArray(input)) return [];
  const checks: SetupFinalReportValidationCheck[] = [];
  for (const item of input.slice(0, 30)) {
    const name = cleanOptional(item.name);
    if (!name) continue;
    if (item.status !== "passed" && item.status !== "failed" && item.status !== "skipped") continue;
    const evidence = cleanOptional(item.evidence);
    checks.push({
      name,
      status: item.status,
      ...(evidence ? { evidence } : {}),
    });
  }
  return checks;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function cleanOutput(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultSetupFinalReportCommandRunner(input: SetupFinalReportCommandInput): Promise<SetupFinalReportCommandResult> {
  return execFileAsync(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    encoding: "utf8",
    timeout: input.timeoutMs,
    maxBuffer: 1024 * 1024,
  }).then(({ stdout, stderr }) => ({
    command: input.command,
    args: input.args,
    stdout: typeof stdout === "string" ? stdout : "",
    stderr: typeof stderr === "string" ? stderr : "",
    exitCode: 0,
  })).catch((error: Error & { code?: unknown; stdout?: unknown; stderr?: unknown }) => ({
    command: input.command,
    args: input.args,
    stdout: typeof error.stdout === "string" ? error.stdout : "",
    stderr: typeof error.stderr === "string" ? error.stderr : error.message,
    exitCode: typeof error.code === "number" ? error.code : 1,
    ...(error.code ? { errorCode: String(error.code) } : {}),
  }));
}
