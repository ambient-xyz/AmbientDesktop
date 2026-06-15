import { useState } from "react";

import type { FirstPartyGoogleIntegrationState } from "../../shared/types";

export type RightPanelGoogleIntegrationBridge = {
  googleIntegration?: FirstPartyGoogleIntegrationState;
  onGoogleIntegrationChanged: (googleIntegration: FirstPartyGoogleIntegrationState | undefined) => void;
};

export function useRightPanelGoogleIntegrationBridge(): RightPanelGoogleIntegrationBridge {
  const [googleIntegration, setGoogleIntegration] = useState<FirstPartyGoogleIntegrationState | undefined>();
  return {
    googleIntegration,
    onGoogleIntegrationChanged: setGoogleIntegration,
  };
}
