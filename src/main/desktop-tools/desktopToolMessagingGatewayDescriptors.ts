import type { DesktopToolDescriptor } from "./desktopToolDescriptorTypes";
import { messagingGatewaySetupToolDescriptors } from "./desktopToolMessagingGatewaySetupDescriptors";
import { messagingGatewaySignalToolDescriptors } from "./desktopToolMessagingGatewaySignalDescriptors";
import { messagingGatewayTelegramToolDescriptors } from "./desktopToolMessagingGatewayTelegramDescriptors";

export const messagingGatewayToolDescriptors: DesktopToolDescriptor[] = [
  ...messagingGatewaySetupToolDescriptors,
  ...messagingGatewaySignalToolDescriptors,
  ...messagingGatewayTelegramToolDescriptors,
];
