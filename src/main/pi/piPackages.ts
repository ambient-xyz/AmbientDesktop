import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import type { CodexPluginCompatibilityTier, InstallPiPackageInput, PiPackageCatalog, PiPackageDependencyStatus, PiPackageInstallPreview, PiPackageInstallScope, PiPackageResourceKind, PiPackageResourceSource, PiPackageResourceSummary, PiPackageSourceKind, PiPackageSummary, PreviewPiPackageInstallInput, UninstallPiPackageInput } from "../../shared/pluginTypes";
import { isPathInside } from "../session/sessionPaths";
import { managedInstallWorkspacePath, migrateWorkspaceManagedInstallPath } from "../setup/managedInstallPaths";

const piResourceKinds: PiPackageResourceKind[] = ["extension", "skill", "prompt", "theme"];
const packageJsonName = "package.json";
const defaultPiGalleryUrl = "https://pi.dev/packages";
const ambientWorkspacePiPackagesPath = ".ambient/plugins/pi-packages.json";
const ambientGlobalPiPackagesPath = join(homedir(), ".ambient", "plugins", "pi-packages.json");

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    homepage: z.string().optional(),
    repository: z.union([z.string(), z.object({ url: z.string().optional() }).passthrough()]).optional(),
    license: z.string().optional(),
    author: z.union([z.string(), z.object({ name: z.string().optional() }).passthrough()]).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    pi: z.unknown().optional(),
  })
  .passthrough();

const piSettingsSchema = z
  .object({
    packages: z.array(z.unknown()).optional(),
  })
  .passthrough();

const ambientPiPackagesSchema = z
  .object({
    packages: z
      .array(
        z.union([
          z.string().min(1),
          z.object({
            source: z.string().min(1),
            scope: z.enum(["workspace", "global"]).optional(),
          }),
        ]),
      )
      .default([]),
  })
  .passthrough();

type PackageJson = z.infer<typeof packageJsonSchema>;

export interface DiscoverPiPackagesOptions {
  isPackageEnabled?: (packageId: string) => boolean;
}

async function ensurePiPackagesManagedWorkspace(workspacePath: string): Promise<string> {
  await migrateWorkspaceManagedInstallPath(workspacePath, ambientWorkspacePiPackagesPath);
  return managedInstallWorkspacePath(workspacePath);
}

export async function discoverPiPackages(workspacePath: string, options: DiscoverPiPackagesOptions = {}): Promise<PiPackageCatalog> {
  const managedWorkspace = await ensurePiPackagesManagedWorkspace(workspacePath);
  const packages: PiPackageSummary[] = [];
  const errors: string[] = [];
  const sourceNotes = [
    "Pi packages are execution-disabled in Ambient Desktop. Installing a Pi package records an Ambient-owned source and never runs extensions or changes Pi settings.",
  ];

  const workspacePackage = await inspectPackageRoot(workspacePath, {
    sourceKind: "workspace",
    sourceLabel: "Workspace package",
    force: false,
  });
  if (workspacePackage) packages.push(workspacePackage);

  await appendAmbientManagedPackages({
    packages,
    errors,
    configPath: join(managedWorkspace, ambientWorkspacePiPackagesPath),
    basePath: managedWorkspace,
    sourceKind: "ambient-workspace",
    sourceLabel: "Ambient workspace Pi packages",
    installScope: "workspace",
  });

  await appendAmbientManagedPackages({
    packages,
    errors,
    configPath: process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH || ambientGlobalPiPackagesPath,
    basePath: dirname(process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH || ambientGlobalPiPackagesPath),
    sourceKind: "ambient-global",
    sourceLabel: "Ambient global Pi packages",
    installScope: "global",
  });

  await appendSettingsPackages({
    packages,
    errors,
    settingsPath: join(workspacePath, ".pi", "settings.json"),
    sourceKind: "project-settings",
    sourceLabel: "Project Pi settings",
  });

  await appendSettingsPackages({
    packages,
    errors,
    settingsPath: process.env.AMBIENT_PI_USER_SETTINGS_PATH || join(homedir(), ".pi", "agent", "settings.json"),
    sourceKind: "user-settings",
    sourceLabel: "User Pi settings",
  });

  const gallery = await readGalleryPackages();
  packages.push(...gallery.packages);
  errors.push(...gallery.errors);

  return {
    packages: dedupePackages(packages).map((pkg) => withPiPackageEnabledState(pkg, options)).sort(comparePackages),
    errors,
    sourceNotes,
  };
}

