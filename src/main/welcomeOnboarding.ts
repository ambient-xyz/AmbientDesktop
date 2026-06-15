import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ThreadSummary } from "../shared/types";
import {
  WELCOME_ONBOARDING_METADATA_KIND,
  isCurrentWelcomeOnboardingMetadata,
  welcomeOnboardingMessageMetadata,
  welcomeOnboardingPageKindFromMetadata,
  type WelcomeOnboardingPageKind,
} from "../shared/welcomeOnboarding";
import type { ProjectRegistry } from "./projectRegistry";
import { ProjectStore } from "./projectStore";

export const WELCOME_ONBOARDING_PROJECT_NAME = "Welcome Folder";
export const WELCOME_ONBOARDING_WORKSPACE_DIR = "welcome-folder";
export const WELCOME_ONBOARDING_ASSET_DIR = "welcome-assets/screenshots";

const WELCOME_SCREENSHOT_ASSETS = [
  "01-main-shell.png",
  "02-planner-mode.png",
  "03-calculator-board.png",
  "04-calculator-draft-inbox.png",
  "05-calculator-map.png",
  "06-git-summary.png",
  "07-plugin-manager.png",
  "08-settings-search.png",
] as const;

export interface WelcomeOnboardingResult {
  workspacePath: string;
  instructionsThread: ThreadSummary;
  coreSetupThread: ThreadSummary;
  pluginSetupThread: ThreadSummary;
  copiedAssets: string[];
}

interface WelcomeSeededPage {
  title: string;
  pageKind: WelcomeOnboardingPageKind;
  content: string;
}

export function welcomeOnboardingWorkspacePath(userDataPath: string): string {
  return resolve(userDataPath, WELCOME_ONBOARDING_WORKSPACE_DIR);
}

export function resolveWelcomeOnboardingAssetsPath(candidates: Array<string | undefined>): string | undefined {
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
}

export function ensureWelcomeOnboardingProject(input: {
  userDataPath: string;
  projectRegistry: ProjectRegistry;
  assetsSourcePath?: string;
}): WelcomeOnboardingResult {
  const workspacePath = welcomeOnboardingWorkspacePath(input.userDataPath);
  mkdirSync(workspacePath, { recursive: true });

  const welcomeStore = new ProjectStore();
  try {
    welcomeStore.openWorkspace(workspacePath);
    const copiedAssets = copyWelcomeOnboardingAssets(input.assetsSourcePath, workspacePath);
    migrateWelcomeOnboardingSeededThreads(welcomeStore);

    const pages: WelcomeSeededPage[] = [
      {
        title: "Instructions",
        pageKind: "instructions",
        content: instructionsChatMarkdown(),
      },
      {
        title: "Core Setup",
        pageKind: "core_setup",
        content: coreSetupChatMarkdown(),
      },
      {
        title: "Plugin Setup",
        pageKind: "plugin_setup",
        content: pluginSetupChatMarkdown(),
      },
    ];

    const seededThreads = new Map<WelcomeOnboardingPageKind, ThreadSummary>();
    for (const page of pages) {
      const thread = ensureSeededThread(welcomeStore, {
        ...page,
        workspacePath,
      });
      seededThreads.set(page.pageKind, thread);
    }

    welcomeStore.pruneRedundantEmptyThreads();
    const instructionsThread = seededThreads.get("instructions")!;
    const coreSetupThread = seededThreads.get("core_setup")!;
    const pluginSetupThread = seededThreads.get("plugin_setup")!;
    nudgeWelcomeOnboardingThreadOrder(welcomeStore, workspacePath, [pluginSetupThread, coreSetupThread, instructionsThread]);
    welcomeStore.setLastActiveThreadId(instructionsThread.id);

    input.projectRegistry.registerPinnedProject(workspacePath, {
      name: WELCOME_ONBOARDING_PROJECT_NAME,
      pinned: true,
    });

    return {
      workspacePath,
      instructionsThread: welcomeStore.getThread(instructionsThread.id),
      coreSetupThread: welcomeStore.getThread(coreSetupThread.id),
      pluginSetupThread: welcomeStore.getThread(pluginSetupThread.id),
      copiedAssets,
    };
  } finally {
    welcomeStore.close();
  }
}

function nudgeWelcomeOnboardingThreadOrder(store: ProjectStore, workspacePath: string, oldestToNewest: ThreadSummary[]): void {
  for (const thread of oldestToNewest) {
    sleepForThreadOrdering();
    store.updateThreadWorkspacePath(thread.id, workspacePath);
  }
}

function sleepForThreadOrdering(): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, 2);
}

