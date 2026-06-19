import { randomUUID } from "node:crypto";
import type { PrivilegedActionAdapterExecutionPlan, PrivilegedActionAdapterName, PrivilegedActionAdapterReadiness, PrivilegedActionAdapterResultStatus, PrivilegedActionAdapterStatus, PrivilegedActionCommandTemplate, PrivilegedActionContinuation, PrivilegedActionCredentialCaptureStatus, PrivilegedActionCredentialPolicy, PrivilegedActionNativeRequest, PrivilegedActionNativeResult, PrivilegedActionPurpose, PrivilegedActionTemplate, PrivilegedActionUiPrompt } from "../../shared/permissionTypes";
import { redactSensitiveText } from "./privilegedActionSecurityFacade";

export type {
  PrivilegedActionAdapterName,
  PrivilegedActionAdapterExecutionPlan,
  PrivilegedActionAdapterReadiness,
  PrivilegedActionAdapterResultStatus,
  PrivilegedActionAdapterStatus,
  PrivilegedActionCommandTemplate,
  PrivilegedActionContinuation,
  PrivilegedActionCredentialPolicy,
  PrivilegedActionCredentialCaptureStatus,
  PrivilegedActionNativeRequest,
  PrivilegedActionNativeResult,
  PrivilegedActionPurpose,
  PrivilegedActionTemplate,
  PrivilegedActionUiPrompt,
};

export interface PrivilegedActionPlan {
  template: PrivilegedActionTemplate;
  commandCount: number;
  adapterReadiness: PrivilegedActionAdapterReadiness;
  credentialPolicy: PrivilegedActionCredentialPolicy;
  redactedCommands: PrivilegedActionCommandTemplate[];
  warnings: string[];
}

export interface PrivilegedActionDryRunResult {
  status: PrivilegedActionAdapterResultStatus;
  adapter: PrivilegedActionAdapterName;
  message: string;
  plan: PrivilegedActionPlan;
  nativeResult: PrivilegedActionNativeResult;
}

export const credentialPlaceholder = "{{AMBIENT_PRIVILEGED_AUTH}}";
export const privilegedActionPurposes: PrivilegedActionPurpose[] = [
  "create_system_symlink",
  "install_system_package",
  "register_service",
  "install_driver",
  "repair_protected_path",
  "other_privileged_setup",
];