export async function installPiPackageSource(workspacePath: string, input: InstallPiPackageInput): Promise<PiPackageCatalog> {
  const preview = await previewPiPackageInstallSource(workspacePath, input);
  if (!preview.installable) throw new Error(`Pi package source is not installable: ${preview.errors.join("; ")}`);
  await ensurePiPackagesManagedWorkspace(workspacePath);
  const { scope, normalizedSource: source } = preview;
  const configPath = ambientPiPackageConfigPath(workspacePath, scope);
  await upsertAmbientPiPackageConfig(configPath, { source, scope });
  return discoverPiPackages(workspacePath);
}

export async function previewPiPackageInstallSource(
  workspacePath: string,
  input: PreviewPiPackageInstallInput,
): Promise<PiPackageInstallPreview> {
  const scope = input.scope ?? "workspace";
  const rawSource = input.source.trim();
  const errors: string[] = [];
  const notes: string[] = ["Preview only. Ambient will not run Pi package code or install package dependencies."];
  let normalizedSource = rawSource;
  try {
    normalizedSource = normalizeInstallSource(workspacePath, rawSource, scope);
    validateInstallSource(workspacePath, normalizedSource, scope);
  } catch (error) {
    errors.push(errorMessage(error));
  }

  const candidate = errors.length === 0 ? await previewPiPackageCandidate(workspacePath, normalizedSource, scope) : undefined;
  if (candidate?.resourceCounts.extension) {
    notes.push("This package declares executable extensions. Ambient can record the package source, but extension execution remains blocked.");
  }
  if (candidate?.dependencyStatus?.required) {
    notes.push(candidate.dependencyStatus.reason ?? "This package declares dependencies. Ambient will not install them as part of Pi package registration.");
  }
  if (candidate?.errors.length) errors.push(...candidate.errors);
  if (candidate && isLocalPackageSource(normalizedSource) && totalResources(candidate.resourceCounts) === 0) {
    errors.push("No Pi resources were declared in package metadata or conventional directories.");
  }

  return {
    source: rawSource,
    normalizedSource,
    scope,
    ...(candidate ? { candidate } : {}),
    installable: errors.length === 0,
    errors: unique(errors),
    notes: unique(notes),
  };
}

export async function uninstallPiPackageSource(workspacePath: string, input: UninstallPiPackageInput): Promise<PiPackageCatalog> {
  await ensurePiPackagesManagedWorkspace(workspacePath);
  const catalog = await discoverPiPackages(workspacePath);
  const pkg = catalog.packages.find((item) => item.id === input.packageId);
  if (!pkg) throw new Error("Pi package was not found.");
  if (!pkg.installed || !pkg.installScope) throw new Error("Only Ambient-installed Pi packages can be uninstalled.");
  if (!pkg.packageSpec) throw new Error("Pi package source is missing.");
  await removeAmbientPiPackageConfig(ambientPiPackageConfigPath(workspacePath, pkg.installScope), pkg.packageSpec);
  return discoverPiPackages(workspacePath);
}

async function previewPiPackageCandidate(
  workspacePath: string,
  source: string,
  scope: PiPackageInstallScope,
): Promise<PiPackageSummary | undefined> {
  const localPath = localPackagePath(scope === "workspace" ? workspacePath : workspacePath, source);
  if (localPath) {
    return inspectPackageRoot(localPath, {
      sourceKind: scope === "workspace" ? "ambient-workspace" : "ambient-global",
      sourceLabel: scope === "workspace" ? "Ambient workspace Pi packages" : "Ambient global Pi packages",
      packageSpec: source,
      force: true,
      installed: true,
      installScope: scope,
    });
  }
  return specOnlyPackage(
    scope === "workspace" ? "ambient-workspace" : "ambient-global",
    scope === "workspace" ? "Ambient workspace Pi packages" : "Ambient global Pi packages",
    source,
    0,
    undefined,
    [],
    {
      installed: true,
      installScope: scope,
    },
  );
}

