import { Keyboard } from "lucide-react";
import { SettingGroup } from "../components/SettingGroup";

// S0.4: shortcut list is inlined here. The original `getShortcutsList`
// helper lived in `features/session-workbench/useKeyboardShortcuts.ts`
// (deleted on cut day). S3 will rebuild a smaller Ask-specific
// keyboard-shortcut hook and this list can be re-derived from it.

interface ShortcutEntry {
  keys: string;
  description: string;
}

const ASK_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "Esc", description: "Stop streaming / close dialogs" },
  { keys: "Ctrl+L", description: "Clear messages" },
  { keys: "Ctrl+N", description: "New session" },
  { keys: "Ctrl+K", description: "Focus input" },
  { keys: "Ctrl+,", description: "Open settings" },
  { keys: "Ctrl+Shift+S", description: "Toggle sidebar" },
  { keys: "Ctrl+Shift+B", description: "Toggle Maintainer Task Tree" },
];

export function ShortcutsSettings() {
  return (
    <div className="space-y-4">
      <SettingGroup
        title="Keyboard Shortcuts"
        description="Shortcuts active inside the Ask page (CCD work-bench layer)"
      >
        <div className="divide-y divide-border/50">
          {ASK_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between py-2"
            >
              <span className="text-body text-foreground">
                {shortcut.description}
              </span>
              <kbd className="rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-label text-muted-foreground">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
      </SettingGroup>

      <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Keyboard
            className="mt-0.5 size-4 shrink-0"
            style={{ color: "var(--claude-blue)" }}
          />
          <div className="text-body-sm leading-relaxed text-muted-foreground">
            Shortcuts will become live once S3 rewires the Ask page to
            the ask_runtime backend. They are listed here as a reference
            so the canonical key-bindings stay documented through S0–S3.
          </div>
        </div>
      </div>
    </div>
  );
}
