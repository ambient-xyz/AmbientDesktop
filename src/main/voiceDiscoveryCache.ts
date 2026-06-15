import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { VoiceProviderCandidate, VoiceProviderDiscoverySource, VoiceProviderDynamicVoice } from "../shared/types";
import type { AmbientCliRunResult, RunAmbientCliInput } from "./ambientCliPackages";
import { isPathInside } from "./sessionPaths";

const cachePath = ".ambient/voice/voice-discovery-cache.json";
const cacheSchemaVersion = "ambient-voice-discovery-cache-v1";
const defaultListLimit = 12;
const maxListLimit = 50;

const dynamicVoiceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().optional(),
    locale: z.string().optional(),
    language: z.string().optional(),
    gender: z.string().optional(),
    style: z.array(z.string()).optional(),
    description: z.string().optional(),
    previewText: z.string().optional(),
    cloned: z.boolean().optional(),
    providerMetadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const cacheEntrySchema = z
  .object({
    providerCapabilityId: z.string().min(1),
    providerLabel: z.string().optional(),
    source: z.enum(["cloud-api", "local-model-directory", "local-runtime", "custom"]).optional(),
    refreshedAt: z.string().min(1),
    expiresAt: z.string().optional(),
    voiceCount: z.number().int().nonnegative(),
    voices: z.array(dynamicVoiceSchema).default([]),
    diagnostics: z.string().optional(),
  })
  .passthrough();

const cacheSchema = z
  .object({
    schemaVersion: z.literal(cacheSchemaVersion),
    providers: z.record(z.string(), cacheEntrySchema).default({}),
  })
  .passthrough();

export interface VoiceDiscoveryCacheEntry {
  providerCapabilityId: string;
  providerLabel?: string;
  source?: VoiceProviderDiscoverySource;
  refreshedAt: string;
  expiresAt?: string;
  voiceCount: number;
  voices: VoiceProviderDynamicVoice[];
  diagnostics?: string;
}

export interface VoiceDiscoveryCache {
  schemaVersion: typeof cacheSchemaVersion;
  providers: Record<string, VoiceDiscoveryCacheEntry>;
}

export interface VoiceListInput {
  providerCapabilityId?: string;
  query?: string;
  locale?: string;
  language?: string;
  style?: string;
  limit?: number;
  includeStale?: boolean;
}

export interface VoiceListResult {
  provider: VoiceProviderCandidate;
  voices: Array<VoiceProviderDynamicVoice & { source: "declared" | "dynamic-cache" }>;
  totalVoices: number;
  matchedVoices: number;
  returnedVoices: number;
  cacheStatus: "none" | "fresh" | "stale";
  refreshedAt?: string;
  expiresAt?: string;
  stale: boolean;
  truncated: boolean;
}

export interface VoiceRefreshInput {
  providerCapabilityId: string;
  reason?: string;
}

export interface VoiceRefreshResult {
  provider: VoiceProviderCandidate;
  entry: VoiceDiscoveryCacheEntry;
  durationMs: number;
  stdoutArtifactPath?: string;
  stderrArtifactPath?: string;
}

export type VoiceDiscoveryRunner = (workspacePath: string, input: RunAmbientCliInput) => Promise<AmbientCliRunResult>;

export function voiceDiscoveryCacheFilePath(workspacePath: string): string {
  const workspace = resolve(workspacePath);
  const path = resolve(workspace, cachePath);
  if (!isPathInside(workspace, path)) throw new Error("Resolved voice discovery cache path is outside the workspace.");
  return path;
}

export async function readVoiceDiscoveryCache(workspacePath: string): Promise<VoiceDiscoveryCache> {
  const path = voiceDiscoveryCacheFilePath(workspacePath);
  if (!existsSync(path)) return emptyVoiceDiscoveryCache();
  try {
    return normalizeCache(cacheSchema.parse(JSON.parse(await readFile(path, "utf8"))));
  } catch {
    return emptyVoiceDiscoveryCache();
  }
}

export async function writeVoiceDiscoveryCacheEntry(workspacePath: string, entry: VoiceDiscoveryCacheEntry): Promise<VoiceDiscoveryCacheEntry> {
  const path = voiceDiscoveryCacheFilePath(workspacePath);
  const cache = await readVoiceDiscoveryCache(workspacePath);
  const normalized = normalizeEntry(entry);
  cache.providers[normalized.providerCapabilityId] = normalized;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  return normalized;
}

