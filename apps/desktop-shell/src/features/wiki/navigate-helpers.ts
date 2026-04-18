/**
 * Wiki navigation helpers — unified handoff to open a Wiki article tab
 * from anywhere in the app (Maintainer Workbench, Recent Raw list,
 * Inbox detail, Command Palette, etc.).
 *
 * Context snapshot (sampled 2026-04 from existing call sites):
 *   - apps/desktop-shell/src/features/dashboard/PatrolReportView.tsx
 *   - apps/desktop-shell/src/features/graph/GraphPage.tsx
 *   - apps/desktop-shell/src/features/wiki/WikiTab.tsx
 *   - apps/desktop-shell/src/features/wiki/wiki-link-utils.tsx
 *   - apps/desktop-shell/src/features/wiki/WikiArticle.tsx
 *   - apps/desktop-shell/src/features/ask/QuerySourcesCard.tsx
 *   - apps/desktop-shell/src/features/palette/actions.ts
 *
 * The 7+ in-tree variants all do the same three things in slightly
 * different orders: `setAppMode("wiki")`, `useWikiTabStore.openTab({
 * id, kind: "article", slug, title, closable: true })`, and — when the
 * caller is outside the `/wiki` route — `navigate("/wiki")`. This
 * helper encodes that sequence once so W1 new code (Maintainer
 * Workbench, etc.) never has to rebuild the shape.
 *
 * Two surfaces are exported:
 *
 *   1. `navigateToWikiPage(slug, title, ctx)` — a plain function that
 *      works anywhere (event handlers outside React, zustand
 *      subscribers, etc.). It reads store singletons via
 *      `useXxx.getState()` and falls back to `window.location.hash`
 *      for the route jump because React Router's `useNavigate` can
 *      only be called inside the router tree. This is the signature
 *      the task brief asks for and the one Worker A will call from
 *      MaintainerResultCard's "打开 Wiki 页" button.
 *
 *   2. `useWikiNavigator()` — a hook form for components already
 *      inside the router tree. It prefers the React Router
 *      `useNavigate` so the jump stays inside SPA history instead of
 *      touching `window.location`. Same return shape as (1).
 *
 * The `WikiNavContext` enum is currently a *discriminator slot* — not
 * a branch. Every context ends up calling the same store + route
 * flow. Keeping the parameter now means future telemetry hooks or
 * per-context UX tweaks (e.g. "recent-raw" gets a toast) can land as
 * a non-breaking change.
 */

import { useCallback } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";

import { useSettingsStore } from "@/state/settings-store";
import { useWikiTabStore } from "@/state/wiki-tab-store";
import type { SourceRef } from "@/lib/tauri";

/** Origin of the nav request. Purely for logging/telemetry today. */
export type WikiNavContext =
  | "maintain-result"
  | "recent-raw"
  | "inbox-detail"
  | "command-palette"
  // G1 sprint — four new origins for cross-page wiki navigation
  // driven by the 3-panel Relations UI (backlinks / related /
  // outgoing) on the article page and the focus-mode entry on the
  // Graph page. Kept as discriminators today (no per-context
  // branching yet) so the telemetry slot stays non-breaking.
  | "wiki-backlink"
  | "wiki-related"
  | "wiki-outgoing"
  | "wiki-graph";

/** Shared side effects: switch app mode + open/activate the tab. */
function applyTabHandoff(slug: string, title: string): void {
  useSettingsStore.getState().setAppMode("wiki");
  useWikiTabStore.getState().openTab({
    id: slug,
    kind: "article",
    slug,
    title,
    closable: true,
  });
}

/** Route jump — React Router first, `window.location.hash` fallback. */
function jumpToWikiRoute(navigate?: NavigateFunction): void {
  if (navigate) {
    navigate("/wiki");
    return;
  }
  // Fallback for call sites outside the router tree. The app mounts
  // under `HashRouter` (see `src/App.tsx`), so forcing the hash is
  // equivalent to a programmatic navigation. Guard for SSR/tests.
  if (typeof window !== "undefined") {
    if (window.location.hash !== "#/wiki") {
      window.location.hash = "#/wiki";
    }
  }
}

/**
 * Pure-function entry point. Safe from any call site — including
 * non-React event handlers. See module docstring for why the route
 * jump uses `window.location.hash` here.
 */
export function navigateToWikiPage(
  slug: string,
  title: string,
  _ctx: WikiNavContext,
): void {
  if (!slug) return;
  applyTabHandoff(slug, title || slug);
  jumpToWikiRoute();
}

/**
 * Hook form — prefer this inside components that are already inside
 * the router tree so the jump stays inside SPA history.
 */
export function useWikiNavigator(): (
  slug: string,
  title: string,
  ctx: WikiNavContext,
) => void {
  const navigate = useNavigate();
  return useCallback(
    (slug, title, _ctx) => {
      if (!slug) return;
      applyTabHandoff(slug, title || slug);
      jumpToWikiRoute(navigate);
    },
    [navigate],
  );
}

/**
 * S1 sprint — Build an Ask route URL that pre-binds a session source.
 * Consumed by `AskWorkbench`'s URL-param bind flow (A2/A3). The page's
 * `parseBindParam` accepts an optional `&title=...` so we pass the
 * source's display title for nicer first-paint before the session
 * detail fetch completes.
 *
 * Examples:
 *   buildAskBindUrl({ kind: "wiki",  slug: "foo", title: "Foo" })
 *     → "#/ask?bind=wiki:foo&title=Foo"
 *   buildAskBindUrl({ kind: "raw",   id: 42,     title: "Example" })
 *     → "#/ask?bind=raw:42&title=Example"
 *   buildAskBindUrl({ kind: "inbox", id: 7,      title: "Task" })
 *     → "#/ask?bind=inbox:7&title=Task"
 */
export function buildAskBindUrl(source: SourceRef): string {
  const title = encodeURIComponent(source.title ?? "");
  const titleParam = title ? `&title=${title}` : "";
  switch (source.kind) {
    case "wiki":
      return `#/ask?bind=wiki:${encodeURIComponent(source.slug)}${titleParam}`;
    case "raw":
      return `#/ask?bind=raw:${source.id}${titleParam}`;
    case "inbox":
      return `#/ask?bind=inbox:${source.id}${titleParam}`;
  }
}

/**
 * S1 sprint — Build a Graph route URL that focuses on a specific wiki
 * slug. Consumed by `GraphPage`'s `?focus=` URL param (G1), which
 * seeds the `ForceGraph` initial search query so the node is
 * highlighted and its neighbors dimmed on first paint.
 *
 * Example:
 *   buildGraphFocusUrl("example-slug") → "#/graph?focus=example-slug"
 */
export function buildGraphFocusUrl(slug: string): string {
  return `#/graph?focus=${encodeURIComponent(slug)}`;
}
