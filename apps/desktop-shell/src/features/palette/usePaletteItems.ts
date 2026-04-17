/**
 * Palette data source — aggregates CLAWWIKI_ROUTES + wiki pages + raw
 * entries + pending inbox entries into `PaletteGroup[]`, filtered by
 * the current query.
 *
 * React Query keys are REUSED (not shadowed) so this hook's fetches
 * share the same cache as Sidebar / RawLibrary / Wiki / Inbox surfaces.
 *
 *     ["wiki", "raw", "list"]     — RawEntry[]
 *     ["wiki", "pages", "list"]   — WikiPageSummary[]
 *     ["wiki", "inbox", "list"]   — InboxEntry[] (filter to pending)
 *
 * The Recent group only renders when the query is empty (so it doesn't
 * compete visually with live filter results).
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Clock,
  Compass,
  FileText,
  Inbox,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Network,
  ScrollText,
  Settings,
} from "lucide-react";

import {
  CLAWWIKI_ROUTES,
  type ClawWikiRoute,
} from "@/shell/clawwiki-routes";
import { listInboxEntries, listRawEntries, listWikiPages } from "@/features/ingest/persist";
import type {
  InboxEntry,
  RawEntry,
  WikiPageSummary,
} from "@/features/ingest/types";
import { useCommandPaletteStore } from "@/state/command-palette-store";

import { filterPaletteItems } from "./filter";
import {
  paletteValueFor,
  type InboxPaletteItem,
  type PaletteGroup,
  type PaletteIcon,
  type PaletteItem,
  type PaletteRecentItem,
  type RawPaletteItem,
  type RoutePaletteItem,
  type WikiPaletteItem,
} from "./types";

// ── Local translators (copied from RawLibraryPage / InboxPage) ─────
// Intentionally duplicated here — per Worker B's scope we may not
// cross-import product code. These mappings are small and stable.

/** Translate raw source tag to a Chinese display label. */
function translateSource(source: string): string {
  const map: Record<string, string> = {
    "wechat-url": "微信链接",
    "wechat-text": "微信消息",
    "wechat-article": "微信文章",
    "paste-text": "粘贴文本",
    "paste-url": "粘贴链接",
    paste: "粘贴",
    url: "网页",
    pdf: "PDF 文件",
    docx: "Word 文件",
    pptx: "PPT 文件",
    image: "图片",
  };
  return map[source] ?? source;
}

/** Translate inbox kind to a Chinese display label. */
function translateKind(kind: string): string {
  const map: Record<string, string> = {
    "new-raw": "新素材",
    stale: "待更新",
    conflict: "冲突",
    deprecate: "弃用",
  };
  return map[kind] ?? kind;
}

/** Translate inbox status to a Chinese display label. */
function translateStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "待处理",
    approved: "已批准",
    rejected: "已拒绝",
  };
  return map[status] ?? status;
}

// ── Route key → Lucide icon mapping ───────────────────────────────

/** Map a CLAWWIKI_ROUTES key to a Lucide icon component. */
function iconForRouteKey(key: string): PaletteIcon {
  const map: Record<string, PaletteIcon> = {
    dashboard: LayoutDashboard,
    ask: MessageCircle,
    inbox: Inbox,
    raw: FileText,
    wiki: BookOpen,
    graph: Network,
    schema: ScrollText,
    wechat: Link2,
    settings: Settings,
  };
  return map[key] ?? Compass;
}

// ── Item constructors ─────────────────────────────────────────────

function buildRouteItems(): RoutePaletteItem[] {
  return CLAWWIKI_ROUTES.map((route: ClawWikiRoute) => ({
    kind: "route" as const,
    value: paletteValueFor("route", route.key),
    label: route.label,
    hint: route.key,
    icon: iconForRouteKey(route.key),
    routeKey: route.key,
    path: route.path,
  }));
}

function buildWikiItems(pages: WikiPageSummary[] | undefined): WikiPaletteItem[] {
  if (!pages) return [];
  // Cap at 100 so the list stays bounded in sparse edge cases.
  const sliced = pages.slice(0, 100);
  return sliced.map((page) => {
    const label = page.title || page.slug;
    const summary = page.summary ?? "";
    const hint = summary.length > 40 ? `${summary.slice(0, 40)}…` : summary;
    return {
      kind: "wiki" as const,
      value: paletteValueFor("wiki", page.slug),
      label,
      hint: hint || undefined,
      icon: BookOpen,
      slug: page.slug,
      title: label,
    };
  });
}

function buildRawItems(entries: RawEntry[] | undefined): RawPaletteItem[] {
  if (!entries) return [];
  // `listRawEntries` returns id asc; palette UX wants newest first.
  const sorted = [...entries].sort((a, b) => b.id - a.id).slice(0, 50);
  return sorted.map((entry) => ({
    kind: "raw" as const,
    value: paletteValueFor("raw", entry.id),
    label: entry.slug,
    hint: `${translateSource(entry.source)} · ${entry.date}`,
    icon: FileText,
    id: entry.id,
  }));
}

function buildInboxItems(entries: InboxEntry[] | undefined): InboxPaletteItem[] {
  if (!entries) return [];
  const pending = entries
    .filter((e) => e.status === "pending")
    .slice(0, 50);
  return pending.map((entry) => ({
    kind: "inbox" as const,
    value: paletteValueFor("inbox", entry.id),
    label: entry.title,
    hint: `${translateKind(entry.kind)} · ${translateStatus(entry.status)}`,
    icon: Inbox,
    id: entry.id,
  }));
}

