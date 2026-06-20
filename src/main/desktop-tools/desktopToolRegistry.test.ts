import { describe, expect, it } from "vitest";
import {
  bashToolDescriptor,
  browserToolDescriptor,
  browserToolDescriptors,
  fileToolDescriptors,
  firstPartyDesktopToolDescriptors,
  gitToolDescriptor,
  googleWorkspaceSetupToolDescriptor,
  googleWorkspaceSetupToolDescriptors,
  installRouteToolDescriptor,
  localDeepResearchToolDescriptor,
  localDeepResearchToolDescriptors,
  localRuntimeToolDescriptor,
  localRuntimeToolDescriptors,
  mediaToolDescriptor,
  mediaToolDescriptors,
  piToolFieldsFromDescriptor,
  pluginMcpToolDescriptor,
  providerCatalogToolDescriptor,
  providerCatalogToolDescriptors,
  privilegedActionToolDescriptor,
  searchPreferenceToolDescriptor,
  searchPreferenceToolDescriptors,
  sttToolDescriptor,
  sttToolDescriptors,
  visionToolDescriptor,
  visionToolDescriptors,
  webResearchToolDescriptor,
  webResearchToolDescriptors,
  voiceToolDescriptor,
  voiceToolDescriptors,
} from "./desktopToolRegistry";
import { descriptorToolDefinition, registerDesktopTool } from "./desktopToolRegistration";

