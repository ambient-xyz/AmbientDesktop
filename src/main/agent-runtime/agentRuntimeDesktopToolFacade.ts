import {
  descriptorToolDefinition as desktopDescriptorToolDefinition,
  registerDesktopTool as registerDesktopToolWithDescriptor,
} from "../desktop-tools/desktopToolAgentRuntimeContract";
import type { DescriptorToolRegistration as DesktopDescriptorToolRegistration } from "../desktop-tools/desktopToolAgentRuntimeContract";
import {
  asyncBashToolDescriptor as desktopAsyncBashToolDescriptor,
  browserToolDescriptor as desktopBrowserToolDescriptor,
  firstPartyDesktopToolDescriptors as desktopFirstPartyDesktopToolDescriptors,
  gitToolDescriptor as desktopGitToolDescriptor,
  longContextToolDescriptor as desktopLongContextToolDescriptor,
  managedDownloadToolDescriptor as desktopManagedDownloadToolDescriptor,
  mediaToolDescriptor as desktopMediaToolDescriptor,
  messagingGatewayToolDescriptor as desktopMessagingGatewayToolDescriptor,
  modelStatusToolDescriptor as desktopModelStatusToolDescriptor,
  piToolFieldsFromDescriptor as desktopPiToolFieldsFromDescriptor,
  pluginInstallToolDescriptor as desktopPluginInstallToolDescriptor,
  privilegedActionToolDescriptor as desktopPrivilegedActionToolDescriptor,
  productContextToolDescriptor as desktopProductContextToolDescriptor,
  productContextToolDescriptors as desktopProductContextToolDescriptors,
  providerCatalogToolDescriptor as desktopProviderCatalogToolDescriptor,
  searchPreferenceToolDescriptor as desktopSearchPreferenceToolDescriptor,
  visionToolDescriptor as desktopVisionToolDescriptor,
  webResearchToolDescriptor as desktopWebResearchToolDescriptor,
} from "../desktop-tools/desktopToolAgentRuntimeContract";
import type {
  DesktopToolDescriptor as DesktopToolDescriptorContract,
  PiToolRegistrationFields as DesktopPiToolRegistrationFields,
} from "../desktop-tools/desktopToolAgentRuntimeContract";

export const descriptorToolDefinition = desktopDescriptorToolDefinition;
export const registerDesktopTool = registerDesktopToolWithDescriptor;
export const asyncBashToolDescriptor = desktopAsyncBashToolDescriptor;
export const browserToolDescriptor = desktopBrowserToolDescriptor;
export const firstPartyDesktopToolDescriptors = desktopFirstPartyDesktopToolDescriptors;
export const gitToolDescriptor = desktopGitToolDescriptor;
export const longContextToolDescriptor = desktopLongContextToolDescriptor;
export const managedDownloadToolDescriptor = desktopManagedDownloadToolDescriptor;
export const mediaToolDescriptor = desktopMediaToolDescriptor;
export const messagingGatewayToolDescriptor = desktopMessagingGatewayToolDescriptor;
export const modelStatusToolDescriptor = desktopModelStatusToolDescriptor;
export const piToolFieldsFromDescriptor = desktopPiToolFieldsFromDescriptor;
export const pluginInstallToolDescriptor = desktopPluginInstallToolDescriptor;
export const privilegedActionToolDescriptor = desktopPrivilegedActionToolDescriptor;
export const productContextToolDescriptor = desktopProductContextToolDescriptor;
export const productContextToolDescriptors = desktopProductContextToolDescriptors;
export const providerCatalogToolDescriptor = desktopProviderCatalogToolDescriptor;
export const searchPreferenceToolDescriptor = desktopSearchPreferenceToolDescriptor;
export const visionToolDescriptor = desktopVisionToolDescriptor;
export const webResearchToolDescriptor = desktopWebResearchToolDescriptor;

export type DescriptorToolRegistration<TDetails = unknown, TState = unknown> = DesktopDescriptorToolRegistration<
  TDetails,
  TState
>;
export type DesktopToolDescriptor = DesktopToolDescriptorContract;
export type PiToolRegistrationFields = DesktopPiToolRegistrationFields;
