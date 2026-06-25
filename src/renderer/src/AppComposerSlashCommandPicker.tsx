import { AlertCircle, ListChecks, LoaderCircle, Network, Slash, Sparkles, TerminalSquare, X, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SlashCommandCatalogEntry, SlashCommandSearchResponse, SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { ComposerDraftStore } from "./AppComposerControls";
import { useComposerDraftSelection, useComposerDraftValue } from "./AppComposerControls";
import {
  slashCommandAvailabilityLabel,
  slashCommandCatalogNeedsRefreshEvent,
  slashCommandEntryIsSelectable,
  slashCommandGroupLabel,
  type SlashCommandDraftTrigger,
  slashCommandPickerSearchInput,
  slashCommandTriggerFromDraft,
} from "./slashCommandUiModel";

export function useAppComposerSlashCommandPicker({
  composerDraftStore,
  selectedSlashCommand,
  onComposerKeyDown,
  onSelectSlashCommandEntry,
  onUnavailableSlashCommand,
}: {
  composerDraftStore: ComposerDraftStore;
  selectedSlashCommand?: SlashCommandSelection;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onSelectSlashCommandEntry: (entry: SlashCommandCatalogEntry, query: string, draft: string, trigger: SlashCommandDraftTrigger) => void;
  onUnavailableSlashCommand: (entry: SlashCommandCatalogEntry) => void;
}) {
  const composerDraftValue = useComposerDraftValue(composerDraftStore);
  const composerDraftSelection = useComposerDraftSelection(composerDraftStore);
  const slashTrigger = slashCommandTriggerFromDraft(composerDraftValue, selectedSlashCommand, composerDraftSelection.end);
  const [slashSearchState, setSlashSearchState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    response?: SlashCommandSearchResponse;
    error?: string;
  }>({ status: "idle" });
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashDismissedToken, setSlashDismissedToken] = useState("");
  const [slashCatalogRefreshNonce, setSlashCatalogRefreshNonce] = useState(0);
  const slashRequestIdRef = useRef(0);
  const slashPopoverOpen = slashTrigger.active && slashDismissedToken !== slashTrigger.token;
  const slashCommandEntries = slashSearchState.response?.entries ?? [];

  useEffect(() => {
    if (slashDismissedToken && slashDismissedToken !== slashTrigger.token) setSlashDismissedToken("");
  }, [slashDismissedToken, slashTrigger.token]);

  useEffect(() => {
    if (!slashPopoverOpen) {
      setSlashSearchState({ status: "idle" });
      setSlashActiveIndex(0);
      return;
    }
    const requestId = ++slashRequestIdRef.current;
    setSlashSearchState({ status: "loading" });
    setSlashActiveIndex(0);
    window.ambientDesktop
      .searchSlashCommands(slashCommandPickerSearchInput(slashTrigger.query))
      .then((response) => {
        if (slashRequestIdRef.current !== requestId) return;
        setSlashSearchState({ status: "ready", response });
      })
      .catch((error) => {
        if (slashRequestIdRef.current !== requestId) return;
        setSlashSearchState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      });
  }, [slashPopoverOpen, slashTrigger.query, slashCatalogRefreshNonce]);

  useEffect(() => {
    if (!slashPopoverOpen) return undefined;
    return window.ambientDesktop.onEvent((event) => {
      if (slashCommandCatalogNeedsRefreshEvent(event)) {
        setSlashCatalogRefreshNonce((nonce) => nonce + 1);
      }
    });
  }, [slashPopoverOpen]);

  function chooseSlashCommand(entry: SlashCommandCatalogEntry): void {
    if (!slashCommandEntryIsSelectable(entry)) {
      onUnavailableSlashCommand(entry);
      return;
    }
    onSelectSlashCommandEntry(entry, slashTrigger.query, composerDraftValue, slashTrigger);
    setSlashDismissedToken(slashTrigger.token);
  }

  function handleComposerInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (slashPopoverOpen && slashSearchState.status !== "idle") {
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashDismissedToken(slashTrigger.token);
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && slashCommandEntries.length > 0) {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setSlashActiveIndex((index) => (index + delta + slashCommandEntries.length) % slashCommandEntries.length);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && slashCommandEntries[slashActiveIndex]) {
        event.preventDefault();
        chooseSlashCommand(slashCommandEntries[slashActiveIndex]!);
        return;
      }
    }
    onComposerKeyDown(event);
  }

  return {
    activeIndex: slashActiveIndex,
    entries: slashCommandEntries,
    error: slashSearchState.error,
    onChooseEntry: chooseSlashCommand,
    onComposerInputKeyDown: handleComposerInputKeyDown,
    onHoverEntry: setSlashActiveIndex,
    popoverOpen: slashPopoverOpen,
    status: slashSearchState.status,
  };
}