export function parsePiPackageGalleryHtml(html: string): PiPackageSummary[] {
  const cards = html.match(/<article\b[^>]*data-package-card="true"[\s\S]*?<\/article>/g) ?? [];
  return cards.slice(0, 24).map((card) => galleryCardToSummary(card)).filter((item): item is PiPackageSummary => Boolean(item));
}

async function appendSettingsPackages(input: {
  packages: PiPackageSummary[];
  errors: string[];
  settingsPath: string;
  sourceKind: PiPackageSourceKind;
  sourceLabel: string;
}): Promise<void> {
  if (!existsSync(input.settingsPath)) return;
  try {
    const parsed = piSettingsSchema.parse(await readJson(input.settingsPath));
    for (const [index, raw] of (parsed.packages ?? []).entries()) {
      const entry = settingsPackageEntry(raw);
      if (!entry) continue;
      const localPath = localPackagePath(dirname(input.settingsPath), entry.source);
      if (localPath) {
        const inspected = await inspectPackageRoot(localPath, {
          sourceKind: input.sourceKind,
          sourceLabel: input.sourceLabel,
          packageSpec: entry.source,
          force: true,
          filters: entry.filters,
        });
        input.packages.push(inspected ?? specOnlyPackage(input.sourceKind, input.sourceLabel, entry.source, index, entry.filters));
      } else {
        input.packages.push(specOnlyPackage(input.sourceKind, input.sourceLabel, entry.source, index, entry.filters));
      }
    }
  } catch (error) {
    input.errors.push(`${input.sourceLabel}: ${errorMessage(error)}`);
  }
}

async function appendAmbientManagedPackages(input: {
  packages: PiPackageSummary[];
  errors: string[];
  configPath: string;
  basePath: string;
  sourceKind: Extract<PiPackageSourceKind, "ambient-workspace" | "ambient-global">;
  sourceLabel: string;
  installScope: PiPackageInstallScope;
}): Promise<void> {
  if (!existsSync(input.configPath)) return;
  try {
    const parsed = ambientPiPackagesSchema.parse(await readJson(input.configPath));
    for (const [index, raw] of parsed.packages.entries()) {
      const source = typeof raw === "string" ? raw : raw.source;
      const localPath = localPackagePath(input.basePath, source);
      if (localPath) {
        const inspected = await inspectPackageRoot(localPath, {
          sourceKind: input.sourceKind,
          sourceLabel: input.sourceLabel,
          packageSpec: source,
          force: true,
          installed: true,
          installScope: input.installScope,
        });
        input.packages.push(
          inspected ??
            specOnlyPackage(input.sourceKind, input.sourceLabel, source, index, undefined, [`Missing ${packageJsonName}.`], {
              installed: true,
              installScope: input.installScope,
            }),
        );
      } else {
        input.packages.push(
          specOnlyPackage(input.sourceKind, input.sourceLabel, source, index, undefined, [], {
            installed: true,
            installScope: input.installScope,
          }),
        );
      }
    }
  } catch (error) {
    input.errors.push(`${input.sourceLabel}: ${errorMessage(error)}`);
  }
}

