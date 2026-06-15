import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import type {
  PermissionMode,
  TerminalSession,
  WorkspaceContextReference,
  WorkspaceFileContent,
  WorkspaceFileTree,
  WorkspaceOpenTarget,
  WorkspaceSearchResult,
  WorkspaceSearchScope,
} from "../../shared/types";
import { visibleFileEntries } from "./RightPanelDetailPanels";
import { clampNumber } from "./RightPanelRichText";

type PreviewRequest = { path: string; nonce: number };

const searchScopeOptions: { value: WorkspaceSearchScope; label: string }[] = [
  { value: "chat", label: "This chat" },
  { value: "project", label: "This project" },
  { value: "all-projects", label: "All projects" },
];

function searchScopeLabel(scope: WorkspaceSearchScope): string {
  return searchScopeOptions.find((option) => option.value === scope)?.label ?? "This project";
}

function searchScopePlaceholder(scope: WorkspaceSearchScope): string {
  if (scope === "chat") return "Search this chat";
  if (scope === "all-projects") return "Search all projects";
  return "Search this project";
}

export function fileContextReference(file: WorkspaceFileContent): WorkspaceContextReference {
  const localPath = file.source === "local" ? file.absolutePath ?? file.path : undefined;
  return {
    path: localPath ?? file.path,
    name: file.name,
    kind: "file",
    size: file.size,
    ...(localPath ? { absolute: true } : {}),
  };
}

