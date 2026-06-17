import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { pluginInstallToolDescriptor } from "../desktopToolRegistry";
import { registerDesktopTool } from "../desktopToolRegistration";
import type { AmbientInstallRoutePlan } from "../install-route/installRoutePlanner";

export interface CapabilityBuilderPlanToolInput {
  goal: string;
  capabilityName?: string;
  installerShape?: string;
  kind?: string;
  provider?: string;
  outputFileArtifacts?: string[];
  responseFormats?: string[];
  locality?: "local" | "network" | "either";
  envNames?: string[];
  networkHosts?: string[];
  modelAssets?: string[];
  providerCatalogCards?: unknown[];
  researchPlanningRisks?: string[];
}

export interface CapabilityBuilderPlanRoutePreflightContext {
  latestInstallRouteLane?: AmbientInstallRoutePlan["lane"];
  mcpAutowirePlanned?: boolean;
}

export interface CapabilityBuilderPlanRoutePreflightResult {
  text: string;
  details: Record<string, unknown>;
}

export interface CapabilityBuilderPlanToolRegistrationOptions<TInput extends CapabilityBuilderPlanToolInput> {
  parsePlanInput: (params: Record<string, unknown>) => TInput;
  planText: (input: TInput) => string;
  routePreflight: (
    input: TInput,
    context: CapabilityBuilderPlanRoutePreflightContext,
  ) => CapabilityBuilderPlanRoutePreflightResult | undefined;
  latestInstallRouteLane: () => AmbientInstallRoutePlan["lane"] | undefined;
  mcpAutowirePlanned: () => boolean;
}

export function registerCapabilityBuilderPlanTool<TInput extends CapabilityBuilderPlanToolInput>(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: CapabilityBuilderPlanToolRegistrationOptions<TInput>,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_capability_builder_plan"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> => {
      const input = options.parsePlanInput(params as Record<string, unknown>);
      const mcpRoutePreflight = options.routePreflight(input, {
        latestInstallRouteLane: options.latestInstallRouteLane(),
        mcpAutowirePlanned: options.mcpAutowirePlanned(),
      });
      if (mcpRoutePreflight) {
        return {
          content: [{ type: "text", text: mcpRoutePreflight.text }],
          details: mcpRoutePreflight.details,
        };
      }
      return {
        content: [{ type: "text", text: options.planText(input) }],
        details: {
          runtime: "ambient-capability-builder",
          toolName: "ambient_capability_builder_plan",
          status: "planned",
          goal: input.goal,
          capabilityName: input.capabilityName,
          installerShape: input.installerShape,
          kind: input.kind,
          provider: input.provider,
          outputFileArtifacts: input.outputFileArtifacts,
          responseFormats: input.responseFormats,
          locality: input.locality,
          envNames: input.envNames,
          networkHosts: input.networkHosts,
          modelAssets: input.modelAssets,
          providerCatalogCards: input.providerCatalogCards,
          researchPlanningRisks: input.researchPlanningRisks,
        },
      };
    },
  });
}