function migrateWelcomeOnboardingSeededThreads(store: ProjectStore): void {
  for (const thread of store.listThreads()) {
    const firstMessage = store.listMessages(thread.id)[0];
    const metadata = firstMessage?.metadata;
    const pageKind = welcomeOnboardingPageKindFromMetadata(metadata);
    const legacyProductOwned =
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).kind === WELCOME_ONBOARDING_METADATA_KIND &&
      (thread.title === "Instructions" || thread.title === "Plugin Setup");
    if ((pageKind || legacyProductOwned) && !isCurrentWelcomeOnboardingMetadata(metadata)) {
      store.archiveThread(thread.id);
    }
  }
}

function ensureSeededThread(
  store: ProjectStore,
  input: {
    title: string;
    pageKind: WelcomeOnboardingPageKind;
    content: string;
    workspacePath: string;
  },
): ThreadSummary {
  const existing = store.listThreads().find((thread) => {
    const firstMessage = store.listMessages(thread.id)[0];
    return welcomeOnboardingPageKindFromMetadata(firstMessage?.metadata) === input.pageKind && isCurrentWelcomeOnboardingMetadata(firstMessage?.metadata);
  });
  const thread = existing ?? store.createThread(input.title, input.workspacePath);
  const messages = store.listMessages(thread.id);
  if (messages.length === 0) {
    store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: input.content,
      metadata: welcomeOnboardingMessageMetadata(input.pageKind),
    });
  } else {
    const seedMessage = messages.find(
      (message) =>
        welcomeOnboardingPageKindFromMetadata(message.metadata) === input.pageKind &&
        isCurrentWelcomeOnboardingMetadata(message.metadata),
    );
    if (seedMessage && (seedMessage.content !== input.content || !isCurrentWelcomeOnboardingMetadata(seedMessage.metadata))) {
      store.replaceMessage(seedMessage.id, input.content, welcomeOnboardingMessageMetadata(input.pageKind));
    }
  }
  if (thread.title !== input.title) store.updateThreadTitle(thread.id, input.title);
  store.setThreadPinned(thread.id, true);
  return store.markThreadRead(thread.id);
}