export function useRightPanelSearchController({
  panel,
  workspacePath,
  activeThreadId,
}: {
  panel: string;
  workspacePath: string;
  activeThreadId: string;
}) {
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<WorkspaceSearchScope>("project");
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();

  async function loadSearchResults() {
    const needle = query.trim();
    setSearchError(undefined);
    if (!needle) {
      setSearchResults([]);
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    try {
      setSearchResults(
        await window.ambientDesktop.searchWorkspace({
          query: needle,
          scope: searchScope,
          threadId: activeThreadId,
        }),
      );
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearchBusy(false);
    }
  }

  useEffect(() => {
    if (panel !== "search") return;
    const timer = window.setTimeout(() => void loadSearchResults(), 120);
    return () => window.clearTimeout(timer);
  }, [panel, query, searchScope, workspacePath, activeThreadId]);

  return {
    query,
    searchScope,
    searchScopeOptions,
    searchResults,
    searchBusy,
    searchError,
    searchScopeLabel,
    searchScopePlaceholder,
    setQuery,
    setSearchScope,
  };
}

export function useRightPanelTerminalController({
  panel,
  activeWorkspacePath,
  eventWorkspacePath,
  activeThreadId,
  permissionMode,
}: {
  panel: string;
  activeWorkspacePath: string;
  eventWorkspacePath: string;
  activeThreadId: string;
  permissionMode: PermissionMode;
}) {
  const [terminal, setTerminal] = useState<TerminalSession | undefined>();
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalError, setTerminalError] = useState<string | undefined>();
  const terminalOutputRef = useRef<HTMLPreElement>(null);
  const terminalCommandInputRef = useRef<HTMLInputElement>(null);
  const terminalInputValueRef = useRef("");

  function updateTerminalInput(value: string | ((current: string) => string)) {
    const next = typeof value === "function" ? value(terminalInputValueRef.current) : value;
    terminalInputValueRef.current = next;
    setTerminalInput(next);
  }

  async function sendTerminalInput(value = terminalInputValueRef.current, allowEmpty = false) {
    if (!terminal) return;
    const command = value;
    if (!allowEmpty && !command.trim()) return;
    terminalInputValueRef.current = "";
    flushSync(() => setTerminalInput(""));
    setTerminalError(undefined);
    try {
      const threadId = terminal.threadId ?? activeThreadId;
      if (!command.trim()) {
        await window.ambientDesktop.sendTerminalControl({
          threadId,
          terminalId: terminal.id,
          sessionToken: terminal.sessionToken,
          action: "enter",
        });
        return;
      }
      await window.ambientDesktop.submitTerminalCommand({
        threadId,
        terminalId: terminal.id,
        sessionToken: terminal.sessionToken,
        command,
      });
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleTerminalKey(
    key: string,
    event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; preventDefault: () => void },
  ) {
    if (!terminal) return;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "c") {
      event.preventDefault();
      updateTerminalInput("");
      void window.ambientDesktop.sendTerminalControl({
        threadId: terminal.threadId ?? activeThreadId,
        terminalId: terminal.id,
        sessionToken: terminal.sessionToken,
        action: "interrupt",
      });
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"].includes(key) && !terminalInputValueRef.current) {
      event.preventDefault();
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      void sendTerminalInput(terminalInputValueRef.current, true);
      return;
    }
    if (key === "Backspace") {
      event.preventDefault();
      updateTerminalInput((input) => input.slice(0, -1));
      return;
    }
    if (key === "Tab") {
      event.preventDefault();
      updateTerminalInput((input) => `${input}\t`);
      return;
    }
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      updateTerminalInput((input) => `${input}${key}`);
    }
  }

  function handleTerminalPaste(event: ReactClipboardEvent<HTMLPreElement>) {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    updateTerminalInput((input) => `${input}${text.replace(/\r\n/g, "\n")}`);
  }

  useEffect(() => {
    if (panel !== "terminal") return;
    let terminalId = "";
    let terminalCleanup: { threadId: string; terminalId: string; sessionToken: string } | undefined;
    let disposed = false;
    const unsubscribe = window.ambientDesktop.onEvent((event) => {
      if ((event.type === "terminal-data" || event.type === "terminal-exit") && event.workspacePath && event.workspacePath !== eventWorkspacePath) return;
      if (event.type === "terminal-data" && event.terminalId === terminalId) {
        setTerminalOutput((output) => (event.replace ? event.data : `${output}${event.data}`));
      }
      if (event.type === "terminal-exit" && event.terminalId === terminalId) {
        setTerminalOutput((output) => `${output}\n[terminal exited]\n`);
        setTerminal(undefined);
      }
    });

    void window.ambientDesktop
      .requestTerminalStart({ threadId: activeThreadId })
      .then((intent) => window.ambientDesktop.startTerminal({ threadId: activeThreadId, startToken: intent.token }))
      .then((session) => {
        const sessionThreadId = session.threadId ?? activeThreadId;
        const cleanup = { threadId: sessionThreadId, terminalId: session.id, sessionToken: session.sessionToken };
        if (disposed) {
          void window.ambientDesktop.stopTerminal(cleanup);
          return;
        }
        terminalId = session.id;
        terminalCleanup = cleanup;
        setTerminal(session);
        setTerminalOutput("");
        updateTerminalInput("");
        setTerminalError(undefined);
      })
      .catch((error) => setTerminalError(error instanceof Error ? error.message : String(error)));

    return () => {
      disposed = true;
      unsubscribe();
      if (terminalCleanup) void window.ambientDesktop.stopTerminal(terminalCleanup);
    };
  }, [panel, activeWorkspacePath, eventWorkspacePath, activeThreadId, permissionMode]);

  useEffect(() => {
    terminalOutputRef.current?.scrollTo({ top: terminalOutputRef.current.scrollHeight });
  }, [terminalOutput, terminalInput]);

  useEffect(() => {
    if (panel === "terminal" && terminal) terminalOutputRef.current?.focus();
  }, [panel, terminal?.id, activeThreadId, permissionMode]);

  useEffect(() => {
    if (panel !== "terminal" || !terminal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains("terminal-output")) return;
      if ((event as KeyboardEvent & { __ambientTerminalHandled?: boolean }).__ambientTerminalHandled) return;
      (event as KeyboardEvent & { __ambientTerminalHandled?: boolean }).__ambientTerminalHandled = true;
      handleTerminalKey(event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        preventDefault: () => event.preventDefault(),
      });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [panel, terminal?.id, activeThreadId, permissionMode]);

  useEffect(() => {
    if (panel !== "terminal" || !terminal) return;
    const input = terminalCommandInputRef.current;
    if (!input) return;
    const onInput = () => updateTerminalInput(input.value);
    input.addEventListener("input", onInput);
    return () => input.removeEventListener("input", onInput);
  }, [panel, terminal?.id]);

  return {
    terminal,
    terminalOutput,
    terminalInput,
    terminalError,
    terminalOutputRef,
    terminalCommandInputRef,
    updateTerminalInput,
    sendTerminalInput,
    handleTerminalKey,
    handleTerminalPaste,
  };
}

