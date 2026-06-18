import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "./agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "./agentRuntimeDesktopToolFacade";
import {
  runtimeSurfaceSnapshotText,
  type RuntimeSurfaceSnapshot,
} from "../../shared/runtimeSurfaceSnapshot";

export interface RuntimeSurfaceToolRegistrationOptions {
  runtimeSurfaceSnapshot: (limit?: number) => RuntimeSurfaceSnapshot;
}

export function registerRuntimeSurfaceTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: RuntimeSurfaceToolRegistrationOptions,
): void {
  const { runtimeSurfaceSnapshot } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_runtime_surface_snapshot"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const limit = typeof (params as { limit?: unknown })?.limit === "number" ? (params as { limit: number }).limit : undefined;
      const snapshot = runtimeSurfaceSnapshot(limit);
      return {
        content: [{ type: "text", text: runtimeSurfaceSnapshotText(snapshot) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_runtime_surface_snapshot",
          status: "complete",
          snapshot,
        },
      };
    },
  });
}