export function AppComposerSlashCommandSelectionChip({ selection, onRemove }: { selection: SlashCommandSelection; onRemove: () => void }) {
  return (
    <div className="slash-command-chip-strip">
      <button
        type="button"
        className="slash-command-chip"
        onClick={onRemove}
        data-tooltip={`Remove ${selection.title}`}
        aria-label={`Remove ${selection.title}`}
      >
        <SlashCommandGlyph invocationKind={selection.invocationKind} />
        <span>{selection.title}</span>
        <small>{slashCommandSelectedKindLabel(selection)}</small>
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export function AppComposerSlashCommandPopover({
  status,
  entries,
  activeIndex,
  error,
  onHoverEntry,
  onChooseEntry,
}: {
  status: "idle" | "loading" | "ready" | "error";
  entries: SlashCommandCatalogEntry[];
  activeIndex: number;
  error?: string;
  onHoverEntry: (index: number) => void;
  onChooseEntry: (entry: SlashCommandCatalogEntry) => void;
}) {
  let previousGroup = "";
  const [focusedDescriptionEntryId, setFocusedDescriptionEntryId] = useState<string | undefined>();
  return (
    <div className="slash-command-popover" role="listbox" aria-label="Slash commands">
      {status === "loading" && (
        <div className="slash-command-empty">
          <LoaderCircle size={15} className="spin" aria-hidden="true" />
          <span>Searching...</span>
        </div>
      )}
      {status === "error" && (
        <div className="slash-command-empty warning">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error || "Command search failed."}</span>
        </div>
      )}
      {status === "ready" && entries.length === 0 && (
        <div className="slash-command-empty">
          <Slash size={15} aria-hidden="true" />
          <span>No commands found.</span>
        </div>
      )}
      {status === "ready" &&
        entries.map((entry, index) => {
          const group = slashCommandGroupLabel(entry);
          const showGroup = group !== previousGroup;
          previousGroup = group;
          const selectable = slashCommandEntryIsSelectable(entry);
          return (
            <div key={entry.id}>
              {showGroup && <div className="slash-command-group-label">{group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                aria-disabled={!selectable}
                className={`slash-command-option ${activeIndex === index ? "active" : ""} ${selectable ? "" : "unavailable"}`}
                onMouseEnter={() => onHoverEntry(index)}
                onMouseDown={(event) => event.preventDefault()}
                onFocus={() => setFocusedDescriptionEntryId(entry.id)}
                onBlur={() => setFocusedDescriptionEntryId((current) => current === entry.id ? undefined : current)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setFocusedDescriptionEntryId(undefined);
                }}
                onClick={() => onChooseEntry(entry)}
              >
                <span className="slash-command-option-icon">
                  <SlashCommandGlyph invocationKind={entry.invocationKind} />
                </span>
                <span className="slash-command-option-copy">
                  <span>
                    <strong>{entry.command}</strong>
                    <em>{entry.title}</em>
                  </span>
                  {entry.description && (
                    <SlashCommandDescriptionDisclosure
                      entry={entry}
                      keyboardOpen={focusedDescriptionEntryId === entry.id}
                    />
                  )}
                </span>
                <span className={`slash-command-availability ${entry.availability}`}>
                  {slashCommandAvailabilityLabel(entry.availability)}
                </span>
              </button>
            </div>
          );
        })}
    </div>
  );
}

function SlashCommandDescriptionDisclosure({ entry, keyboardOpen }: { entry: SlashCommandCatalogEntry; keyboardOpen: boolean }) {
  const descriptionRef = useRef<HTMLElement>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function updateClipped(): void {
      const description = descriptionRef.current;
      if (!description) {
        setClipped(false);
        return;
      }
      setClipped(description.scrollWidth > description.clientWidth || description.scrollHeight > description.clientHeight + 1);
    }
    updateClipped();
    window.addEventListener("resize", updateClipped);
    return () => window.removeEventListener("resize", updateClipped);
  }, [entry.description]);

  const show = clipped && (open || keyboardOpen);
  return (
    <span
      className="slash-command-description-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <small ref={descriptionRef} className="slash-command-description">
        {entry.description}
      </small>
      {clipped && <span className="slash-command-description-affordance" aria-hidden="true">More</span>}
      {show && (
        <span className="slash-command-description-popover" role="tooltip">
          <strong>{entry.title}</strong>
          <span>{entry.description}</span>
          <em>
            {entry.sourceName || entry.groupLabel} · {slashCommandAvailabilityLabel(entry.availability)} · {entry.command} · {entry.invocationKind}
          </em>
        </span>
      )}
    </span>
  );
}

function SlashCommandGlyph({
  invocationKind,
}: {
  invocationKind: SlashCommandCatalogEntry["invocationKind"] | SlashCommandSelection["invocationKind"];
}) {
  if (invocationKind === "builtin-command") return <ListChecks size={15} aria-hidden="true" />;
  if (invocationKind === "codex-plugin-skill") return <Sparkles size={15} aria-hidden="true" />;
  if (invocationKind === "ambient-cli-skill" || invocationKind === "ambient-cli-command")
    return <TerminalSquare size={15} aria-hidden="true" />;
  if (invocationKind === "workflow-playbook" || invocationKind === "callable-workflow") return <Workflow size={15} aria-hidden="true" />;
  if (invocationKind === "symphony-recipe") return <Network size={15} aria-hidden="true" />;
  return <Slash size={15} aria-hidden="true" />;
}

function slashCommandSelectedKindLabel(selection: SlashCommandSelection): string {
  if (selection.invocationKind === "codex-plugin-skill") return "Skill";
  if (selection.invocationKind === "ambient-cli-skill") return "CLI skill";
  if (selection.invocationKind === "ambient-cli-command") return "CLI command";
  if (selection.invocationKind === "workflow-playbook") return "Workflow";
  if (selection.invocationKind === "symphony-recipe") return "Symphony";
  if (selection.invocationKind === "callable-workflow") return "Callable";
  return "Command";
}
