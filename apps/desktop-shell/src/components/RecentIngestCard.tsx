/**
 * RecentIngestCard — collapsible list of recent URL ingest decisions.
 *
 * Mounted under EnvironmentDoctor on the WeChat Bridge page. When
 * expanded, polls `GET /api/desktop/url-ingest/recent?limit=10` every
 * 5 seconds; when collapsed, stops polling to avoid waking the
 * backend unnecessarily.
 *
 * Each row summarises one URL ingest request: timestamp, outcome badge,
 * entry point (ask-enrich / ilink / kefu / wechat-fetch), the canonical
 * URL (truncated), and a link-style raw_id affordance.
 *
 * M3 observability UI — the primary consumer is "why was my URL
 * reused / suppressed / rejected?" diagnosis by developer + power user.
 * The endpoint is optional (Worker B may not have shipped it yet), so
 * a 404 gracefully degrades to a "待更新" placeholder instead of
 * blocking the rest of the dashboard.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { fetchJson } from "@/lib/desktop/transport";
import type {
  IngestDecision,
  RecentIngestEntry,
  RecentIngestOutcomeKind,
  RecentIngestResponse,
} from "@/lib/tauri";

/**
 * Local extension of the server response shape to flag "endpoint not
 * shipped yet" without leaking the 404 sentinel into the rendering
 * code further down. Matches the `__endpoint_missing__` pattern used
 * by EnvironmentDoctor.
 */
type RecentIngestQueryResult = RecentIngestResponse & {
  __missing?: boolean;
};

