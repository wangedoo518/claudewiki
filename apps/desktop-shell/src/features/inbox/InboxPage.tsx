/**
 * Inbox · CCD 权限确认 + 任务审阅
 *
 * Left: pending-first task list. Right (W1): the Maintainer Workbench,
 * a three-section pane — §1 Evidence, §2 Maintain, §3 Result — that
 * replaces the flat Propose→Approve detail pane. The legacy two-step
 * flow is preserved as a collapsible fallback inside §2.
 *
 * Deep-link UX: `?task=N` is the source of truth for the focused
 * entry. Selection is driven by `useDeepLinkState`; a persistent
 * `DeepLinkFocusChip` and `DeepLinkNotFoundBanner` handle reverse-sync
 * paste, missing targets, and explicit dismissal.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Inbox as InboxIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  ArrowRight,
  Sparkles,
  Save,
  CheckSquare,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  approveInboxWithWrite,
  listInboxEntries,
  proposeForInboxEntry,
  resolveInboxEntry,
} from "@/features/ingest/persist";
import type {
  InboxEntry,
  InboxResolveAction,
  MaintainAction,
  MaintainOutcome,
  MaintainResponse,
  WikiPageProposal,
} from "@/features/ingest/types";
import type { IngestDecision } from "@/lib/tauri";
import { fetchRawById, maintainInboxEntry } from "@/lib/tauri";
import { parsePositiveInt, useDeepLinkState } from "@/lib/deep-link";
import {
  CopyDeepLinkButton,
  DeepLinkFocusChip,
  DeepLinkNotFoundBanner,
} from "@/components/deep-link";
import { IngestDecisionBadge } from "@/features/inbox/components/IngestDecisionBadge";
import { URLTrackBadge } from "@/features/inbox/components/URLTrackBadge";
import { BodyPreviewPanel } from "@/features/inbox/components/BodyPreviewPanel";
import { MaintainActionRadio } from "@/features/inbox/components/MaintainActionRadio";
import { MaintainerResultCard } from "@/features/inbox/components/MaintainerResultCard";

// Worker C integration — the real WikiPageSearchField picker for
// update_existing and the navigateToWikiPage handoff for the
// MaintainerResultCard "打开 Wiki 页" CTA. Both live under
// `features/wiki/` (Worker C's canonical home for wiki-global
// primitives). The components degrade gracefully if props/ctx are
// missing, so no null-sentinel is needed here.
import { WikiPageSearchField } from "@/features/wiki/WikiPageSearchField";
import { navigateToWikiPage } from "@/features/wiki/navigate-helpers";

const inboxKeys = {
  list: () => ["wiki", "inbox", "list"] as const,
};

/** 翻译 inbox entry kind */
function translateKind(kind: string): string {
  const map: Record<string, string> = {
    "new-raw": "新素材",
    "stale": "待更新",
    "conflict": "冲突",
  };
  return map[kind] ?? kind;
}

/** 翻译 inbox entry status */
function translateStatus(status: string): string {
  const map: Record<string, string> = {
    "pending": "待处理",
    "approved": "已批准",
    "rejected": "已拒绝",
  };
  return map[status] ?? status;
}

