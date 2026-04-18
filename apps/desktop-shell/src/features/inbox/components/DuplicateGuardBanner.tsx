/**
 * Q2 sprint — `DuplicateGuardBanner` is Layer 1 of the duplicate-concept
 * guard. When the user selects `create_new` but the top candidate score
 * is ≥ 75, we surface an ambient, *dismissible* warning advising them
 * to consider updating the existing page instead. This is the gentle
 * nudge layer: it does not block the user, never calls the guard an
 * "error", and never says "禁止". The tone is "发现可能 / 建议 / 是否".
 *
 * Built on the shared `FailureBanner` primitive with `severity="warning"`.
 * The two CTAs map 1:1 onto the parent's intent:
 *   - 切换到更新 → `onSwitchToUpdate()` (parent flips action + seeds slug)
 *   - 忽略       → `onDismiss()` (parent sets `guardDismissed = true`)
 *
 * Layer 2 (modal dialog) is handled by `DuplicateGuardDialog` — this
 * banner is purely ambient.
 */

import { FailureBanner } from "@/components/ui/failure-banner";
import type { TargetCandidate } from "@/lib/tauri";

export interface DuplicateGuardBannerProps {
  /** Top-1 candidate — score already known to be ≥ 75 by the caller. */
  candidate: TargetCandidate;
  /** Switch the maintain action back to `update_existing` + seed the slug. */
  onSwitchToUpdate: () => void;
  /** Dismiss the banner (sticks for the entry's lifetime). */
  onDismiss: () => void;
}

export function DuplicateGuardBanner({
  candidate,
  onSwitchToUpdate,
  onDismiss,
}: DuplicateGuardBannerProps) {
  return (
    <FailureBanner
      severity="warning"
      title="发现可能已有相近页"
      description={
        <>
          最相似的页面是
          <span className="mx-1 font-medium text-foreground">
            「{candidate.title}」
          </span>
          （相似度 {candidate.score}%，
          <span className="font-mono text-muted-foreground/80">
            {candidate.slug}
          </span>
          ）。是否要更新该页而非新建？
        </>
      }
      actions={[
        {
          label: "切换到更新",
          variant: "primary",
          onClick: onSwitchToUpdate,
        },
        {
          label: "忽略",
          variant: "secondary",
          onClick: onDismiss,
        },
      ]}
    />
  );
}
