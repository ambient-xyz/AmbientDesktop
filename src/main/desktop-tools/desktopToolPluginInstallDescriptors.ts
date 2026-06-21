import type { DesktopToolDescriptor } from "./desktopToolDescriptorTypes";
import { pluginLifecycleToolDescriptors } from "./desktopToolPluginLifecycleDescriptors";
import { mcpAutowireToolDescriptors } from "./desktopToolMcpAutowireDescriptors";
import { mcpServerToolDescriptors } from "./desktopToolMcpServerDescriptors";
import { mcpUtilityToolDescriptors } from "./desktopToolMcpUtilityDescriptors";
import { capabilityBuilderToolDescriptors } from "./desktopToolCapabilityBuilderDescriptors";
import { ambientCliToolDescriptors } from "./desktopToolAmbientCliDescriptors";
import { ambientWorkflowToolDescriptors } from "./desktopToolAmbientWorkflowDescriptors";
import { ambientCliMaintenanceToolDescriptors } from "./desktopToolAmbientCliMaintenanceDescriptors";
import { piPackageToolDescriptors } from "./desktopToolPiPackageDescriptors";

export const pluginInstallToolDescriptors: DesktopToolDescriptor[] = [
  ...pluginLifecycleToolDescriptors,
  ...mcpAutowireToolDescriptors,
  ...mcpServerToolDescriptors,
  ...mcpUtilityToolDescriptors,
  ...capabilityBuilderToolDescriptors,
  ...ambientCliToolDescriptors,
  ...ambientWorkflowToolDescriptors,
  ...ambientCliMaintenanceToolDescriptors,
  ...piPackageToolDescriptors,
];
