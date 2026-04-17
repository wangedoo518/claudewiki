/**
 * Palette action dispatcher — executes a selected PaletteItem.
 *
 * `executePaletteItem` is a synchronous `void` function so the UI
 * caller (CommandPalette) can do exactly:
 *
 *     executePaletteItem(item, ctx);
 *     closePalette();
 *
 * Never touch `open` state here — the UI owns closing. Each branch is
 * responsible for:
 *   1. Performing the canonical navigation for that kind
 *   2. Pushing a dedup'd entry onto the Recent list so it appears
 *      first next time the palette opens with empty query
 *
 * Stale deep-link handling: Raw/Inbox use their existing F2
 * `DeepLinkNotFoundBanner` when the id has been purged; Wiki's
 * `openTab` with a missing slug surfaces as a page-level loading
 * state. We intentionally keep the action dispatcher minimal and
 * let downstream pages degrade gracefully.
 */

import type { NavigateFunction } from "react-router-dom";

import type { PaletteItem, PaletteItemKind, PaletteRecentItem } from "./types";
import type { WikiTabItem } from "@/state/wiki-tab-store";
import type { AppMode } from "@/state/settings-store";

export interface PaletteActionContext {
  navigate: NavigateFunction;
  openTab: (item: WikiTabItem) => void;
  setAppMode: (mode: AppMode) => void;
  pushRecent: (item: Omit<PaletteRecentItem, "timestamp">) => void;
  removeRecent: (kind: PaletteItemKind, id: string) => void;
}

export function executePaletteItem(
  item: PaletteItem,
  ctx: PaletteActionContext,
): void {
  const { navigate, openTab, setAppMode, pushRecent } = ctx;

  switch (item.kind) {
    case "route": {
      navigate(item.path);
      pushRecent({
        kind: "route",
        id: item.routeKey,
        label: item.label,
        hint: item.hint,
      });
      return;
    }
    case "wiki": {
      // Wiki target: switch app mode, open a tab, then route to /wiki.
      setAppMode("wiki");
      openTab({
        id: item.slug,
        kind: "article",
        slug: item.slug,
        title: item.title,
        closable: true,
      });
      navigate("/wiki");
      pushRecent({
        kind: "wiki",
        id: item.slug,
        label: item.label,
        hint: item.hint,
      });
      return;
    }
    case "raw": {
      navigate(`/raw?entry=${item.id}`);
      pushRecent({
        kind: "raw",
        id: String(item.id),
        label: item.label,
        hint: item.hint,
      });
      return;
    }
    case "inbox": {
      navigate(`/inbox?task=${item.id}`);
      pushRecent({
        kind: "inbox",
        id: String(item.id),
        label: item.label,
        hint: item.hint,
      });
      return;
    }
  }
}
