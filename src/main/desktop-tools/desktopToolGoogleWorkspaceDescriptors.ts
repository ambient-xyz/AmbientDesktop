import type { DesktopToolDescriptor, WorkflowCapabilityGuidanceDescriptor } from "./desktopToolDescriptorTypes";

const googleWorkspaceReadOnlyWorkflowGuidance: WorkflowCapabilityGuidanceDescriptor[] = [
  {
    id: "google-workspace-read-only-method-policy",
    summary: "Google Workspace workflow calls stay read-only with explicit account and Calendar window provenance.",
    text: "Google Workspace workflow guidance: in WorkflowProgramIR compiler paths, mediated Google method calls are read-only unless a future approved write path is explicitly selected. Use google_workspace_search_methods to choose list/get/search/export/freeBusy-style methods with sideEffect metadata_read or personal_content_read, and HTTP GET/HEAD/POST only when POST is the documented read form such as Calendar freebusy. Mutation verbs remain out of scope here: no creates, updates, deletes, sends, shares, patches, or other resource mutations. google_workspace_call nodes must carry accountHint from an explicit user-provided account handle or google_workspace_status; Calendar list/freebusy calls must include timeMin, timeMax, and timeZone in params or body. For read-only methods, keep write-shaped payload fields absent: no body, upload, or gmailDraft except the documented body for calendar.freebusy.query. Use google_workspace_materialize_file only for managed file handles returned by a read-only Google Workspace call.",
    applicabilityTags: [
      "google_workspace_call",
      "google_workspace_search_methods",
      "google_workspace_materialize_file",
      "read-only",
      "account-provenance",
      "calendar-time-window",
    ],
    risk: "high",
    validatorRefs: [
      "validateWorkflowProgramStatic",
      "google.write_method_rejected",
      "google.search_methods_read_only_required",
      "google.account_hint_required",
      "google.calendar_time_range_required",
      "google.read_only_payload_rejected",
      "google.materialize_requires_file_handle",
    ],
  },
];

