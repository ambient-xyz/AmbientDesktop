import { useState } from "react";

import type { CodexPluginMcpInspectionCatalog, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";

export function useRightPanelMcpPluginRuntimeController() {
  const [inspection, setInspection] = useState<CodexPluginMcpInspectionCatalog | undefined>();
  const [runtimeSnapshots, setRuntimeSnapshots] = useState<PluginMcpRuntimeSnapshot[]>([]);
  const [inspectionError, setInspectionError] = useState<string | undefined>();
  const [runtimeBusy, setRuntimeBusy] = useState<string | undefined>();
  const [inspecting, setInspecting] = useState(false);

  function prepareCatalogLoad() {
    setInspection(undefined);
    setInspectionError(undefined);
  }

  function clearInspection() {
    setInspection(undefined);
    setRuntimeSnapshots([]);
    setInspectionError(undefined);
  }

  function clearRuntimeSnapshots() {
    setRuntimeSnapshots([]);
  }

  async function inspectPluginMcp() {
    setInspectionError(undefined);
    setInspecting(true);
    try {
      setInspection(await window.ambientDesktop.inspectCodexPluginMcp());
      setRuntimeSnapshots(await window.ambientDesktop.listPluginMcpRuntimeSnapshots());
    } catch (error) {
      setInspection(undefined);
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setInspecting(false);
    }
  }

  async function restartPluginMcpRuntime(key: string) {
    setInspectionError(undefined);
    setRuntimeBusy(`restart:${key}`);
    try {
      setRuntimeSnapshots(await window.ambientDesktop.restartPluginMcpRuntime({ key }));
    } catch (error) {
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeBusy(undefined);
    }
  }

  async function stopPluginMcpRuntime(key: string) {
    setInspectionError(undefined);
    setRuntimeBusy(`stop:${key}`);
    try {
      setRuntimeSnapshots(await window.ambientDesktop.stopPluginMcpRuntime({ key }));
    } catch (error) {
      setInspectionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeBusy(undefined);
    }
  }

  return {
    inspection,
    runtimeSnapshots,
    inspectionError,
    runtimeBusy,
    inspecting,
    prepareCatalogLoad,
    clearInspection,
    clearRuntimeSnapshots,
    setRuntimeSnapshots,
    inspectPluginMcp,
    restartPluginMcpRuntime,
    stopPluginMcpRuntime,
  };
}

export type RightPanelMcpPluginRuntimeController = ReturnType<typeof useRightPanelMcpPluginRuntimeController>;