export function RecentIngestCard({ limit = 10 }: { limit?: number }) {
  const [open, setOpen] = useState(false);

  const query = useQuery<RecentIngestQueryResult>({
    queryKey: ["url-ingest-recent", limit],
    queryFn: async () => {
      try {
        return await fetchJson<RecentIngestResponse>(
          `/api/desktop/url-ingest/recent?limit=${limit}`,
        );
      } catch (err) {
        // Worker B's endpoint may not be live yet. Collapse the row
        // rather than surfacing a scary error — mirrors the
        // EnvironmentDoctor "待更新" fallback.
        const msg = err instanceof Error ? err.message : String(err);
        if (/status\s+404/i.test(msg) || /404/.test(msg)) {
          return {
            decisions: [],
            total: 0,
            capacity: 0,
            __missing: true,
          };
        }
        throw err;
      }
    },
    // Only poll while the card is expanded — collapsed cards shouldn't
    // hammer the backend.
    refetchInterval: open ? 5_000 : false,
    staleTime: 3_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const decisions = data?.decisions ?? [];
  const endpointMissing = data?.__missing === true;
  const total = data?.total ?? 0;

  return (
    <section className="border-b border-border/50 px-6 py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <History className="size-4" style={{ color: "var(--claude-orange)" }} />
          <h2
            className="uppercase tracking-widest text-muted-foreground/60"
            style={{ fontSize: 11 }}
          >
            最近 URL 抓取决策
          </h2>
          <span className="text-caption text-muted-foreground/60">
            {endpointMissing
              ? "待更新"
              : decisions.length > 0
                ? `最近 ${decisions.length} 条（共 ${total}）`
                : "暂无记录"}
          </span>
        </div>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {endpointMissing ? (
            <p className="text-caption text-muted-foreground">
              诊断功能待更新（后端 /api/desktop/url-ingest/recent 尚未上线）。
            </p>
          ) : query.isLoading ? (
            <p className="text-caption text-muted-foreground">加载中…</p>
          ) : query.error ? (
            <p
              className="text-caption"
              style={{ color: "var(--color-error)" }}
            >
              读取失败：
              {query.error instanceof Error
                ? query.error.message
                : String(query.error)}
            </p>
          ) : decisions.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              还没有任何 URL 抓取决策。先在 Ask 里发一条带链接的消息，或让微信
              Bridge 收一条链接试试。
            </p>
          ) : (
            <>
              {/* M4: aggregate stats strip (optional — `stats` is undefined on
                  pre-M4 backends, in which case we simply skip this row). */}
              {data?.stats && (
                <StatsStrip stats={data.stats} />
              )}
              <div className="overflow-x-auto rounded-md border border-border/40">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/10 text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">时间</th>
                      <th className="px-2 py-1.5 text-left font-medium">结果</th>
                      <th className="px-2 py-1.5 text-left font-medium">入口</th>
                      <th className="px-2 py-1.5 text-left font-medium">URL</th>
                      <th className="px-2 py-1.5 text-left font-medium">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map((entry, i) => (
                      <DecisionRow
                        key={`${entry.timestamp_ms}-${i}`}
                        entry={entry}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function DecisionRow({ entry }: { entry: RecentIngestEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(entry.timestamp_ms).toLocaleTimeString();
  const rawLabel =
    typeof entry.raw_id === "number"
      ? `#${String(entry.raw_id).padStart(5, "0")}`
      : "—";

  const decisionKind = entry.decision?.kind ?? null;
  const showDecisionBadge =
    decisionKind === "refreshed_content" || decisionKind === "content_duplicate";

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/20 last:border-0 hover:bg-muted/5"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <td className="px-2 py-1.5 font-mono text-muted-foreground">{time}</td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <OutcomeBadge kind={entry.outcome_kind} />
            {showDecisionBadge && entry.decision && (
              <DecisionBadge decision={entry.decision} />
            )}
          </div>
        </td>
        <td className="px-2 py-1.5 font-mono text-muted-foreground">
          {entry.entry_point}
        </td>
        <td
          className="max-w-[220px] truncate px-2 py-1.5 text-foreground/80"
          title={entry.canonical_url}
        >
          {entry.canonical_url}
        </td>
        <td className="px-2 py-1.5 font-mono text-muted-foreground">
          {rawLabel}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/20 last:border-0 bg-muted/5">
          <td colSpan={5} className="px-2 py-2">
            <DecisionDetail entry={entry} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * M4 row-expansion detail panel. Renders a compact key/value list of
 * every observability-relevant field on the entry, plus the raw
 * decision JSON in a `<details>` so power users can audit the exact
 * wire shape without cluttering the default view.
 */
function DecisionDetail({ entry }: { entry: RecentIngestEntry }) {
  const showUrlArrow =
    entry.original_url && entry.original_url !== entry.canonical_url;
  const shortHash =
    typeof entry.content_hash === "string" && entry.content_hash.length > 0
      ? entry.content_hash.slice(0, 8)
      : null;

  return (
    <div className="space-y-1.5 text-[11px] text-muted-foreground">
      {/* URL line: original → canonical when they differ, else just canonical. */}
      <div className="flex flex-wrap items-start gap-1">
        <span className="shrink-0 font-medium text-muted-foreground/80">URL:</span>
        {showUrlArrow ? (
          <span className="break-all">
            <span className="text-foreground/70">{entry.original_url}</span>
            <span className="mx-1 text-muted-foreground/50">→</span>
            <span className="text-foreground/80">{entry.canonical_url}</span>
          </span>
        ) : (
          <span className="break-all text-foreground/80">
            {entry.canonical_url}
          </span>
        )}
      </div>

      {/* Decision reason tag (pending:... / refreshed:prev=... / ...) */}
      {entry.decision_reason && (
        <div className="flex flex-wrap items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Reason:
          </span>
          <span className="break-all font-mono text-foreground/80">
            {entry.decision_reason}
          </span>
        </div>
      )}

      {/* Content hash prefix + match chip */}
      {shortHash && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Hash:
          </span>
          <span className="font-mono text-foreground/80">{shortHash}…</span>
          {entry.content_hash_hit === true && (
            <span
              className="ml-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px]"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--color-primary) 30%, transparent)",
                backgroundColor:
                  "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                color: "var(--color-primary)",
              }}
            >
              匹配
            </span>
          )}
        </div>
      )}

      {/* Entry point (full, no truncation) */}
      <div className="flex flex-wrap items-start gap-1">
        <span className="shrink-0 font-medium text-muted-foreground/80">
          Entry point:
        </span>
        <span className="font-mono text-foreground/80">{entry.entry_point}</span>
      </div>

      {/* Inbox id / adapter / duration — all optional */}
      {typeof entry.inbox_id === "number" && (
        <div className="flex flex-wrap items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Inbox:
          </span>
          <span className="font-mono text-foreground/80">
            #{String(entry.inbox_id).padStart(5, "0")}
          </span>
        </div>
      )}
      {entry.adapter && (
        <div className="flex flex-wrap items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Adapter:
          </span>
          <span className="font-mono text-foreground/80">{entry.adapter}</span>
        </div>
      )}
      {typeof entry.duration_ms === "number" && (
        <div className="flex flex-wrap items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Duration:
          </span>
          <span className="font-mono text-foreground/80">
            {entry.duration_ms} ms
          </span>
        </div>
      )}

      {/* Summary (the one-liner the backend hands us) */}
      {entry.summary && (
        <div className="flex flex-wrap items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/80">
            Summary:
          </span>
          <span className="text-foreground/70">{entry.summary}</span>
        </div>
      )}

      {/* Power-user escape hatch: the raw decision wire shape. */}
      {entry.decision && (
        <details className="pt-1">
          <summary className="cursor-pointer select-none text-muted-foreground/70 hover:text-foreground">
            原始 decision JSON
          </summary>
          <pre className="mt-1 overflow-x-auto rounded border border-border/30 bg-muted/20 p-1.5 font-mono text-[10px] leading-tight text-foreground/80">
            {JSON.stringify(entry.decision, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * M4 aggregate stats strip rendered above the decisions table. Shows
 * `kind: count` pairs for both by_kind and by_entry_point axes so
 * the diagnostician can see at a glance "what's been happening".
 */
function StatsStrip({
  stats,
}: {
  stats: { by_kind: Record<string, number>; by_entry_point: Record<string, number> };
}) {
  const byKindEntries = Object.entries(stats.by_kind).sort(
    (a, b) => b[1] - a[1],
  );
  const byEntryEntries = Object.entries(stats.by_entry_point).sort(
    (a, b) => b[1] - a[1],
  );

  if (byKindEntries.length === 0 && byEntryEntries.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/30 bg-muted/10 px-2 py-1.5 text-[11px] text-muted-foreground">
      {byKindEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-muted-foreground/80">按结果</span>
          {byKindEntries.map(([k, v]) => (
            <span key={`k-${k}`} className="font-mono">
              {k}: <span className="text-foreground/80">{v}</span>
            </span>
          ))}
        </div>
      )}
      {byEntryEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-muted-foreground/80">按入口</span>
          {byEntryEntries.map(([k, v]) => (
            <span key={`e-${k}`} className="font-mono">
              {k}: <span className="text-foreground/80">{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * M4: supplementary badge rendered next to the outcome badge when the
 * decision is one of the two new content-level variants. Not emitted
 * for the 6 pre-M4 variants because the outcome badge already covers
 * them.
 */
function DecisionBadge({ decision }: { decision: IngestDecision }) {
  let label: string;
  let color: string;

  switch (decision.kind) {
    case "refreshed_content":
      label = "更新";
      color = "oklch(0.55 0.15 285)";
      break;
    case "content_duplicate":
      label = "同内容";
      color = "oklch(0.60 0.13 220)";
      break;
    default:
      return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

interface OutcomeBadgeStyle {
  label: string;
  tone: "success" | "info" | "warning" | "error" | "neutral";
}

/**
 * Visual mapping for `RecentIngestOutcomeKind`. Tones align with the
 * existing design tokens used across EnvironmentDoctor / KefuPipeline
 * (success / warning / error + a neutral fallback).
 */
const OUTCOME_STYLES: Record<RecentIngestOutcomeKind, OutcomeBadgeStyle> = {
  ingested: { label: "新建", tone: "success" },
  reused_existing: { label: "复用", tone: "info" },
  inbox_suppressed: { label: "抑制", tone: "warning" },
  fallback_to_text: { label: "降级", tone: "warning" },
  rejected_quality: { label: "拒绝", tone: "error" },
  fetch_failed: { label: "抓失败", tone: "error" },
  prerequisite_missing: { label: "缺依赖", tone: "warning" },
  invalid_url: { label: "无效", tone: "neutral" },
};

function OutcomeBadge({ kind }: { kind: string }) {
  const style = (OUTCOME_STYLES as Record<string, OutcomeBadgeStyle>)[kind] ?? {
    label: kind,
    tone: "neutral",
  };

  let borderColor: string;
  let backgroundColor: string;
  let color: string;

  switch (style.tone) {
    case "success":
      borderColor = "color-mix(in srgb, var(--color-success) 30%, transparent)";
      backgroundColor =
        "color-mix(in srgb, var(--color-success) 10%, transparent)";
      color = "var(--color-success)";
      break;
    case "info":
      borderColor = "color-mix(in srgb, var(--color-primary) 30%, transparent)";
      backgroundColor =
        "color-mix(in srgb, var(--color-primary) 10%, transparent)";
      color = "var(--color-primary)";
      break;
    case "warning":
      borderColor = "color-mix(in srgb, var(--color-warning) 30%, transparent)";
      backgroundColor =
        "color-mix(in srgb, var(--color-warning) 10%, transparent)";
      color = "var(--color-warning)";
      break;
    case "error":
      borderColor = "color-mix(in srgb, var(--color-error) 30%, transparent)";
      backgroundColor =
        "color-mix(in srgb, var(--color-error) 10%, transparent)";
      color = "var(--color-error)";
      break;
    default:
      borderColor = "var(--border)";
      backgroundColor = "var(--muted)";
      color = "var(--muted-foreground)";
      break;
  }

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]"
      style={{ borderColor, backgroundColor, color }}
    >
      {style.label}
    </span>
  );
}
