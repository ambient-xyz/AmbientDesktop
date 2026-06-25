import type { DesktopToolDescriptor, PluginMcpDescriptorInput } from "./desktopToolDescriptorTypes";
import {
  asyncBashToolDescriptors,
  bashToolDescriptor,
  fileToolDescriptors,
  gitToolDescriptors,
  mediaToolDescriptors,
} from "./desktopToolCoreDescriptors";
import { longContextToolDescriptors } from "./desktopToolLongContextDescriptors";
import {
  localDeepResearchToolDescriptors,
  localRuntimeToolDescriptors,
  managedDownloadToolDescriptors,
  sttToolDescriptors,
  visionToolDescriptors,
  voiceToolDescriptors,
} from "./desktopToolRuntimeMediaDescriptors";
import { pluginInstallToolDescriptors } from "./desktopToolPluginInstallDescriptors";
import { messagingGatewayToolDescriptors } from "./desktopToolMessagingGatewayDescriptors";
import { browserToolDescriptors } from "./desktopToolBrowserDescriptors";
import { searchPreferenceToolDescriptors, webResearchToolDescriptors } from "./desktopToolWebResearchDescriptors";
import { googleWorkspaceSetupToolDescriptors } from "./desktopToolGoogleWorkspaceDescriptors";
import {
  installRouteToolDescriptor,
  installRouteToolDescriptors,
  piToolFieldsFromDescriptor,
  privilegedActionToolDescriptor,
  privilegedActionToolDescriptors,
  providerCatalogToolDescriptor,
  providerCatalogToolDescriptors,
} from "./desktopToolRoutingDescriptors";

export type {
  DesktopToolDescriptor,
  DesktopToolIdempotency,
  DesktopToolPaginationDescriptor,
  DesktopToolSideEffect,
  DesktopToolSource,
  PiToolRegistrationFields,
  PluginMcpDescriptorInput,
  WorkflowCapabilityGuidanceDescriptor,
  WorkflowCapabilityGuidanceRisk,
} from "./desktopToolDescriptorTypes";

export { pluginInstallToolDescriptors };
export { messagingGatewayToolDescriptors };
export { browserToolDescriptors };
export { searchPreferenceToolDescriptors, webResearchToolDescriptors };
export { googleWorkspaceSetupToolDescriptors };
export {
  installRouteToolDescriptor,
  installRouteToolDescriptors,
  piToolFieldsFromDescriptor,
  privilegedActionToolDescriptor,
  privilegedActionToolDescriptors,
  providerCatalogToolDescriptor,
  providerCatalogToolDescriptors,
};
export { longContextToolDescriptors };
export { asyncBashToolDescriptors, bashToolDescriptor, fileToolDescriptors, gitToolDescriptors, mediaToolDescriptors };
export {
  localDeepResearchToolDescriptors,
  localRuntimeToolDescriptors,
  managedDownloadToolDescriptors,
  sttToolDescriptors,
  visionToolDescriptors,
  voiceToolDescriptors,
};

export const productContextToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_product_context",
    label: "Ambient Product Context",
    description:
      "Return canonical local Ambient product identity context for Ambient Desktop, Ambient/Pi, Ambient Network, and official Ambient websites.",
    promptSnippet:
      "ambient_product_context: Read-only canonical Ambient Desktop and Ambient Network identity facts with official source URLs.",
    promptGuidelines: [
      "Use this before answering detailed questions about what Ambient Desktop, Ambient/Pi, Ambient, or the Ambient Network is.",
      "Use this when public web search returns conflicting Ambient-branded products or when the user asks for official Ambient website references.",
      "This tool is read-only and uses Desktop-owned canonical product context. It does not browse the web or inspect user files.",
      "Preserve maturity labels: Ambient Desktop is Developer Preview; Network Client and Local Model Routing are In Development; Ambient Mini Mining is Roadmap.",
      "Do not claim live wallet flows, on-network transactions, fixed mining rewards, or finalized token economics are available in Desktop unless newer public docs or user-provided evidence says so.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["identity", "desktop", "ambient", "network", "sources", "all"],
          description: "Optional product context topic. Defaults to identity.",
        },
        query: {
          type: "string",
          description: "Optional natural-language focus such as 'what is Ambient Network' or 'official websites'.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        facts: { type: "array" },
        sources: { type: "array" },
        maturityNotes: { type: "array" },
      },
      required: ["topic", "facts", "sources", "maturityNotes"],
      additionalProperties: true,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "ambient-product-context-read",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 5_000,
    runtimeSupport: ["chat"],
  },
];

