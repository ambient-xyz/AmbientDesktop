import { createHash, createPublicKey, verify as verifyCryptoSignature } from "node:crypto";
import { z } from "zod";

export const ambientCuratedMarketplaceDefaultUrl = "https://updates.ambient.xyz/desktop/plugins/marketplace.json";
export const ambientCuratedMarketplaceSignatureFileName = "marketplace.signature.json";
export const ambientCuratedMarketplaceFixtureKeyId = "ambient-curated-fixture-2026-05";
export const ambientCuratedMarketplaceFixturePublicKey = [
  "-----BEGIN PUBLIC KEY-----",
  "MCowBQYDK2VwAyEApB74kBsAYpOdlpTywcqJfCefo1yjLzV80pfoidj1CfI=",
  "-----END PUBLIC KEY-----",
  "",
].join("\n");

const checksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i, "expected sha256:<64 hex chars>");

const marketplaceIdentitySchema = z.object({
  name: z.string().min(1),
  plugins: z.array(z.unknown()),
});

const signatureSchema = z.object({
  formatVersion: z.literal(1),
  signatureAlgorithm: z.literal("ed25519"),
  keyId: z.string().min(1),
  publicKey: z.string().min(1),
  marketplaceName: z.string().min(1),
  marketplaceSha256: checksumSchema,
  pluginCount: z.number().int().min(0),
  generatedAt: z.string().min(1),
  signature: z.string().min(1),
});

export type AmbientCuratedMarketplaceSignature = z.infer<typeof signatureSchema>;
export type AmbientCuratedMarketplaceSignatureStatus = "verified" | "unsigned-dev" | "missing" | "invalid";

export interface AmbientCuratedMarketplaceSignatureVerification {
  status: AmbientCuratedMarketplaceSignatureStatus;
  keyId?: string;
  generatedAt?: string;
  marketplaceSha256?: string;
  error?: string;
}

export function verifyAmbientCuratedMarketplaceSignature(input: {
  marketplaceContent: string;
  marketplace: unknown;
  signature: unknown;
  trustedPublicKeys?: Record<string, string>;
}): AmbientCuratedMarketplaceSignatureVerification {
  const marketplace = marketplaceIdentitySchema.parse(input.marketplace);
  const signature = signatureSchema.parse(input.signature);
  const contentChecksum = sha256Digest(input.marketplaceContent);
  const signatureChecksum = signature.marketplaceSha256.toLowerCase();

  if (signatureChecksum !== contentChecksum) {
    throw new Error(`Ambient curated marketplace signature checksum mismatch: expected ${signature.marketplaceSha256}, got ${contentChecksum}.`);
  }
  if (signature.marketplaceName !== marketplace.name) {
    throw new Error(`Ambient curated marketplace signature name mismatch: expected ${signature.marketplaceName}, got ${marketplace.name}.`);
  }
  if (signature.pluginCount !== marketplace.plugins.length) {
    throw new Error(
      `Ambient curated marketplace signature plugin count mismatch: expected ${signature.pluginCount}, got ${marketplace.plugins.length}.`,
    );
  }

  const trustedPublicKeys = input.trustedPublicKeys ?? ambientCuratedMarketplaceTrustedPublicKeysFromEnv();
  const trustedPublicKey = trustedPublicKeys[signature.keyId];
  if (!trustedPublicKey) {
    throw new Error(`Ambient curated marketplace signature uses an untrusted key: ${signature.keyId}.`);
  }
  if (normalizePem(signature.publicKey) !== normalizePem(trustedPublicKey)) {
    throw new Error(`Ambient curated marketplace signature key material does not match trusted key: ${signature.keyId}.`);
  }

  const verified = verifyCryptoSignature(
    null,
    Buffer.from(ambientCuratedMarketplaceSignaturePayload(signature), "utf8"),
    createPublicKey(trustedPublicKey),
    Buffer.from(signature.signature, "base64"),
  );
  if (!verified) throw new Error(`Ambient curated marketplace signature verification failed for key: ${signature.keyId}.`);

  return {
    status: "verified",
    keyId: signature.keyId,
    generatedAt: signature.generatedAt,
    marketplaceSha256: signatureChecksum,
  };
}

export function ambientCuratedMarketplaceSignaturePayload(signature: Omit<AmbientCuratedMarketplaceSignature, "signature">): string {
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

export function ambientCuratedMarketplaceTrustedPublicKeysFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const trustedKeys: Record<string, string> = {};
  if (env.AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY === "1") {
    trustedKeys[ambientCuratedMarketplaceFixtureKeyId] = ambientCuratedMarketplaceFixturePublicKey;
  }
  const configuredPublicKey = env.AMBIENT_CODEX_CURATED_MARKETPLACE_PUBLIC_KEY;
  if (configuredPublicKey) {
    trustedKeys[env.AMBIENT_CODEX_CURATED_MARKETPLACE_KEY_ID ?? "ambient-curated-env"] = normalizeConfiguredPem(configuredPublicKey);
  }
  return trustedKeys;
}

export function sha256Digest(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function normalizeConfiguredPem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function normalizePem(value: string): string {
  return `${value.trim().replace(/\r\n/g, "\n")}\n`;
}
