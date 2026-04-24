import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { subscribeToAbsorbEvents } from "@/api/wiki/absorb-events";
import { useSkillStore } from "@/state/skill-store";

export function AbsorbEventsBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      controller = subscribeToAbsorbEvents(
        (event) => {
          const store = useSkillStore.getState();

          if (event.type === "absorb_progress") {
            store.updateAbsorbProgress(event);
            return;
          }

          store.completeAbsorb(event);
          void queryClient.invalidateQueries({ queryKey: ["wiki"] });
          void queryClient.invalidateQueries({ queryKey: ["wiki-tree"] });

          if (event.failed > 0) {
            toast.warning("维护完成，但有条目失败", { duration: 4000 });
          } else {
            toast.success("维护完成", { duration: 3000 });
          }
        },
        (error) => {
          console.warn("[absorb-sse] connection error", error.message);
          const store = useSkillStore.getState();
          if (store.absorbRunning) {
            store.failAbsorb("维护进度连接中断，请稍后刷新确认结果");
          }
          if (!stopped) {
            retryTimer = setTimeout(connect, 3000);
          }
        },
      );
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    };
  }, [queryClient]);

  return null;
}
