/**
 * ChatSidePanel — compact chat panel on the right side of Wiki mode.
 * Per component-spec.md §4 and ia-layout.md §4.
 *
 * 320px wide, can be collapsed to 0.
 * Compact message list (8px gap) + single-line composer.
 * Shares session with the full Chat Tab via localStorage activeSessionId.
 */

import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useSettingsStore } from "@/state/settings-store";

interface ChatSidePanelProps {
  /** Only visible in wiki mode. */
  visible: boolean;
}

export function ChatSidePanel({ visible }: ChatSidePanelProps) {
  const collapsed = useSettingsStore((s) => s.chatPanelCollapsed);
  const setCollapsed = useSettingsStore((s) => s.setChatPanelCollapsed);

  if (!visible) return null;

  const panelWidth = collapsed ? 0 : 320;

  return (
    <div
      className="relative flex flex-col border-l border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden"
      style={{
        width: panelWidth,
        minWidth: collapsed ? 0 : 320,
        transition: "width 200ms linear, min-width 200ms linear",
      }}
    >
      {/* Collapse button — component-spec.md §4.4 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute left-0 top-1/2 z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] shadow-sm hover:bg-[var(--color-accent)]"
        style={{ boxShadow: "var(--deeptutor-shadow-sm, 0 1px 3px rgba(45,43,40,0.04))" }}
      >
        {collapsed ? (
          <ChevronLeft className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div className="flex h-10 items-center border-b border-[var(--color-border)] px-3">
            <span className="text-[12px] font-semibold text-[var(--color-foreground)]">
              Ask
            </span>
          </div>

          {/* Message area — compact spacing (8px gap vs 12px) */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2 text-[13px] leading-[1.5] text-[var(--color-muted-foreground)]">
              <p className="text-center text-[12px]">
                在这里向你的外脑提问...
              </p>
            </div>
          </div>

          {/* Compact Composer — component-spec.md §4.3 */}
          <div className="border-t border-[var(--color-border)] p-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="问点什么..."
                className="h-9 flex-1 rounded-lg bg-[var(--color-secondary)] px-3 text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none"
              />
              <button className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
                <Send className="size-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
