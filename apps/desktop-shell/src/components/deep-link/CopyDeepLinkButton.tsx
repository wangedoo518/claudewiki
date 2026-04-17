/**
 * CopyDeepLinkButton — shared "copy current URL" control.
 *
 * Used by Raw and Inbox pages (and any future feature that exposes a
 * focused view through a URL query param). Handles:
 *   - `navigator.clipboard.writeText(window.location.href)` in one call
 *     via the shared `copyCurrentUrl` helper
 *   - 3-state feedback (idle / copied / error) with a 1.5s flash
 *   - `compact` vs `full` visual presentations so the same component
 *     can live inside a chip's `action` slot (icon-only) or in a
 *     metadata strip (icon + label)
 *
 * The component owns its own transient feedback state; consumers only
 * need to pick a variant. No business data is threaded through.
 */

import { useState } from "react";
import { Check, Link2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { copyCurrentUrl } from "@/lib/deep-link";

interface CopyDeepLinkButtonProps {
  /**
   * Visual variant:
   *   - "full"   (default) — icon + label text ("复制链接" / "已复制" / "复制失败")
   *   - "compact"          — icon-only round button, suitable for a
   *                          DeepLinkFocusChip `action` slot
   */
  variant?: "full" | "compact";
  /** Extra class overrides for the outer button. */
  className?: string;
}

const DEFAULT_TITLE = "复制深链（本机可用）";
const ERROR_TITLE = "复制失败";

export function CopyDeepLinkButton({
  variant = "full",
  className,
}: CopyDeepLinkButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const handleClick = async () => {
    const ok = await copyCurrentUrl();
    setState(ok ? "copied" : "error");
    window.setTimeout(() => setState("idle"), 1500);
  };

  const icon =
    state === "copied" ? (
      <Check className="size-3" />
    ) : state === "error" ? (
      <X className="size-3" />
    ) : (
      <Link2 className="size-3" />
    );

  const title = state === "error" ? ERROR_TITLE : DEFAULT_TITLE;

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={title}
        aria-label="复制深链"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
        style={{
          color:
            state === "copied"
              ? "var(--color-success)"
              : state === "error"
                ? "var(--color-warning)"
                : undefined,
        }}
      >
        {icon}
      </button>
    );
  }

  const label =
    state === "copied" ? "已复制" : state === "error" ? "复制失败" : "复制链接";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      style={{
        fontSize: 11,
        color:
          state === "copied"
            ? "var(--color-success)"
            : state === "error"
              ? "var(--color-warning)"
              : undefined,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
