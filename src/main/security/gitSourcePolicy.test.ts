import { describe, expect, it } from "vitest";
import {
  hardenedGitEnv,
  normalizeGitRepositoryUrl,
  redactGitSourceCredentials,
  safeGitCloneSource,
  validateGitSource,
} from "./gitSourcePolicy";

describe("gitSourcePolicy", () => {
  it("allows explicit safe Git source shapes", () => {
    expect(validateGitSource("https://github.com/ambient/desktop.git")).toMatchObject({
      cloneSource: "https://github.com/ambient/desktop.git",
      kind: "remote",
    });
    expect(validateGitSource("git+https://github.com/ambient/desktop.git")).toMatchObject({
      cloneSource: "https://github.com/ambient/desktop.git",
      kind: "remote",
    });
    expect(validateGitSource("git://github.com/ambient/desktop.git")).toMatchObject({
      cloneSource: "https://github.com/ambient/desktop.git",
      kind: "remote",
    });
    expect(validateGitSource("git@github.com:ambient/desktop.git")).toMatchObject({
      cloneSource: "git@github.com:ambient/desktop.git",
      kind: "remote",
    });
    expect(validateGitSource("ssh://git@example.test/ambient/desktop.git")).toMatchObject({
      cloneSource: "ssh://git@example.test/ambient/desktop.git",
      kind: "remote",
    });
    expect(validateGitSource("/tmp/local-repo")).toMatchObject({
      kind: "local",
    });
    expect(validateGitSource("file:///tmp/local-repo")).toMatchObject({
      cloneSource: "/tmp/local-repo",
      kind: "local",
    });
  });

  it("rejects external helper and unsupported Git source shapes", () => {
    expect(() => safeGitCloneSource("ext::sh -c touch /tmp/ambient-owned")).toThrow(/external Git helper protocols are not allowed/i);
    expect(() => safeGitCloneSource("git+ext::sh -c touch /tmp/ambient-owned")).toThrow(/external Git helper protocols are not allowed/i);
    expect(() => safeGitCloneSource("git-remote-ext::sh -c touch /tmp/ambient-owned")).toThrow(
      /external Git helper protocols are not allowed/i,
    );
    expect(() => safeGitCloneSource("http://example.test/repo.git")).toThrow(/Unsupported Git source/i);
    expect(() => safeGitCloneSource("https://user:secret@example.test/repo.git")).toThrow(/must not embed credentials/i);
    expect(() => safeGitCloneSource("ssh://git:secret@example.test/repo.git")).toThrow(/must not embed passwords or tokens/i);
    expect(() => safeGitCloneSource("https://example.test/repo.git?token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("https://example.test/repo.git#access_token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("file:///tmp/repo.git?token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("file:///tmp/repo.git#access_token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("ssh://git@-oProxyCommand=touch/repo.git")).toThrow(/user and host must not start with '-'/i);
    expect(() => safeGitCloneSource("ssh://-oProxyCommand=touch@example.test/repo.git")).toThrow(/user and host must not start with '-'/i);
    expect(() => safeGitCloneSource("git@-oProxyCommandtouch:repo.git")).toThrow(/user and host must not start with '-'/i);
    expect(() => safeGitCloneSource("-oProxyCommandtouch@example.test:repo.git")).toThrow(/must not start with '-'/i);
    expect(() => safeGitCloneSource("git@example.test:repo.git?token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("git@example.test:repo.git#access_token=secret")).toThrow(/must not include query strings/i);
    expect(() => safeGitCloneSource("./local-repo")).toThrow(/must be absolute paths or file:\/\/ URLs/i);
    expect(() => safeGitCloneSource("../local-repo")).toThrow(/must be absolute paths or file:\/\/ URLs/i);
    expect(() => safeGitCloneSource("-c protocol.ext.allow=always")).toThrow(/must not start with '-'/i);
  });

  it("normalizes npm repository URL forms without enabling helper protocols", () => {
    expect(normalizeGitRepositoryUrl("git+https://github.com/owner/repo.git")).toBe("https://github.com/owner/repo");
    expect(normalizeGitRepositoryUrl("git://github.com/owner/repo.git")).toBe("https://github.com/owner/repo");
    expect(normalizeGitRepositoryUrl("ssh://git@github.com/owner/repo.git")).toBe("https://github.com/owner/repo");
    expect(normalizeGitRepositoryUrl("git@github.com:owner/repo.git")).toBe("https://github.com/owner/repo");
  });

  it("redacts credentials from rejected Git source display values", () => {
    expect(redactGitSourceCredentials("https://user:token@example.test/repo.git")).toBe("https://example.test/repo.git");
    expect(redactGitSourceCredentials("git+https://user:token@example.test/repo.git")).toBe("git+https://example.test/repo.git");
    expect(redactGitSourceCredentials("ssh://git:token@example.test/repo.git")).toBe("ssh://git@example.test/repo.git");
    expect(redactGitSourceCredentials("https://example.test/repo.git?token=secret#access_token=also")).toBe(
      "https://example.test/repo.git",
    );
    expect(redactGitSourceCredentials("file:///tmp/repo.git?token=secret#access_token=also")).toBe("file:///tmp/repo.git");
    expect(redactGitSourceCredentials("git@example.test:repo.git?auth=secret#anything=else")).toBe("git@example.test:repo.git");
    expect(redactGitSourceCredentials("git@example.test:repo.git#auth=secret")).toBe("git@example.test:repo.git");
    expect(redactGitSourceCredentials("git+ext::https://user:token@example.test/repo.git")).toBe("git+ext::https://example.test/repo.git");
    expect(redactGitSourceCredentials("git+ext::https://example.test/repo.git?auth=secret#anything=else")).toBe(
      "git+ext::https://example.test/repo.git",
    );
    expect(redactGitSourceCredentials("git+ext::https://user:token@example.test/repo.git?auth=secret")).toBe(
      "git+ext::https://example.test/repo.git",
    );
  });

  it("hardens Git child process environment against user config and helper overrides", () => {
    const env = hardenedGitEnv({
      GIT_ASKPASS: "askpass",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "protocol.ext.allow",
      GIT_CONFIG_VALUE_0: "always",
      GIT_EXEC_PATH: "/tmp/evil-git-core",
      GIT_SSH: "ssh-wrapper",
      GIT_SSH_COMMAND: "ssh -oProxyCommand=evil",
      GIT_TEMPLATE_DIR: "/tmp/evil-template",
      GIT_TRACE: "1",
      PATH: "/bin",
      SSH_ASKPASS: "ssh-askpass",
    });
    expect(env.GIT_ALLOW_PROTOCOL).toBe("file:https:ssh");
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    expect(env.GIT_CONFIG_KEY_0).toBeUndefined();
    expect(env.GIT_CONFIG_VALUE_0).toBeUndefined();
    expect(env.GIT_ASKPASS).toBeUndefined();
    expect(env.GIT_EXEC_PATH).toBeUndefined();
    expect(env.GIT_SSH).toBeUndefined();
    expect(env.GIT_TEMPLATE_DIR).toBeUndefined();
    expect(env.GIT_TRACE).toBeUndefined();
    expect(env.SSH_ASKPASS).toBeUndefined();
    expect(env.GIT_SSH_COMMAND).toBe("ssh -oBatchMode=yes");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });
});
