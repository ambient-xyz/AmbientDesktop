export type NamedSecretKind = "generic" | "api-key" | "token" | "password" | "login" | "ssh-password";

export type NamedSecretScope = "workspace" | "global";

export interface NamedSecretSummary {
  id: string;
  label: string;
  kind: NamedSecretKind;
  scope: NamedSecretScope;
  owner: string;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  lastUsedAt?: string;
}

export interface SaveNamedSecretInput {
  label: string;
  value: string;
  kind?: NamedSecretKind;
  scope?: NamedSecretScope;
  notes?: string;
}

export interface UpdateNamedSecretInput {
  id: string;
  label?: string;
  value?: string;
  kind?: NamedSecretKind;
  scope?: NamedSecretScope;
  notes?: string;
}

export interface DeleteNamedSecretInput {
  id: string;
}

export interface BrokerNamedSecretUseInput {
  id: string;
  purpose: string;
  target: "local-fixture";
}

export interface BrokerNamedSecretUseResult {
  schemaVersion: "ambient-named-secret-broker-result-v1";
  id: string;
  label: string;
  scope: NamedSecretScope;
  target: "local-fixture";
  purpose: string;
  approved: boolean;
  delivered: boolean;
  redactedEvidence: string;
  usedAt: string;
}

export interface NamedSecretRehydrationTask {
  id: string;
  label: string;
  kind: NamedSecretKind;
  scope: NamedSecretScope;
  owner: string;
  notes?: string;
  reason: "secret-value-not-exported";
}

export interface NamedSecretMetadataExport {
  schemaVersion: "ambient-named-secret-metadata-export-v1";
  exportedAt: string;
  secrets: NamedSecretRehydrationTask[];
}