describe("firstPartyDesktopToolDescriptors", () => {
  it("exposes stable first-party tool names without starting a Pi session", () => {
    expect(firstPartyDesktopToolDescriptors().map((tool) => tool.name)).toEqual([
      "bash",
      "file_read",
      "local_directory_list",
      "local_file_read",
      "file_write",
      "long_context_process",
      "media_download",
      "ambient_voice_status",
      "ambient_voice_select",
      "ambient_voice_list_voices",
      "ambient_voice_refresh_voices",
      "ambient_voice_clone_plan",
      "ambient_voice_clone_create_preview",
      "ambient_voice_clone_create",
      "ambient_voice_clone_status",
      "ambient_voice_clone_delete",
      "ambient_voice_policy_update",
      "ambient_voice_test",
      "ambient_stt_status",
      "ambient_stt_select",
      "ambient_stt_policy_update",
      "ambient_stt_test",
      "ambient_visual_minicpm_setup",
      "ambient_visual_analyze",
      "ambient_local_deep_research_provider_status",
      "ambient_local_deep_research_provider_search",
      "ambient_local_deep_research_provider_describe",
      "ambient_local_deep_research_provider_update",
      "ambient_local_deep_research_setup",
      "ambient_local_deep_research_run",
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_stop",
      "ambient_local_model_runtime_restart",
      "ambient_download_start",
      "ambient_download_status",
      "ambient_download_wait",
      "ambient_download_cancel",
      "ambient_product_context",
      "ambient_install_route_plan",
      "ambient_git_status",
      "ambient_git_commit",
      "ambient_git_finish_to_main",
      "ambient_provider_catalog",
      "web_research_status",
      "web_research_provider_search",
      "web_research_provider_describe",
      "web_research_preferences_update",
      "web_research_search",
      "web_research_fetch",
      "ambient_search_preference_status",
      "ambient_search_preference_update",
      "ambient_messaging_remote_surface_activation_plan",
      "ambient_messaging_remote_surface_provider_support_plan",
      "ambient_messaging_list_providers",
      "ambient_messaging_provider_status",
      "ambient_messaging_telegram_owner_loop_activation_plan",
      "ambient_messaging_telegram_session_preview",
      "ambient_messaging_telegram_session_apply",
      "ambient_messaging_signal_session_preview",
      "ambient_messaging_signal_session_apply",
      "ambient_messaging_list_bindings",
      "ambient_messaging_conversation_directory_preview",
      "ambient_messaging_telegram_conversation_directory_preview",
      "ambient_messaging_telegram_conversation_directory_apply",
      "ambient_messaging_telegram_owner_handoff_preview",
      "ambient_messaging_telegram_owner_handoff_apply",
      "ambient_messaging_signal_conversation_directory_preview",
      "ambient_messaging_signal_conversation_directory_apply",
      "ambient_messaging_signal_unread_window_preview",
      "ambient_messaging_signal_unread_window_apply",
      "ambient_messaging_signal_unread_window_status",
      "ambient_messaging_signal_real_unread_window_preview",
      "ambient_messaging_signal_real_unread_window_apply",
      "ambient_messaging_signal_real_polling_status",
      "ambient_messaging_signal_real_polling_preview",
      "ambient_messaging_signal_real_polling_apply",
      "ambient_messaging_signal_bridge_reply_preview",
      "ambient_messaging_signal_bridge_reply_apply",
      "ambient_messaging_signal_relay_diagnostics",
      "ambient_messaging_signal_binding_readiness_preview",
      "ambient_messaging_signal_owner_handoff_preview",
      "ambient_messaging_signal_owner_handoff_apply",
      "ambient_messaging_signal_remote_surface_preview",
      "ambient_messaging_signal_remote_surface_apply",
      "ambient_messaging_headless_ux_inventory",
      "ambient_messaging_binding_preview",
      "ambient_messaging_binding_apply",
      "ambient_messaging_remote_surface_binding_preview",
      "ambient_messaging_remote_surface_event_preview",
      "ambient_messaging_telegram_remote_surface_preview",
      "ambient_messaging_telegram_remote_surface_apply",
      "ambient_runtime_surface_snapshot",
      "ambient_messaging_synthetic_route",
      "ambient_messaging_telegram_bridge_event_route",
      "ambient_messaging_telegram_bridge_poll_preview",
      "ambient_messaging_telegram_bridge_poll_apply",
      "ambient_messaging_telegram_bridge_polling_status",
      "ambient_messaging_telegram_bridge_polling_preview",
      "ambient_messaging_telegram_bridge_polling_apply",
      "ambient_messaging_telegram_bridge_reply_preview",
      "ambient_messaging_telegram_bridge_reply_apply",
      "ambient_messaging_remote_surface_reply_preview",
      "ambient_messaging_remote_surface_reply_apply",
      "ambient_messaging_remote_surface_command_preview",
      "ambient_messaging_remote_surface_command_apply",
      "ambient_messaging_telegram_relay_diagnostics",
      "ambient_messaging_gateway_status",
      "ambient_messaging_gateway_lifecycle_preview",
      "ambient_messaging_gateway_lifecycle_apply",
      "browser_search",
      "browser_nav",
      "browser_local_preview",
      "browser_content",
      "browser_eval",
      "browser_click",
      "browser_get_value",
      "browser_wait_for",
      "browser_assert",
      "browser_keypress",
      "browser_login",
      "browser_screenshot",
      "browser_pick",
      "ambient_privileged_action_status",
      "ambient_privileged_action_request",
      "ambient_plugin_install_preview",
      "ambient_plugin_install_commit",
      "ambient_plugin_activate",
      "ambient_setup_runtime_preflight",
      "ambient_setup_recipe_describe",
      "ambient_setup_final_report",
      "ambient_mcp_autowire_plan",
      "ambient_mcp_autowire_review",
      "ambient_mcp_autowire_evidence_read",
      "ambient_mcp_autowire_plan_revision_list",
      "ambient_mcp_autowire_plan_revision_read",
      "ambient_mcp_autowire_plan_edit_describe",
      "ambient_mcp_autowire_plan_edit_apply",
      "ambient_mcp_autowire_source_build_describe",
      "ambient_mcp_autowire_source_build_create",
      "ambient_mcp_autowire_custom_source_describe",
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_server_list",
      "ambient_mcp_server_diagnostics",
      "ambient_mcp_server_default_update_describe",
      "ambient_mcp_runtime_repair_describe",
      "ambient_mcp_runtime_repair_apply",
      "ambient_mcp_secret_request",
      "ambient_mcp_server_uninstall",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
      "ambient_mcp_tool_review_accept",
      "ambient_mcp_tool_policy_update",
      "ambient_mcp_aggregation_status",
      "ambient_json_repair",
      "ambient_capability_builder_plan",
      "ambient_capability_builder_scaffold",
      "ambient_capability_builder_preview",
      "ambient_capability_builder_list_files",
      "ambient_capability_builder_read_file",
      "ambient_capability_builder_write_file",
      "ambient_capability_builder_secret_request",
      "ambient_capability_builder_history",
      "ambient_capability_builder_update_plan",
      "ambient_capability_builder_repair_plan",
      "ambient_capability_builder_apply_repair",
      "ambient_capability_builder_removal_plan",
      "ambient_capability_builder_unregister",
      "ambient_capability_builder_install_deps",
      "ambient_capability_builder_validate",
      "ambient_capability_builder_register",
      "ambient_cli_package_preview",
      "ambient_cli_package_install",
      "ambient_cli_package_install_pi_catalog",
      "ambient_cli_env_bind",
      "ambient_cli_secret_request",
      "ambient_cli_search",
      "ambient_cli_describe",
      "ambient_cli",
      "ambient_workflows_search",
      "ambient_workflows_describe",
      "ambient_workflows_callable_catalog",
      "ambient_workflows_callable_describe",
      "ambient_workflows_inject",
      "ambient_workflows_update",
      "ambient_workflows_archive",
      "ambient_workflows_unarchive",
      "ambient_workflows_restore_version",
      "ambient_cli_package_uninstall",
      "ambient_pi_extension_install_sandboxed",
      "ambient_pi_extension",
      "ambient_pi_extension_uninstall_sandboxed",
      "ambient_pi_extension_history",
      "ambient_pi_extension_clear_history",
      "ambient_pi_privileged_scan",
      "ambient_pi_privileged_install",
      "ambient_pi_privileged_disable",
      "ambient_pi_privileged_uninstall",
      "ambient_pi_privileged_history",
      "ambient_pi_privileged_clear_history",
      "google_workspace_status",
      "google_workspace_install_gws",
      "google_workspace_start_login",
      "google_workspace_import_oauth_client",
      "google_workspace_validate_account",
      "google_workspace_cancel_setup",
      "google_workspace_search_methods",
      "google_workspace_call",
      "google_workspace_materialize_file",
    ]);
  });

  it("describes Ambient Git tools as worktree-aware first-party capabilities", () => {
    expect(gitToolDescriptor("ambient_git_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "git-read",
      supportsDryRun: true,
    });
    expect(gitToolDescriptor("ambient_git_commit").promptGuidelines.join("\n")).toContain("active thread worktree");
    expect(gitToolDescriptor("ambient_git_finish_to_main").promptGuidelines.join("\n")).toContain("main");
  });

  it("provides workflow-relevant metadata for every descriptor", () => {
    for (const descriptor of firstPartyDesktopToolDescriptors()) {
      expect(descriptor.label).toBeTruthy();
      expect(descriptor.description).toBeTruthy();
      expect(descriptor.promptSnippet).toContain(descriptor.name);
      expect(descriptor.inputSchema).toMatchObject({ type: "object" });
      expect(descriptor.permissionScope).toBeTruthy();
      expect(descriptor.defaultTimeoutMs).toBeGreaterThan(0);
      expect(["first-party", "pi-builtin"]).toContain(descriptor.source);
      expect(["none", "read-external", "write-external", "write-workspace", "control-browser", "run-process", "plugin-defined"]).toContain(
        descriptor.sideEffects,
      );
    }
  });

  it("marks browser tools with permission scopes that match the existing policy", () => {
    expect(browserToolDescriptor("browser_search")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "browser-network",
      supportsDryRun: true,
    });
    expect(browserToolDescriptor("browser_local_preview")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "browser-network",
      supportsDryRun: false,
      defaultTimeoutMs: 120_000,
    });
    expect(browserToolDescriptor("browser_local_preview").promptGuidelines.join("\n")).toContain("avoid installing jsdom");
    expect(browserToolDescriptor("browser_nav").promptGuidelines.join("\n")).toContain("browser_local_preview");
    expect(browserToolDescriptor("browser_eval")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "browser-control",
      supportsDryRun: false,
    });
    expect(browserToolDescriptor("browser_eval").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("expression or an async function body"),
        expect.stringContaining("document.images"),
        expect.stringContaining("og:image"),
      ]),
    );
    for (const toolName of ["browser_click", "browser_get_value", "browser_wait_for", "browser_assert"]) {
      expect(browserToolDescriptor(toolName)).toMatchObject({
        sideEffects: "control-browser",
        permissionScope: "browser-control",
        supportsDryRun: false,
        defaultTimeoutMs: 300_000,
      });
    }
    expect(browserToolDescriptor("browser_click").promptGuidelines.join("\n")).toContain("browser_get_value");
    expect(browserToolDescriptor("browser_assert").promptGuidelines.join("\n")).toContain("generated app verification");
    expect(browserToolDescriptor("browser_pick")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "browser-control",
      defaultTimeoutMs: 120_000,
    });
    expect(browserToolDescriptor("browser_keypress")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "browser-control",
      supportsDryRun: false,
    });
    expect(browserToolDescriptor("browser_login")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "browser-login",
      supportsDryRun: false,
    });
  });

  it("keeps descriptor schemas aligned with Pi registration fields", () => {
    const descriptor = browserToolDescriptor("browser_nav");
    expect(piToolFieldsFromDescriptor(descriptor)).toEqual({
      name: "browser_nav",
      label: "Browser Navigate",
      description: descriptor.description,
      promptSnippet: descriptor.promptSnippet,
      promptGuidelines: descriptor.promptGuidelines,
      parameters: descriptor.inputSchema,
    });
  });

  it("wraps descriptor-backed Pi tool registration fields without changing schemas", () => {
    const descriptor = mediaToolDescriptor("media_download");
    const execute = async () => ({
      content: [{ type: "text" as const, text: "ok" }],
      details: { status: "complete" },
    });

    const definition = descriptorToolDefinition(descriptor, {
      executionMode: "sequential",
      execute,
    });
    const registered: unknown[] = [];
    registerDesktopTool({
      registerTool: (tool) => registered.push(tool),
    }, descriptor, {
      executionMode: "sequential",
      execute,
    });

    expect(definition).toMatchObject({
      name: descriptor.name,
      label: descriptor.label,
      description: descriptor.description,
      promptSnippet: descriptor.promptSnippet,
      promptGuidelines: descriptor.promptGuidelines,
      executionMode: "sequential",
    });
    expect(definition.parameters).toBe(descriptor.inputSchema);
    expect(definition.execute).toBe(execute);
    expect(definition.prepareArguments?.({
      toolName: descriptor.name,
      toolInput: { url: "https://example.test/image.png" },
    })).toEqual({ url: "https://example.test/image.png" });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      name: descriptor.name,
      label: descriptor.label,
      description: descriptor.description,
      executionMode: "sequential",
    });
  });

  it("gives workflow browser page-read tools enough time for Chrome startup and content extraction", () => {
    for (const toolName of ["browser_search", "browser_nav", "browser_local_preview", "browser_content"]) {
      expect(browserToolDescriptor(toolName).defaultTimeoutMs).toBeGreaterThanOrEqual(120_000);
    }
  });

  it("keeps file_write workflow guidance scoped to staged mutations", () => {
    const descriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "file_write")!;

    expect(descriptor.workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "file-write-staged-mutation",
          risk: "high",
          validatorRefs: expect.arrayContaining(["ir.mutation_stage_required", "ir.unavailable_tool"]),
          text: expect.stringContaining("use file_write only as mutation.stage"),
        }),
      ]),
    );
  });

  it("tells Pi that media artifacts are eligible for Desktop inline preview", () => {
    expect(bashToolDescriptor.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Ambient Desktop will attempt an inline media preview"),
      ]),
    );
    expect(mediaToolDescriptor("media_download")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "media-download",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(mediaToolDescriptor("media_download").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("browser_search or a known source page"),
        expect.stringContaining("sourceUrl plus a concise licenseNote"),
        expect.stringContaining("instead of bash/curl"),
        expect.stringContaining("will attempt an inline media preview"),
        expect.stringContaining("do not claim inline image display is unsupported"),
      ]),
    );
  });

  it("adds a shared capability routing contract to Ambient CLI and Pi extension tools", () => {
    const ambientCliDescriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_cli")!;
    const ambientCli = piToolFieldsFromDescriptor(ambientCliDescriptor);
    expect(ambientCli.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("preflight-description"),
        expect.stringContaining("no command was executed"),
      ]),
    );
    expect(ambientCli.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Capability routing order"),
        expect.stringContaining("ambient_install_route_plan first"),
        expect.stringContaining("always call ambient_cli_describe"),
        expect.stringContaining("no-execute preflight description"),
        expect.stringContaining("Ambient-owned wrapper"),
        expect.stringContaining("ambient_privileged_action_request"),
      ]),
    );
    expect(ambientCliDescriptor.workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-cli-describe-before-run",
          validatorRefs: expect.arrayContaining(["ambient_cli.describe_required", "ambient_cli.capability_required"]),
          text: expect.stringContaining("Every ambient_cli execution must identify the package"),
        }),
        expect.objectContaining({
          id: "ambient-cli-missing-env-setup",
          validatorRefs: expect.arrayContaining(["ambient_cli.capability_missing_env", "ambient_cli.secret_env_not_declared"]),
          text: expect.stringContaining("do not emit the secret-backed ambient_cli execution yet"),
        }),
        expect.objectContaining({
          id: "ambient-cli-secret-redaction",
          validatorRefs: expect.arrayContaining(["ambient_cli.secret_value_rejected", "ambient_cli.env_bind_file_path_invalid"]),
          text: expect.stringContaining("workflows must not pass secret-bearing CLI flags"),
        }),
      ]),
    );
    expect(firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_cli_describe")?.workflowGuidance).toBe(
      ambientCliDescriptor.workflowGuidance,
    );
    expect(firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_cli_secret_request")?.workflowGuidance).toBe(
      ambientCliDescriptor.workflowGuidance,
    );
    const workflowInjectDescriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_workflows_inject")!;
    const callableCatalogDescriptor = firstPartyDesktopToolDescriptors().find((tool) =>
      tool.name === "ambient_workflows_callable_catalog"
    )!;
    const callableDescribeDescriptor = firstPartyDesktopToolDescriptors().find((tool) =>
      tool.name === "ambient_workflows_callable_describe"
    )!;
    expect(piToolFieldsFromDescriptor(callableCatalogDescriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("manual playbook-guided run"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(callableDescribeDescriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ambient_workflows_callable_catalog selects a specific callable workflow entry"),
        expect.stringContaining("does not execute workflows"),
        expect.stringContaining("must not expose hidden launch tool names"),
        expect.stringContaining("manual playbook-guided run"),
      ]),
    );
    expect(callableDescribeDescriptor.workflowGuidance).toBe(workflowInjectDescriptor.workflowGuidance);
    expect(workflowInjectDescriptor.workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambient-workflows-describe-before-inject",
          text: expect.stringContaining("Call ambient_workflows_describe before ambient_workflows_inject"),
        }),
        expect.objectContaining({
          id: "ambient-workflows-describe-before-inject",
          text: expect.stringContaining("manual playbook-guided run"),
        }),
        expect.objectContaining({
          id: "ambient-workflows-no-automation-execution",
          text: expect.stringContaining("do not treat recorded workflow playbooks as runnable code"),
        }),
      ]),
    );
    expect(piToolFieldsFromDescriptor(firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_pi_privileged_install")!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Never route first-party Ambient CLI adapters"),
        expect.stringContaining("Do not use ambient_pi_privileged_install for first-party Ambient CLI adapters"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_pi_extension_install_sandboxed")!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Do not use this for ordinary Pi marketplace install requests"),
        expect.stringContaining("compatibility-only"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(browserToolDescriptor("browser_nav")).promptGuidelines).toBe(browserToolDescriptor("browser_nav").promptGuidelines);
    expect(piToolFieldsFromDescriptor(firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_repair_plan")!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("installerRecoveryTemplates"),
        expect.stringContaining("stdout-vs-file-artifact"),
      ]),
    );
  });

  it("exposes JSON repair as a recovery-only first-party tool", () => {
    const descriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_json_repair")!;
    expect(descriptor).toMatchObject({
      sideEffects: "none",
      permissionScope: "json-repair",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(descriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("only after"),
        expect.stringContaining("Do not call this tool for first-pass JSON generation"),
        expect.stringContaining("Never send API keys"),
      ]),
    );
  });

  it("exposes install route planning as a read-only direct routing contract", () => {
    const descriptor = installRouteToolDescriptor("ambient_install_route_plan");
    expect(descriptor).toMatchObject({
      sideEffects: "none",
      permissionScope: "install-route-plan",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(descriptor.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ambiguous install"),
        expect.stringContaining("Pi marketplace packages"),
        expect.stringContaining("plugin marketplace"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(descriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ambient_install_route_plan first"),
        expect.stringContaining("Ambient-owned wrapper"),
        expect.stringContaining("unsupported plugin marketplace"),
      ]),
    );
  });

  it("exposes MCP autowire and registry server tools with progressive discovery guidance", () => {
    const registryNames = firstPartyDesktopToolDescriptors().map((tool) => tool.name);
    expect(registryNames).toEqual(expect.arrayContaining([
      "ambient_setup_runtime_preflight",
      "ambient_mcp_autowire_plan",
      "ambient_mcp_autowire_review",
      "ambient_mcp_autowire_evidence_read",
      "ambient_mcp_autowire_source_build_describe",
      "ambient_mcp_autowire_source_build_create",
      "ambient_mcp_autowire_custom_source_describe",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_install",
      "ambient_mcp_server_list",
      "ambient_mcp_server_default_update_describe",
      "ambient_mcp_secret_request",
      "ambient_mcp_server_uninstall",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
      "ambient_mcp_tool_review_accept",
      "ambient_mcp_tool_policy_update",
      "ambient_mcp_aggregation_status",
    ]));
    const autowire = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_plan")!;
    const setupRuntimePreflight = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_setup_runtime_preflight")!;
    const autowireReview = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_review")!;
    const evidenceRead = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_evidence_read")!;
    const sourceBuildDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_source_build_describe")!;
    const sourceBuildCreate = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_source_build_create")!;
    const customSourceDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_autowire_custom_source_describe")!;
    const search = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_search")!;
    const remoteDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_remote_proxy_describe")!;
    const remoteInstall = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_remote_proxy_install")!;
    const guidedDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_guided_bridge_describe")!;
    const guidedPreflight = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_guided_bridge_preflight")!;
    const guidedRegister = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_guided_bridge_register")!;
    const importDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_standard_import_describe")!;
    const importInstall = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_standard_import_install")!;
    const describe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_describe")!;
    const install = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_install")!;
    const list = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_list")!;
    const defaultUpdateDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_default_update_describe")!;
    const secretRequest = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_secret_request")!;
    const uninstall = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_server_uninstall")!;
    const toolSearch = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_tool_search")!;
    const toolDescribe = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_tool_describe")!;
    const toolCall = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_tool_call")!;
    const toolReviewAccept = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_tool_review_accept")!;
    const toolPolicyUpdate = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_tool_policy_update")!;
    const aggregationStatus = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_mcp_aggregation_status")!;

    expect(setupRuntimePreflight).toMatchObject({
      sideEffects: "none",
      permissionScope: "setup-runtime-preflight",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    const setupPreflightGuidance = piToolFieldsFromDescriptor(setupRuntimePreflight).promptGuidelines.join("\n");
    expect(setupPreflightGuidance).toContain("before running npm");
    expect(setupPreflightGuidance).toContain("mixed host/runtime architecture");
    expect(autowire).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "mcp-autowire-discovery",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    const autowireGuidance = piToolFieldsFromDescriptor(autowire).promptGuidelines.join("\n");
    expect(autowireGuidance).toContain("bounded and policy-filtered");
    expect(autowireGuidance).toContain("does not install");
    expect(autowireGuidance).toContain("normal_app");
    expect(autowireGuidance).toContain("ambient_setup_runtime_preflight");
    expect(autowireGuidance).toContain("GhidraMCP");
    expect(autowireGuidance).toContain("install this MCP");
    expect(autowireGuidance).toContain("ambient_mcp_autowire_evidence_read");
    expect(autowireReview).toMatchObject({
      sideEffects: "none",
      permissionScope: "mcp-autowire-discovery",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    const reviewGuidance = piToolFieldsFromDescriptor(autowireReview).promptGuidelines.join("\n");
    expect(reviewGuidance).toContain("toolhive-registry-install");
    expect(reviewGuidance).toContain("read-only");
    expect(reviewGuidance).toContain("Never use this tool to run package managers");
    expect(reviewGuidance).toContain("candidateRef");
    expect((autowireReview.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect(evidenceRead).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "mcp-autowire-discovery",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(evidenceRead).promptGuidelines.join("\n")).toContain("raw curl/wget/bash");
    expect(sourceBuildDescribe).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "mcp-autowire-source-build",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(sourceBuildDescribe).promptGuidelines.join("\n")).toContain("Do not use guided-local bridge");
    expect(sourceBuildCreate).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "mcp-autowire-source-build",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(sourceBuildCreate).promptGuidelines.join("\n")).toContain("clone/build/inspect");
    expect(customSourceDescribe).toMatchObject({
      sideEffects: "none",
      permissionScope: "mcp-autowire-discovery",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    const customSourceGuidance = piToolFieldsFromDescriptor(customSourceDescribe).promptGuidelines.join("\n");
    expect(customSourceGuidance).toContain("after ambient_mcp_autowire_source_build_create");
    expect(customSourceGuidance).toContain("pinned commit and digest");
    expect(customSourceGuidance).toContain("does not clone, build, push, run, install");
    expect(customSourceGuidance).toContain("unreviewed generated Dockerfiles");
    expect(customSourceGuidance).toContain("ambient_mcp_standard_import_describe");
    expect((customSourceDescribe.inputSchema as any).properties.sourceBuild).toMatchObject({ type: "object" });
    expect(search).toMatchObject({ sideEffects: "read-external", permissionScope: "mcp-server-discovery", runtimeSupport: ["chat"] });
    expect(remoteDescribe).toMatchObject({ sideEffects: "write-external", permissionScope: "mcp-server-discovery", runtimeSupport: ["chat"] });
    expect(remoteInstall).toMatchObject({ sideEffects: "run-process", permissionScope: "mcp-server-install", supportsUndo: true, runtimeSupport: ["chat"] });
    expect(guidedDescribe).toMatchObject({ sideEffects: "none", permissionScope: "mcp-guided-local-bridge", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(guidedPreflight).toMatchObject({ sideEffects: "read-external", permissionScope: "mcp-guided-local-bridge", supportsUndo: false, runtimeSupport: ["chat"] });
    expect(guidedRegister).toMatchObject({ sideEffects: "write-external", permissionScope: "mcp-guided-local-bridge", supportsUndo: true, runtimeSupport: ["chat"] });
    expect(describe).toMatchObject({ sideEffects: "write-external", permissionScope: "mcp-server-discovery", runtimeSupport: ["chat"] });
    expect(install).toMatchObject({ sideEffects: "run-process", permissionScope: "mcp-server-install", supportsUndo: true, runtimeSupport: ["chat"] });
    expect((importDescribe.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect((importInstall.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect((describe.inputSchema as any).properties.secretBindings).toMatchObject({ type: "array" });
    expect((install.inputSchema as any).properties.secretBindings).toMatchObject({ type: "array" });
    expect(piToolFieldsFromDescriptor(install).promptGuidelines.join("\n")).toContain("ambient_mcp_secret_request");
    expect(secretRequest).toMatchObject({ sideEffects: "none", permissionScope: "mcp-server-secret", supportsUndo: false, runtimeSupport: ["chat"] });
    expect((secretRequest.inputSchema as any).properties).toMatchObject({
      serverId: { type: "string" },
      candidateRef: { type: "string" },
      envName: { type: "string" },
    });
    expect(piToolFieldsFromDescriptor(secretRequest).promptGuidelines.join("\n")).toContain("put secret values");
    expect(piToolFieldsFromDescriptor(importDescribe).promptGuidelines.join("\n")).toContain("nextToolName/nextToolInput");
    expect(piToolFieldsFromDescriptor(importInstall).promptGuidelines.join("\n")).toContain("candidateRef");
    expect(piToolFieldsFromDescriptor(importInstall).promptGuidelines.join("\n")).toContain("Do not call ambient_tool_search again");
    expect(piToolFieldsFromDescriptor(importInstall).promptGuidelines.join("\n")).toContain("ensure operation");
    expect(piToolFieldsFromDescriptor(importInstall).promptGuidelines.join("\n")).toContain("managed file-exchange state");
    expect(list).toMatchObject({ sideEffects: "none", permissionScope: "mcp-server-discovery", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(defaultUpdateDescribe).toMatchObject({ sideEffects: "none", permissionScope: "mcp-server-discovery", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(piToolFieldsFromDescriptor(defaultUpdateDescribe).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("defaultCatalog=update-available"),
      expect.stringContaining("read-only"),
      expect.stringContaining("Do not relabel"),
    ]));
    expect(uninstall).toMatchObject({ sideEffects: "run-process", permissionScope: "mcp-server-install", supportsUndo: false, runtimeSupport: ["chat"] });
    expect(toolSearch).toMatchObject({ sideEffects: "read-external", permissionScope: "mcp-tool-discovery", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(toolDescribe).toMatchObject({ sideEffects: "read-external", permissionScope: "mcp-tool-discovery", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(toolCall).toMatchObject({ sideEffects: "plugin-defined", permissionScope: "mcp-tool-call", supportsUndo: false, runtimeSupport: ["chat"] });
    expect(toolReviewAccept).toMatchObject({ sideEffects: "write-external", permissionScope: "mcp-tool-review", supportsUndo: false, runtimeSupport: ["chat"] });
    expect(toolPolicyUpdate).toMatchObject({ sideEffects: "write-external", permissionScope: "mcp-tool-policy", supportsUndo: true, runtimeSupport: ["chat"] });
    expect((toolPolicyUpdate.inputSchema as any).properties.callPolicy.enum).toEqual(["default", "blocked", "approval-required"]);
    expect(piToolFieldsFromDescriptor(toolPolicyUpdate).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("visibility=hidden"),
      expect.stringContaining("clear=true"),
      expect.stringContaining("app-global Ambient MCP state"),
    ]));
    expect(aggregationStatus).toMatchObject({ sideEffects: "read-external", permissionScope: "mcp-aggregation-readiness", supportsDryRun: true, runtimeSupport: ["chat"] });
    expect(piToolFieldsFromDescriptor(aggregationStatus).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("read-only readiness gate"),
      expect.stringContaining("compact ambient_mcp_tool_search/describe/call bridge"),
      expect.stringContaining("server-prefixed namespace preview"),
    ]));
    expect(piToolFieldsFromDescriptor(install).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Capability routing order"),
        expect.stringContaining("ToolHive registry server ids only"),
        expect.stringContaining("ambient_mcp_secret_request"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(remoteInstall).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("Remote MCP endpoints"),
      expect.stringContaining("never put secret values into ToolHive args"),
    ]));
    expect(piToolFieldsFromDescriptor(guidedPreflight).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("loopback"),
      expect.stringContaining("does not install or launch software"),
      expect.stringContaining("GhidraMCP"),
    ]));
    expect(piToolFieldsFromDescriptor(guidedRegister).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("global Ambient MCP state"),
      expect.stringContaining("tools/list descriptor discovery only"),
      expect.stringContaining("does not install, launch, modify, stop, or update local software"),
    ]));
    expect(piToolFieldsFromDescriptor(uninstall).promptGuidelines).toEqual(expect.arrayContaining([expect.stringContaining("exact serverId or workloadName")]));
    expect(piToolFieldsFromDescriptor(toolCall).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("schema"),
      expect.stringContaining("descriptor drift"),
      expect.stringContaining("Large tool outputs"),
      expect.stringContaining("Managed file input hints"),
    ]));
    expect(piToolFieldsFromDescriptor(toolReviewAccept).promptGuidelines).toEqual(expect.arrayContaining([
      expect.stringContaining("needs-review"),
      expect.stringContaining("expectedDescriptorHash"),
    ]));
  });

  it("exposes privileged action request as a typed dry-run handoff", () => {
    expect(privilegedActionToolDescriptor("ambient_privileged_action_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "privileged-action-status",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(privilegedActionToolDescriptor("ambient_privileged_action_status")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dry-run only"),
        expect.stringContaining("supportedPurposes"),
        expect.stringContaining("policyHints"),
        expect.stringContaining("policyPlanning"),
        expect.stringContaining("selectedAdapter"),
        expect.stringContaining("allowedByPolicy=false"),
      ]),
    );
    const descriptor = privilegedActionToolDescriptor("ambient_privileged_action_request");
    expect(descriptor).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "privileged-action",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(descriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("protected system path"),
        expect.stringContaining("Do not call bash/shell/sudo"),
        expect.stringContaining("{{AMBIENT_PRIVILEGED_AUTH}}"),
        expect.stringContaining("available native adapters execute structured templates"),
        expect.stringContaining("rehearseCredentialPrompt"),
      ]),
    );
  });

  it("exposes Capability Builder planning as a read-only first-party contract", () => {
    const descriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_plan");
    expect(descriptor).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-plan",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(descriptor!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("does not write files"),
        expect.stringContaining("Ambient capability package"),
        expect.stringContaining("ElevenLabs should plan ELEVENLABS_API_KEY"),
        expect.stringContaining("not selectable for chat voice output"),
        expect.stringContaining("ambient_capability_builder_secret_request before validation"),
        expect.stringContaining("upstream README/install/example docs"),
        expect.stringContaining("network/API capabilities"),
        expect.stringContaining("responseFormats"),
        expect.stringContaining("wait for user approval"),
      ]),
    );
    expect((descriptor!.inputSchema as { properties: Record<string, unknown> }).properties).toMatchObject({
      envNames: expect.objectContaining({ type: "array" }),
      networkHosts: expect.objectContaining({ type: "array" }),
      modelAssets: expect.objectContaining({ type: "array" }),
      outputFileArtifactTypes: expect.objectContaining({ anyOf: expect.any(Array) }),
    });
    const scaffold = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_scaffold");
    expect(scaffold).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "capability-builder-scaffold",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(scaffold!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("approved responseFormats"),
        expect.stringContaining("not in file artifact declarations"),
      ]),
    );
    expect((scaffold!.inputSchema as { properties: Record<string, unknown> }).properties).toMatchObject({
      responseFormats: expect.objectContaining({ type: "array" }),
    });
    const preview = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_preview");
    expect(preview).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-preview",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect((preview!.inputSchema as { properties: Record<string, unknown> }).properties).toMatchObject({
      sourcePath: expect.objectContaining({ type: "string" }),
    });
    const listFiles = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_list_files");
    expect(piToolFieldsFromDescriptor(listFiles!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("generated/dependency directories"),
        expect.stringContaining("pathPrefix, maxEntries, maxDepth, and cursor"),
        expect.stringContaining("includeGenerated=true only with a narrow pathPrefix"),
        expect.stringContaining("inventory artifact"),
        expect.stringContaining("long_context_process"),
      ]),
    );
    expect((listFiles!.inputSchema as { properties: Record<string, unknown> }).properties).toMatchObject({
      pathPrefix: expect.objectContaining({ type: "string" }),
      maxEntries: expect.objectContaining({ type: "number" }),
      maxDepth: expect.objectContaining({ type: "number" }),
      includeGenerated: expect.objectContaining({ type: "boolean" }),
      cursor: expect.objectContaining({ type: "string" }),
    });
    const history = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_history");
    expect(history).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-history",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(history!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("what was unregistered"),
        expect.stringContaining("read-only"),
        expect.stringContaining("before rollback"),
      ]),
    );
    const updatePlan = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_update_plan");
    expect(updatePlan).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-update-plan",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(updatePlan!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("before editing files"),
        expect.stringContaining("sourcePath"),
        expect.stringContaining("rollback plan"),
        expect.stringContaining("Do not call ambient_capability_builder_preview separately"),
        expect.stringContaining("wait for user approval"),
      ]),
    );
    const repairPlan = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_repair_plan");
    expect(repairPlan).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-repair-plan",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(repairPlan!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid or warning-bearing"),
        expect.stringContaining("sourcePath"),
        expect.stringContaining("not selectable for assistant voice output"),
        expect.stringContaining("Convert this TTS artifact generator into an Ambient tts-provider for chat voicing"),
        expect.stringContaining("before editing files"),
        expect.stringContaining("validation plan"),
        expect.stringContaining("wait for user approval"),
      ]),
    );
    const applyRepair = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_apply_repair");
    expect(applyRepair).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "capability-builder-apply-repair",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(applyRepair!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("after ambient_capability_builder_repair_plan"),
        expect.stringContaining("UTF-8 text files"),
        expect.stringContaining("clears stale validation metadata"),
        expect.stringContaining("ambient_capability_builder_preview"),
      ]),
    );
    const removalPlan = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_removal_plan");
    expect(removalPlan).toMatchObject({
      sideEffects: "none",
      permissionScope: "capability-builder-removal-plan",
      supportsDryRun: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(removalPlan!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("before unregistering"),
        expect.stringContaining("preserve-by-default"),
        expect.stringContaining("Do not call ambient_capability_builder_preview separately"),
        expect.stringContaining("wait for user approval"),
      ]),
    );
    const unregister = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_unregister");
    expect(unregister).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "capability-builder-unregister",
      supportsDryRun: false,
      supportsUndo: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(unregister!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("after ambient_capability_builder_removal_plan"),
        expect.stringContaining("preserves managed builder source"),
        expect.stringContaining("Do not delete builder source"),
      ]),
    );
    const installDeps = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_install_deps");
    expect(installDeps).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "capability-builder-install-deps",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(installDeps!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("exact commands"),
        expect.stringContaining("without a shell"),
        expect.stringContaining("package-local isolated environments"),
        expect.stringContaining("bounded stdout/stderr previews"),
      ]),
    );
    const validate = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_validate");
    expect(validate).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "capability-builder-validate",
      supportsDryRun: false,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(validate!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("before registration"),
        expect.stringContaining("healthCheck"),
        expect.stringContaining("artifact references"),
        expect.stringContaining("missing declared env requirement"),
      ]),
    );
    const register = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "ambient_capability_builder_register");
    expect(register).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "capability-builder-register",
      supportsDryRun: false,
      supportsUndo: true,
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(register!).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("after ambient_capability_builder_validate succeeds"),
        expect.stringContaining("marked unregistered"),
        expect.stringContaining("searchable and describable"),
        expect.stringContaining("ambient_cli_search"),
      ]),
    );
  });

  it("keeps all browser descriptors in the first-party registry", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of browserToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
  });

  it("keeps browser profile selection out of Pi-facing browser tool schemas", () => {
    for (const descriptor of browserToolDescriptors) {
      expect(((descriptor.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})).not.toHaveProperty("profileMode");
    }
    expect(browserToolDescriptor("browser_search").promptGuidelines.join("\n")).toContain("Ambient chooses the managed browser profile");
  });

  it("keeps voice settings controls small and Pi-directed", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of voiceToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    expect(voiceToolDescriptor("ambient_voice_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "voice-settings-read",
      supportsDryRun: false,
    });
    expect(voiceToolDescriptor("ambient_voice_select")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "voice-settings-write",
      supportsDryRun: false,
    });
    expect(voiceToolDescriptor("ambient_voice_select").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_voice_status first"),
        expect.stringContaining("switch to Piper"),
        expect.stringContaining("Use ambient_voice_policy_update"),
        expect.stringContaining("Do not install, repair, register, run ambient_cli"),
        expect.stringContaining("Ambient core voice settings"),
      ]),
    );
    expect(voiceToolDescriptor("ambient_voice_list_voices")).toMatchObject({
      sideEffects: "none",
      permissionScope: "voice-settings-read",
      supportsDryRun: true,
    });
    expect(voiceToolDescriptor("ambient_voice_list_voices").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_voice_status first"),
        expect.stringContaining("too many voices"),
        expect.stringContaining("cacheStatus is none or stale"),
        expect.stringContaining("Use ambient_voice_select only after resolving an exact voiceId"),
      ]),
    );
    expect(voiceToolDescriptor("ambient_voice_refresh_voices")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "voice-catalog-refresh",
      supportsDryRun: false,
    });
    expect(voiceToolDescriptor("ambient_voice_refresh_voices").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_voice_status first"),
        expect.stringContaining("cacheStatus none or stale"),
        expect.stringContaining("cloud/API providers"),
        expect.stringContaining("Do not call provider CLIs"),
        expect.stringContaining("call ambient_voice_list_voices"),
      ]),
    );
    expect(voiceToolDescriptor("ambient_voice_policy_update")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "voice-settings-write",
      supportsDryRun: false,
    });
    expect(voiceToolDescriptor("ambient_voice_policy_update").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_voice_status first"),
        expect.stringContaining("enable voice, disable voice"),
        expect.stringContaining("Mode values are off"),
        expect.stringContaining("Long-reply values are summarize"),
        expect.stringContaining("Do not install, repair, register, run ambient_cli"),
      ]),
    );
    expect(voiceToolDescriptor("ambient_voice_test")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "voice-provider-test",
      supportsDryRun: false,
    });
    expect(voiceToolDescriptor("ambient_voice_test").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_voice_status first"),
        expect.stringContaining("switch and verify"),
        expect.stringContaining("Do not use ambient_cli"),
        expect.stringContaining("requires approval"),
      ]),
    );
  });

  it("keeps STT settings controls small and Pi-directed", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of sttToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    expect(sttToolDescriptor("ambient_stt_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "stt-settings-read",
      supportsDryRun: true,
    });
    expect(sttToolDescriptor("ambient_stt_status").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_stt_status before changing"),
        expect.stringContaining("exact providerCapabilityId"),
        expect.stringContaining("do not pass raw audio"),
        expect.stringContaining("Do not run provider CLIs"),
      ]),
    );
    expect(sttToolDescriptor("ambient_stt_select")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "stt-settings-write",
      supportsDryRun: false,
    });
    expect(sttToolDescriptor("ambient_stt_select").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_stt_status first"),
        expect.stringContaining("choose Qwen3-ASR"),
        expect.stringContaining("Use ambient_stt_policy_update"),
        expect.stringContaining("Do not install, repair, register, run ambient_cli"),
      ]),
    );
    expect(sttToolDescriptor("ambient_stt_policy_update")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "stt-settings-write",
      supportsDryRun: false,
    });
    expect(sttToolDescriptor("ambient_stt_policy_update").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_stt_status first"),
        expect.stringContaining("silence-before-transcribe"),
        expect.stringContaining("queueWhileAgentRuns true"),
        expect.stringContaining("do not steer active agent requests"),
      ]),
    );
    expect(sttToolDescriptor("ambient_stt_test")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "stt-provider-test",
      supportsDryRun: false,
    });
    expect(sttToolDescriptor("ambient_stt_test").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call ambient_stt_status first"),
        expect.stringContaining("workspace-relative WAV"),
        expect.stringContaining("latest Settings microphone validation"),
        expect.stringContaining("requires approval"),
      ]),
    );
  });

  it("exposes first-party MiniCPM-V visual setup and analysis tools", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    expect(visionToolDescriptors.map((descriptor) => descriptor.name)).toEqual([
      "ambient_visual_minicpm_setup",
      "ambient_visual_analyze",
    ]);
    for (const descriptor of visionToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
      expect(descriptor.runtimeSupport).toEqual(["chat", "workflow"]);
    }
    expect(visionToolDescriptor("ambient_visual_minicpm_setup")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "visual-provider-setup",
      supportsDryRun: false,
    });
    expect(visionToolDescriptor("ambient_visual_minicpm_setup").promptGuidelines.join("\n")).toContain("allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, ui copy");
    expect(visionToolDescriptor("ambient_visual_minicpm_setup").promptGuidelines.join("\n")).toContain("runtimeContract");
    expect(visionToolDescriptor("ambient_visual_minicpm_setup").promptGuidelines.join("\n")).toContain("default managed runtime download");
    expect(visionToolDescriptor("ambient_visual_minicpm_setup").promptGuidelines.join("\n")).toContain("Windows remains disabled");
    expect(visionToolDescriptor("ambient_visual_analyze")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "visual-analysis",
      supportsDryRun: false,
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          image: expect.objectContaining({ required: ["path"] }),
          video: expect.objectContaining({ required: ["path"] }),
          videoPath: expect.objectContaining({ type: "string" }),
          frameTimestampMs: expect.objectContaining({ type: "number" }),
          referenceImage: expect.objectContaining({ required: ["path"] }),
          referenceImagePath: expect.objectContaining({ type: "string" }),
          allowExternalMediaPaths: expect.objectContaining({ type: "boolean" }),
        }),
      }),
    });
    expect(visionToolDescriptor("ambient_visual_analyze").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("browser_screenshot"),
        expect.stringContaining("video.path or videoPath"),
        expect.stringContaining("reference/current visual comparisons"),
        expect.stringContaining("allowExternalMediaPaths=true only when the user explicitly approved"),
        expect.stringContaining("Do not call ambient_cli_search"),
        expect.stringContaining("Do not add ambient_visual_minicpm_setup nodes"),
        expect.stringContaining("Do not create workflow nodes for MiniCPM-V status"),
      ]),
    );
    expect(visionToolDescriptor("ambient_visual_analyze").workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "visual-analysis-required",
          text: expect.stringContaining("collect actual visual evidence with ambient_visual_analyze"),
        }),
        expect.objectContaining({
          id: "visual-analysis-required",
          text: expect.stringContaining("Do not create ambient_cli nodes for minicpm_vision_status"),
        }),
        expect.objectContaining({
          id: "visual-loop-map-tool-call-shape",
          text: expect.stringContaining('{"fromHandle":"listImages.entries"}'),
        }),
        expect.objectContaining({
          id: "visual-model-role",
          text: expect.stringContaining("selected Ambient Desktop model"),
        }),
      ]),
    );
  });

  it("exposes first-party Local Deep Research setup readiness", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    expect(localDeepResearchToolDescriptors.map((descriptor) => descriptor.name)).toEqual([
      "ambient_local_deep_research_provider_status",
      "ambient_local_deep_research_provider_search",
      "ambient_local_deep_research_provider_describe",
      "ambient_local_deep_research_provider_update",
      "ambient_local_deep_research_setup",
      "ambient_local_deep_research_run",
    ]);
    for (const descriptor of localDeepResearchToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    for (const descriptor of localDeepResearchToolDescriptors.filter((descriptor) => descriptor.name.includes("_provider_"))) {
      expect(descriptor.runtimeSupport).toEqual(["chat"]);
    }
    for (const descriptor of localDeepResearchToolDescriptors.filter((descriptor) => !descriptor.name.includes("_provider_"))) {
      expect(descriptor.runtimeSupport).toEqual(["chat", "workflow"]);
    }
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "local-deep-research-setup",
      supportsDryRun: false,
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          action: expect.objectContaining({ enum: ["status", "install", "repair", "validate", "smoke"] }),
          q8Override: expect.objectContaining({ type: "boolean" }),
        }),
      }),
    });
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup").promptGuidelines.join("\n")).toContain("first read installerShape");
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup").promptGuidelines.join("\n")).toContain("requires user approval in workspace mode");
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup").promptGuidelines.join("\n")).toContain("downloads the selected LiteResearcher GGUF");
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup").promptGuidelines.join("\n")).toContain("writes JSON validation evidence");
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_setup").promptGuidelines.join("\n")).toContain("writes JSON/Markdown smoke evidence");
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_run")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "local-deep-research-run",
      supportsDryRun: false,
      inputSchema: expect.objectContaining({
        required: ["question"],
      }),
    });
    expect(localDeepResearchToolDescriptor("ambient_local_deep_research_run").promptGuidelines.join("\n")).toContain("refreshes the setup/provider snapshot at run start");
  });

  it("exposes local model runtime status, start, stop, and restart descriptors", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    expect(localRuntimeToolDescriptors.map((descriptor) => descriptor.name)).toEqual([
      "ambient_local_model_runtime_status",
      "ambient_local_model_runtime_start",
      "ambient_local_model_runtime_stop",
      "ambient_local_model_runtime_restart",
    ]);
    for (const descriptor of localRuntimeToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
      expect(descriptor.runtimeSupport).toEqual(["chat", "workflow"]);
    }
    expect(localRuntimeToolDescriptor("ambient_local_model_runtime_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "local-model-runtime-status",
      supportsDryRun: true,
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          includeStopped: expect.objectContaining({ type: "boolean" }),
          limit: expect.objectContaining({ type: "number" }),
        }),
      }),
    });
    const guidance = localRuntimeToolDescriptor("ambient_local_model_runtime_status").promptGuidelines.join("\n");
    expect(guidance).toContain("read-only");
    expect(guidance).toContain("active sub-agent leases");
    expect(guidance).toContain("untracked process");

    expect(localRuntimeToolDescriptor("ambient_local_model_runtime_start")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "local-model-runtime-start",
      supportsDryRun: true,
      inputSchema: expect.objectContaining({
        required: ["runtimeId"],
        properties: expect.objectContaining({
          runtimeId: expect.objectContaining({ type: "string" }),
          dryRun: expect.objectContaining({ type: "boolean" }),
        }),
      }),
    });
    const startGuidance = localRuntimeToolDescriptor("ambient_local_model_runtime_start").promptGuidelines.join("\n");
    expect(startGuidance).toContain("includeStopped=true");
    expect(startGuidance).toContain("active sub-agent leases");
    expect(startGuidance).toContain("dryRun=true");
    expect(startGuidance).toContain("memoryPolicy");
    expect(startGuidance).toContain("untracked processes");
    expect(startGuidance).toContain("providerLifecycle.start");

    expect(localRuntimeToolDescriptor("ambient_local_model_runtime_stop")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "local-model-runtime-stop",
      supportsDryRun: true,
      inputSchema: expect.objectContaining({
        required: ["runtimeId"],
        properties: expect.objectContaining({
          runtimeId: expect.objectContaining({ type: "string" }),
          force: expect.objectContaining({ type: "boolean" }),
          dryRun: expect.objectContaining({ type: "boolean" }),
        }),
      }),
    });
    const stopGuidance = localRuntimeToolDescriptor("ambient_local_model_runtime_stop").promptGuidelines.join("\n");
    expect(stopGuidance).toContain("active sub-agent leases");
    expect(stopGuidance).toContain("dryRun=true");
    expect(stopGuidance).toContain("memoryPolicy");
    expect(stopGuidance).toContain("untracked processes");
    expect(stopGuidance).toContain("providerLifecycle.stop");

    expect(localRuntimeToolDescriptor("ambient_local_model_runtime_restart")).toMatchObject({
      sideEffects: "run-process",
      permissionScope: "local-model-runtime-restart",
      supportsDryRun: true,
      inputSchema: expect.objectContaining({
        required: ["runtimeId"],
        properties: expect.objectContaining({
          runtimeId: expect.objectContaining({ type: "string" }),
          force: expect.objectContaining({ type: "boolean" }),
          dryRun: expect.objectContaining({ type: "boolean" }),
        }),
      }),
    });
    const restartGuidance = localRuntimeToolDescriptor("ambient_local_model_runtime_restart").promptGuidelines.join("\n");
    expect(restartGuidance).toContain("active sub-agent leases");
    expect(restartGuidance).toContain("dryRun=true");
    expect(restartGuidance).toContain("memoryPolicy");
    expect(restartGuidance).toContain("untracked processes");
    expect(restartGuidance).toContain("providerLifecycle.restart");
  });

  it("keeps search preference controls small and Pi-directed", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of searchPreferenceToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    expect(searchPreferenceToolDescriptor("ambient_search_preference_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "search-routing",
      supportsDryRun: true,
    });
    expect(searchPreferenceToolDescriptor("ambient_search_preference_update")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "search-routing",
      supportsUndo: true,
    });
    expect(piToolFieldsFromDescriptor(searchPreferenceToolDescriptor("ambient_search_preference_update")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Prefer web_research_preferences_update"),
        expect.stringContaining("providerOrder"),
      ]),
    );
  });

  it("keeps first-class web research broker tools registered", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of webResearchToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    expect(webResearchToolDescriptor("web_research_status")).toMatchObject({
      sideEffects: "none",
      permissionScope: "web-research-routing",
      runtimeSupport: ["chat"],
    });
    expect(webResearchToolDescriptor("web_research_preferences_update")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "web-research-routing",
      runtimeSupport: ["chat"],
    });
    expect(webResearchToolDescriptor("web_research_provider_search")).toMatchObject({
      sideEffects: "none",
      permissionScope: "web-research-routing",
      runtimeSupport: ["chat"],
    });
    expect(webResearchToolDescriptor("web_research_provider_describe")).toMatchObject({
      sideEffects: "none",
      permissionScope: "web-research-routing",
      runtimeSupport: ["chat"],
    });
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_status")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("active-stack-only"),
        expect.stringContaining("web_research_provider_search"),
        expect.stringContaining("web_research_provider_describe"),
      ]),
    );
    expect(webResearchToolDescriptor("web_research_preferences_update").inputSchema).toMatchObject({
      minProperties: 1,
      properties: {
        action: {
          enum: ["reset_search_defaults", "prefer_provider", "require_provider"],
        },
      },
    });
    expect(webResearchToolDescriptor("web_research_search")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "web-research-network",
      runtimeSupport: ["chat", "workflow"],
    });
    expect(webResearchToolDescriptor("web_research_fetch")).toMatchObject({
      sideEffects: "read-external",
      permissionScope: "web-research-network",
      runtimeSupport: ["chat", "workflow"],
    });
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_search")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Exa first"),
        expect.stringContaining("fallback ledger"),
        expect.stringContaining("does not mutate global Search & Web settings"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_fetch")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Scrapling first"),
        expect.stringContaining("Browser fallback"),
        expect.stringContaining("does not mutate global Search & Web settings"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_provider_search")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Ambient provider catalog cards"),
        expect.stringContaining("absence from web_research_status does not mean the provider is unknown"),
        expect.stringContaining("Do not search ToolHive or MCP registries"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_provider_describe")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Report enabled/installed status separately from known-addable status"),
        expect.stringContaining("ambient_tool_call, then run ambient_capability_builder_plan"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(webResearchToolDescriptor("web_research_preferences_update")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Call web_research_status first"),
        expect.stringContaining("action=reset_search_defaults"),
        expect.stringContaining("action=prefer_provider"),
        expect.stringContaining("global web_research_search"),
        expect.stringContaining("one-turn provider requests"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(browserToolDescriptor("browser_search")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("prefer web_research_search"),
        expect.stringContaining("Use browser_search directly when the user explicitly asks for browser search"),
      ]),
    );
    expect(piToolFieldsFromDescriptor(browserToolDescriptor("browser_content")).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("prefer web_research_fetch"),
        expect.stringContaining("authenticated pages"),
      ]),
    );
  });

  it("keeps provider catalog read-only and Planner-safe", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of providerCatalogToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
    }
    const descriptor = providerCatalogToolDescriptor("ambient_provider_catalog");
    expect(descriptor).toMatchObject({
      sideEffects: "none",
      permissionScope: "provider-catalog-read",
      supportsDryRun: true,
      supportsUndo: false,
    });
    expect((descriptor.inputSchema as { properties?: Record<string, { enum?: string[] }> }).properties?.capabilityArea.enum).toContain("deep-research");
    expect((descriptor.inputSchema as { properties?: Record<string, { enum?: string[] }> }).properties?.installerShape.enum).toContain("network-integration");
    expect(piToolFieldsFromDescriptor(descriptor).promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("read-only catalog of potential known providers"),
        expect.stringContaining("ambient_capability_builder_plan"),
        expect.stringContaining("allowed in Planner Mode"),
      ]),
    );
  });

  it("describes workspace file tools with read and write side-effect metadata", () => {
    expect(fileToolDescriptors.map((descriptor) => descriptor.name)).toEqual(["file_read", "local_directory_list", "local_file_read", "file_write"]);
    expect(fileToolDescriptors[0]).toMatchObject({
      sideEffects: "none",
      permissionScope: "workspace-file-read",
      supportsDryRun: false,
    });
    expect(fileToolDescriptors[0].promptSnippet).toContain(".docx/.pptx/.xlsx");
    expect(fileToolDescriptors[0].promptGuidelines).toEqual(expect.arrayContaining([expect.stringContaining("extracted plain text")]));
    expect(fileToolDescriptors[1].promptGuidelines).toEqual(expect.arrayContaining([expect.stringContaining("skipped metadata")]));
    expect(fileToolDescriptors[1].workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-directory-skipped-metadata",
          validatorRefs: expect.arrayContaining(["audit.local_directory_skipped_metadata_required"]),
          text: expect.stringContaining('{"fromHandle":"listNode.totalKnownEntries"}'),
        }),
      ]),
    );
    expect(fileToolDescriptors[3]).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "workspace-file-write",
      supportsDryRun: false,
      idempotency: "recommended",
    });
  });

  it("describes long_context_process as a read-only workflow-capable RLM tool", () => {
    const descriptor = firstPartyDesktopToolDescriptors().find((tool) => tool.name === "long_context_process");
    expect(descriptor).toMatchObject({
      sideEffects: "none",
      permissionScope: "long-context",
      supportsDryRun: false,
      runtimeSupport: ["chat", "workflow"],
    });
    expect(descriptor?.promptGuidelines).toEqual(expect.arrayContaining([expect.stringContaining("before model.call")]));
    expect(descriptor?.workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "long-context-preprocess",
          validatorRefs: expect.arrayContaining(["validateWorkflowProgramStatic"]),
        }),
      ]),
    );
  });

  it("describes media download as a validated workspace artifact tool", () => {
    expect(mediaToolDescriptors.map((descriptor) => descriptor.name)).toEqual(["media_download"]);
    expect((mediaToolDescriptors[0].inputSchema as { required: string[] }).required).toEqual(["url", "outputPath"]);
    expect(mediaToolDescriptors[0].promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("rejects HTML redirects"),
        expect.stringContaining("source/license metadata"),
      ]),
    );
  });

  it("guides image acquisition through source extraction and validated download", () => {
    expect(browserToolDescriptor("browser_search").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("source pages with license/source context"),
        expect.stringContaining("media_download for validation and inline rendering"),
      ]),
    );
    expect(browserToolDescriptor("browser_content").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Ambient may route browser_content URL reads for public HTTPS pages through Scrapling automatically"),
        expect.stringContaining("page title, source/license text"),
        expect.stringContaining("likely file/download links"),
      ]),
    );
    expect(mediaToolDescriptor("media_download").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Do not assume a web page URL is a direct image file URL"),
        expect.stringContaining("Wikimedia Commons"),
        expect.stringContaining("Unsplash-like pages"),
        expect.stringContaining("Stop after the first media_download result"),
      ]),
    );
  });

  it("describes bash as a process-running tool without changing the bash implementation", () => {
    expect(bashToolDescriptor).toMatchObject({
      name: "bash",
      source: "pi-builtin",
      sideEffects: "run-process",
      permissionScope: "shell",
      supportsDryRun: false,
    });
  });

  it("guides task scratch artifacts into the active workspace", () => {
    expect(bashToolDescriptor.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/keep them inside the active workspace.*do not use \/tmp for user-task artifacts/),
      ]),
    );
  });

  it("exposes Google Workspace setup as chat-only product actions", () => {
    expect(googleWorkspaceSetupToolDescriptors.map((descriptor) => descriptor.name)).toEqual([
      "google_workspace_status",
      "google_workspace_install_gws",
      "google_workspace_start_login",
      "google_workspace_import_oauth_client",
      "google_workspace_validate_account",
      "google_workspace_cancel_setup",
      "google_workspace_search_methods",
      "google_workspace_call",
      "google_workspace_materialize_file",
    ]);
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_start_login")).toMatchObject({
      sideEffects: "control-browser",
      permissionScope: "google-workspace-setup",
      runtimeSupport: ["chat", "ui"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_start_login").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requiredAction=oauth_client_config"),
        expect.stringContaining("google_workspace_import_oauth_client"),
        expect.stringContaining("Do not use bash"),
      ]),
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_import_oauth_client")).toMatchObject({
      sideEffects: "write-external",
      permissionScope: "google-workspace-setup",
      idempotency: "recommended",
      runtimeSupport: ["chat"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_import_oauth_client").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requiredAction=oauth_client_config"),
        expect.stringContaining("Do not read, print, paste"),
        expect.stringContaining("Do not copy OAuth client JSON into ~/.config/gws"),
        expect.stringContaining("google_workspace_start_login"),
      ]),
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_status")).toMatchObject({
      sideEffects: "none",
      supportsDryRun: true,
      runtimeSupport: ["chat", "ui"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_search_methods")).toMatchObject({
      sideEffects: "none",
      permissionScope: "google-workspace-method-catalog",
      runtimeSupport: ["chat"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_call")).toMatchObject({
      sideEffects: "plugin-defined",
      permissionScope: "google-workspace-method-call",
      idempotency: "recommended",
      runtimeSupport: ["chat"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_call").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("multiple accounts"),
        expect.stringContaining("accountHint"),
        expect.stringContaining("drive.files.export"),
        expect.stringContaining("workspace-relative"),
        expect.stringContaining("gmailDraft"),
        expect.stringContaining("compact visible previews"),
        expect.stringContaining("managed file handle"),
        expect.stringContaining("long_context_process"),
      ]),
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_call").workflowGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "google-workspace-read-only-method-policy",
          validatorRefs: expect.arrayContaining([
            "google.write_method_rejected",
            "google.account_hint_required",
            "google.calendar_time_range_required",
            "google.read_only_payload_rejected",
          ]),
          text: expect.stringContaining("Calendar list/freebusy calls must include timeMin, timeMax, and timeZone"),
        }),
      ]),
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_search_methods").workflowGuidance).toBe(
      googleWorkspaceSetupToolDescriptor("google_workspace_call").workflowGuidance,
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_materialize_file").workflowGuidance).toBe(
      googleWorkspaceSetupToolDescriptor("google_workspace_call").workflowGuidance,
    );
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_materialize_file")).toMatchObject({
      sideEffects: "write-workspace",
      permissionScope: "google-workspace-file-materialize",
      idempotency: "recommended",
      runtimeSupport: ["chat", "workflow"],
    });
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_materialize_file").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Do not use this to import local OAuth client JSON"),
        expect.stringContaining("google_workspace_import_oauth_client"),
      ]),
    );
  });
});

describe("pluginMcpToolDescriptor", () => {
  it("converts plugin MCP registrations into workflow-visible descriptors", () => {
    const descriptor = pluginMcpToolDescriptor({
      registeredName: "fixture_tool",
      label: "Fixture: tool",
      description: "Runs a fixture plugin tool.",
      promptSnippet: "fixture_tool: Run fixture.",
      promptGuidelines: ["Use fixture_tool for fixture tests."],
      parameters: {
        type: "object",
        properties: { includeFiles: { type: "boolean" } },
        additionalProperties: false,
      },
    });

    expect(descriptor).toMatchObject({
      name: "fixture_tool",
      source: "plugin-mcp",
      sideEffects: "plugin-defined",
      permissionScope: "plugin-mcp",
      supportsDryRun: false,
      supportsUndo: false,
      defaultTimeoutMs: 8_000,
    });
    expect(piToolFieldsFromDescriptor(descriptor).parameters).toBe(descriptor.inputSchema);
  });
});
