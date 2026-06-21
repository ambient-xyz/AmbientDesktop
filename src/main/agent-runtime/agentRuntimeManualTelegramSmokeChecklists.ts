export function manualTelegramDirectorySmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  ownerUserId?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.ownerUserId ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram directory-to-binding smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID: Telegram sender/user id for the owner who is allowed to control Ambient through this conversation.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Safe owner id sources:",
    "- Reuse ownerUserId from an existing Ambient owner binding.",
    "- Reuse sender id from a previous approved bridge event or polling result for this owner conversation.",
    "- If the owner id is unknown, stop and add/approve a narrow owner-id handoff; do not infer it from chat text.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_MESSAGE_ID",
  ].join("\n");
}

export function manualTelegramDirectoryListSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram metadata-only conversation directory picker is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE=1: opt in to the real Telegram metadata-only directory smoke.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "What the smoke does:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Calls the typed Telegram metadata-only conversation directory preview/apply tools.",
    "- Prints sanitized conversation ids, titles, types, unread counts, and update times so the owner-loop smoke can select a conversation id.",
    "- Does not read message bodies, run owner handoff, create bindings, poll unread commands, or send Telegram replies.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the conversation id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
  ].join("\n");
}

export function manualTelegramOwnerHandoffCheckSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram owner-handoff preflight smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE=1: opt in to the real Telegram owner-handoff preflight.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line setup code to check.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "What the smoke verifies:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Runs owner-handoff preview/apply against the selected conversation.",
    "- Accepts no-match as a valid preflight when no inbound setup-code message is present.",
    "- Does not create bindings, poll owner commands, send Telegram replies, or return provider message bodies.",
    "",
    "Important limitation:",
    "- Telegram bridge unread polling intentionally ignores outgoing messages from the bridge account.",
    "- Same-account Telegram Desktop or Saved Messages sends can check bridge health, but they will not satisfy owner handoff.",
    "- For a matched handoff, send the setup code from a separate inbound owner/delegate account in the selected conversation.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
  ].join("\n");
}

export function manualTelegramGuidedOwnerLoopSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual guided Telegram owner-loop smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE=1: opt in to the real guided Telegram owner-loop smoke.",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line setup code the script will wait for.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Guided sequence:",
    "- The script calls ambient_messaging_telegram_owner_loop_activation_plan before low-level tools so the real-provider smoke validates the same reviewed plan-first sequence Pi should use.",
    "- Start the guided script first so the bridge is live before the owner sends messages.",
    "- Send the setup code from an inbound owner/delegate account in the selected Telegram conversation.",
    "- After the script reports a matched owner handoff, send the owner command in the same conversation.",
    "- The script creates the Remote Ambient Surface binding only after owner handoff, calls the activation plan again after binding creation, then waits for the owner command.",
    "- It applies the command, previews the provider-neutral Remote Ambient Surface reply alias, revokes the binding, and stops the bridge.",
    "- It does not send a Telegram reply unless AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 is set for explicit manual send approval.",
    "",
    "Important limitation:",
    "- Same-account Telegram Desktop or Saved Messages sends will not satisfy owner handoff because outgoing bridge-account messages are skipped.",
    "",
    "Does not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover owner ids or commands.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: optional ISO freshness anchor; older unread backlog is marked stale and not projected.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_WAIT_SECONDS",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLL_INTERVAL_MS",
    "- AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER=1: use the periodic Telegram bridge polling runner for command ingestion and verify scheduled ticks before cleanup.",
  ].join("\n");
}

export function manualTelegramOwnerLoopSmokeChecklist(input: {
  profileId?: string;
  stateRoot?: string;
  conversationId?: string;
  setupCode?: string;
  apiCredentialsPresent: boolean;
}): string {
  const missing = [
    input.profileId ? undefined : "AMBIENT_MANUAL_TELEGRAM_PROFILE_ID",
    input.stateRoot ? undefined : "AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT",
    input.conversationId ? undefined : "AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID",
    input.setupCode ? undefined : "AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE",
    input.apiCredentialsPresent ? undefined : "AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH",
  ].filter((value): value is string => Boolean(value));
  return [
    "Manual Telegram owner-loop smoke is not configured.",
    "",
    "Missing required inputs:",
    ...missing.map((item) => `- ${item}`),
    "",
    "Required environment:",
    "- AMBIENT_MANUAL_TELEGRAM_PROFILE_ID: local Telegram auth profile id from Ambient Telegram session setup/readiness.",
    "- AMBIENT_MANUAL_TELEGRAM_STATE_ROOT or AMBIENT_AGENT_TELEGRAM_STATE_ROOT: directory containing the profile bridge-session.json and TDLib state.",
    "- AMBIENT_MANUAL_TELEGRAM_CONVERSATION_ID: exact Telegram conversation/chat id chosen from the metadata-only directory.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE: exact single-line code already sent by the owner in that conversation.",
    "- AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH: Telegram API credentials bound through Ambient-managed env/secret flow.",
    "",
    "Before running:",
    "- Send the setup code from an inbound owner/delegate account in the selected Telegram conversation.",
    "- Then send the relay command in the same conversation so the subsequent real poll has a command to dispatch.",
    "- The default relay command is: switch project Manual Relay Smoke.",
    "- Do not use same-account outgoing messages; the bridge intentionally skips outgoing unread items.",
    "",
    "What the smoke verifies:",
    "- Starts or attaches the real Telegram bridge through the approved lifecycle path.",
    "- Reads the metadata-only conversation directory and verifies the configured conversation is present.",
    "- Runs owner handoff and creates the Remote Ambient Surface binding with ownerHandoffSourceMessageId.",
    "- Runs real unread polling, proves the setup-code message is deduped, applies the relay command, previews the provider-neutral reply alias, and revokes the binding.",
    "- Does not send a Telegram reply by default; set AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY=1 only when you explicitly want the reviewed reply sent.",
    "",
    "Do not ask Pi to scrape Telegram Desktop, use browser automation, run provider CLIs, or read arbitrary Telegram history to discover the owner id.",
    "",
    "Optional filters:",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_QUERY",
    "- AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_POLL_LIMIT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_TEXT",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_COMMAND_NOT_BEFORE: optional ISO freshness anchor; older unread backlog is marked stale and not projected.",
    "- AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY",
  ].join("\n");
}
