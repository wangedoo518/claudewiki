/**
 * Knowledge Hub — DS1-B unified entry for user-facing knowledge surfaces.
 *
 * The v2 design-system IA folds three previously-separate routes into
 * one user-friendly hub with three tabs:
 *
 *   - 页面   (pages)   — the canonical wiki articles (wraps WikiExplorerPage)
 *   - 关系图 (graph)   — concept relationships (wraps GraphPage)
 *   - 素材库 (raw)     — raw forwards timeline (wraps RawLibraryPage)
 *
 * Design decisions:
 *
 * 1. **No logic rewrite.** This page is a pure tab wrapper that mounts
 *    the existing pages — WikiExplorerPage, GraphPage, RawLibraryPage —
 *    unchanged. Their own data fetching, routing, and state stay where
 *    they live. We just swap which one is visible.
 *
 * 2. **URL-recoverable tab state.** The active tab is persisted in the
 *    `?view=` query string (`pages` | `graph` | `raw`), so links,
 *    back/forward, and reloads all survive. Default is `pages` when no
 *    query is present. We deliberately keep this inside the hash router
 *    (`useSearchParams` from react-router-dom) so it composes with any
 *    `#/wiki/:slug` sub-path that WikiExplorerPage itself owns.
 *
 * 3. **Backwards-compatible routes.** `/raw/*` and `/graph` keep
 *    rendering the original pages directly (see ClawWikiShell). This
 *    hub adds an ADDITIONAL front-door at `/wiki?view=…` — it does not
 *    steal the legacy URLs, so any in-page links, bookmarks, or command
 *    palette entries that point at `/raw` or `/graph` keep working.
 *
 * 4. **No backend touch.** No new endpoints, no new queries. Exactly
 *    the same data each individual page already fetches.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Network, FileStack } from "lucide-react";
import { cn } from "@/lib/utils";
import { WikiExplorerPage } from "./WikiExplorerPage";
import { GraphPage } from "@/features/graph/GraphPage";
import { RawLibraryPage } from "@/features/raw/RawLibraryPage";

type HubView = "pages" | "graph" | "raw";

const HUB_TABS: ReadonlyArray<{
  id: HubView;
  label: string;
  sub: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "pages",
    label: "页面",
    sub: "已整理的知识页面",
    icon: BookOpen,
  },
  {
    id: "graph",
    label: "关系图",
    sub: "页面之间的关联",
    icon: Network,
  },
  {
    id: "raw",
    label: "素材库",
    sub: "转发进来的原始内容",
    icon: FileStack,
  },
];

function parseView(raw: string | null): HubView {
  if (raw === "graph" || raw === "raw") return raw;
  return "pages";
}

export function KnowledgeHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useMemo(() => parseView(searchParams.get("view")), [searchParams]);

  const setView = useCallback(
    (next: HubView) => {
      const params = new URLSearchParams(searchParams);
      if (next === "pages") {
        // Keep default URL clean — no `?view=pages`.
        params.delete("view");
      } else {
        params.set("view", next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const active = HUB_TABS.find((t) => t.id === view) ?? HUB_TABS[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Tab bar — sits above the embedded page, styled like the
          design-system `.pill-tabs`: rounded pills, Terracotta accent
          on the active pill via the primary token. */}
      <div
        className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-4 py-2"
        role="tablist"
        aria-label="知识库"
      >
        {HUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === view;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`knowledge-hub-panel-${tab.id}`}
              onClick={() => setView(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              title={tab.sub}
            >
              <Icon className="size-3.5" strokeWidth={1.5} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <span
          className="ml-3 hidden truncate text-[11px] text-muted-foreground/60 sm:inline"
          aria-hidden="true"
        >
          {active.sub}
        </span>
      </div>

      {/* Body — mounts one of three existing pages, unchanged.
          We keep this as a single conditional render (not all three
          mounted-and-hidden) so each page's data fetching only fires
          when the user is actually on that tab. */}
      <div
        id={`knowledge-hub-panel-${view}`}
        role="tabpanel"
        aria-labelledby={`knowledge-hub-tab-${view}`}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {view === "pages" && <WikiExplorerPage />}
        {view === "graph" && <GraphPage />}
        {view === "raw" && <RawLibraryPage />}
      </div>
    </div>
  );
}
