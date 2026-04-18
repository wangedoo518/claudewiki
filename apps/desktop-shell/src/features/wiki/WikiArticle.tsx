/**
 * WikiArticle — Markdown rendering area for a single wiki page.
 * Per component-spec.md §3 and 02-wiki-explorer.md §6.2.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { MessageCircleQuestion } from "lucide-react";

import { getWikiPage } from "@/features/ingest/persist";
import type { WikiPageSummary } from "@/features/ingest/types";
import {
  preprocessWikilinks,
  useWikiLinkRenderer,
} from "./wiki-link-utils";
import { WikiArticleRelationsPanel } from "./WikiArticleRelationsPanel";

/* ── Reading time ──────────────────────────────────────────────── */
function estimateReadingTime(body: string): string {
  // CJK: 400 chars/min; ASCII: 200 words/min
  let cjkChars = 0;
  for (const ch of body) {
    if (ch.charCodeAt(0) > 0x2e7f) cjkChars++;
  }
  const asciiWords = body
    .split(/\s+/)
    .filter((w) => w.length > 0 && w.charCodeAt(0) <= 127).length;

  const minutes = Math.ceil(cjkChars / 400 + asciiWords / 200);
  return minutes <= 1 ? "1 min" : `${minutes} min`;
}

/* ── Category badge colors ─────────────────────────────────────── */
const CATEGORY_STYLES: Record<string, string> = {
  concept: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
  people: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  topic: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  compare: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

/* ── Markdown custom components ────────────────────────────────── */
/**
 * Article-page Markdown renderer. The `<a>` handler is shared with
 * the chat-side /query renderer via `useWikiLinkRenderer` — see
 * `wiki-link-utils.tsx` for why and how internal wiki refs are
 * intercepted (short version: raw relative `.md` paths were falling
 * through React Router to `/dashboard`).
 */
function useMarkdownComponents(): Components {
  const Anchor = useWikiLinkRenderer();

  // Heading / body / list / code / blockquote styling is handled by
  // the .markdown-content class on the parent <div>. The ONLY custom
  // component we keep is the wiki-link interceptor — it turns relative
  // .md paths and wiki:// hrefs into tab-store navigations instead of
  // letting the browser fall through to React Router's catch-all.
  return useMemo((): Components => ({ a: Anchor }), [Anchor]);
}

/* ── Main component ────────────────────────────────────────────── */
interface WikiArticleProps {
  slug: string;
}

export function WikiArticle({ slug }: WikiArticleProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["wiki", "pages", "detail", slug],
    queryFn: () => getWikiPage(slug),
    staleTime: 30_000,
  });

  const components = useMarkdownComponents();

  const handleAsk = () => {
    const params = new URLSearchParams();
    params.set("bind", `wiki:${slug}`);
    params.set("title", data?.summary.title ?? slug);
    navigate(`/ask?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--color-destructive)]">
        Failed to load page: {slug}
      </div>
    );
  }

  const { summary, body } = data;
  const category = (summary as WikiPageSummary & { category?: string }).category ?? "concept";
  const categoryStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.concept;
  const readingTime = estimateReadingTime(body);
  const expandedBody = preprocessWikilinks(body);

  return (
    <div className="mx-auto max-w-[720px] px-8 py-6">
      {/* Title — component-spec.md §3.2 */}
      <h1 className="mb-2 text-[24px] leading-[1.3] text-[var(--color-foreground)]">
        {summary.title}
      </h1>

      {/* Metadata row — component-spec.md §3.3 */}
      <div className="mb-6 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${categoryStyle}`}>
          {category}
        </span>
        <span>&middot;</span>
        <span>{summary.created_at?.slice(0, 10) ?? "—"}</span>
        <span>&middot;</span>
        <span>{readingTime} read</span>
        <button
          type="button"
          onClick={handleAsk}
          className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title="用此页提问"
          aria-label="Ask with this page"
        >
          <MessageCircleQuestion className="size-3" />
          用此页提问
        </button>
      </div>

      {/* Summary */}
      {summary.summary && (
        <p className="mb-6 text-[14px] italic text-[var(--color-muted-foreground)]">
          {summary.summary}
        </p>
      )}

      {/* Markdown body — component-spec.md §3.4 */}
      <div className="wiki-article-body markdown-content">
        <ReactMarkdown components={components}>{expandedBody}</ReactMarkdown>
      </div>

      {/* Relations (outgoing / backlinks / related) — G1 sprint.
          Replaces the legacy single-list BacklinksSection. */}
      <WikiArticleRelationsPanel slug={slug} />
    </div>
  );
}
