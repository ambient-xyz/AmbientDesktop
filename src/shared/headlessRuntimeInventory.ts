import type {
  RuntimeUxCommandDescriptor,
  RuntimeUxCommandHeadlessStatus,
  RuntimeUxSettingDescriptor,
  RuntimeUxInventoryResult,
} from "./messagingGateway";
import { buildHeadlessSettingsCatalog } from "./headlessSettingsCatalog";
import { buildHeadlessRuntimeUxCommands } from "./headlessRuntimeCommandInventory";

export function buildHeadlessRuntimeUxInventory(): RuntimeUxInventoryResult {
  const settingsCatalog = buildHeadlessSettingsCatalog();
  return summarizeInventory(buildHeadlessRuntimeUxCommands(settingsCatalog), settingsCatalog);
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
