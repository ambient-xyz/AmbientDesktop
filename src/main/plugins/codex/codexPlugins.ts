import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  CodexPluginApp,
  CodexPluginCompatibilityTier,
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
  CodexPluginDependencyStatus,
  CodexMarketplaceSourceKind,
  CodexPluginMcpServer,
  CodexPluginSkill,
  CodexPluginSummary,
  AddCodexMarketplaceInput,
  InstallCodexPluginDependenciesInput,
  ImportCodexPluginInput,
  RemoveCodexMarketplaceInput,
  UninstallCodexPluginInput,
} from "../../../shared/pluginTypes";
import { validateAmbientCuratedMarketplace } from "./codexCuratedMarketplace";
import {
  ambientCuratedMarketplaceDefaultUrl,
  ambientCuratedMarketplaceSignatureFileName,
  ambientCuratedMarketplaceTrustedPublicKeysFromEnv,
  sha256Digest,
  verifyAmbientCuratedMarketplaceSignature,
  type AmbientCuratedMarketplaceSignatureVerification,
} from "./codexCuratedMarketplaceSignature";
import { knownCodexPluginProfile } from "./codexPluginProfiles";
import { isPathInside } from "../pluginsSessionFacade";
import { materializeTextOutput } from "../pluginsToolRuntimeFacade";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "../pluginsSetupFacade";
import { allowLocalDevUrlEgressFromEnv, assertAllowedUrlEgressWithDns, fetchWithUrlEgressPolicy } from "../pluginsSecurityFacade";

const execFileAsync = promisify(execFile);
const marketplaceLocations = [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"];
const localImportMarketplacePath = ".agents/plugins/marketplace.json";
const appLocalImportMarketplacePath = `app:${localImportMarketplacePath}`;
const localImportRoot = ".ambient-codex/imported-plugins";
const remoteMarketplaceConfigPath = ".ambient-codex/remote-marketplaces.json";
const remoteMarketplaceTimeoutMs = 5000;
const dependencyInstallTimeoutMs = 120_000;
const compatibilityTierSchema = z.enum(["supported", "partial", "unsupported"]);
const authorSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1).optional(),
  }),
]);

const marketplaceSchema = z.object({
  name: z.string().min(1),
  interface: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  plugins: z.array(z.unknown()).default([]),
});

const marketplacePluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  source: z.union([
    z.string().min(1),
    z.object({
      source: z.string().min(1),
      path: z.string().min(1).optional(),
      url: z.string().optional(),
      ref: z.string().optional(),
      sha: z.string().optional(),
    }),
  ]),
  category: z.string().optional(),
  interface: z
    .object({
      displayName: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
  authPolicy: z.string().optional(),
  publisher: z.string().optional(),
  license: z.string().optional(),
  policy: z
    .object({
      authentication: z.string().optional(),
      installation: z.string().optional(),
    })
    .optional(),
  manifest: z.unknown().optional(),
  ambient: z
    .object({
      provenance: z
        .object({
          sourceType: z.string().optional(),
          url: z.string().optional(),
          path: z.string().optional(),
          ref: z.string().optional(),
          sha: z.string().optional(),
        })
        .optional(),
      marketplace: z
        .object({
          publisher: z.string().optional(),
          license: z.string().optional(),
          checksum: z.string().optional(),
          bundleChecksum: z.string().optional(),
          capabilitySummary: z.array(z.string()).optional(),
          compatibility: z
            .object({
              status: z.string().optional(),
              tier: compatibilityTierSchema.optional(),
              notes: z.array(z.string()).optional(),
              supportLabels: z.array(z.string()).optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().default("local"),
  description: z.string().default(""),
  author: authorSchema.optional(),
  license: z.string().optional(),
  skills: z.string().optional(),
  mcpServers: z.string().optional(),
  apps: z.string().optional(),
  interface: z
    .object({
      displayName: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
});

const appDescriptorSchema = z.object({
  apps: z.record(
    z.string(),
    z.object({
      id: z.string().min(1),
    }),
  ),
});

const remoteManifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  author: authorSchema.optional(),
  license: z.string().optional(),
  skills: z.unknown().optional(),
  mcpServers: z.unknown().optional(),
  apps: z.unknown().optional(),
  interface: z
    .object({
      displayName: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
});

const remoteMarketplaceConfigSchema = z.object({
  marketplaces: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          name: z.string().optional(),
          path: z.string().optional(),
          url: z.string().optional(),
        }),
      ]),
    )
    .default([]),
});

const codexMarketplaceSourceInputSchema = z.object({
  source: z.string().min(1).max(4096).transform((value) => value.trim()),
  name: z.string().min(1).max(256).transform((value) => value.trim()).optional(),
  allowExperimental: z.boolean().optional(),
});
const codexPluginDependencyInstallInputSchema = z.object({
  pluginId: z.string().min(1).max(1024),
});
const packageJsonSchema = z.object({
  packageManager: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

type MarketplacePluginEntry = z.infer<typeof marketplacePluginSchema>;
type AmbientPluginProvenance = NonNullable<NonNullable<MarketplacePluginEntry["ambient"]>["provenance"]>;
type AmbientMarketplaceMetadata = NonNullable<NonNullable<MarketplacePluginEntry["ambient"]>["marketplace"]>;
type CodexPluginSourceProvenance = Pick<CodexPluginSummary, "sourceType" | "sourceUrl" | "sourcePath" | "sourceRef" | "sourceSha">;
type CodexPluginMarketplaceMetadata = Pick<
  CodexPluginSummary,
  | "author"
  | "publisher"
  | "license"
  | "sourceChecksum"
  | "sourceBundleChecksum"
  | "ambientCompatibility"
  | "ambientCompatibilityTier"
  | "ambientCompatibilityNotes"
  | "ambientSupportLabels"
  | "capabilitySummary"
>;
type RemoteMarketplaceConfigEntry = z.infer<typeof remoteMarketplaceConfigSchema>["marketplaces"][number];
type RemoteMarketplaceSignaturePolicy = "required" | "optional-dev";

type PluginSourceDescriptor =
  | { kind: "local"; path: string }
  | { kind: "remote"; sourceType: string; path?: string; url?: string; ref?: string; sha?: string };

type RemoteMarketplaceSource =
  | {
      key: string;
      label: string;
      kind: "path";
      path: string;
      removeSource: string;
      removable: boolean;
      marketplaceKindHint?: CodexMarketplaceSourceKind;
      signaturePolicy?: RemoteMarketplaceSignaturePolicy;
    }
  | {
      key: string;
      label: string;
      kind: "url";
      url: string;
      removeSource: string;
      removable: boolean;
      marketplaceKindHint?: CodexMarketplaceSourceKind;
      signaturePolicy?: RemoteMarketplaceSignaturePolicy;
    };

interface RemoteMarketplaceReadResult {
  value: unknown;
  content: string;
  contentChecksum: string;
}

async function ensureCodexPluginManagedInstallWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, localImportRoot);
  await migrateWorkspaceManagedInstallPath(workspacePath, localImportMarketplacePath);
  await migrateWorkspaceManagedInstallPath(workspacePath, remoteMarketplaceConfigPath);
  return managedInstallWorkspacePath(workspacePath);
}

export interface PreviewCodexPluginInstallInput {
  source: string;
  name?: string;
}

export interface CommitCodexPluginInstallInput extends PreviewCodexPluginInstallInput {
  pluginId?: string;
  pluginName?: string;
}

export interface CodexPluginInstallPreview {
  source: string;
  name?: string;
  marketplaceSources: Array<{
    id: string;
    label: string;
    source: string;
    kind: CodexMarketplaceSourceKind | "remote";
    pluginCount?: number;
    contentChecksum?: string;
  }>;
  candidates: CodexPluginSummary[];
  errors: string[];
  installableCount: number;
}

export interface CodexPluginInstallCommitResult {
  source: string;
  name?: string;
  preview: CodexPluginInstallPreview;
  plugin: CodexPluginSummary;
  installedAt: string;
}

export async function discoverCodexPlugins(workspacePath: string): Promise<CodexPluginCatalog> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const catalog: CodexPluginCatalog = { marketplaces: [], marketplaceSources: [], plugins: [], importCandidates: [], errors: [] };

  for (const marketplaceLocation of marketplaceLocations) {
    const marketplacePath = join(workspacePath, marketplaceLocation);
    if (!existsSync(marketplacePath)) continue;
    catalog.marketplaces.push(marketplaceLocation);
    catalog.marketplaceSources?.push({
      id: `workspace:${marketplaceLocation}`,
      label: marketplaceLocation,
      source: marketplaceLocation,
      kind: "workspace",
      removable: false,
    });
    try {
      const marketplace = marketplaceSchema.parse(await readJson(marketplacePath));
      for (const rawPlugin of marketplace.plugins) {
        const plugin = await loadMarketplacePlugin({
          workspacePath,
          marketplaceRootPath: workspacePath,
          marketplacePath: marketplaceLocation,
          marketplaceName: marketplace.name,
          marketplaceDisplayName: marketplace.interface?.displayName,
          rawPlugin,
        });
        catalog.plugins.push(plugin);
      }
    } catch (error) {
      catalog.errors.push(`${marketplaceLocation}: ${errorMessage(error)}`);
    }
  }

  if (managedWorkspace !== resolve(workspacePath)) {
    const marketplacePath = join(managedWorkspace, localImportMarketplacePath);
    if (existsSync(marketplacePath)) {
      catalog.marketplaces.push(appLocalImportMarketplacePath);
      catalog.marketplaceSources?.push({
        id: `app:${localImportMarketplacePath}`,
        label: "Ambient app-managed plugins",
        source: appLocalImportMarketplacePath,
        kind: "workspace",
        removable: false,
      });
      try {
        const marketplace = marketplaceSchema.parse(await readJson(marketplacePath));
        for (const rawPlugin of marketplace.plugins) {
          const plugin = await loadMarketplacePlugin({
            workspacePath,
            marketplaceRootPath: managedWorkspace,
            marketplacePath: appLocalImportMarketplacePath,
            marketplaceName: marketplace.name,
            marketplaceDisplayName: marketplace.interface?.displayName,
            rawPlugin,
          });
          catalog.plugins.push(plugin);
        }
      } catch (error) {
        catalog.errors.push(`${appLocalImportMarketplacePath}: ${errorMessage(error)}`);
      }
    }
  }

  const cacheRoot = codexPluginCacheRoot();
  if (cacheRoot && existsSync(cacheRoot)) {
    try {
      catalog.importCandidates = await discoverCodexPluginCache(cacheRoot, catalog.plugins);
    } catch (error) {
      catalog.errors.push(`Codex plugin cache: ${errorMessage(error)}`);
    }
  }

  const remoteMarketplaces = await discoverRemoteCodexMarketplaces(workspacePath, catalog.plugins);
  catalog.marketplaces.push(...remoteMarketplaces.marketplaces);
  catalog.marketplaceSources?.push(...remoteMarketplaces.marketplaceSources);
  catalog.importCandidates.push(...remoteMarketplaces.candidates);
  catalog.errors.push(...remoteMarketplaces.errors);

  return catalog;
}

export async function previewCodexPluginInstallSource(
  workspacePath: string,
  input: PreviewCodexPluginInstallInput,
): Promise<CodexPluginInstallPreview> {
  const parsed = codexMarketplaceSourceInputSchema.parse(input);
  const configEntry = marketplaceSourceConfigFromInput(parsed.source, parsed.name);
  const sources = remoteSourceFromConfigEntry(configEntry, workspacePath, false);
  const candidates: CodexPluginSummary[] = [];
  const marketplaceSources: CodexPluginInstallPreview["marketplaceSources"] = [];
  const errors: string[] = [];
  const workspacePlugins = await discoverCodexPlugins(workspacePath)
    .then((catalog) => catalog.plugins)
    .catch(() => []);

  for (const source of sources) {
    try {
      const rawMarketplace = await readRemoteMarketplaceJson(source);
      const marketplace = marketplaceSchema.parse(rawMarketplace.value);
      const marketplaceKind = source.marketplaceKindHint ?? marketplaceKindFromPlugins(marketplace.plugins);
      marketplaceSources.push({
        id: source.key,
        label: source.label,
        source: source.removeSource,
        kind: marketplaceKind,
        pluginCount: marketplace.plugins.length,
        contentChecksum: rawMarketplace.contentChecksum,
      });
      const displayName = marketplace.interface?.displayName ?? marketplace.name;
      for (const rawPlugin of marketplace.plugins) {
        try {
          const entry = marketplacePluginSchema.parse(rawPlugin);
          const descriptor = sourceDescriptorFromEntry(entry.source);
          if (descriptor.kind === "local") {
            errors.push(`${source.label}: ${entry.name}: install preview needs a Git-backed plugin source.`);
            continue;
          }
          candidates.push(
            remotePluginCandidate(
              source,
              marketplace.name,
              displayName,
              source.marketplaceKindHint ?? marketplaceKindFromEntry(entry),
              entry,
              descriptor,
              workspacePlugins,
            ),
          );
        } catch (error) {
          errors.push(`${source.label}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${source.label}: ${errorMessage(error)}`);
      marketplaceSources.push({
        id: source.key,
        label: source.label,
        source: source.removeSource,
        kind: source.marketplaceKindHint ?? "remote",
      });
    }
  }

  return {
    source: parsed.source,
    ...(parsed.name ? { name: parsed.name } : {}),
    marketplaceSources,
    candidates,
    errors,
    installableCount: candidates.filter(canInstallRemoteGitCandidate).length,
  };
}

export async function commitCodexPluginInstallSource(
  workspacePath: string,
  input: CommitCodexPluginInstallInput,
): Promise<CodexPluginInstallCommitResult> {
  const pluginId = input.pluginId?.trim();
  const pluginName = input.pluginName?.trim();
  const preview = await previewCodexPluginInstallSource(workspacePath, input);
  const candidate = selectPreviewInstallCandidate(preview, { pluginId, pluginName });
  if (candidate.compatibilityTier === "unsupported") {
    throw new Error(`Cannot install unsupported Codex plugin "${candidate.displayName ?? candidate.name}".`);
  }
  if (!canInstallRemoteGitCandidate(candidate)) {
    throw new Error(
      `Codex plugin "${candidate.displayName ?? candidate.name}" is not installable from this source. Remote Git installs require a local Git path or file URL until Ambient-managed clone transport enforces URL egress at connection time.`,
    );
  }
  const plugin = await installRemoteGitCodexPlugin(workspacePath, candidate);
  return {
    source: preview.source,
    ...(preview.name ? { name: preview.name } : {}),
    preview,
    plugin,
    installedAt: new Date().toISOString(),
  };
}

export async function importCodexPluginFromCache(
  workspacePath: string,
  input: ImportCodexPluginInput,
): Promise<CodexPluginSummary> {
  const pluginId = z.string().min(1).max(1024).parse(input.pluginId);
  if (pluginId.startsWith("remote-marketplace:")) return registerRemoteCodexPlugin(workspacePath, pluginId);

  const cacheRoot = codexPluginCacheRoot();
  if (!cacheRoot || !existsSync(cacheRoot)) throw new Error("Codex plugin cache was not found.");

  const candidates = await discoverCodexPluginCache(cacheRoot, []);
  const candidate = candidates.find((plugin) => plugin.id === pluginId);
  if (!candidate) throw new Error("Codex plugin import candidate was not found.");
  if (candidate.compatibilityTier === "unsupported") {
    throw new Error(`Cannot import unsupported Codex plugin "${candidate.displayName ?? candidate.name}".`);
  }
  if (!isPathInside(cacheRoot, candidate.rootPath)) throw new Error("Codex plugin candidate is outside the cache root.");

  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const importName = safeImportName(candidate.name, candidate.version, candidate.rootPath);
  const relativeImportPath = `./${localImportRoot}/${importName}`;
  const destination = resolve(managedWorkspace, localImportRoot, importName);
  if (!isPathInside(managedWorkspace, destination)) throw new Error("Resolved plugin import path is outside Ambient-managed install state.");

  await mkdir(dirname(destination), { recursive: true });
  await cp(candidate.rootPath, destination, { recursive: true, force: true, dereference: false });
  await upsertLocalImportMarketplace(workspacePath, {
    name: candidate.name,
    source: { source: "local", path: relativeImportPath },
    category: candidate.category,
  });

  const imported = await loadMarketplacePlugin({
    workspacePath,
    marketplaceRootPath: managedWorkspace,
    marketplacePath: managedWorkspace === resolve(workspacePath) ? localImportMarketplacePath : appLocalImportMarketplacePath,
    marketplaceName: "ambient-local-imports",
    marketplaceDisplayName: "Ambient Local Imports",
    rawPlugin: {
      name: candidate.name,
      source: { source: "local", path: relativeImportPath },
      ...(candidate.category ? { category: candidate.category } : {}),
    },
  });
  return imported;
}

export async function addCodexMarketplaceSource(workspacePath: string, input: AddCodexMarketplaceInput): Promise<void> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const marketplace = codexMarketplaceSourceInputSchema.parse(input);
  if (requiresExperimentalMarketplaceSource(marketplace.source) && !marketplace.allowExperimental) {
    throw new Error(
      "Arbitrary Codex marketplace URLs are experimental. Enable advanced URL sources to add a non-GitHub remote marketplace.",
    );
  }
  const source = marketplaceSourceConfigFromInput(marketplace.source, marketplace.name);
  const configPath = join(managedWorkspace, remoteMarketplaceConfigPath);
  await mkdir(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? remoteMarketplaceConfigSchema.parse(await readJson(configPath)) : { marketplaces: [] };
  const marketplaces = [...existing.marketplaces.filter((entry) => !remoteMarketplaceConfigEntryMatches(entry, source)), source];
  await writeFile(configPath, `${JSON.stringify({ marketplaces }, null, 2)}\n`, "utf8");
}

export async function removeCodexMarketplaceSource(workspacePath: string, input: RemoveCodexMarketplaceInput): Promise<void> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const source = z.string().min(1).max(4096).parse(input.source).trim();
  const configPath = join(managedWorkspace, remoteMarketplaceConfigPath);
  if (!existsSync(configPath)) throw new Error("No Ambient Codex marketplace sources are configured for this workspace.");
  const existing = remoteMarketplaceConfigSchema.parse(await readJson(configPath));
  const candidate = marketplaceSourceConfigFromInput(source, undefined);
  const marketplaces = existing.marketplaces.filter((entry) => !remoteMarketplaceConfigEntryMatches(entry, candidate));
  if (marketplaces.length === existing.marketplaces.length) {
    throw new Error("Codex marketplace source was not found in Ambient workspace state.");
  }
  await writeFile(configPath, `${JSON.stringify({ marketplaces }, null, 2)}\n`, "utf8");
}

export async function uninstallCodexPlugin(workspacePath: string, input: UninstallCodexPluginInput): Promise<void> {
  const pluginIdToUninstall = z.string().min(1).max(1024).parse(input.pluginId);
  const catalog = await discoverCodexPlugins(workspacePath);
  const plugin = catalog.plugins.find((candidate) => candidate.id === pluginIdToUninstall);
  if (!plugin) throw new Error("Codex plugin was not found in this workspace.");
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const appManagedPlugin = plugin.marketplacePath === appLocalImportMarketplacePath;
  if (!appManagedPlugin && !marketplaceLocations.includes(plugin.marketplacePath)) {
    throw new Error("Codex plugin marketplace is not removable by Ambient.");
  }

  const marketplaceFile = appManagedPlugin ? join(managedWorkspace, localImportMarketplacePath) : join(workspacePath, plugin.marketplacePath);
  const rawMarketplace = await readJson(marketplaceFile);
  if (!rawMarketplace || typeof rawMarketplace !== "object" || Array.isArray(rawMarketplace)) {
    throw new Error("Codex marketplace file is not an object.");
  }
  const marketplace = rawMarketplace as { plugins?: unknown[] };
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const nextPlugins = plugins.filter((entry) => !marketplaceEntryMatchesPlugin(entry, plugin.name));
  if (nextPlugins.length === plugins.length) {
    throw new Error("Codex plugin marketplace entry was not found.");
  }

  await writeFile(marketplaceFile, `${JSON.stringify({ ...rawMarketplace, plugins: nextPlugins }, null, 2)}\n`, "utf8");

  const importDirectory = ambientImportDirectoryForPlugin(appManagedPlugin ? managedWorkspace : workspacePath, plugin.rootPath);
  if (importDirectory) await rm(importDirectory, { recursive: true, force: true });
}

export async function installCodexPluginDependencies(
  workspacePath: string,
  input: InstallCodexPluginDependenciesInput,
): Promise<CodexPluginDependencyInstallResult> {
  const parsed = codexPluginDependencyInstallInputSchema.parse(input);
  const catalog = await discoverCodexPlugins(workspacePath);
  const plugin = catalog.plugins.find((candidate) => candidate.id === parsed.pluginId);
  if (!plugin) throw new Error("Codex plugin was not found in this workspace.");
  if (!plugin.dependencyStatus?.required) throw new Error("Codex plugin does not declare MCP dependencies that Ambient can install.");
  if (plugin.dependencyStatus.installed) throw new Error("Codex plugin dependencies are already installed.");
  const managedWorkspace = managedInstallWorkspacePath(workspacePath);
  if (!isPathInside(workspacePath, plugin.rootPath) && !isPathInside(managedWorkspace, plugin.rootPath)) {
    throw new Error("Dependency installation is only supported for workspace-local or Ambient-managed app-level plugins.");
  }

  const command = plugin.dependencyStatus.installCommand;
  const [executable, ...args] = command;
  if (!executable) throw new Error("Codex plugin dependency install command is empty.");
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: plugin.rootPath,
      timeout: dependencyInstallTimeoutMs,
      env: {
        ...process.env,
        npm_config_ignore_scripts: "true",
        YARN_ENABLE_SCRIPTS: "false",
      },
      maxBuffer: 1024 * 1024 * 4,
    });
    const stdoutOutput = stdout
      ? await materializeTextOutput(workspacePath, {
          label: `codex-plugin-${plugin.name}-dependency-install-stdout`,
          text: stdout,
          maxPreviewChars: 6_000,
        })
      : undefined;
    const stderrOutput = stderr
      ? await materializeTextOutput(workspacePath, {
          label: `codex-plugin-${plugin.name}-dependency-install-stderr`,
          text: stderr,
          maxPreviewChars: 6_000,
        })
      : undefined;
    return {
      pluginId: plugin.id,
      pluginName: plugin.name,
      manager: plugin.dependencyStatus.manager,
      command,
      cwd: plugin.rootPath,
      installedAt: new Date().toISOString(),
      ...(stdoutOutput
        ? {
            stdout: stdoutOutput.text,
            stdoutArtifactPath: stdoutOutput.artifactPath,
            stdoutArtifactBytes: stdoutOutput.artifactBytes,
            stdoutChars: stdoutOutput.totalChars,
            stdoutPreviewChars: stdoutOutput.previewChars,
          }
        : {}),
      ...(stderrOutput
        ? {
            stderr: stderrOutput.text,
            stderrArtifactPath: stderrOutput.artifactPath,
            stderrArtifactBytes: stderrOutput.artifactBytes,
            stderrChars: stderrOutput.totalChars,
            stderrPreviewChars: stderrOutput.previewChars,
          }
        : {}),
    };
  } catch (error) {
    throw new Error(`Codex plugin dependency install failed: ${errorMessage(error)}`);
  }
}

