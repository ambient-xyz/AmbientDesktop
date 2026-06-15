declare module "node-llama-cpp" {
  export function getLlama(opts: { logLevel: number }): Promise<unknown>;
  export function resolveModelFile(model: string, cacheDir?: string): Promise<string>;
  export const LlamaLogLevel: { error: number };
}

declare module "openclaw/plugin-sdk/core" {
  export interface OpenClawPluginApi {
    runtime: {
      agent: {
        runEmbeddedPiAgent: (...args: any[]) => Promise<any>;
      };
    };
    [key: string]: unknown;
  }
}
