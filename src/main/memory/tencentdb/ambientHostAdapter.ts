import type {
  TencentMemoryHostAdapter,
  TencentMemoryLlmRunnerFactory,
  TencentMemoryLogger,
  TencentMemoryRuntimeContext,
} from "./upstreamContracts";

export interface AmbientTencentMemoryHostAdapterOptions {
  threadId: string;
  workspacePath: string;
  dataDir: string;
  logger: TencentMemoryLogger;
  llmRunnerFactory: TencentMemoryLlmRunnerFactory;
  userId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentIdentity?: string;
}

export class AmbientTencentMemoryHostAdapter implements TencentMemoryHostAdapter {
  readonly hostType = "standalone" as const;
  private readonly runtimeContext: TencentMemoryRuntimeContext;

  constructor(private readonly options: AmbientTencentMemoryHostAdapterOptions) {
    this.runtimeContext = {
      userId: options.userId ?? "ambient-desktop-user",
      sessionId: options.sessionId ?? options.threadId,
      sessionKey: options.sessionKey ?? `ambient-thread:${options.threadId}`,
      platform: "ambient-desktop",
      agentIdentity: options.agentIdentity,
      agentContext: "primary",
      workspaceDir: options.workspacePath,
      dataDir: options.dataDir,
    };
  }

  getRuntimeContext(): TencentMemoryRuntimeContext {
    return this.runtimeContext;
  }

  getLogger(): TencentMemoryLogger {
    return this.options.logger;
  }

  getLLMRunnerFactory(): TencentMemoryLlmRunnerFactory {
    return this.options.llmRunnerFactory;
  }
}
