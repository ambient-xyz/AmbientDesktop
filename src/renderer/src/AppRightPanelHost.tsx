import type { MouseEvent as ReactMouseEvent } from "react";

import { RightPanel, type RightPanelProps, type UtilityPanel } from "./RightPanel";

type AppRightPanelHostProps = Omit<RightPanelProps, "panel"> & {
  panel?: UtilityPanel;
  onBeginResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function AppRightPanelHost({ panel, onBeginResize, ...rightPanelProps }: AppRightPanelHostProps) {
  if (!panel) return null;

  return (
    <>
      <div className="right-panel-resize-handle" role="separator" aria-orientation="vertical" onMouseDown={onBeginResize} />
      <RightPanel {...rightPanelProps} panel={panel} />
    </>
  );
}