export const modelStatusToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_model_status",
    label: "Ambient Model Status",
    description:
      "Report the selected Ambient model, effective running Pi model, provider status, capabilities, and model-specific reasoning contract.",
    promptSnippet:
      "ambient_model_status: Read-only selected and running Ambient/Pi model status, including Kimi or GLM-5.2 reasoning behavior.",
    promptGuidelines: [
      "Use this when the task may depend on which Ambient model is selected or running, including Kimi vs GLM-5.2 behavior.",
      "This tool is read-only and returns Desktop-owned runtime metadata. It does not call the provider, mutate settings, or expose secrets.",
      "Treat requestedModelId as the stored thread setting and effectiveModelId as the normalized runtime model. Legacy GLM aliases normalize to GLM-5.2 FP8.",
      "Treat capabilities and reasoning as the effective running model contract; selected only describes the stored thread model setting.",
      "Use reasoning.current for the active thread reasoning mode. defaultThinkingLevel is only the model default, not the selected thread setting.",
      "For GLM-5.2, reasoning.current labels both high and xhigh as Deep when they resolve to ZAI max effort; medium is Standard/ZAI high effort.",
      "Use the reasoning section to decide whether thinking controls are model-fixed, selectable, or unsupported. Do not infer reasoning behavior from model names.",
      "If selected and running models mismatch, surface the warning instead of silently assuming either model.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          description:
            "Optional short reason for checking the running model status. This is ignored by Desktop and is only for transcript clarity.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        schemaVersion: { type: "string", const: "ambient-running-model-status-v1" },
        selected: { type: "object" },
        running: { type: "object" },
        provider: { type: "object" },
        capabilities: { type: "object" },
        reasoning: { type: "object" },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["schemaVersion", "selected", "running", "provider", "capabilities", "reasoning", "warnings"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "model-runtime-read",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 5_000,
    runtimeSupport: ["chat"],
  },
];

export function firstPartyDesktopToolDescriptors(): DesktopToolDescriptor[] {
  return [
    bashToolDescriptor,
    ...asyncBashToolDescriptors,
    ...fileToolDescriptors,
    ...longContextToolDescriptors,
    ...mediaToolDescriptors,
    ...voiceToolDescriptors,
    ...sttToolDescriptors,
    ...visionToolDescriptors,
    ...localDeepResearchToolDescriptors,
    ...localRuntimeToolDescriptors,
    ...managedDownloadToolDescriptors,
    ...productContextToolDescriptors,
    ...modelStatusToolDescriptors,
    ...installRouteToolDescriptors,
    ...gitToolDescriptors,
    ...providerCatalogToolDescriptors,
    ...webResearchToolDescriptors,
    ...searchPreferenceToolDescriptors,
    ...messagingGatewayToolDescriptors,
    ...browserToolDescriptors,
    ...privilegedActionToolDescriptors,
    ...pluginInstallToolDescriptors,
    ...googleWorkspaceSetupToolDescriptors,
  ];
}

export function asyncBashToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = asyncBashToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown async bash tool descriptor: ${name}`);
  return descriptor;
}

export function longContextToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = longContextToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown long-context tool descriptor: ${name}`);
  return descriptor;
}

export function productContextToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = productContextToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown product context tool descriptor: ${name}`);
  return descriptor;
}

export function modelStatusToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = modelStatusToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown model status tool descriptor: ${name}`);
  return descriptor;
}

export function mediaToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = mediaToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown media tool descriptor: ${name}`);
  return descriptor;
}

export function searchPreferenceToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = searchPreferenceToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown search preference tool descriptor: ${name}`);
  return descriptor;
}

export function webResearchToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = webResearchToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown web research tool descriptor: ${name}`);
  return descriptor;
}

export function gitToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = gitToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown Git tool descriptor: ${name}`);
  return descriptor;
}

export function voiceToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = voiceToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown voice tool descriptor: ${name}`);
  return descriptor;
}

export function sttToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = sttToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown STT tool descriptor: ${name}`);
  return descriptor;
}

export function visionToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = visionToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown vision tool descriptor: ${name}`);
  return descriptor;
}

export function localDeepResearchToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = localDeepResearchToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown Local Deep Research tool descriptor: ${name}`);
  return descriptor;
}

export function localRuntimeToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = localRuntimeToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown local runtime tool descriptor: ${name}`);
  return descriptor;
}

export function managedDownloadToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = managedDownloadToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown managed download tool descriptor: ${name}`);
  return descriptor;
}

export function messagingGatewayToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = messagingGatewayToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown messaging gateway tool descriptor: ${name}`);
  return descriptor;
}

export function browserToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = browserToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown browser tool descriptor: ${name}`);
  return descriptor;
}

export function pluginInstallToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = pluginInstallToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown plugin install tool descriptor: ${name}`);
  return descriptor;
}

export function googleWorkspaceSetupToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = googleWorkspaceSetupToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown Google Workspace setup tool descriptor: ${name}`);
  return descriptor;
}

export function pluginMcpToolDescriptor(input: PluginMcpDescriptorInput): DesktopToolDescriptor {
  return {
    name: input.registeredName,
    label: input.label,
    description: input.description,
    promptSnippet: input.promptSnippet,
    promptGuidelines: input.promptGuidelines,
    inputSchema: input.parameters,
    source: "plugin-mcp",
    sideEffects: "plugin-defined",
    permissionScope: "plugin-mcp",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 8_000,
  };
}