export function InboxPage() {
  const queryClient = useQueryClient();

  // URL is the source of truth for the focused task. The hook handles
  // lazy init from ?task=N, reverse-sync on external URL changes
  // (paste, link click, back button), and URL writes via replace.
  const [selectedId, setSelectedId] = useDeepLinkState(
    "task",
    parsePositiveInt,
  );

  const listQuery = useQuery({
    queryKey: inboxKeys.list(),
    queryFn: () => listInboxEntries(),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const entries = listQuery.data?.entries ?? [];
  const selectedEntry = useMemo(
    () =>
      selectedId !== null
        ? (entries.find((e) => e.id === selectedId) ?? null)
        : null,
    [entries, selectedId],
  );

  // Focus state: renders to chip/banner/placeholder in a mutually
  // exclusive way. Unlike the pre-F2 silent-clear useEffect, we never
  // mutate URL/state behind the user's back — the "missing" branch is
  // a visible banner with an explicit dismiss button.
  //   none     → ?task absent → baseline placeholder
  //   loading  → ?task present but list still resolving (don't flash)
  //   focused  → target exists → show EntryDetail + focus chip
  //   missing  → list finished, target id not in entries → banner
  let focusState: "none" | "loading" | "focused" | "missing";
  if (selectedId === null) {
    focusState = "none";
  } else if (listQuery.isLoading) {
    focusState = "loading";
  } else if (listQuery.isError) {
    // Errors are already surfaced inside EntryList; don't double-render
    // a missing banner on top of a list-level error strip.
    focusState = "none";
  } else if (selectedEntry) {
    focusState = "focused";
  } else {
    focusState = "missing";
  }

  const selectedIdLabel =
    selectedId !== null ? `#${String(selectedId).padStart(5, "0")}` : "";

  // Scroll deep-linked task into view on initial mount only. NOT
  // dependent on selectedId — the hook's reverse-sync updates selection
  // on same-page URL pastes, and scrolling there would jitter every
  // click-to-select. Mount-time covers the primary deep-link UX
  // (external link → fresh mount → scroll to target).
  useEffect(() => {
    if (selectedId !== null) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`inbox-task-${selectedId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page head */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h1 className="text-lg text-foreground">
            Inbox
          </h1>
          <p className="mt-1 text-muted-foreground/60" style={{ fontSize: 11 }}>
            新素材自动入队 -- AI 生成知识页面 -- 审批后写入 Wiki
          </p>
        </div>
        <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
          {(listQuery.data?.pending_count ?? 0) > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`确定要清空所有 ${listQuery.data?.pending_count} 条待处理任务？`)) return;
                const pending = entries.filter((e) => e.status === "pending");
                for (const e of pending) {
                  try { await resolveInboxEntry(e.id, "reject"); } catch { /* ok */ }
                }
                void queryClient.invalidateQueries({ queryKey: inboxKeys.list() });
              }}
              className="rounded-md border border-border/40 px-2 py-0.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            >
              全部清除
            </button>
          )}
          <span
            className="rounded-full border border-border/40 px-2 py-0.5 text-muted-foreground"
            style={{ color: "var(--color-warning)" }}
          >
            {listQuery.data?.pending_count ?? 0} 待处理
          </span>
          <span className="text-muted-foreground/40">
            {listQuery.data?.total_count ?? 0} 总计
          </span>
        </div>
      </div>

      {/* Body: split pane */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r border-border/50">
          <EntryList
            entries={entries}
            isLoading={listQuery.isLoading}
            error={listQuery.error}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl">
          {focusState === "focused" && selectedEntry ? (
            <EntryDetail
              key={selectedEntry.id}
              entry={selectedEntry}
              selectedIdLabel={selectedIdLabel}
              onClearFocus={() => setSelectedId(null)}
            />
          ) : focusState === "missing" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="shrink-0 px-6 py-4">
                <DeepLinkNotFoundBanner
                  message="该任务不存在或已被删除"
                  detail={<>task {selectedIdLabel}</>}
                  onClear={() => setSelectedId(null)}
                />
              </div>
              <EntryPlaceholder />
            </div>
          ) : focusState === "loading" ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
            </div>
          ) : (
            <EntryPlaceholder />
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Entry list ───────────────────────────────────────────────── */

function EntryList({
  entries,
  isLoading,
  error,
  selectedId,
  onSelect,
}: {
  entries: InboxEntry[];
  isLoading: boolean;
  error: Error | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const queryClient = useQueryClient();

  // Sort: pending first, then newest first. Wrapped in useMemo so
  // we don't re-sort on every render; React Query triggers a fresh
  // `entries` reference only when the underlying data actually
  // changes, so `useMemo([entries])` is sufficient.
  //
  // MUST be called before any early-return — Rules of Hooks (was a
  // latent violation that surfaced once the parallel `useSidebar`
  // dev-warning spam was silenced).
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        return b.id - a.id;
      }),
    [entries],
  );

  if (isLoading) {
    return (
      <div className="flex-1 px-3 py-6 text-center text-caption text-muted-foreground">
        <Loader2 className="mx-auto mb-1.5 size-4 animate-spin" />
        加载收件箱…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="m-3 rounded-md border px-3 py-2 text-caption"
        style={{
          borderColor:
            "color-mix(in srgb, var(--color-error) 30%, transparent)",
          backgroundColor:
            "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        加载收件箱失败：{error.message}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 px-4 py-8 text-center text-caption text-muted-foreground">
        <InboxIcon className="mx-auto mb-2 size-6 opacity-40" />
        <div>暂无维护任务。</div>
        <div className="mt-1 text-caption text-muted-foreground/70">
          在{" "}
          <Link to="/raw" className="text-primary hover:underline">
            素材库
          </Link>{" "}
          中入库一条素材来生成你的第一个任务。
        </div>
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-border/30 overflow-y-auto">
      {sorted.map((entry) => {
        const isActive = entry.id === selectedId;
        return (
          <li key={entry.id} id={`inbox-task-${entry.id}`}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className={
                "w-full px-4 py-2.5 text-left transition-colors hover:bg-accent/50 " +
                (isActive
                  ? "bg-accent border-l-[3px] border-primary"
                  : "border-l-[3px] border-l-transparent")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <StatusIcon status={entry.status} />
                <span
                  className="flex-1 truncate text-foreground"
                  style={{ fontSize: 13, fontWeight: isActive ? 500 : 400 }}
                >
                  {entry.title.replace(/^New raw entry/, "新素材")}
                </span>
                <span className="shrink-0 text-muted-foreground/50" style={{ fontSize: 11 }}>
                  {translateKind(entry.kind)}
                </span>
                {entry.status === "pending" && (
                  <span
                    role="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-destructive"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void resolveInboxEntry(entry.id, "reject").then(() => {
                        void queryClient.invalidateQueries({ queryKey: inboxKeys.list() });
                      });
                    }}
                    title="删除"
                  >
                    <XCircle className="size-3" />
                  </span>
                )}
              </div>
              <div className="mt-1 truncate pl-6 text-muted-foreground/60" style={{ fontSize: 11 }}>
                {entry.description}
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-6 text-muted-foreground/40" style={{ fontSize: 11 }}>
                <Clock className="size-3" />
                {formatRelative(entry.created_at)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StatusIcon({ status }: { status: InboxEntry["status"] }) {
  if (status === "pending") {
    return (
      <AlertCircle
        className="size-4 shrink-0"
        style={{ color: "var(--color-warning)" }}
      />
    );
  }
  if (status === "approved") {
    return (
      <CheckCircle2
        className="size-4 shrink-0"
        style={{ color: "var(--color-success)" }}
      />
    );
  }
  return (
    <XCircle
      className="size-4 shrink-0"
      style={{ color: "var(--color-error)" }}
    />
  );
}

/* ─── Detail pane ──────────────────────────────────────────────── */

function EntryDetail({
  entry,
  selectedIdLabel,
  onClearFocus,
}: {
  entry: InboxEntry;
  selectedIdLabel: string;
  onClearFocus: () => void;
}) {
  const queryClient = useQueryClient();

  // Legacy proposal state (scoped to entry.id — reset on switch).
  const [proposal, setProposal] = useState<WikiPageProposal | null>(null);

  // W1 Workbench state: §2 decision, §3 result envelope.
  const [maintainAction, setMaintainAction] = useState<MaintainAction>("create_new");
  const [targetPageSlug, setTargetPageSlug] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [maintainResult, setMaintainResult] = useState<MaintainResponse | null>(null);

  // Raw detail — drives §1 Evidence (skipped when source_raw_id is null).
  const rawQuery = useQuery({
    queryKey: ["raw", entry.source_raw_id ?? null],
    queryFn: () =>
      entry.source_raw_id != null
        ? fetchRawById(entry.source_raw_id)
        : Promise.resolve(null),
    enabled: entry.source_raw_id != null,
    staleTime: 30_000,
  });
  const rawEntry = rawQuery.data?.entry ?? null;
  const rawBody = rawQuery.data?.body ?? null;

  // Legacy Propose → Approve flow — fallback inside §2, unchanged.
  const resolveMutation = useMutation({
    mutationFn: (action: InboxResolveAction) => resolveInboxEntry(entry.id, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.list() });
    },
  });
  const proposeMutation = useMutation({
    mutationFn: () => proposeForInboxEntry(entry.id),
    onSuccess: (data) => setProposal(data.proposal),
  });
  const writeMutation = useMutation({
    mutationFn: (p: WikiPageProposal) => approveInboxWithWrite(entry.id, p),
    onSuccess: () => {
      setProposal(null);
      void queryClient.invalidateQueries({ queryKey: inboxKeys.list() });
    },
  });

  // W1 primary mutation: `POST /api/wiki/inbox/{id}/maintain`.
  const maintainMutation = useMutation({
    mutationFn: () =>
      maintainInboxEntry(entry.id, {
        action: maintainAction,
        target_page_slug:
          maintainAction === "update_existing" ? targetPageSlug ?? undefined : undefined,
        rejection_reason:
          maintainAction === "reject" ? rejectionReason.trim() : undefined,
      }),
    onSuccess: (response) => {
      setMaintainResult(response);
      void queryClient.invalidateQueries({ queryKey: inboxKeys.list() });
    },
    onError: (err) => {
      // Normalise errors into MaintainResponse so §3 renders a `failed` card.
      setMaintainResult({
        outcome: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    },
  });

  // Reset Workbench state on entry switch.
  useEffect(() => {
    setMaintainAction("create_new");
    setTargetPageSlug(null);
    setRejectionReason("");
    setMaintainResult(null);
  }, [entry.id]);

  const isResolved = entry.status !== "pending";
  const canMaintain =
    !isResolved &&
    entry.kind === "new-raw" &&
    entry.source_raw_id != null &&
    proposal === null;

  const anyPending =
    resolveMutation.isPending ||
    proposeMutation.isPending ||
    writeMutation.isPending ||
    maintainMutation.isPending;

  // `执行` gate: create_new always; update_existing needs slug; reject needs ≥4 chars.
  const canExecuteMaintain = useMemo(() => {
    if (isResolved || anyPending) return false;
    switch (maintainAction) {
      case "create_new": return true;
      case "update_existing": return (targetPageSlug?.trim().length ?? 0) > 0;
      case "reject": return rejectionReason.trim().length >= 4;
      default: return false;
    }
  }, [isResolved, anyPending, maintainAction, targetPageSlug, rejectionReason]);

  // §3 outcome: prefer live mutation result, fall back to server-stamped entry fields.
  const resolvedOutcome: MaintainOutcome | null = useMemo(() => {
    if (maintainResult) return maintainResult.outcome;
    if (entry.maintain_outcome) return entry.maintain_outcome;
    if (entry.status === "approved") return "updated";
    if (entry.status === "rejected") return "rejected";
    return null;
  }, [maintainResult, entry.maintain_outcome, entry.status]);

  // Runtime-guard `last_ingest_decision` (typed as `unknown` for forward-compat).
  const rawDecision: IngestDecision | null = useMemo(() => {
    const candidate = rawEntry?.last_ingest_decision;
    if (
      candidate &&
      typeof candidate === "object" &&
      "kind" in candidate &&
      typeof (candidate as { kind?: unknown }).kind === "string"
    ) {
      return candidate as IngestDecision;
    }
    return null;
  }, [rawEntry]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusIcon status={entry.status} />
              <span className="font-mono text-muted-foreground/40" style={{ fontSize: 11 }}>
                #{String(entry.id).padStart(5, "0")}
              </span>
              <span className="text-muted-foreground/50" style={{ fontSize: 11 }}>
                {entry.kind}
              </span>
              <StatusPill status={entry.status} />
            </div>
            <h2 className="mt-2 text-lg text-foreground">
              {entry.title}
            </h2>
            {/* F2: persistent focus chip with copy-link action + clear */}
            <div className="mt-2">
              <DeepLinkFocusChip
                onClear={onClearFocus}
                action={<CopyDeepLinkButton variant="compact" />}
              >
                <CheckSquare className="size-3" />
                聚焦中 {selectedIdLabel}
              </DeepLinkFocusChip>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground/40" style={{ fontSize: 11 }}>
              <span>创建于: {entry.created_at}</span>
              {entry.resolved_at && <span>处理于: {entry.resolved_at}</span>}
              {entry.source_raw_id != null && (
                <Link
                  to={`/raw?entry=${entry.source_raw_id}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  style={{ fontSize: 11 }}
                >
                  <FileText className="size-3" />
                  raw #{String(entry.source_raw_id).padStart(5, "0")}
                  <ArrowRight className="size-3" />
                </Link>
              )}
            </div>
          </div>
          {/* F2 contract 4.6: explicit close button returns to the
              default list view. The FocusChip × duplicates this action,
              but a standalone affordance in the header corner matches
              the wider close-pattern vocabulary users expect on detail
              panes. */}
          <button
            type="button"
            onClick={onClearFocus}
            title="清除聚焦"
            aria-label="清除聚焦"
            className="shrink-0 rounded-md border border-border/40 p-1 text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        {/* ── Description (unchanged, still the first thing users see) */}
        <div>
          <h3 className="mb-2 uppercase tracking-widest text-muted-foreground/60" style={{ fontSize: 11 }}>
            描述
          </h3>
          <p className="whitespace-pre-wrap text-foreground/90" style={{ fontSize: 14, lineHeight: 1.6 }}>
            {entry.description
              .replace(/^Raw entry/, "素材")
              .replace("was ingested from WeChat user", "由微信用户")
              .replace("Proposed action: summarise into a concept page.", "转发入库。建议操作：总结为概念知识页面。")
            }
          </p>
        </div>

        {/* ══ Section 1 · Evidence ══════════════════════════════════ */}
        <WorkbenchSection
          number={1}
          title="证据"
          english="Evidence"
          hint="素材的抓取来源、规范化 URL、正文预览 — 以及（若存在）AI 预生成草稿。"
        >
          <EvidenceSection
            entry={entry}
            rawBody={rawBody}
            rawFilename={rawEntry?.filename ?? null}
            rawIngestedAt={rawEntry?.ingested_at ?? null}
            rawDecision={rawDecision}
            canonicalUrl={rawEntry?.canonical_url ?? null}
            originalUrl={rawEntry?.original_url ?? null}
            sourceUrl={rawEntry?.source_url ?? null}
            isLoading={rawQuery.isLoading}
          />
        </WorkbenchSection>

        {/* ══ Section 2 · Maintain ══════════════════════════════════ */}
        <WorkbenchSection
          number={2}
          title="决策"
          english="Maintain"
          hint="选择维护动作：新建 / 合并 / 拒绝。legacy propose→approve 保留在下方作为备用流程。"
        >
          {isResolved ? (
            <div
              className="rounded-md border border-border/40 bg-muted/10 px-4 py-3 text-muted-foreground/80"
              style={{ fontSize: 12 }}
            >
              任务{translateStatus(entry.status)} — 决策区已锁定。结果见下方 §3。
            </div>
          ) : (
            <div className="space-y-4">
              <MaintainActionRadio
                value={maintainAction}
                onValueChange={setMaintainAction}
                targetPageSlug={targetPageSlug}
                rejectionReason={rejectionReason}
                onRejectionReasonChange={setRejectionReason}
                disabled={anyPending}
                wikiPageSearchSlot={
                  // Worker C's WikiPageSearchField. Coerce null → undefined
                  // because Worker A's state carries `string | null` but
                  // Worker C's `value` prop is `string | undefined` (both
                  // mean "unselected" — just different nullish dialects).
                  <WikiPageSearchField
                    value={targetPageSlug ?? undefined}
                    onSelect={(slug) => setTargetPageSlug(slug)}
                  />
                }
              />

              <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
                <button
                  type="button"
                  onClick={() => maintainMutation.mutate()}
                  disabled={!canExecuteMaintain}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  style={{ fontSize: 13 }}
                >
                  {maintainMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                  执行
                </button>
              </div>

              {/* ── Legacy Propose / Approve fallback ───────────── */}
              <LegacyMaintainFallback
                canMaintain={canMaintain}
                anyPending={anyPending}
                proposal={proposal}
                onPropose={() => proposeMutation.mutate()}
                onReject={() => resolveMutation.mutate("reject")}
                onApprove={() => resolveMutation.mutate("approve")}
                onWrite={(p) => writeMutation.mutate(p)}
                proposeLoading={proposeMutation.isPending}
                rejectLoading={resolveMutation.isPending}
                approveLoading={resolveMutation.isPending}
                writeLoading={writeMutation.isPending}
              />
            </div>
          )}

          {/* Error strip — surfaces both the new maintain error and
              any legacy-flow error so users never miss feedback. */}
          {(proposeMutation.error ||
            writeMutation.error ||
            resolveMutation.error ||
            maintainMutation.error) && (
            <div
              className="mt-3 rounded-md border px-3 py-2 text-caption"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--color-error) 30%, transparent)",
                backgroundColor:
                  "color-mix(in srgb, var(--color-error) 5%, transparent)",
                color: "var(--color-error)",
              }}
            >
              {maintainMutation.error && (
                <div>维护失败：{String(maintainMutation.error)}</div>
              )}
              {proposeMutation.error && (
                <div>生成失败：{String(proposeMutation.error)}</div>
              )}
              {writeMutation.error && (
                <div>写入失败：{String(writeMutation.error)}</div>
              )}
              {resolveMutation.error && (
                <div>处理失败：{String(resolveMutation.error)}</div>
              )}
            </div>
          )}
        </WorkbenchSection>

        {/* ══ Section 3 · Result ══════════════════════════════════ */}
        {resolvedOutcome && (
          <WorkbenchSection
            number={3}
            title="结果"
            english="Result"
            hint="执行结果 — 成功时可直接打开 Wiki 页；失败可重试；拒绝附原因。"
          >
            <MaintainerResultCard
              outcome={resolvedOutcome}
              targetPageSlug={
                maintainResult?.target_page_slug ?? entry.target_page_slug ?? null
              }
              rejectionReason={
                maintainResult?.rejection_reason ?? entry.rejection_reason ?? null
              }
              errorMessage={maintainResult?.error ?? entry.maintain_error ?? null}
              onRetry={() => {
                setMaintainResult(null);
                maintainMutation.reset();
              }}
              onOpenWikiPage={(slug) =>
                navigateToWikiPage(slug, entry.proposed_title ?? slug, "maintain-result")
              }
            />
          </WorkbenchSection>
        )}
      </div>
    </div>
  );
}

