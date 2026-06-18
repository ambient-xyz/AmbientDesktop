import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { ambientRuntimeEnv, ambientRuntimePath } from "./runtimePath";

describe("ambientRuntimePath", () => {
  it("preserves caller PATH entries before runtime additions", () => {
    const path = ambientRuntimePath({ PATH: ["/custom/bin", "/usr/bin"].join(delimiter) });
    expect(path.split(delimiter).slice(0, 2)).toEqual(["/custom/bin", "/usr/bin"]);
  });
});

describe("ambientRuntimeEnv", () => {
  it("filters inherited and explicit secrets while preserving runtime metadata", () => {
    const env = ambientRuntimeEnv(
      {
        PATH: "/usr/bin",
        HOME: "/Users/tester",
        AMBIENT_API_KEY: "ambient-secret",
        OPENAI_API_KEY: "provider-secret",
        UNRELATED_BASE: "drop-me",
      },
      {
        GIT_TERMINAL_PROMPT: "0",
        SAFE_FLAG: "1",
        PACKAGE_TOKEN: "token-secret",
      },
    );

    expect(env.PATH).toContain("/usr/bin");
    expect(env.HOME).toBe("/Users/tester");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.SAFE_FLAG).toBe("1");
    expect(env.AMBIENT_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.UNRELATED_BASE).toBeUndefined();
    expect(env.PACKAGE_TOKEN).toBeUndefined();
  });
});
