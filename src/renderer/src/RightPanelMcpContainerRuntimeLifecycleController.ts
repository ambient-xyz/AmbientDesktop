import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  AmbientMcpContainerRuntimeLifecycleAction,
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeStatus,
} from "../../shared/pluginTypes";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export type RightPanelMcpContainerRuntimeLifecycleControllerInput = {
  workspacePath: string;
  containerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  setContainerRuntimeStatus: Dispatch<SetStateAction<AmbientMcpContainerRuntimeStatus | undefined>>;
  setContainerRuntimeActionStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  setServerStatus: Dispatch<SetStateAction<ApiKeyStatus | undefined>>;
  refreshContainerRuntimeStatus: (openWhenNeedsAction?: boolean, options?: { continueDefaultCapabilitySetup?: boolean }) => Promise<void>;
};

export function useRightPanelMcpContainerRuntimeLifecycleController({
  workspacePath,
  containerRuntimeStatus,
  setContainerRuntimeStatus,
  setContainerRuntimeActionStatus,
  setServerStatus,
  refreshContainerRuntimeStatus,
}: RightPanelMcpContainerRuntimeLifecycleControllerInput) {
  const [containerRuntimeLifecyclePreview, setContainerRuntimeLifecyclePreview] = useState<
    AmbientMcpContainerRuntimeLifecyclePreview | undefined
  >();
  const [containerRuntimeLifecycleResult, setContainerRuntimeLifecycleResult] = useState<
    AmbientMcpContainerRuntimeLifecycleResult | undefined
  >();
  const [containerRuntimeLifecycleProgress, setContainerRuntimeLifecycleProgress] = useState<AmbientMcpContainerRuntimeLifecycleProgress[]>(
    [],
  );
  const [containerRuntimeLifecycleBusyKey, setContainerRuntimeLifecycleBusyKey] = useState<string | undefined>();
  const [containerRuntimeLifecycleError, setContainerRuntimeLifecycleError] = useState<string | undefined>();

  async function previewContainerRuntimeLifecycle(action: AmbientMcpContainerRuntimeLifecycleAction) {
    const busyKey = `preview:${action}`;
    setContainerRuntimeLifecycleBusyKey(busyKey);
    setContainerRuntimeLifecycleError(undefined);
    setContainerRuntimeLifecycleResult(undefined);
    setContainerRuntimeLifecycleProgress([]);
    setContainerRuntimeActionStatus(undefined);
    try {
      const preview = await window.ambientDesktop.previewMcpContainerRuntimeLifecycle({
        action,
        runtime: containerRuntimeRuntimeOption(containerRuntimeStatus),
      });
      setContainerRuntimeLifecyclePreview(preview);
      const actionStatus = containerRuntimeLifecyclePreviewStatus(preview);
      setContainerRuntimeActionStatus(actionStatus);
      setServerStatus(actionStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setContainerRuntimeLifecycleError(message);
      setContainerRuntimeActionStatus({ kind: "error", message });
    } finally {
      setContainerRuntimeLifecycleBusyKey((current) => (current === busyKey ? undefined : current));
    }
  }

  async function runContainerRuntimeLifecycle(action: AmbientMcpContainerRuntimeLifecycleAction) {
    const busyKey = `run:${action}`;
    const matchingPreview = containerRuntimeLifecyclePreview?.action === action ? containerRuntimeLifecyclePreview : undefined;
    setContainerRuntimeLifecycleBusyKey(busyKey);
    setContainerRuntimeLifecycleError(undefined);
    setContainerRuntimeLifecycleResult(undefined);
    setContainerRuntimeLifecycleProgress([]);
    setContainerRuntimeActionStatus({ kind: "info", message: "Running container runtime recovery." });
    try {
      const result = await window.ambientDesktop.runMcpContainerRuntimeLifecycle({
        action,
        runtime: matchingPreview?.runtime ?? containerRuntimeRuntimeOption(containerRuntimeStatus),
        expectedPreviewId: matchingPreview?.previewId,
        confirmForce: action === "force-quit-and-restart",
      });
      setContainerRuntimeLifecyclePreview(result.preview ?? matchingPreview);
      setContainerRuntimeLifecycleResult(result);
      setContainerRuntimeLifecycleProgress(result.progress);
      const actionStatus = containerRuntimeLifecycleResultStatus(result);
      setContainerRuntimeActionStatus(actionStatus);
      setServerStatus(actionStatus);
      if (result.after) setContainerRuntimeStatus(result.after);
      if (result.status === "ready") {
        await refreshContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setContainerRuntimeLifecycleError(message);
      setContainerRuntimeActionStatus({ kind: "error", message });
    } finally {
      setContainerRuntimeLifecycleBusyKey((current) => (current === busyKey ? undefined : current));
    }
  }

  useEffect(() => {
    return window.ambientDesktop.onEvent((event) => {
      if (event.type !== "mcp-container-runtime-lifecycle-progress") return;
      if (event.workspacePath && event.workspacePath !== workspacePath) return;
      setContainerRuntimeLifecycleProgress((current) => [...current.slice(-11), event.progress]);
      setContainerRuntimeActionStatus(containerRuntimeLifecycleProgressStatus(event.progress));
    });
  }, [workspacePath, setContainerRuntimeActionStatus]);

  return {
    containerRuntimeLifecyclePreview,
    containerRuntimeLifecycleResult,
    containerRuntimeLifecycleProgress,
    containerRuntimeLifecycleBusyKey,
    containerRuntimeLifecycleError,
    previewContainerRuntimeLifecycle,
    runContainerRuntimeLifecycle,
  };
}

export type RightPanelMcpContainerRuntimeLifecycleController = ReturnType<typeof useRightPanelMcpContainerRuntimeLifecycleController>;

export function containerRuntimeRuntimeOption(status?: AmbientMcpContainerRuntimeStatus) {
  return status?.runtime === "docker" || status?.runtime === "podman" || status?.runtime === "colima" ? status.runtime : undefined;
}

export function containerRuntimeLifecyclePreviewStatus(preview: AmbientMcpContainerRuntimeLifecyclePreview): ApiKeyStatus {
  return {
    kind: preview.status === "blocked" ? "error" : "info",
    message: preview.summary,
  };
}

export function containerRuntimeLifecycleResultStatus(result: AmbientMcpContainerRuntimeLifecycleResult): ApiKeyStatus {
  return {
    kind: result.status === "ready" || result.status === "running" ? "success" : "error",
    message: result.message,
  };
}

export function containerRuntimeLifecycleProgressStatus(progress: AmbientMcpContainerRuntimeLifecycleProgress): ApiKeyStatus {
  return {
    kind: progress.status === "failed" ? "error" : progress.status === "succeeded" ? "success" : "info",
    message: progress.message,
  };
}
