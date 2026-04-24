/**
 * AbsorbTriggerButton - triggers /absorb.
 *
 * Completion/progress is handled by AbsorbEventsBridge via
 * /api/wiki/absorb/events. This component should not poll wiki stats:
 * polling loses exact counters and can leave the UI stuck if the stats
 * timestamp never changes.
 */

import { useCallback } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { triggerAbsorb } from "@/api/wiki/repository";
import { useSkillStore } from "@/state/skill-store";

interface AbsorbTriggerButtonProps {
  /** Specific entry IDs to absorb. Omit for "absorb all pending". */
  entryIds?: number[];
  /** Compact mode (smaller text, inline). */
  compact?: boolean;
}

export function AbsorbTriggerButton({ entryIds, compact }: AbsorbTriggerButtonProps) {
  const running = useSkillStore((s) => s.absorbRunning);
  const startAbsorb = useSkillStore((s) => s.startAbsorb);
  const failAbsorb = useSkillStore((s) => s.failAbsorb);

  const handleClick = useCallback(async () => {
    if (running) return;

    try {
      const response = await triggerAbsorb(entryIds);
      startAbsorb(response.task_id);
      toast.success("维护已启动", { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ABSORB_IN_PROGRESS")) {
        toast.warning("已有维护任务正在执行", { duration: 3000 });
      } else {
        failAbsorb(msg);
        toast.error(`维护启动失败: ${msg}`, { duration: 5000 });
      }
    }
  }, [running, entryIds, startAbsorb, failAbsorb]);

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={running}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        title={running ? "维护中..." : "开始维护"}
      >
        {running ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={running}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {running ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          维护中...
        </>
      ) : (
        <>
          <Sparkles className="size-3.5" />
          开始维护
        </>
      )}
    </button>
  );
}
