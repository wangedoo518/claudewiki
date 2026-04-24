/**
 * W3 sprint — combined merge proposal rules.
 *
 * Pure functions that encode the contract for when a batch of inbox
 * entries is eligible to be merged into a single wiki page update.
 * These rules are enforced at three layers:
 *
 *   1. Frontend (BatchActionsToolbar) — show / hide the "一并更新" button
 *   2. Frontend (CombinedPreviewDialog) — gate the Apply button
 *   3. Backend (desktop-server handlers) — defense in depth before LLM call
 *
 * The MVP constants live here so all 3 layers stay in sync.
 */

import type { InboxEntry } from "@/api/wiki/types";
import type { QueueIntelligence } from "@/features/inbox/queue-intelligence";
import type { TargetCandidate } from "@/lib/tauri";

/** Inclusive min count of inbox items a bundle needs. */
export const BUNDLE_MIN_SIZE = 2;

/** Inclusive max count of inbox items the LLM + UI will handle. */
export const BUNDLE_MAX_SIZE = 6;

export type BundleEligibility =
  | { ok: true; targetSlug: string }
  | { ok: false; reason: BundleIneligibleReason };

export type BundleIneligibleReason =
  | { code: "too_few"; needed: number; actual: number }
  | { code: "too_many"; max: number; actual: number }
  | { code: "mixed_targets"; foundSlugs: string[] }
  | { code: "no_target"; inboxIdsWithoutTarget: number[] }
  | { code: "not_pending"; nonPendingIds: number[] };

/**
 * Compute whether a set of inbox entries can form a valid combined
 * bundle. Returns either `{ok: true, targetSlug}` or a structured
 * ineligibility reason (used by UI for the disabled-button hint).
 *
 * Check order is intentional — size gates fire first so callers don't
 * surface spurious `mixed_targets` hints when the user has only
 * selected one entry. `not_pending` precedes target checks so an
 * already-resolved entry short-circuits with the most actionable
 * message ("task isn't pending").
 */
export function computeBundleEligibility(
  entries: Array<InboxEntry & { intelligence?: QueueIntelligence }>,
): BundleEligibility {
  if (entries.length < BUNDLE_MIN_SIZE) {
    return {
      ok: false,
      reason: { code: "too_few", needed: BUNDLE_MIN_SIZE, actual: entries.length },
    };
  }
  if (entries.length > BUNDLE_MAX_SIZE) {
    return {
      ok: false,
      reason: { code: "too_many", max: BUNDLE_MAX_SIZE, actual: entries.length },
    };
  }

  const nonPending = entries.filter((e) => e.status !== "pending").map((e) => e.id);
  if (nonPending.length > 0) {
    return { ok: false, reason: { code: "not_pending", nonPendingIds: nonPending } };
  }

  const withoutTarget: number[] = [];
  const slugSet = new Set<string>();
  for (const e of entries) {
    const slug = e.intelligence?.target_candidate?.slug;
    if (!slug) withoutTarget.push(e.id);
    else slugSet.add(slug);
  }

  if (withoutTarget.length > 0) {
    return {
      ok: false,
      reason: { code: "no_target", inboxIdsWithoutTarget: withoutTarget },
    };
  }

  if (slugSet.size > 1) {
    return {
      ok: false,
      reason: { code: "mixed_targets", foundSlugs: [...slugSet].sort() },
    };
  }

  return { ok: true, targetSlug: [...slugSet][0] };
}

/**
 * Derive a short Chinese hint to show under a disabled "一并更新"
 * button, explaining why the merge isn't possible right now. Kept
 * short enough to fit inline under a 160px button without wrapping to
 * more than two lines.
 */
export function formatIneligibilityHint(reason: BundleIneligibleReason): string {
  switch (reason.code) {
    case "too_few":
      return `至少选择 ${reason.needed} 条任务`;
    case "too_many":
      return `一次最多合并 ${reason.max} 条`;
    case "mixed_targets":
      return `选中的任务指向不同目标页 (${reason.foundSlugs.slice(0, 3).join(", ")}...)`;
    case "no_target":
      return `有 ${reason.inboxIdsWithoutTarget.length} 条任务无目标页候选`;
    case "not_pending":
      return `有 ${reason.nonPendingIds.length} 条任务不在待处理状态`;
  }
}

/**
 * Sort bundle inbox ids by Q2 target_candidate.score (desc), with id
 * asc as stable fallback. Used for rendering the items list in
 * CombinedPreviewDialog in descending relevance order.
 *
 * `scoreFor` is a lookup function rather than a map so callers can
 * wire it to whatever their live Q2 candidate store exposes without
 * having to materialise a keyed record first.
 */
export function sortBundleByScore(
  ids: number[],
  scoreFor: (id: number) => number | undefined,
): number[] {
  return [...ids].sort((a, b) => {
    const sa = scoreFor(a) ?? 0;
    const sb = scoreFor(b) ?? 0;
    if (sb !== sa) return sb - sa;
    return a - b;
  });
}

// ─── Re-exports for parity with tauri.ts ────────────────────────────
//
// `TargetCandidate` is imported above only so its shape can be used
// in downstream type guards (e.g. "this entry's intelligence points
// at a `TargetCandidate.slug`"). Re-exporting keeps the import graph
// shallow for consumers that already pull from this module.

export type { TargetCandidate };