function copyWelcomeOnboardingAssets(assetsSourcePath: string | undefined, workspacePath: string): string[] {
  if (!assetsSourcePath || !existsSync(assetsSourcePath)) return [];
  const copied: string[] = [];
  for (const asset of WELCOME_SCREENSHOT_ASSETS) {
    const sourcePath = join(assetsSourcePath, "screenshots", asset);
    if (!existsSync(sourcePath)) continue;
    const targetRelativePath = join(WELCOME_ONBOARDING_ASSET_DIR, asset);
    const targetPath = join(workspacePath, targetRelativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    copied.push(targetRelativePath);
  }
  return copied;
}

function instructionsChatMarkdown(): string {
  return [
    "# Welcome to Ambient Desktop",
    "",
    "Ambient is a local-first agent workspace for turning a chat into real project work. The first screen has three important layers: the project/sidebar area, the chat composer, and the right-side work surfaces for board, Git, browser, files, terminal, and diffs.",
    "",
    `![Ambient Desktop shell](${WELCOME_ONBOARDING_ASSET_DIR}/01-main-shell.png)`,
    "",
    "## Core Features",
    "",
    "| Feature | What it does | Try this first |",
    "| --- | --- | --- |",
    "| Agentic Chat | Ask Ambient to inspect files, edit code, run commands, use tools, and report back with evidence. | `Explain this project and suggest the next useful task.` |",
    "| Core Setup and Plugins | Add typed core capabilities such as voice, speech, search/web, media/vision, documents, remote access, and extension capabilities such as plugins or generated tools. | Open Core Setup, then use Plugin Setup for custom extensions. |",
    "| Git Integration | Work in branches and worktrees, review diffs, commit finished changes, and keep board artifacts in sync with source control. | Open the Git summary and inspect current branch/status before a large task. |",
    "",
    "## Icon Tour",
    "",
    "The exact layout can move as the app evolves, but these icons are the core vocabulary.",
    "",
    "| Area | Icon | Meaning |",
    "| --- | --- | --- |",
    "| Sidebar | PanelLeft | Hide or show the sidebar. |",
    "| Sidebar | Plus | Start a new chat. |",
    "| Sidebar | FolderOpen | Projects and folders, including this Welcome Folder. |",
    "| Sidebar | Search | Search chats, files, and project state. |",
    "| Sidebar | Monitor | Open or focus the managed browser surface. |",
    "| Sidebar | Plug | Open plugin and capability management. |",
    "| Sidebar | Bell | Automations and scheduled work. |",
    "| Sidebar | Pin | Keep a project or chat near the top. |",
    "| Sidebar | ChevronDown | Expand folders or menus. |",
    "| Composer | Paperclip | Attach files or media to a chat. |",
    "| Composer | RefreshCw | Compact context, retry, or revise a durable plan when the control appears. |",
    "| Composer | Download | Export chat, plan, or board artifacts. |",
    "| Composer | Brain | Thinking display and effort controls. |",
    "| Composer | Bot | Model/provider picker. |",
    "| Composer | Mic | Speech input. Use Speech Input setup in Core Setup first. |",
    "| Composer | Shield | Permission scope and approval posture. |",
    "| Composer | Square | Stop a running agent. |",
    "| Composer | Send | Submit the message. |",
    "| Mode toggle | Clipboard with arrow | Switch to Planner Mode. Planning produces a durable plan before implementation. |",
    "| Work surfaces | Kanban | Create or open the project board. |",
    "| Work surfaces | GitBranch | Git summary, branch, worktree, and board sync. |",
    "| Work surfaces | FileText | File tree or artifact text preview. |",
    "| Work surfaces | Terminal | Terminal panel. |",
    "| Work surfaces | Code2 | Diff panel. |",
    "| Workflow Recordings | MessageCircle | Start a new workflow recording. |",
    "| Board | Pencil | Revise a board or card. |",
    "| Board | CheckCircle2 | Accept, approve, or commit completed work. |",
    "| Board | ChevronRight | Push board artifacts. |",
    "| Board | ChevronLeft | Pull board artifacts. |",
    "| Board | ClipboardPaste | Apply pulled board state or prepare runs. |",
    "| Board | AlertCircle | Needs review, blocked, or missing proof. |",
    "| Board | Play | Start a Local Task run. |",
    "| Board | Package | Deliverable integration. |",
    "",
    "## Planner Mode",
    "",
    "Planner Mode is for work that should be designed before files change. Switch to Planner with the clipboard-with-arrow control or ask for a plan explicitly. Ambient asks targeted questions, records decisions, drafts a plan, and saves a durable plan artifact. A durable plan is not just chat text: it is a persisted source of truth that can be revised, finalized, and used to create a Kanban board.",
    "",
    `![Planner Mode plan chat](${WELCOME_ONBOARDING_ASSET_DIR}/02-planner-mode.png)`,
    "",
    "The workflow is:",
    "",
    "1. Switch to Planner Mode before a large or ambiguous task.",
    "2. Answer required planning questions so assumptions become durable metadata.",
    "3. Generate the durable plan artifact.",
    "4. Click Add Plan to Board when the plan is ready.",
    "5. Review Draft Inbox cards before allowing work to run.",
    "6. Execute cards as Local Tasks, review proof, and commit finished changes.",
    "",
    "## Kanban Board Workflow",
    "",
    "A project board turns a plan into explicit work. The calculator app example below was generated from a real board run so the screenshots show the actual interface rather than a placeholder.",
    "",
    `![Calculator project board lanes](${WELCOME_ONBOARDING_ASSET_DIR}/03-calculator-board.png)`,
    "",
    "Board lanes separate proposed work from executable work. Draft Inbox contains candidates that still need PM review. Ready cards can be prepared and run. In Progress cards show active local task execution. Review and Done lanes keep proof and acceptance visible.",
    "",
    `![Calculator Draft Inbox](${WELCOME_ONBOARDING_ASSET_DIR}/04-calculator-draft-inbox.png)`,
    "",
    "Draft Inbox is where you refine scope before spending tokens or changing files. Use it to merge duplicates, clarify acceptance criteria, mark cards Ready To Create, or reject work that should not be dispatched.",
    "",
    `![Calculator dependency map](${WELCOME_ONBOARDING_ASSET_DIR}/05-calculator-map.png)`,
    "",
    "The map view shows dependencies between cards. Use it when implementation order matters, for example when a calculator app needs core arithmetic before keyboard shortcuts, visual polish, or screenshot proof.",
    "",
    `![Git summary and board sync](${WELCOME_ONBOARDING_ASSET_DIR}/06-git-summary.png)`,
    "",
    "The Git summary ties board work back to repository state. Use it to inspect changed files, branch/worktree status, commit completed work, and push or pull board artifacts when collaborating across branches.",
    "",
    "## Workflow Recordings",
    "",
    "Workflow Recordings are for repeatable work you want Ambient to learn from a real chat. Open Workflow Recordings, start a New Workflow Recording, describe the goal, and then work with Ambient normally. Ambient records the user intent, successful tool calls, failed approaches, validation evidence, and expected output shape while the task runs.",
    "",
    "When the task is done, click Review with Ambient. Ambient turns the captured session into a draft playbook you can review, edit, and confirm. Confirmed playbooks become saved, searchable guidance that future chats can inject as bounded workflow knowledge instead of forcing Ambient to rediscover the same process from scratch.",
    "",
    "Good recording candidates are recurring team procedures: release checks, report generation, connector setup validation, QA passes, or multi-step research workflows. Keep secrets in Ambient-managed secret flows, avoid recording sensitive values into playbooks, and use normal chat for one-off tasks that do not need to become reusable guidance.",
    "",
    "## Practical First Task",
    "",
    "Try a contained task first: `Plan a small calculator app with keyboard input, error states, and screenshot proof. Then create a board from the plan.` Review the Draft Inbox, run one card, and inspect the proof before scaling up to a larger project.",
  ].join("\n");
}

function pluginSetupChatMarkdown(): string {
  return [
    "# Plugin Setup",
    "",
    "Plugin Setup is for extension surfaces that are not already covered by Core Setup: Codex plugins, Pi packages, custom MCP servers, generated capabilities, and workspace-specific integrations. The live Ambient Desktop page renders current plugin state and setup buttons from the app registry.",
    "",
    `![Plugin manager candidate list](${WELCOME_ONBOARDING_ASSET_DIR}/07-plugin-manager.png)`,
    "",
    "## What Belongs Here",
    "",
    "| Area | Use Plugin Setup for |",
    "| --- | --- |",
    "| Codex plugins | Curated or imported plugins with skills, MCP servers, or app connectors. |",
    "| Pi packages | Package inspection, metadata review, and package-backed capability surfaces. |",
    "| Custom MCP | Custom ToolHive/MCP servers that are not Ambient's default Scrapling web research path. |",
    "| Generated capabilities | Capability Builder preview, validation, update, repair, re-registration, and removal flows. |",
    "| Team integrations | Narrow repeatable internal tools that need explicit command contracts, secrets, validation, and trust review. |",
    "",
    "Core capabilities such as voice, speech input, search/web, MCP runtime recovery, default Scrapling, media/vision, rich documents, Google Workspace document paths, and Remote Ambient Surface setup are handled by Core Setup.",
    "",
    "## On-The-Fly Plugins",
    "",
    "Ambient can create plugins and capabilities when the existing catalog does not cover the task. For example: `Create a plugin that checks our staging health endpoint, summarizes failed checks, and links the deploy dashboard.` Ambient should scaffold the package, show the command contract, ask before installing dependencies, request secrets through managed secret entry, validate the plugin, then register it so future chats can discover and use it.",
    "",
    "Good generated-plugin candidates are narrow, repeatable integrations with clear inputs and outputs: a status API checker, an internal docs search adapter, a release-note formatter, or a workspace-specific artifact validator.",
  ].join("\n");
}

function coreSetupChatMarkdown(): string {
  return [
    "# Core Setup",
    "",
    "Core Setup is the live setup dashboard for Ambient's first-party and product-level capabilities. Ambient Desktop renders current setup sections from the active provider catalog and Settings models, then starts approval-gated setup chats from the same typed product entrypoints used in Settings.",
    "",
    `![Settings search for setup](${WELCOME_ONBOARDING_ASSET_DIR}/08-settings-search.png)`,
    "",
    "## Covered Areas",
    "",
    "| Area | Examples |",
    "| --- | --- |",
    "| Voice Output | TTS providers such as Piper, Kokoro, ElevenLabs, and Cartesia. |",
    "| Speech Input | STT providers and microphone validation. |",
    "| Search and Web | Search providers, scraping, retrieval, Local Deep Research, and default web research setup. |",
    "| MCP Runtime | Container runtime recovery and the default Scrapling ToolHive capability. |",
    "| Media and Vision | MiniCPM-V visual understanding, image generation, video generation, SVG animation, and HyperFrames authored video. |",
    "| Documents and Office | Local rich-document runtimes, Office extraction/preview, and cloud document connector paths. |",
    "| Remote Control | Remote Ambient Surface setup, with Telegram as the reviewed route and Signal as status-only until reviewed. |",
    "| Security and Access | API key, browser, permission grant, and secret-flow setup surfaces. |",
    "",
    "Setup buttons start a chat-first approval flow. They do not silently install dependencies, bind secrets, download models, activate providers, or change provider selections.",
  ].join("\n");
}