async function inspectPackageRoot(
  rootPath: string,
  options: {
    sourceKind: PiPackageSourceKind;
    sourceLabel: string;
    packageSpec?: string;
    force: boolean;
    filters?: Partial<Record<PiPackageResourceKind, string[]>>;
    installed?: boolean;
    installScope?: PiPackageInstallScope;
  },
): Promise<PiPackageSummary | undefined> {
  const packageJsonPath = join(rootPath, packageJsonName);
  if (!existsSync(packageJsonPath)) {
    if (!options.force) return undefined;
    return specOnlyPackage(options.sourceKind, options.sourceLabel, options.packageSpec ?? rootPath, 0, options.filters, [`Missing ${packageJsonName}.`], {
      installed: options.installed,
      installScope: options.installScope,
    });
  }

  try {
    const pkg = packageJsonSchema.parse(await readJson(packageJsonPath));
    const resources = [
      ...resourcesFromPiManifest(pkg.pi),
      ...(await resourcesFromConventions(rootPath, pkg.pi)),
      ...resourcesFromFilters(options.filters),
    ];
    const counts = resourceCounts(resources);
    const hasPackageSignal = options.force || hasPiPackageSignal(pkg, counts);
    if (!hasPackageSignal) return undefined;

    return classifyPiPackage({
      id: packageId(options.sourceKind, packageJsonPath, options.packageSpec ?? pkg.name ?? rootPath),
      name: pkg.name ?? basename(rootPath),
      version: pkg.version,
      description: pkg.description,
      sourceKind: options.sourceKind,
      sourceLabel: options.sourceLabel,
      packageSpec: options.packageSpec,
      installCommand: options.packageSpec ? piInstallCommand(options.packageSpec) : undefined,
      installed: options.installed,
      installScope: options.installScope,
      rootPath,
      packageJsonPath,
      homepage: pkg.homepage,
      repository: repositoryUrl(pkg.repository),
      license: pkg.license,
      author: authorName(pkg.author),
      keywords: pkg.keywords ?? [],
      image: piMedia(pkg.pi, "image"),
      video: piMedia(pkg.pi, "video"),
      dependencyStatus: discoverPiPackageDependencyStatus(rootPath, packageJsonPath, pkg),
      resourceCounts: counts,
      resources,
      compatibilityTier: "partial",
      compatibilityNotes: [],
      supportLabels: [],
      errors: [],
    });
  } catch (error) {
    return specOnlyPackage(options.sourceKind, options.sourceLabel, options.packageSpec ?? rootPath, 0, options.filters, [errorMessage(error)], {
      installed: options.installed,
      installScope: options.installScope,
    });
  }
}

async function readGalleryPackages(): Promise<{ packages: PiPackageSummary[]; errors: string[] }> {
  if (process.env.AMBIENT_PI_PACKAGE_GALLERY_DISABLED === "1") return { packages: [], errors: [] };
  try {
    const htmlPath = process.env.AMBIENT_PI_PACKAGE_GALLERY_PATH;
    if (htmlPath) return { packages: parsePiPackageGalleryHtml(await readFile(htmlPath, "utf8")), errors: [] };

    const url = process.env.AMBIENT_PI_PACKAGE_GALLERY_URL || defaultPiGalleryUrl;
    const response = await fetchWithTimeout(url, 4000);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    return { packages: parsePiPackageGalleryHtml(await response.text()), errors: [] };
  } catch (error) {
    return { packages: [], errors: [`Pi package gallery: ${errorMessage(error)}`] };
  }
}

function galleryCardToSummary(card: string): PiPackageSummary | undefined {
  const attrs = dataAttributes(card);
  const name = attrs.name;
  if (!name) return undefined;
  const packagePath = attrs.path;
  const rawTypes = splitResourceList(attrs.types);
  const badgeTypes = [...card.matchAll(/data-type="([^"]+)"/g)]
    .map((match) => normalizeResourceKind(match[1]))
    .filter((kind): kind is PiPackageResourceKind => Boolean(kind));
  const kinds = unique([...rawTypes, ...badgeTypes]);
  const resources = kinds.map((kind) => ({ kind, path: kind, source: "gallery" as const }));
  const publishedMs = Number(attrs.date);
  const downloads = Number(attrs.downloads);

  return classifyPiPackage({
    id: `pi-gallery:${name}`,
    name,
    description: htmlText(card.match(/<p class="packages-desc">([\s\S]*?)<\/p>/)?.[1]),
    sourceKind: "pi-gallery",
    sourceLabel: "pi.dev packages",
    sourceUrl: packagePath ? new URL(packagePath, defaultPiGalleryUrl).toString() : defaultPiGalleryUrl,
    packageSpec: `npm:${name}`,
    installCommand: `pi install npm:${name}`,
    installed: false,
    keywords: searchKeywords(attrs.search, name),
    publishedAt: Number.isFinite(publishedMs) && publishedMs > 0 ? new Date(publishedMs).toISOString() : undefined,
    downloadsPerMonth: Number.isFinite(downloads) ? downloads : undefined,
    resourceCounts: resourceCounts(resources),
    resources,
    compatibilityTier: "partial",
    compatibilityNotes: ["Gallery metadata only. Review package source before enabling it in Pi or Ambient."],
    supportLabels: ["pi.dev gallery", "Install disabled"],
    errors: [],
  });
}