export function privilegedActionAdapterStatus(input: {
  adapterStatus?: PrivilegedActionAdapterStatus["adapterStatus"];
  credentialCapture?: PrivilegedActionAdapterStatus["credentialCapture"];
  credentialRehearsalAvailable?: boolean;
  execution?: PrivilegedActionAdapterStatus["execution"];
  selectedAdapter?: PrivilegedActionAdapterName;
  selectedAdapterExecutesPrivilegedCommands?: boolean;
} = {}): PrivilegedActionAdapterStatus {
  const selectedAdapter = input.selectedAdapter ?? "dry-run";
  const adapterStatus = input.adapterStatus ?? "not-implemented";
  const execution = input.execution ?? "dry-run-only";
  const selectedAdapterExecutesPrivilegedCommands = input.selectedAdapterExecutesPrivilegedCommands ?? false;
  const credentialCapture = input.credentialCapture ?? (input.credentialRehearsalAvailable ? "rehearsal-available" : "not-implemented");
  const arbitraryCommandPattern = "<structured executable> <structured args...>";
  const policyHints = privilegedActionPurposes.flatMap((purpose) => [
    {
      adapter: "macos-authorized-helper" as const,
      platform: "darwin" as const,
      purpose,
      executionMode: "planned-not-executed" as const,
      allowedByPolicy: true,
      commandPattern: arbitraryCommandPattern,
      sourcePolicy: "Commands are not source-path restricted; users must review the exact executable, args, cwd, rationale, and warning text before approval.",
      targetPolicy: "Commands may mutate protected host locations with admin privileges after explicit approval and ephemeral credential capture.",
      notes: "Executes only when the macOS adapter is selected and available. Ambient wraps the structured command with sudo; Pi never sees the credential.",
    },
    {
      adapter: "linux-polkit-helper" as const,
      platform: "linux" as const,
      purpose,
      executionMode: "planned-not-executed" as const,
      allowedByPolicy: true,
      commandPattern: arbitraryCommandPattern,
      sourcePolicy: "Commands are not source-path restricted; users must review the exact executable, args, cwd, rationale, and warning text before approval.",
      targetPolicy: "Commands may mutate protected host locations with admin privileges after explicit approval and ephemeral credential capture.",
      notes: "Executes only when the Linux adapter is selected and available. Ambient wraps the structured command with sudo; Pi never sees the credential.",
    },
    {
      adapter: "windows-elevated-helper" as const,
      platform: "win32" as const,
      purpose,
      executionMode: "planned-not-executed" as const,
      allowedByPolicy: true,
      commandPattern: arbitraryCommandPattern,
      sourcePolicy: "Commands are not source-path restricted; users must review the exact executable, args, cwd, rationale, and warning text before approval.",
      targetPolicy: "Commands may mutate protected host locations through the Windows UAC elevation prompt after explicit approval.",
      notes: "Executes only when the Windows adapter is selected and available. Windows elevation uses the OS UAC prompt rather than exposing credentials to Pi.",
    },
  ]);
  return {
    schemaVersion: "ambient-privileged-action-v1",
    execution,
    adapterStatus,
    selectedAdapter,
    selectedAdapterExecutesPrivilegedCommands,
    policyPlanning: "available",
    credentialCapture,
    supportedPurposes: privilegedActionPurposes,
    policyHints,
    adapters: [
      {
        name: "dry-run",
        available: true,
        executesPrivilegedCommands: false,
        notes: "Records and returns redacted privileged action requests without executing them.",
      },
      {
        name: "macos-authorized-helper",
        available: selectedAdapter === "macos-authorized-helper" && adapterStatus === "available",
        executesPrivilegedCommands: true,
        notes: "Policy-checked macOS privileged adapter for arbitrary structured host actions after explicit approval and ephemeral credential capture.",
      },
      {
        name: "linux-polkit-helper",
        available: selectedAdapter === "linux-polkit-helper" && adapterStatus === "available",
        executesPrivilegedCommands: true,
        notes: "Policy-checked Linux privileged adapter for arbitrary structured host actions after explicit approval and ephemeral credential capture.",
      },
      {
        name: "windows-elevated-helper",
        available: selectedAdapter === "windows-elevated-helper" && adapterStatus === "available",
        executesPrivilegedCommands: true,
        notes: "Policy-checked Windows elevated adapter for arbitrary structured host actions through the OS UAC prompt.",
      },
    ],
    guidance: [
      "Use ambient_privileged_action_request only after non-privileged repair strategies are exhausted.",
      execution === "executed"
        ? "Selected native adapter can execute arbitrary typed privileged actions after Ambient approval, with platform-appropriate credential or elevation handling."
        : "Current execution is review/dry-run only; no privileged command or credential prompt is available yet.",
      "Do not ask the user to copy sudo/admin commands into a terminal.",
      "Do not pass real credentials; use only the {{AMBIENT_PRIVILEGED_AUTH}} sentinel when future native credential capture is needed.",
    ],
  };
}

export function privilegedActionAdapterStatusText(status = privilegedActionAdapterStatus()): string {
  return [
    "Ambient privileged action adapter status",
    `Schema: ${status.schemaVersion}`,
    `Execution: ${status.execution}`,
    `Adapter status: ${status.adapterStatus}`,
    `Selected adapter: ${status.selectedAdapter}`,
    `Selected adapter executes privileged commands: ${status.selectedAdapterExecutesPrivilegedCommands}`,
    `Policy planning: ${status.policyPlanning}`,
    `Credential capture: ${status.credentialCapture}`,
    `Supported purposes: ${status.supportedPurposes.join(", ")}`,
    "",
    "Adapters:",
    ...status.adapters.map((adapter) => `- ${adapter.name}: ${adapter.available ? "available" : "unavailable"}; executesPrivilegedCommands=${adapter.executesPrivilegedCommands}; ${adapter.notes}`),
    "",
    "Policy hints:",
    ...status.policyHints.map((hint) => `- ${hint.platform}/${hint.purpose}: ${hint.commandPattern}; source=${hint.sourcePolicy}; target=${hint.targetPolicy}; ${hint.notes}`),
    "",
    "Guidance:",
    ...status.guidance.map((item) => `- ${item}`),
  ].join("\n");
}

