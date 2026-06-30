import { browserPickReferenceText } from "./RightPanelBrowserReferenceText";
import {
  RightPanelBrowserFocusedView,
  RightPanelBrowserStandardView,
} from "./RightPanelBrowserPaneViews";
import type { RightPanelBrowserPaneViewProps } from "./RightPanelBrowserTypes";

export { browserPickReferenceText };

type RightPanelBrowserPaneProps = RightPanelBrowserPaneViewProps & {
  browserFocused: boolean;
};

export function RightPanelBrowserPane({ browserFocused, ...viewProps }: RightPanelBrowserPaneProps) {
  if (browserFocused && viewProps.browserState) {
    return <RightPanelBrowserFocusedView {...viewProps} browserState={viewProps.browserState} />;
  }

  return <RightPanelBrowserStandardView {...viewProps} />;
}