function specOnlyPackage(
  sourceKind: PiPackageSourceKind,
  sourceLabel: string,
  source: string,
  index: number,
  filters?: Partial<Record<PiPackageResourceKind, string[]>>,
  errors: string[] = [],
  install?: { installed?: boolean; installScope?: PiPackageInstallScope },
): PiPackageSummary {
  const resources = resourcesFromFilters(filters);
  return classifyPiPackage({
    id: `${sourceKind}:${source}:${index}`,
    name: packageNameFromSource(source),
    sourceKind,
    sourceLabel,
    packageSpec: source,
    installCommand: piInstallCommand(source),
    installed: install?.installed,
    installScope: install?.installScope,
    keywords: [],
    resourceCounts: resourceCounts(resources),
    resources,
    compatibilityTier: errors.length > 0 ? "unsupported" : "partial",
    compatibilityNotes: ["Configured Pi package source. Ambient displays this metadata only and does not install or run it."],
    supportLabels: ["Configured package", "Install disabled"],
    errors,
  });
}

function classifyPiPackage(input: PiPackageSummary): PiPackageSummary {
  const supportLabels = [...input.supportLabels];
  const notes = [...input.compatibilityNotes];
  const counts = input.resourceCounts;
  if (counts.extension > 0) {
    supportLabels.push("Extensions (code)");
    notes.push("Extensions are executable TypeScript or JavaScript and stay disabled until Ambient has package sandboxing and audit support.");
  }
  if (input.dependencyStatus?.required) {
    supportLabels.push(input.dependencyStatus.installed ? "Dependencies present" : "Dependencies missing");
    if (input.dependencyStatus.reason) notes.push(input.dependencyStatus.reason);
  }
  if (counts.skill > 0) supportLabels.push("Skills");
  if (counts.prompt > 0) supportLabels.push("Prompts");
  if (counts.theme > 0) supportLabels.push("Themes");
  if (input.installed) {
    supportLabels.push("Ambient installed");
    notes.push(
      input.enabled
        ? "Installed in Ambient-managed Pi package state. Declarative skills, prompts, and themes can be loaded without running package extension code."
        : "Installed in Ambient-managed Pi package state. Ambient keeps package execution disabled until trust, sandboxing, and dependency policy are implemented.",
    );
  }
  if (input.enabled) {
    supportLabels.push("Enabled");
    notes.push("Enabled declarative Pi resources can be mounted into Ambient chat without executing package extension code.");
  }
  if (input.sourceKind !== "pi-gallery") supportLabels.push("Local metadata");
  supportLabels.push(input.installed ? (input.enabled ? "Declarative resources enabled" : "Execution disabled") : "Inspect only");

  const compatibilityTier: CodexPluginCompatibilityTier =
    input.errors.length > 0 || totalResources(counts) === 0 ? "unsupported" : counts.extension > 0 ? "partial" : "supported";
  if (compatibilityTier === "supported") {
    notes.push("Only declarative skills, prompts, or themes were found; no package code is executed by this view.");
  }
  if (compatibilityTier === "unsupported" && input.errors.length === 0) {
    notes.push("No Pi resources were declared in package metadata or conventional directories.");
  }

  return {
    ...input,
    compatibilityTier,
    compatibilityNotes: unique(notes),
    supportLabels: unique(supportLabels),
  };
}

