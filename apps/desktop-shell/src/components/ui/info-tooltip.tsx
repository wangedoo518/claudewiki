/**
 * R1 sprint — `InfoTooltip` is the canonical "explain-this-thing" primitive
 * for inline help. Callers drop it next to a label or button and pass the
 * explanation as children; the default trigger is a muted `?` icon that
 * picks up opacity on hover.
 *
 * Built on the shared shadcn `Tooltip` primitive (see `ContextBasisLabel`
 * for prior art). Worker B/C will reuse this wherever the UI has a
 * domain-specific term that deserves a hover-reveal explanation (context
 * basis mode names, wiki layer taxonomy, scheduled-task cadence, etc.).
 */

import * as React from "react";
import { HelpCircle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps {
  /** Short explanation shown on hover. */
  children: React.ReactNode;
  /** Which side to place the tooltip. Default `"top"`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Optional custom trigger — default is a small `?` icon. */
  trigger?: React.ReactNode;
  className?: string;
}

export function InfoTooltip({
  children,
  side = "top",
  trigger,
  className,
}: InfoTooltipProps): React.ReactElement {
  const triggerNode = trigger ?? (
    <HelpCircle
      aria-label="更多信息"
      className={cn(
        "size-3 opacity-60 hover:opacity-100 transition-opacity text-muted-foreground",
        className,
      )}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-slot="info-tooltip-trigger"
            className="inline-flex items-center justify-center align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-full"
          >
            {triggerNode}
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-[11px] leading-snug">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
