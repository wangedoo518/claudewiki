/**
 * DeepLinkNotFoundBanner — user-visible degradation for invalid /
 * stale deep-link ids.
 *
 * Triggered when a page has a non-empty deep-link param but the
 * underlying query has finished loading and the target id is not in
 * the list (deleted, migrated away, never existed, wrong id typed).
 *
 * Per F2 stop-A contract §4.4: do NOT silently strip the URL. Instead
 * tell the user "the thing you pointed at is gone" so they understand
 * why the page looks empty, and give them a single explicit action
 * to return to the default view.
 */

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface DeepLinkNotFoundBannerProps {
  /**
   * Main message shown to the user. Concise. Example:
   *   "该素材不存在或已被删除"
   */
  message: string;
  /**
   * Optional extra detail shown beneath the message (e.g. the invalid
   * id). Keep under one short sentence.
   */
  detail?: ReactNode;
  /** Click handler for the clear-focus / return-to-list button. */
  onClear: () => void;
  /** Button label (defaults to "清除聚焦并返回列表"). */
  clearLabel?: string;
  /** Tailwind overrides for the outer wrapper. */
  className?: string;
}

export function DeepLinkNotFoundBanner({
  message,
  detail,
  onClear,
  clearLabel = "清除聚焦并返回列表",
  className,
}: DeepLinkNotFoundBannerProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2",
        className,
      )}
      style={{
        borderColor: "color-mix(in srgb, var(--color-warning) 35%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-warning) 6%, transparent)",
      }}
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle
        className="size-4 shrink-0"
        style={{ color: "var(--color-warning)", marginTop: 2 }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div
          className="text-foreground/90"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          {message}
        </div>
        {detail ? (
          <div
            className="mt-0.5 text-muted-foreground/70"
            style={{ fontSize: 11 }}
          >
            {detail}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 self-center rounded-md border border-border/60 bg-background/60 px-2.5 py-1 text-foreground/80 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ fontSize: 11, fontWeight: 500 }}
      >
        {clearLabel}
      </button>
    </div>
  );
}
