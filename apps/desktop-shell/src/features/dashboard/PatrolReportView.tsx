/**
 * PatrolReportView — detailed patrol issue list.
 * Per 07-dashboard.md §6.5 and 05-schema-system.md §6.
 *
 * Groups issues by kind, each showing page_slug + description + suggested_action.
 * Click page_slug → Wiki mode + open tab.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { getPatrolReport, triggerPatrol } from "@/api/wiki/repository";
import { useSettingsStore } from "@/state/settings-store";
import { useWikiTabStore } from "@/state/wiki-tab-store";
import type { PatrolIssue } from "@/api/wiki/types";

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  orphan: { label: "孤儿页", color: "var(--deeptutor-warn, #C88B1A)" },
  stale: { label: "过期", color: "var(--color-muted-foreground)" },
  "schema-violation": { label: "Schema 违规", color: "var(--color-destructive)" },
  oversized: { label: "超长", color: "var(--deeptutor-warn, #C88B1A)" },
  stub: { label: "残桩", color: "var(--deeptutor-warn, #C88B1A)" },
  "confidence-decay": { label: "Confidence 衰减", color: "var(--color-muted-foreground)" },
  uncrystallized: { label: "未结晶", color: "var(--color-muted-foreground)" },
};

export function PatrolReportView() {
  const queryClient = useQueryClient();
  const setAppMode = useSettingsStore((s) => s.setAppMode);
  const openTab = useWikiTabStore((s) => s.openTab);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wiki", "patrol", "report"],
    queryFn: getPatrolReport,
    staleTime: 60_000,
  });

  const handleRunPatrol = async () => {
    await triggerPatrol();
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ["wiki", "inbox", "list"] }),
    ]);
  };

  const handleClickSlug = (slug: string) => {
    setAppMode("wiki");
    openTab({ id: slug, kind: "article", slug, title: slug, closable: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-[12px] text-[var(--color-muted-foreground)]">
        <Loader2 className="size-3.5 animate-spin" /> 加载巡检报告...
      </div>
    );
  }

  // Group issues by kind.
  const groups = new Map<string, PatrolIssue[]>();
  if (data?.issues) {
    for (const issue of data.issues) {
      const existing = groups.get(issue.kind) ?? [];
      existing.push(issue);
      groups.set(issue.kind, existing);
    }
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--color-foreground)]">
          巡检报告
        </h3>
        <button
          onClick={handleRunPatrol}
          disabled={isFetching}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          立即巡检
        </button>
      </div>

      {!data ? (
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          尚未运行巡检。点击"立即巡检"开始。
        </p>
      ) : data.issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--deeptutor-ok,#3F8F5E)]/20 bg-[var(--deeptutor-ok-soft)] p-3 text-[12px] text-[var(--deeptutor-ok,#3F8F5E)]">
          <CheckCircle2 className="size-4" />
          全部通过 — 知识库质量良好
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([kind, issues]) => {
            const meta = KIND_LABELS[kind] ?? { label: kind, color: "var(--color-muted-foreground)" };
            return (
              <div key={kind}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="size-3" style={{ color: meta.color }} />
                  <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
                    {meta.label} ({issues.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {issues.map((issue, i) => (
                    <div
                      key={`${issue.page_slug}-${i}`}
                      className="rounded-md border border-[var(--color-border)] p-2 text-[12px]"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleClickSlug(issue.page_slug)}
                          className="font-medium text-[var(--color-primary)] hover:underline"
                        >
                          {issue.page_slug}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[var(--color-muted-foreground)]">
                        {issue.description}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]/60">
                        建议: {issue.suggested_action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-[10px] text-[var(--color-muted-foreground)]/50">
            巡检时间: {data.checked_at.slice(0, 19).replace("T", " ")}
          </p>
        </div>
      )}
    </div>
  );
}
