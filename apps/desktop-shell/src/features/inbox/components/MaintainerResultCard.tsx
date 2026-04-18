/**
 * MaintainerResultCard — Section 3 (Result) outcome card.
 *
 * Four shapes keyed on MaintainOutcome:
 *   - created / updated  → green ✓ + target slug + "打开 Wiki 页"
 *   - rejected           → red ✗ + quoted rejection_reason
 *   - failed             → yellow ⚠ + error message + "重试"
 *
 * The "打开 Wiki 页" CTA defers to Worker C's `navigateToWikiPage`
 * when provided; otherwise falls back to a react-router
 * `/wiki/:slug` link so the card stays functional pre-integration.
 *
 * R1 trust layer: the `failed` branch now passes its error string
 * through `classifyMaintainerError` → `FailureBanner` so high-frequency
 * backend errors (invalid JSON from the LLM, concurrent edit conflict)
 * surface as user-readable sentences instead of raw server strings.
 * The original overflow box is preserved for unknown errors.
 */

import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import type { MaintainOutcome } from "@/features/ingest/types";
import { FailureBanner } from "@/components/ui/failure-banner";

export interface MaintainerResultCardProps {
  outcome: MaintainOutcome;
  /** Set when outcome is `created` or `updated`. */
  targetPageSlug?: string | null;
  /** Set when outcome is `rejected`. */
  rejectionReason?: string | null;
  /** Set when outcome is `failed`. */
  errorMessage?: string | null;
  /** Fires when the user clicks "重试" on a `failed` result. */
  onRetry?: () => void;
  /** Overrides the default react-router "/wiki/:slug" link. */
  onOpenWikiPage?: (slug: string) => void;
}

type Tone = "success" | "error" | "warning";

const TONE_CONFIG: Record<Tone, { color: string; icon: LucideIcon }> = {
  success: { color: "var(--color-success)", icon: CheckCircle2 },
  error: { color: "var(--color-error)", icon: XCircle },
  warning: { color: "var(--color-warning)", icon: AlertTriangle },
};

export function MaintainerResultCard({
  outcome,
  targetPageSlug,
  rejectionReason,
  errorMessage,
  onRetry,
  onOpenWikiPage,
}: MaintainerResultCardProps) {
  if (outcome === "created" || outcome === "updated") {
    const label = outcome === "created" ? "已新建 Wiki 页" : "已合并到 Wiki 页";
    const english = outcome === "created" ? "Created" : "Updated";
    return (
      <OutcomeShell tone="success" label={label} english={english}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {targetPageSlug ? (
              <div className="font-mono text-foreground/80" style={{ fontSize: 12 }}>{targetPageSlug}</div>
            ) : (
              <div className="italic text-muted-foreground/60" style={{ fontSize: 11 }}>服务端未返回 target_page_slug</div>
            )}
          </div>
          {targetPageSlug && <OpenWikiPageButton slug={targetPageSlug} onOpenWikiPage={onOpenWikiPage} />}
        </div>
      </OutcomeShell>
    );
  }
  if (outcome === "rejected") {
    return (
      <OutcomeShell tone="error" label="已拒绝" english="Rejected">
        <blockquote className="border-l-2 pl-2 text-foreground/80" style={{ fontSize: 12, borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)" }}>
          {rejectionReason && rejectionReason.trim().length > 0
            ? rejectionReason
            : <span className="italic text-muted-foreground/60">（未填写原因）</span>}
        </blockquote>
      </OutcomeShell>
    );
  }
  if (outcome === "failed") {
    const raw = errorMessage ?? "";
    const classified = classifyMaintainerError(raw);
    return (
      <OutcomeShell tone="warning" label="操作失败" english="Failed">
        {classified.kind === "unknown" ? (
          // Unknown — keep the legacy overflow box so nothing is
          // silently hidden, but wrap it in the same layout as the
          // classified branches for visual consistency.
          <FailureBanner
            severity="warning"
            title={raw.trim().length > 0 ? "维护失败" : "后端未返回错误详情"}
            description={
              raw.trim().length > 0
                ? "后端在处理这一步时失败了。查看下方技术细节，或直接重试。"
                : "没有拿到具体错误信息。请稍后重试，若问题持续出现请保留这条任务以便排查。"
            }
            technicalDetail={raw.trim().length > 0 ? raw : undefined}
            actions={
              onRetry
                ? [{ label: "重试", onClick: onRetry, variant: "primary" }]
                : undefined
            }
          />
        ) : (
          <FailureBanner
            severity="warning"
            title={classified.title}
            description={classified.description}
            technicalDetail={raw}
            actions={
              onRetry
                ? [
                    {
                      label: classified.retryLabel,
                      onClick: onRetry,
                      variant: "primary",
                    },
                  ]
                : undefined
            }
          />
        )}
      </OutcomeShell>
    );
  }
  return null;
}

/* ── Error classifier (Maintainer) ─────────────────────────────── */

type MaintainerErrorKind = "bad_json" | "concurrent_edit" | "unknown";

interface MaintainerErrorCopy {
  kind: MaintainerErrorKind;
  title: string;
  description: string;
  retryLabel: string;
}

function classifyMaintainerError(raw: string): MaintainerErrorCopy {
  const text = raw ?? "";
  if (/invalid\s+json|BadJson|failed\s+to\s+parse\s+json/i.test(text)) {
    return {
      kind: "bad_json",
      title: "⚠️ 无法生成知识页面提案",
      description:
        "大模型返回的内容格式异常，可能是网络中断或 API 超时。重试通常能解决。",
      retryLabel: "重试",
    };
  }
  if (
    /changed\s+since\s+proposal|page\s+changed|stale\s+snapshot|concurrent\s+edit/i.test(
      text,
    )
  ) {
    return {
      kind: "concurrent_edit",
      title: "🔄 内容已更新",
      description:
        "这个 Wiki 页面在你生成提案后已被修改。请重新生成提案以合并最新内容。",
      retryLabel: "重新生成提案",
    };
  }
  return {
    kind: "unknown",
    title: "维护失败",
    description: "后端在处理这一步时失败了。",
    retryLabel: "重试",
  };
}

/* ── Shared shell ──────────────────────────────────────────────── */

function OutcomeShell({
  tone,
  label,
  english,
  children,
}: {
  tone: Tone;
  label: string;
  english: string;
  children: React.ReactNode;
}) {
  const { color, icon: Icon } = TONE_CONFIG[tone];
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 6%, transparent)`,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" style={{ color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span style={{ color, fontSize: 13, fontWeight: 500 }}>{label}</span>
            <span className="font-mono text-muted-foreground/50" style={{ fontSize: 10 }}>{english}</span>
          </div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Open Wiki page button (prefer Worker C helper) ────────────── */

function OpenWikiPageButton({
  slug,
  onOpenWikiPage,
}: {
  slug: string;
  onOpenWikiPage?: (slug: string) => void;
}) {
  const cls =
    "flex shrink-0 items-center gap-1 rounded-md border border-border/50 bg-background px-2.5 py-1 text-foreground transition-colors hover:border-primary hover:text-primary";
  const style = { fontSize: 11 };
  if (onOpenWikiPage) {
    return (
      <button type="button" onClick={() => onOpenWikiPage(slug)} className={cls} style={style}>
        <ExternalLink className="size-3" />打开 Wiki 页
      </button>
    );
  }
  return (
    <Link to={`/wiki/${encodeURIComponent(slug)}`} className={cls} style={style}>
      <ExternalLink className="size-3" />打开 Wiki 页
    </Link>
  );
}
