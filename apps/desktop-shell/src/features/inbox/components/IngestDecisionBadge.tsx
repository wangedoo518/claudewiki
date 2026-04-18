/**
 * IngestDecisionBadge — visualises the 8 `IngestDecision` variants
 * emitted by the URL ingest orchestrator.
 *
 * Accepts the raw decision union (discriminated by `kind`) from
 * `lib/tauri.ts`. Renders a pill-shaped label with a semantic colour:
 *
 *   created_new             — success green (fresh raw created)
 *   refreshed_content       — purple (URL changed, re-fetched)
 *   content_duplicate       — info blue (different URL, same content)
 *   reused_approved         — muted green (silently reused)
 *   reused_with_pending_inbox — warning (dedup suppressed a new inbox)
 *   reused_after_reject     — red (prior reject history)
 *   reused_silent           — neutral grey (miscellaneous reuse)
 *   explicit_reingest       — primary blue (user-forced re-ingest)
 *
 * The badge is purely presentational; hover title exposes the full
 * reason/previous_raw_id payload so power users can audit without
 * clicking through. When `decision` is null/undefined a 待更新
 * neutral pill is shown — the Evidence card is always rendered even
 * if the backend didn't stamp the decision field.
 */

import type { IngestDecision } from "@/lib/tauri";

export interface IngestDecisionBadgeProps {
  decision: IngestDecision | null | undefined;
  /** Optional compact mode for list rows — slightly smaller text. */
  compact?: boolean;
}

interface DecisionStyle {
  label: string;
  color: string;
  hint: string;
}

// Snake-case kinds straight out of `IngestDecision` — keep in sync
// with the tagged-union definition in `lib/tauri.ts` (which is the
// canonical wire shape emitted by the Rust backend).
const DECISION_STYLES: Record<IngestDecision["kind"], DecisionStyle> = {
  created_new: {
    label: "新建",
    color: "var(--color-success)",
    hint: "首次抓取，已创建新 raw。",
  },
  reused_with_pending_inbox: {
    label: "抑制",
    color: "var(--color-warning)",
    hint: "已有相同 URL 的 inbox 任务待处理，此次被抑制。",
  },
  reused_approved: {
    label: "复用(已批准)",
    color: "var(--color-success)",
    hint: "已有相同 URL 且已批准进入 wiki，静默复用。",
  },
  reused_after_reject: {
    label: "复用(已拒绝)",
    color: "var(--color-error)",
    hint: "相同 URL 之前被拒绝，保留历史 raw。",
  },
  reused_silent: {
    label: "静默复用",
    color: "oklch(0.65 0.02 260)",
    hint: "相同 URL 已存在，静默复用原 raw。",
  },
  explicit_reingest: {
    label: "强制重抓",
    color: "var(--color-primary)",
    hint: "用户明确要求重新抓取。",
  },
  refreshed_content: {
    label: "更新",
    color: "oklch(0.55 0.15 285)",
    hint: "相同 URL 但内容已变更，已生成新 raw。",
  },
  content_duplicate: {
    label: "同内容",
    color: "oklch(0.60 0.13 220)",
    hint: "不同 URL 但内容哈希一致，复用已有 raw。",
  },
};

export function IngestDecisionBadge({
  decision,
  compact = false,
}: IngestDecisionBadgeProps) {
  if (!decision || typeof decision !== "object" || !("kind" in decision)) {
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5"
        style={{
          fontSize: compact ? 10 : 11,
          borderColor: "var(--border)",
          color: "var(--muted-foreground)",
          backgroundColor: "var(--muted)",
        }}
        title="此 raw 尚未记录 IngestDecision（可能是 M3 之前创建，或尚未回填）"
      >
        decision 未记录
      </span>
    );
  }

  const style = DECISION_STYLES[decision.kind];
  if (!style) {
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5"
        style={{
          fontSize: compact ? 10 : 11,
          borderColor: "var(--border)",
          color: "var(--muted-foreground)",
        }}
      >
        {decision.kind}
      </span>
    );
  }

  const detail = formatDecisionDetail(decision);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium"
      style={{
        fontSize: compact ? 10 : 11,
        borderColor: `color-mix(in srgb, ${style.color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${style.color} 10%, transparent)`,
        color: style.color,
      }}
      title={detail ? `${style.hint}\n${detail}` : style.hint}
    >
      {style.label}
    </span>
  );
}

/**
 * Extract the variant-specific payload (reason / previous id / match
 * id) into a short human-readable string for the badge title tooltip.
 */
function formatDecisionDetail(decision: IngestDecision): string {
  switch (decision.kind) {
    case "reused_with_pending_inbox":
    case "reused_approved":
    case "reused_after_reject":
    case "reused_silent":
      return decision.reason;
    case "explicit_reingest":
      return `previous raw: #${String(decision.previous_raw_id).padStart(5, "0")}`;
    case "refreshed_content":
      return `previous raw: #${String(decision.previous_raw_id).padStart(5, "0")} · prev hash: ${decision.previous_content_hash.slice(0, 8)}…`;
    case "content_duplicate":
      return `matches raw #${String(decision.matching_raw_id).padStart(5, "0")} · ${decision.matching_url}`;
    case "created_new":
    default:
      return "";
  }
}
