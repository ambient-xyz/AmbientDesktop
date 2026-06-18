import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { providerCatalogToolDescriptor } from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";
import { providerCatalogBootstrapReminder, runProviderCatalogTool } from "../provider/providerCatalog";

const PROVIDER_CATALOG_CONTEXT_TYPE = "ambient-provider-selection-context";

export function createProviderCatalogToolExtension(): ExtensionFactory {
  return (pi) => {
    registerDesktopTool(pi, providerCatalogToolDescriptor("ambient_provider_catalog"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => runProviderCatalogTool(params),
    });

    pi.on("context", async (event: any) => {
      if (!Array.isArray(event.messages)) return undefined;
      return {
        messages: event.messages.filter((message: any) => message?.customType !== PROVIDER_CATALOG_CONTEXT_TYPE),
      };
    });

    pi.on("before_agent_start", async (event: any) => ({
      systemPrompt: `${event.systemPrompt}\n\n${providerCatalogBootstrapReminder}`,
      message: {
        customType: PROVIDER_CATALOG_CONTEXT_TYPE,
        content: providerCatalogBootstrapReminder,
        display: false,
      },
    }));
  };
}
