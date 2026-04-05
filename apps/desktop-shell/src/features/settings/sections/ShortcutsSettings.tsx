import { Keyboard } from "lucide-react";
import { SettingGroup } from "../components/SettingGroup";
import { getShortcutsList } from "@/features/session-workbench/useKeyboardShortcuts";

export function ShortcutsSettings() {
  const shortcuts = getShortcutsList();

  return (
    <div className="space-y-4">
      <SettingGroup
        title="Keyboard Shortcuts"
        description="Global shortcuts available in the session workbench"
      >
        <div className="divide-y divide-border/50">
          {shortcuts.map((shortcut) => (
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
            Shortcuts are active when the session workbench is focused.
            Press <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-0.5 font-mono text-caption">/</kbd> in
            the input bar to access slash commands.
          </div>
        </div>
      </div>
    </div>
  );
}
