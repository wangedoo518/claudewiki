/**
 * Q2 sprint — `SharedTargetBadge` is a tiny muted pill rendered on
 * every inbox row whose `intelligence.target_candidate` points at a
 * slug that is *also* targeted by ≥ 2 entries in the same queue. It
 * lets the user spot cohorts of tasks that will all merge into the
 * same wiki page ("3 entries all targeting `react-hooks` → probably
 * review together"), matching the visual rhythm of `cohort_raw_id`.
 *
 * Purely presentational — no interaction in MVP. The parent computes
 * the per-slug count map once (via `useMemo` over the full entries
 * list) and passes the final `count` for this row's slug. When the
 * slug is absent or count < 2, the component renders `null`.
 */

import { ArrowRight } from "lucide-react";

export interface SharedTargetBadgeProps {
  /** Shared target slug. When null/empty, nothing renders. */
  slug: string | null | undefined;
  /** Number of queue entries targeting the same slug. */
  count: number;
}

export function SharedTargetBadge({
  slug,
  count,
}: SharedTargetBadgeProps) {
  if (!slug || count < 2) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border border-border/40 px-1.5 py-0.5 text-muted-foreground/70"
      style={{ fontSize: 10 }}
      title={`共有 ${count} 条任务指向同一目标页 ${slug}`}
    >
      <ArrowRight className="size-2.5" aria-hidden />
      <span className="font-mono">{slug}</span>
      <span className="text-muted-foreground/50"> × {count}</span>
    </span>
  );
}
