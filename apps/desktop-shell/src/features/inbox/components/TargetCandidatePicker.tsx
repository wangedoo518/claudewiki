/**
 * Q2 sprint — `TargetCandidatePicker` surfaces server-ranked target
 * suggestions (the `TargetCandidate` vocabulary defined by Worker C)
 * above the Wiki-page search field inside `MaintainActionRadio`'s
 * `update_existing` branch. The intent is to promote a high-signal
 * recommendation to a one-click action while keeping manual search as
 * an always-visible fallback.
 *
 * Layout (top → bottom):
 *   - Top-1 primary card  (highlighted, `onSelect(slug)` on click)
 *   - Collapsible revealing top-2 + top-3 alternates
 *   - Empty state (`EmptyState size="compact"`) when zero candidates
 *
 * Each row displays `slug · title · tier badge · reason detail` with
 * an `InfoTooltip` exposing the full `reasons[]` list. Selection never
 * mutates state inside the picker — the parent owns `targetPageSlug`.
 *
 * The `TargetCandidate` vocabulary lives in `@/lib/tauri` (generated
 * from the Rust wire types by Worker A). Consumers (DuplicateGuard*,
 * InboxPage) should import the types from there directly rather than
 * transiting through this file.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type {
  CandidateTier,
  TargetCandidate,
} from "@/lib/tauri";

export interface TargetCandidatePickerProps {
  /** Server-ranked list, sorted by `score desc`. Empty list allowed. */
  candidates: TargetCandidate[];
  /** Called when the user confirms a candidate slug. */
  onSelect: (slug: string) => void;
  /** Currently-selected slug — shown as a "已选" marker. */
  selectedSlug?: string | null;
  /** Disables all rows when a mutation is in flight. */
  disabled?: boolean;
}

export function TargetCandidatePicker({
  candidates,
  onSelect,
  selectedSlug,
  disabled = false,
}: TargetCandidatePickerProps) {
  const [expanded, setExpanded] = useState(false);

  if (candidates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/40">
        <EmptyState
          size="compact"
          title="无系统推荐，请手搜"
          description="下方搜索框可按标题/关键词检索任意 Wiki 页。"
        />
      </div>
    );
  }

  const [primary, ...rest] = candidates;
  const alternates = rest.slice(0, 2);
  const hasAlternates = alternates.length > 0;

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between font-mono uppercase tracking-widest text-muted-foreground/60"
        style={{ fontSize: 10 }}
      >
        <span>候选目标 / Candidates</span>
        <span className="text-muted-foreground/40">
          共 {candidates.length} 条
        </span>
      </div>

      <CandidateRow
        candidate={primary}
        primary
        selected={primary.slug === selectedSlug}
        onSelect={onSelect}
        disabled={disabled}
      />

      {hasAlternates && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            style={{ fontSize: 11 }}
          >
            {expanded ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <ChevronRight className="size-3" aria-hidden />
            )}
            {expanded ? "收起备选" : `展开备选 (${alternates.length})`}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-2">
            {alternates.map((cand) => (
              <CandidateRow
                key={cand.slug}
                candidate={cand}
                primary={false}
                selected={cand.slug === selectedSlug}
                onSelect={onSelect}
                disabled={disabled}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/* ── Internal row ───────────────────────────────────────────────── */

const TIER_TOKENS: Record<
  CandidateTier,
  { label: string; color: string }
> = {
  strong: { label: "强匹配", color: "var(--color-success)" },
  likely: {
    label: "可能",
    color: "var(--color-info, oklch(0.60 0.13 220))",
  },
  weak: { label: "弱匹配", color: "var(--muted-foreground)" },
};

function CandidateRow({
  candidate,
  primary,
  selected,
  onSelect,
  disabled,
}: {
  candidate: TargetCandidate;
  primary: boolean;
  selected: boolean;
  onSelect: (slug: string) => void;
  disabled: boolean;
}) {
  const tier = TIER_TOKENS[candidate.tier];
  const topReason = candidate.reasons[0];
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onSelect(candidate.slug);
      }}
      onKeyDown={(ev) => {
        if (disabled) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelect(candidate.slug);
        }
      }}
      aria-disabled={disabled}
      className={
        "block w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors " +
        (primary
          ? "border-primary/50 bg-primary/10 hover:bg-primary/15"
          : "border-border/40 bg-background hover:border-border hover:bg-accent/30") +
        (selected ? " ring-1 ring-primary/50" : "") +
        (disabled ? " pointer-events-none opacity-60" : "")
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="font-mono text-foreground/80"
              style={{ fontSize: 11 }}
            >
              {candidate.slug}
            </span>
            <span
              className="rounded-full border px-1.5 py-0.5 font-medium"
              style={{
                fontSize: 10,
                borderColor: `color-mix(in srgb, ${tier.color} 40%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${tier.color} 10%, transparent)`,
                color: tier.color,
              }}
              title={`相似度 ${candidate.score}`}
            >
              {tier.label} · {candidate.score}
            </span>
            {selected && (
              <span
                className="inline-flex items-center gap-0.5 text-primary"
                style={{ fontSize: 10 }}
              >
                <Check className="size-2.5" aria-hidden />
                已选
              </span>
            )}
          </div>
          <div
            className="mt-0.5 truncate text-foreground"
            style={{ fontSize: 13, fontWeight: primary ? 500 : 400 }}
          >
            {candidate.title}
          </div>
          {topReason ? (
            <div
              className="mt-0.5 flex items-center gap-1 text-muted-foreground/80"
              style={{ fontSize: 11 }}
            >
              <span className="truncate">{topReason.detail}</span>
              {candidate.reasons.length > 1 && (
                <InfoTooltip side="right">
                  <div
                    className="space-y-1"
                    style={{ fontSize: 11, lineHeight: 1.5 }}
                  >
                    <div className="font-medium text-foreground">
                      匹配依据 · {candidate.reasons.length} 项
                    </div>
                    <ul className="space-y-0.5 text-muted-foreground/90">
                      {candidate.reasons.map((r, idx) => (
                        <li key={`${r.code}-${idx}`}>
                          <span className="font-mono text-muted-foreground/60">
                            [{r.code}]
                          </span>{" "}
                          {r.detail}
                          <span className="ml-1 text-muted-foreground/50">
                            (w {r.weight})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </InfoTooltip>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
