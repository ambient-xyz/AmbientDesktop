import { describe, expect, it } from "vitest";
import {
  extractMcpAutowireManifestFacts,
  extractMcpAutowireSecretFacts,
  normalizeMcpAutowireTarget,
} from "./mcpAutowireFacts";

describe("MCP autowire facts", () => {
  it("normalizes common GitHub and package target shapes into bounded facts", () => {
    expect(normalizeMcpAutowireTarget("git+https://github.com/salwks/mcp-techTrend")).toMatchObject({
      canonicalUrl: "https://github.com/salwks/mcp-techTrend",
      sourceKind: "github",
      github: { owner: "salwks", repo: "mcp-techTrend" },
    });
    expect(normalizeMcpAutowireTarget("github:salwks/mcp-techTrend.git")).toMatchObject({
      canonicalUrl: "https://github.com/salwks/mcp-techTrend",
      sourceKind: "github",
      github: { owner: "salwks", repo: "mcp-techTrend" },
    });
    expect(normalizeMcpAutowireTarget("https://github.com/modelcontextprotocol/servers/tree/main/src/everything")).toMatchObject({
      canonicalUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
      sourceKind: "github",
      github: {
        owner: "modelcontextprotocol",
        repo: "servers",
        branch: "main",
        path: "src/everything",
        pathKind: "tree",
      },
    });
    expect(normalizeMcpAutowireTarget("npx://@executeautomation/playwright-mcp-server")).toMatchObject({
      canonicalUrl: "https://www.npmjs.com/package/@executeautomation/playwright-mcp-server",
      sourceKind: "package",
      package: {
        registryType: "npm",
        identifier: "@executeautomation/playwright-mcp-server",
      },
    });
    expect(normalizeMcpAutowireTarget("uvx://mcp-server-qdrant")).toMatchObject({
      canonicalUrl: "https://pypi.org/project/mcp-server-qdrant/",
      sourceKind: "package",
      package: {
        registryType: "pypi",
        identifier: "mcp-server-qdrant",
      },
    });
  });

  it("extracts pyproject MCP package facts without scanning prose for package identity", () => {
    const facts = extractMcpAutowireManifestFacts([{
      locator: "https://raw.githubusercontent.com/salwks/mcp-techTrend/main/pyproject.toml",
      text: [
        "[project]",
        'name = "mcp-techtrend"',
        'dependencies = [',
        '  "mcp>=1.0.0",',
        '  "httpx>=0.28.0",',
        "]",
        "",
        "[project.scripts]",
        'trends-mcp = "trends_mcp:main"',
      ].join("\n"),
    }]);

    expect(facts.manifests).toEqual([
      expect.objectContaining({
        kind: "pyproject-toml",
        registryType: "pypi",
        packageName: "mcp-techtrend",
        scriptNames: ["trends-mcp"],
        scriptTargets: [{ name: "trends-mcp", target: "trends_mcp:main" }],
        dependencies: ["mcp>=1.0.0", "httpx>=0.28.0"],
        looksLikeMcp: true,
      }),
    ]);
  });

  it("classifies optional API tokens without promoting them to required secrets", () => {
    const facts = extractMcpAutowireSecretFacts(
      "GITHUB_TOKEN is optional. Anonymous GitHub requests work, but adding GITHUB_TOKEN raises the rate limit.",
    );

    expect(facts.secrets).toEqual([
      expect.objectContaining({
        name: "GITHUB_TOKEN",
        requiredness: "optional",
      }),
    ]);
  });

  it("keeps Pydantic optional/local-mode API keys optional", () => {
    const facts = extractMcpAutowireSecretFacts([
      "Distinguish local Qdrant path mode from remote URL mode; QDRANT_API_KEY should not be required for local mode.",
      "class QdrantSettings(BaseSettings):",
      '    location: str | None = Field(default=None, validation_alias="QDRANT_URL")',
      '    api_key: str | None = Field(default=None, validation_alias="QDRANT_API_KEY")',
      '    local_path: str | None = Field(default=None, validation_alias="QDRANT_LOCAL_PATH")',
      'Remote Docker examples may set QDRANT_API_KEY="your-api-key" alongside QDRANT_URL.',
      "    def check_local_path_conflict(self):",
      "        if self.local_path:",
      "            if self.location is not None or self.api_key is not None:",
      "                raise ValueError(\"If 'local_path' is set, 'location' and 'api_key' must be None.\")",
    ].join("\n"));

    expect(facts.secrets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "QDRANT_API_KEY",
        requiredness: "optional",
      }),
    ]));
  });

  it("ignores eval-only API keys that are not runtime install secrets", () => {
    const facts = extractMcpAutowireSecretFacts([
      "Running evals:",
      "The evals package loads an MCP client that runs the index.ts file.",
      "You can load environment variables by prefixing the npx command.",
      "OPENAI_API_KEY=your-key npx mcp-eval src/evals/evals.ts src/tools/codegen/index.ts",
    ].join("\n"));

    expect(facts.secrets.map((secret) => secret.name)).not.toContain("OPENAI_API_KEY");
  });
});