async function loadMarketplacePlugin(input: {
  workspacePath: string;
  marketplaceRootPath: string;
  marketplacePath: string;
  marketplaceName: string;
  marketplaceDisplayName?: string;
  rawPlugin: unknown;
}): Promise<CodexPluginSummary> {
  const entry = marketplacePluginSchema.parse(input.rawPlugin);
  const errors: string[] = [];
  const source = sourceDescriptorFromEntry(entry.source);
  const provenance = provenanceFromEntry(entry);
  const marketplaceMetadata = marketplaceMetadataFromEntry(entry);
  const authPolicy = authPolicyFromEntry(entry);
  const sourcePath = source.kind === "local" ? source.path : undefined;
  const rootPath = sourcePath ? resolveMarketplacePath(input.marketplaceRootPath, sourcePath) : undefined;

  if (source.kind === "remote") {
    const metadata = pluginEntryMetadata(entry);
    return withCompatibility({
      id: pluginId(input.marketplacePath, entry.name),
      name: metadata.name,
      version: metadata.version ?? "remote",
      description: metadata.description ?? "",
      marketplaceName: input.marketplaceDisplayName ?? input.marketplaceName,
      marketplacePath: input.marketplacePath,
      rootPath: remoteSourceLabel(source),
      marketplaceKind: marketplaceKindFromMetadata(marketplaceMetadata, "remote"),
      sourceKind: "remote-marketplace",
      category: metadata.category,
      displayName: metadata.displayName,
      authPolicy,
      skills: [],
      mcpServers: [],
      imported: true,
      enabled: false,
      trusted: false,
      errors,
      sourceType: source.sourceType,
      sourceUrl: source.url,
      sourcePath: source.path,
      sourceRef: source.ref,
      sourceSha: source.sha,
      ...marketplaceMetadata,
    });
  }

  if (sourcePath && !sourcePath.startsWith("./")) errors.push("Local source.path must start with ./.");
  if (rootPath && !isPathInside(input.marketplaceRootPath, rootPath)) errors.push("Local source.path must stay inside the marketplace root.");

  const fallback: CodexPluginSummary = {
    id: pluginId(input.marketplacePath, entry.name),
    name: entry.name,
    version: "unknown",
    description: "",
    marketplaceName: input.marketplaceName,
    marketplacePath: input.marketplacePath,
    rootPath: rootPath ?? "",
    marketplaceKind: marketplaceKindFromMetadata(marketplaceMetadata, "workspace"),
    sourceKind: "workspace",
    compatibilityTier: "unsupported",
    compatibilityNotes: ["Plugin manifest could not be loaded."],
    supportLabels: [],
    category: entry.category,
    authPolicy,
    skills: [],
    mcpServers: [],
    imported: true,
    enabled: true,
    trusted: false,
    errors,
    ...provenance,
    ...marketplaceMetadata,
  };

  if (!rootPath || errors.length > 0) return refreshPluginCompatibility(fallback);

  const manifestPath = join(rootPath, ".codex-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    return { ...fallback, errors: [...errors, "Missing .codex-plugin/plugin.json."] };
  }

  try {
    const manifest = manifestSchema.parse(await readJson(manifestPath));
    const manifestErrors = manifest.name === entry.name ? [] : [`Manifest name "${manifest.name}" does not match marketplace entry "${entry.name}".`];
    const skills = await discoverSkills(rootPath, manifest.skills);
    const mcpServers = await discoverMcpServers(rootPath, manifest.mcpServers);
    const dependencyStatus = await discoverPluginDependencyStatus(rootPath, mcpServers);
    const appsPath = resolveOptionalPluginPath(rootPath, manifest.apps);
    const appDiscovery = await discoverApps(appsPath);
    const manifestMetadata = { ...marketplaceMetadataForManifest(manifest), ...marketplaceMetadata };
    return withCompatibility({
      name: manifest.name,
      id: pluginId(input.marketplacePath, manifest.name),
      version: manifest.version,
      description: manifest.interface?.shortDescription ?? manifest.description,
      marketplaceName: input.marketplaceDisplayName ?? input.marketplaceName,
      marketplacePath: input.marketplacePath,
      rootPath,
      marketplaceKind: marketplaceKindFromMetadata(manifestMetadata, "workspace"),
      sourceKind: "workspace",
      category: manifest.interface?.category ?? entry.category,
      displayName: manifest.interface?.displayName,
      authPolicy,
      skills,
      mcpServers,
      ...(dependencyStatus ? { dependencyStatus } : {}),
      ...(appsPath ? { appsPath, apps: appDiscovery.apps } : {}),
      imported: true,
      enabled: true,
      trusted: false,
      errors: [...errors, ...manifestErrors, ...appDiscovery.errors],
      ...provenance,
      ...manifestMetadata,
    });
  } catch (error) {
    return refreshPluginCompatibility({ ...fallback, errors: [...errors, errorMessage(error)] });
  }
}

export function pluginId(marketplacePath: string, pluginName: string): string {
  return `${marketplacePath}:${pluginName}`;
}

async function discoverSkills(pluginRoot: string, configuredPath: string | undefined): Promise<CodexPluginSkill[]> {
  const skillsRoot = resolveOptionalPluginPath(pluginRoot, configuredPath ?? "./skills/");
  if (!skillsRoot || !existsSync(skillsRoot)) return [];
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: CodexPluginSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    skills.push({ ...parseSkillHeader(await readFile(skillPath, "utf8")), path: skillPath });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

async function discoverMcpServers(pluginRoot: string, configuredPath: string | undefined): Promise<CodexPluginMcpServer[]> {
  const mcpPath = resolveOptionalPluginPath(pluginRoot, configuredPath ?? "./.mcp.json");
  if (!mcpPath || !existsSync(mcpPath)) return [];
  const parsed = await readJson(mcpPath);
  const servers = typeof parsed === "object" && parsed && "mcpServers" in parsed ? (parsed as { mcpServers?: unknown }).mcpServers : parsed;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return [];

  return Object.entries(servers).map(([name, value]) => {
    const config = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      name,
      command: typeof config.command === "string" ? config.command : undefined,
      args: Array.isArray(config.args) ? config.args.filter((arg): arg is string => typeof arg === "string") : [],
      envKeys: config.env && typeof config.env === "object" && !Array.isArray(config.env) ? Object.keys(config.env).sort() : [],
    };
  });
}

async function discoverPluginDependencyStatus(
  pluginRoot: string,
  mcpServers: CodexPluginMcpServer[],
): Promise<CodexPluginDependencyStatus | undefined> {
  if (mcpServers.length === 0) return undefined;
  const packageJsonPath = join(pluginRoot, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;
  const packageJson = packageJsonSchema.parse(await readJson(packageJsonPath));
  const dependencyNames = uniqueStrings([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]).sort((left, right) => left.localeCompare(right));
  if (dependencyNames.length === 0) return undefined;

  const manager = detectPackageManager(pluginRoot, packageJson.packageManager);
  const missingPackages = dependencyNames.filter((name) => !existsSync(nodeModulePath(pluginRoot, name)));
  const installed = missingPackages.length === 0;
  return {
    packageJsonPath,
    manager,
    installCommand: dependencyInstallCommand(manager),
    required: true,
    installed,
    missingPackages,
    ...(installed
      ? {}
      : {
          reason: `Plugin MCP dependencies are not installed: ${missingPackages.slice(0, 5).join(", ")}${missingPackages.length > 5 ? ", ..." : ""}.`,
        }),
  };
}

function detectPackageManager(pluginRoot: string, packageManager: string | undefined): CodexPluginDependencyStatus["manager"] {
  if (existsSync(join(pluginRoot, "pnpm-lock.yaml")) || packageManager?.startsWith("pnpm@")) return "pnpm";
  if (existsSync(join(pluginRoot, "yarn.lock")) || packageManager?.startsWith("yarn@")) return "yarn";
  return "npm";
}

function dependencyInstallCommand(manager: CodexPluginDependencyStatus["manager"]): string[] {
  if (manager === "pnpm") return ["pnpm", "install", "--ignore-scripts"];
  if (manager === "yarn") return ["yarn", "install", "--ignore-scripts"];
  return ["npm", "install", "--ignore-scripts"];
}

function nodeModulePath(pluginRoot: string, packageName: string): string {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    return join(pluginRoot, "node_modules", scope ?? "", name ?? "");
  }
  return join(pluginRoot, "node_modules", packageName);
}

