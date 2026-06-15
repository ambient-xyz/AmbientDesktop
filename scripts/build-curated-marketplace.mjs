#!/usr/bin/env node

import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = resolve(repoRoot, "fixtures", "curated-marketplace", "source.json");
const defaultOutput = resolve(repoRoot, "fixtures", "curated-marketplace", "marketplace.json");
const signatureFileName = "marketplace.signature.json";
const fixtureSigningKeyId = "ambient-curated-fixture-2026-05";
// Fixture-only public key. Production publishing should provide signing env vars and ship only the public key to clients.
const fixtureSigningPublicKeyPem = [
  "-----BEGIN PUBLIC KEY-----",
  "MCowBQYDK2VwAyEApB74kBsAYpOdlpTywcqJfCefo1yjLzV80pfoidj1CfI=",
  "-----END PUBLIC KEY-----",
  "",
].join("\n");
const signingKeyId = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_KEY_ID ?? fixtureSigningKeyId;
const signingPublicKeyPem = normalizeConfiguredPem(process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PUBLIC_KEY ?? fixtureSigningPublicKeyPem);
const signingPrivateKeyPem = process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PRIVATE_KEY
  ? normalizeConfiguredPem(process.env.AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PRIVATE_KEY)
  : undefined;

const tierSchema = z.enum(["supported", "partial", "unsupported"]);
const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i, "expected sha256:<64 hex chars>");
const gitCommitShaSchema = z.string().regex(/^[a-f0-9]{40}$/i, "expected a full 40-character git commit SHA");
const sourceSchema = z.union([
  z.string().min(1),
  z.object({
    source: z.string().min(1),
    path: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    sha: z.string().min(1).optional(),
  }),
]);

const inputPluginSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  source: sourceSchema,
  publisher: z.string().min(1),
  license: z.string().min(1),
  checksum: checksumSchema,
  bundleChecksum: checksumSchema.optional(),
  capabilitySummary: z.array(z.string().min(1)).min(1),
  compatibility: z.object({
    status: z.string().min(1),
    tier: tierSchema,
    notes: z.array(z.string()).optional(),
    supportLabels: z.array(z.string()).optional(),
  }),
  category: z.string().optional(),
  displayName: z.string().optional(),
  shortDescription: z.string().optional(),
  redistributable: z.boolean().optional(),
  generatedShim: z.boolean().optional(),
  reviewed: z.boolean().optional(),
  policy: z.unknown().optional(),
  manifest: z.unknown().optional(),
  ambient: z
    .object({
      provenance: z.unknown().optional(),
      marketplace: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

const inputSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  generatedAt: z.string().min(1),
  plugins: z.array(inputPluginSchema).min(1),
});

const outputPluginSchema = z.object({
  name: z.string().min(1),
  source: sourceSchema,
  publisher: z.string().optional(),
  license: z.string().optional(),
  ambient: z.object({
    marketplace: z.object({
      publisher: z.string().min(1),
      license: z.string().min(1),
      checksum: checksumSchema,
      bundleChecksum: checksumSchema.optional(),
      capabilitySummary: z.array(z.string().min(1)).min(1),
      redistributable: z.boolean().optional(),
      generatedShim: z.boolean().optional(),
      reviewed: z.boolean().optional(),
      compatibility: z.object({
        status: z.string().min(1),
        tier: tierSchema,
        notes: z.array(z.string()).optional(),
        supportLabels: z.array(z.string()).optional(),
      }),
    }),
  }),
});

