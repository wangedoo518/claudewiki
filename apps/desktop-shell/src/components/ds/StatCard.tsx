/**
 * StatCard — shared stat chip. Two layouts out of the box:
 *
 *   "row"      → icon | label + (value, hint) | ArrowRight  (Dashboard)
 *   "compact"  → icon + label on top · large value below      (Codex pool)
 *
 * v2 kit source: no dedicated kit file (Home.jsx reuses SkillCard for
 * stats; audit DS1.7-A §3 called this out as the single biggest
 * duplicate). This component merges two pre-DS1.7 local impls:
 *
 *   - features/dashboard/DashboardPage.tsx SlimStat   (was L394-441)
 *   - features/settings/sections/private-cloud/
 *       SubscriptionCodexPool.tsx StatCard            (was L200-225)
 *
 * Layout `row` matches the DS token contract (shadow-warm-ring,
 * hover lift, chevron). Layout `compact` preserves the SubscriptionCodexPool
 * grid-cell shape where 4-5 stats share a narrow 2×2 / 4-col grid.
 *
 * Colour: `tone` for semantic states (warn = error left-bar / ok =
 * success-tinted value); `tint` for arbitrary custom colour (used by
 * Codex pool's per-state badges). `tone` and `tint` are orthogonal;
 * if both are passed, `tint` wins on the value text colour while
 * `tone` still drives the left border.
 */

import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type StatCardTone = "default" | "warn" | "ok";
export type StatCardLayout = "row" | "compact";

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  /** Router destination. If set, card renders as a clickable `<Link>`. */
  to?: string;
  /** Click handler. Renders as `<button>` when `to` is absent. */
  onClick?: () => void;
  /** Semantic accent — `warn` adds red left-border; `ok` greens the value. */
  tone?: StatCardTone;
  /** Custom value/icon colour (CSS color token). Overrides `tone`'s value colour. */
  tint?: string;
  /** Layout shape. Defaults to `"row"` (Dashboard). */
  layout?: StatCardLayout;
}

export function StatCard(props: StatCardProps) {
  const { layout = "row" } = props;
  if (layout === "compact") return <CompactStat {...props} />;
  return <RowStat {...props} />;
}

/** Row layout — horizontal icon | label + value | chevron. */
function RowStat({
  icon: Icon,
  label,
  value,
  hint,
  to,
  onClick,
  tone = "default",
  tint,
}: StatCardProps) {
  const body = (
    <div
      className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 shadow-warm-ring transition-shadow hover:shadow-warm-ring-hover"
      style={
        tone === "warn"
          ? { borderLeft: "3px solid var(--color-error)" }
          : tone === "ok"
            ? { borderLeft: "3px solid var(--color-success)" }
            : undefined
      }
    >
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        style={tint ? { color: tint } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="tabular-nums text-foreground"
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: tint ?? undefined,
            }}
          >
            {value}
          </span>
          {hint && (
            <span className="text-[11px] text-muted-foreground/60">{hint}</span>
          )}
        </div>
      </div>
      {(to || onClick) && (
        <ArrowRight
          className="size-3.5 shrink-0 text-muted-foreground/50"
          strokeWidth={1.5}
        />
      )}
    </div>
  );
  if (to) {
    return <Link to={to}>{body}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return body;
}

/** Compact layout — vertical icon+label above, large value below. */
function CompactStat({
  icon: Icon,
  label,
  value,
  hint,
  tint,
  tone = "default",
}: StatCardProps) {
  const valueColor =
    tint ??
    (tone === "warn"
      ? "var(--color-error)"
      : tone === "ok"
        ? "var(--color-success)"
        : "var(--color-foreground)");
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon
          className="size-3"
          style={tint ? { color: tint } : undefined}
        />
        {label}
      </div>
      <div
        className="text-subhead font-semibold tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-caption text-muted-foreground/60">
          {hint}
        </div>
      )}
    </div>
  );
}