async function discoverApps(appsPath: string | undefined): Promise<{ apps: CodexPluginApp[]; errors: string[] }> {
  if (!appsPath || !existsSync(appsPath)) return { apps: [], errors: [] };
  try {
    const descriptor = appDescriptorSchema.parse(await readJson(appsPath));
    return {
      apps: Object.entries(descriptor.apps)
        .map(([name, app]) => ({
          name,
          connectorId: app.id,
          path: appsPath,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      errors: [],
    };
  } catch (error) {
    return { apps: [], errors: [`Invalid Codex app descriptor: ${errorMessage(error)}`] };
  }
}

function sourceDescriptorFromEntry(source: MarketplacePluginEntry["source"]): PluginSourceDescriptor {
  if (typeof source === "string") return { kind: "local", path: source };
  if (source.source === "local" && source.path) return { kind: "local", path: source.path };
  return {
    kind: "remote",
    sourceType: source.source,
    ...(source.path ? { path: source.path } : {}),
    ...(source.url ? { url: source.url } : {}),
    ...(source.ref ? { ref: source.ref } : {}),
    ...(source.sha ? { sha: source.sha } : {}),
  };
}

function provenanceFromEntry(entry: MarketplacePluginEntry): CodexPluginSourceProvenance {
  const provenance = entry.ambient?.provenance;
  if (!provenance) return {};
  return {
    ...(provenance.sourceType ? { sourceType: provenance.sourceType } : {}),
    ...(provenance.url ? { sourceUrl: provenance.url } : {}),
    ...(provenance.path ? { sourcePath: provenance.path } : {}),
    ...(provenance.ref ? { sourceRef: provenance.ref } : {}),
    ...(provenance.sha ? { sourceSha: provenance.sha } : {}),
  };
}

function marketplaceMetadataFromEntry(entry: MarketplacePluginEntry): CodexPluginMarketplaceMetadata {
  const manifest = entry.manifest ? remoteManifestSchema.safeParse(entry.manifest) : undefined;
  const manifestData = manifest?.success ? manifest.data : undefined;
  return marketplaceMetadataFields(entry.ambient?.marketplace, {
    publisher: entry.publisher ?? authorName(manifestData?.author),
    license: entry.license ?? manifestData?.license,
  });
}

function marketplaceMetadataFields(
  metadata: AmbientMarketplaceMetadata | undefined,
  fallback: { publisher?: string; license?: string } = {},
): CodexPluginMarketplaceMetadata {
  const compatibility = metadata?.compatibility;
  const publisher = metadata?.publisher ?? fallback.publisher;
  const license = metadata?.license ?? fallback.license;
  return {
    ...(publisher ? { publisher } : {}),
    ...(license ? { license } : {}),
    ...(metadata?.checksum ? { sourceChecksum: metadata.checksum } : {}),
    ...(metadata?.bundleChecksum ? { sourceBundleChecksum: metadata.bundleChecksum } : {}),
    ...(metadata?.capabilitySummary?.length ? { capabilitySummary: metadata.capabilitySummary } : {}),
    ...(compatibility?.status ? { ambientCompatibility: compatibility.status } : {}),
    ...(compatibility?.tier ? { ambientCompatibilityTier: compatibility.tier } : {}),
    ...(compatibility?.notes?.length ? { ambientCompatibilityNotes: compatibility.notes } : {}),
    ...(compatibility?.supportLabels?.length ? { ambientSupportLabels: compatibility.supportLabels } : {}),
  };
}

function marketplaceMetadataForManifest(manifest: z.infer<typeof manifestSchema>): CodexPluginMarketplaceMetadata {
  const author = authorName(manifest.author);
  return {
    ...(author ? { author, publisher: author } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
  };
}

function marketplaceKindFromMetadata(
  metadata: Pick<CodexPluginSummary, "ambientCompatibility" | "ambientCompatibilityTier" | "sourceChecksum" | "capabilitySummary">,
  fallback: CodexMarketplaceSourceKind,
): CodexMarketplaceSourceKind {
  return metadata.ambientCompatibility || metadata.ambientCompatibilityTier || metadata.sourceChecksum || metadata.capabilitySummary?.length
    ? "ambient-curated"
    : fallback;
}

function marketplaceKindFromEntry(entry: MarketplacePluginEntry): CodexMarketplaceSourceKind {
  return marketplaceKindFromMetadata(marketplaceMetadataFromEntry(entry), "remote");
}

function marketplaceKindFromPlugins(plugins: unknown[]): CodexMarketplaceSourceKind {
  return plugins.some((plugin) => {
    const parsed = marketplacePluginSchema.safeParse(plugin);
    return parsed.success && marketplaceKindFromEntry(parsed.data) === "ambient-curated";
  })
    ? "ambient-curated"
    : "remote";
}

function authorName(author: z.infer<typeof authorSchema> | undefined): string | undefined {
  if (!author) return undefined;
  if (typeof author === "string") return author;
  return author.name;
}

function authPolicyFromEntry(entry: MarketplacePluginEntry): string | undefined {
  return entry.authPolicy ?? entry.policy?.authentication;
}

function ambientMarketplaceFromSummary(plugin: CodexPluginSummary): AmbientMarketplaceMetadata | undefined {
  if (
    !plugin.publisher &&
    !plugin.license &&
    !plugin.sourceChecksum &&
    !plugin.sourceBundleChecksum &&
    !plugin.capabilitySummary?.length &&
    !plugin.ambientCompatibility &&
    !plugin.ambientCompatibilityTier &&
    !plugin.ambientCompatibilityNotes?.length &&
    !plugin.ambientSupportLabels?.length
  ) {
    return undefined;
  }
  return {
    ...(plugin.publisher ? { publisher: plugin.publisher } : {}),
    ...(plugin.license ? { license: plugin.license } : {}),
    ...(plugin.sourceChecksum ? { checksum: plugin.sourceChecksum } : {}),
    ...(plugin.sourceBundleChecksum ? { bundleChecksum: plugin.sourceBundleChecksum } : {}),
    ...(plugin.capabilitySummary?.length ? { capabilitySummary: plugin.capabilitySummary } : {}),
    ...(plugin.ambientCompatibility || plugin.ambientCompatibilityTier || plugin.ambientCompatibilityNotes?.length || plugin.ambientSupportLabels?.length
      ? {
          compatibility: {
            ...(plugin.ambientCompatibility ? { status: plugin.ambientCompatibility } : {}),
            ...(plugin.ambientCompatibilityTier ? { tier: plugin.ambientCompatibilityTier } : {}),
            ...(plugin.ambientCompatibilityNotes?.length ? { notes: plugin.ambientCompatibilityNotes } : {}),
            ...(plugin.ambientSupportLabels?.length ? { supportLabels: plugin.ambientSupportLabels } : {}),
          },
        }
      : {}),
  };
}

function ambientProvenanceFromSummary(plugin: CodexPluginSourceProvenance): AmbientPluginProvenance | undefined {
  const provenance = {
    ...(plugin.sourceType ? { sourceType: plugin.sourceType } : {}),
    ...(plugin.sourceUrl ? { url: plugin.sourceUrl } : {}),
    ...(plugin.sourcePath ? { path: plugin.sourcePath } : {}),
    ...(plugin.sourceRef ? { ref: plugin.sourceRef } : {}),
    ...(plugin.sourceSha ? { sha: plugin.sourceSha } : {}),
  };
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

function resolveMarketplacePath(workspacePath: string, sourcePath: string): string {
  return resolve(workspacePath, sourcePath);
}

function resolveOptionalPluginPath(pluginRoot: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith("./")) return undefined;
  const resolved = resolve(pluginRoot, path);
  return isPathInside(pluginRoot, resolved) ? resolved : undefined;
}

async function discoverCodexPluginCache(cacheRoot: string, workspacePlugins: CodexPluginSummary[]): Promise<CodexPluginSummary[]> {
  const manifests = await findPluginManifestPaths(cacheRoot, 6);
  const importedNames = new Set(workspacePlugins.map((plugin) => plugin.name));
  const candidates: CodexPluginSummary[] = [];

  for (const manifestPath of manifests) {
    const rootPath = dirname(dirname(manifestPath));
    try {
      const manifest = manifestSchema.parse(await readJson(manifestPath));
      const skills = await discoverSkills(rootPath, manifest.skills);
      const mcpServers = await discoverMcpServers(rootPath, manifest.mcpServers);
      const dependencyStatus = await discoverPluginDependencyStatus(rootPath, mcpServers);
      const appsPath = resolveOptionalPluginPath(rootPath, manifest.apps);
      const appDiscovery = await discoverApps(appsPath);
      const manifestMetadata = marketplaceMetadataForManifest(manifest);
      candidates.push(
        withCompatibility({
          id: cachePluginId(cacheRoot, rootPath),
          name: manifest.name,
          version: manifest.version,
          description: manifest.interface?.shortDescription ?? manifest.description,
          marketplaceName: cacheMarketplaceName(cacheRoot, rootPath),
          marketplacePath: "~/.codex/plugins/cache",
          rootPath,
          marketplaceKind: "workspace",
          sourceKind: "codex-cache",
          category: manifest.interface?.category,
          displayName: manifest.interface?.displayName,
          skills,
          mcpServers,
          ...(dependencyStatus ? { dependencyStatus } : {}),
          ...(appsPath ? { appsPath, apps: appDiscovery.apps } : {}),
          imported: importedNames.has(manifest.name),
          enabled: false,
          trusted: false,
          errors: appDiscovery.errors,
          ...manifestMetadata,
        }),
      );
    } catch (error) {
      candidates.push(
        withCompatibility({
          id: cachePluginId(cacheRoot, rootPath),
          name: basename(rootPath),
          version: basename(rootPath),
          description: "",
          marketplaceName: cacheMarketplaceName(cacheRoot, rootPath),
          marketplacePath: "~/.codex/plugins/cache",
          rootPath,
          marketplaceKind: "workspace",
          sourceKind: "codex-cache",
          skills: [],
          mcpServers: [],
          enabled: false,
          trusted: false,
          errors: [errorMessage(error)],
        }),
      );
    }
  }

  return candidates.sort((left, right) => {
    const tier = tierRank(left.compatibilityTier) - tierRank(right.compatibilityTier);
    return tier || (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name);
  });
}

async function discoverRemoteCodexMarketplaces(
  workspacePath: string,
  workspacePlugins: CodexPluginSummary[],
): Promise<{ marketplaces: string[]; marketplaceSources: NonNullable<CodexPluginCatalog["marketplaceSources"]>; candidates: CodexPluginSummary[]; errors: string[] }> {
  const sources = await remoteMarketplaceSources(workspacePath);
  const candidates: CodexPluginSummary[] = [];
  const marketplaces: string[] = [];
  const marketplaceSources: NonNullable<CodexPluginCatalog["marketplaceSources"]> = [];
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const rawMarketplace = await readRemoteMarketplaceJson(source);
      let signatureVerification: AmbientCuratedMarketplaceSignatureVerification | undefined;
      if (source.marketplaceKindHint === "ambient-curated") {
        validateAmbientCuratedMarketplace(rawMarketplace.value);
        signatureVerification = await verifyRemoteAmbientCuratedMarketplaceSignature(source, rawMarketplace);
      }
      const marketplace = marketplaceSchema.parse(rawMarketplace.value);
      const marketplaceKind = source.marketplaceKindHint ?? marketplaceKindFromPlugins(marketplace.plugins);
      marketplaceSources.push({
        id: source.key,
        label: source.label,
        source: source.removeSource,
        kind: marketplaceKind,
        removable: source.removable,
        pluginCount: marketplace.plugins.length,
        contentChecksum: rawMarketplace.contentChecksum,
        ...(signatureVerification?.status ? { signatureStatus: signatureVerification.status } : {}),
        ...(signatureVerification?.keyId ? { signatureKeyId: signatureVerification.keyId } : {}),
        ...(signatureVerification?.generatedAt ? { signatureGeneratedAt: signatureVerification.generatedAt } : {}),
        ...(signatureVerification?.error ? { signatureError: signatureVerification.error } : {}),
      });
      const displayName = marketplace.interface?.displayName ?? marketplace.name;
      marketplaces.push(`Remote: ${displayName}`);
      for (const rawPlugin of marketplace.plugins) {
        try {
          const entry = marketplacePluginSchema.parse(rawPlugin);
          const descriptor = sourceDescriptorFromEntry(entry.source);
          if (descriptor.kind === "local") {
            errors.push(`${source.label}: ${entry.name}: remote browsing needs a Git-backed plugin source.`);
            continue;
          }
          candidates.push(
            remotePluginCandidate(
              source,
              marketplace.name,
              displayName,
              source.marketplaceKindHint ?? marketplaceKindFromEntry(entry),
              entry,
              descriptor,
              workspacePlugins,
            ),
          );
        } catch (error) {
          errors.push(`${source.label}: ${errorMessage(error)}`);
        }
      }
    } catch (error) {
      const signatureStatus = curatedMarketplaceSignatureErrorStatus(source, error);
      marketplaceSources.push({
        id: source.key,
        label: source.label,
        source: source.removeSource,
        kind: source.marketplaceKindHint ?? "remote",
        removable: source.removable,
        ...(signatureStatus ? { signatureStatus, signatureError: errorMessage(error) } : {}),
      });
      errors.push(`${source.label}: ${errorMessage(error)}`);
    }
  }

  candidates.sort((left, right) => {
    const tier = tierRank(left.compatibilityTier) - tierRank(right.compatibilityTier);
    return tier || (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name);
  });
  return { marketplaces, marketplaceSources, candidates, errors };
}

async function registerRemoteCodexPlugin(workspacePath: string, pluginIdToRegister: string): Promise<CodexPluginSummary> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const { candidates } = await discoverRemoteCodexMarketplaces(workspacePath, []);
  const candidate = candidates.find((plugin) => plugin.id === pluginIdToRegister);
  if (!candidate) throw new Error("Remote Codex plugin candidate was not found.");
  if (!candidate.sourceType) throw new Error("Remote Codex plugin candidate has no source metadata.");
  if (canInstallRemoteGitCandidate(candidate)) return installRemoteGitCodexPlugin(workspacePath, candidate);

  const source = {
    source: candidate.sourceType,
    ...(candidate.sourceUrl ? { url: candidate.sourceUrl } : {}),
    ...(candidate.sourcePath ? { path: candidate.sourcePath } : {}),
    ...(candidate.sourceRef ? { ref: candidate.sourceRef } : {}),
    ...(candidate.sourceSha ? { sha: candidate.sourceSha } : {}),
  };
  await upsertLocalImportMarketplace(workspacePath, {
    name: candidate.name,
    source,
    category: candidate.category,
    displayName: candidate.displayName,
    description: candidate.description,
    version: candidate.version === "remote" ? undefined : candidate.version,
    authPolicy: candidate.authPolicy,
    marketplaceMetadata: ambientMarketplaceFromSummary(candidate),
  });

  const marketplaceMetadata = ambientMarketplaceFromSummary(candidate);
  return loadMarketplacePlugin({
    workspacePath,
    marketplaceRootPath: managedWorkspace,
    marketplacePath: managedWorkspace === resolve(workspacePath) ? localImportMarketplacePath : appLocalImportMarketplacePath,
    marketplaceName: "ambient-local-imports",
    marketplaceDisplayName: "Ambient Local Imports",
    rawPlugin: {
      name: candidate.name,
      source,
      ...(candidate.version && candidate.version !== "remote" ? { version: candidate.version } : {}),
      ...(candidate.description ? { description: candidate.description } : {}),
      ...(candidate.category ? { category: candidate.category } : {}),
      ...(candidate.displayName ? { interface: { displayName: candidate.displayName, shortDescription: candidate.description, category: candidate.category } } : {}),
      ...(candidate.authPolicy ? { policy: { authentication: candidate.authPolicy } } : {}),
      ...(marketplaceMetadata ? { ambient: { marketplace: marketplaceMetadata } } : {}),
    },
  });
}

function selectPreviewInstallCandidate(
  preview: CodexPluginInstallPreview,
  selector: { pluginId?: string; pluginName?: string },
): CodexPluginSummary {
  if (selector.pluginId) {
    const candidate = preview.candidates.find((plugin) => plugin.id === selector.pluginId);
    if (!candidate) throw new Error(`Codex plugin install source did not include pluginId "${selector.pluginId}".`);
    return candidate;
  }

  if (selector.pluginName) {
    const matches = preview.candidates.filter(
      (plugin) => plugin.name === selector.pluginName || plugin.displayName === selector.pluginName,
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Codex plugin name "${selector.pluginName}" matched multiple candidates. Specify pluginId.`);
    throw new Error(`Codex plugin install source did not include pluginName "${selector.pluginName}".`);
  }

  if (preview.candidates.length === 1) return preview.candidates[0];
  if (!preview.candidates.length) throw new Error("Codex plugin install source did not include any plugin candidates.");
  throw new Error("Codex plugin install source includes multiple candidates. Specify pluginId or pluginName.");
}

async function installRemoteGitCodexPlugin(workspacePath: string, candidate: CodexPluginSummary): Promise<CodexPluginSummary> {
  if (!candidate.sourceUrl) throw new Error("Remote Codex plugin candidate has no Git URL.");
  const curatedGitInstall = candidate.marketplaceKind === "ambient-curated";
  if (curatedGitInstall) validateCuratedGitInstallCandidate(candidate);
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  await assertRemoteGitInstallUrlAllowed(candidate);
  const sourceRoot = remoteGitCloneSource(candidate.sourceUrl);
  const importName = safeImportName(candidate.name, `${candidate.version || "remote"}-${shortHash(remoteSourceInstallKey(candidate))}`, candidate.rootPath);
  const destination = resolve(managedWorkspace, localImportRoot, importName);
  if (!isPathInside(managedWorkspace, destination)) throw new Error("Resolved remote plugin import path is outside Ambient-managed install state.");

  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    const repoPath = join(destination, "repo");
    await git(["clone", "--quiet", sourceRoot, repoPath], workspacePath);
    if (candidate.sourceSha) await git(["-C", repoPath, "checkout", "--quiet", candidate.sourceSha], workspacePath);
    else if (candidate.sourceRef) await git(["-C", repoPath, "checkout", "--quiet", candidate.sourceRef], workspacePath);
    if (curatedGitInstall && candidate.sourceSha) await verifyGitCheckoutSha(repoPath, candidate.sourceSha);

    const pluginRoot = resolveRemotePluginRoot(repoPath, candidate.sourcePath);
    if (!pluginRoot) throw new Error("Remote plugin source path resolved outside the cloned repository.");
    const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
    if (!existsSync(manifestPath)) throw new Error("Remote plugin is missing .codex-plugin/plugin.json after clone.");
    if (candidate.sourceBundleChecksum) await verifyPluginBundleChecksum(pluginRoot, candidate.sourceBundleChecksum);

    const relativeImportPath = `./${relative(managedWorkspace, pluginRoot).split(sep).join("/")}`;
    const provenance = ambientProvenanceFromSummary(candidate);
    const priorImportDirectories = await priorRemoteGitImportDirectories(workspacePath, candidate, destination);
    await upsertLocalImportMarketplace(workspacePath, {
      name: candidate.name,
      source: { source: "local", path: relativeImportPath },
      category: candidate.category,
      displayName: candidate.displayName,
      description: candidate.description,
      version: candidate.version === "remote" ? undefined : candidate.version,
      authPolicy: candidate.authPolicy,
      provenance,
      marketplaceMetadata: ambientMarketplaceFromSummary(candidate),
    });
    await removeImportDirectories(priorImportDirectories);

    const marketplaceMetadata = ambientMarketplaceFromSummary(candidate);
    return loadMarketplacePlugin({
      workspacePath,
      marketplaceRootPath: managedWorkspace,
      marketplacePath: managedWorkspace === resolve(workspacePath) ? localImportMarketplacePath : appLocalImportMarketplacePath,
      marketplaceName: "ambient-local-imports",
      marketplaceDisplayName: "Ambient Local Imports",
      rawPlugin: {
        name: candidate.name,
        source: { source: "local", path: relativeImportPath },
        ...(candidate.version && candidate.version !== "remote" ? { version: candidate.version } : {}),
        ...(candidate.description ? { description: candidate.description } : {}),
        ...(candidate.category ? { category: candidate.category } : {}),
        ...(candidate.displayName ? { interface: { displayName: candidate.displayName, shortDescription: candidate.description, category: candidate.category } } : {}),
        ...(candidate.authPolicy ? { policy: { authentication: candidate.authPolicy } } : {}),
        ...(provenance || marketplaceMetadata
          ? { ambient: { ...(provenance ? { provenance } : {}), ...(marketplaceMetadata ? { marketplace: marketplaceMetadata } : {}) } }
          : {}),
      },
    });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

function canInstallRemoteGitCandidate(candidate: CodexPluginSummary): boolean {
  if (!candidate.sourceType?.startsWith("git")) return false;
  if (!candidate.sourceUrl) return false;
  return isLocalGitSource(candidate.sourceUrl);
}

async function assertRemoteGitInstallUrlAllowed(candidate: CodexPluginSummary): Promise<void> {
  if (!candidate.sourceUrl || isLocalGitSource(candidate.sourceUrl)) return;
  await assertAllowedUrlEgressWithDns(candidate.sourceUrl, {
    useCase: "plugin-install",
    allowLocalDevLoopbackHttp: allowLocalDevUrlEgressFromEnv(),
    dnsTimeoutMs: remoteMarketplaceTimeoutMs,
  });
}

function validateCuratedGitInstallCandidate(candidate: CodexPluginSummary): void {
  if (!candidate.sourceSha) throw new Error("Ambient curated Git plugin installs require a pinned source.sha.");
  if (!/^[a-f0-9]{40}$/i.test(candidate.sourceSha)) {
    throw new Error("Ambient curated Git plugin installs require source.sha to be a full 40-character commit SHA.");
  }
}

async function verifyGitCheckoutSha(repoPath: string, expectedSha: string): Promise<void> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "HEAD"], {
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 1024 * 1024,
  });
  const actualSha = String(stdout).trim();
  if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(`Remote Git plugin checkout SHA mismatch: expected ${expectedSha}, got ${actualSha}.`);
  }
}

function remoteGitCloneSource(url: string): string {
  if (url.startsWith("file://")) return fileURLToPath(url);
  return url;
}

function isLocalGitSource(url: string): boolean {
  if (url.startsWith("file://")) return true;
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) return true;
  return false;
}

function resolveRemotePluginRoot(repoPath: string, sourcePath: string | undefined): string | undefined {
  const pluginRoot = sourcePath ? resolve(repoPath, sourcePath) : repoPath;
  return isPathInside(repoPath, pluginRoot) ? pluginRoot : undefined;
}

async function verifyPluginBundleChecksum(pluginRoot: string, expectedChecksum: string): Promise<void> {
  const actualChecksum = await pluginBundleChecksum(pluginRoot);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(`Remote plugin bundle checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}.`);
  }
}

async function pluginBundleChecksum(pluginRoot: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = join(directory, entry.name);
      const relativePath = relative(pluginRoot, fullPath).split(sep).join("/");
      if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0`);
        await visit(fullPath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`);
        hash.update(await readFile(fullPath));
        hash.update("\0");
      }
    }
  }
  await visit(pluginRoot);
  return `sha256:${hash.digest("hex")}`;
}

function remoteSourceInstallKey(candidate: CodexPluginSummary): string {
  return [candidate.sourceType, candidate.sourceUrl, candidate.sourcePath, candidate.sourceRef, candidate.sourceSha].filter(Boolean).join(":");
}

async function git(args: string[], cwd: string): Promise<void> {
  try {
    await execFileAsync("git", args, {
      cwd,
      timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`git ${args.join(" ")} failed: ${errorMessage(error)}`);
  }
}

function remotePluginCandidate(
  source: RemoteMarketplaceSource,
  marketplaceName: string,
  marketplaceDisplayName: string,
  marketplaceKind: CodexMarketplaceSourceKind,
  entry: MarketplacePluginEntry,
  descriptor: Extract<PluginSourceDescriptor, { kind: "remote" }>,
  workspacePlugins: CodexPluginSummary[],
): CodexPluginSummary {
  const metadata = pluginEntryMetadata(entry);
  const marketplaceMetadata = marketplaceMetadataFromEntry(entry);
  const imported = workspacePlugins.some((plugin) => remotePluginMatches(plugin, metadata.name, descriptor, marketplaceMetadata));
  const updateAvailable = !imported && workspacePlugins.some((plugin) => remotePluginLineageMatches(plugin, metadata.name, descriptor));
  return withCompatibility({
    id: remotePluginId(source.key, marketplaceName, entry.name),
    name: metadata.name,
    version: metadata.version ?? "remote",
    description: metadata.description ?? "",
    marketplaceName: marketplaceDisplayName,
    marketplacePath: source.label,
    marketplaceKind,
    rootPath: remoteSourceLabel(descriptor),
    sourceKind: "remote-marketplace",
    category: metadata.category,
    displayName: metadata.displayName,
    authPolicy: authPolicyFromEntry(entry),
    skills: [],
    mcpServers: [],
    imported,
    updateAvailable,
    enabled: false,
    trusted: false,
    errors: [],
    sourceType: descriptor.sourceType,
    sourceUrl: descriptor.url,
    sourcePath: descriptor.path,
    sourceRef: descriptor.ref,
    sourceSha: descriptor.sha,
    ...marketplaceMetadata,
  });
}

function pluginEntryMetadata(entry: MarketplacePluginEntry): {
  name: string;
  version?: string;
  description?: string;
  displayName?: string;
  category?: string;
} {
  const manifest = entry.manifest ? remoteManifestSchema.safeParse(entry.manifest) : undefined;
  const manifestData = manifest?.success ? manifest.data : undefined;
  const displayName = manifestData?.interface?.displayName ?? entry.interface?.displayName;
  const description = manifestData?.interface?.shortDescription ?? entry.interface?.shortDescription ?? manifestData?.description ?? entry.description;
  const category = manifestData?.interface?.category ?? entry.interface?.category ?? entry.category;
  return {
    name: manifestData?.name ?? entry.name,
    version: manifestData?.version ?? entry.version,
    ...(description ? { description } : {}),
    ...(displayName ? { displayName } : {}),
    ...(category ? { category } : {}),
  };
}

async function remoteMarketplaceSources(workspacePath: string): Promise<RemoteMarketplaceSource[]> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const sources: RemoteMarketplaceSource[] = [];
  const allowUnsignedCuratedMarketplace = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_ALLOW_UNSIGNED === "1";
  const curatedSignaturePolicy: RemoteMarketplaceSignaturePolicy = allowUnsignedCuratedMarketplace ? "optional-dev" : "required";
  const curatedEnvPath = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_PATH;
  if (curatedEnvPath && curatedEnvPath !== "0") {
    sources.push(remotePathSource(curatedEnvPath, "Ambient curated marketplace", false, curatedEnvPath, "ambient-curated", curatedSignaturePolicy));
  }
  const curatedEnvUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_URL;
  if (curatedEnvUrl && curatedEnvUrl !== "0") {
    sources.push(remoteUrlSource(curatedEnvUrl, "Ambient curated marketplace", false, curatedEnvUrl, "ambient-curated", curatedSignaturePolicy));
  }
  const hasExplicitCuratedSource = curatedEnvPath !== undefined || curatedEnvUrl !== undefined;
  const defaultCuratedUrl = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL ?? ambientCuratedMarketplaceDefaultUrl;
  if (!hasExplicitCuratedSource && defaultCuratedUrl !== "0" && process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_DISABLE_DEFAULT !== "1") {
    sources.push(remoteUrlSource(defaultCuratedUrl, "Ambient curated marketplace", false, defaultCuratedUrl, "ambient-curated", "required"));
  }
  const envPath = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH;
  if (envPath && envPath !== "0") sources.push(remotePathSource(envPath, "Configured remote marketplace"));
  const envUrl = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACE_URL;
  if (envUrl && envUrl !== "0") sources.push(remoteUrlSource(envUrl, "Configured remote marketplace"));
  const envList = process.env.AMBIENT_CODEX_REMOTE_MARKETPLACES;
  if (envList && envList !== "0") sources.push(...parseRemoteMarketplaceList(envList));

  const configPath = join(managedWorkspace, remoteMarketplaceConfigPath);
  if (existsSync(configPath)) {
    const config = remoteMarketplaceConfigSchema.parse(await readJson(configPath));
    sources.push(...config.marketplaces.flatMap((entry) => remoteSourceFromConfigEntry(entry, managedWorkspace, true)));
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.key)) return false;
    seen.add(source.key);
    return true;
  });
}

function marketplaceSourceConfigFromInput(source: string, name: string | undefined): RemoteMarketplaceConfigEntry {
  if (isLocalMarketplaceSource(source)) return { ...(name ? { name } : {}), path: normalizeLocalMarketplacePath(source) };
  const githubRaw = githubMarketplaceUrl(source);
  if (githubRaw) return { ...(name ? { name } : {}), url: githubRaw };
  if (isHttpUrl(source)) return { ...(name ? { name } : {}), url: source };
  return { ...(name ? { name } : {}), path: normalizeLocalMarketplacePath(source) };
}

function requiresExperimentalMarketplaceSource(source: string): boolean {
  return isHttpUrl(source) && !isGithubMarketplaceSource(source);
}

function isLocalMarketplaceSource(source: string): boolean {
  const trimmed = source.trim();
  if (isHttpUrl(trimmed)) return false;
  return trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("~") || trimmed.endsWith(".json") || existsSync(trimmed);
}

function normalizeLocalMarketplacePath(source: string): string {
  const trimmed = expandUserPath(source.trim());
  if (trimmed.endsWith(".json")) return trimmed;
  if (existsSync(trimmed)) {
    try {
      const stats = statSync(trimmed);
      if (stats?.isDirectory()) return join(trimmed, "marketplace.json");
    } catch {
      return trimmed;
    }
  }
  return trimmed.endsWith("/") ? `${trimmed}marketplace.json` : trimmed;
}

function expandUserPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith(`~${sep}`) || path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function githubMarketplaceUrl(source: string): string | undefined {
  const trimmed = source.trim().replace(/^github:/i, "");
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) return githubRawUrl(ssh[1], ssh[2], "main", "marketplace.json");

  const url = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)\/(.+))?\/?$/i);
  if (url) return githubRawUrl(url[1], url[2], url[3] ?? "main", url[4] ?? "marketplace.json");

  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/);
  if (!shorthand) return undefined;
  return githubRawUrl(shorthand[1], shorthand[2], "main", shorthand[3] ?? "marketplace.json");
}

function isGithubMarketplaceSource(source: string): boolean {
  const trimmed = source.trim();
  return Boolean(githubMarketplaceUrl(trimmed)) || /^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.+/i.test(trimmed);
}

function githubRawUrl(owner: string, repo: string, ref: string, path: string): string {
  const safeRepo = repo.replace(/\.git$/i, "");
  const safePath = path || "marketplace.json";
  return `https://raw.githubusercontent.com/${owner}/${safeRepo}/${ref}/${safePath}`;
}

function remoteMarketplaceConfigEntryMatches(entry: RemoteMarketplaceConfigEntry, candidate: RemoteMarketplaceConfigEntry): boolean {
  const entryKey = remoteMarketplaceConfigEntryKey(entry);
  return Boolean(entryKey && entryKey === remoteMarketplaceConfigEntryKey(candidate));
}

function remoteMarketplaceConfigEntryKey(entry: RemoteMarketplaceConfigEntry): string | undefined {
  if (typeof entry === "string") return isHttpUrl(entry) ? `url:${entry}` : `path:${entry}`;
  if (entry.url) return `url:${entry.url}`;
  if (entry.path) return `path:${entry.path}`;
  return undefined;
}

function parseRemoteMarketplaceList(value: string): RemoteMarketplaceSource[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries.flatMap((entry) => remoteSourceFromConfigEntry(entry, process.cwd(), false));
  }
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => remoteSourceFromConfigEntry(entry, process.cwd(), false));
}

