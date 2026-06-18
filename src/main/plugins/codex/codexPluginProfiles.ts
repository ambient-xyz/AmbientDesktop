import type { CodexPluginCompatibilityTier } from "../../../shared/pluginTypes";

export type CodexPluginKnownProfile = {
  tier?: CodexPluginCompatibilityTier;
  supportLabels: string[];
  notes: string[];
};

const browserUseId = ["browser", "use"].join("-");
const computerUseId = ["computer", "use"].join("-");

export function knownCodexPluginProfile(name: string): CodexPluginKnownProfile | undefined {
  if (name === "github") {
    return {
      tier: "partial",
      supportLabels: ["GitHub skills", "PR/issue workflows", "Connector auth"],
      notes: [
        "GitHub skills can guide local repository, PR, issue, and CI workflows.",
        "GitHub connector account auth can use Ambient when a matching provider exists; GitHub connector actions still require an Ambient connector bridge.",
      ],
    };
  }
  if (name === "gmail") {
    return {
      tier: "partial",
      supportLabels: ["Gmail skills", "Inbox workflows", "Connector auth"],
      notes: [
        "Gmail skills can be imported as task guidance.",
        "Gmail mailbox account auth can use Ambient when a matching provider exists; Gmail connector actions still require an Ambient connector bridge.",
      ],
    };
  }
  if (name === "google-calendar") {
    return {
      tier: "partial",
      supportLabels: ["Calendar skills", "Scheduling workflows", "Connector auth"],
      notes: [
        "Google Calendar skills can guide agenda, availability, and meeting-prep workflows.",
        "Google Calendar account auth can use Ambient when a matching provider exists; calendar connector actions still require an Ambient connector bridge.",
      ],
    };
  }
  if (name === "google-drive") {
    return {
      tier: "partial",
      supportLabels: ["Drive skills", "Docs/Sheets/Slides workflows", "Connector auth"],
      notes: [
        "Google Drive skills can guide Drive, Docs, Sheets, and Slides workflows.",
        "Google Drive account auth can use Ambient when a matching provider exists; Drive connector actions still require an Ambient connector bridge.",
      ],
    };
  }
  if (name === "slack") {
    return {
      tier: "partial",
      supportLabels: ["Slack skills", "Team communication workflows", "Connector auth"],
      notes: [
        "Slack skills can guide channel summaries, notification triage, and reply drafting.",
        "Slack workspace auth can use Ambient when a matching provider exists; Slack connector actions still require an Ambient connector bridge.",
      ],
    };
  }
  if (name === "documents") {
    return {
      supportLabels: ["Document skills", "Local artifact workflow"],
      notes: ["Document skills can be imported; richer Office rendering remains tied to Ambient's artifact provider roadmap."],
    };
  }
  if (name === "spreadsheets") {
    return {
      supportLabels: ["Spreadsheet skills", "Local artifact workflow"],
      notes: ["Spreadsheet skills can be imported; richer workbook rendering remains tied to Ambient's artifact provider roadmap."],
    };
  }
  if (name === "presentations") {
    return {
      supportLabels: ["Presentation skills", "Local artifact workflow"],
      notes: ["Presentation skills can be imported; richer slide rendering remains tied to Ambient's artifact provider roadmap."],
    };
  }
  if (name === "latex-tectonic") {
    return {
      tier: "partial",
      supportLabels: ["LaTeX skills", "Bundled binary", "Execution policy required"],
      notes: [
        "LaTeX Tectonic skills can be imported as task guidance.",
        "The bundled Tectonic executable must remain gated on explicit binary execution and sandbox policy before Ambient runs it.",
      ],
    };
  }
  if (name === browserUseId) {
    return {
      tier: "partial",
      supportLabels: ["Ambient Browser adapter", "Browser skill bridge"],
      notes: [
        "Browser Use maps to the built-in Browser tools in Ambient Desktop.",
        "Codex browser client scripts are metadata only.",
      ],
    };
  }
  if (name === computerUseId) {
    return {
      tier: "partial",
      supportLabels: ["Native MCP helper", "High-trust desktop control", "macOS gated"],
      notes: [
        "Computer Use exposes a native MCP helper and must remain explicitly trusted before tool calls.",
        "Desktop control requires platform availability and OS-level permissions outside the normal workspace sandbox.",
      ],
    };
  }
  return undefined;
}
