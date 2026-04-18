/**
 * W3 — `CombinedPreviewDialog` is the Maintainer multi-proposal merge
 * surface. Rendered when Inbox is in batch mode, ≥2 entries are
 * selected, and every one of them carries the same
 * `intelligence.target_candidate.slug`. The user clicks "一并更新 (N)"
 * on the `BatchActionsToolbar` and lands here.
 *
 * The dialog walks a single N→1 server round-trip:
 *
 *   1. On open, `fetchCombinedProposal({target_slug, inbox_ids})` pulls
 *      the target page snapshot, an LLM-merged after_markdown, a
 *      ≤200-字 Chinese summary, plus a stable `before_hash` for optimistic
 *      concurrency.
 *   2. The user previews (header + items list + two-column markdown
 *      diff + summary), then commits with "完成合并" which POSTs to
 *      `applyCombinedProposal` with the `expected_before_hash`. The
 *      server either applies all, rejects on concurrent edit (409), or
 *      returns `partial_applied` when some inbox rows vanished.
 *   3. On success, the parent `onApplied` callback refetches the inbox,
 *      drops the selection, exits batch mode, and closes the dialog.
 *
 * Failure ladder:
 *   - "concurrent_edit" outcome ⇒ FailureBanner "目标页已被修改" with a
 *     retry that refetches the preview (new hash + fresh markdown).
 *   - any thrown error ⇒ generic FailureBanner with the raw message
 *     available via the technical-detail fold.
 *   - cancel is zero-server — Ephemeral preview discarded on close.
 *
 * Types + wrappers live in `@/lib/tauri` (generated from the Rust
 * side by Worker A). Imported directly so schema drift fails at
 * compile time.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, GitMerge } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FailureBanner } from "@/components/ui/failure-banner";
import { WikiPageDiffPreview } from "@/features/inbox/components/WikiPageDiffPreview";
import {
  applyCombinedProposal,
  fetchCombinedProposal,
  type CombinedApplyResponse,
  type CombinedProposalResponse,
} from "@/lib/tauri";

export type { CombinedApplyResponse };

// ── Public props ────────────────────────────────────────────────────

export interface CombinedPreviewDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Target wiki slug shared by every selected entry. */
  targetSlug: string;
  /** Selected inbox entry ids. Must be ≥2 for the dialog to fetch. */
  inboxIds: number[];
  /**
   * Per-id Q2 `target_candidate` score (optional — only used for the
   * "#id · title · score · raw" list row when the parent has the
   * intelligence envelope handy).
   */
  scores?: Map<number, number>;
  /**
   * Per-id `InboxEntry.title` (optional — parent typically hands this
   * down from `intelligentEntries` so we don't second-fetch the list).
   */
  titles?: Map<number, string>;
  /**
   * Per-id `InboxEntry.source_raw_id` — used for the "raw#N" suffix in
   * the items list. Optional to stay forward-compatible with older
   * parent callsites.
   */
  sourceRawIds?: Map<number, number | null | undefined>;
  /** Called after a successful apply so the parent can refetch + exit batch mode. */
  onApplied: (result: CombinedApplyResponse) => void;
}

// ── Component ───────────────────────────────────────────────────────