function remoteSourceFromConfigEntry(entry: unknown, workspacePath: string, removable: boolean): RemoteMarketplaceSource[] {
  if (typeof entry === "string") {
    return [isHttpUrl(entry) ? remoteUrlSource(entry, entry, removable, entry) : remotePathSource(resolve(workspacePath, entry), entry, removable, entry)];
  }
  if (!entry || typeof entry !== "object") return [];
  const raw = entry as { name?: unknown; path?: unknown; url?: unknown };
  const label = typeof raw.name === "string" ? raw.name : undefined;
  if (typeof raw.url === "string" && raw.url) return [remoteUrlSource(raw.url, label ?? raw.url, removable, raw.url)];
  if (typeof raw.path === "string" && raw.path) return [remotePathSource(resolve(workspacePath, raw.path), label ?? raw.path, removable, raw.path)];
  return [];
}

function remotePathSource(
  path: string,
  label: string,
  removable = false,
  removeSource = path,
  marketplaceKindHint?: CodexMarketplaceSourceKind,
  signaturePolicy?: RemoteMarketplaceSignaturePolicy,
): RemoteMarketplaceSource {
  const resolved = resolve(path);
  return {
    kind: "path",
    path: resolved,
    key: `path:${resolved}`,
    label,
    removeSource,
    removable,
    ...(marketplaceKindHint ? { marketplaceKindHint } : {}),
    ...(signaturePolicy ? { signaturePolicy } : {}),
  };
}

