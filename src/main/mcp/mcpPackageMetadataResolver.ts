import type { McpPackageMetadataResolver } from "./mcpInstallCatalogStandardImportPreview";
import { normalizeRepositoryUrl } from "./mcpInstallCatalogUtilities";

export function createPublicMcpPackageMetadataResolver(fetchImpl: typeof fetch = fetch): McpPackageMetadataResolver {
  return async (input) => {
    if (input.registryType === "npm") {
      const url = npmRegistryMetadataUrl(input.identifier);
      const response = await fetchImpl(url, {
        headers: {
          accept: "application/vnd.npm.install-v1+json,application/json;q=0.9,*/*;q=0.1",
          "user-agent": "Ambient-Desktop-MCP-Import",
        },
      });
      if (response.status === 404) {
        return { registryType: "npm", identifier: input.identifier, found: false, error: `HTTP 404 from ${url}` };
      }
      const text = await response.text();
      if (!response.ok) {
        return { registryType: "npm", identifier: input.identifier, found: false, error: `HTTP ${response.status} from ${url}` };
      }
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return {
        registryType: "npm",
        identifier: input.identifier,
        found: true,
        normalizedIdentifier: stringField(parsed, ["name"]) ?? input.identifier,
        repositoryUrl: repositoryUrlFromPackageMetadata(parsed),
      };
    }

    const url = `https://pypi.org/pypi/${encodeURIComponent(input.identifier)}/json`;
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json,*/*;q=0.1",
        "user-agent": "Ambient-Desktop-MCP-Import",
      },
    });
    if (response.status === 404) {
      return { registryType: "pypi", identifier: input.identifier, found: false, error: `HTTP 404 from ${url}` };
    }
    const text = await response.text();
    if (!response.ok) {
      return { registryType: "pypi", identifier: input.identifier, found: false, error: `HTTP ${response.status} from ${url}` };
    }
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const info =
      parsed.info && typeof parsed.info === "object" && !Array.isArray(parsed.info) ? (parsed.info as Record<string, unknown>) : {};
    return {
      registryType: "pypi",
      identifier: input.identifier,
      found: true,
      normalizedIdentifier: stringField(info, ["name"]) ?? input.identifier,
      repositoryUrl: repositoryUrlFromPackageMetadata(info),
    };
  };
}

function npmRegistryMetadataUrl(identifier: string): string {
  if (identifier.startsWith("@")) {
    const [scope, name] = identifier.split("/");
    if (scope && name) return `https://registry.npmjs.org/${encodeURIComponent(scope)}%2f${encodeURIComponent(name)}`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(identifier)}`;
}

function repositoryUrlFromPackageMetadata(record: Record<string, unknown>): string | undefined {
  const repository = record.repository;
  if (typeof repository === "string") return normalizeRepositoryUrl(repository);
  if (repository && typeof repository === "object" && !Array.isArray(repository)) {
    const url = stringField(repository, ["url"]);
    if (url) return normalizeRepositoryUrl(url);
  }
  const projectUrls = record.project_urls ?? record.projectUrls;
  if (projectUrls && typeof projectUrls === "object" && !Array.isArray(projectUrls)) {
    const urls = projectUrls as Record<string, unknown>;
    for (const key of ["Source", "Source Code", "Homepage", "Repository"]) {
      const value = typeof urls[key] === "string" ? urls[key] : undefined;
      if (value) return normalizeRepositoryUrl(value);
    }
  }
  return normalizeRepositoryUrl(stringField(record, ["home_page", "homepage", "url"]));
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
