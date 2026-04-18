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
 */

import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, RefreshCcw } from "lucide-react";
import type { MaintainOutcome } from "@/features/ingest/types";

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
    return (
      <OutcomeShell tone="warning" label="操作失败" english="Failed">
        <div className="flex items-start gap-2">
          <div
            className="min-w-0 flex-1 max-h-32 overflow-auto break-words whitespace-pre-wrap text-foreground/80"
            style={{ fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere" }}
          >
            {errorMessage && errorMessage.trim().length > 0 ? errorMessage : "后端未返回错误详情，请稍后重试。"}
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className="flex shrink-0 items-center gap-1 rounded-md border border-border/50 bg-background px-2.5 py-1 text-foreground transition-colors hover:border-primary hover:text-primary" style={{ fontSize: 11 }}>
              <RefreshCcw className="size-3" />重试
            </button>
          )}
        </div>
      </OutcomeShell>
    );
  }
  return null;
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
