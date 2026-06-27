import { Command } from "lucide-react";
import { useState } from "react";

export type CommandPaletteItem = {
  id: string;
  label: string;
  detail: string;
  run: () => void | Promise<void>;
};

type CommandPaletteSelectionState = {
  query: string;
  index: number;
};

export function CommandPalette({
  query,
  commands,
  onQueryChange,
  onRun,
  onClose,
}: {
  query: string;
  commands: CommandPaletteItem[];
  onQueryChange: (query: string) => void;
  onRun: (command: CommandPaletteItem) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<CommandPaletteSelectionState>(() => ({ query, index: 0 }));
  const filteredCommands = commands.filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedIndex = selection.query === query ? selection.index : 0;
  const selectedCommand = filteredCommands[Math.min(selectedIndex, filteredCommands.length - 1)];

  const setSelectedIndexForQuery = (update: number | ((index: number) => number)) => {
    setSelection((current) => {
      const currentIndex = current.query === query ? current.index : 0;
      const nextIndex = typeof update === "function" ? update(currentIndex) : update;
      return { query, index: nextIndex };
    });
  };

  return (
    <div className="modal-backdrop command-backdrop" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <Command size={17} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndexForQuery((index) => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndexForQuery((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && selectedCommand) {
                event.preventDefault();
                onRun(selectedCommand);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Command"
            autoFocus
          />
        </div>
        <div className="command-list">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((command, index) => (
              <button
                type="button"
                className={`command-row ${index === selectedIndex ? "selected" : ""}`}
                key={command.id}
                onMouseEnter={() => setSelectedIndexForQuery(index)}
                onClick={() => onRun(command)}
              >
                <strong>{command.label}</strong>
                <span>{command.detail}</span>
              </button>
            ))
          ) : (
            <p>No matches.</p>
          )}
        </div>
      </section>
    </div>
  );
}
