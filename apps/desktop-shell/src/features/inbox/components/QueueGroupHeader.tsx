/**
 * QueueGroupHeader — sticky, tone-tinted header emitted once per
 * non-empty queue-intelligence group.
 *
 * Shows `[icon] [label] · [count] 条`. When the list is in batch
 * mode, an additional "全选本组" / "取消本组" pill appears on the
 * right so the user can bulk-toggle a whole bucket (particularly
 * useful for suggest_reject cleanup runs).
 *
 * The toggle uses Set semantics against the caller-owned
 * `selectedIds` Set; parent logic in `InboxPage` decides whether
 * the current state maps to "all selected" or "partial" and calls
 * the matching handler.
 */

import {
  FileEdit,
  Edit,
  Plus,
  HelpCircle,
  XCircle,
  Archive,
  type LucideIcon,
} from "lucide-react";

import {
  GROUP_META,
  type RecommendedAction,
} from "@/features/inbox/queue-intelligence";

export interface QueueGroupHeaderProps {
  action: RecommendedAction;
  count: number;
  batchMode: boolean;
  /** Ids currently present in `selectedIds` AND in this group. */
  selectedInGroup: number[];
  /** All entry ids in this group. */
  allIds: number[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

const ICON_MAP: Record<
  (typeof GROUP_META)[RecommendedAction]["icon"],
  LucideIcon
> = {
  FileEdit,
  Edit,
  Plus,
  HelpCircle,
  XCircle,
  Archive,
};

const TONE_COLOR: Record<
  (typeof GROUP_META)[RecommendedAction]["tone"],
  string
> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  info: "var(--color-info, oklch(0.60 0.13 220))",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
  muted: "var(--muted-foreground)",
};

export function QueueGroupHeader({
  action,
  count,
  batchMode,
  selectedInGroup,
  allIds,
  onSelectAll,
  onDeselectAll,
}: QueueGroupHeaderProps) {
  const meta = GROUP_META[action];
  const IconComp = ICON_MAP[meta.icon];
  const color = TONE_COLOR[meta.tone];

  // All-selected when every id in the group is in selectedInGroup.
  // We compare length first (cheap) then fall through to set
  // membership — allIds is O(n) small here (never > a few dozen).
  const allSelected =
    allIds.length > 0 && selectedInGroup.length === allIds.length;

  return (
    <li
      className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/40 bg-background/95 px-3 py-1.5 backdrop-blur"
      role="presentation"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <IconComp
          className="size-3 shrink-0"
          style={{ color }}
          aria-hidden
        />
        <span
          className="truncate font-medium"
          style={{ fontSize: 11, color }}
        >
          {meta.label}
        </span>
        <span
          className="shrink-0 text-muted-foreground/50"
          style={{ fontSize: 10 }}
        >
          · {count} 条
        </span>
      </div>
      {batchMode && count > 0 ? (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            if (allSelected) {
              onDeselectAll();
            } else {
              onSelectAll();
            }
          }}
          className="shrink-0 rounded-md border border-border/40 px-1.5 py-0.5 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          style={{ fontSize: 10 }}
          title={allSelected ? "取消本组选择" : "全选本组"}
        >
          {allSelected ? "取消本组" : "全选本组"}
        </button>
      ) : null}
    </li>
  );
}