const outputSchema = z.object({
  name: z.string().min(1),
  interface: z
    .object({
      displayName: z.string().optional(),
    })
    .optional(),
  plugins: z.array(outputPluginSchema).min(1),
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = resolve(repoRoot, args.source ?? defaultSource);
  const outputPath = resolve(repoRoot, args.output ?? defaultOutput);
  const signatureOutputPath = resolve(repoRoot, args.signatureOutput ?? join(dirname(outputPath), signatureFileName));
  const input = inputSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")));
  const marketplace = buildMarketplace(input);
  const validation = validateMarketplace(marketplace);
  const rendered = `${JSON.stringify(marketplace, null, 2)}\n`;
  const signature = await buildMarketplaceSignature({ marketplaceContent: rendered, generatedAt: input.generatedAt, validation });
  const renderedSignature = `${JSON.stringify(signature, null, 2)}\n`;

  if (args.check) {
    const current = await readFile(outputPath, "utf8");
    if (current !== rendered) {
      throw new Error(`Curated marketplace artifact is stale: ${relativePath(outputPath)}. Run pnpm run build:curated-marketplace.`);
    }
    const currentSignature = await readFile(signatureOutputPath, "utf8");
    if (currentSignature !== renderedSignature) {
      throw new Error(`Curated marketplace signature artifact is stale: ${relativePath(signatureOutputPath)}. Run pnpm run build:curated-marketplace.`);
    }
  } else {
    await writeFile(outputPath, rendered, "utf8");
    await writeFile(signatureOutputPath, renderedSignature, "utf8");
  }

  console.log(
    `${args.check ? "Validated" : "Wrote"} ${validation.pluginCount} curated plugins for ${validation.marketplaceName} at ${relativePath(outputPath)} with signature ${relativePath(signatureOutputPath)}`,
  );
}

function buildMarketplace(input) {
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
  validateMarketplace(marketplace);
  return marketplace;
}

function validateMarketplace(raw) {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Curated marketplace validation failed: ${issueSummary(parsed.error)}`);
  }

  const errors = [];
  const names = new Set();
  for (const plugin of parsed.data.plugins) {
    if (names.has(plugin.name)) errors.push(`${plugin.name}: duplicate plugin name.`);
    names.add(plugin.name);
    validatePinnedProvenance(plugin.name, plugin.source, errors);
    validateRedistributionPolicy(plugin.name, plugin.source, plugin.ambient.marketplace.redistributable, errors);
    if (plugin.ambient.marketplace.generatedShim && !plugin.ambient.marketplace.reviewed) {
      errors.push(`${plugin.name}: generated shims require ambient.marketplace.reviewed: true.`);
    }
  }

  if (errors.length > 0) throw new Error(`Curated marketplace validation failed: ${errors.join(" ")}`);
  return {
    marketplaceName: parsed.data.name,
    pluginCount: parsed.data.plugins.length,
  };
}

async function buildMarketplaceSignature({ marketplaceContent, generatedAt, validation }) {
  const signatureMetadata = {
    formatVersion: 1,
    signatureAlgorithm: "ed25519",
    keyId: signingKeyId,
    publicKey: signingPublicKeyPem,
    marketplaceName: validation.marketplaceName,
    marketplaceSha256: sha256Digest(marketplaceContent),
    pluginCount: validation.pluginCount,
    generatedAt,
  };

  if (!signingPrivateKeyPem) {
    return fixtureSignatureForMetadata(signatureMetadata);
  }

  const payload = marketplaceSignaturePayload(signatureMetadata);
  const signature = sign(null, Buffer.from(payload, "utf8"), createPrivateKey(signingPrivateKeyPem)).toString("base64");
  return {
    ...signatureMetadata,
    signature,
  };
}

async function fixtureSignatureForMetadata(signatureMetadata) {
  if (signingKeyId !== fixtureSigningKeyId || normalizePem(signingPublicKeyPem) !== normalizePem(fixtureSigningPublicKeyPem)) {
    throw new Error(
      "Curated marketplace signing private key is required when using a non-fixture key. Set AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PRIVATE_KEY.",
    );
  }
  const fixtureSignaturePath = join(dirname(defaultOutput), signatureFileName);
  const fixtureSignature = JSON.parse(await readFile(fixtureSignaturePath, "utf8"));
  const { signature: _signature, ...fixtureMetadata } = fixtureSignature;
  if (marketplaceSignaturePayload(fixtureMetadata) !== marketplaceSignaturePayload(signatureMetadata)) {
    throw new Error(
      "Curated marketplace fixture signature is stale or the source changed. Set AMBIENT_CODEX_CURATED_MARKETPLACE_SIGNING_PRIVATE_KEY to generate a new signature.",
    );
  }
  return fixtureSignature;
}

function marketplaceSignaturePayload(signature) {
  return JSON.stringify({
    formatVersion: signature.formatVersion,
    signatureAlgorithm: signature.signatureAlgorithm,
    keyId: signature.keyId,
    publicKey: normalizePem(signature.publicKey),
    marketplaceName: signature.marketplaceName,
    marketplaceSha256: signature.marketplaceSha256.toLowerCase(),
    pluginCount: signature.pluginCount,
    generatedAt: signature.generatedAt,
  });
}

function validatePinnedProvenance(name, source, errors) {
  if (typeof source === "string") {
    if (!isCodexCacheSource(source)) errors.push(`${name}: curated entries must use object source provenance.`);
    return;
  }
  if (!source.url && !source.path) errors.push(`${name}: source provenance requires a URL or path.`);
  if (source.source.startsWith("git") && !source.sha) errors.push(`${name}: git curated sources must pin source.sha.`);
  if (source.source.startsWith("git") && source.sha && !gitCommitShaSchema.safeParse(source.sha).success) {
    errors.push(`${name}: git curated sources must pin source.sha to a full 40-character commit SHA.`);
  }
  if (!source.sha && !source.ref) errors.push(`${name}: source provenance requires a pinned ref or sha.`);
}

function validateRedistributionPolicy(name, source, redistributable, errors) {
  const sourceText = typeof source === "string" ? source : [source.source, source.url, source.path].filter(Boolean).join(" ");
  if (isCodexCacheSource(sourceText) && redistributable !== true) {
    errors.push(`${name}: raw Codex cache redistributions require ambient.marketplace.redistributable: true.`);
  }
}

function isCodexCacheSource(value) {
  return /(?:^|[\\/])\.codex[\\/]plugins[\\/]cache(?:[\\/]|$)/.test(value);
}

function parseArgs(argv) {
  const args = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--source") {
      args.source = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.output = requiredValue(argv, ++index, arg);
    } else if (arg === "--signature-out") {
      args.signatureOutput = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function relativePath(path) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}

function sha256Digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function normalizePem(value) {
  return `${value.trim().replace(/\r\n/g, "\n")}\n`;
}

function normalizeConfiguredPem(value) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function issueSummary(error) {
  return error.issues.map((issue) => `${issue.path.join(".") || "entry"} ${issue.message}`).join("; ");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
