import {
  buildRightPanelPluginHostModel,
  mcpContainerRuntimeInstallProgressStatus,
  mcpDefaultCapabilityInstallProgressStatus,
} from "./RightPanelPluginHostModel";
import { RightPanelPluginHostChrome } from "./RightPanelPluginHostChrome";
import { RightPanelPluginHostViews } from "./RightPanelPluginHostViews";
import type { RightPanelPluginHostProps } from "./RightPanelPluginHostTypes";

export type { PluginPanelView, RightPanelPluginHostProps } from "./RightPanelPluginHostTypes";
export { mcpContainerRuntimeInstallProgressStatus, mcpDefaultCapabilityInstallProgressStatus };

export function RightPanelPluginHost(props: RightPanelPluginHostProps) {
  const model = buildRightPanelPluginHostModel(props);

  return (
    <div className="panel-stack">
      <RightPanelPluginHostChrome host={props} model={model} />
      <RightPanelPluginHostViews host={props} model={model} />
    </div>
  );
}
