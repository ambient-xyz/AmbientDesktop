import {
  ChevronDown,
  ChevronRight,
  FileText,
  RefreshCw,
} from "lucide-react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import type {
  MiniCpmVisionDiagnosticItem,
  TerminalSession,
  WorkspaceFileContent,
  WorkspaceFileTree,
  WorkspaceOpenTarget,
  WorkspaceSearchResult,
  WorkspaceSearchScope,
} from "../../shared/types";
import { MiniCpmVisionDiagnosticsList } from "./RightPanelMiniCpmVisionDiagnostics";

type ApiKeyStatus = { kind: "info" | "success" | "error"; message: string };

type SearchScopeOption = { value: WorkspaceSearchScope; label: string };
type WorkspaceFileEntry = WorkspaceFileTree["entries"][number];

export function RightPanelTerminalPane({
  terminal,
  terminalOutput,
  terminalInput,
  terminalError,
  permissionMode,
  terminalOutputRef,
  terminalCommandInputRef,
  onTerminalInputChange,
  onTerminalKey,
  onTerminalPaste,
  onSendTerminalInput,
}: {
  terminal?: TerminalSession;
  terminalOutput: string;
  terminalInput: string;
  terminalError?: string;
  permissionMode: string;
  terminalOutputRef: RefObject<HTMLPreElement | null>;
  terminalCommandInputRef: RefObject<HTMLInputElement | null>;
  onTerminalInputChange: (value: string) => void;
  onTerminalKey: (
    key: string,
    modifiers: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; preventDefault: () => void },
  ) => void;
  onTerminalPaste: (event: ReactClipboardEvent<HTMLPreElement>) => void;
  onSendTerminalInput: () => void | Promise<void>;
}) {
  return (
    <div className="terminal-panel">
      <div className="terminal-banner">
        <span>Ambient terminal</span>
        <code>{terminal?.sandboxKind ?? permissionMode}</code>
      </div>
      <pre
        className="terminal-output"
        ref={terminalOutputRef}
        tabIndex={0}
        role="textbox"
        aria-label="Terminal"
        onClick={() => terminalOutputRef.current?.focus()}
        onKeyDown={(event) => {
          const nativeEvent = event.nativeEvent as KeyboardEvent & { __ambientTerminalHandled?: boolean };
          if (nativeEvent.__ambientTerminalHandled) return;
          nativeEvent.__ambientTerminalHandled = true;
          onTerminalKey(event.key, {
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            preventDefault: () => event.preventDefault(),
          });
        }}
        onPaste={onTerminalPaste}
      >
        {terminalOutput || "Starting terminal..."}
        {terminalInput}
        {terminal && <span className="terminal-cursor"> </span>}
      </pre>
      {terminalError && <p className="panel-note">{terminalError}</p>}
      <div className="terminal-input-row">
        <input
          ref={terminalCommandInputRef}
          className="panel-input"
          value={terminalInput}
          onChange={(event) => onTerminalInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onSendTerminalInput();
            }
          }}
          placeholder={terminal ? "Command" : "Starting..."}
          disabled={!terminal}
        />
        <button type="button" className="panel-button" disabled={!terminal || !terminalInput.trim()} onClick={() => void onSendTerminalInput()}>
          Run
        </button>
      </div>
    </div>
  );
}

