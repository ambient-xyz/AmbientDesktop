import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(join(process.cwd(), "src/main/index.ts"), "utf8");

describe("Agent Memory diagnostics flow", () => {
  it("does not double-run live embedding checks for manual lifecycle checks", () => {
    expect(mainSource).toContain("options: { liveEmbeddingCheck?: boolean } = {}");
    expect(mainSource).toContain('if (options.liveEmbeddingCheck === false) return diagnostics;');
    expect(mainSource).toContain('getAgentMemoryDiagnostics(host, { liveEmbeddingCheck: input.action !== "check" })');
    expect(mainSource).not.toContain("!diagnostics.embedding.enabled");
    expect(mainSource).toContain("const starterStatus = await readAgentMemoryStarterStatus(host, undefined, updatedDiagnostics)");
    expect(mainSource).toContain("const memoryBeforeEnable = host.store.getMemorySettings()");
    expect(mainSource).toContain('enableNewThreadsDefault: operation === "enable" && !memoryBeforeEnable.enabled ? true : undefined');
    expect(mainSource).toContain('const embedding = input.action === "check"');
    expect(mainSource).toContain('agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, "check")');
    expect(mainSource).toContain("agentMemoryEmbeddingDiagnosticsFromLifecycle(settings, lifecycle, input.action)");
    expect(mainSource).toContain("mergeAgentMemoryEmbeddingLiveDiagnostics(diagnostics.embedding, lifecycleEmbedding)");
    expect(mainSource).toContain("shouldStartAgentMemoryManagedEmbeddingsAfterSettingsUpdate(previous, next)");
    expect(mainSource).toContain("agentMemoryManagedEmbeddingAutoStartEnabled(targetStore)");
    expect(mainSource).toContain("const previousDefaultAutoStart = agentMemoryDefaultManagedEmbeddingAutoStartEnabled(previous, targetStore)");
    expect(mainSource).toContain("const nextDefaultAutoStart = agentMemoryDefaultManagedEmbeddingAutoStartEnabled(next, targetStore)");
    expect(mainSource).toContain("if (!next.enabled || !next.embeddings.enabled || (previousDefaultAutoStart && !nextDefaultAutoStart))");
    expect(mainSource).toContain("const previousFeatureEnabled = isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(targetStore))");
    expect(mainSource).toContain("const nextFeatureEnabled = isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(targetStore))");
    expect(mainSource).toContain("agentMemoryDefaultManagedEmbeddingAutoStartEnabledForFeature(memorySettings, nextFeatureEnabled)");
    expect(mainSource).toContain("agentMemoryUsesDefaultManagedEmbeddingProvider(settings)");
    expect(mainSource).toContain("AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID");
    expect(mainSource).toContain("isAmbientTencentDbMemoryEnabled(currentFeatureFlagSnapshot(targetStore))");
    expect(mainSource).toContain("startAgentMemoryManagedEmbeddingsAfterSettingsUpdate(host, targetStore)");
    expect(mainSource).toContain("stopAgentMemoryManagedEmbeddingsAfterSettingsUpdate(host, targetStore)");
    expect(mainSource).toContain("activeAgentMemoryEmbeddingLifecycleOperations");
    expect(mainSource).toContain('enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-start"');
    expect(mainSource).toContain('enqueueAgentMemoryEmbeddingLifecycleBackgroundOperation(host, targetStore, "settings-stop"');
    expect(mainSource).toContain("runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: \"start\" }, host)");
    expect(mainSource).toContain("runAgentMemoryEmbeddingLifecycleActionWithoutQueue({ action: \"stop\" }, host)");
    expect(mainSource).toContain("return enqueueAgentMemoryEmbeddingLifecycleOperation(host, host.store, input.action, () =>");
    expect(mainSource).toContain("host.disposed = true");
    expect(mainSource).toContain("releaseAgentMemoryEmbeddingLifecycleLease(lifecycle, \"project runtime host disposed before lifecycle completion\")");
    expect(mainSource).toContain("{ runManagedEmbeddingLifecycle: false, startManagedEmbeddings: false }");
    expect(mainSource).toContain("agentMemoryStarterDisableMemoryPatch(), host, { runManagedEmbeddingLifecycle: false }");
    expect(mainSource).toContain("updateFeatureFlagSettings({ tencentDbMemory: true }, host, { runManagedEmbeddingLifecycle: false })");
  });
});
