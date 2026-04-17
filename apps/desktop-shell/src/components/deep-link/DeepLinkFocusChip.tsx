/**
 * DeepLinkFocusChip — visible "currently focused" indicator.
 *
 * Shown when a page has a deep-link selection (Raw ?entry=N, Inbox
 * ?task=N) so the user can see at a glance:
 *   1. They're in a focused view, not the default list
 *   2. How to clear the focus (the X button)
 *   3. Optional secondary actions (e.g. copy link) via `action` slot
 *
 * Intentionally thin: the chip owns zero business state. Parent page
 * passes label children, clear handler, and optional action slot. Any
 * copy-link / share / bookmark affordance is composed from outside,
 * keeping the chip reusable.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DeepLinkFocusChipProps {
  /**
   * Chip label content. Usually an icon + label + id fragment, e.g.
   *   <><Target className="size-3" />正在聚焦 #00005</>
   */
  children: ReactNode;
  /** Click handler for the clear-focus (×) button. */
  onClear: () => void;
  /** Accessible label for the × button (defaults to "清除聚焦"). */
  clearLabel?: string;
  /**
   * Optional action slot rendered between the label and the × button.
   * Typical contents: a ghost "copy link" icon button.
   */
  action?: ReactNode;
  /** Tailwind class overrides for the outer wrapper. */
  className?: string;
}

export function DeepLinkFocusChip({
  children,
  onClear,
  clearLabel = "清除聚焦",
  action,
  className,
}: DeepLinkFocusChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-accent/40 px-2.5 py-1 text-foreground/80 shadow-sm backdrop-blur-sm",
        className,
      )}
      style={{ fontSize: 11 }}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        {children}
      </span>
      {action ? (
        <>
          <span
            aria-hidden="true"
            className="h-3 w-px bg-border/60"
          />
          {action}
        </>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        title={clearLabel}
        className="-mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