// ── Recent reconstruction ─────────────────────────────────────────

/**
 * Rebuild a concrete PaletteItem from a stored PaletteRecentItem.
 *
 * Returns `null` when the recent entry can't be hydrated (e.g. a
 * route key no longer exists in CLAWWIKI_ROUTES — graceful skip).
 */
function reconstructPaletteItemFromRecent(
  r: PaletteRecentItem,
): PaletteItem | null {
  switch (r.kind) {
    case "route": {
      const route = CLAWWIKI_ROUTES.find((rt) => rt.key === r.id);
      if (!route) return null;
      return {
        kind: "route",
        value: paletteValueFor("route", r.id),
        label: r.label,
        hint: r.hint,
        icon: Clock,
        routeKey: r.id,
        path: route.path,
      };
    }
    case "wiki":
      return {
        kind: "wiki",
        value: paletteValueFor("wiki", r.id),
        label: r.label,
        hint: r.hint,
        icon: Clock,
        slug: r.id,
        title: r.label,
      };
    case "raw": {
      const id = Number(r.id);
      if (!Number.isFinite(id)) return null;
      return {
        kind: "raw",
        value: paletteValueFor("raw", id),
        label: r.label,
        hint: r.hint,
        icon: Clock,
        id,
      };
    }
    case "inbox": {
      const id = Number(r.id);
      if (!Number.isFinite(id)) return null;
      return {
        kind: "inbox",
        value: paletteValueFor("inbox", id),
        label: r.label,
        hint: r.hint,
        icon: Clock,
        id,
      };
    }
    default:
      // Unknown kind on disk — skip it rather than throw.
      return null;
  }
}

// ── Main hook ─────────────────────────────────────────────────────

/**
 * Compose the grouped palette items for the current query.
 *
 * The returned array is stable across renders when inputs are
 * unchanged, courtesy of `useMemo` over the React Query data
 * references and the zustand `recent` array.
 */
export function useGroupedPaletteItems(query: string): PaletteGroup[] {
  // 3 parallel list queries — reuse existing keys so cache is shared.
  const rawQuery = useQuery({
    queryKey: ["wiki", "raw", "list"],
    queryFn: listRawEntries,
    staleTime: 10_000,
  });

  const pagesQuery = useQuery({
    queryKey: ["wiki", "pages", "list"],
    queryFn: listWikiPages,
    staleTime: 10_000,
  });

  const inboxQuery = useQuery({
    queryKey: ["wiki", "inbox", "list"],
    queryFn: listInboxEntries,
    staleTime: 10_000,
  });

  const recent = useCommandPaletteStore((s) => s.recent);
  const open = useCommandPaletteStore((s) => s.open);

  // When the palette opens, kick a background refetch so results feel
  // fresh without forcing refetch on every keystroke.
  useEffect(() => {
    if (open) {
      void rawQuery.refetch();
      void pagesQuery.refetch();
      void inboxQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rawData = rawQuery.data;
  const pagesData = pagesQuery.data;
  const inboxData = inboxQuery.data;

  const groups = useMemo<PaletteGroup[]>(() => {
    const trimmed = query.trim();

    const allPages = buildRouteItems();
    const allWikiItems = buildWikiItems(pagesData?.pages);
    const allRawItems = buildRawItems(rawData?.entries);
    const allInboxItems = buildInboxItems(inboxData?.entries);

    const result: PaletteGroup[] = [];

    // Recent — only when the query is empty so it doesn't compete
    // with live filter results.
    if (trimmed === "") {
      const recentItems = recent
        .slice(0, 5)
        .map((r) => reconstructPaletteItemFromRecent(r))
        .filter((x): x is PaletteItem => x !== null);
      if (recentItems.length > 0) {
        result.push({
          id: "recent",
          heading: "最近",
          items: recentItems,
        });
      }
    }

    // Pages — static source, never loading/error.
    const pagesItems = filterPaletteItems(allPages, query);
    result.push({
      id: "pages",
      heading: "页面",
      items: pagesItems,
    });

    // Wiki — live fetch from /api/wiki/pages.
    const wikiItems = filterPaletteItems(allWikiItems, query);
    result.push({
      id: "wiki",
      heading: "Wiki",
      items: wikiItems,
      isLoading: pagesQuery.isLoading,
      isError: pagesQuery.isError,
    });

    // Raw — include id as an extra searchable field so users can
    // paste a known id like "17" to land on it directly.
    const rawItems = filterPaletteItems(allRawItems, query, (item) => [
      String(item.id),
    ]);
    result.push({
      id: "raw",
      heading: "素材",
      items: rawItems,
      isLoading: rawQuery.isLoading,
      isError: rawQuery.isError,
    });

    // Inbox — same deal, numeric id searchable.
    const inboxItems = filterPaletteItems(allInboxItems, query, (item) => [
      String(item.id),
    ]);
    result.push({
      id: "inbox",
      heading: "Inbox 任务",
      items: inboxItems,
      isLoading: inboxQuery.isLoading,
      isError: inboxQuery.isError,
    });

    return result;
  }, [
    query,
    recent,
    rawData,
    pagesData,
    inboxData,
    rawQuery.isLoading,
    rawQuery.isError,
    pagesQuery.isLoading,
    pagesQuery.isError,
    inboxQuery.isLoading,
    inboxQuery.isError,
  ]);

  return groups;
}