function remoteUrlSource(
  url: string,
  label: string,
  removable = false,
  removeSource = url,
  marketplaceKindHint?: CodexMarketplaceSourceKind,
  signaturePolicy?: RemoteMarketplaceSignaturePolicy,
): RemoteMarketplaceSource {
  return {
    kind: "url",
    url,
    key: `url:${url}`,
    label,
    removeSource,
    removable,
    ...(marketplaceKindHint ? { marketplaceKindHint } : {}),
    ...(signaturePolicy ? { signaturePolicy } : {}),
  };
}

async function readRemoteMarketplaceJson(source: RemoteMarketplaceSource): Promise<RemoteMarketplaceReadResult> {
  if (source.kind === "path") {
    const content = await readFile(source.path, "utf8");
    return { value: JSON.parse(content), content, contentChecksum: sha256Digest(content) };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteMarketplaceTimeoutMs);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const fetched = await fetchWithUrlEgressPolicy(source.url, { signal: controller.signal }, {
      useCase: "plugin-preview",
      allowLocalDevLoopbackHttp: allowLocalDevUrlEgressFromEnv(),
      dnsTimeoutMs: remoteMarketplaceTimeoutMs,
    });
    cleanup = fetched.cleanup;
    const { response } = fetched;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    return { value: JSON.parse(content), content, contentChecksum: sha256Digest(content) };
  } finally {
    await cleanup?.();
    clearTimeout(timeout);
  }
}

