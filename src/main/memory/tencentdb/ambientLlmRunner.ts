import type {
  TencentMemoryLlmRunParams,
  TencentMemoryLlmRunner,
  TencentMemoryLlmRunnerCreateOptions,
  TencentMemoryLlmRunnerFactory,
} from "./upstreamContracts";

export interface AmbientTencentMemoryLlmRequest extends TencentMemoryLlmRunParams {
  origin: "tencentdb-agent-memory";
  modelRef?: string;
  enableTools: boolean;
  workspaceDir: string;
}

export type AmbientTencentMemoryLlmDelegate = (
  request: AmbientTencentMemoryLlmRequest,
) => Promise<string>;

export interface AmbientTencentMemoryLlmRunnerFactoryOptions {
  workspaceDir: string;
  defaultModelRef?: string;
  runWithAmbientPi: AmbientTencentMemoryLlmDelegate;
}

export class AmbientTencentMemoryLlmRunnerFactory implements TencentMemoryLlmRunnerFactory {
  constructor(private readonly options: AmbientTencentMemoryLlmRunnerFactoryOptions) {}

  createRunner(opts: TencentMemoryLlmRunnerCreateOptions = {}): TencentMemoryLlmRunner {
    const modelRef = opts.modelRef ?? this.options.defaultModelRef;
    const enableTools = opts.enableTools === true;
    return {
      run: (params) => this.options.runWithAmbientPi({
        ...params,
        origin: "tencentdb-agent-memory",
        modelRef,
        enableTools,
        workspaceDir: params.workspaceDir ?? this.options.workspaceDir,
      }),
    };
  }
}
