import type {
  AmbientPluginCapabilitySummary,
  AmbientPluginRegistry,
  WorkflowManifest,
  WorkflowPluginCapabilityGrant,
} from "../../shared/types";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "../desktopToolRegistry";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { listAmbientPluginRuntimeCapabilities, pluginMcpToolCapabilityId } from "../plugins/capabilityRegistry";

const workflowRunnableAvailability = new Set(["available", "untrusted"]);

export interface WorkflowAutomationPluginRequirementBlocker {
  capabilityId: string;
  registeredName: string;
  pluginName: string;
  availability?: AmbientPluginCapabilitySummary["availability"];
  reason: string;
}

export function workflowPluginCapabilityGrant(registration: PluginMcpToolRegistration): WorkflowPluginCapabilityGrant {
  return {
    capabilityId: pluginMcpToolCapabilityId({
      pluginId: registration.tool.pluginId,
      serverName: registration.tool.serverName,
      toolName: registration.originalName,
    }),
    pluginId: registration.tool.pluginId,
    pluginName: registration.tool.pluginName,
    serverName: registration.tool.serverName,
    toolName: registration.originalName,
    registeredName: registration.registeredName,
  };
}

export function workflowToolDescriptorsFromPluginRegistry(
  registry: AmbientPluginRegistry,
  registrations: PluginMcpToolRegistration[] = [],
): DesktopToolDescriptor[] {
  const workflowCapabilities = listAmbientPluginRuntimeCapabilities(registry, "workflow");
  const builtInToolNames = new Set(
    workflowCapabilities
      .filter(
        (capability) =>
          capability.sourceKind === "ambient-built-in" &&
          capability.kind === "tool" &&
          capability.availability === "available",
      )
      .map((capability) => capability.toolName ?? capability.name),
  );
  const builtIns = firstPartyDesktopToolDescriptors().filter((descriptor) => builtInToolNames.has(descriptor.name));
  const pluginDescriptors = registrations
    .filter((registration) => workflowCapabilityAllowsPluginRegistration(workflowCapabilities, registration))
    .map((registration) => registration.descriptor);
  return [...builtIns, ...pluginDescriptors];
}

export function enrichWorkflowManifestWithPluginCapabilities(
  manifest: WorkflowManifest,
  registrations: PluginMcpToolRegistration[] = [],
): WorkflowManifest {
  const grants = workflowPluginCapabilityGrantsForTools(manifest.tools, registrations);
  if (grants.length === 0) return manifest;
  return {
    ...manifest,
    pluginCapabilities: grants,
  };
}

export function validateWorkflowPluginCapabilityRequirements(
  manifest: WorkflowManifest,
  registrations: PluginMcpToolRegistration[] = [],
): void {
  if (!manifest.pluginCapabilities?.length) return;

  const registrationByName = new Map(registrations.map((registration) => [registration.registeredName, registration]));
  for (const grant of manifest.pluginCapabilities) {
    if (!manifest.tools.includes(grant.registeredName)) {
      throw new Error(`Workflow plugin capability is not declared as a tool: ${grant.registeredName}`);
    }
    const registration = registrationByName.get(grant.registeredName);
    if (!registration) {
      throw new Error(`Workflow requires unavailable plugin capability: ${grant.registeredName}`);
    }
    const actual = workflowPluginCapabilityGrant(registration);
    if (
      actual.capabilityId !== grant.capabilityId ||
      actual.pluginId !== grant.pluginId ||
      actual.serverName !== grant.serverName ||
      actual.toolName !== grant.toolName
    ) {
      throw new Error(`Workflow plugin capability changed or no longer matches: ${grant.registeredName}`);
    }
  }
}

export function validateWorkflowAutomationPluginRequirements(
  manifest: WorkflowManifest,
  registry: AmbientPluginRegistry,
): void {
  const blockers = workflowAutomationPluginRequirementBlockers(manifest, registry);
  if (blockers.length === 0) return;
  throw new Error(workflowAutomationPluginRequirementBlockerMessage(blockers));
}

export function workflowAutomationPluginRequirementBlockerMessage(blockers: WorkflowAutomationPluginRequirementBlocker[]): string {
  return blockers
    .map((blocker) => `Automation requires blocked plugin capability: ${blocker.registeredName} (${blocker.reason})`)
    .join("\n");
}

export function workflowAutomationPluginRequirementBlockers(
  manifest: WorkflowManifest,
  registry: AmbientPluginRegistry,
): WorkflowAutomationPluginRequirementBlocker[] {
  return (manifest.pluginCapabilities ?? []).flatMap((grant) => {
    if (!manifest.tools.includes(grant.registeredName)) {
      return [
        {
          capabilityId: grant.capabilityId,
          registeredName: grant.registeredName,
          pluginName: grant.pluginName,
          reason: "Workflow manifest does not declare the registered plugin tool.",
        },
      ];
    }
    const capability = registry.capabilities.find(
      (item) =>
        item.kind === "mcp-tool" &&
        item.pluginId === grant.pluginId &&
        item.serverName === grant.serverName,
    );
    if (!capability) {
      return [
        {
          capabilityId: grant.capabilityId,
          registeredName: grant.registeredName,
          pluginName: grant.pluginName,
          reason: "Capability was not found in the plugin registry.",
        },
      ];
    }
    if (!capability.runtimeSupport.includes("automation")) {
      return [
        {
          capabilityId: grant.capabilityId,
          registeredName: grant.registeredName,
          pluginName: grant.pluginName,
          availability: capability.availability,
          reason: "Capability is not exposed to automations.",
        },
      ];
    }
    if (capability.availability === "available") return [];
    return [
      {
        capabilityId: grant.capabilityId,
        registeredName: grant.registeredName,
        pluginName: grant.pluginName,
        availability: capability.availability,
        reason: automationCapabilityBlockReason(capability),
      },
    ];
  });
}

export function workflowPluginCapabilityGrantsForTools(
  toolNames: string[],
  registrations: PluginMcpToolRegistration[] = [],
): WorkflowPluginCapabilityGrant[] {
  const requested = new Set(toolNames);
  return registrations
    .filter((registration) => requested.has(registration.registeredName))
    .map((registration) => workflowPluginCapabilityGrant(registration));
}

function workflowCapabilityAllowsPluginRegistration(
  workflowCapabilities: AmbientPluginCapabilitySummary[],
  registration: PluginMcpToolRegistration,
): boolean {
  const capability = workflowCapabilities.find(
    (item) =>
      item.kind === "mcp-tool" &&
      item.pluginId === registration.tool.pluginId &&
      item.serverName === registration.tool.serverName,
  );
  return Boolean(capability && workflowRunnableAvailability.has(capability.availability));
}

function automationCapabilityBlockReason(capability: AmbientPluginCapabilitySummary): string {
  if (capability.availability === "untrusted") return capability.availabilityReason ?? "Trust this plugin before automation dispatch.";
  if (capability.availability === "auth-required") {
    return capability.availabilityReason ?? "Authorize the required plugin account before automation dispatch.";
  }
  if (capability.availability === "disabled") return capability.availabilityReason ?? "Enable this plugin before automation dispatch.";
  if (capability.availability === "unsupported") return capability.availabilityReason ?? "This plugin capability is unsupported.";
  if (capability.availability === "error") return capability.availabilityReason ?? "This plugin capability has registry errors.";
  return capability.availabilityReason ?? `Capability is ${capability.availability}.`;
}
