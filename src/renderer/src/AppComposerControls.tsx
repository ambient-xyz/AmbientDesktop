import {
  Bot,
  ClipboardPaste,
  FileImage,
  FileText,
  FolderOpen,
  Shield,
  Zap,
} from "lucide-react";
import {
  ClipboardEvent as ReactClipboardEvent,
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { CollaborationMode, ContextUsageSnapshot } from "../../shared/threadTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import {
  clampNumber,
  contextAttachmentKey,
  contextUsagePresentation,
  formatPanelFileSize,
} from "./RightPanel";

export type ChatComposerInputHandle = {
  getValue: () => string;
  setValue: (value: string) => void;
  focusEnd: () => void;
};

export type ComposerDraftSelection = {
  start: number;
  end: number;
};

export type ComposerDraftStore = {
  getSnapshot: () => string;
  getSelectionSnapshot: () => ComposerDraftSelection;
  set: (value: string) => void;
  setSelection: (selection: ComposerDraftSelection) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createComposerDraftStore(initialValue = ""): ComposerDraftStore {
  let value = initialValue;
  let selection: ComposerDraftSelection = { start: initialValue.length, end: initialValue.length };
  const listeners = new Set<() => void>();
  function notify() {
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => value,
    getSelectionSnapshot: () => selection,
    set: (nextValue: string) => {
      if (nextValue === value) return;
      value = nextValue;
      const nextCaret = Math.min(selection.end, nextValue.length);
      selection = { start: nextCaret, end: nextCaret };
      notify();
    },
    setSelection: (nextSelection: ComposerDraftSelection) => {
      const start = Math.max(0, Math.min(nextSelection.start, value.length));
      const end = Math.max(start, Math.min(nextSelection.end, value.length));
      if (selection.start === start && selection.end === end) return;
      selection = { start, end };
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useComposerDraftValue(store: ComposerDraftStore): string {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useComposerDraftSelection(store: ComposerDraftStore): ComposerDraftSelection {
  return useSyncExternalStore(store.subscribe, store.getSelectionSnapshot, store.getSelectionSnapshot);
}

export function resizeComposerTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const maxHeight = parsedPixelValue(window.getComputedStyle(textarea).maxHeight);
  const nextHeight = maxHeight ? Math.min(textarea.scrollHeight, maxHeight) : textarea.scrollHeight;
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = maxHeight && textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

export const ChatComposerInput = forwardRef<
  ChatComposerInputHandle,
  {
    composerDraftStore: ComposerDraftStore;
    placeholder: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    onPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  }
>(function ChatComposerInput({ composerDraftStore, placeholder, disabled = false, onChange, onPaste, onKeyDown }, ref) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function updateSelectionFromTextarea(textarea: HTMLTextAreaElement): void {
    composerDraftStore.setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }

  function handleSelectionEvent(event: SyntheticEvent<HTMLTextAreaElement>): void {
    updateSelectionFromTextarea(event.currentTarget);
  }

  function resizeCurrentTextarea(): void {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizeComposerTextarea(textarea);
  }

  useLayoutEffect(() => {
    resizeCurrentTextarea();
  }, [value]);

  useImperativeHandle(ref, () => ({
    getValue: () => valueRef.current,
    setValue: (nextValue: string) => {
      valueRef.current = nextValue;
      setValue(nextValue);
      composerDraftStore.setSelection({ start: nextValue.length, end: nextValue.length });
    },
    focusEnd: () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
      updateSelectionFromTextarea(textarea);
    },
  }), [composerDraftStore]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        const nextValue = event.target.value;
        valueRef.current = nextValue;
        setValue(nextValue);
        composerDraftStore.set(nextValue);
        updateSelectionFromTextarea(event.target);
        onChange(nextValue);
      }}
      onClick={handleSelectionEvent}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      onKeyUp={handleSelectionEvent}
      onSelect={handleSelectionEvent}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
    />
  );
});

export function contextUsageRingMetrics(percent: number | undefined, radius = 7) {
  const circumference = 2 * Math.PI * radius;
  const ringPercent = percent !== undefined ? clampNumber(percent, 0, 100) : 0;
  const ringFill = (ringPercent / 100) * circumference;
  return {
    circumference,
    ringFill,
    ringRemainder: circumference - ringFill,
  };
}

function parsedPixelValue(value: string): number | undefined {
  if (!value || value === "none") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function mergeContextAttachments(
  current: readonly WorkspaceContextReference[],
  additions: readonly WorkspaceContextReference[],
): WorkspaceContextReference[] {
  const byKey = new Map(current.map((item) => [contextAttachmentKey(item), item]));
  for (const item of additions) {
    if (!item.path.trim()) continue;
    byKey.set(contextAttachmentKey(item), item);
  }
  return Array.from(byKey.values()).slice(0, 30);
}

export function ContextUsageIndicator({
  snapshot,
  settings,
}: {
  snapshot?: ContextUsageSnapshot;
  settings: DesktopState["settings"]["compaction"];
}) {
  const state = contextUsagePresentation(snapshot, settings);
  const ring = contextUsageRingMetrics(state.percent);
  return (
    <span className={`context-usage context-usage-${state.tone}`} data-tooltip={state.title} aria-label={state.title}>
      <svg className="context-usage-ring" viewBox="0 0 20 20" aria-hidden="true">
        <circle className="context-usage-ring-track" cx="10" cy="10" r={7} />
        <circle
          className="context-usage-ring-fill"
          cx="10"
          cy="10"
          r={7}
          strokeDasharray={`${ring.ringFill} ${ring.ringRemainder}`}
        />
      </svg>
      {state.label}
    </span>
  );
}

export function SegmentedCollaborationMode({
  value,
  onChange,
}: {
  value: CollaborationMode;
  onChange: (value: CollaborationMode) => void;
}) {
  return (
    <div className="permission-toggle collaboration-toggle" role="group" aria-label="Collaboration mode">
      <button
        type="button"
        className={value === "agent" ? "selected" : ""}
        data-tooltip="Agent mode: let Ambient work directly in this project."
        aria-label="Switch to Agent mode"
        aria-pressed={value === "agent"}
        onClick={() => onChange("agent")}
      >
        <Bot size={14} />
        Agent
      </button>
      <button
        type="button"
        className={value === "planner" ? "selected" : ""}
        data-tooltip="Planner mode: draft and revise a plan before applying changes."
        aria-label="Switch to Planner mode"
        aria-pressed={value === "planner"}
        onClick={() => onChange("planner")}
      >
        <ClipboardPaste size={14} />
        Plan
      </button>
    </div>
  );
}

export function SegmentedPermission({
  value,
  onChange,
}: {
  value: PermissionMode;
  onChange: (value: PermissionMode) => void;
}) {
  return (
    <div className="permission-toggle" role="group" aria-label="Permission scope">
      <button
        type="button"
        className={value === "full-access" ? "selected" : ""}
        data-tooltip="Full access: allow broader tool and filesystem requests."
        aria-label="Use full access permission mode"
        aria-pressed={value === "full-access"}
        onClick={() => onChange("full-access")}
      >
        <Zap size={14} />
        Full access
      </button>
      <button
        type="button"
        className={value === "workspace" ? "selected" : ""}
        data-tooltip="Workspace scope: keep file and shell work inside this project."
        aria-label="Use workspace-scoped permission mode"
        aria-pressed={value === "workspace"}
        onClick={() => onChange("workspace")}
      >
        <Shield size={14} />
        Workspace
      </button>
    </div>
  );
}

export function ContextAttachmentStrip({
  attachments,
  onRemove,
  onClear,
}: {
  attachments: WorkspaceContextReference[];
  onRemove: (item: WorkspaceContextReference) => void;
  onClear: () => void;
}) {
  return (
    <div className="context-strip">
      <div className="context-chips">
        {attachments.map((item) => (
          <button type="button" className="context-chip" key={contextAttachmentKey(item)} onClick={() => onRemove(item)} title={`Remove ${item.path}`}>
            {contextAttachmentIcon(item)}
            <span>{item.path}</span>
            <small>{item.kind === "file" && item.size !== undefined ? formatPanelFileSize(item.size) : "folder"}</small>
          </button>
        ))}
      </div>
      <button type="button" className="context-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

function contextAttachmentIcon(item: WorkspaceContextReference) {
  if (item.kind === "directory") return <FolderOpen size={12} />;
  if (isRasterImagePath(item.path)) return <FileImage size={12} />;
  return <FileText size={12} />;
}

function isRasterImagePath(path: string): boolean {
  return /\.(gif|jpe?g|png|webp)$/i.test(path);
}
