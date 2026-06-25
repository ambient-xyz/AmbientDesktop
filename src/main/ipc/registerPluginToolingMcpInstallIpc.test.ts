import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const domainSource = readFileSync(new URL("./registerPluginToolingDomainIpc.ts", import.meta.url), "utf8");
const mcpInstallSource = readFileSync(new URL("./registerPluginToolingMcpInstallIpc.ts", import.meta.url), "utf8");

describe("registerPluginToolingMcpInstallIpc", () => {
  it("keeps MCP install and container-runtime registrations out of the domain shell", () => {
    expect(domainSource).toContain("registerPluginToolingMcpInstallIpc");
    expect(domainSource).not.toContain("registerMcpContainerRuntimeLaunchInstallIpc");
    expect(domainSource).not.toContain("mcp-container-runtime-install-progress");
    expect(domainSource).not.toContain("ambientMcpInstallPreview(await catalog.previewRegistryInstall(input))");
    expect(mcpInstallSource).toContain("registerMcpContainerRuntimeLaunchInstallIpc");
    expect(mcpInstallSource).toContain("mcp-container-runtime-install-progress");
    expect(mcpInstallSource).toContain("ambientMcpInstallPreview(await catalog.previewRegistryInstall(input))");
    expect(mcpInstallSource).toContain("installMcpDefaultCapabilityForDesktop");
  });
});
