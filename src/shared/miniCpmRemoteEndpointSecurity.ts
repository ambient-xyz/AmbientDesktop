export type MiniCpmRemoteEndpointSecurityReviewStatus = "blocked-pending-review";

export type MiniCpmRemoteEndpointSecurityChecklistItemId =
  | "allowed-hosts"
  | "user-consent"
  | "media-privacy"
  | "secret-handling"
  | "request-redaction"
  | "artifact-retention"
  | "network-egress"
  | "ui-copy";

export interface MiniCpmRemoteEndpointSecurityChecklistItem {
  id: MiniCpmRemoteEndpointSecurityChecklistItemId;
  title: string;
  requirement: string;
  evidence: string;
}

export interface MiniCpmRemoteEndpointSecurityReview {
  status: MiniCpmRemoteEndpointSecurityReviewStatus;
  summary: string;
  blockedReason: string;
  checklist: MiniCpmRemoteEndpointSecurityChecklistItem[];
}

export const miniCpmRemoteEndpointSecurityReview: MiniCpmRemoteEndpointSecurityReview = {
  status: "blocked-pending-review",
  summary: "Remote MiniCPM-V endpoints remain disabled until Ambient ships a reviewed hosted-provider path.",
  blockedReason: "MiniCPM-V visual requests can contain screenshots, chat image attachments, sampled video frames, and UI artifacts, so remote egress needs an explicit privacy and security contract before any non-local host is allowed.",
  checklist: [
    {
      id: "allowed-hosts",
      title: "Allowed Hosts",
      requirement: "Define the exact remote host allowlist, tenancy boundary, TLS requirement, and provider identity checks.",
      evidence: "Documented allowlist plus deterministic validation that rejects undeclared hosts before any request is sent.",
    },
    {
      id: "user-consent",
      title: "User Consent",
      requirement: "Require explicit per-provider consent that names the remote host and states that visual media may leave the machine.",
      evidence: "Permission prompt copy, grant scope, revocation behavior, and tests for denied or expired consent.",
    },
    {
      id: "media-privacy",
      title: "Media Privacy",
      requirement: "State which screenshots, images, sampled frames, and metadata may be uploaded, and keep local-only mode as the default.",
      evidence: "Media-boundary policy, supported input types, size limits, and blocked external-media cases.",
    },
    {
      id: "secret-handling",
      title: "Secret Handling",
      requirement: "Use Ambient-managed secret entry or env binding; never expose API keys in chat, tool args, artifacts, logs, or Pi-visible summaries.",
      evidence: "Secret capture flow, redaction tests, and artifact inspection showing no key material leakage.",
    },
    {
      id: "request-redaction",
      title: "Request Redaction",
      requirement: "Redact request bodies, image bytes, absolute paths, auth headers, and provider responses before anything is shown to Pi or saved as a preview.",
      evidence: "Golden artifacts proving full raw data is bounded or protected and previews contain redacted hashes/metadata only.",
    },
    {
      id: "artifact-retention",
      title: "Artifact Retention",
      requirement: "Define how long remote-request artifacts, media copies, raw responses, and error bodies are retained and how users delete them.",
      evidence: "Retention defaults, cleanup path, uninstall behavior, and a test proving user-managed files are preserved.",
    },
    {
      id: "network-egress",
      title: "Network Egress Controls",
      requirement: "Route remote calls through a typed provider adapter with timeout, retry, host, method, body-size, and content-type controls.",
      evidence: "Adapter tests proving no generic URL fetch path, no redirects to undeclared hosts, and clear timeout/error reporting.",
    },
    {
      id: "ui-copy",
      title: "UI Copy",
      requirement: "Show clear local-vs-remote wording in Settings, provider cards, permission prompts, and diagnostics.",
      evidence: "Reviewed copy snapshots that name the host, media privacy tradeoff, cost/privacy note, and local fallback.",
    },
  ],
};

export function miniCpmRemoteEndpointReviewChecklistText(): string {
  return miniCpmRemoteEndpointSecurityReview.checklist.map((item) => item.title.toLowerCase()).join(", ");
}

export function miniCpmRemoteEndpointBlockedMessage(): string {
  return `${miniCpmRemoteEndpointSecurityReview.summary} Required review gates: ${miniCpmRemoteEndpointReviewChecklistText()}.`;
}
