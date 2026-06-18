import type {
  RuntimeUxCommandDescriptor,
  RuntimeUxCommandHeadlessStatus,
  RuntimeUxSettingDescriptor,
  RuntimeUxInventoryResult,
} from "./messagingGateway";
import { buildHeadlessSettingsCatalog } from "./headlessSettingsCatalog";

const RUNTIME_SNAPSHOT_TOOL = "ambient_runtime_surface_snapshot";
const REMOTE_COMMAND_PREVIEW_TOOL = "ambient_messaging_remote_surface_command_preview";
const REMOTE_COMMAND_APPLY_TOOL = "ambient_messaging_remote_surface_command_apply";
const REMOTE_COMMAND_TOOLS = [REMOTE_COMMAND_PREVIEW_TOOL, REMOTE_COMMAND_APPLY_TOOL];
const GATEWAY_STATUS_TOOL = "ambient_messaging_gateway_status";
const REMOTE_SURFACE_ACTIVATION_PLAN_TOOL = "ambient_messaging_remote_surface_activation_plan";
const REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_TOOL = "ambient_messaging_remote_surface_provider_support_plan";
const TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL = "ambient_messaging_telegram_owner_loop_activation_plan";
const TELEGRAM_POLL_PREVIEW_TOOL = "ambient_messaging_telegram_bridge_poll_preview";
const TELEGRAM_POLL_APPLY_TOOL = "ambient_messaging_telegram_bridge_poll_apply";
const TELEGRAM_POLLING_STATUS_TOOL = "ambient_messaging_telegram_bridge_polling_status";
const TELEGRAM_POLLING_PREVIEW_TOOL = "ambient_messaging_telegram_bridge_polling_preview";
const TELEGRAM_POLLING_APPLY_TOOL = "ambient_messaging_telegram_bridge_polling_apply";
const TELEGRAM_POLLING_START_TOOLS = [
  TELEGRAM_POLLING_PREVIEW_TOOL,
  TELEGRAM_POLLING_APPLY_TOOL,
  TELEGRAM_POLLING_STATUS_TOOL,
  GATEWAY_STATUS_TOOL,
];
const TELEGRAM_POLLING_STOP_TOOLS = [
  TELEGRAM_POLLING_PREVIEW_TOOL,
  TELEGRAM_POLLING_APPLY_TOOL,
  TELEGRAM_POLLING_STATUS_TOOL,
];
const TELEGRAM_ONE_SHOT_POLL_TOOLS = [
  TELEGRAM_POLL_PREVIEW_TOOL,
  TELEGRAM_POLL_APPLY_TOOL,
  GATEWAY_STATUS_TOOL,
];

