/**
 * R1 sprint — shared `FailureBanner` primitive for user-facing error /
 * warning / info callouts. Replaces ad-hoc "red box with a raw RPC error"
 * patterns across Ask / Maintainer / Graph / Raw / Wiki / WeChat.
 *
 * The contract is intentionally user-centric:
 *
 *   - `title`           human-friendly summary (e.g. "🔐 还没连接大模型账号")
 *   - `description`     human-friendly body, ReactNode so links / inline
 *                       code can be embedded
 *   - `actions`         1–2 recovery CTAs (open settings, retry, etc.)
 *   - `technicalDetail` raw error text, hidden under a collapsible
 *                       `<details>` so devs can still inspect it without
 *                       the end-user seeing the stack trace by default
 *   - `dismissible`     adds an "× 忽略" button that fires `onDismiss`
 *
 * Worker B/C integrate this component; Worker A only ships the primitive.
 */

import * as React from "react";
import {
  AlertTriangle,
  Info as InfoIcon,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Severity = "error" | "warning" | "info";

export interface FailureBannerAction {
  label: string;
  onClick?: () => void;
  /** When set, renders as an `<a>` for external docs / deep links. */
  href?: string;
  variant?: "primary" | "secondary";
}

export interface FailureBannerProps {
  severity?: Severity;
  /** Human-readable title, e.g. "🔐 还没连接大模型账号". */
  title: string;
  /** Human-readable description (not technical). ReactNode so callers can
   *  embed anchors / spans / inline formatting. */
  description: React.ReactNode;
  /** Recovery actions — typically 1-2 (retry, open settings, view docs). */
  actions?: FailureBannerAction[];
  /** Raw technical error for dev debug — shown in a collapsible `<details>`
   *  that stays closed by default. */
  technicalDetail?: string;
  /** When true, show the "× 忽略" button. Parent owns visibility state. */
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

interface SeverityTokens {
  icon: LucideIcon;
  /** Container bg / border / title color pack. Uses Tailwind arbitrary
   *  value classes with hex fallbacks so the component works regardless
   *  of whether the design system has palette CSS vars registered. */
  container: string;
  iconColor: string;
  titleColor: string;
}

const SEVERITY_TOKENS: Record<Severity, SeverityTokens> = {
  error: {
    icon: XCircle,
    container: "border-red-500/40 bg-red-600/10",
    iconColor: "text-red-500 dark:text-red-400",
    titleColor: "text-red-700 dark:text-red-300",
  },
  warning: {
    icon: AlertTriangle,
    container: "border-amber-500/40 bg-amber-600/10",
    iconColor: "text-amber-500 dark:text-amber-400",
    titleColor: "text-amber-700 dark:text-amber-300",
  },
  info: {
    icon: InfoIcon,
    container: "border-blue-500/40 bg-blue-600/10",
    iconColor: "text-blue-500 dark:text-blue-400",
    titleColor: "text-blue-700 dark:text-blue-300",
  },
};

function ActionControl({
  action,
  severity,
}: {
  action: FailureBannerAction;
  severity: Severity;
}) {
  const variant = action.variant ?? "primary";
  const isPrimary = variant === "primary";
  const buttonVariant = isPrimary ? "default" : "outline";

  // For info severity we soften the primary button so it doesn't look like
  // a destructive action; the button component's `default` tone already
  // reads as "safe affirmative" so we just lean on it.
  void severity;

  if (action.href) {
    return (
      <Button asChild size="sm" variant={buttonVariant}>
        <a href={action.href} onClick={action.onClick}>
          {action.label}
        </a>
      </Button>
    );
  }
  return (
    <Button size="sm" variant={buttonVariant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function FailureBanner({
  severity = "error",
  title,
  description,
  actions,
  technicalDetail,
  dismissible = false,
  onDismiss,
  className,
}: FailureBannerProps): React.ReactElement {
  const tokens = SEVERITY_TOKENS[severity];
  const IconComp = tokens.icon;
  const hasActions = actions && actions.length > 0;

  return (
    <div
      role="alert"
      data-slot="failure-banner"
      data-severity={severity}
      className={cn(
        "rounded-md border px-3 py-2.5",
        tokens.container,
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <IconComp
          aria-hidden
          className={cn("mt-0.5 size-4 shrink-0", tokens.iconColor)}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[15px] font-semibold leading-snug",
              tokens.titleColor,
            )}
          >
            {title}
          </div>
          <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </div>
          {hasActions ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {actions!.map((action, idx) => (
                <ActionControl
                  key={`${action.label}-${idx}`}
                  action={action}
                  severity={severity}
                />
              ))}
            </div>
          ) : null}
          {technicalDetail ? (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-muted-foreground select-none">
                技术细节
              </summary>
              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-foreground/5 px-2 py-1.5 font-mono text-[11px] leading-snug text-muted-foreground opacity-60">
                {technicalDetail}
              </pre>
            </details>
          ) : null}
        </div>
        {dismissible ? (
          <button
            type="button"
            aria-label="忽略"
            onClick={onDismiss}
            className={cn(
              "ml-1 -mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
