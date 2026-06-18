import { describe, expect, it } from "vitest";
import type { AmbientPluginAvailability, AmbientPluginRegistry, AmbientPluginRuntime } from "../../shared/pluginTypes";
import { pluginMcpToolDescriptor } from "./workflowDesktopToolFacade";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import {
  enrichWorkflowManifestWithPluginCapabilities,
  validateWorkflowAutomationPluginRequirements,
  validateWorkflowPluginCapabilityRequirements,
  workflowAutomationPluginRequirementBlockers,
  workflowToolDescriptorsFromPluginRegistry,
} from "./workflowPluginCapabilities";

function fixtureRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "fixture_tool",
    label: "Fixture tool",
    description: "Fixture plugin tool.",
    promptSnippet: "fixture_tool: Fixture plugin tool.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName: "fixture_tool",
    originalName: "fixture_original",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "server",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin-1",
      pluginName: "Fixture",
      serverName: "server",
      name: "fixture_original",
    },
  };
}

function fixtureRegistry(
  pluginAvailability: AmbientPluginAvailability = "untrusted",
  runtimeSupport: AmbientPluginRuntime[] = ["workflow", "automation"],
): AmbientPluginRegistry {
  return {
    plugins: [
      {
        id: "ambient:ambient-built-in:desktop-tools",
        sourcePluginId: "ambient-built-in:desktop-tools",
        sourceKind: "ambient-built-in",
        sourceLabel: "Ambient built-ins",
        name: "ambient-desktop-tools",
        installState: "installed",
        compatibilityTier: "supported",
        enabled: true,
        trusted: true,
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "codex:plugin-1",
        sourcePluginId: "plugin-1",
        sourceKind: "codex-workspace",
        sourceLabel: "Fixture",
        name: "Fixture",
        installState: "installed",
        compatibilityTier: "supported",
        enabled: true,
        trusted: pluginAvailability === "available",
        capabilityCount: 1,
        supportLabels: [],
        diagnostics: [],
      },
    ],
    capabilities: [
      {
        id: "ambient-built-in:desktop-tools:desktop-tool:bash",
        pluginId: "ambient-built-in:desktop-tools",
        pluginName: "ambient-desktop-tools",
        kind: "tool",
        name: "bash",
        sourceKind: "ambient-built-in",
        runtimeSupport: ["workflow", "automation"],
        enabled: true,
        trusted: true,
        availability: "available",
        toolName: "bash",
        supportLabels: [],
        diagnostics: [],
      },
      {
        id: "plugin-1:mcp-server:server",
        pluginId: "plugin-1",
        pluginName: "Fixture",
        kind: "mcp-tool",
        name: "server",
        sourceKind: "codex-workspace",
        runtimeSupport,
        enabled: true,
        trusted: pluginAvailability === "available",
        availability: pluginAvailability,
        serverName: "server",
        supportLabels: [],
        diagnostics: [],
      },
    ],
    sources: [],
    errors: [],
    sourceNotes: [],
  };
}

describe("workflow plugin capabilities", () => {
  it("attaches stable plugin capability grants for plugin tools in a manifest", () => {
    const manifest = enrichWorkflowManifestWithPluginCapabilities(
      { tools: ["fixture_tool", "bash"], mutationPolicy: "read_only" },
      [fixtureRegistration()],
    );

    expect(manifest.pluginCapabilities).toEqual([
      {
        capabilityId: "plugin-1:mcp-tool:server:fixture_original",
        pluginId: "plugin-1",
        pluginName: "Fixture",
        serverName: "server",
        toolName: "fixture_original",
        registeredName: "fixture_tool",
      },
    ]);
    expect(() => validateWorkflowPluginCapabilityRequirements(manifest, [fixtureRegistration()])).not.toThrow();
  });

  it("rejects workflow plugin capability requirements that are unavailable at run time", () => {
    const manifest = enrichWorkflowManifestWithPluginCapabilities(
      { tools: ["fixture_tool"], mutationPolicy: "read_only" },
      [fixtureRegistration()],
    );

    expect(() => validateWorkflowPluginCapabilityRequirements(manifest, [])).toThrow(
      "Workflow requires unavailable plugin capability: fixture_tool",
    );
  });

  it("derives workflow tool descriptors from the normalized plugin registry", () => {
    const descriptors = workflowToolDescriptorsFromPluginRegistry(fixtureRegistry(), [fixtureRegistration()]);

    expect(descriptors.map((descriptor) => descriptor.name)).toEqual(["bash", "fixture_tool"]);
  });

  it("does not expose disabled plugin capabilities to the workflow compiler", () => {
    const descriptors = workflowToolDescriptorsFromPluginRegistry(fixtureRegistry("disabled"), [fixtureRegistration()]);

    expect(descriptors.map((descriptor) => descriptor.name)).toEqual(["bash"]);
  });

  it("validates automation plugin requirements against registry availability and automation exposure", () => {
    const manifest = enrichWorkflowManifestWithPluginCapabilities(
      { tools: ["fixture_tool"], mutationPolicy: "read_only" },
      [fixtureRegistration()],
    );

    expect(() => validateWorkflowAutomationPluginRequirements(manifest, fixtureRegistry("available"))).not.toThrow();
    expect(workflowAutomationPluginRequirementBlockers(manifest, fixtureRegistry("untrusted"))).toEqual([
      expect.objectContaining({
        registeredName: "fixture_tool",
        availability: "untrusted",
        reason: "Trust this plugin before automation dispatch.",
      }),
    ]);
    expect(() => validateWorkflowAutomationPluginRequirements(manifest, fixtureRegistry("disabled"))).toThrow(
      "Automation requires blocked plugin capability: fixture_tool",
    );
    expect(workflowAutomationPluginRequirementBlockers(manifest, fixtureRegistry("available", ["workflow"]))).toEqual([
      expect.objectContaining({
        registeredName: "fixture_tool",
        reason: "Capability is not exposed to automations.",
      }),
    ]);
  });
});