export function CombinedPreviewDialog({
  open,
  onOpenChange,
  targetSlug,
  inboxIds,
  scores,
  titles,
  sourceRawIds,
  onApplied,
}: CombinedPreviewDialogProps) {
  // Stable order for the query key so equivalent selections share the
  // cache entry regardless of click order.
  const sortedIds = useMemo(
    () => [...inboxIds].sort((a, b) => a - b),
    [inboxIds],
  );
  const count = sortedIds.length;

  const canFetch = open && count >= 2 && targetSlug.length > 0;

  const previewQuery = useQuery({
    queryKey: [
      "wiki",
      "inbox",
      "combined-proposal",
      targetSlug,
      sortedIds.join(","),
    ],
    queryFn: () =>
      fetchCombinedProposal({
        target_slug: targetSlug,
        inbox_ids: sortedIds,
      }),
    enabled: canFetch,
    // Preview is expensive (LLM round trip) — once generated, keep it
    // for the life of the dialog. The user's "放弃此次合并" closes the
    // dialog and invalidates via unmount; "重试" manually refetches.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  // Apply state — mutation-like but we drive it imperatively so we can
  // branch on the discriminated `outcome` string without making
  // `useMutation`'s generic soup verbose.
  const [applyState, setApplyState] = useApplyState();

  const handleCancel = useCallback(() => {
    // Ephemeral — no server round-trip for cancel. Just close.
    onOpenChange(false);
  }, [onOpenChange]);

  const handleRetry = useCallback(() => {
    setApplyState({ phase: "idle" });
    void previewQuery.refetch();
  }, [previewQuery, setApplyState]);

  const handleApply = useCallback(async () => {
    const preview = previewQuery.data;
    if (!preview) return;
    setApplyState({ phase: "submitting" });
    try {
      const result = await applyCombinedProposal({
        target_slug: targetSlug,
        inbox_ids: sortedIds,
        expected_before_hash: preview.before_hash,
        after_markdown: preview.after_markdown,
        summary: preview.summary,
      });
      if (result.outcome === "concurrent_edit") {
        setApplyState({
          phase: "error",
          kind: "concurrent",
          message: "目标页已被修改，请重新生成后再合并。",
        });
        return;
      }
      // applied / partial_applied / stale_inbox are all "the server
      // accepted the write" — we let the parent handle the downstream
      // refetch + toast. partial_applied surfaces non-fatally; the
      // parent's inbox invalidation will prune any applied ids.
      onApplied(result);
      setApplyState({ phase: "idle" });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApplyState({ phase: "error", kind: "generic", message: msg });
    }
  }, [
    onApplied,
    onOpenChange,
    previewQuery.data,
    setApplyState,
    sortedIds,
    targetSlug,
  ]);

  const handleDialogChange = useCallback(
    (next: boolean) => {
      if (applyState.phase === "submitting") return; // don't close mid-submit
      onOpenChange(next);
      if (!next) {
        // Reset apply state so re-opening starts fresh.
        setApplyState({ phase: "idle" });
      }
    },
    [applyState.phase, onOpenChange, setApplyState],
  );

  // ── Render ────────────────────────────────────────────────────────

  const isLoading = previewQuery.isLoading || previewQuery.isFetching;
  const isError = previewQuery.isError;
  const preview = previewQuery.data;

  // Skeleton mode is the "Worker A 未上线" signal: the stub returns
  // empty markdown + empty hash, so `ready` never stays true. We treat
  // a successful-but-empty response as still-loading so the user sees
  // the spinner copy instead of an empty ghost dialog.
  const isReady =
    !isLoading &&
    !isError &&
    preview != null &&
    preview.before_hash.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent
        className="sm:max-w-3xl md:max-w-4xl lg:max-w-5xl"
        showCloseButton={applyState.phase !== "submitting"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-4 text-primary" aria-hidden />
            合并 {count} 条任务到{" "}
            <span className="font-mono text-primary">{targetSlug}</span>
          </DialogTitle>
          <DialogDescription>
            LLM 会把选中任务的内容融合进目标页，一次生成 diff 预览 + 变更摘要，确认后原子提交。
          </DialogDescription>
        </DialogHeader>

        {/* § 1 — Items list (always visible; drives the "what am I merging?" trust). */}
        <ItemsList
          inboxIds={sortedIds}
          scores={scores}
          titles={titles}
          sourceRawIds={sourceRawIds}
          preview={preview}
        />

        {/* § 2 — Diff body (skeleton | error | ready). */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <DiffLoading count={count} />
          ) : isError ? (
            <FailureBanner
              severity="error"
              title="合并预览生成失败"
              description="无法从后端获取合并结果，请稍后重试或联系维护者。"
              technicalDetail={
                previewQuery.error instanceof Error
                  ? previewQuery.error.message
                  : String(previewQuery.error ?? "")
              }
              actions={[{ label: "重试", onClick: () => void previewQuery.refetch() }]}
            />
          ) : !isReady ? (
            // Successful fetch but no `before_hash` → Worker A stub is
            // still in effect. Keep the skeleton so the absence of the
            // real backend is loud.
            <DiffLoading count={count} hint="（Worker A 接口未就绪，显示占位）" />
          ) : (
            <>
              <WikiPageDiffPreview
                before={preview!.before_markdown}
                after={preview!.after_markdown}
              />
              <SummaryBlock summary={preview!.summary} />
            </>
          )}
        </div>

        {/* § 3 — Apply-phase error surface (concurrent / generic). */}
        {applyState.phase === "error" && (
          <FailureBanner
            severity="error"
            title={
              applyState.kind === "concurrent"
                ? "合并失败 · 目标页已被修改"
                : "合并失败"
            }
            description={applyState.message}
            actions={[
              {
                label: applyState.kind === "concurrent" ? "重新生成" : "重试",
                onClick: handleRetry,
              },
            ]}
          />
        )}

        {/* § 4 — Footer actions. */}
        <DialogFooter>
          <button
            type="button"
            onClick={handleCancel}
            disabled={applyState.phase === "submitting"}
            className="rounded-md border border-border/50 px-3 py-1.5 text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
            style={{ fontSize: 12 }}
          >
            放弃此次合并
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={!isReady || applyState.phase === "submitting"}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            style={{ fontSize: 12 }}
          >
            {applyState.phase === "submitting" ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <GitMerge className="size-3" aria-hidden />
            )}
            完成合并 ({count})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

/**
 * Ordered, dedup-friendly list of the entries being rolled into the
 * merge. We prefer the `source_titles` sent back by the server (so
 * the user sees the LLM's understanding of each row), and fall back
 * to the parent-supplied `titles`/`sourceRawIds` maps when the
 * preview hasn't arrived yet. Sorted by Q2 score desc when scores
 * are available — otherwise preserves selection order.
 */
function ItemsList({
  inboxIds,
  scores,
  titles,
  sourceRawIds,
  preview,
}: {
  inboxIds: number[];
  scores?: Map<number, number>;
  titles?: Map<number, string>;
  sourceRawIds?: Map<number, number | null | undefined>;
  preview: CombinedProposalResponse | undefined;
}) {
  // Combine data from preview (authoritative titles + raw ids) with
  // parent-supplied maps (available synchronously before fetch).
  const rows = useMemo(() => {
    const byId = new Map<
      number,
      { title: string; rawId: number | null | undefined; score: number }
    >();
    for (const id of inboxIds) {
      byId.set(id, {
        title: titles?.get(id) ?? `#${id}`,
        rawId: sourceRawIds?.get(id) ?? null,
        score: scores?.get(id) ?? 0,
      });
    }
    if (preview?.source_titles) {
      for (const s of preview.source_titles) {
        const prev = byId.get(s.inbox_id);
        byId.set(s.inbox_id, {
          title: s.title || prev?.title || `#${s.inbox_id}`,
          rawId: s.source_raw_id ?? prev?.rawId ?? null,
          score: prev?.score ?? 0,
        });
      }
    }
    const merged = inboxIds.map((id) => ({
      id,
      ...(byId.get(id) ?? { title: `#${id}`, rawId: null, score: 0 }),
    }));
    // Score desc as per spec; stable fallback = id asc.
    merged.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id - b.id;
    });
    return merged;
  }, [inboxIds, preview, scores, sourceRawIds, titles]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border border-border/30 bg-muted/5">
      <div
        className="flex items-center justify-between border-b border-border/30 bg-muted/10 px-3 py-1.5 font-mono uppercase tracking-widest text-muted-foreground/70"
        style={{ fontSize: 10 }}
      >
        <span>纳入任务 / Items</span>
        <span>{rows.length} 条（按得分倒序）</span>
      </div>
      <ul
        className="max-h-40 divide-y divide-border/20 overflow-auto"
        style={{ fontSize: 12 }}
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 px-3 py-1.5"
          >
            <span
              className="shrink-0 font-mono text-muted-foreground/70"
              style={{ fontSize: 11 }}
            >
              #{String(row.id).padStart(5, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {row.title}
            </span>
            {row.score > 0 && (
              <span
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-primary"
                style={{ fontSize: 10 }}
                title="Q2 target_candidate score"
              >
                {row.score}
              </span>
            )}
            {row.rawId != null && (
              <span
                className="shrink-0 font-mono text-muted-foreground/50"
                style={{ fontSize: 10 }}
              >
                raw#{row.rawId}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** LLM-generated ≤200-字 Chinese summary shown below the diff. */
function SummaryBlock({ summary }: { summary: string }) {
  if (!summary || summary.trim().length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <div
        className="font-mono uppercase tracking-widest text-primary/80"
        style={{ fontSize: 10 }}
      >
        变更摘要 / Summary
      </div>
      <p
        className="mt-1 whitespace-pre-wrap text-foreground/90"
        style={{ fontSize: 12, lineHeight: 1.55 }}
      >
        {summary}
      </p>
    </div>
  );
}

/** Skeleton shown while the preview round-trip is in flight. */
function DiffLoading({ count, hint }: { count: number; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border/40 bg-muted/5 px-6 py-10 text-center">
      <Loader2 className="size-6 animate-spin text-primary/70" aria-hidden />
      <div className="text-foreground" style={{ fontSize: 13 }}>
        正在分析 {count} 条内容…
      </div>
      <div
        className="text-muted-foreground/60"
        style={{ fontSize: 11 }}
      >
        LLM 会合并内容、生成 diff 预览和摘要，通常需要 5–20 秒。
      </div>
      {hint && (
        <div
          className="mt-1 text-muted-foreground/50"
          style={{ fontSize: 10 }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// ── Local hook — apply-phase state machine ──────────────────────────

type ApplyState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | {
      phase: "error";
      kind: "concurrent" | "generic";
      message: string;
    };

// Tiny wrapper so the body of the component reads as a state machine
// rather than raw `useState` in the middle of callbacks. Keeping this
// inlined to the file (rather than a shared hook) since the semantics
// are dialog-specific.
function useApplyState() {
  return useState<ApplyState>({ phase: "idle" });
}