export const googleWorkspaceSetupToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "google_workspace_status",
    label: "Google Workspace Status",
    description: "Inspect Ambient's first-party Google Workspace setup state without reading Gmail, Calendar, or Drive content.",
    promptSnippet: "google_workspace_status: Check whether Google Workspace setup is available, in progress, or connected.",
    promptGuidelines: [
      "Use google_workspace_status before offering Google setup or repair steps.",
      "Report available actions and account handles; do not invent account state from memory.",
      "If setup is required, offer google_workspace_install_gws or google_workspace_start_login as the next deterministic action.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "google-workspace-setup",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat", "ui"],
  },
  {
    name: "google_workspace_install_gws",
    label: "Install Google Workspace CLI",
    description: "Install Ambient's pinned, checksum-verified Google Workspace CLI sidecar binary.",
    promptSnippet: "google_workspace_install_gws: Install the managed Google Workspace CLI binary after user approval.",
    promptGuidelines: [
      "Use google_workspace_install_gws only when google_workspace_status reports the managed CLI is missing or unsupported.",
      "Explain that Ambient downloads a pinned gws release and verifies its SHA-256 checksum before installing it.",
      "After installation, call google_workspace_status before starting login.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "run-process",
    permissionScope: "google-workspace-setup",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 120_000,
    runtimeSupport: ["chat", "ui"],
  },
  {
    name: "google_workspace_start_login",
    label: "Start Google Workspace Login",
    description: "Start focused-scope Google OAuth for a local gws account and open the user's browser for sign-in.",
    promptSnippet: "google_workspace_start_login: Start Google sign-in for a local Google Workspace account handle.",
    promptGuidelines: [
      "Use google_workspace_start_login only after the user asks to connect or repair Google.",
      "Pass accountHint when the user named a Google email or local account handle.",
      "If the result reports requiredAction=oauth_client_config, ask the user for the downloaded client_secret JSON path or attachment, then call google_workspace_import_oauth_client.",
      "Do not use bash, ~/.config/gws, ambient_cli_env_bind, tool install directories, or google_workspace_materialize_file to import the OAuth client JSON.",
      "Stop after starting login; the user must complete Google sign-in, 2FA, and consent in the browser.",
      "After the browser reports success, call google_workspace_status or google_workspace_validate_account.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        accountHint: {
          type: "string",
          description: "Optional local account handle, usually the Google email the user wants to connect.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "control-browser",
    permissionScope: "google-workspace-setup",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 15_000,
    runtimeSupport: ["chat", "ui"],
  },
  {
    name: "google_workspace_import_oauth_client",
    label: "Import Google OAuth Client",
    description:
      "Validate and copy a downloaded Google Desktop OAuth client JSON into Ambient's managed Google Workspace CLI account config.",
    promptSnippet:
      "google_workspace_import_oauth_client: Import the downloaded client_secret JSON after Google Workspace setup requests an OAuth client config.",
    promptGuidelines: [
      "Use google_workspace_import_oauth_client after google_workspace_start_login or google_workspace_status reports requiredAction=oauth_client_config.",
      "Pass path as the workspace-relative path for an attached/copied JSON file, or as the exact absolute path when the user explicitly provided the local file path.",
      "Do not read, print, paste, summarize, or log the JSON contents; Ambient validates and copies it into the managed local gws config.",
      "Do not copy OAuth client JSON into ~/.config/gws, Ambient tool install directories, or arbitrary config paths.",
      "After import succeeds, call google_workspace_start_login again for the same accountHint.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        accountHint: {
          type: "string",
          description: "Optional local account handle, usually the Google email the user wants to connect.",
        },
        path: {
          type: "string",
          description: "Workspace-relative or explicitly user-provided absolute path to the downloaded client_secret JSON.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "write-external",
    permissionScope: "google-workspace-setup",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "recommended",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "google_workspace_validate_account",
    label: "Validate Google Workspace Account",
    description: "Validate a local gws account with identity, Gmail labels, Calendar list, and Drive search probes.",
    promptSnippet: "google_workspace_validate_account: Validate a Google Workspace account after sign-in or repair.",
    promptGuidelines: [
      "Use google_workspace_validate_account after the user completes browser consent or asks to repair an account.",
      "Pass accountHint exactly as the account handle from google_workspace_status when validating a known local gws account.",
      "Summarize validation checks and the discovered account email; do not expose raw OAuth output.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        accountHint: {
          type: "string",
          description: "Optional local account handle to validate.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "read-external",
    permissionScope: "google-workspace-setup",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 75_000,
    runtimeSupport: ["chat", "ui"],
  },
  {
    name: "google_workspace_cancel_setup",
    label: "Cancel Google Workspace Setup",
    description: "Cancel the in-flight Google Workspace setup or login process.",
    promptSnippet: "google_workspace_cancel_setup: Cancel an in-flight Google Workspace setup or login process.",
    promptGuidelines: [
      "Use google_workspace_cancel_setup when the user asks to stop an in-progress Google setup or login.",
      "After canceling, call google_workspace_status if the user needs the resulting state.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "run-process",
    permissionScope: "google-workspace-setup",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat", "ui"],
  },
  {
    name: "google_workspace_search_methods",
    label: "Search Google Workspace Methods",
    description: "Search Ambient's mediated Google Workspace API method catalog without reading Google account content.",
    promptSnippet: "google_workspace_search_methods: Search Google Workspace API methods before making a mediated Google call.",
    promptGuidelines: [
      "Use google_workspace_search_methods when the user asks for a Google capability that is not covered by a specific connector operation.",
      "Search by service, resource, operation, HTTP verb, OAuth scope, or side effect; prefer the narrowest relevant method.",
      "After choosing a method, call google_workspace_call with the selected methodId and explicit params/body.",
    ],
    workflowGuidance: googleWorkspaceReadOnlyWorkflowGuidance,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language or method/resource terms to search for.",
        },
        service: {
          type: "string",
          description: "Optional Google service filter such as gmail, calendar, drive, docs, sheets, or slides.",
        },
        sideEffect: {
          type: "string",
          enum: [
            "metadata_read",
            "personal_content_read",
            "draft_write",
            "data_mutation",
            "sharing_mutation",
            "external_communication",
            "unknown",
          ],
        },
        httpMethod: {
          type: "string",
          description: "Optional HTTP verb filter such as GET, POST, PATCH, PUT, or DELETE.",
        },
        scope: {
          type: "string",
          description: "Optional OAuth scope substring filter such as gmail.readonly or drive.file.",
        },
        limit: {
          type: "number",
          description: "Maximum methods to return, capped by Ambient.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "google-workspace-method-catalog",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "google_workspace_call",
    label: "Call Google Workspace Method",
    description: "Call a mediated Google Workspace API method through the local gws CLI after Ambient policy approval.",
    promptSnippet:
      "google_workspace_call: Attempt a Google Workspace API method call; Ambient will pause for approval if no matching grant exists.",
    promptGuidelines: [
      "Call google_workspace_search_methods first unless the exact methodId is already known.",
      "Pass accountHint when the user or setup status identifies the Google account to use.",
      "When google_workspace_status reports multiple accounts, choose one listed handle and pass it exactly as accountHint.",
      "Use params for path/query parameters and body for POST/PATCH/PUT request bodies.",
      "Use the requiredParams and body schema from search results to construct params/body precisely.",
      "For Google Docs text content, prefer drive.files.export with params mimeType text/plain; use docs.documents.get only when the user needs native Docs structural JSON and the Docs API is known available.",
      "For Drive file content create/update, pass upload.path as a workspace-relative path and optional upload.mimeType; do not pass absolute paths, temp paths, or raw file bytes.",
      "For Gmail draft create/update with attachments, pass gmailDraft with message fields and workspace-relative attachment paths; do not build raw MIME, base64 payloads, or local absolute paths yourself.",
      "Set dryRun=true for writes when previewing is useful; Ambient still controls whether the call may execute.",
      "Google Workspace call results may render as compact visible previews while preserving the full structured payload in the Pi session.",
      "Binary Drive exports/downloads and Gmail attachment reads return an Ambient-managed file handle and metadata, not raw bytes or a readable local path.",
      "Use google_workspace_materialize_file only when the user wants the managed Google file saved into the current workspace.",
      "When a recent Google result is large, deeply structured, or unreliable to inspect directly, use long_context_process with recentToolResults instead of relying on the visible preview.",
      "Do not use shell or raw browser automation to bypass this mediated Google method call surface.",
    ],
    workflowGuidance: googleWorkspaceReadOnlyWorkflowGuidance,
    inputSchema: {
      type: "object",
      properties: {
        accountHint: {
          type: "string",
          description: "Optional local gws account handle, usually the Google email.",
        },
        methodId: {
          type: "string",
          description: "Google Workspace method id such as gmail.users.messages.list or drive.files.list.",
        },
        params: {
          type: "object",
          description: "Path and query parameters for the Google API method.",
          additionalProperties: true,
        },
        body: {
          description: "JSON request body for mutating Google API methods.",
        },
        upload: {
          type: "object",
          description: "Optional workspace file upload for Drive file content create/update methods.",
          properties: {
            path: {
              type: "string",
              description: "Workspace-relative source file path to upload.",
            },
            mimeType: {
              type: "string",
              description: "Optional MIME type for the uploaded file content.",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
        gmailDraft: {
          type: "object",
          description:
            "Optional high-level Gmail draft message for Gmail draft create/update methods. Desktop builds the MIME raw payload.",
          properties: {
            to: googleWorkspaceAddressListSchema(),
            cc: googleWorkspaceAddressListSchema(),
            bcc: googleWorkspaceAddressListSchema(),
            from: googleWorkspaceAddressListSchema(),
            replyTo: googleWorkspaceAddressListSchema(),
            subject: {
              type: "string",
              description: "Draft subject.",
            },
            textBody: {
              type: "string",
              description: "Plain text draft body.",
            },
            htmlBody: {
              type: "string",
              description: "Optional HTML draft body.",
            },
            body: {
              type: "string",
              description: "Plain text draft body alias.",
            },
            attachments: {
              type: "array",
              description: "Workspace-relative files to attach to the draft.",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "Workspace-relative attachment file path.",
                  },
                  fileName: {
                    type: "string",
                    description: "Optional attachment filename override.",
                  },
                  mimeType: {
                    type: "string",
                    description: "Optional attachment MIME type.",
                  },
                },
                required: ["path"],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        dryRun: {
          type: "boolean",
          description: "Ask gws to validate the request locally without sending it when the method supports dry-run.",
        },
        idempotencyKey: {
          type: "string",
          description: "Optional caller-supplied idempotency key for audit and approval context.",
        },
      },
      required: ["methodId"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "plugin-defined",
    permissionScope: "google-workspace-method-call",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "recommended",
    defaultTimeoutMs: 60_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "google_workspace_materialize_file",
    label: "Save Google Workspace File",
    description:
      "Save an Ambient-managed Google Workspace binary export, download, or attachment handle into the current workspace after Ambient policy approval.",
    promptSnippet:
      "google_workspace_materialize_file: Save a managed Google Workspace file handle into the workspace when the user wants a local copy.",
    promptGuidelines: [
      "Use this only with handles returned by google_workspace_call file results.",
      "Choose a workspace-relative path; omit path to use Google Workspace Downloads/<fileName>.",
      "Do not use shell or filesystem tools to locate managed Google temp files.",
      "Do not use this to import local OAuth client JSON; use google_workspace_import_oauth_client for Google Workspace setup files.",
      "Set overwrite=true only when the user asked to replace an existing workspace file.",
    ],
    workflowGuidance: googleWorkspaceReadOnlyWorkflowGuidance,
    inputSchema: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: "Managed Google Workspace file handle returned by google_workspace_call.",
        },
        path: {
          type: "string",
          description: "Optional workspace-relative destination path.",
        },
        overwrite: {
          type: "boolean",
          description: "Replace an existing workspace file at path.",
        },
      },
      required: ["handle"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "write-workspace",
    permissionScope: "google-workspace-file-materialize",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "recommended",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat", "workflow"],
  },
];

function googleWorkspaceAddressListSchema(): Record<string, unknown> {
  return {
    anyOf: [
      { type: "string" },
      {
        type: "array",
        items: { type: "string" },
      },
    ],
  };
}
