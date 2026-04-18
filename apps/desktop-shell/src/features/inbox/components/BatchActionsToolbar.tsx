/**
 * BatchActionsToolbar — right-pane toolbar for the Inbox batch mode.
 *
 * Rendered in place of the per-entry Workbench when `batchMode` is
 * on. Shows the selection count plus a danger-styled "拒绝已选" CTA
 * that opens a confirm dialog asking for a unified rejection reason
 * (min 4 chars, same contract as the single-row reject flow).
 *
 * Submit flow:
 *   1. validate reason (≥4 chars, same as MaintainActionRadio)
 *   2. `batchResolveInboxEntries(ids, "reject", reason)` — hits
 *      Worker A's POST /api/wiki/inbox/batch/resolve; the wrapper
 *      transparently falls back to per-id resolves on a legacy
 *      server (404).
 *   3. on completion: read {success, failed[]} from the response.
 *      Succeeded ids drop out of the selection; failed ids stay so
 *      the user can retry or flip to a per-row fix.
 *
 * The dialog is optimistic — we show progress via the submit
 * button's spinner; partial failures render a classifier-driven
 * `FailureBanner` inside the dialog (the user never leaves the
 * modal until they dismiss it explicitly).
 */

import { useState } from "react";
import { Loader2, XCircle, Trash2, GitMerge } from "lucide-react";

import { batchResolveInboxEntries } from "@/features/ingest/persist";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FailureBanner } from "@/components/ui/failure-banner";

export interface BatchActionsToolbarProps {
  /** Ids currently selected. Order is irrelevant. */
  selectedIds: number[];
  /** Total pending count for the side hint ("/ N 条待处理"). */
  totalPending: number;
  /** Clear the selection without committing. */
  onClearSelection: () => void;
  /**
   * Called after a batch resolve attempt completes with the ids
   * that succeeded and the ids that failed. The parent uses this
   * to refetch the list, prune the selection, and surface a toast
   * or inline message about the split.
   */
  onResolved: (result: {
    succeededIds: number[];
    failedIds: number[];
    totalAttempted: number;
  }) => void;
  /**
   * W3 — when non-null, every selected entry shares the same
   * `target_candidate.slug` and the "一并更新 (N)" primary CTA is
   * rendered. The parent owns the check: `null` ⇒ button hides,
   * non-null string ⇒ button renders with `→ {slug}` suffix.
   * Absent/undefined is treated as null (opt-in).
   */
  mergeTargetSlug?: string | null;
  /** W3 — called when the user clicks "一并更新 (N)". Parent opens the `CombinedPreviewDialog`. */
  onMergeClick?: () => void;
}

