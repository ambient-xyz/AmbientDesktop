import { X } from "lucide-react";
import type { ReactNode } from "react";

export function rightPanelShellClassName(panel: string, browserFocused: boolean): string {
  return `right-panel ${panel === "files" ? "files-panel-host" : ""} ${panel === "settings" ? "settings-panel-host" : ""} ${
    panel === "browser" && browserFocused ? "browser-focused-panel" : ""
  }`;
}

export function RightPanelShell({
  panel,
  title,
  panelWidth,
  browserFocused,
  onClose,
  children,
}: {
  panel: string;
  title: string;
  panelWidth: number;
  browserFocused: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      className={rightPanelShellClassName(panel, browserFocused)}
      style={{ width: panelWidth }}
    >
      <div className="panel-title">
        <span>{title}</span>
        <button
          type="button"
          className="panel-close-button"
          title={`Close ${title} panel`}
          aria-label={`Close ${title} panel`}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="panel-body">{children}</div>
    </aside>
  );
}
