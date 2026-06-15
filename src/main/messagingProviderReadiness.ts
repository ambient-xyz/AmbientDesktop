import type { MessagingGatewayProviderReadiness } from "../shared/messagingGateway";

export type MessagingGatewayReadinessProbe = () => Promise<MessagingGatewayProviderReadiness>;

export interface MessagingGatewayReadinessAdapter {
  providerId: string;
  label: string;
  createProbe(): MessagingGatewayReadinessProbe;
  safety: {
    readsProviderMessages: false;
    sendsProviderMessages: false;
    startsBridge: false;
    readsProviderHistory: false;
  };
}

export interface PlannedMessagingReadinessOptions {
  providerId: string;
  label: string;
  now?: () => Date;
  adapterPlanSummary?: string;
  diagnostics?: string[];
  repairHint?: string;
}

export function readinessProbesFromAdapters(
  adapters: MessagingGatewayReadinessAdapter[],
): Record<string, MessagingGatewayReadinessProbe> {
  const probes: Record<string, MessagingGatewayReadinessProbe> = {};
  for (const adapter of adapters) {
    probes[adapter.providerId] = adapter.createProbe();
  }
  return probes;
}

export function createPlannedMessagingReadinessAdapter(
  options: PlannedMessagingReadinessOptions,
): MessagingGatewayReadinessAdapter {
  const providerId = options.providerId.trim();
  const label = options.label.trim();
  if (!providerId) throw new Error("Planned messaging readiness adapter requires providerId.");
  if (!label) throw new Error(`Planned messaging readiness adapter "${providerId}" requires label.`);
  return {
    providerId,
    label,
    createProbe: () => createPlannedMessagingReadinessProbe({ ...options, providerId, label }),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
    },
  };
}

export function createPlannedMessagingReadinessProbe(
  options: PlannedMessagingReadinessOptions,
): MessagingGatewayReadinessProbe {
  return async () => plannedMessagingProviderReadiness(options);
}

export function plannedMessagingProviderReadiness(
  options: PlannedMessagingReadinessOptions,
): MessagingGatewayProviderReadiness {
  const providerId = options.providerId.trim();
  const label = options.label.trim();
  const now = options.now ?? (() => new Date());
  const adapterPlanSummary = options.adapterPlanSummary?.trim()
    || `${label} adapter is planned but not implemented.`;
  return {
    providerId,
    status: "unavailable",
    configured: false,
    bridgeReachable: false,
    authNeeded: true,
    apiCredentialsPresent: false,
    persistedSessionCount: 0,
    checkedAt: now().toISOString(),
    message: `${label} is a planned Ambient messaging provider target. No reviewed adapter is installed or enabled yet.`,
    repairHint: options.repairHint?.trim()
      || "Use provider metadata for planning only; implement a reviewed adapter and safe readiness probe before setup, bindings, ingestion, lifecycle, or replies.",
    diagnostics: [
      adapterPlanSummary,
      "Planned readiness probe performs no provider I/O.",
      "Planned readiness probe does not inspect local app state, run provider CLIs, read messages, read history, start bridges, or send replies.",
      ...(options.diagnostics ?? []).map((diagnostic) => diagnostic.trim()).filter(Boolean),
    ],
    sessions: [],
  };
}
