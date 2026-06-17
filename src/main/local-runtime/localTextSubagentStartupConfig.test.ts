import { describe, expect, it } from "vitest";
import { AMBIENT_LOCAL_TEXT_MODEL, resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import { localTextSubagentStartupFeatureFromEnv } from "./localTextSubagentStartupConfig";

describe("local text sub-agent startup config", () => {
  it("stays disabled when no startup descriptor is present", () => {
    expect(localTextSubagentStartupFeatureFromEnv({})).toEqual({ warnings: [] });
  });

  it("does not enable local profiles for partial or invalid descriptors", () => {
    const partial = localTextSubagentStartupFeatureFromEnv({
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND: "/runtime/local-text",
    });
    expect(partial.feature).toBeUndefined();
    expect(partial).toMatchObject({
      warnings: ["AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL is required to enable the startup local text sub-agent runtime."],
    });

    const invalid = localTextSubagentStartupFeatureFromEnv({
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND: "/runtime/local-text",
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL: "http://127.0.0.1:43123/v1/chat/completions",
      AMBIENT_LOCAL_TEXT_SUBAGENT_ARGS_JSON: "serve",
      AMBIENT_LOCAL_TEXT_SUBAGENT_ESTIMATED_RSS_BYTES: "-1",
    });
    expect(invalid.feature).toBeUndefined();
    expect(invalid).toMatchObject({
      warnings: [
        "AMBIENT_LOCAL_TEXT_SUBAGENT_ARGS_JSON must be a JSON array of non-empty strings.",
        "AMBIENT_LOCAL_TEXT_SUBAGENT_ESTIMATED_RSS_BYTES must be a positive integer.",
      ],
    });
  });

  it("builds an available local text profile and runtime descriptor from startup env", () => {
    const result = localTextSubagentStartupFeatureFromEnv({
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMMAND: "/runtime/local-text",
      AMBIENT_LOCAL_TEXT_SUBAGENT_ARGS_JSON: "[\"serve\",\"--model\",\"text.gguf\"]",
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_URL: "http://127.0.0.1:43123/v1/chat/completions",
      AMBIENT_LOCAL_TEXT_SUBAGENT_HEALTH_URL: "http://127.0.0.1:43123/health",
      AMBIENT_LOCAL_TEXT_SUBAGENT_CONTEXT_TOKENS: "8192",
      AMBIENT_LOCAL_TEXT_SUBAGENT_MAX_OUTPUT_TOKENS: "2048",
      AMBIENT_LOCAL_TEXT_SUBAGENT_ESTIMATED_RSS_BYTES: "6442450944",
      AMBIENT_LOCAL_TEXT_SUBAGENT_IDLE_TIMEOUT_MS: "0",
      AMBIENT_LOCAL_TEXT_SUBAGENT_COMPLETION_TIMEOUT_MS: "30000",
      AMBIENT_LOCAL_TEXT_SUBAGENT_MAX_INLINE_CHARS: "512",
    });

    expect(result.warnings).toEqual([]);
    expect(result.feature?.profile).toMatchObject({
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
      providerId: "local",
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
      contextWindowTokens: 8192,
      maxOutputTokens: 2048,
      locality: "local",
      toolUse: "none",
    });
    expect(result.feature?.resolveModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL)).toMatchObject({
      available: true,
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
    });
    expect(result.feature?.resolveModelRuntimeProfile("custom/model")).toMatchObject({
      available: false,
      modelId: "custom/model",
    });
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL).available).toBe(false);

    const mainRuntime = result.feature?.resolveRuntimeForMain({
      thread: {
        id: "parent",
        title: "Parent",
        workspacePath: "/workspace",
      } as any,
      runId: "main-run-1",
      model: result.feature.profile,
      prompt: "Summarize locally.",
    });

    expect(mainRuntime).toMatchObject({
      launch: {
        runtimeId: `local-text:${AMBIENT_LOCAL_TEXT_MODEL}`,
        command: "/runtime/local-text",
        args: ["serve", "--model", "text.gguf"],
        cwd: "/workspace",
        healthUrl: "http://127.0.0.1:43123/health",
        idleTimeoutMs: 0,
        estimatedResidentMemoryBytes: 6442450944,
      },
      completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
      artifactRootPath: "/workspace/.ambient/local-main/main-run-1",
      stateRootPath: "/workspace/.ambient/local-model-runtime",
      timeoutMs: 30000,
      maxInlineChars: 512,
    });

    const launchRuntime = result.feature?.resolveRuntimeForLaunch({
      parentThread: {
        id: "parent",
        title: "Parent",
        workspacePath: "/workspace",
      } as any,
      model: result.feature.profile,
      task: "Summarize locally.",
      role: {} as any,
      dependencyMode: "optional_background",
      forkMode: "no_history",
      promptMode: "fresh",
      canonicalTaskPath: "root/0:summarizer",
      idempotencyKey: "spawn:local",
    });

    expect(launchRuntime).toMatchObject({
      launch: {
        runtimeId: `local-text:${AMBIENT_LOCAL_TEXT_MODEL}`,
        command: "/runtime/local-text",
        args: ["serve", "--model", "text.gguf"],
        cwd: "/workspace",
        healthUrl: "http://127.0.0.1:43123/health",
        idleTimeoutMs: 0,
        estimatedResidentMemoryBytes: 6442450944,
      },
      completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
      artifactRootPath: "/workspace/.ambient/subagents/__scheduler_preflight__",
      stateRootPath: "/workspace/.ambient/local-model-runtime",
    });

    const runtime = result.feature?.resolveRuntime({
      parentThread: {
        id: "parent",
        title: "Parent",
        workspacePath: "/workspace",
      } as any,
      run: {
        id: "run-1",
        childThreadId: "child-1",
      } as any,
      model: result.feature.profile,
      task: "Summarize locally.",
    });

    expect(runtime).toMatchObject({
      launch: {
        runtimeId: `local-text:${AMBIENT_LOCAL_TEXT_MODEL}`,
        command: "/runtime/local-text",
        args: ["serve", "--model", "text.gguf"],
        cwd: "/workspace",
        healthUrl: "http://127.0.0.1:43123/health",
        idleTimeoutMs: 0,
        estimatedResidentMemoryBytes: 6442450944,
      },
      completionUrl: "http://127.0.0.1:43123/v1/chat/completions",
      artifactRootPath: "/workspace/.ambient/subagents/run-1",
      stateRootPath: "/workspace/.ambient/local-model-runtime",
      timeoutMs: 30000,
      maxInlineChars: 512,
    });
  });
});