function withPiPackageEnabledState(pkg: PiPackageSummary, options: DiscoverPiPackagesOptions): PiPackageSummary {
  const enabled = Boolean(pkg.installed && options.isPackageEnabled?.(pkg.id));
  if (enabled === Boolean(pkg.enabled)) return pkg;
  return classifyPiPackage({
    ...pkg,
    enabled,
    supportLabels: pkg.supportLabels.filter((label) => !["Enabled", "Execution disabled", "Declarative resources enabled"].includes(label)),
    compatibilityNotes: pkg.compatibilityNotes.filter(
      (note) =>
        !note.startsWith("Installed in Ambient-managed Pi package state.") &&
        !note.startsWith("Enabled declarative Pi resources can be mounted"),
    ),
  });
}

function resourcesFromPiManifest(pi: unknown): PiPackageResourceSummary[] {
  if (!pi || typeof pi !== "object" || Array.isArray(pi)) return [];
  const record = pi as Record<string, unknown>;
  return [
    ...resourceEntries("extension", record.extensions, "manifest"),
    ...resourceEntries("skill", record.skills, "manifest"),
    ...resourceEntries("prompt", record.prompts, "manifest"),
    ...resourceEntries("theme", record.themes, "manifest"),
  ];
}

async function resourcesFromConventions(rootPath: string, pi: unknown): Promise<PiPackageResourceSummary[]> {
  if (pi && typeof pi === "object" && !Array.isArray(pi)) return [];
  const rootSkillPath = join(rootPath, "SKILL.md");
  return [
    ...(existsSync(rootSkillPath) ? [{ kind: "skill" as PiPackageResourceKind, path: "./SKILL.md", source: "convention" as PiPackageResourceSource }] : []),
    ...(await conventionEntries(rootPath, "extensions", "extension", [".ts", ".js"])),
    ...(await conventionEntries(rootPath, "skills", "skill", [".md"])),
    ...(await conventionEntries(rootPath, "prompts", "prompt", [".md"])),
    ...(await conventionEntries(rootPath, "themes", "theme", [".json"])),
  ];
}

async function conventionEntries(
  rootPath: string,
  directoryName: string,
  kind: PiPackageResourceKind,
  extensions: string[],
): Promise<PiPackageResourceSummary[]> {
  const directory = join(rootPath, directoryName);
  if (!existsSync(directory)) return [];
  const files = await findFiles(directory, 4);
  return files
    .filter((filePath) => extensions.some((extension) => filePath.endsWith(extension)))
    .filter((filePath) => (kind === "skill" ? basename(filePath) === "SKILL.md" || dirname(filePath) === directory : true))
    .map((filePath) => ({ kind, path: relativePackagePath(rootPath, filePath), source: "convention" }));
}

function resourcesFromFilters(filters: Partial<Record<PiPackageResourceKind, string[]>> | undefined): PiPackageResourceSummary[] {
  if (!filters) return [];
  return piResourceKinds.flatMap((kind) =>
    (filters[kind] ?? []).map((path) => ({ kind, path, source: "settings-filter" as PiPackageResourceSource })),
  );
}

function resourceEntries(kind: PiPackageResourceKind, value: unknown, source: PiPackageResourceSource): PiPackageResourceSummary[] {
  return resourcePaths(value).map((path) => ({ kind, path, source }));
}

function resourcePaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

async function findFiles(root: string, maxDepth: number): Promise<string[]> {
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
      if (entry.isDirectory()) await visit(fullPath, depth + 1);
      else if (entry.isFile()) results.push(fullPath);
    }
  }
  await visit(root, 0);
  return results;
}

function resourceCounts(resources: PiPackageResourceSummary[]): Record<PiPackageResourceKind, number> {
  return {
    extension: resources.filter((resource) => resource.kind === "extension").length,
    skill: resources.filter((resource) => resource.kind === "skill").length,
    prompt: resources.filter((resource) => resource.kind === "prompt").length,
    theme: resources.filter((resource) => resource.kind === "theme").length,
  };
}

