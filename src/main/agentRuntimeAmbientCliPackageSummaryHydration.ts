import type { Model } from "@mariozechner/pi-ai";

import type { WorkspaceState } from "../shared/types";
import {
  hydrateAmbientCliPackageSummaries,
  type AmbientCliPackageSummaryHydrationResult,
} from "./ambientCliPackages";
import { completeAmbientText } from "./lambdaRlm";

type AmbientCliSummaryHydrationEnv = Partial<Pick<
  NodeJS.ProcessEnv,
  "AMBIENT_CLI_RLM_SUMMARIES" | "AMBIENT_CLI_RLM_SUMMARY_TIMEOUT_MS"
>>;

export interface AgentRuntimeAmbientCliPackageSummaryHydrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  model: Model<"openai-completions">;
  apiKey?: string;
  packageId: string;
  env?: AmbientCliSummaryHydrationEnv;
  hydrateSummaries?: typeof hydrateAmbientCliPackageSummaries;
  completeText?: typeof completeAmbientText;
}

export interface AgentRuntimeAmbientCliPackageSummaryModelCompleteOptions {
  model: Model<"openai-completions">;
  apiKey?: string;
  env?: AmbientCliSummaryHydrationEnv;
  completeText?: typeof completeAmbientText;
}

export function createAmbientCliPackageSummaryModelComplete(
  options: AgentRuntimeAmbientCliPackageSummaryModelCompleteOptions,
): ((prompt: string, signal?: AbortSignal) => Promise<string>) | undefined {
  const apiKey = options.apiKey;
  if (!apiKey) return undefined;
  const env = options.env ?? process.env;
  const completeText = options.completeText ?? completeAmbientText;
  return (prompt, signal) =>
    completeText(options.model, prompt, {
      apiKey,
      signal,
      timeoutMs: Number(env.AMBIENT_CLI_RLM_SUMMARY_TIMEOUT_MS ?? 120_000),
    });
}

export async function hydrateFirstPartyAmbientCliPackageSummaries(
  options: AgentRuntimeAmbientCliPackageSummaryHydrationOptions,
): Promise<AmbientCliPackageSummaryHydrationResult | undefined> {
  const env = options.env ?? process.env;
  if (env.AMBIENT_CLI_RLM_SUMMARIES !== "1") return undefined;

  const hydrateSummaries = options.hydrateSummaries ?? hydrateAmbientCliPackageSummaries;
  const selector = { packageId: options.packageId };
  const apiKey = options.apiKey;
  if (!apiKey) {
    return hydrateSummaries(options.workspace.path, selector, {
      generateMissingSummaries: true,
    });
  }

  const modelComplete = createAmbientCliPackageSummaryModelComplete({
    model: options.model,
    apiKey,
    env,
    completeText: options.completeText,
  });
  if (!modelComplete) {
    return hydrateSummaries(options.workspace.path, selector, {
      generateMissingSummaries: true,
    });
  }
  return hydrateSummaries(options.workspace.path, selector, {
    generateMissingSummaries: true,
    modelComplete,
  });
}