export function RightPanelSearchPane({
  query,
  searchScope,
  searchScopeOptions,
  searchResults,
  searchBusy,
  searchError,
  searchScopePlaceholder,
  searchScopeLabel,
  onQueryChange,
  onSearchScopeChange,
  onSelectThread,
}: {
  query: string;
  searchScope: WorkspaceSearchScope;
  searchScopeOptions: SearchScopeOption[];
  searchResults: WorkspaceSearchResult[];
  searchBusy: boolean;
  searchError?: string;
  searchScopePlaceholder: (scope: WorkspaceSearchScope) => string;
  searchScopeLabel: (scope: WorkspaceSearchScope) => string;
  onQueryChange: (value: string) => void;
  onSearchScopeChange: (scope: WorkspaceSearchScope) => void;
  onSelectThread: (threadId: string, workspacePath?: string) => void | Promise<void>;
}) {
  return (
    <div className="panel-stack">
      <div className="search-scope-toggle" role="radiogroup" aria-label="Search scope">
        {searchScopeOptions.map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={searchScope === option.value}
            className={searchScope === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onSearchScopeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <input
        className="panel-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={searchScopePlaceholder(searchScope)}
        autoFocus
      />
      {searchError && <p className="panel-note">{searchError}</p>}
      <div className="panel-list">
        {searchBusy ? (
          <p className="panel-note">Searching...</p>
        ) : searchResults.length > 0 ? (
          searchResults.map((result) => (
            <button
              type="button"
              className="panel-list-row search-result-row"
              key={result.id}
              onClick={() => void onSelectThread(result.threadId, result.workspacePath)}
            >
              <strong>{result.title}</strong>
              <span>{result.excerpt || (result.kind === "thread" ? "Thread" : `${result.role ?? "message"} message`)}</span>
              <small>
                {result.projectName} / {result.kind === "thread" ? "Thread" : `${result.role ?? "message"} message`}
              </small>
            </button>
          ))
        ) : (
          <p>{query.trim() ? `No ${searchScopeLabel(searchScope).toLowerCase()} matches.` : "No query."}</p>
        )}
      </div>
    </div>
  );
}

export function RightPanelFilesPane({
  fileTree,
  fileTreeError,
  visibleEntries,
  selectedFile,
  selectedFileError,
  openTargets,
  openTargetsError,
  visualAnalysisBusy,
  visualAnalysisStatus,
  visualAnalysisDiagnostics,
  filePaneWidth,
  collapsedDirs,
  officePreviewRefreshingPath,
  renderFileIcon,
  renderFilePreview,
  fileTreeEntryTitle,
  formatPanelFileSize,
  previewFileActionPath,
  onLoadFileTree,
  onToggleDirectory,
  onOpenFile,
  onBeginFilePaneResize,
}: {
  fileTree?: WorkspaceFileTree;
  fileTreeError?: string;
  visibleEntries: WorkspaceFileEntry[];
  selectedFile?: WorkspaceFileContent;
  selectedFileError?: string;
  openTargets: WorkspaceOpenTarget[];
  openTargetsError?: string;
  visualAnalysisBusy?: string;
  visualAnalysisStatus?: ApiKeyStatus;
  visualAnalysisDiagnostics: MiniCpmVisionDiagnosticItem[];
  filePaneWidth: number;
  collapsedDirs: Set<string>;
  officePreviewRefreshingPath?: string;
  renderFileIcon: (entry: WorkspaceFileEntry) => ReactNode;
  renderFilePreview: (input: {
    file: WorkspaceFileContent;
    openTargets: WorkspaceOpenTarget[];
    visualAnalysisBusy?: string;
    officePreviewRefreshing: boolean;
  }) => ReactNode;
  fileTreeEntryTitle: (entry: WorkspaceFileEntry) => string;
  formatPanelFileSize: (size: number) => string;
  previewFileActionPath: (file: WorkspaceFileContent) => string;
  onLoadFileTree: () => void | Promise<void>;
  onToggleDirectory: (path: string) => void;
  onOpenFile: (path: string) => void | Promise<void>;
  onBeginFilePaneResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="files-panel">
      <div className="files-toolbar">
        <button type="button" className="panel-button icon-panel-button" onClick={() => void onLoadFileTree()}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>
      {fileTreeError ? (
        <p className="panel-note">{fileTreeError}</p>
      ) : fileTree ? (
        <div className="files-layout" style={{ gridTemplateColumns: `${filePaneWidth}px 7px minmax(190px, 1fr)` }}>
          <div className="file-tree">
            <div className="file-root">{fileTree.rootName}</div>
            {visibleEntries.map((entry) => (
              <button
                type="button"
                className={`file-row ${entry.type} ${selectedFile?.source !== "local" && selectedFile?.path === entry.path ? "selected" : ""}`}
                key={entry.path}
                style={{ paddingLeft: 8 + entry.depth * 14 }}
                onClick={() => (entry.type === "directory" ? onToggleDirectory(entry.path) : void onOpenFile(entry.path))}
                title={fileTreeEntryTitle(entry)}
              >
                <span>
                  {entry.type === "directory" ? (
                    collapsedDirs.has(entry.path) ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )
                  ) : (
                    renderFileIcon(entry)
                  )}
                </span>
                <strong>{entry.name}</strong>
                {entry.symlink && <small>{entry.symlinkStatus === "outside-workspace" ? "blocked link" : "link"}</small>}
                {entry.size !== undefined && <small>{formatPanelFileSize(entry.size)}</small>}
              </button>
            ))}
            {fileTree.truncated && <p className="panel-note">File list truncated.</p>}
          </div>
          <div
            className="file-pane-resize-handle"
            role="separator"
            aria-orientation="vertical"
            title="Resize file preview"
            onMouseDown={onBeginFilePaneResize}
          />
          <div className="file-preview-pane">
            {selectedFileError && <p className="panel-status error">{selectedFileError}</p>}
            {openTargetsError && <p className="panel-note">{openTargetsError}</p>}
            {visualAnalysisStatus && <p className={`panel-status ${visualAnalysisStatus.kind}`}>{visualAnalysisStatus.message}</p>}
            <MiniCpmVisionDiagnosticsList diagnostics={visualAnalysisDiagnostics} compact />
            {selectedFile ? (
              renderFilePreview({
                file: selectedFile,
                openTargets,
                visualAnalysisBusy,
                officePreviewRefreshing: officePreviewRefreshingPath === previewFileActionPath(selectedFile),
              })
            ) : (
              <div className="file-preview-empty">
                <FileText size={22} />
                <span>Select a file to preview it.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="panel-note">Loading files...</p>
      )}
    </div>
  );
}