export async function upsertVoiceDiscoveryCacheVoice(
  workspacePath: string,
  provider: VoiceProviderCandidate,
  voice: VoiceProviderDynamicVoice,
  now = new Date(),
): Promise<VoiceDiscoveryCacheEntry> {
  const cache = await readVoiceDiscoveryCache(workspacePath);
  const existing = cache.providers[provider.capabilityId];
  const voices = existing?.voices.filter((candidate) => candidate.id !== voice.id) ?? [];
  voices.unshift(voice);
  return writeVoiceDiscoveryCacheEntry(workspacePath, {
    providerCapabilityId: provider.capabilityId,
    providerLabel: provider.label,
    source: existing?.source ?? provider.voiceDiscovery?.source ?? (provider.voiceCloning?.mode === "cloud" ? "cloud-api" : provider.voiceCloning?.mode === "local" ? "local-runtime" : "custom"),
    refreshedAt: now.toISOString(),
    ...(existing?.expiresAt ? { expiresAt: existing.expiresAt } : {}),
    voiceCount: voices.length,
    voices,
    ...(existing?.diagnostics ? { diagnostics: existing.diagnostics } : {}),
  });
}

export async function removeVoiceDiscoveryCacheVoice(
  workspacePath: string,
  providerCapabilityId: string,
  voiceId: string,
  now = new Date(),
): Promise<VoiceDiscoveryCacheEntry | undefined> {
  const cache = await readVoiceDiscoveryCache(workspacePath);
  const existing = cache.providers[providerCapabilityId];
  if (!existing) return undefined;
  const voices = existing.voices.filter((voice) => voice.id !== voiceId);
  if (voices.length === existing.voices.length) return existing;
  return writeVoiceDiscoveryCacheEntry(workspacePath, {
    ...existing,
    refreshedAt: now.toISOString(),
    voiceCount: voices.length,
    voices,
  });
}

export function mergeVoiceProvidersWithCachedVoices(providers: VoiceProviderCandidate[], cache: VoiceDiscoveryCache, now = new Date()): VoiceProviderCandidate[] {
  return providers.map((provider) => {
    const entry = cache.providers[provider.capabilityId];
    if (!entry || !entry.voices.length) {
      return {
        ...provider,
        voices: provider.voices.map((voice) => ({ ...voice, source: voice.source ?? "declared" })),
        voiceCatalog: {
          cacheStatus: "none",
          voiceCount: provider.voices.length,
          dynamicVoiceCount: 0,
        },
      };
    }
    const stale = isCacheEntryStale(entry, now);
    const byId = new Map(provider.voices.map((voice) => [voice.id, { ...voice, source: voice.source ?? "declared" as const }]));
    for (const voice of entry.voices) {
      if (!stale || byId.has(voice.id)) {
        byId.set(voice.id, {
          id: voice.id,
          ...(voice.label ? { label: voice.label } : {}),
          ...(voice.locale ? { locale: voice.locale } : {}),
          ...(voice.language ? { language: voice.language } : {}),
          ...(voice.style?.length ? { style: voice.style } : {}),
          source: "dynamic-cache",
        });
      }
    }
    return {
      ...provider,
      voices: Array.from(byId.values()),
      voiceCatalog: {
        cacheStatus: stale ? "stale" : "fresh",
        ...(entry.refreshedAt ? { refreshedAt: entry.refreshedAt } : {}),
        ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
        ...(entry.source ? { source: entry.source } : {}),
        voiceCount: Array.from(byId.values()).length,
        dynamicVoiceCount: entry.voices.length,
      },
    };
  });
}

