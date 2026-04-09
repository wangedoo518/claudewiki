/**
 * Wiki Pages Explorer (wireframes.html §04, §05)
 *
 * S6 MVP implementation. The canonical explorer will eventually be
 * a two-pane surface (left: categories concepts/people/topics/
 * compare/changelog + search; right: WikiPageDetail with Lora serif
 * body + backlinks + history aside). BUT those pages only exist
 * after the `wiki_maintainer` agent runs, which needs
 * `codex_broker::chat_completion` — still stubbed as NotImplemented.
 *
 * So S6 MVP ships the **contract-honest** version:
 *
 *   1. Show the canonical layer layout (concept / people / topic /
 *      compare / changelog) so users understand what's going to
 *      live here.
 *   2. Read the raw entries count + pending inbox count to give a
 *      sense of "here's what's waiting to become wiki pages".
 *   3. Explicit empty state with a jump to Inbox + Raw Library.
 *
 * When the maintainer agent lands (post-S6), swap the empty state
 * for the real file-tree + detail pane without needing to restructure
 * the container.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Brain,
  Users,
  Tag,
  GitCompare,
  History,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { listInboxEntries, listRawEntries } from "@/features/ingest/persist";

const CATEGORIES = [
  {
    key: "concept",
    icon: Brain,
    label: "Concepts",
    description:
      "每个核心想法一页 · 由 raw 层的 WeChat 素材自动汇总成 canonical 状态",
    tint: "var(--claude-orange)",
  },
  {
    key: "people",
    icon: Users,
    label: "People",
    description: "你引用过的作者 / 研究者 / 同事 · 自动汇总所有相关 raw",
    tint: "var(--claude-blue)",
  },
  {
    key: "topic",
    icon: Tag,
    label: "Topics",
    description: "主题聚合页 · 跨多个 concept 汇总某一领域的结构化综述",
    tint: "var(--agent-purple)",
  },
  {
    key: "compare",
    icon: GitCompare,
    label: "Compare",
    description: "A vs B 结构化对比 · 自动维护论据栏",
    tint: "var(--color-warning)",
  },
  {
    key: "changelog",
    icon: History,
    label: "Changelog",
    description: "每天的维护动作日志 · append-only",
    tint: "var(--color-success)",
  },
] as const;

export function WikiExplorerPage() {
  const rawQuery = useQuery({
    queryKey: ["wiki", "raw", "list"] as const,
    queryFn: () => listRawEntries(),
    staleTime: 30_000,
  });

  const inboxQuery = useQuery({
    queryKey: ["wiki", "inbox", "list"] as const,
    queryFn: () => listInboxEntries(),
    staleTime: 30_000,
  });

  const rawCount = rawQuery.data?.entries.length ?? 0;
  const pendingInbox = inboxQuery.data?.pending_count ?? 0;
  const loading = rawQuery.isLoading || inboxQuery.isLoading;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Hero */}
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xl">📖</span>
          <h1
            className="text-head font-semibold text-foreground"
            style={{ fontFamily: "var(--font-serif, Lora, serif)" }}
          >
            Wiki Pages · LLM 主笔层
          </h1>
        </div>
        <p className="mt-1 text-label text-muted-foreground">
          AI 帮我长出了什么 — concept / people / topic / compare · Lora 衬线正文 · 由
          wiki_maintainer 从 raw 层自动维护
        </p>
      </div>

      {/* Status card */}
      <section className="border-b border-border/50 px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading wiki status…
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/10 px-5 py-4">
            <div className="mb-2 flex items-center gap-2 text-body font-semibold text-foreground">
              <BookOpen
                className="size-4"
                style={{ color: "var(--claude-orange)" }}
              />
              No wiki pages yet
            </div>
            <p className="mb-3 text-caption text-muted-foreground">
              The maintainer agent that produces pages from your raw
              entries lands after <code>codex_broker::chat_completion</code>{" "}
              is wired (scheduled post-S6). Until then, the pipeline is:
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-caption text-foreground/80">
              <StepChip active={rawCount > 0}>
                Raw Library · {rawCount}
              </StepChip>
              <span className="text-muted-foreground">→</span>
              <StepChip active={pendingInbox > 0}>
                Inbox · {pendingInbox} pending
              </StepChip>
              <span className="text-muted-foreground">→</span>
              <StepChip active={false}>Wiki pages · 0</StepChip>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-caption">
              <Link
                to="/raw"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open Raw Library <ArrowRight className="size-3" />
              </Link>
              <Link
                to="/inbox"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open Inbox <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Category preview */}
      <section className="px-6 py-5">
        <h2 className="mb-3 text-subhead font-semibold text-foreground">
          Planned layers
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <li
                key={cat.key}
                className="rounded-md border border-border bg-muted/5 px-4 py-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="size-4" style={{ color: cat.tint }} />
                  <span
                    className="text-body-sm font-semibold"
                    style={{ color: cat.tint }}
                  >
                    {cat.label}
                  </span>
                  <span className="ml-auto font-mono text-caption text-muted-foreground">
                    0
                  </span>
                </div>
                <p className="text-caption text-muted-foreground">
                  {cat.description}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function StepChip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-caption"
      style={{
        borderColor: active
          ? "color-mix(in srgb, var(--color-success) 40%, transparent)"
          : "var(--color-border)",
        color: active ? "var(--color-success)" : "var(--muted-foreground)",
        backgroundColor: active
          ? "color-mix(in srgb, var(--color-success) 8%, transparent)"
          : "transparent",
      }}
    >
      {children}
    </span>
  );
}
