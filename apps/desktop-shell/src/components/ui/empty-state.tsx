/**
 * R1 sprint — shared `EmptyState` primitive for Ask / Maintainer / Graph /
 * Raw / Wiki / WeChat surfaces. Rendered whenever a data-bearing panel has
 * no items yet (fresh install, empty filter, scoped-to-nothing view, etc.)
 * so the user sees a consistent affordance with recovery CTAs instead of
 * a blank pane.
 *
 * Two size variants cover the main placements:
 *
 *   - `full`    page-level empty state (AskPage before first session, Wiki
 *               before any concept page exists). Big icon, roomy padding.
 *   - `compact` panel-level empty state (right rail filters, sidebar lists).
 *               Smaller footprint so it doesn't dominate a narrow column.
 *
 * The API is consciously small: one `title`, an optional `description`
 * (ReactNode so callers can inline links), and up to two CTAs that render
 * as either `<button>` or `<a>` depending on whether `href` is given.
 *
 * Shared with Worker B (Ask / Maintainer) and Worker C (Graph / Raw / Wiki
 * / WeChat). Worker A only ships the primitive — no feature wiring here.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  /** When set, renders as an `<a>` instead of a `<button>`. */
  href?: string;
}

export interface EmptyStateProps {
  /** Optional icon — shown large at top, muted. Accepts a Lucide component
   *  reference (`BookOpen`) or an already-rendered node (`<FooIcon />`). */
  icon?: LucideIcon | React.ReactNode;
  /** Primary message, e.g. "还没有素材入库". */
  title: string;
  /** Secondary explanation — can be a string or ReactNode for rich
   *  formatting (links, inline code, etc.). */
  description?: React.ReactNode;
  /** Primary CTA to a recovery action. */
  primaryAction?: EmptyStateAction;
  /** Secondary CTA (optional). */
  secondaryAction?: EmptyStateAction;
  /** Size variant — "compact" for panels, "full" for page-level empty. */
  size?: "compact" | "full";
  className?: string;
}

function isLucideIcon(
  icon: EmptyStateProps["icon"],
): icon is LucideIcon {
  // Lucide icons are either plain function components (React <19
  // convention) or `forwardRef` ForwardRefExoticComponent objects
  // (React ≥19 + lucide >=0.3). The latter looks like `{ $$typeof,
  // render }` — if we pass THAT directly as a React child, React
  // throws "Objects are not valid as a React child (found: object
  // with keys {$$typeof, render})". Detect both shapes so callers
  // can write `icon={Link2}` regardless of lucide's build mode.
  if (typeof icon === "function") return true;
  if (
    typeof icon === "object" &&
    icon !== null &&
    "$$typeof" in icon &&
    "render" in icon
  ) {
    return true;
  }
  return false;
}

function ActionButton({
  action,
  variant,
  size,
}: {
  action: EmptyStateAction;
  variant: "default" | "outline";
  size: "sm" | "default";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} size={size}>
        <a href={action.href} onClick={action.onClick}>
          {action.label}
        </a>
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  size = "full",
  className,
}: EmptyStateProps): React.ReactElement {
  const isFull = size === "full";

  const renderedIcon: React.ReactNode = isLucideIcon(icon)
    ? React.createElement(icon, {
        className: cn(
          isFull ? "size-12 opacity-15" : "size-8 opacity-20",
          "text-muted-foreground",
        ),
        "aria-hidden": true,
      })
    : icon;

  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isFull ? "py-16 px-6" : "py-8 px-4",
        className,
      )}
    >
      {renderedIcon ? (
        <div
          className={cn(
            "flex items-center justify-center",
            isFull ? "mb-4" : "mb-2",
          )}
        >
          {renderedIcon}
        </div>
      ) : null}
      <div
        className={cn(
          "font-medium text-foreground",
          isFull ? "text-[15px]" : "text-[13px]",
        )}
      >
        {title}
      </div>
      {description ? (
        <div
          className={cn(
            "mt-1 max-w-md text-muted-foreground",
            isFull ? "text-[13px]" : "text-[11px]",
          )}
        >
          {description}
        </div>
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-2",
            isFull ? "mt-4" : "mt-2",
          )}
        >
          {primaryAction ? (
            <ActionButton
              action={primaryAction}
              variant="default"
              size={isFull ? "default" : "sm"}
            />
          ) : null}
          {secondaryAction ? (
            <ActionButton
              action={secondaryAction}
              variant="outline"
              size={isFull ? "default" : "sm"}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
