/**
 * M5 sprint — compact health badge used inside `BridgeHealthHeader`.
 *
 * The badge renders a coloured dot + short label for the 5 `BridgeHealth`
 * buckets. It's intentionally text-first (no full-width FailureBanner
 * here) — the banner lives a row below and owns the noisy recovery CTA
 * surface. This component is just the "at-a-glance" summary.
 *
 * Reuses the shared `Badge` R1 primitive with `variant="outline"` so the
 * coloured dot provides the semantic cue without re-skinning the badge
 * itself (keeps the design-system tokens intact).
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BridgeHealth } from "@/features/wechat/health-state";

interface StatusMeta {
  label: string;
  dotClass: string;
  textClass: string;
}

const STATUS_META: Record<BridgeHealth, StatusMeta> = {
  active: {
    label: "已连接",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700 dark:text-emerald-300",
  },
  idle: {
    label: "空闲",
    dotClass: "bg-sky-500",
    textClass: "text-sky-700 dark:text-sky-300",
  },
  degraded: {
    label: "降级",
    dotClass: "bg-amber-500",
    textClass: "text-amber-700 dark:text-amber-300",
  },
  disconnected: {
    label: "已断开",
    dotClass: "bg-muted-foreground",
    textClass: "text-muted-foreground",
  },
  error: {
    label: "异常",
    dotClass: "bg-red-500",
    textClass: "text-red-700 dark:text-red-300",
  },
};

export interface HealthStatusBadgeProps {
  health: BridgeHealth;
  className?: string;
}

export function HealthStatusBadge({ health, className }: HealthStatusBadgeProps) {
  const meta = STATUS_META[health];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2 py-0.5 text-[11px] font-medium",
        meta.textClass,
        className,
      )}
      data-health={health}
    >
      <span
        aria-hidden
        className={cn("inline-block size-1.5 shrink-0 rounded-full", meta.dotClass)}
      />
      {meta.label}
    </Badge>
  );
}
