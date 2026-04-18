/**
 * RecommendedActionBadge — pill-shaped tag rendered on every Inbox
 * row to surface the queue-intelligence recommendation at a glance.
 *
 * Mirrors the visual rhythm of `IngestDecisionBadge` (compact icon +
 * Chinese label, tone-tinted border + faint fill) so the two badges
 * sit well together on the same row without fighting for weight.
 *
 * The tone vocabulary maps onto the shared design-system colour
 * tokens (`--color-primary` / `--color-success` / `--color-info` /
 * `--color-warning` / `--color-error`) plus a muted neutral fallback
 * so the pill stays on-brand in both light and dark themes.
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

export interface RecommendedActionBadgeProps {
  action: RecommendedAction;
  /** Slightly smaller text for list rows. */
  compact?: boolean;
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

export function RecommendedActionBadge({
  action,
  compact = false,
}: RecommendedActionBadgeProps) {
  const meta = GROUP_META[action];
  const IconComp = ICON_MAP[meta.icon];
  const color = TONE_COLOR[meta.tone];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium"
      style={{
        fontSize: compact ? 10 : 11,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
      }}
      title={meta.label}
    >
      <IconComp className={compact ? "size-2.5" : "size-3"} aria-hidden />
      {meta.label}
    </span>
  );
}
