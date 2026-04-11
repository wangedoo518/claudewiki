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
  { keys: "Esc", description: "停止流式 / 关闭对话框" },
  { keys: "Ctrl+L", description: "清空消息" },
  { keys: "Ctrl+N", description: "新建会话" },
  { keys: "Ctrl+K", description: "聚焦输入框" },
  { keys: "Ctrl+,", description: "打开设置" },
  { keys: "Ctrl+Shift+S", description: "切换侧边栏" },
  { keys: "Ctrl+Shift+B", description: "切换维护任务树" },
];

export function ShortcutsSettings() {
  return (
    <div className="space-y-4">
      <SettingGroup
        title="键盘快捷键"
        description="在 Ask 对话页面中生效的快捷键"
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
            快捷键列表，供参考。
          </div>
        </div>
      </div>
    </div>
  );
}
