import type {
  TencentMemoryCompletedTurn,
  TencentMemoryConfig,
  TencentMemoryCore,
  TencentMemoryCoreConstructor,
  TencentMemoryHostAdapter,
} from "./upstreamContracts";

export interface CreateTencentMemoryCoreSpikeInput {
  Core: TencentMemoryCoreConstructor;
  hostAdapter: TencentMemoryHostAdapter;
  config: TencentMemoryConfig;
  instanceId?: string;
}

export async function createTencentMemoryCoreForPhase0Spike(
  input: CreateTencentMemoryCoreSpikeInput,
): Promise<TencentMemoryCore> {
  const core = new input.Core({
    hostAdapter: input.hostAdapter,
    config: input.config,
    instanceId: input.instanceId,
  });
  await core.initialize();
  return core;
}

export async function exerciseTencentMemoryCoreForPhase0(
  core: TencentMemoryCore,
  turn: TencentMemoryCompletedTurn,
): Promise<{
  recallPrependContext?: string;
  captureRecordedCount: number;
  memorySearchTotal: number;
  conversationSearchTotal: number;
}> {
  const recall = await core.handleBeforeRecall(turn.userText, turn.sessionKey);
  const capture = await core.handleTurnCommitted(turn);
  const memorySearch = await core.searchMemories({ query: turn.userText, limit: 3 });
  const conversationSearch = await core.searchConversations({
    query: turn.userText,
    limit: 3,
    sessionKey: turn.sessionKey,
  });

  return {
    recallPrependContext: recall.prependContext,
    captureRecordedCount: capture.l0RecordedCount,
    memorySearchTotal: memorySearch.total,
    conversationSearchTotal: conversationSearch.total,
  };
}
