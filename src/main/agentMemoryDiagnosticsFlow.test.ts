import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "src/main/index.ts"), "utf8");
const settingsRuntimeSource = readFileSync(join(process.cwd(), "src/main/settings/settingsRuntimeService.ts"), "utf8");
const agentMemoryDesktopSource = readFileSync(join(process.cwd(), "src/main/memory/agentMemoryDesktopService.ts"), "utf8");
const inspectedSource = `${mainSource}\n${settingsRuntimeSource}\n${agentMemoryDesktopSource}`;

describe("Agent Memory diagnostics flow", () => {
  it("does not double-run live embedding checks for manual lifecycle checks", () => {
    expect(inspectedSource).toContain("options: { liveEmbeddingCheck?: boolean } = {}");
    expect(inspectedSource).toContain('if (options.liveEmbeddingCheck === false) return diagnostics;');
    expect(inspectedSource).toContain('getAgentMemoryDiagnostics(host, { liveEmbeddingCheck: input.action !== "check" })');
    expect(inspectedSource).not.toContain("!diagnostics.embedding.enabled");
    expect(inspectedSource).toContain("const starterStatus = await readAgentMemoryStarterStatus(host, undefined, updatedDiagnostics)");
    expect(inspectedSource).toContain("const memoryBeforeEnable = host.store.getMemorySettings()");
    expect(inspectedSource).toContain('enableNewThreadsDefault: operation === "enable" && memoryBeforeEnable.mode === "disabled" ? true : undefined');
    expect(inspectedSource).toContain('modeDefault: operation === "repair"');
    expect(inspectedSource).toContain('const embedding = input.action === "check"');
    expect(inspectedSource).toContain('agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, "check")');
    expect(inspectedSource).toContain("agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, input.action)");
    expect(inspectedSource).toContain("mergeAgentMemoryEmbeddingLiveDiagnostics(diagnostics.embedding, lifecycleEmbedding)");
    expect(inspectedSource).toContain("shouldStartManagedEmbeddingsAfterSettingsUpdate(previous, next)");
    expect(inspectedSource).toContain("agentMemoryManagedEmbeddingAutoStartEnabled(targetStore)");
    expect(inspectedSource).toContain("defaultManagedEmbeddingAutoStartEnabled(previous, targetStore)");
    expect(inspectedSource).toContain("defaultManagedEmbeddingAutoStartEnabled(next, targetStore)");
    expect(inspectedSource).toContain("if (!agentMemoryModeAllowsManagedRuntime(next) || !next.embeddings.enabled || (previousDefaultAutoStart && !nextDefaultAutoStart))");
    expect(inspectedSource).toContain("const previousFeatureEnabled = isAmbientTencentDbMemoryEnabled(dependencies.currentFeatureFlagSnapshot(targetStore))");
    expect(inspectedSource).toContain("const nextFeatureEnabled = isAmbientTencentDbMemoryEnabled(dependencies.currentFeatureFlagSnapshot(targetStore))");
    expect(inspectedSource).toContain("defaultManagedEmbeddingAutoStartEnabledForFeature(memorySettings, nextFeatureEnabled)");
    expect(inspectedSource).toContain("agentMemoryUsesDefaultManagedEmbeddingProvider(settings)");
    expect(inspectedSource).toContain("AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID");
    expect(inspectedSource).toContain("startManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore)");
    expect(inspectedSource).toContain("stopManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore)");
    expect(inspectedSource).toContain("activeAgentMemoryEmbeddingLifecycleOperations");
    expect(inspectedSource).toContain('enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-start"');
    expect(inspectedSource).toContain('enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-stop"');
    expect(inspectedSource).toContain("runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: \"start\" }, host)");
    expect(inspectedSource).toContain("runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: \"stop\" }, host)");
    expect(inspectedSource).toContain("return enqueueAgentMemoryEmbeddingLifecycleOperation(host, host.store, input.action, () =>");
    expect(inspectedSource).toContain("if (host.disposed)");
    expect(inspectedSource).toContain("releaseAgentMemoryEmbeddingLifecycleLease(lifecycle, \"project runtime host disposed before lifecycle completion\")");
    expect(inspectedSource).toContain("{ runManagedEmbeddingLifecycle: false, startManagedEmbeddings: false }");
    expect(inspectedSource).toContain("agentMemoryStarterDisableMemoryPatch(), host, { runManagedEmbeddingLifecycle: false }");
    expect(inspectedSource).toContain("updateFeatureFlagSettings({ tencentDbMemory: true }, host, { runManagedEmbeddingLifecycle: false })");
  });
});
