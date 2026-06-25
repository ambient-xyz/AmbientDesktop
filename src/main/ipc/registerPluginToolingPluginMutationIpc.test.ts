import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const domainSource = readFileSync(new URL("./registerPluginToolingDomainIpc.ts", import.meta.url), "utf8");
const pluginMutationSource = readFileSync(new URL("./registerPluginToolingPluginMutationIpc.ts", import.meta.url), "utf8");

describe("registerPluginToolingPluginMutationIpc", () => {
  it("keeps plugin auth, mutation, and dependency-install registrations out of the domain shell", () => {
    expect(domainSource).toContain("registerPluginToolingPluginMutationIpc");
    expect(domainSource).not.toContain("registerPluginSetTrustedIpc");
    expect(domainSource).not.toContain("pluginHost.installCodexPluginDependencies");
    expect(domainSource).not.toContain("pluginHost.startPluginAppAuth");
    expect(pluginMutationSource).toContain("registerPluginSetTrustedIpc");
    expect(pluginMutationSource).toContain("pluginHost.installCodexPluginDependencies");
    expect(pluginMutationSource).toContain("pluginHost.startPluginAppAuth");
  });
});
