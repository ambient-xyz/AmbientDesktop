import type { ReactNode } from "react";

import { InfoTooltip } from "./RightPanel";

export function AutomationHeadingLabel({ children, tooltip }: { children: ReactNode; tooltip: string }) {
  return (
    <span className="heading-with-info">
      <strong title={tooltip}>{children}</strong>
      <InfoTooltip text={tooltip} className="heading-info-tooltip" />
    </span>
  );
}
