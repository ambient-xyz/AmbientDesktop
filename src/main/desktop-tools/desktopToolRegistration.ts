import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";

import {
  piToolFieldsFromDescriptor,
  type DesktopToolDescriptor,
  type PiToolRegistrationFields,
} from "./desktopToolRegistry";
import { normalizeToolArgumentsForTool } from "./desktopToolsToolRuntimeFacade";

export type DescriptorToolRegistration<TDetails = unknown, TState = any> = Omit<
  ToolDefinition<any, TDetails, TState>,
  keyof PiToolRegistrationFields
>;

export function descriptorToolDefinition<TDetails = unknown, TState = any>(
  descriptor: DesktopToolDescriptor,
  registration: DescriptorToolRegistration<TDetails, TState>,
): ToolDefinition<any, TDetails, TState> {
  const fields = piToolFieldsFromDescriptor(descriptor);
  const prepareArguments = registration.prepareArguments;
  return {
    ...fields,
    parameters: fields.parameters as any,
    ...registration,
    prepareArguments: (input: unknown) => {
      const normalized = normalizeToolArgumentsForTool(descriptor.name, input);
      return prepareArguments ? prepareArguments(normalized) : normalized;
    },
  };
}

export function registerDesktopTool<TDetails = unknown, TState = any>(
  pi: Pick<ExtensionAPI, "registerTool">,
  descriptor: DesktopToolDescriptor,
  registration: DescriptorToolRegistration<TDetails, TState>,
): void {
  pi.registerTool(descriptorToolDefinition(descriptor, registration));
}
