import { describe, expect, it } from "vitest";
import { buildHeadlessRuntimeUxInventory, headlessRuntimeUxInventoryText } from "../../shared/headlessRuntimeInventory";

describe("messaging gateway registry headless runtime UX readiness", () => {
  it("summarizes headless runtime UX command readiness", () => {
    const result = buildHeadlessRuntimeUxInventory();

    expect(result.commandCount).toBeGreaterThan(8);
    expect(result.headlessReadyCount).toBeGreaterThan(0);
    expect(result.partialCount).toBeGreaterThan(0);
    expect(result.plannedCount).toBeGreaterThanOrEqual(0);
    expect(result.settingCount).toBeGreaterThan(20);
    expect(result.settingReadyCount).toBeGreaterThan(3);
    expect(result.settingPartialCount).toBeGreaterThan(10);
    expect(result.settingsCatalog.find((setting) => setting.key === "voice.output")).toMatchObject({
      sectionId: "voice",
      rowId: "voice.output",
      headlessStatus: "ready",
      headlessReadable: true,
      headlessWritable: true,
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set voice mode off", "set voice maxChars 1500"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "search.preference")).toMatchObject({
      sectionId: "search",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.provider")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "partial",
      headlessWritable: false,
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.input")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["enable speech input", "set speech language English"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.language")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set stt language Spanish"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.behavior")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set speech autoSend off"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "speech.advanced")).toMatchObject({
      sectionId: "speech",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set speech silence 0.8", "set speech rmsThreshold -55"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "media.generated")).toMatchObject({
      sectionId: "media-browser",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set generated media autoplay on", "set generated media autoplay off"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "model-mode.planner")).toMatchObject({
      sectionId: "model-mode",
      headlessStatus: "ready",
      headlessWritable: true,
      commandExamples: expect.arrayContaining(["set planner autoFinalize off", "set planner finalization automatic"]),
    });
    expect(result.settingsCatalog.find((setting) => setting.key === "diagnostics.export")).toMatchObject({
      sectionId: "diagnostics",
      headlessStatus: "planned",
    });
    expect(result.commands.find((command) => command.id === "project.list")).toMatchObject({
      category: "project",
      mode: "read",
      headlessStatus: "ready",
      plannerSafe: true,
      toolNames: ["ambient_runtime_surface_snapshot"],
    });
    expect(result.commands.find((command) => command.id === "project.create")).toMatchObject({
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["create project Field Notes"]),
    });
    expect(result.commands.find((command) => command.id === "project.switch")).toMatchObject({
      category: "project",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["switch project 1"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.create")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["create workflow Track the Remote Ambient Surface gateway status"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.exploration.run")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["run exploration", "run workflow exploration"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.compile.preview")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["compile from exploration", "compile workflow"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.review.approve")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["approve workflow preview", "approve artifact"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.review.reject")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["reject workflow preview", "reject artifact"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.run.cancel")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["cancel workflow", "stop workflow"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.retry")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["retry failed step", "retry failed event 1"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.resume")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["resume checkpoint"]),
    });
    expect(result.commands.find((command) => command.id === "workflow.recovery.skip")).toMatchObject({
      category: "workflow",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["skip failed item"]),
    });
    expect(result.commands.find((command) => command.id === "chat.create")).toMatchObject({
      category: "chat",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
      commandExamples: expect.arrayContaining(["create chat Remote triage"]),
    });
    expect(result.commands.find((command) => command.id === "settings.voice.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set voice mode off"]),
    });
    expect(result.commands.find((command) => command.id === "settings.search.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["clear search preference"]),
    });
    expect(result.commands.find((command) => command.id === "settings.speech.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set speech language English", "set speech silence 0.8"]),
    });
    expect(result.commands.find((command) => command.id === "settings.media.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set generated media autoplay on"]),
    });
    expect(result.commands.find((command) => command.id === "settings.thread.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set chat mode planner", "set chat thinking medium"]),
    });
    expect(result.commands.find((command) => command.id === "settings.planner.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      commandExamples: expect.arrayContaining(["set planner autoFinalize off"]),
    });
    expect(result.commands.find((command) => command.id === "approval.list")).toMatchObject({
      category: "approval",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_runtime_surface_snapshot"],
    });
    expect(result.commands.find((command) => command.id === "approval.respond")).toMatchObject({
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["approve request 1", "deny request 1"]),
    });
    expect(result.commands.find((command) => command.id === "approval.grants.revoke")).toMatchObject({
      category: "approval",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: false,
      toolNames: ["ambient_messaging_remote_surface_command_preview", "ambient_messaging_remote_surface_command_apply"],
      commandExamples: expect.arrayContaining(["revoke grant 1"]),
    });
    const remoteActivationCommand = result.commands.find((command) => command.id === "messaging.remote.activation.plan");
    expect(remoteActivationCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_telegram_owner_loop_activation_plan",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["set up remote control", "set up Telegram remote control"]),
    });
    expect(remoteActivationCommand?.commandExamples).toEqual(expect.arrayContaining(["set up Signal remote control"]));
    expect(remoteActivationCommand?.notes.join("\n")).toContain("including requests that explicitly name Telegram, Signal");
    expect(remoteActivationCommand?.notes.join("\n")).toContain("unsupported-provider repair/status prompt");
    const remoteProviderSupportCommand = result.commands.find((command) => command.id === "messaging.remote.provider-support.plan");
    expect(remoteProviderSupportCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_remote_surface_provider_support_plan",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["plan Signal remote control support"]),
    });
    expect(remoteProviderSupportCommand?.notes.join("\n")).toContain("adapter requirements");
    expect(remoteProviderSupportCommand?.notes.join("\n")).toContain("Signal Desktop");
    const telegramActivationCommand = result.commands.find((command) => command.id === "messaging.telegram.activation.plan");
    expect(telegramActivationCommand).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: [
        "ambient_messaging_remote_surface_activation_plan",
        "ambient_messaging_telegram_owner_loop_activation_plan",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["set up Telegram remote control"]),
    });
    expect(telegramActivationCommand?.notes.join("\n")).toContain("first even when the user explicitly names Telegram");
    expect(result.commands.find((command) => command.id === "messaging.polling.status")).toMatchObject({
      category: "messaging",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      plannerSafe: true,
      toolNames: ["ambient_messaging_telegram_bridge_polling_status", "ambient_messaging_gateway_status"],
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.once")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_poll_preview",
        "ambient_messaging_telegram_bridge_poll_apply",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["check Telegram once for my command"]),
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.start")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_polling_preview",
        "ambient_messaging_telegram_bridge_polling_apply",
        "ambient_messaging_telegram_bridge_polling_status",
        "ambient_messaging_gateway_status",
      ],
      commandExamples: expect.arrayContaining(["start Telegram owner polling"]),
    });
    expect(result.commands.find((command) => command.id === "messaging.polling.stop")).toMatchObject({
      category: "messaging",
      mode: "mutate",
      headlessStatus: "ready",
      requiresApproval: true,
      toolNames: [
        "ambient_messaging_telegram_bridge_polling_preview",
        "ambient_messaging_telegram_bridge_polling_apply",
        "ambient_messaging_telegram_bridge_polling_status",
      ],
      commandExamples: expect.arrayContaining(["stop Telegram owner polling"]),
    });
    expect(result.commands.find((command) => command.id === "settings.update")).toMatchObject({
      category: "settings",
      mode: "mutate",
      headlessStatus: "partial",
      requiresApproval: true,
      toolName: "ambient_messaging_remote_surface_command_preview",
    });
    expect(result.commands.find((command) => command.id === "runtime.status")).toMatchObject({
      category: "status",
      mode: "read",
      headlessStatus: "ready",
      requiresApproval: false,
      toolName: "ambient_messaging_gateway_status",
      toolNames: ["ambient_messaging_gateway_status", "ambient_runtime_surface_snapshot"],
    });
    expect(headlessRuntimeUxInventoryText(result)).toContain("Ambient headless runtime UX inventory");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.voice.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.speech.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.media.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.thread.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("settings.planner.update");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.exploration.run");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.compile.preview");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.review.approve");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.review.reject");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.run.cancel");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.retry");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.resume");
    expect(headlessRuntimeUxInventoryText(result)).toContain("workflow.recovery.skip");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.remote.activation.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_remote_surface_activation_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.remote.provider-support.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_remote_surface_provider_support_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.telegram.activation.plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_messaging_telegram_owner_loop_activation_plan");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set up remote control");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set up Telegram remote control");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.start");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.stop");
    expect(headlessRuntimeUxInventoryText(result)).toContain("messaging.polling.once");
    expect(headlessRuntimeUxInventoryText(result)).toContain(
      "ambient_messaging_telegram_bridge_polling_preview -> ambient_messaging_telegram_bridge_polling_apply",
    );
    expect(headlessRuntimeUxInventoryText(result)).toContain("start Telegram owner polling");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approval.respond");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approval.grants.revoke");
    expect(headlessRuntimeUxInventoryText(result)).toContain("Settings catalog:");
    expect(headlessRuntimeUxInventoryText(result)).toContain("voice.output: Voice output policy");
    expect(headlessRuntimeUxInventoryText(result)).toContain("speech.provider: Speech provider");
    expect(headlessRuntimeUxInventoryText(result)).toContain("speech.input: Speech input policy");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set speech language English");
    expect(headlessRuntimeUxInventoryText(result)).toContain("media.generated: Generated media playback");
    expect(headlessRuntimeUxInventoryText(result)).toContain("model-mode.mode: Agent/planner mode");
    expect(headlessRuntimeUxInventoryText(result)).toContain("model-mode.planner: Planner finalization");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set chat mode planner");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set planner autoFinalize off");
    expect(headlessRuntimeUxInventoryText(result)).toContain("run exploration");
    expect(headlessRuntimeUxInventoryText(result)).toContain("compile from exploration");
    expect(headlessRuntimeUxInventoryText(result)).toContain("retry failed step");
    expect(headlessRuntimeUxInventoryText(result)).toContain("resume checkpoint");
    expect(headlessRuntimeUxInventoryText(result)).toContain("skip failed item");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set generated media autoplay on");
    expect(headlessRuntimeUxInventoryText(result)).toContain("approve request 1");
    expect(headlessRuntimeUxInventoryText(result)).toContain("revoke grant 1");
    expect(headlessRuntimeUxInventoryText(result)).toContain(
      "Tool sequence: ambient_messaging_remote_surface_command_preview -> ambient_messaging_remote_surface_command_apply",
    );
    expect(headlessRuntimeUxInventoryText(result)).toContain("Examples: create project Field Notes");
    expect(headlessRuntimeUxInventoryText(result)).toContain("set voice mode off");
    expect(headlessRuntimeUxInventoryText(result)).toContain("ambient_runtime_surface_snapshot");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_project_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_workflow_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_chat_create");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_settings_update");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_workflow_status");
    expect(headlessRuntimeUxInventoryText(result)).not.toContain("ambient_runtime_status");
  });
});
