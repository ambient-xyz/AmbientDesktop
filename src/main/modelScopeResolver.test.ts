import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import { resolveSubagentModelScope } from "./modelScopeResolver";

describe("modelScopeResolver", () => {
  it("uses explicit caller overrides without falling back", () => {
    const role = getDefaultSubagentRoleProfile("summarizer");
    const localProfile = configuredLocalProfile();

    expect(resolveSubagentModelScope({
      role,
      requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      parentModelId: "unknown-parent",
      resolveModelRuntimeProfile: (modelId) =>
        modelId === AMBIENT_LOCAL_TEXT_MODEL ? localProfile : resolveAmbientModelRuntimeProfile(modelId),
    })).toMatchObject({
      source: "caller_override",
      requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      selectedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      warnings: [],
      blockingReasons: [
        "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
      ],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "caller_override",
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
          selected: true,
          eligible: false,
          available: true,
          selectableAsSubagent: true,
          blockingReasons: [
            "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
          ],
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({ capability: "availability", status: "pass" }),
            expect.objectContaining({ capability: "subagent_eligibility", status: "pass" }),
            expect.objectContaining({ capability: "streaming", status: "pass" }),
            expect.objectContaining({
              capability: "context_window",
              status: "pass",
              actual: "16384 tokens",
            }),
            expect.objectContaining({
              capability: "output_budget",
              status: "pass",
              actual: "4096 tokens",
            }),
            expect.objectContaining({
              capability: "tool_use",
              status: "fail",
              required: "role default tool scope requires model tool use: long-context.read",
              actual: "toolUse=none",
            }),
            expect.objectContaining({
              capability: "structured_output",
              status: "pass",
              actual: "ambient_validated_text",
            }),
          ]),
        }),
      ],
      profile: {
        profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      },
    });
  });

  it("uses an eligible parent model when no explicit override is provided", () => {
    const role = getDefaultSubagentRoleProfile("explorer");

    expect(resolveSubagentModelScope({
      role,
      parentModelId: AMBIENT_DEFAULT_MODEL,
    })).toMatchObject({
      source: "parent_fallback",
      parentModelId: AMBIENT_DEFAULT_MODEL,
      selectedModelId: AMBIENT_DEFAULT_MODEL,
      blockingReasons: [],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "parent_fallback",
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({
              capability: "context_window",
              status: "pass",
              actual: "200000 tokens",
            }),
            expect.objectContaining({
              capability: "output_budget",
              status: "pass",
              actual: "32000 tokens",
            }),
            expect.objectContaining({
              capability: "tool_use",
              status: "pass",
              actual: "toolUse=ambient-tools",
            }),
            expect.objectContaining({
              capability: "structured_output",
              status: "pass",
              actual: "model_native:schema",
            }),
          ]),
        }),
      ],
    });
  });

  it("allows explicit no-tool local overrides when the requested tool scope is tool-free", () => {
    const role = getDefaultSubagentRoleProfile("summarizer");
    const localProfile = configuredLocalProfile();

    expect(resolveSubagentModelScope({
      role,
      requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      requestedToolScope: { requestedCategories: ["artifact.read"] },
      resolveModelRuntimeProfile: (modelId) =>
        modelId === AMBIENT_LOCAL_TEXT_MODEL ? localProfile : resolveAmbientModelRuntimeProfile(modelId),
    })).toMatchObject({
      source: "caller_override",
      selectedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      blockingReasons: [],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "caller_override",
          selected: true,
          eligible: true,
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({
              capability: "tool_use",
              status: "pass",
              required: "requested tool scope exposes no categories that require model tool use",
              actual: "not_required",
            }),
          ]),
        }),
      ],
    });
  });

  it("falls back when the parent model is sub-agent selectable but lacks required tool use", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const noToolParent = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      profileId: "custom:no-tool-parent",
      modelId: "custom/no-tool-parent",
      label: "No-tool parent",
      toolUse: "none",
    } satisfies AmbientModelRuntimeProfile;

    expect(resolveSubagentModelScope({
      role,
      parentModelId: "custom/no-tool-parent",
      resolveModelRuntimeProfile: (modelId) =>
        modelId === "custom/no-tool-parent" ? noToolParent : resolveAmbientModelRuntimeProfile(modelId),
    })).toMatchObject({
      source: "role_default",
      parentModelId: "custom/no-tool-parent",
      selectedModelId: role.defaultModelId,
      blockingReasons: [],
      warnings: [
        "Parent model custom/no-tool-parent is not eligible for sub-agent runs: Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
      ],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "parent_fallback",
          modelId: "custom/no-tool-parent",
          selected: false,
          eligible: false,
          blockingReasons: [
            "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
          ],
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({
              capability: "tool_use",
              status: "fail",
              actual: "toolUse=none",
            }),
          ]),
        }),
        expect.objectContaining({
          source: "role_default",
          selected: true,
          eligible: true,
        }),
      ],
    });
  });

  it("falls back to the role default when the parent model is not sub-agent eligible", () => {
    const role = getDefaultSubagentRoleProfile("explorer");

    expect(resolveSubagentModelScope({
      role,
      parentModelId: "custom/unregistered-model",
    })).toMatchObject({
      source: "role_default",
      parentModelId: "custom/unregistered-model",
      selectedModelId: role.defaultModelId,
      blockingReasons: [],
      warnings: [expect.stringContaining("not eligible")],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "parent_fallback",
          modelId: "custom/unregistered-model",
          selected: false,
          eligible: false,
          profileId: "unknown:custom/unregistered-model",
          providerId: "unknown",
          unavailableReason: "Model is not registered in this Ambient Desktop build.",
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({ capability: "availability", status: "fail" }),
            expect.objectContaining({ capability: "subagent_eligibility", status: "fail" }),
            expect.objectContaining({ capability: "streaming", status: "fail" }),
            expect.objectContaining({
              capability: "context_window",
              status: "fail",
              actual: "unknown",
            }),
            expect.objectContaining({
              capability: "output_budget",
              status: "fail",
              actual: "unknown",
            }),
            expect.objectContaining({
              capability: "tool_use",
              status: "fail",
              actual: "toolUse=none",
            }),
            expect.objectContaining({
              capability: "structured_output",
              status: "pass",
              actual: "ambient_validated_text",
            }),
          ]),
        }),
        expect.objectContaining({
          source: "role_default",
          modelId: role.defaultModelId,
          selected: true,
          eligible: true,
        }),
      ],
    });
  });

  it("preserves explicit unknown model overrides as blocking caller choices", () => {
    const role = getDefaultSubagentRoleProfile("explorer");

    expect(resolveSubagentModelScope({
      role,
      requestedModelId: "custom/unregistered-model",
    })).toMatchObject({
      source: "caller_override",
      requestedModelId: "custom/unregistered-model",
      selectedModelId: "custom/unregistered-model",
      blockingReasons: [
        "Model is not registered in this Ambient Desktop build.",
        "Model custom/unregistered-model is not selectable for sub-agent delegation.",
        "Model custom/unregistered-model does not support required sub-agent streaming.",
        "Model profile does not declare a context window; runtime preflight must prove the child prompt fits before launch.",
        "Model profile does not declare a maximum output budget; runtime preflight must reserve a safe child output allowance.",
        "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
      ],
      candidateDiagnostics: [
        expect.objectContaining({
          source: "caller_override",
          modelId: "custom/unregistered-model",
          profileId: "unknown:custom/unregistered-model",
          providerId: "unknown",
          selected: true,
          eligible: false,
          available: false,
          selectableAsSubagent: false,
          supportsStreaming: false,
          blockingReasons: [
            "Model is not registered in this Ambient Desktop build.",
            "Model custom/unregistered-model is not selectable for sub-agent delegation.",
            "Model custom/unregistered-model does not support required sub-agent streaming.",
            "Model profile does not declare a context window; runtime preflight must prove the child prompt fits before launch.",
            "Model profile does not declare a maximum output budget; runtime preflight must reserve a safe child output allowance.",
            "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
          ],
          capabilityDiagnostics: expect.arrayContaining([
            expect.objectContaining({
              capability: "availability",
              status: "fail",
              required: "registered and available runtime profile",
              actual: "unavailable",
              reason: "Model is not registered in this Ambient Desktop build.",
            }),
            expect.objectContaining({
              capability: "subagent_eligibility",
              status: "fail",
              actual: "selectableAsSubagent=false",
            }),
            expect.objectContaining({
              capability: "streaming",
              status: "fail",
              actual: "supportsStreaming=false",
            }),
            expect.objectContaining({
              capability: "context_window",
              status: "fail",
              required: "registered positive contextWindowTokens",
              actual: "unknown",
            }),
            expect.objectContaining({
              capability: "output_budget",
              status: "fail",
              required: "registered positive maxOutputTokens",
              actual: "unknown",
            }),
            expect.objectContaining({
              capability: "tool_use",
              status: "fail",
              required: "role default tool scope requires model tool use: workspace.read, browser.read, long-context.read",
              actual: "toolUse=none",
            }),
            expect.objectContaining({
              capability: "structured_output",
              status: "pass",
              required: "role requires a validated structured child result",
              actual: "ambient_validated_text",
            }),
          ]),
        }),
      ],
    });
  });
});

function configuredLocalProfile(): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
  };
}
