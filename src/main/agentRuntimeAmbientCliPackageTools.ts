import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  registerAmbientCliPackageEnvBindTool,
  registerAmbientCliPackageSecretRequestTool,
  type AmbientCliPackageEnvBindToolRegistrationOptions,
  type AmbientCliPackageSecretRequestToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackageEnvTools";
import {
  registerAmbientCliPackageInstallTool,
  registerAmbientCliPackagePiCatalogInstallTool,
  type AmbientCliPackageInstallToolRegistrationOptions,
  type AmbientCliPackagePiCatalogInstallToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackageInstallTools";
import {
  registerAmbientCliPackageDescribeTool,
  type AmbientCliPackageDescribeToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackageDescribeTools";
import {
  registerAmbientCliPackagePreviewTool,
  type AmbientCliPackagePreviewToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackagePreviewTools";
import {
  registerAmbientCliRunTool,
  type AmbientCliRunToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackageRunTools";
import {
  registerAmbientCliPackageSearchTool,
  type AmbientCliPackageSearchToolRegistrationOptions,
} from "./agentRuntimeAmbientCliPackageSearchTools";
import type { AmbientCliPackageUninstallToolRegistrationOptions } from "./agentRuntimeAmbientCliPackageUninstallTools";

export type AgentRuntimeAmbientCliPackageToolOptions =
  & AmbientCliPackagePreviewToolRegistrationOptions
  & AmbientCliPackageInstallToolRegistrationOptions
  & AmbientCliPackagePiCatalogInstallToolRegistrationOptions
  & AmbientCliPackageEnvBindToolRegistrationOptions
  & AmbientCliPackageSecretRequestToolRegistrationOptions
  & AmbientCliPackageSearchToolRegistrationOptions
  & AmbientCliPackageDescribeToolRegistrationOptions
  & AmbientCliRunToolRegistrationOptions
  & AmbientCliPackageUninstallToolRegistrationOptions;

export function registerAgentRuntimeAmbientCliPackageTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeAmbientCliPackageToolOptions,
): void {
  registerAmbientCliPackagePreviewTool(pi, options);
  registerAmbientCliPackageInstallTool(pi, options);
  registerAmbientCliPackagePiCatalogInstallTool(pi, options);
  registerAmbientCliPackageEnvBindTool(pi, options);
  registerAmbientCliPackageSecretRequestTool(pi, options);
  registerAmbientCliPackageSearchTool(pi, options);
  registerAmbientCliPackageDescribeTool(pi, options);
  registerAmbientCliRunTool(pi, options);
}
