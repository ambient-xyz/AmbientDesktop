import { describe, expect, it } from "vitest";
import { buildSafeProcessEnv, isSecretEnvName } from "./safeProcessEnv";

describe("buildSafeProcessEnv", () => {
  it("copies only allowlisted inherited env and non-secret explicit env", () => {
    const env = buildSafeProcessEnv(
      {
        PATH: "/usr/bin",
        HOME: "/Users/tester",
        SHELL: "/bin/zsh",
        AMBIENT_API_KEY: "ambient-secret",
        OPENAI_API_KEY: "provider-secret",
        UNRELATED_BASE: "drop-me",
      },
      {
        SAFE_FLAG: "1",
        CUSTOM_CONFIG_PATH: "/tmp/config.json",
        GIT_TERMINAL_PROMPT: "0",
        PACKAGE_TOKEN: "token-secret",
        PASSWORD: "password-secret",
      },
    );

    expect(env).toMatchObject({
      PATH: "/usr/bin",
      HOME: "/Users/tester",
      SHELL: "/bin/zsh",
      SAFE_FLAG: "1",
      CUSTOM_CONFIG_PATH: "/tmp/config.json",
      GIT_TERMINAL_PROMPT: "0",
    });
    expect(env.AMBIENT_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.UNRELATED_BASE).toBeUndefined();
    expect(env.PACKAGE_TOKEN).toBeUndefined();
    expect(env.PASSWORD).toBeUndefined();
  });
});

describe("isSecretEnvName", () => {
  it("detects common secret-bearing env names without matching unrelated words", () => {
    expect(isSecretEnvName("AMBIENT_API_KEY")).toBe(true);
    expect(isSecretEnvName("AMBIENT_AGENT_AMBIENT_API_KEY")).toBe(true);
    expect(isSecretEnvName("OPENAI_API_KEY")).toBe(true);
    expect(isSecretEnvName("GITHUB_TOKEN")).toBe(true);
    expect(isSecretEnvName("TOKENIZERS_PARALLELISM")).toBe(false);
    expect(isSecretEnvName("PATH")).toBe(false);
  });
});
