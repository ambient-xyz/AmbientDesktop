import { z } from "zod";

const compatibilityTierSchema = z.enum(["supported", "partial", "unsupported"]);
const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i, "expected sha256:<64 hex chars>");
const gitCommitShaSchema = z.string().regex(/^[a-f0-9]{40}$/i, "expected a full 40-character git commit SHA");

const curatedSourceSchema = z.union([
  z.string().min(1),
  z.object({
    source: z.string().min(1),
    path: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    sha: z.string().min(1).optional(),
  }),
]);

const curatedMarketplaceSchema = z.object({
  name: z.string().min(1),
  interface: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  plugins: z.array(z.unknown()).min(1),
});

const curatedPluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  source: curatedSourceSchema,
  publisher: z.string().optional(),
  license: z.string().optional(),
  category: z.string().optional(),
  interface: z
    .object({
      displayName: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
  policy: z.unknown().optional(),
  manifest: z.unknown().optional(),
  ambient: z
    .object({
      provenance: z.unknown().optional(),
      marketplace: z
        .object({
          publisher: z.string().optional(),
          license: z.string().optional(),
          checksum: checksumSchema.optional(),
          bundleChecksum: checksumSchema.optional(),
          capabilitySummary: z.array(z.string().min(1)).min(1).optional(),
          redistributable: z.boolean().optional(),
          generatedShim: z.boolean().optional(),
          reviewed: z.boolean().optional(),
          compatibility: z
            .object({
              status: z.string().min(1).optional(),
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

export interface AmbientCuratedMarketplaceValidation {
  marketplaceName: string;
  pluginCount: number;
  pluginNames: string[];
}

export interface AmbientCuratedPluginInput {
  name: string;
  version?: string;
  description?: string;
  source: z.infer<typeof curatedSourceSchema>;
  publisher: string;
  license: string;
  checksum: string;
  bundleChecksum?: string;
  capabilitySummary: string[];
  compatibility: {
    status: string;
    tier: z.infer<typeof compatibilityTierSchema>;
    notes?: string[];
    supportLabels?: string[];
  };
  category?: string;
  displayName?: string;
  shortDescription?: string;
  redistributable?: boolean;
  generatedShim?: boolean;
  reviewed?: boolean;
  policy?: unknown;
  manifest?: unknown;
  ambient?: {
    provenance?: unknown;
    marketplace?: Record<string, unknown>;
  };
}

export interface AmbientCuratedMarketplaceInput {
  name: string;
  displayName?: string;
  plugins: AmbientCuratedPluginInput[];
}

export function buildAmbientCuratedMarketplace(input: AmbientCuratedMarketplaceInput): unknown {
  const marketplace = {
    name: input.name,
    ...(input.displayName ? { interface: { displayName: input.displayName } } : {}),
    plugins: input.plugins.map((plugin) => ({
      name: plugin.name,
      ...(plugin.version ? { version: plugin.version } : {}),
      ...(plugin.description ? { description: plugin.description } : {}),
      source: plugin.source,
      publisher: plugin.publisher,
      license: plugin.license,
      ...(plugin.category ? { category: plugin.category } : {}),
      ...(plugin.displayName || plugin.shortDescription || plugin.category
        ? {
            interface: {
              ...(plugin.displayName ? { displayName: plugin.displayName } : {}),
              ...(plugin.shortDescription ? { shortDescription: plugin.shortDescription } : {}),
              ...(plugin.category ? { category: plugin.category } : {}),
            },
          }
        : {}),
      ...(plugin.policy ? { policy: plugin.policy } : {}),
      ...(plugin.manifest ? { manifest: plugin.manifest } : {}),
      ambient: {
        ...(plugin.ambient?.provenance ? { provenance: plugin.ambient.provenance } : {}),
        marketplace: {
          ...plugin.ambient?.marketplace,
          publisher: plugin.publisher,
          license: plugin.license,
          checksum: plugin.checksum,
          ...(plugin.bundleChecksum ? { bundleChecksum: plugin.bundleChecksum } : {}),
          capabilitySummary: plugin.capabilitySummary,
          compatibility: plugin.compatibility,
          ...(plugin.redistributable !== undefined ? { redistributable: plugin.redistributable } : {}),
          ...(plugin.generatedShim !== undefined ? { generatedShim: plugin.generatedShim } : {}),
          ...(plugin.reviewed !== undefined ? { reviewed: plugin.reviewed } : {}),
        },
      },
    })),
  };
  validateAmbientCuratedMarketplace(marketplace);
  return marketplace;
}

export function validateAmbientCuratedMarketplace(raw: unknown): AmbientCuratedMarketplaceValidation {
  const parsedMarketplace = curatedMarketplaceSchema.safeParse(raw);
  if (!parsedMarketplace.success) {
    throw new Error(`Ambient curated marketplace validation failed: marketplace ${zodIssueSummary(parsedMarketplace.error)}`);
  }
  const marketplace = parsedMarketplace.data;
  const errors: string[] = [];
  const pluginNames: string[] = [];

  marketplace.plugins.forEach((rawPlugin, index) => {
    const plugin = curatedPluginSchema.safeParse(rawPlugin);
    const fallbackName = plugin.success ? plugin.data.name : `plugin ${index + 1}`;
    if (!plugin.success) {
      errors.push(`${fallbackName}: ${zodIssueSummary(plugin.error)}`);
      return;
    }

    const entry = plugin.data;
    if (pluginNames.includes(entry.name)) errors.push(`${entry.name}: duplicate plugin name.`);
    pluginNames.push(entry.name);
    const metadata = entry.ambient?.marketplace;
    const publisher = metadata?.publisher ?? entry.publisher;
    const license = metadata?.license ?? entry.license;
    const compatibility = metadata?.compatibility;

    if (!publisher) errors.push(`${entry.name}: missing publisher.`);
    if (!license) errors.push(`${entry.name}: missing license.`);
    if (!metadata?.checksum) errors.push(`${entry.name}: missing ambient.marketplace.checksum.`);
    if (!metadata?.capabilitySummary?.length) errors.push(`${entry.name}: missing ambient.marketplace.capabilitySummary.`);
    if (!compatibility?.status) errors.push(`${entry.name}: missing ambient.marketplace.compatibility.status.`);
    if (!compatibility?.tier) errors.push(`${entry.name}: missing ambient.marketplace.compatibility.tier.`);
    validatePinnedProvenance(entry.name, entry.source, errors);
    validateRedistributionPolicy(entry.name, entry.source, metadata?.redistributable, errors);
    if (metadata?.generatedShim && !metadata.reviewed) {
      errors.push(`${entry.name}: generated shims require ambient.marketplace.reviewed: true.`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Ambient curated marketplace validation failed: ${errors.join(" ")}`);
  }

  return {
    marketplaceName: marketplace.name,
    pluginCount: marketplace.plugins.length,
    pluginNames,
  };
}

function validatePinnedProvenance(name: string, source: z.infer<typeof curatedSourceSchema>, errors: string[]): void {
  if (typeof source === "string") {
    if (!isCodexCacheSource(source)) errors.push(`${name}: curated entries must use object source provenance.`);
    return;
  }
  if (!source.url && !source.path) {
    errors.push(`${name}: source provenance requires a URL or path.`);
  }
  if (source.source.startsWith("git") && !source.sha) {
    errors.push(`${name}: git curated sources must pin source.sha.`);
  }
  if (source.source.startsWith("git") && source.sha) {
    const sha = gitCommitShaSchema.safeParse(source.sha);
    if (!sha.success) errors.push(`${name}: git curated sources must pin source.sha to a full 40-character commit SHA.`);
  }
  if (!source.sha && !source.ref) {
    errors.push(`${name}: source provenance requires a pinned ref or sha.`);
  }
}

function validateRedistributionPolicy(name: string, source: z.infer<typeof curatedSourceSchema>, redistributable: boolean | undefined, errors: string[]): void {
  const sourceText = typeof source === "string" ? source : [source.source, source.url, source.path].filter(Boolean).join(" ");
  if (isCodexCacheSource(sourceText) && redistributable !== true) {
    errors.push(`${name}: raw Codex cache redistributions require ambient.marketplace.redistributable: true.`);
  }
}

function isCodexCacheSource(value: string): boolean {
  return /(?:^|[\\/])\.codex[\\/]plugins[\\/]cache(?:[\\/]|$)/.test(value);
}

function zodIssueSummary(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "entry"} ${issue.message}`).join("; ");
}