export function buildHeadlessRuntimeUxInventory(): RuntimeUxInventoryResult {
  const settingsCatalog = buildHeadlessSettingsCatalog();
  const readyVoiceSettingExamples = settingExamples(settingsCatalog, "voice");
  const readySearchSettingExamples = settingExamples(settingsCatalog, "search");
  const readySpeechSettingExamples = settingExamples(settingsCatalog, "speech");
  const readyMediaSettingExamples = settingExamples(settingsCatalog, "media-browser");
  const readyModelModeSettingExamples = settingExamples(settingsCatalog, "model-mode", ["model-mode.mode", "model-mode.thinking"]);
  const readyPlannerSettingExamples = settingExamples(settingsCatalog, "model-mode", ["model-mode.planner"]);
  const commands: RuntimeUxCommandDescriptor[] = [
    {
      id: "settings.list",
      label: "List settings",
      category: "settings",
      mode: "read",
      headlessStatus: "partial",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["switch surface settings", "status"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        `The typed settings catalog currently has ${countSettingStatus(settingsCatalog, "ready")} ready, ${countSettingStatus(settingsCatalog, "partial")} partial, and ${countSettingStatus(settingsCatalog, "planned")} planned rows.`,
        "Use the Settings catalog section below to decide whether a row is read-only, writable, partial, or planned before claiming remote/headless support.",
      ],
    },
    {
      id: "settings.voice.update",
      label: "Update voice settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readyVoiceSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Voice policy updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.speech.update",
      label: "Update speech input settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readySpeechSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Speech input policy updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.media.update",
      label: "Update generated media playback settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readyMediaSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Generated media playback updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.search.update",
      label: "Update search settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readySearchSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Search routing preference updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.thread.update",
      label: "Update selected chat thread settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readyModelModeSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Selected chat thread mode and thinking-level updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Model switching is readable but intentionally not writable through this row yet.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.planner.update",
      label: "Update Planner finalization settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: readyPlannerSettingExamples,
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Planner auto-finalization updates are supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "settings.update",
      label: "Update settings",
      category: "settings",
      mode: "mutate",
      headlessStatus: "partial",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: [...readyVoiceSettingExamples.slice(0, 3), ...readyModelModeSettingExamples.slice(0, 4), ...readyPlannerSettingExamples.slice(0, 2), ...readySpeechSettingExamples.slice(0, 4), ...readyMediaSettingExamples, ...readySearchSettingExamples],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Ready voice, selected chat thread, Planner finalization, speech input, generated media playback, and search settings have Remote Ambient Surface command handlers.",
        "Partial and planned settings rows are intentionally cataloged but not advertised as writable.",
      ],
    },
    {
      id: "project.list",
      label: "List projects",
      category: "project",
      mode: "read",
      headlessStatus: "ready",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["switch surface projects", "status"],
      requiresApproval: false,
      plannerSafe: true,
      notes: ["The current active project is runtime-owned and exposed through the runtime surface snapshot without Electron renderer state."],
    },
    {
      id: "project.create",
      label: "Create project",
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["create project Field Notes", "create project Field Notes at /absolute/workspace/path"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Project creation is supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "project.switch",
      label: "Switch active project",
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["switch project 1", "switch project Field Notes"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Active project switching is approval-gated and scheduled after the current Pi turn finishes.",
        "Use ambient_messaging_gateway_status afterward to inspect pending/completed runtime events before relaying status.",
      ],
    },
    {
      id: "workflow.list",
      label: "List workflow agents",
      category: "workflow",
      mode: "read",
      headlessStatus: "ready",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["switch surface workflow_agents", "open workflow 1"],
      requiresApproval: false,
      plannerSafe: true,
      notes: ["Workflow dashboard/list APIs are backend-owned and suitable for chat-native projection."],
    },
    {
      id: "workflow.create",
      label: "Create workflow agent",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: [
        "create workflow Track the Remote Ambient Surface gateway status",
        "create workflow Gateway follow-up :: Track status and summarize blockers",
      ],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Workflow Agent thread creation is supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "workflow.status",
      label: "Inspect workflow status",
      category: "workflow",
      mode: "read",
      headlessStatus: "ready",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL, REMOTE_COMMAND_PREVIEW_TOOL],
      commandExamples: ["open workflow 1", "status"],
      requiresApproval: false,
      plannerSafe: true,
      notes: ["Workflow run detail, discovery question counts, latest run/version state, and safe next commands can be projected without a window."],
    },
    {
      id: "workflow.exploration.run",
      label: "Run workflow exploration",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["run exploration", "run workflow exploration"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Runs a bounded Workflow Agent exploration pass for the selected workflow through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "workflow.compile.preview",
      label: "Compile workflow preview",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["compile from exploration", "compile workflow"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Compiles the selected Workflow Agent into a reviewable workflow preview through the authenticated Remote Ambient Surface command lane.",
        "The command is approval-gated because it can spend model tokens, create artifacts, and update workflow state.",
      ],
    },
    {
      id: "workflow.review.approve",
      label: "Approve workflow preview",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["approve workflow preview", "approve artifact"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Approves the selected workflow's active preview artifact through the authenticated Remote Ambient Surface command lane.",
        "Only ready-for-review workflow previews are eligible.",
      ],
    },
    {
      id: "workflow.review.reject",
      label: "Reject workflow preview",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["reject workflow preview", "reject artifact"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Rejects the selected workflow's active preview artifact through the authenticated Remote Ambient Surface command lane.",
        "Use this when the owner wants the workflow preview revised before execution or scheduling.",
      ],
    },
    {
      id: "workflow.run.cancel",
      label: "Cancel workflow run",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["cancel workflow", "stop workflow"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Cancels the selected workflow's currently running run through the runtime-owned active run controller.",
        "Use ambient_runtime_surface_snapshot first to confirm the selected workflow has a running latest run.",
      ],
    },
    {
      id: "workflow.recovery.retry",
      label: "Retry failed workflow",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["retry failed step", "retry failed event 1"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Retries a selected failed workflow event through the existing workflow recovery plan and runWorkflowArtifact execution lane.",
        "Use ambient_runtime_surface_snapshot first; retry commands are available only when a failed event is projected as retry eligible.",
      ],
    },
    {
      id: "workflow.recovery.resume",
      label: "Resume workflow checkpoint",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["resume checkpoint", "resume checkpoint 1"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Resumes a failed workflow from retained checkpoints and approval decisions.",
        "Use only when the selected workflow projects a checkpoint-resumable failed event.",
      ],
    },
    {
      id: "workflow.recovery.skip",
      label: "Skip failed workflow item",
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["skip failed item", "skip failed item 1"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Skips a selected failed item only when the graph retry policy explicitly allows continuing past item-level failures.",
        "Use ambient_runtime_surface_snapshot first; skip commands are not advertised unless a failed item is projected as skip eligible.",
      ],
    },
    {
      id: "chat.list",
      label: "List chats",
      category: "chat",
      mode: "read",
      headlessStatus: "ready",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["switch surface chat", "open chat 1"],
      requiresApproval: false,
      plannerSafe: true,
      notes: ["Thread summaries are runtime-owned and already used outside renderer-only UI components."],
    },
    {
      id: "chat.create",
      label: "Create chat",
      category: "chat",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["create chat Remote triage", "create chat Follow-up with Ambient"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Chat creation is supported through the authenticated Remote Ambient Surface command lane.",
        "Use ambient_messaging_remote_surface_command_preview first, then ambient_messaging_remote_surface_command_apply after approval.",
      ],
    },
    {
      id: "approval.list",
      label: "List pending approvals",
      category: "approval",
      mode: "read",
      headlessStatus: "ready",
      toolName: RUNTIME_SNAPSHOT_TOOL,
      toolNames: [RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["switch surface notifications", "status"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "Pending permission prompts are exposed through the runtime surface snapshot and notifications projection.",
        "Use the numbered approvals in that projection when replying with approve request <number> or deny request <number>.",
      ],
    },
    {
      id: "approval.respond",
      label: "Respond to approval",
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["approve request 1", "approve request 1 always thread", "deny request 1"],
      requiresApproval: false,
      plannerSafe: false,
      notes: [
        "Approval responses are accepted only through owner-authenticated Remote Ambient Surface queued projections.",
        "This command is itself the approval decision, so it does not request a second approval prompt.",
      ],
    },
    {
      id: "approval.grants.revoke",
      label: "Revoke permission grant",
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: REMOTE_COMMAND_PREVIEW_TOOL,
      toolNames: REMOTE_COMMAND_TOOLS,
      commandExamples: ["revoke grant 1", "switch surface notifications"],
      requiresApproval: false,
      plannerSafe: false,
      notes: [
        "Active reusable permission grants are listed in runtime snapshots and the notifications projection.",
        "Grant revocation is an owner-authenticated recovery action, so it does not request a second approval prompt.",
      ],
    },
    {
      id: "messaging.remote.activation.plan",
      label: "Plan Remote Ambient Surface activation",
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      toolName: REMOTE_SURFACE_ACTIVATION_PLAN_TOOL,
      toolNames: [REMOTE_SURFACE_ACTIVATION_PLAN_TOOL, TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL, GATEWAY_STATUS_TOOL],
      commandExamples: ["set up remote control", "set up Telegram remote control", "set up Signal remote control", "activate owner loop"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "Use this product-level shortcut first for ordinary owner remote-control setup/start/repair requests, including requests that explicitly name Telegram, Signal, or another provider, before provider-specific lifecycle, directory, handoff, binding, polling, command, or relay tools.",
        "For Telegram, call ambient_messaging_telegram_owner_loop_activation_plan next and follow its returned phase sequence.",
        "If no reviewed provider-specific activation plan exists, surface the unsupported-provider repair/status prompt instead of falling back to Messaging Connector, provider UI, shell, browser, provider CLI, or provider-specific low-level tool workarounds.",
      ],
    },
    {
      id: "messaging.remote.provider-support.plan",
      label: "Plan unsupported Remote Ambient Surface provider support",
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      toolName: REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_TOOL,
      toolNames: [REMOTE_SURFACE_ACTIVATION_PLAN_TOOL, REMOTE_SURFACE_PROVIDER_SUPPORT_PLAN_TOOL, GATEWAY_STATUS_TOOL],
      commandExamples: ["plan Signal remote control support", "plan WhatsApp remote provider support"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "Use this only after the product activation shortcut returns unsupported_provider, or when the owner explicitly asks to plan future reviewed provider support.",
        "This is planning-only and captures adapter requirements, owner-auth constraints, headless support, approval gates, and validation targets without starting provider lifecycle or reading/sending provider messages.",
        "Do not treat Signal Desktop, provider UI automation, shell, browser, provider CLIs, or generic Messaging Connector setup as a reviewed Remote Ambient Surface route.",
      ],
    },
    {
      id: "messaging.telegram.activation.plan",
      label: "Plan Telegram owner-loop activation",
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      toolName: TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL,
      toolNames: [REMOTE_SURFACE_ACTIVATION_PLAN_TOOL, TELEGRAM_OWNER_LOOP_ACTIVATION_PLAN_TOOL, GATEWAY_STATUS_TOOL],
      commandExamples: ["set up Telegram remote control", "activate Telegram owner loop"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "For ordinary setup/start/repair product requests, use messaging.remote.activation.plan first even when the user explicitly names Telegram; use this Telegram-specific plan directly only after the product shortcut has selected Telegram or the user asks to inspect this exact plan.",
        "Use this before Pi needs the reviewed Telegram owner-loop sequence instead of piecing together low-level directory, handoff, binding, polling, and relay tools.",
        "The plan is read-only and does not start bridges, list provider chats, read provider messages, mutate bindings, start polling, or send replies.",
      ],
    },
    {
      id: "messaging.polling.status",
      label: "Inspect Remote Ambient Surface polling",
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      toolName: TELEGRAM_POLLING_STATUS_TOOL,
      toolNames: [TELEGRAM_POLLING_STATUS_TOOL, GATEWAY_STATUS_TOOL],
      commandExamples: ["remote polling status", "is Telegram owner polling running"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "Reads only Ambient runner counters and gateway readiness; it does not call the provider unread endpoint.",
        "Use this with ambient_messaging_gateway_status to explain queued projections, recent runtime events, and provider readiness.",
      ],
    },
    {
      id: "messaging.polling.once",
      label: "Poll Remote Ambient Surface once",
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: TELEGRAM_POLL_PREVIEW_TOOL,
      toolNames: TELEGRAM_ONE_SHOT_POLL_TOOLS,
      commandExamples: ["check Telegram once for my command", "poll this owner chat once"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Use one-shot polling when waiting for one expected owner command, smoke-testing a binding, or checking a chat on demand.",
        "Pass minReceivedAt when the expected command should arrive after owner handoff/setup so old unread backlog is counted stale instead of routed into Ambient.",
        "Call preview first, apply only after approval, then call ambient_messaging_gateway_status to inspect queued projections.",
      ],
    },
    {
      id: "messaging.polling.start",
      label: "Start Remote Ambient Surface polling",
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: TELEGRAM_POLLING_PREVIEW_TOOL,
      toolNames: TELEGRAM_POLLING_START_TOOLS,
      commandExamples: ["start Telegram owner polling", "keep polling this owner chat every 30 seconds"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Use periodic polling when the owner wants an ongoing Remote Ambient Surface loop from Telegram without opening Desktop.",
        "Start only after a reviewed owner remote_ambient_surface binding exists and Telegram readiness is real/running.",
        "Always pass a freshness minReceivedAt when activation follows setup or handoff so pre-existing unread backlog cannot become commands.",
        "After apply, inspect polling status and gateway status before telling the owner the remote loop is live.",
      ],
    },
    {
      id: "messaging.polling.stop",
      label: "Stop Remote Ambient Surface polling",
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      toolName: TELEGRAM_POLLING_PREVIEW_TOOL,
      toolNames: TELEGRAM_POLLING_STOP_TOOLS,
      commandExamples: ["stop Telegram owner polling", "pause the remote owner loop"],
      requiresApproval: true,
      plannerSafe: false,
      notes: [
        "Stop only clears Ambient's polling timer; it does not revoke the owner binding or stop the provider bridge.",
        "Call preview first, apply after approval, then confirm the runner state is stopped.",
      ],
    },
    {
      id: "runtime.status",
      label: "Inspect runtime status",
      category: "status",
      mode: "read",
      headlessStatus: "ready",
      toolName: GATEWAY_STATUS_TOOL,
      toolNames: [GATEWAY_STATUS_TOOL, RUNTIME_SNAPSHOT_TOOL],
      commandExamples: ["status", "help"],
      requiresApproval: false,
      plannerSafe: true,
      notes: [
        "Messaging gateway status and runtime surface snapshots cover provider, project, workflow, queued projection, and runtime-event status.",
      ],
    },
  ];
  return summarizeInventory(commands, settingsCatalog);
}

export function headlessRuntimeUxInventoryText(result: RuntimeUxInventoryResult): string {
  const lines = [
    "Ambient headless runtime UX inventory",
    `Commands: ${result.commandCount}`,
    `Headless-ready: ${result.headlessReadyCount}`,
    `Partial: ${result.partialCount}`,
    `Renderer-only: ${result.rendererOnlyCount}`,
    `Planned: ${result.plannedCount}`,
    `Settings catalog: ${result.settingCount}`,
    `Settings ready: ${result.settingReadyCount}`,
    `Settings partial: ${result.settingPartialCount}`,
    `Settings renderer-only: ${result.settingRendererOnlyCount}`,
    `Settings planned: ${result.settingPlannedCount}`,
    "",
  ];
  for (const command of result.commands) {
    lines.push(`- ${command.id}: ${command.label}`);
    lines.push(`  Category: ${command.category}`);
    lines.push(`  Mode: ${command.mode}`);
    lines.push(`  Headless: ${command.headlessStatus}`);
    lines.push(`  Tool: ${command.toolName ?? "not assigned"}`);
    if (command.toolNames?.length) lines.push(`  Tool sequence: ${command.toolNames.join(" -> ")}`);
    lines.push(`  Approval: ${command.requiresApproval ? "required for execution" : "not required"}`);
    lines.push(`  Planner-safe: ${command.plannerSafe ? "yes" : "no"}`);
    if (command.commandExamples?.length) lines.push(`  Examples: ${command.commandExamples.join("; ")}`);
    if (command.notes.length) lines.push(`  Notes: ${command.notes.join(" ")}`);
  }
  lines.push("", "Settings catalog:");
  for (const setting of result.settingsCatalog) {
    lines.push(`- ${setting.key}: ${setting.label}`);
    lines.push(`  Section: ${setting.sectionId}`);
    lines.push(`  Row: ${setting.rowId}`);
    lines.push(`  Headless: ${setting.headlessStatus}`);
    lines.push(`  Readable: ${setting.headlessReadable ? "yes" : "no"}`);
    lines.push(`  Writable: ${setting.headlessWritable ? "yes" : "no"}`);
    lines.push(`  Approval: ${setting.requiresApproval ? "required for writes" : "not required"}`);
    lines.push(`  Planner-safe: ${setting.plannerSafe ? "yes" : "no"}`);
    if (setting.toolNames?.length) lines.push(`  Tool sequence: ${setting.toolNames.join(" -> ")}`);
    if (setting.commandExamples?.length) lines.push(`  Examples: ${setting.commandExamples.join("; ")}`);
    if (setting.notes.length) lines.push(`  Notes: ${setting.notes.join(" ")}`);
  }
  return lines.join("\n");
}

function summarizeInventory(commands: RuntimeUxCommandDescriptor[], settingsCatalog: RuntimeUxSettingDescriptor[]): RuntimeUxInventoryResult {
  const sorted = commands.map(normalizeCommand).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const normalizedSettings = settingsCatalog.map(normalizeSetting);
  return {
    commands: sorted,
    settingsCatalog: normalizedSettings,
    commandCount: sorted.length,
    headlessReadyCount: countStatus(sorted, "ready"),
    partialCount: countStatus(sorted, "partial"),
    rendererOnlyCount: countStatus(sorted, "renderer-only"),
    plannedCount: countStatus(sorted, "planned"),
    settingCount: normalizedSettings.length,
    settingReadyCount: countSettingStatus(normalizedSettings, "ready"),
    settingPartialCount: countSettingStatus(normalizedSettings, "partial"),
    settingRendererOnlyCount: countSettingStatus(normalizedSettings, "renderer-only"),
    settingPlannedCount: countSettingStatus(normalizedSettings, "planned"),
  };
}

function countStatus(commands: RuntimeUxCommandDescriptor[], status: RuntimeUxCommandHeadlessStatus): number {
  return commands.filter((command) => command.headlessStatus === status).length;
}

function countSettingStatus(settings: RuntimeUxSettingDescriptor[], status: RuntimeUxCommandHeadlessStatus): number {
  return settings.filter((setting) => setting.headlessStatus === status).length;
}

function settingExamples(settings: RuntimeUxSettingDescriptor[], sectionId: string, settingKeys?: string[]): string[] {
  const allowedKeys = settingKeys ? new Set(settingKeys) : undefined;
  return settings
    .filter((setting) =>
      setting.sectionId === sectionId
      && setting.headlessStatus === "ready"
      && setting.headlessWritable
      && (!allowedKeys || allowedKeys.has(setting.key))
    )
    .flatMap((setting) => setting.commandExamples ?? []);
}

function normalizeCommand(command: RuntimeUxCommandDescriptor): RuntimeUxCommandDescriptor {
  return {
    ...command,
    id: command.id.trim(),
    label: command.label.trim(),
    ...(command.toolName?.trim() ? { toolName: command.toolName.trim() } : {}),
    ...(command.toolNames?.length ? { toolNames: command.toolNames.map((toolName) => toolName.trim()).filter(Boolean) } : {}),
    ...(command.commandExamples?.length ? { commandExamples: command.commandExamples.map((example) => example.trim()).filter(Boolean) } : {}),
    ...(command.ipcChannel?.trim() ? { ipcChannel: command.ipcChannel.trim() } : {}),
    notes: command.notes.map((note) => note.trim()).filter(Boolean),
  };
}

function normalizeSetting(setting: RuntimeUxSettingDescriptor): RuntimeUxSettingDescriptor {
  return {
    ...setting,
    key: setting.key.trim(),
    label: setting.label.trim(),
    sectionId: setting.sectionId.trim(),
    rowId: setting.rowId.trim(),
    ...(setting.toolNames?.length ? { toolNames: setting.toolNames.map((toolName) => toolName.trim()).filter(Boolean) } : {}),
    ...(setting.commandExamples?.length ? { commandExamples: setting.commandExamples.map((example) => example.trim()).filter(Boolean) } : {}),
    notes: setting.notes.map((note) => note.trim()).filter(Boolean),
  };
}
