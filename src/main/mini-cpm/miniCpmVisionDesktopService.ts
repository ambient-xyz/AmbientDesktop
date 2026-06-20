import type {
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
} from "../../shared/localRuntimeTypes";
import {
  analyzeMiniCpmVisionInput as defaultAnalyzeMiniCpmVisionInput,
  setupMiniCpmVisionProvider as defaultSetupMiniCpmVisionProvider,
  type AnalyzeMiniCpmVisionInputOptions,
  type SetupMiniCpmVisionProviderOptions,
} from "./miniCpmVisionProvider";

type MiniCpmVisionDesktopEnvironment = {
  AMBIENT_E2E?: string;
  AMBIENT_E2E_MINICPM_DISABLE_RUNTIME_AUTODETECT?: string;
};

export interface MiniCpmVisionDesktopServiceDependencies {
  activeWorkspacePath(): string;
  env: MiniCpmVisionDesktopEnvironment;
  setupMiniCpmVisionProvider?: (
    workspacePath: string,
    input: MiniCpmVisionSetupInput,
    options?: SetupMiniCpmVisionProviderOptions,
  ) => Promise<MiniCpmVisionSetupResult>;
  analyzeMiniCpmVisionInput?: (
    workspacePath: string,
    input: MiniCpmVisionAnalyzeInput,
    options?: AnalyzeMiniCpmVisionInputOptions,
  ) => Promise<MiniCpmVisionAnalysisResult>;
}

export interface MiniCpmVisionDesktopService {
  setupMiniCpmVision(input: MiniCpmVisionSetupInput, workspacePath?: string): Promise<MiniCpmVisionSetupResult>;
  analyzeMiniCpmVision(input: MiniCpmVisionAnalyzeInput, workspacePath?: string): Promise<MiniCpmVisionAnalysisResult>;
}

export function createMiniCpmVisionDesktopService({
  activeWorkspacePath,
  env,
  setupMiniCpmVisionProvider = defaultSetupMiniCpmVisionProvider,
  analyzeMiniCpmVisionInput = defaultAnalyzeMiniCpmVisionInput,
}: MiniCpmVisionDesktopServiceDependencies): MiniCpmVisionDesktopService {
  function providerOptions(): Pick<SetupMiniCpmVisionProviderOptions, "disableRuntimeAutoDetect"> {
    if (env.AMBIENT_E2E !== "1") return {};
    return {
      disableRuntimeAutoDetect: env.AMBIENT_E2E_MINICPM_DISABLE_RUNTIME_AUTODETECT === "1",
    };
  }

  function targetWorkspacePath(workspacePath: string | undefined): string {
    return workspacePath ?? activeWorkspacePath();
  }

  async function setupMiniCpmVision(
    input: MiniCpmVisionSetupInput,
    workspacePath?: string,
  ): Promise<MiniCpmVisionSetupResult> {
    return setupMiniCpmVisionProvider(targetWorkspacePath(workspacePath), input, providerOptions());
  }

  async function analyzeMiniCpmVision(
    input: MiniCpmVisionAnalyzeInput,
    workspacePath?: string,
  ): Promise<MiniCpmVisionAnalysisResult> {
    return analyzeMiniCpmVisionInput(targetWorkspacePath(workspacePath), input, providerOptions());
  }

  return {
    setupMiniCpmVision,
    analyzeMiniCpmVision,
  };
}