async function verifyRemoteAmbientCuratedMarketplaceSignature(
  source: RemoteMarketplaceSource,
  marketplace: RemoteMarketplaceReadResult,
): Promise<AmbientCuratedMarketplaceSignatureVerification> {
  const signature = await readRemoteMarketplaceSignatureJson(source);
  if (!signature) {
    if (source.signaturePolicy === "optional-dev") {
      return {
        status: "unsigned-dev",
        error: "Unsigned local/dev Ambient curated marketplace source.",
      };
    }
    throw new Error("Ambient curated marketplace signature is missing.");
  }
  return verifyAmbientCuratedMarketplaceSignature({
    marketplaceContent: marketplace.content,
    marketplace: marketplace.value,
    signature,
    trustedPublicKeys: ambientCuratedMarketplaceTrustedPublicKeysFromEnv(),
  });
}

async function readRemoteMarketplaceSignatureJson(source: RemoteMarketplaceSource): Promise<unknown | undefined> {
  if (source.kind === "path") {
    const signaturePath = signaturePathForMarketplacePath(source.path);
    if (!existsSync(signaturePath)) return undefined;
    return readJson(signaturePath);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteMarketplaceTimeoutMs);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const fetched = await fetchWithUrlEgressPolicy(signatureUrlForMarketplaceUrl(source.url), { signal: controller.signal }, {
      useCase: "plugin-preview",
      allowLocalDevLoopbackHttp: allowLocalDevUrlEgressFromEnv(),
      dnsTimeoutMs: remoteMarketplaceTimeoutMs,
    });
    cleanup = fetched.cleanup;
    const { response } = fetched;
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(await response.text());
  } finally {
    await cleanup?.();
    clearTimeout(timeout);
  }
}

function signaturePathForMarketplacePath(marketplacePath: string): string {
  return join(dirname(marketplacePath), ambientCuratedMarketplaceSignatureFileName);
}