export function listVoiceProviderVoices(providers: VoiceProviderCandidate[], cache: VoiceDiscoveryCache, input: VoiceListInput = {}, now = new Date()): VoiceListResult {
  const provider = resolveProvider(providers, input.providerCapabilityId);
  const entry = cache.providers[provider.capabilityId];
  const stale = entry ? isCacheEntryStale(entry, now) : false;
  const includeDynamic = Boolean(entry?.voices.length) && (!stale || input.includeStale === true);
  const declared = provider.voices.map((voice) => ({ id: voice.id, ...(voice.label ? { label: voice.label } : {}), source: "declared" as const }));
  const dynamic = includeDynamic
    ? (entry?.voices ?? []).map((voice) => ({ ...voice, source: "dynamic-cache" as const }))
    : [];
  const voicesById = new Map<string, VoiceListResult["voices"][number]>();
  for (const voice of declared) voicesById.set(voice.id, voice);
  for (const voice of dynamic) voicesById.set(voice.id, voice);
  const allVoices = Array.from(voicesById.values());
  const filtered = allVoices.filter((voice) => voiceMatches(voice, input));
  const limit = normalizeLimit(input.limit);
  const voices = filtered.slice(0, limit);
  return {
    provider,
    voices,
    totalVoices: allVoices.length,
    matchedVoices: filtered.length,
    returnedVoices: voices.length,
    cacheStatus: entry ? stale ? "stale" : "fresh" : "none",
    ...(entry?.refreshedAt ? { refreshedAt: entry.refreshedAt } : {}),
    ...(entry?.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    stale,
    truncated: filtered.length > voices.length,
  };
}

export function voiceListText(result: VoiceListResult): string {
  const lines = result.voices.length
    ? result.voices.map((voice) => {
      const details = [
        `id=${voice.id}`,
        voice.label ? `label=${voice.label}` : undefined,
        `source=${voice.source}`,
        voice.locale ? `locale=${voice.locale}` : undefined,
        voice.language ? `language=${voice.language}` : undefined,
        voice.gender ? `gender=${voice.gender}` : undefined,
        voice.style?.length ? `style=${voice.style.join(",")}` : undefined,
      ].filter(Boolean);
      return `- ${details.join("; ")}`;
    }).join("\n")
    : "- No voices matched.";
  return [
    "Ambient voice list",
    `Provider: ${result.provider.label} (${result.provider.capabilityId})`,
    `Cache: ${result.cacheStatus}${result.refreshedAt ? `; refreshedAt=${result.refreshedAt}` : ""}${result.expiresAt ? `; expiresAt=${result.expiresAt}` : ""}`,
    `Voices: ${result.returnedVoices}/${result.matchedVoices} matched; ${result.totalVoices} total`,
    lines,
    result.truncated ? "Result truncated. Call ambient_voice_list_voices with a narrower query or higher limit for more exact voice ids." : undefined,
    "Use ambient_voice_select with an exact voiceId from this output to change the selected voice.",
  ].filter(Boolean).join("\n");
}

export async function refreshVoiceProviderVoices(
  workspacePath: string,
  providers: VoiceProviderCandidate[],
  input: VoiceRefreshInput,
  runner: VoiceDiscoveryRunner,
  now = new Date(),
): Promise<VoiceRefreshResult> {
  const provider = resolveProvider(providers, input.providerCapabilityId);
  const discovery = provider.voiceDiscovery;
  if (!discovery) throw new Error(`Voice provider "${provider.label}" does not declare dynamic voice discovery.`);
  const startedAt = Date.now();
  const result = await runner(workspacePath, {
    packageId: provider.packageId,
    command: discovery.command,
    args: ["--list-voices"],
  });
  const voices = parseVoiceDiscoveryCommandOutput(result.stdout ?? "");
  const refreshedAt = now.toISOString();
  const expiresAt = discovery.cacheTtlSeconds ? new Date(now.getTime() + discovery.cacheTtlSeconds * 1000).toISOString() : undefined;
  const entry = await writeVoiceDiscoveryCacheEntry(workspacePath, {
    providerCapabilityId: provider.capabilityId,
    providerLabel: provider.label,
    ...(discovery.source ? { source: discovery.source } : {}),
    refreshedAt,
    ...(expiresAt ? { expiresAt } : {}),
    voiceCount: voices.length,
    voices,
  });
  return {
    provider,
    entry,
    durationMs: result.durationMs || Date.now() - startedAt,
    ...(result.stdoutOutput?.artifactPath ? { stdoutArtifactPath: result.stdoutOutput.artifactPath } : {}),
    ...(result.stderrOutput?.artifactPath ? { stderrArtifactPath: result.stderrOutput.artifactPath } : {}),
  };
}

export function voiceRefreshText(result: VoiceRefreshResult): string {
  return [
    "Ambient voice catalog refreshed",
    `Provider: ${result.provider.label} (${result.provider.capabilityId})`,
    `Source: ${result.entry.source ?? "unspecified"}`,
    `Voices: ${result.entry.voiceCount}`,
    `Refreshed at: ${result.entry.refreshedAt}`,
    result.entry.expiresAt ? `Expires at: ${result.entry.expiresAt}` : undefined,
    `Duration: ${result.durationMs} ms`,
    result.stdoutArtifactPath ? `Full stdout: ${result.stdoutArtifactPath}` : undefined,
    result.stderrArtifactPath ? `Full stderr: ${result.stderrArtifactPath}` : undefined,
    "Use ambient_voice_list_voices with query filters to find exact voice ids.",
  ].filter(Boolean).join("\n");
}

export function voiceRefreshRequiresApproval(provider: VoiceProviderCandidate): boolean {
  const discovery = provider.voiceDiscovery;
  if (!discovery) return false;
  return discovery.requiresNetwork === true || discovery.source === "cloud-api";
}

function emptyVoiceDiscoveryCache(): VoiceDiscoveryCache {
  return { schemaVersion: cacheSchemaVersion, providers: {} };
}

function normalizeCache(cache: z.infer<typeof cacheSchema>): VoiceDiscoveryCache {
  return {
    schemaVersion: cacheSchemaVersion,
    providers: Object.fromEntries(Object.entries(cache.providers).map(([key, entry]) => [key, normalizeEntry(entry)])),
  };
}

function normalizeEntry(entry: VoiceDiscoveryCacheEntry): VoiceDiscoveryCacheEntry {
  const voices = uniqueVoices(entry.voices);
  return {
    providerCapabilityId: entry.providerCapabilityId,
    ...(entry.providerLabel ? { providerLabel: entry.providerLabel } : {}),
    ...(entry.source ? { source: entry.source } : {}),
    refreshedAt: entry.refreshedAt,
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    voiceCount: Math.max(entry.voiceCount, voices.length),
    voices,
    ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {}),
  };
}