export function BatchActionsToolbar({
  selectedIds,
  totalPending,
  onClearSelection,
  onResolved,
  mergeTargetSlug = null,
  onMergeClick,
}: BatchActionsToolbarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    succeeded: number;
    failed: number;
  } | null>(null);

  const count = selectedIds.length;
  const canSubmit = reason.trim().length >= 4 && count > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setFailure(null);
    const trimmedReason = reason.trim();

    // Q1 integration: Worker A's POST /api/wiki/inbox/batch/resolve
    // (wrapped by Worker C's `batchResolveInboxEntries` in persist.ts)
    // receives {ids, action, reason} atomically. The server enforces
    // action="reject" + reason >= 4 chars and returns a {success,
    // failed[]} split. On a legacy server without the batch route the
    // wrapper transparently falls back to per-id single resolves
    // (see `persist.ts`), so this call is safe across deploys.
    const succeededIds: number[] = [];
    const failedIds: number[] = [];
    const errorMessages: string[] = [];
    try {
      const result = await batchResolveInboxEntries(
        selectedIds,
        "reject",
        trimmedReason,
      );
      succeededIds.push(...result.success);
      for (const f of result.failed) {
        failedIds.push(f.id);
        errorMessages.push(`#${String(f.id).padStart(5, "0")}: ${f.error}`);
      }
    } catch (err) {
      // Batch call blew up wholesale (network, 500, 4xx with no body).
      // Treat every selected id as failed so the user can retry.
      const msg = err instanceof Error ? err.message : String(err);
      for (const id of selectedIds) {
        failedIds.push(id);
        errorMessages.push(`#${String(id).padStart(5, "0")}: ${msg}`);
      }
    }

    setSubmitting(false);

    if (failedIds.length === 0) {
      setDialogOpen(false);
      setReason("");
      onResolved({
        succeededIds,
        failedIds,
        totalAttempted: selectedIds.length,
      });
      return;
    }

    // Partial / full failure — keep the dialog open, show the banner.
    setFailure({
      message: errorMessages.slice(0, 3).join("\n"),
      succeeded: succeededIds.length,
      failed: failedIds.length,
    });
    onResolved({
      succeededIds,
      failedIds,
      totalAttempted: selectedIds.length,
    });
  };

  const handleDialogChange = (next: boolean) => {
    if (submitting) return; // don't close mid-submit
    setDialogOpen(next);
    if (!next) {
      setReason("");
      setFailure(null);
    }
  };

  return (
    <div className="flex w-full items-center justify-between gap-3 border-b border-border/40 bg-muted/10 px-6 py-3">
      <div className="min-w-0">
        <div
          className="font-medium text-foreground"
          style={{ fontSize: 13 }}
        >
          已选 {count} 条
          <span
            className="ml-2 text-muted-foreground/60"
            style={{ fontSize: 11 }}
          >
            / {totalPending} 条待处理
          </span>
        </div>
        <div
          className="mt-0.5 text-muted-foreground/60"
          style={{ fontSize: 11 }}
        >
          在左侧勾选任务后可批量拒绝；单条处理请关闭批量模式。
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onClearSelection}
          disabled={count === 0 || submitting}
          className="rounded-md border border-border/50 px-3 py-1.5 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-40"
          style={{ fontSize: 12 }}
        >
          清除选择
        </button>
        {/*
          W3 — "一并更新 (N)" merge CTA. Renders only when the parent
          decides every selected entry shares the same target slug
          AND at least 2 rows are selected. We deliberately hide
          (not disable) when the criteria aren't met: the button's
          very existence is the signal that the cohort is mergeable.
        */}
        {mergeTargetSlug != null && count >= 2 && onMergeClick != null && (
          <button
            type="button"
            onClick={onMergeClick}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
            style={{ fontSize: 12 }}
            title={`把选中的 ${count} 条任务一次性合并到 ${mergeTargetSlug}`}
          >
            <GitMerge className="size-3" aria-hidden />
            一并更新 ({count})
            <span
              className="ml-1 font-mono text-muted-foreground/70"
              style={{ fontSize: 10 }}
            >
              → {mergeTargetSlug}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={count === 0 || submitting}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium transition-colors disabled:opacity-40"
          style={{
            fontSize: 12,
            borderColor:
              "color-mix(in srgb, var(--color-error) 40%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--color-error) 10%, transparent)",
            color: "var(--color-error)",
          }}
        >
          <Trash2 className="size-3" aria-hidden />
          拒绝已选 ({count})…
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量拒绝 {count} 条任务</DialogTitle>
            <DialogDescription>
              统一填写拒绝原因（至少 4 字），会逐条写入每条任务的审计记录。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="batch-reject-reason"
              className="block text-muted-foreground/80"
              style={{ fontSize: 11 }}
            >
              拒绝原因{" "}
              <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <textarea
              id="batch-reject-reason"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              rows={4}
              disabled={submitting}
              placeholder="统一拒绝原因，至少 4 字 — 例如：与现有 wiki 内容重复、来源不可靠、内容质量差…"
              className="w-full resize-y rounded-md border border-border/50 bg-transparent px-2 py-1.5 font-mono text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontSize: 12, lineHeight: 1.5 }}
            />
            <div
              className="flex items-center justify-between text-muted-foreground/50"
              style={{ fontSize: 10 }}
            >
              <span>
                {reason.trim().length < 4
                  ? `还需 ${4 - reason.trim().length} 个字符`
                  : "已达最小长度"}
              </span>
              <span>{reason.length} 字</span>
            </div>
          </div>

          {failure ? (
            <FailureBanner
              severity="warning"
              title={`成功 ${failure.succeeded} 条，失败 ${failure.failed} 条`}
              description="失败的任务保留在选择中，可稍后重试或单条处理。查看技术细节里的错误列表。"
              technicalDetail={failure.message}
            />
          ) : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleDialogChange(false)}
              disabled={submitting}
              className="rounded-md border border-border/50 px-3 py-1.5 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
              style={{ fontSize: 12 }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
              style={{
                fontSize: 12,
                borderColor:
                  "color-mix(in srgb, var(--color-error) 50%, transparent)",
                backgroundColor: "var(--color-error)",
                color: "white",
              }}
            >
              {submitting ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <XCircle className="size-3" aria-hidden />
              )}
              确认拒绝 {count} 条
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