function settingsPackageEntry(raw: unknown): { source: string; filters?: Partial<Record<PiPackageResourceKind, string[]>> } | undefined {
  if (typeof raw === "string") return { source: raw };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const source = typeof record.source === "string" ? record.source : undefined;
  if (!source) return undefined;
  return {
    source,
    filters: {
      extension: resourcePaths(record.extensions),
      skill: resourcePaths(record.skills),
      prompt: resourcePaths(record.prompts),
      theme: resourcePaths(record.themes),
    },
  };
}

function localPackagePath(settingsDirectory: string, source: string): string | undefined {
  if (isLocalPackageSource(source)) {
    return resolve(settingsDirectory, source);
  }
  return undefined;
}

async function upsertAmbientPiPackageConfig(
  configPath: string,
  entry: { source: string; scope: PiPackageInstallScope },
): Promise<void> {
  const existing = existsSync(configPath) ? ambientPiPackagesSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages = existing.packages.map((raw) => (typeof raw === "string" ? { source: raw } : raw));
  const next = { source: entry.source, scope: entry.scope };
  const index = packages.findIndex((pkg) => pkg.source === entry.source);
  if (index >= 0) packages[index] = next;
  else packages.push(next);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
}

async function removeAmbientPiPackageConfig(configPath: string, source: string): Promise<void> {
  const existing = existsSync(configPath) ? ambientPiPackagesSchema.parse(await readJson(configPath)) : { packages: [] };
  const packages = existing.packages
    .map((raw) => (typeof raw === "string" ? { source: raw } : raw))
    .filter((pkg) => pkg.source !== source);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ packages }, null, 2)}\n`, "utf8");
}

function ambientPiPackageConfigPath(workspacePath: string, scope: PiPackageInstallScope): string {
  return scope === "workspace" ? join(managedInstallWorkspacePath(workspacePath), ambientWorkspacePiPackagesPath) : process.env.AMBIENT_PI_GLOBAL_PACKAGES_PATH || ambientGlobalPiPackagesPath;
}

function validateInstallSource(workspacePath: string, source: string, scope: PiPackageInstallScope): void {
  if (!source) throw new Error("Pi package source is required.");
  if (source.length > 2048) throw new Error("Pi package source is too long.");
  const isLocal = isLocalPackageSource(source);
  if (isLocal && scope === "workspace") {
    const resolved = resolve(workspacePath, source);
    if (!isPathInside(workspacePath, resolved)) throw new Error("Workspace-scoped local Pi package sources must stay inside the workspace.");
    return;
  }
  if (isLocal) return;
  if (source.startsWith("npm:") || source.startsWith("git:") || /^https?:\/\//i.test(source)) return;
  if (isBareNpmPackage(source)) return;
  throw new Error("Pi package source must be npm:, git:, http(s), or a local path.");
}

function normalizeInstallSource(workspacePath: string, source: string, scope: PiPackageInstallScope): string {
  if (isBareNpmPackage(source)) return `npm:${source}`;
  if (scope === "global" && isRelativeLocalPackageSource(source)) return resolve(workspacePath, source);
  return source;
}

function piInstallCommand(source: string): string | undefined {
  if (source.startsWith("npm:") || source.startsWith("git:") || /^https?:\/\//i.test(source) || isBareNpmPackage(source)) return `pi install ${source}`;
  return undefined;
}

function isLocalPackageSource(source: string): boolean {
  return source.startsWith("/") || isRelativeLocalPackageSource(source);
}

function isRelativeLocalPackageSource(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../");
}

function isBareNpmPackage(source: string): boolean {
  return /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(@[a-z0-9._-]+)?$/i.test(source);
}

function hasPiPackageSignal(pkg: PackageJson, counts: Record<PiPackageResourceKind, number>): boolean {
  return Boolean(pkg.pi) || (pkg.keywords ?? []).includes("pi-package") || totalResources(counts) > 0;
}

function totalResources(counts: Record<PiPackageResourceKind, number>): number {
  return counts.extension + counts.skill + counts.prompt + counts.theme;
}

function packageId(sourceKind: PiPackageSourceKind, packageJsonPath: string, source: string): string {
  return `${sourceKind}:${packageJsonPath}:${source}`;
}

function discoverPiPackageDependencyStatus(
  rootPath: string,
  packageJsonPath: string,
  pkg: PackageJson,
): PiPackageDependencyStatus | undefined {
  const packageNames = unique([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]).sort();
  if (packageNames.length === 0) return undefined;
  const missingPackages = packageNames.filter((name) => !existsSync(join(rootPath, "node_modules", ...name.split("/"))));
  return {
    packageJsonPath,
    required: true,
    installed: missingPackages.length === 0,
    packageNames,
    missingPackages,
    reason:
      missingPackages.length > 0
        ? `Pi package dependencies are not installed: ${missingPackages.slice(0, 5).join(", ")}${missingPackages.length > 5 ? ", ..." : ""}. Ambient will not install or execute Pi package dependencies until Pi extension sandboxing is implemented.`
        : "Pi package dependencies are present, but Ambient keeps package execution disabled until Pi extension sandboxing is implemented.",
  };
}

function packageNameFromSource(source: string): string {
  const withoutPrefix = source.replace(/^(npm:|git:)/, "");
  const withoutRef = withoutPrefix.startsWith("@") ? scopedPackageName(withoutPrefix) : withoutPrefix.split("@")[0];
  if (withoutRef.startsWith("@")) return withoutRef;
  return basename(withoutRef.replace(/\/$/, "")) || source;
}

function scopedPackageName(source: string): string {
  const versionIndex = source.indexOf("@", 1);
  return versionIndex > 0 ? source.slice(0, versionIndex) : source;
}

function repositoryUrl(repository: PackageJson["repository"]): string | undefined {
  if (typeof repository === "string") return repository;
  return repository?.url;
}

function authorName(author: PackageJson["author"]): string | undefined {
  if (typeof author === "string") return author;
  return author?.name;
}

function piMedia(pi: unknown, key: "image" | "video"): string | undefined {
  if (!pi || typeof pi !== "object" || Array.isArray(pi)) return undefined;
  const value = (pi as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function splitResourceList(value: string | undefined): PiPackageResourceKind[] {
  return unique(
    (value ?? "")
      .split(/[,\s]+/)
      .map((item) => normalizeResourceKind(item))
      .filter((kind): kind is PiPackageResourceKind => Boolean(kind)),
  );
}

function normalizeResourceKind(value: string): PiPackageResourceKind | undefined {
  const normalized = value.trim().toLowerCase().replace(/s$/, "");
  return piResourceKinds.includes(normalized as PiPackageResourceKind) ? (normalized as PiPackageResourceKind) : undefined;
}

function dataAttributes(html: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of html.matchAll(/\bdata-package-([a-z-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeHtml(match[2]);
  }
  return attrs;
}

function htmlText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function searchKeywords(value: string | undefined, name: string): string[] {
  if (!value) return [];
  return unique(value.split(/\s+/).filter((word) => word && word !== name).slice(0, 24));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function relativePackagePath(rootPath: string, filePath: string): string {
  if (!isPathInside(rootPath, filePath)) return filePath;
  return `./${relative(rootPath, filePath).replace(/\\/g, "/")}`;
}

function comparePackages(left: PiPackageSummary, right: PiPackageSummary): number {
  const kind = sourceRank(left.sourceKind) - sourceRank(right.sourceKind);
  if (kind) return kind;
  const tier = tierRank(left.compatibilityTier) - tierRank(right.compatibilityTier);
  return tier || left.name.localeCompare(right.name);
}

function sourceRank(kind: PiPackageSourceKind): number {
  if (kind === "workspace") return 0;
  if (kind === "ambient-workspace") return 1;
  if (kind === "ambient-global") return 2;
  if (kind === "project-settings") return 3;
  if (kind === "user-settings") return 4;
  return 5;
}

function tierRank(tier: CodexPluginCompatibilityTier): number {
  if (tier === "supported") return 0;
  if (tier === "partial") return 1;
  return 2;
}

function dedupePackages(packages: PiPackageSummary[]): PiPackageSummary[] {
  const seen = new Set<string>();
  return packages.filter((pkg) => {
    const key = `${pkg.sourceKind}:${pkg.packageSpec ?? pkg.rootPath ?? pkg.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