export function useRightPanelFilesController({
  panel,
  activeWorkspacePath,
  workspaceRevision,
  panelWidth,
  artifactPreviewRequest,
  localFilePreviewRequest,
}: {
  panel: string;
  activeWorkspacePath: string;
  workspaceRevision: number;
  panelWidth: number;
  artifactPreviewRequest?: PreviewRequest;
  localFilePreviewRequest?: PreviewRequest;
}) {
  const [fileTree, setFileTree] = useState<WorkspaceFileTree | undefined>();
  const [fileTreeError, setFileTreeError] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileContent | undefined>();
  const [selectedFileError, setSelectedFileError] = useState<string | undefined>();
  const [officePreviewRefreshingPath, setOfficePreviewRefreshingPath] = useState<string | undefined>();
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [openTargets, setOpenTargets] = useState<WorkspaceOpenTarget[]>([]);
  const [openTargetsError, setOpenTargetsError] = useState<string | undefined>();
  const [filePaneWidth, setFilePaneWidth] = useState(240);

  const visibleEntries = useMemo(() => visibleFileEntries(fileTree?.entries ?? [], collapsedDirs), [fileTree?.entries, collapsedDirs]);

  async function loadFileTree() {
    setFileTreeError(undefined);
    setSelectedFileError(undefined);
    try {
      setFileTree(await window.ambientDesktop.listWorkspaceFiles());
    } catch (error) {
      setFileTreeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadOpenTargets() {
    setOpenTargetsError(undefined);
    try {
      setOpenTargets(await window.ambientDesktop.listWorkspaceOpenTargets());
    } catch (error) {
      setOpenTargets([]);
      setOpenTargetsError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openFile(path: string) {
    setSelectedFileError(undefined);
    try {
      setSelectedFile(await window.ambientDesktop.readWorkspaceFile(path));
    } catch (error) {
      setSelectedFile(undefined);
      setSelectedFileError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openLocalFile(path: string) {
    setSelectedFileError(undefined);
    try {
      setSelectedFile(await window.ambientDesktop.previewLocalFile(path));
    } catch (error) {
      setSelectedFile(undefined);
      setSelectedFileError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshOfficePreview(file: WorkspaceFileContent) {
    const path = previewFileActionPath(file);
    setSelectedFileError(undefined);
    setOfficePreviewRefreshingPath(path);
    try {
      setSelectedFile(
        file.source === "local"
          ? await window.ambientDesktop.refreshLocalOfficePreview(path)
          : await window.ambientDesktop.refreshOfficePreview(path),
      );
    } catch (error) {
      setSelectedFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setOfficePreviewRefreshingPath(undefined);
    }
  }

  function previewFileActionPath(file: WorkspaceFileContent): string {
    return file.source === "local" ? file.absolutePath ?? file.path : file.path;
  }

  function toggleDirectory(path: string) {
    setCollapsedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function openWorkspacePath(path: string, targetId: string) {
    setSelectedFileError(undefined);
    try {
      if (targetId === "finder") await window.ambientDesktop.revealWorkspacePath(path);
      else await window.ambientDesktop.openWorkspacePathWith({ path, targetId });
    } catch (error) {
      setSelectedFileError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openPreviewFilePath(file: WorkspaceFileContent, targetId: string) {
    const path = previewFileActionPath(file);
    setSelectedFileError(undefined);
    try {
      if (file.source === "local") {
        if (targetId === "finder") await window.ambientDesktop.revealLocalPath(path);
        else await window.ambientDesktop.openLocalPathWith({ path, targetId });
        return;
      }
      await openWorkspacePath(path, targetId);
    } catch (error) {
      setSelectedFileError(error instanceof Error ? error.message : String(error));
    }
  }

  function beginFilePaneResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const layout = event.currentTarget.parentElement;
    const bounds = layout?.getBoundingClientRect();
    const left = bounds?.left ?? 0;
    const layoutWidth = bounds?.width ?? panelWidth;
    const maxWidth = Math.max(180, Math.min(560, layoutWidth - 210));
    const move = (moveEvent: MouseEvent) => {
      setFilePaneWidth(clampNumber(moveEvent.clientX - left, 180, maxWidth));
    };
    const stop = () => {
      document.body.classList.remove("resizing-file-pane");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    document.body.classList.add("resizing-file-pane");
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    move(event.nativeEvent);
  }

  useEffect(() => {
    if (panel === "files") {
      void loadFileTree();
      void loadOpenTargets();
    }
  }, [panel, activeWorkspacePath, workspaceRevision]);

  useEffect(() => {
    if (panel !== "files" || !artifactPreviewRequest) return;
    void openFile(artifactPreviewRequest.path);
  }, [panel, artifactPreviewRequest?.path, artifactPreviewRequest?.nonce, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "files" || !localFilePreviewRequest) return;
    void openLocalFile(localFilePreviewRequest.path);
  }, [panel, localFilePreviewRequest?.path, localFilePreviewRequest?.nonce, activeWorkspacePath]);

  useEffect(() => {
    if (panel !== "files" || !selectedFile?.path) return;
    if (selectedFile.source === "local") void openLocalFile(selectedFile.absolutePath ?? selectedFile.path);
    else void openFile(selectedFile.path);
  }, [panel, selectedFile?.path, selectedFile?.source, selectedFile?.absolutePath, activeWorkspacePath, workspaceRevision]);

  useEffect(() => {
    setSelectedFile(undefined);
    setSelectedFileError(undefined);
    setOfficePreviewRefreshingPath(undefined);
    setCollapsedDirs(new Set());
  }, [activeWorkspacePath]);

  return {
    fileTree,
    fileTreeError,
    visibleEntries,
    selectedFile,
    selectedFileError,
    openTargets,
    openTargetsError,
    filePaneWidth,
    collapsedDirs,
    officePreviewRefreshingPath,
    loadFileTree,
    toggleDirectory,
    openFile,
    openPreviewFilePath,
    refreshOfficePreview,
    previewFileActionPath,
    beginFilePaneResize,
  };
}