/* ─── Workbench section shell ──────────────────────────────────── */

/**
 * Shared card wrapper for the three Workbench sections. Numbered
 * badge + bilingual title + hint line + bordered body.
 */
function WorkbenchSection({
  number,
  title,
  english,
  hint,
  children,
}: {
  number: number;
  title: string;
  english: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-2 flex items-baseline gap-2">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-primary"
          style={{ fontSize: 10 }}
        >
          {number}
        </span>
        <h3 className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>{title}</h3>
        <span className="font-mono uppercase tracking-widest text-muted-foreground/60" style={{ fontSize: 10 }}>{english}</span>
      </header>
      <p className="mb-2 text-muted-foreground/70" style={{ fontSize: 11, lineHeight: 1.5 }}>{hint}</p>
      <div className="rounded-md border border-border/30 bg-background/50 px-4 py-3">{children}</div>
    </section>
  );
}

/* ─── Evidence section ─────────────────────────────────────────── */

/**
 * Section 1 of the Workbench — three stacked sub-cards: source card
 * (decision + URL track + raw deep link), body preview, and an
 * optional Propose draft card (only when `entry.proposed_*` is set).
 */
function EvidenceSection({
  entry,
  rawBody,
  rawFilename,
  rawIngestedAt,
  rawDecision,
  canonicalUrl,
  originalUrl,
  sourceUrl,
  isLoading,
}: {
  entry: InboxEntry;
  rawBody: string | null;
  rawFilename: string | null;
  rawIngestedAt: string | null;
  rawDecision: IngestDecision | null;
  canonicalUrl: string | null;
  originalUrl: string | null;
  sourceUrl: string | null;
  isLoading: boolean;
}) {
  const hasProposedDraft = Boolean(
    entry.proposed_title?.length ||
      entry.proposed_summary?.length ||
      entry.proposed_content_markdown?.length,
  );
  const headerCls =
    "font-mono uppercase tracking-widest text-muted-foreground/60";
  return (
    <div className="space-y-3">
      {/* 1. Source card — decision + URL + raw deep link */}
      <div className="rounded-md border border-border/40 bg-muted/5 px-3 py-2 space-y-2">
        <div className={`flex items-center gap-2 ${headerCls}`} style={{ fontSize: 10 }}>
          <span>来源 / Source</span>
          {entry.source_raw_id != null && rawFilename && (
            <span className="text-muted-foreground/40">{rawFilename}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IngestDecisionBadge decision={rawDecision} />
          {rawIngestedAt && (
            <span className="font-mono text-muted-foreground/60" style={{ fontSize: 11 }}>
              {rawIngestedAt}
            </span>
          )}
        </div>
        <URLTrackBadge canonicalUrl={canonicalUrl} originalUrl={originalUrl} sourceUrl={sourceUrl} />
        {entry.source_raw_id != null && (
          <Link
            to={`/raw?entry=${entry.source_raw_id}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            style={{ fontSize: 11 }}
          >
            <FileText className="size-3" />
            在 Raw Library 打开 raw #{String(entry.source_raw_id).padStart(5, "0")}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      {/* 2. Body preview */}
      <div>
        <div className={`mb-1 ${headerCls}`} style={{ fontSize: 10 }}>正文预览 / Body</div>
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-border/40 px-3 py-4 text-muted-foreground/60" style={{ fontSize: 11 }}>
            <Loader2 className="size-3 animate-spin" />
            加载 raw 正文中…
          </div>
        ) : (
          <BodyPreviewPanel body={rawBody ?? ""} heading={rawFilename ?? undefined} />
        )}
      </div>

      {/* 3. Propose draft (only when proposed_* fields are present) */}
      {hasProposedDraft && (
        <div>
          <div className={`mb-1 ${headerCls}`} style={{ fontSize: 10 }}>Propose 预览 / Draft</div>
          <div className="rounded-md border border-border/40 bg-muted/5 px-3 py-2">
            {entry.proposed_wiki_slug && (
              <div className="mb-1 font-mono text-muted-foreground/60" style={{ fontSize: 10 }}>
                {entry.proposed_wiki_slug}
              </div>
            )}
            {entry.proposed_title && (
              <div className="text-foreground" style={{ fontSize: 14, fontWeight: 500 }}>{entry.proposed_title}</div>
            )}
            {entry.proposed_summary && (
              <div className="mt-1 text-muted-foreground/80" style={{ fontSize: 12 }}>{entry.proposed_summary}</div>
            )}
            {entry.proposed_content_markdown && (
              <div className="mt-2">
                <BodyPreviewPanel body={entry.proposed_content_markdown} collapsedLines={6} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Legacy maintain fallback ─────────────────────────────────── */

/** Collapsible pre-W1 propose/approve/reject flow — kept inside §2 as a fallback. */
function LegacyMaintainFallback({
  canMaintain, anyPending, proposal,
  onPropose, onReject, onApprove, onWrite,
  proposeLoading, rejectLoading, approveLoading, writeLoading,
}: {
  canMaintain: boolean;
  anyPending: boolean;
  proposal: WikiPageProposal | null;
  onPropose: () => void;
  onReject: () => void;
  onApprove: () => void;
  onWrite: (p: WikiPageProposal) => void;
  proposeLoading: boolean;
  rejectLoading: boolean;
  approveLoading: boolean;
  writeLoading: boolean;
}) {
  const btnBase = "flex items-center gap-1 rounded-md px-2 py-1 transition-colors disabled:opacity-50";
  const outlineCls = `${btnBase} border border-border/50 text-muted-foreground hover:border-border hover:text-foreground`;
  const primaryCls = `${btnBase} bg-primary/90 text-primary-foreground hover:bg-primary`;
  return (
    <details className="rounded-md border border-dashed border-border/40 px-3 py-2">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground" style={{ fontSize: 11 }}>
        备用流程：Propose → Approve（legacy）
      </summary>
      <div className="mt-2 space-y-2">
        {proposal ? (
          <div className="space-y-2">
            <h4 className="uppercase tracking-widest text-muted-foreground/60" style={{ fontSize: 10 }}>生成的知识页面</h4>
            <ProposalPreview proposal={proposal} />
          </div>
        ) : (
          <div className="text-muted-foreground/70" style={{ fontSize: 12 }}>
            调用一次 AI 总结（≤200 词）。在你批准之前不会写入磁盘。
          </div>
        )}
        <div className="flex items-center justify-end gap-2" style={{ fontSize: 11 }}>
          {canMaintain && !proposal && (
            <button type="button" onClick={onPropose} disabled={anyPending} className={outlineCls}>
              {proposeLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              开始维护（旧）
            </button>
          )}
          <button type="button" onClick={onReject} disabled={anyPending} className={`${btnBase} border border-border/50 text-muted-foreground hover:border-destructive hover:text-destructive`}>
            <XCircle className="size-3" />
            拒绝
          </button>
          {proposal ? (
            <button type="button" onClick={() => onWrite(proposal)} disabled={anyPending} className={primaryCls}>
              {writeLoading ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              批准并写入
            </button>
          ) : (
            <button type="button" onClick={onApprove} disabled={anyPending} className={primaryCls}>
              {approveLoading || rejectLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              批准
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

/**
 * Render a `WikiPageProposal` as a reviewable card: slug + title +
 * summary + body preview. Hard-pins the body to pre-wrap so the
 * LLM's newlines survive, and caps the visible body at a reasonable
 * height (the whole body is always there, just in an internal
 * scrollable region so the detail pane doesn't jump in size).
 */
function ProposalPreview({ proposal }: { proposal: WikiPageProposal }) {
  return (
    <div className="rounded-md border border-border/40 bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border/30 px-4 py-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-muted-foreground/40" style={{ fontSize: 11 }}>
            <span className="font-mono">
              {proposal.slug}
            </span>
            <span>
              from raw #{String(proposal.source_raw_id).padStart(5, "0")}
            </span>
          </div>
          <div
            className="mt-1.5 text-foreground"
            style={{ fontSize: 16 }}
          >
            {proposal.title}
          </div>
          <div className="mt-1 text-muted-foreground/60" style={{ fontSize: 12 }}>
            {proposal.summary}
          </div>
        </div>
      </div>
      <div className="max-h-64 overflow-auto px-4 py-3">
        <pre className="whitespace-pre-wrap text-body-sm text-foreground/90">
          {proposal.body}
        </pre>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: InboxEntry["status"] }) {
  const config = {
    pending: { label: "待处理", color: "var(--color-warning)" },
    approved: { label: "已批准", color: "var(--color-success)" },
    rejected: { label: "已拒绝", color: "var(--color-error)" },
  }[status];
  return (
    <span
      className="rounded-full border px-1.5 py-0.5 text-caption font-medium"
      style={{
        borderColor: `color-mix(in srgb, ${config.color} 40%, transparent)`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

function EntryPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <InboxIcon className="mx-auto mb-2 size-8 opacity-30" />
        <p className="text-body text-muted-foreground">
          选择左侧任务进行审阅。
        </p>
      </div>
    </div>
  );
}

/* ─── Time formatting ──────────────────────────────────────────── */

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const deltaSecs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (deltaSecs < 60) return `${deltaSecs}秒前`;
  if (deltaSecs < 3600) return `${Math.floor(deltaSecs / 60)}分钟前`;
  if (deltaSecs < 86_400) return `${Math.floor(deltaSecs / 3600)}小时前`;
  return `${Math.floor(deltaSecs / 86_400)}天前`;
}
