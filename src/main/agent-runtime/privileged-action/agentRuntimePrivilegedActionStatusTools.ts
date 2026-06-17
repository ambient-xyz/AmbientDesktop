import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PrivilegedActionAdapterStatus } from "../../../shared/types";
import { privilegedActionToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import { privilegedActionAdapterStatusText } from "../../privileged-action/privilegedAction";

export interface PrivilegedActionStatusToolRegistrationOptions {
  adapterStatus: () => PrivilegedActionAdapterStatus;
}

export function registerPrivilegedActionStatusTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PrivilegedActionStatusToolRegistrationOptions,
): void {
  registerDesktopTool(pi, privilegedActionToolDescriptor("ambient_privileged_action_status"), {
    executionMode: "sequential",
    execute: async () => {
      const adapterStatus = options.adapterStatus();
      return {
        content: [{ type: "text", text: privilegedActionAdapterStatusText(adapterStatus) }],
        details: {
          runtime: "privileged-action",
          toolName: "ambient_privileged_action_status",
          status: "complete",
          adapterStatus,
        },
      };
    },
  });
}