const blockedExecutables = new Set(["sudo", "su", "doas", "pkexec", "bash", "sh", "zsh", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"]);
const secretLikePattern = /(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)=([^&\s]+)/gi;
const secretLikeKeyPattern = /\b(password|passwd|pwd|token|secret|credential|authorization|auth[_-]?key|api[_-]?key)=\[REDACTED\]/gi;

export function planPrivilegedAction(input: unknown): PrivilegedActionPlan {
  const record = objectInput(input, "privileged action request");
  const kind = requiredTrimmedString(record.kind, "kind");
  if (kind !== "privileged_action_template") throw new Error("Privileged action requests must use kind=\"privileged_action_template\".");
  const purpose = normalizePurpose(record.purpose);
  const reason = requiredTrimmedString(record.reason, "reason");
  const packageName = optionalTrimmedString(record.packageName);
  const platform = optionalPlatform(record.platform);
  const credential = optionalTrimmedString(record.credential);
  if (credential && credential !== credentialPlaceholder) {
    throw new Error(`Privileged action credential must be the sentinel ${credentialPlaceholder}; never pass credential values to Pi-visible tools.`);
  }
  const rawCommands = Array.isArray(record.commands) ? record.commands : [];
  if (!rawCommands.length) throw new Error("Privileged action requests must include at least one command template.");
  if (rawCommands.length > 5) throw new Error("Privileged action requests are limited to five command templates.");
  const commands = rawCommands.map(normalizeCommandTemplate);
  const warnings = commands.flatMap(commandWarnings);
  return {
    template: {
      kind: "privileged_action_template",
      purpose,
      ...(packageName ? { packageName } : {}),
      reason,
      ...(platform ? { platform } : {}),
      commands,
      ...(credential ? { credential: credentialPlaceholder } : {}),
    },
    commandCount: commands.length,
    adapterReadiness: {
      execution: "dry-run-only",
      adapterStatus: "not-implemented",
      actionCategory: purpose,
      executablePolicy: "template-reviewed-no-shell",
      futureAdapters: ["macos-authorized-helper", "linux-polkit-helper", "windows-elevated-helper"],
    },
    credentialPolicy: {
      visibleToPi: false,
      persistence: "ephemeral",
      expiresAfterUse: true,
      logPolicy: "redact-all",
    },
    redactedCommands: commands.map(redactCommand),
    warnings,
  };
}

export function privilegedActionApprovalDetail(plan: PrivilegedActionPlan, workspacePath: string): string {
  return privilegedActionUiPrompt(plan, workspacePath).detail;
}

export function privilegedActionUiPrompt(plan: PrivilegedActionPlan, workspacePath: string): PrivilegedActionUiPrompt {
  const title = `Review privileged action: ${plan.template.purpose}?`;
  const message = plan.template.credential
    ? "Ambient wants to review a typed privileged host action. If the selected adapter can execute on this platform, Ambient will ask for an ephemeral admin credential or platform elevation; Pi will not see any credential."
    : "Ambient wants to review a typed privileged host action. The current adapter is dry-run only.";
  const detail = [
    `Workspace: ${workspacePath}`,
    `Purpose: ${plan.template.purpose}`,
    plan.template.packageName ? `Package: ${plan.template.packageName}` : undefined,
    `Action category: ${plan.adapterReadiness.actionCategory}`,
    `Reason: ${plan.template.reason}`,
    `Platform: ${plan.template.platform ?? "any"}`,
    `Execution: ${plan.adapterReadiness.execution}; adapter ${plan.adapterReadiness.adapterStatus}`,
    `Credential: ${plan.template.credential ? "ephemeral Ambient privileged auth sentinel" : "none requested"}`,
    "Commands:",
    ...plan.redactedCommands.map((command, index) => {
      const args = command.args.length ? ` ${command.args.map(quoteArg).join(" ")}` : "";
      const cwd = command.cwd ? ` (cwd ${command.cwd})` : "";
      const rationale = command.rationale ? `\n   rationale: ${command.rationale}` : "";
      return `${index + 1}. ${command.exe}${args}${cwd}${rationale}`;
    }),
    plan.warnings.length ? ["Warnings:", ...plan.warnings.map((warning) => `- ${warning}`)].join("\n") : undefined,
  ].filter(Boolean).join("\n");
  return {
    title,
    message,
    detail,
    responseMode: plan.template.credential ? "native-credential-required" : "review-only",
    credentialPrompt: plan.template.credential ? "ephemeral-native-prompt-required" : "none",
    redactedCommands: plan.redactedCommands,
    warnings: plan.warnings,
  };
}

export function buildPrivilegedActionNativeRequest(
  plan: PrivilegedActionPlan,
  input: { workspacePath: string; threadId?: string; requestId?: string; createdAt?: string; adapterReadiness?: PrivilegedActionAdapterReadiness },
): PrivilegedActionNativeRequest {
  const { credential: _credential, ...templateWithoutCredential } = plan.template;
  const requestPlan = input.adapterReadiness ? { ...plan, adapterReadiness: input.adapterReadiness } : plan;
  return {
    schemaVersion: "ambient-privileged-action-v1",
    requestId: input.requestId ?? randomUUID(),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    workspacePath: input.workspacePath,
    createdAt: input.createdAt ?? new Date().toISOString(),
    template: {
      ...templateWithoutCredential,
      commands: plan.redactedCommands,
    },
    uiPrompt: privilegedActionUiPrompt(requestPlan, input.workspacePath),
    adapterReadiness: requestPlan.adapterReadiness,
    credentialPolicy: plan.credentialPolicy,
  };
}

export function dryRunPrivilegedAction(
  plan: PrivilegedActionPlan,
  nativeRequest?: PrivilegedActionNativeRequest,
  options: { credentialCapture?: PrivilegedActionCredentialCaptureStatus; executionPlan?: PrivilegedActionAdapterExecutionPlan } = {},
): PrivilegedActionDryRunResult {
  const request = nativeRequest ?? buildPrivilegedActionNativeRequest(plan, { workspacePath: "" });
  const nativeResult = dryRunPrivilegedActionNativeRequest(request, options);
  return privilegedActionResultFromNativeResult(plan, nativeResult);
}

export function privilegedActionResultFromNativeResult(
  plan: PrivilegedActionPlan,
  nativeResult: PrivilegedActionNativeResult,
): PrivilegedActionDryRunResult {
  return {
    status: nativeResult.status,
    adapter: nativeResult.adapter,
    message: nativeResult.message,
    plan,
    nativeResult,
  };
}

export function dryRunPrivilegedActionNativeRequest(
  request: PrivilegedActionNativeRequest,
  options: { credentialCapture?: PrivilegedActionCredentialCaptureStatus; executionPlan?: PrivilegedActionAdapterExecutionPlan } = {},
): PrivilegedActionNativeResult {
  return {
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    status: "not-executed",
    adapter: "dry-run",
    message: "Privileged action handoff was accepted for review, but no privileged adapter is enabled yet. No command was executed and no credential was requested.",
    commandCount: request.template.commands.length,
    redactedCommands: request.uiPrompt.redactedCommands,
    credentialPolicy: request.credentialPolicy,
    adapterReadiness: request.adapterReadiness,
    credentialCapture: options.credentialCapture ?? "not-requested",
    executionPlan: options.executionPlan,
    continuation: privilegedActionContinuation(request, "not-executed", options.executionPlan),
  };
}

export function successfulPrivilegedActionNativeRequest(
  request: PrivilegedActionNativeRequest,
  input: {
    adapter: Exclude<PrivilegedActionAdapterName, "dry-run">;
    executionPlan: PrivilegedActionAdapterExecutionPlan;
    credentialCapture: PrivilegedActionCredentialCaptureStatus;
    message?: string;
    stdoutPreview?: string;
    stderrPreview?: string;
    logPath?: string;
  },
): PrivilegedActionNativeResult {
  if (!input.executionPlan.allowedByPolicy) throw new Error("Successful privileged action results require an approved execution plan.");
  if (input.executionPlan.adapter !== input.adapter) throw new Error("Successful privileged action adapter must match the execution plan adapter.");
  if (input.executionPlan.requiresCredential && input.credentialCapture !== "captured-and-discarded") {
    throw new Error("Successful privileged action results that require credentials must have a captured-and-discarded credential state.");
  }
  return {
    schemaVersion: request.schemaVersion,
    requestId: request.requestId,
    status: "succeeded",
    adapter: input.adapter,
    message: input.message ?? "Privileged action completed successfully. Ambient can resume validation.",
    commandCount: request.template.commands.length,
    redactedCommands: request.uiPrompt.redactedCommands,
    credentialPolicy: request.credentialPolicy,
    adapterReadiness: request.adapterReadiness,
    credentialCapture: input.credentialCapture,
    executionPlan: {
      ...input.executionPlan,
      executionMode: "executed",
      executesPrivilegedCommands: true,
      warnings: input.executionPlan.warnings.filter((warning) => !/(not executed|no privileged command was executed|no command was executed)/i.test(warning)),
    },
    continuation: privilegedActionContinuation(request, "succeeded", input.executionPlan, { redactedLogPath: input.logPath }),
    ...(input.stdoutPreview ? { stdoutPreview: redactPrivilegedOutputPreview(input.stdoutPreview) } : {}),
    ...(input.stderrPreview ? { stderrPreview: redactPrivilegedOutputPreview(input.stderrPreview) } : {}),
    ...(input.logPath ? { logPath: input.logPath } : {}),
  };
}

export function redactPrivilegedOutputPreview(value: string): string {
  return redactSensitiveText(redactValue(value)).replace(secretLikeKeyPattern, "$1=[REDACTED]");
}

export function privilegedActionContinuation(
  request: PrivilegedActionNativeRequest,
  status: PrivilegedActionNativeResult["status"],
  executionPlan?: PrivilegedActionAdapterExecutionPlan,
  options: { redactedLogPath?: string } = {},
): PrivilegedActionContinuation {
  const packageName = request.template.packageName;
  const redactedLogFields = options.redactedLogPath ? { redactedLogPath: options.redactedLogPath } : {};
  const redactedLogInstruction = options.redactedLogPath
    ? [`Use file_read on redactedLogPath (${options.redactedLogPath}) for exact adapter metadata if needed; never request raw credentials or unredacted logs.`]
    : [];
  if (status === "succeeded") {
    return {
      state: "ready-to-resume-validation",
      ...(packageName ? { packageName } : {}),
      reason: "The privileged adapter reports success, so capability validation can resume.",
      recommendedTools: packageName ? ["ambient_capability_builder_validate", "ambient_capability_builder_register-after-validation"] : [],
      ...redactedLogFields,
      ...(packageName ? {
        resumeAction: {
          toolName: "ambient_capability_builder_validate",
          input: { packageName, includeSmokeTests: true },
          requiresApproval: true,
          runAfter: "privileged-action-succeeded",
        },
      } : {}),
      instructions: [
        packageName
          ? `Resume with ambient_capability_builder_validate using packageName=${packageName} and includeSmokeTests=true. Register only after validation succeeds.`
          : "Resume the interrupted validation or setup step that required the privileged action.",
        "Use redacted adapter stdout/stderr previews and log paths only; do not ask for or expose credentials.",
        ...redactedLogInstruction,
      ],
    };
  }
  if (executionPlan && !executionPlan.allowedByPolicy) {
    return {
      state: "blocked-by-policy",
      ...(packageName ? { packageName } : {}),
      reason: executionPlan.policyReason,
      recommendedTools: ["ambient_privileged_action_status"],
      ...redactedLogFields,
      instructions: [
        "Do not retry this privileged action unchanged.",
        "Use ambient_privileged_action_status policyHints to choose a platform-supported structured request, or return to non-privileged repair strategies.",
        "Do not ask the user to copy sudo/admin commands into Terminal.",
        ...redactedLogInstruction,
      ],
    };
  }
  return {
    state: "blocked-until-native-adapter",
    ...(packageName ? { packageName } : {}),
    reason: "The request was accepted for review, but no native privileged adapter executed it.",
    recommendedTools: ["ambient_privileged_action_status"],
    ...redactedLogFields,
    instructions: [
      "Do not run validation, registration, or capability activation as if the privileged action succeeded.",
      "Wait for a privileged adapter result with status succeeded before resuming Capability Builder validation.",
      "Do not ask the user to copy sudo/admin commands into Terminal.",
      ...redactedLogInstruction,
    ],
  };
}

export function withPrivilegedActionLogPath(
  result: PrivilegedActionNativeResult,
  redactedLogPath: string,
): PrivilegedActionNativeResult {
  if (result.continuation.redactedLogPath) {
    return { ...result, logPath: result.logPath ?? redactedLogPath };
  }
  return {
    ...result,
    logPath: result.logPath ?? redactedLogPath,
    continuation: {
      ...result.continuation,
      redactedLogPath,
      instructions: [
        ...result.continuation.instructions,
        `Use file_read on redactedLogPath (${redactedLogPath}) for exact adapter metadata if needed; never request raw credentials or unredacted logs.`,
      ],
    },
  };
}

export function privilegedActionResultText(result: PrivilegedActionDryRunResult): string {
  return [
    "Ambient privileged action handoff",
    `Status: ${result.status}`,
    `Adapter: ${result.adapter}`,
    `Action category: ${result.plan.adapterReadiness.actionCategory}`,
    `Request adapter readiness: ${result.plan.adapterReadiness.adapterStatus}`,
    `Credential capture: ${result.nativeResult.credentialCapture}`,
    result.message,
    ...(result.nativeResult.logPath ? [`Redacted log path: ${result.nativeResult.logPath}`] : []),
    "",
    "Credential policy:",
    "- visibleToPi: false",
    "- persistence: ephemeral",
    "- expiresAfterUse: true",
    "- logPolicy: redact-all",
    "",
    "Request policy:",
    `- requestedExecution: ${result.plan.adapterReadiness.execution}`,
    "- executablePolicy: template-reviewed-no-shell",
    `- futureAdapters: ${result.plan.adapterReadiness.futureAdapters.join(", ")}`,
    ...(result.nativeResult.executionPlan ? [
      "",
      "Adapter execution plan:",
      `- adapter: ${result.nativeResult.executionPlan.adapter}`,
      `- executionMode: ${result.nativeResult.executionPlan.executionMode}`,
      `- allowedByPolicy: ${result.nativeResult.executionPlan.allowedByPolicy}`,
      `- policyReason: ${result.nativeResult.executionPlan.policyReason}`,
    ] : []),
    "",
    "Continuation:",
    `- state: ${result.nativeResult.continuation.state}`,
    ...(result.nativeResult.continuation.packageName ? [`- packageName: ${result.nativeResult.continuation.packageName}`] : []),
    `- reason: ${result.nativeResult.continuation.reason}`,
    `- recommendedTools: ${result.nativeResult.continuation.recommendedTools.length ? result.nativeResult.continuation.recommendedTools.join(", ") : "none"}`,
    ...(result.nativeResult.continuation.redactedLogPath ? [`- redactedLogPath: ${result.nativeResult.continuation.redactedLogPath}`] : []),
    ...(result.nativeResult.continuation.resumeAction ? [
      `- resumeAction: ${result.nativeResult.continuation.resumeAction.toolName} ${JSON.stringify(result.nativeResult.continuation.resumeAction.input)}`,
      `- resumeRequiresApproval: ${result.nativeResult.continuation.resumeAction.requiresApproval}`,
    ] : []),
    ...result.nativeResult.continuation.instructions.map((instruction) => `- ${instruction}`),
    "",
    "Reviewed command templates:",
    ...result.plan.redactedCommands.map((command, index) => `${index + 1}. ${command.exe}${command.args.length ? ` ${command.args.map(quoteArg).join(" ")}` : ""}`),
    "",
    "Next: follow the continuation state above. Do not ask the user to copy sudo/admin commands into Terminal.",
  ].join("\n");
}

function normalizeCommandTemplate(value: unknown, index: number): PrivilegedActionCommandTemplate {
  const record = objectInput(value, `commands[${index}]`);
  const exe = requiredTrimmedString(record.exe, `commands[${index}].exe`);
  if (/[\0\n\r;&|<>]/.test(exe)) throw new Error(`Unsupported executable characters in commands[${index}].exe.`);
  const base = exe.split(/[\\/]/).at(-1)?.toLowerCase() ?? exe.toLowerCase();
  if (blockedExecutables.has(base)) throw new Error(`Privileged action commands must not invoke shell/sudo wrappers directly: ${exe}`);
  const args = Array.isArray(record.args) ? record.args.map((arg, argIndex) => normalizeArg(arg, index, argIndex)) : [];
  if (args.length > 50) throw new Error(`commands[${index}].args is limited to 50 entries.`);
  const cwd = optionalTrimmedString(record.cwd);
  const rationale = optionalTrimmedString(record.rationale);
  return {
    exe,
    args,
    ...(cwd ? { cwd } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

function normalizePurpose(value: unknown): PrivilegedActionPurpose {
  const purpose = requiredTrimmedString(value, "purpose");
  if (privilegedActionPurposes.includes(purpose as PrivilegedActionPurpose)) return purpose as PrivilegedActionPurpose;
  throw new Error(`Unsupported privileged action purpose: ${purpose}. Use one of: ${privilegedActionPurposes.join(", ")}.`);
}

function commandWarnings(command: PrivilegedActionCommandTemplate): string[] {
  return command.args.flatMap((arg) => {
    if (arg.includes(credentialPlaceholder)) return ["Credential sentinel appears in command args; Ambient will keep real credentials out of Pi-visible tool args and logs."];
    if (secretLikePattern.test(arg)) {
      secretLikePattern.lastIndex = 0;
      return ["Command args contain secret-like key/value text; it will be redacted from Pi-visible output."];
    }
    secretLikePattern.lastIndex = 0;
    return [];
  });
}

function redactCommand(command: PrivilegedActionCommandTemplate): PrivilegedActionCommandTemplate {
  return {
    ...command,
    args: command.args.map(redactValue),
  };
}

function redactValue(value: string): string {
  return value.replaceAll(credentialPlaceholder, "[AMBIENT_PRIVILEGED_AUTH]").replace(secretLikePattern, "$1=[REDACTED]");
}

function normalizeArg(value: unknown, commandIndex: number, argIndex: number): string {
  if (typeof value !== "string") throw new Error(`commands[${commandIndex}].args[${argIndex}] must be a string.`);
  if (/[\0\n\r]/.test(value)) throw new Error(`commands[${commandIndex}].args[${argIndex}] contains unsupported characters.`);
  return value;
}

function objectInput(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredTrimmedString(value: unknown, label: string): string {
  const text = optionalTrimmedString(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPlatform(value: unknown): PrivilegedActionTemplate["platform"] | undefined {
  const text = optionalTrimmedString(value);
  if (!text) return undefined;
  if (text === "any" || text === "darwin" || text === "linux" || text === "win32") return text;
  throw new Error(`Unsupported privileged action platform: ${text}`);
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}