function uniqueVoices(voices: VoiceProviderDynamicVoice[]): VoiceProviderDynamicVoice[] {
  const byId = new Map<string, VoiceProviderDynamicVoice>();
  for (const voice of voices) {
    const id = voice.id.trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...voice, id });
  }
  return Array.from(byId.values());
}

function parseVoiceDiscoveryCommandOutput(stdout: string): VoiceProviderDynamicVoice[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Voice discovery command did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const voices = Array.isArray(record.voices) ? record.voices : undefined;
  if (!voices) throw new Error("Voice discovery command JSON must contain a voices array.");
  return voices.map((voice, index) => normalizeDynamicVoice(voice, index));
}

function normalizeDynamicVoice(input: unknown, index: number): VoiceProviderDynamicVoice {
  const parsed = dynamicVoiceSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Voice discovery command returned invalid voices[${index}]: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  return {
    id: parsed.data.id.trim(),
    ...(parsed.data.label?.trim() ? { label: parsed.data.label.trim() } : {}),
    ...(parsed.data.locale?.trim() ? { locale: parsed.data.locale.trim() } : {}),
    ...(parsed.data.language?.trim() ? { language: parsed.data.language.trim() } : {}),
    ...(parsed.data.gender?.trim() ? { gender: parsed.data.gender.trim() } : {}),
    ...(parsed.data.style?.length ? { style: parsed.data.style.map((style) => style.trim()).filter(Boolean) } : {}),
    ...(parsed.data.description?.trim() ? { description: parsed.data.description.trim() } : {}),
    ...(parsed.data.previewText?.trim() ? { previewText: parsed.data.previewText.trim() } : {}),
    ...(parsed.data.cloned !== undefined ? { cloned: parsed.data.cloned } : {}),
    ...(parsed.data.providerMetadata ? { providerMetadata: parsed.data.providerMetadata } : {}),
  };
}

function resolveProvider(providers: VoiceProviderCandidate[], providerCapabilityId: string | undefined): VoiceProviderCandidate {
  if (providerCapabilityId) {
    const provider = providers.find((candidate) => candidate.capabilityId === providerCapabilityId);
    if (!provider) throw new Error(`Voice provider "${providerCapabilityId}" is not installed.`);
    return provider;
  }
  if (providers.length === 1) return providers[0];
  throw new Error("providerCapabilityId is required when multiple voice providers are installed.");
}

function isCacheEntryStale(entry: VoiceDiscoveryCacheEntry, now: Date): boolean {
  return Boolean(entry.expiresAt && Number.isFinite(Date.parse(entry.expiresAt)) && Date.parse(entry.expiresAt) <= now.getTime());
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return defaultListLimit;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer.");
  return Math.min(limit, maxListLimit);
}

function voiceMatches(voice: VoiceListResult["voices"][number], input: VoiceListInput): boolean {
  const query = input.query?.trim().toLowerCase();
  if (query && !searchText(voice).includes(query)) return false;
  if (input.locale && voice.locale?.toLowerCase() !== input.locale.trim().toLowerCase()) return false;
  if (input.language && voice.language?.toLowerCase() !== input.language.trim().toLowerCase()) return false;
  if (input.style) {
    const style = input.style.trim().toLowerCase();
    if (!voice.style?.some((value) => value.toLowerCase().includes(style))) return false;
  }
  return true;
}

function searchText(voice: VoiceListResult["voices"][number]): string {
  return [
    voice.id,
    voice.label,
    voice.locale,
    voice.language,
    voice.gender,
    voice.description,
    voice.previewText,
    ...(voice.style ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}
