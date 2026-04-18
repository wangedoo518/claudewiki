/**
 * WikiPageDiffPreview — side-by-side Markdown diff panel for the W2
 * update_existing preview/apply flow.
 *
 * The Maintainer Workbench Section 2 shows this component in Phase 2
 * (after `createProposal` succeeds) so the user can review the merged
 * target page before committing. We deliberately avoid a word-level
 * diff lib here — this is a first-pass preview, not a full Monaco-style
 * diff viewer. Two ReactMarkdown panes rendered in a two-column grid
 * gives the user enough signal to decide "apply" vs "cancel" without
 * pulling in a new dependency (react-markdown is already on disk via
 * WikiArticle.tsx).
 *
 * Visual contract per the task spec:
 *   - Optional one-line `summary` above the columns (italic, muted).
 *   - Two columns with bilingual headers ("当前页面 / Before",
 *     "更新后 / After") and per-column `max-h-[400px] overflow-auto`
 *     guards so the diff never blows out the Workbench pane height.
 *   - The pair is wrapped in a single rounded/bordered shell; the
 *     divider between the columns reuses the same muted border.
 *
 * Loading / empty handling: when `before` and `after` are both empty
 * strings we surface a lightweight skeleton instead of two blank
 * panes — this matches the `proposal_status === "pending"` case
 * where the backend persisted a pending flag but the `after_markdown`
 * content isn't in hand yet (e.g. navigated here from a reload before
 * the server flushed its write). Normal flow never hits this branch.
 */

import ReactMarkdown from "react-markdown";

export interface WikiPageDiffPreviewProps {
  before: string;
  after: string;
  summary?: string | null;
  className?: string;
}

export function WikiPageDiffPreview({
  before,
  after,
  summary,
  className,
}: WikiPageDiffPreviewProps) {
  const isEmpty = before.length === 0 && after.length === 0;

  return (
    <div className={className}>
      {summary && summary.trim().length > 0 && (
        <div
          className="mb-2 flex items-center gap-1 italic text-muted-foreground/80"
          style={{ fontSize: 11, lineHeight: 1.5 }}
        >
          <span aria-hidden>📝</span>
          <span className="min-w-0 flex-1 truncate">{summary}</span>
        </div>
      )}

      {isEmpty ? (
        <DiffSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-md border border-border/30">
          <DiffColumn
            label="当前页面"
            english="Before"
            body={before}
            isLeft
          />
          <DiffColumn
            label="更新后"
            english="After"
            body={after}
            isLeft={false}
          />
        </div>
      )}
    </div>
  );
}

function DiffColumn({
  label,
  english,
  body,
  isLeft,
}: {
  label: string;
  english: string;
  body: string;
  isLeft: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col " +
        (isLeft ? "border-r border-border/30" : "")
      }
    >
      <div
        className="bg-muted/10 px-3 py-1.5 font-mono uppercase tracking-widest text-muted-foreground/70"
        style={{ fontSize: 10 }}
      >
        {label} / {english}
      </div>
      <div
        className="markdown-content prose prose-sm max-w-none flex-1 overflow-auto px-3 py-2 text-foreground/90"
        style={{ maxHeight: 400, fontSize: 12, lineHeight: 1.55 }}
      >
        {body.length === 0 ? (
          <div
            className="italic text-muted-foreground/50"
            style={{ fontSize: 11 }}
          >
            （空）
          </div>
        ) : (
          <ReactMarkdown>{body}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function DiffSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-md border border-border/30">
      {(["当前页面", "更新后"] as const).map((label, idx) => (
        <div
          key={label}
          className={"flex flex-col " + (idx === 0 ? "border-r border-border/30" : "")}
        >
          <div
            className="bg-muted/10 px-3 py-1.5 font-mono uppercase tracking-widest text-muted-foreground/70"
            style={{ fontSize: 10 }}
          >
            {label} / {idx === 0 ? "Before" : "After"}
          </div>
          <div className="flex-1 space-y-2 px-3 py-3" style={{ maxHeight: 400 }}>
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/40" />
            <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted/30" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );
}