function signatureUrlForMarketplaceUrl(marketplaceUrl: string): string {
  if (/\/marketplace\.json(?:[?#].*)?$/i.test(marketplaceUrl)) return marketplaceUrl.replace(/\/marketplace\.json(?=([?#].*)?$)/i, `/${ambientCuratedMarketplaceSignatureFileName}`);
  return `${marketplaceUrl.replace(/\/$/, "")}.${ambientCuratedMarketplaceSignatureFileName}`;
}

function curatedMarketplaceSignatureErrorStatus(
  source: RemoteMarketplaceSource,
  error: unknown,
): AmbientCuratedMarketplaceSignatureVerification["status"] | undefined {
  if (source.marketplaceKindHint !== "ambient-curated") return undefined;
  const message = errorMessage(error).toLowerCase();
  if (!message.includes("signature")) return undefined;
  return message.includes("missing") ? "missing" : "invalid";
}

function remotePluginMatches(
  plugin: CodexPluginSummary,
  name: string,
  source: Extract<PluginSourceDescriptor, { kind: "remote" }>,
  metadata: CodexPluginMarketplaceMetadata,
): boolean {
  return (
    remotePluginLineageMatches(plugin, name, source) &&
    (plugin.sourceRef || "") === (source.ref || "") &&
    (plugin.sourceSha || "") === (source.sha || "") &&
    (plugin.sourceChecksum || "") === (metadata.sourceChecksum || "")
  );
}

function remotePluginLineageMatches(plugin: CodexPluginSummary, name: string, source: Extract<PluginSourceDescriptor, { kind: "remote" }>): boolean {
  if (plugin.name !== name) return false;
  return (
    (plugin.sourceType || "") === (source.sourceType || "") &&
    (plugin.sourceUrl || "") === (source.url || "") &&
    (plugin.sourcePath || "") === (source.path || "")
  );
}

function remoteSourceLabel(source: Extract<PluginSourceDescriptor, { kind: "remote" }>): string {
  return [
    source.sourceType,
    source.url,
    source.path,
    source.ref ? `ref ${source.ref}` : undefined,
    source.sha ? `sha ${source.sha}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function remotePluginId(sourceKey: string, marketplaceName: string, pluginName: string): string {
  return `remote-marketplace:${shortHash(`${sourceKey}:${marketplaceName}:${pluginName}`)}`;
}

async function findPluginManifestPaths(root: string, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  async function visit(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".codex-plugin") {
          const manifestPath = join(fullPath, "plugin.json");
          if (existsSync(manifestPath)) results.push(manifestPath);
        } else {
          await visit(fullPath, depth + 1);
        }
      }
    }
  }
  await visit(root, 0);
  return results;
}

function withCompatibility<T extends Omit<CodexPluginSummary, "compatibilityTier" | "compatibilityNotes" | "supportLabels">>(plugin: T): T & {
  compatibilityTier: CodexPluginCompatibilityTier;
  compatibilityNotes: string[];
  supportLabels: string[];
} {
  const classification = classifyCompatibility(plugin);
  return { ...plugin, ...classification };
}

function classifyCompatibility(
  plugin: Pick<
    CodexPluginSummary,
    | "name"
    | "sourceKind"
    | "skills"
    | "mcpServers"
    | "appsPath"
    | "authPolicy"
    | "dependencyStatus"
    | "errors"
    | "ambientCompatibility"
    | "ambientCompatibilityTier"
    | "capabilitySummary"
  > & {
    ambientCompatibilityNotes?: string[];
    ambientSupportLabels?: string[];
  },
): {
  compatibilityTier: CodexPluginCompatibilityTier;
  compatibilityNotes: string[];
  supportLabels: string[];
} {
  const notes: string[] = [];
  const supportLabels: string[] = [];
  if (plugin.errors.length > 0) {
    return { compatibilityTier: "unsupported", compatibilityNotes: plugin.errors, supportLabels: ["Import blocked"] };
  }
  if (plugin.sourceKind === "remote-marketplace") {
    notes.push("Remote Codex marketplace metadata is visible, but Ambient does not fetch or run remote plugin code yet.");
    notes.push("Registering this plugin records the source in this workspace's Ambient marketplace for later explicit installation.");
    if (plugin.authPolicy) notes.push(`Codex marketplace auth policy: ${plugin.authPolicy}.`);
    if (plugin.ambientCompatibility) notes.push(`Ambient marketplace compatibility: ${plugin.ambientCompatibility}.`);
    if (plugin.ambientCompatibilityNotes?.length) notes.push(...plugin.ambientCompatibilityNotes);
    if (plugin.capabilitySummary?.length) notes.push(`Marketplace capability summary: ${plugin.capabilitySummary.join(", ")}.`);
    return {
      compatibilityTier: "partial",
      compatibilityNotes: notes,
      supportLabels: [
        "Remote marketplace",
        "Ambient-owned registration",
        "Execution disabled",
        ...(plugin.ambientCompatibility || plugin.ambientCompatibilityTier ? ["Ambient curated"] : []),
        ...(plugin.ambientSupportLabels ?? []),
        ...(plugin.authPolicy ? ["Auth policy"] : []),
      ],
    };
  }
  if (plugin.authPolicy) {
    notes.push(`Codex marketplace auth policy: ${plugin.authPolicy}.`);
    supportLabels.push("Auth policy");
  }
  if (plugin.skills.length > 0) {
    notes.push("Skills can be loaded into Pi as Ambient Desktop skill paths.");
    supportLabels.push("Skill paths");
  }
  if (plugin.mcpServers.length > 0) {
    notes.push("MCP servers can run through Ambient's trusted plugin tool wrapper.");
    supportLabels.push("MCP wrapper");
  }
  if (plugin.dependencyStatus?.required) {
    if (plugin.dependencyStatus.installed) {
      notes.push("Plugin MCP dependencies are installed.");
      supportLabels.push("Dependencies ready");
    } else {
      notes.push("Plugin MCP dependencies require explicit installation before MCP servers can run.");
      supportLabels.push("Dependencies required");
    }
  }
  if (plugin.appsPath) {
    notes.push(
      "Codex app connector metadata can be authorized through Ambient when a matching provider is registered; connector operations remain gated on an Ambient connector bridge.",
    );
    supportLabels.push("Connector auth");
  }
  if (plugin.ambientCompatibility) {
    notes.push(`Ambient marketplace compatibility: ${plugin.ambientCompatibility}.`);
    supportLabels.push("Ambient curated");
  }
  if (plugin.ambientCompatibilityNotes?.length) notes.push(...plugin.ambientCompatibilityNotes);
  if (plugin.ambientSupportLabels?.length) supportLabels.push(...plugin.ambientSupportLabels);
  if (plugin.capabilitySummary?.length) notes.push(`Marketplace capability summary: ${plugin.capabilitySummary.join(", ")}.`);

  const profile = knownCodexPluginProfile(plugin.name);
  if (profile) {
    notes.push(...profile.notes);
    supportLabels.push(...profile.supportLabels);
  }

  let compatibilityTier: CodexPluginCompatibilityTier;
  if (profile?.tier) compatibilityTier = profile.tier;
  else if (plugin.dependencyStatus?.required && !plugin.dependencyStatus.installed) compatibilityTier = "partial";
  else if (plugin.appsPath) compatibilityTier = "partial";
  else if (plugin.skills.length > 0 || plugin.mcpServers.length > 0) compatibilityTier = "supported";
  else compatibilityTier = "unsupported";

  if (compatibilityTier === "unsupported" && notes.length === 0) {
    notes.push("No supported skills or MCP servers were found.");
  }

  return {
    compatibilityTier,
    compatibilityNotes: uniqueStrings(notes),
    supportLabels: uniqueStrings(supportLabels.length > 0 ? supportLabels : ["No supported runtime"]),
  };
}

function refreshPluginCompatibility(plugin: CodexPluginSummary): CodexPluginSummary {
  return { ...plugin, ...classifyCompatibility(plugin) };
}

async function upsertLocalImportMarketplace(
  workspacePath: string,
  plugin: {
    name: string;
    source: MarketplacePluginEntry["source"];
    category?: string;
    displayName?: string;
    description?: string;
    version?: string;
    authPolicy?: string;
    provenance?: AmbientPluginProvenance;
    marketplaceMetadata?: AmbientMarketplaceMetadata;
  },
): Promise<void> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const marketplacePath = join(managedWorkspace, localImportMarketplacePath);
  await mkdir(dirname(marketplacePath), { recursive: true });
  const fallback = {
    name: "ambient-local-imports",
    interface: { displayName: "Ambient Local Imports" },
    plugins: [],
  };
  const rawMarketplace = existsSync(marketplacePath) ? await readJson(marketplacePath) : {};
  const marketplace =
    rawMarketplace && typeof rawMarketplace === "object"
      ? ({ ...fallback, ...rawMarketplace } as { name: string; interface?: { displayName?: string }; plugins?: unknown[] })
      : fallback;
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const nextPlugin = {
    name: plugin.name,
    source: plugin.source,
    ...(plugin.version ? { version: plugin.version } : {}),
    ...(plugin.description ? { description: plugin.description } : {}),
    ...(plugin.category ? { category: plugin.category } : {}),
    ...(plugin.displayName || plugin.description || plugin.category
      ? { interface: { ...(plugin.displayName ? { displayName: plugin.displayName } : {}), ...(plugin.description ? { shortDescription: plugin.description } : {}), ...(plugin.category ? { category: plugin.category } : {}) } }
      : {}),
    ...(plugin.authPolicy ? { policy: { authentication: plugin.authPolicy } } : {}),
    ...(plugin.provenance || plugin.marketplaceMetadata
      ? { ambient: { ...(plugin.provenance ? { provenance: plugin.provenance } : {}), ...(plugin.marketplaceMetadata ? { marketplace: plugin.marketplaceMetadata } : {}) } }
      : {}),
  };
  const existingIndex = plugins.findIndex((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const raw = entry as { name?: unknown; source?: unknown };
    return raw.name === plugin.name || sourcePathFromEntryLike(raw.source) === sourcePathFromEntryLike(plugin.source);
  });
  if (existingIndex >= 0) plugins[existingIndex] = nextPlugin;
  else plugins.push(nextPlugin);
  await writeFile(
    marketplacePath,
    `${JSON.stringify({ name: marketplace.name, interface: marketplace.interface ?? fallback.interface, plugins }, null, 2)}\n`,
    "utf8",
  );
}

function codexPluginCacheRoot(): string | undefined {
  if (process.env.AMBIENT_CODEX_PLUGIN_CACHE === "0") return undefined;
  return resolve(process.env.AMBIENT_CODEX_PLUGIN_CACHE || join(homedir(), ".codex", "plugins", "cache"));
}

function cachePluginId(cacheRoot: string, rootPath: string): string {
  return `codex-cache:${relative(cacheRoot, rootPath).split(sep).join("/")}`;
}

function cacheMarketplaceName(cacheRoot: string, rootPath: string): string {
  const parts = relative(cacheRoot, rootPath).split(sep);
  return parts[0] ? `Codex cache: ${parts[0]}` : "Codex cache";
}

function safeImportName(name: string, version: string, rootPath: string): string {
  const suffix = basename(rootPath);
  return `${name}-${version || suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function sourcePathFromEntryLike(source: unknown): string | undefined {
  if (typeof source === "string") return source;
  if (!source || typeof source !== "object") return undefined;
  const raw = source as { source?: unknown; path?: unknown };
  return raw.source === "local" && typeof raw.path === "string" ? raw.path : undefined;
}

async function priorRemoteGitImportDirectories(
  workspacePath: string,
  candidate: CodexPluginSummary,
  nextDestination: string,
): Promise<string[]> {
  const managedWorkspace = await ensureCodexPluginManagedInstallWorkspace(workspacePath);
  const marketplacePath = join(managedWorkspace, localImportMarketplacePath);
  if (!existsSync(marketplacePath)) return [];
  const rawMarketplace = await readJson(marketplacePath);
  if (!rawMarketplace || typeof rawMarketplace !== "object" || Array.isArray(rawMarketplace)) return [];
  const plugins = Array.isArray((rawMarketplace as { plugins?: unknown[] }).plugins) ? (rawMarketplace as { plugins: unknown[] }).plugins : [];
  const nextImportDirectory = resolve(nextDestination);
  const directories: string[] = [];
  for (const entry of plugins) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as { name?: unknown; source?: unknown; ambient?: { provenance?: AmbientPluginProvenance } };
    if (raw.name !== candidate.name) continue;
    if (!provenanceLineageMatchesCandidate(raw.ambient?.provenance, candidate)) continue;
    const sourcePath = sourcePathFromEntryLike(raw.source);
    if (!sourcePath) continue;
    const pluginRoot = resolve(managedWorkspace, sourcePath);
    const importDirectory = ambientImportDirectoryForPlugin(managedWorkspace, pluginRoot);
    if (importDirectory && resolve(importDirectory) !== nextImportDirectory) {
      directories.push(importDirectory);
    }
  }
  return uniqueStrings(directories);
}

async function removeImportDirectories(importDirectories: string[]): Promise<void> {
  for (const importDirectory of importDirectories) {
    await rm(importDirectory, { recursive: true, force: true });
  }
}

function provenanceLineageMatchesCandidate(provenance: AmbientPluginProvenance | undefined, candidate: CodexPluginSummary): boolean {
  if (!provenance) return false;
  return (
    (provenance.sourceType || "") === (candidate.sourceType || "") &&
    (provenance.url || "") === (candidate.sourceUrl || "") &&
    (provenance.path || "") === (candidate.sourcePath || "")
  );
}

function marketplaceEntryMatchesPlugin(entry: unknown, pluginName: string): boolean {
  return Boolean(entry && typeof entry === "object" && (entry as { name?: unknown }).name === pluginName);
}

function ambientImportDirectoryForPlugin(workspacePath: string, pluginRootPath: string): string | undefined {
  const importRoot = resolve(workspacePath, localImportRoot);
  const rootPath = resolve(pluginRootPath);
  if (!isPathInside(importRoot, rootPath)) return undefined;
  const [importName] = relative(importRoot, rootPath).split(sep);
  if (!importName || importName === "." || importName === "..") return undefined;
  return join(importRoot, importName);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function tierRank(tier: CodexPluginCompatibilityTier): number {
  if (tier === "supported") return 0;
  if (tier === "partial") return 1;
  return 2;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseSkillHeader(content: string): Pick<CodexPluginSkill, "name" | "description"> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "unknown" };
  const header = match[1];
  const name = header.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const description = header.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}) };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
