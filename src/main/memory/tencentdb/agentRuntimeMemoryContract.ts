export type { AmbientTencentMemoryLlmDelegate } from "./ambientLlmRunner";
export type {
  AmbientTencentMemoryEmbeddingPrepareInput,
  AmbientTencentMemoryEmbeddingPrepareResult,
  AmbientTencentMemoryEmbeddingStartInput,
  AmbientTencentMemoryEmbeddingStartResult,
} from "./ambientEmbeddingProvider";
export type { TencentMemoryCoreConstructorLoader } from "./optionalCore";

export {
  AMBIENT_MEMORY_EMBEDDING_PROVIDER_ID,
  AMBIENT_MEMORY_EMBEDDING_RUNTIME_ID,
  discoverAmbientMemoryEmbeddingProviders,
  startAmbientMemoryEmbeddingRuntime,
} from "./managedEmbeddingProvider";
export { installAmbientMemoryEmbeddingAssets } from "./managedEmbeddingInstaller";

export interface AgentRuntimeTencentMemoryModules {
  createTencentDbMemoryRuntimeForThread: typeof import("./runtime").createTencentDbMemoryRuntimeForThread;
  createTencentDbMemoryPiExtension: typeof import("./piExtension").createTencentDbMemoryPiExtension;
  createAmbientTencentMemoryPiLlmDelegate: typeof import("./ambientPiLlmDelegate").createAmbientTencentMemoryPiLlmDelegate;
}

export async function loadAgentRuntimeTencentMemoryModules(): Promise<AgentRuntimeTencentMemoryModules> {
  const [
    runtime,
    piExtension,
    piLlmDelegate,
  ] = await Promise.all([
    import("./runtime"),
    import("./piExtension"),
    import("./ambientPiLlmDelegate"),
  ]);
  return {
    createTencentDbMemoryRuntimeForThread: runtime.createTencentDbMemoryRuntimeForThread,
    createTencentDbMemoryPiExtension: piExtension.createTencentDbMemoryPiExtension,
    createAmbientTencentMemoryPiLlmDelegate: piLlmDelegate.createAmbientTencentMemoryPiLlmDelegate,
  };
}
