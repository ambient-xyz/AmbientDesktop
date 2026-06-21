import { useRef, useState } from "react";

import type {
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionRequest,
  PrivilegedCredentialRequest,
  SecureInputRequest,
} from "../../shared/permissionTypes";
import type { AmbientCliSecretDialogState } from "./AppDialogs";
import type { ApiKeyStatus } from "./RightPanel";

export function useAppSecurityPromptState() {
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [privilegedCredentialRequests, setPrivilegedCredentialRequests] =
    useState<PrivilegedCredentialRequest[]>([]);
  const [secureInputRequests, setSecureInputRequests] = useState<SecureInputRequest[]>([]);
  const [permissionAuditRevision, setPermissionAuditRevision] = useState(0);
  const [permissionAudit, setPermissionAudit] = useState<PermissionAuditEntry[]>([]);
  const [permissionGrants, setPermissionGrants] = useState<AmbientPermissionGrant[]>([]);
  const [permissionAuditError, setPermissionAuditError] = useState<string | undefined>();
  const [permissionGrantError, setPermissionGrantError] = useState<string | undefined>();
  const [permissionGrantRevoking, setPermissionGrantRevoking] = useState<string | undefined>();
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [clipboardCandidate, setClipboardCandidate] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | undefined>();
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [ambientCliSecretDialog, setAmbientCliSecretDialog] =
    useState<AmbientCliSecretDialogState | undefined>();
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const ambientCliSecretInputRef = useRef<HTMLInputElement>(null);

  return {
    permissionRequests,
    setPermissionRequests,
    privilegedCredentialRequests,
    setPrivilegedCredentialRequests,
    secureInputRequests,
    setSecureInputRequests,
    permissionAuditRevision,
    setPermissionAuditRevision,
    permissionAudit,
    setPermissionAudit,
    permissionGrants,
    setPermissionGrants,
    permissionAuditError,
    setPermissionAuditError,
    permissionGrantError,
    setPermissionGrantError,
    permissionGrantRevoking,
    setPermissionGrantRevoking,
    apiDialogOpen,
    setApiDialogOpen,
    apiKeyDraft,
    setApiKeyDraft,
    clipboardCandidate,
    setClipboardCandidate,
    apiKeyStatus,
    setApiKeyStatus,
    apiKeyBusy,
    setApiKeyBusy,
    ambientCliSecretDialog,
    setAmbientCliSecretDialog,
    apiKeyInputRef,
    ambientCliSecretInputRef,
  };
}
