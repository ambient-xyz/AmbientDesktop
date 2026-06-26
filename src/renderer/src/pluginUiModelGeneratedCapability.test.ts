import { describe, expect, it } from "vitest";
import type { CapabilityBuilderHistoryEntry } from "../../shared/pluginTypes";
import {
  buildCapabilityBuilderHistoryPreviewPrompt,
  buildCapabilityBuilderHistoryRepairPlanPrompt,
  buildCapabilityBuilderHistoryReregisterPrompt,
  buildGeneratedCapabilityRemovalPlanPrompt,
  buildGeneratedCapabilityUpdatePlanPrompt,
  buildGeneratedCapabilityValidationPrompt,
  capabilityBuilderHistoryPreviewActionState,
  capabilityBuilderHistoryRepairPlanActionState,
  capabilityBuilderHistoryReregisterActionState,
  capabilityBuilderHistorySourceActionState,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySourceActionState,
  generatedCapabilitySummaryFromHistoryEntry,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
} from "./pluginUiModel";

describe("plugin UI model generated capability actions", () => {
  it("models generated capability source action state", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: {},
    };

    expect(generatedCapabilitySourceActionState(generated)).toMatchObject({
      label: "Open source",
      disabled: false,
      visible: true,
      title: "Reveal generated capability source: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilitySourceActionState(generated, generated.sourcePath)).toMatchObject({
      label: "Opening",
      disabled: true,
      visible: true,
    });
    expect(generatedCapabilitySourceActionState(undefined)).toMatchObject({
      disabled: true,
      visible: false,
    });
  });

  it("models preserved generated capability history actions and prompts", () => {
    const entry: CapabilityBuilderHistoryEntry = {
      packageName: "piper-tts",
      rootPath: "/workspace/.ambient/capability-builder/packages/piper-tts",
      relativeRootPath: ".ambient/capability-builder/packages/piper-tts",
      gitSha: "def456",
      valid: true,
      status: "unregistered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      version: "0.1.0",
      installedPresent: false,
      lastValidatedAt: "2026-05-06T01:00:00.000Z",
      unregisteredAt: "2026-05-06T02:00:00.000Z",
      validationArtifacts: [],
      refs: { latest: "def456", lastRepair: "repair789", lastValidated: "def456", installed: null },
      commandNames: ["piper_tts"],
      envNames: [],
      artifactOutputTypes: ["WAV"],
      logFiles: [],
      possibleArtifactFiles: [],
      errors: [],
      warnings: [],
    };

    expect(generatedCapabilitySummaryFromHistoryEntry(entry)).toMatchObject({
      schemaVersion: "ambient-capability-builder-v1",
      status: "unregistered",
      goal: "Generate WAV voice files from text",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: ".ambient/capability-builder/packages/piper-tts",
      refs: { latest: "def456", lastRepair: "repair789", lastValidated: "def456" },
    });
    expect(capabilityBuilderHistorySourceActionState(entry)).toMatchObject({
      label: "Open source",
      disabled: false,
      visible: true,
    });
    expect(capabilityBuilderHistoryPreviewActionState(entry, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before previewing this generated source.",
    });
    expect(capabilityBuilderHistoryReregisterActionState(entry)).toMatchObject({
      label: "Re-register",
      disabled: false,
      visible: true,
    });
    expect(capabilityBuilderHistoryReregisterActionState({ ...entry, installedPresent: true })).toMatchObject({
      disabled: true,
      title: "This generated capability is already installed; use validation or update planning instead.",
    });
    expect(capabilityBuilderHistoryReregisterActionState({ ...entry, valid: false })).toMatchObject({
      disabled: true,
      title: "Repair or preview this generated source before re-registration; the current static preview has errors.",
    });
    expect(capabilityBuilderHistoryRepairPlanActionState(entry)).toMatchObject({
      visible: false,
      disabled: false,
    });
    expect(capabilityBuilderHistoryRepairPlanActionState({ ...entry, valid: false, errors: ["SKILL.md is missing."] })).toMatchObject({
      label: "Plan repair",
      disabled: false,
      visible: true,
      title: "Start a chat-first repair plan for generated source: .ambient/capability-builder/packages/piper-tts",
    });
    expect(buildCapabilityBuilderHistoryPreviewPrompt(entry)).toBe(
      [
        "Preview this preserved generated Ambient capability source.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Declared commands: piper_tts",
        "Output artifact types: WAV",
        "Unregistered at: 2026-05-06T02:00:00.000Z",
        "Use the Capability Builder management flow.",
        "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
        "Summarize validity, errors, warnings, risks, declared commands, env, artifacts, and health checks.",
        "Do not install dependencies, validate, register, unregister, edit files, or change package state.",
      ].join("\n"),
    );
    expect(buildCapabilityBuilderHistoryReregisterPrompt(entry)).toBe(
      [
        "Re-register this preserved generated Ambient capability package after approval.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Last validated ref: def456",
        "Unregistered at: 2026-05-06T02:00:00.000Z",
        "Use the Capability Builder management flow.",
        "First call ambient_capability_builder_history for this package, then call ambient_capability_builder_preview for the builder source path.",
        "If the source is invalid or already installed, stop and report the issue.",
        "If the preview is valid, ask me to approve re-registration; after approval, call ambient_capability_builder_register for the same builder source path.",
        "Do not install dependencies, edit files, delete files, or use generic Ambient CLI install/uninstall tools.",
      ].join("\n"),
    );
    expect(buildCapabilityBuilderHistoryRepairPlanPrompt({ ...entry, valid: false, errors: ["SKILL.md is missing."] })).toBe(
      [
        "Plan a repair for this preserved generated Ambient capability source.",
        "Package: piper-tts",
        "Builder source path: .ambient/capability-builder/packages/piper-tts",
        "Current history status: unregistered",
        "Current static preview validity: invalid",
        "Original goal: Generate WAV voice files from text",
        "Provider/runtime: Piper",
        "Last repair ref: repair789",
        "Declared commands: piper_tts",
        "Output artifact types: WAV",
        "Current preview errors: SKILL.md is missing.",
        "Use the Capability Builder management flow.",
        "Call ambient_capability_builder_repair_plan for the builder source path. Do not call ambient_capability_builder_history or ambient_capability_builder_preview separately during this repair-planning turn.",
        "Present the returned repair plan before changing anything. The plan should include intended descriptor, SKILL.md, wrapper script, test, dependency, env, artifact, validation, and rollback steps as applicable.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "Do not edit files, install dependencies, validate, register, unregister, delete files, or use generic Ambient CLI install/uninstall tools until I approve a specific next step.",
        "Do not call ambient_capability_builder_register until a later approved validation succeeds for the repaired source.",
      ].join("\n"),
    );
  });

  it("adds pinned-environment guidance to advanced local voice repair prompts", () => {
    const entry: CapabilityBuilderHistoryEntry = {
      packageName: "ambient-mlx-audio-kokoro",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-mlx-audio-kokoro",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-mlx-audio-kokoro",
      valid: true,
      status: "draft",
      goal: "Create a local Kokoro voice provider through mlx-audio",
      kind: "tts-provider",
      provider: "mlx-audio",
      installedPresent: false,
      validationArtifacts: [],
      refs: { latest: "abc123" },
      commandNames: ["kokoro_tts"],
      envNames: [],
      artifactOutputTypes: ["WAV"],
      logFiles: ["capability-validation-log.jsonl"],
      possibleArtifactFiles: [],
      errors: [],
      warnings: ["validation failed with NumPy/Thinc ABI mismatch"],
    };

    const prompt = buildCapabilityBuilderHistoryRepairPlanPrompt(entry);

    expect(prompt).toContain("Advanced local TTS repair guidance:");
    expect(prompt).toContain("pinned-environment repair");
    expect(prompt).toContain("misaki plus transitive text-processing deps such as num2words and spaCy");
    expect(prompt).toContain("NumPy/Thinc ABI mismatches");
    expect(prompt).toContain("If the pinned plan is not viable");
  });

  it("models generated capability validation action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: { installed: "abc123", lastRepair: "repair789" },
    };

    expect(generatedCapabilityValidationActionState(generated)).toMatchObject({
      label: "Validate",
      disabled: false,
      visible: true,
      title: "Start an approval-gated Capability Builder validation for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityValidationActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Starting",
      disabled: true,
    });
    expect(generatedCapabilityValidationActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before starting capability validation.",
    });

    expect(buildGeneratedCapabilityValidationPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Validate this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Capability kind: artifact generator",
        "Provider/runtime: Piper",
        "Output artifact types: WAV",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Use the Capability Builder management flow.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "First call ambient_capability_builder_preview for the builder source path and summarize errors, warnings, risks, declared commands, env, artifacts, and health checks.",
        "If the preview is valid, ask me to approve validation; after approval, call ambient_capability_builder_validate for the same source path.",
        "Do not install dependencies, register, rebuild, uninstall, or change files unless I explicitly approve that as a separate step.",
        "After validation, report the validation status, log path, artifact paths, and current git ref.",
      ].join("\n"),
    );
  });

  it("models generated capability update planning action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      kind: "artifact generator",
      provider: "Piper",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      refs: { latest: "def456", lastRepair: "repair789", installed: "abc123", lastValidated: "abc123" },
    };

    expect(generatedCapabilityUpdatePlanActionState(generated)).toMatchObject({
      label: "Plan update",
      disabled: false,
      visible: true,
      title: "Start a Capability Builder update/rebuild plan for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityUpdatePlanActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Planning",
      disabled: true,
    });
    expect(generatedCapabilityUpdatePlanActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before planning a capability update.",
    });

    expect(buildGeneratedCapabilityUpdatePlanPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Plan an update or rebuild for this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Capability kind: artifact generator",
        "Provider/runtime: Piper",
        "Output artifact types: WAV",
        "Latest source ref: def456",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Last validated ref: abc123",
        "Use the Capability Builder management flow.",
        "TTS provider conversion guidance:",
        "- This generated package appears to produce TTS/audio artifacts but is not currently an Ambient chat voice provider.",
        "- If the user wants assistant voice output, read-aloud chat, or provider selection in Settings, do not validate, register, or re-register it as a one-off artifact generator.",
        "- Plan repair with requestedRepair exactly: Convert this TTS artifact generator into an Ambient tts-provider for chat voicing.",
        "- The repair should add installerShape tts-provider provenance, descriptor voiceProvider metadata, the normalized --text/--output/--format/--voice command contract, concise JSON stdout, and provider-contract validation before registration.",
        "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
        "First inspect the builder source path and current installed/generated provenance, then call ambient_capability_builder_update_plan for the builder source path.",
        "Do not call ambient_capability_builder_preview separately during update planning; ambient_capability_builder_update_plan already includes preview facts.",
        "Propose a concise update/rebuild plan before making any changes. Include intended file changes, dependency commands, env or permission changes, artifact behavior changes, validation plan, registration impact, version/ref handling, rollback point, and user approval checkpoints.",
        "Do not install dependencies, edit files, run validation, register, rebuild, uninstall, or change package state until I approve a specific next step.",
        "If no update is needed, say so and recommend validation instead of making changes.",
      ].join("\n"),
    );
  });

  it("models generated capability removal planning action state and prompt", () => {
    const generated = {
      schemaVersion: "ambient-capability-builder-v1" as const,
      status: "registered",
      goal: "Generate WAV voice files from text",
      outputArtifactTypes: ["WAV"],
      sourcePath: "./.ambient/capability-builder/packages/piper-tts",
      installedPackageId: "ambient-cli:generated:piper-tts",
      installedSource: "./.ambient/cli-packages/imported/piper-tts",
      refs: { installed: "abc123", lastRepair: "repair789" },
    };

    expect(generatedCapabilityRemovalPlanActionState(generated)).toMatchObject({
      label: "Plan removal",
      disabled: false,
      visible: true,
      title: "Start a safe uninstall/deactivation plan for: ./.ambient/capability-builder/packages/piper-tts",
    });
    expect(generatedCapabilityRemovalPlanActionState(generated, { busyPath: generated.sourcePath })).toMatchObject({
      label: "Planning",
      disabled: true,
    });
    expect(generatedCapabilityRemovalPlanActionState(generated, { running: true })).toMatchObject({
      disabled: true,
      title: "Wait for the current chat run to finish before planning capability removal.",
    });

    expect(buildGeneratedCapabilityRemovalPlanPrompt({ packageName: "piper-tts", generated })).toBe(
      [
        "Plan safe removal or deactivation for this generated Ambient capability package.",
        "Package: piper-tts",
        "Builder source path: ./.ambient/capability-builder/packages/piper-tts",
        "Installed package id: ambient-cli:generated:piper-tts",
        "Installed source: ./.ambient/cli-packages/imported/piper-tts",
        "Original goal: Generate WAV voice files from text",
        "Output artifact types: WAV",
        "Last repair ref: repair789",
        "Installed ref: abc123",
        "Use the Capability Builder management flow.",
        "Use Capability Builder tools only for package inspection. Do not use shell, browser, ambient_cli, direct filesystem, or package install tools during this planning step.",
        "First inspect the installed/generated provenance and builder source path, then call ambient_capability_builder_removal_plan.",
        "Do not call ambient_capability_builder_preview separately during removal planning; ambient_capability_builder_removal_plan already includes preview facts when builder source exists.",
        "Propose a concise removal plan before changing anything. Distinguish installed Ambient CLI package state, managed builder source, package Git history, validation logs, generated artifacts, env/secret metadata, and registry visibility.",
        "Recommend the least destructive default: unregister or disable the installed capability while preserving builder source, Git history, validation logs, and artifacts unless I explicitly approve deletion.",
        "If I approve least-destructive unregister/deactivation, call ambient_capability_builder_unregister; do not use generic Ambient CLI uninstall for generated capabilities.",
        "Do not delete files, unregister, disable, edit package state, remove secrets, or change registry/install metadata until I approve a specific next step.",
        "Include rollback steps for restoring the installed capability or re-registering from the preserved builder source.",
      ].join("\n"),
    );
  });
});
