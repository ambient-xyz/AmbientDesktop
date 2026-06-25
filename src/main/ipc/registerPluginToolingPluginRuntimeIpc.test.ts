import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const domainSource = readFileSync(new URL("./registerPluginToolingDomainIpc.ts", import.meta.url), "utf8");
const pluginRuntimeSource = readFileSync(new URL("./registerPluginToolingPluginRuntimeIpc.ts", import.meta.url), "utf8");

describe("registerPluginToolingPluginRuntimeIpc", () => {
  it("keeps plugin catalog, MCP runtime, and capability diagnostics registrations out of the domain shell", () => {
    expect(domainSource).toContain("registerPluginToolingPluginCatalogRuntimeIpc");
    expect(domainSource).toContain("registerPluginToolingRuntimeCapabilityIpc");
    expect(domainSource).not.toContain("registerPluginMcpInspectionIpc");
    expect(domainSource).not.toContain("pluginHost.inspectCodexPluginMcp");
    expect(domainSource).not.toContain("pluginHost.listRuntimeCapabilities");
    expect(domainSource).not.toContain("pluginHost.getCapabilityDiagnostics");
    expect(pluginRuntimeSource).toContain("registerPluginMcpInspectionIpc");
    expect(pluginRuntimeSource).toContain("pluginHost.inspectCodexPluginMcp");
    expect(pluginRuntimeSource).toContain("pluginHost.listRuntimeCapabilities");
    expect(pluginRuntimeSource).toContain("pluginHost.getCapabilityDiagnostics");
  });
});
