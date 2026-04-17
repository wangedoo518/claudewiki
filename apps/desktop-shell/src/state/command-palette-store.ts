/**
 * Command Palette store — global open/query state + persisted recent list.
 *
 * Only `recent` is persisted; `open` and `query` are transient and
 * always reset on mount. Persistence uses the same namespacedStorage
 * pattern as `wiki-tab-store` so localStorage keys stay tidy under
 * the `open-claude-code:` prefix.
 *
 * Final key: `open-claude-code:command-palette:state`
 *
 * Dedup contract for `pushRecent`:
 *   - same (kind, id) → remove the old entry, prepend a fresh one
 *     with a new timestamp (bump to the top)
 *   - otherwise prepend
 *   - always truncated to `RECENT_MAX`
 *
 * Rationale for clearing `query` in closePalette: re-opening the
 * palette should show the Recent section (empty query) by default,
 * not "whatever the user had typed last time".
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { namespacedStorage } from "./store-helpers";
import type { PaletteItemKind, PaletteRecentItem } from "@/features/palette/types";

/** Hard upper bound for the recent list. UI typically shows fewer. */
const RECENT_MAX = 12;

interface CommandPaletteStore {
  open: boolean;
  query: string;
  recent: PaletteRecentItem[];

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (q: string) => void;

  /** Dedup by (kind, id), bump to top, truncate to RECENT_MAX. */
  pushRecent: (item: Omit<PaletteRecentItem, "timestamp">) => void;
  /** Remove a specific recent entry (used when the target is stale). */
  removeRecent: (kind: PaletteItemKind, id: string) => void;
  /** Nuke the entire recent list (debug / settings action). */
  clearRecent: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>()(
  persist(
    (set) => ({
      open: false,
      query: "",
      recent: [],

      openPalette: () => set({ open: true }),
      closePalette: () => set({ open: false, query: "" }),
      togglePalette: () =>
        set((state) => ({
          open: !state.open,
          query: state.open ? "" : state.query,
        })),
      setQuery: (q) => set({ query: q }),

      pushRecent: (item) =>
        set((state) => {
          const fresh: PaletteRecentItem = {
            ...item,
            timestamp: Date.now(),
          };
          const filtered = state.recent.filter(
            (r) => !(r.kind === item.kind && r.id === item.id),
          );
          return { recent: [fresh, ...filtered].slice(0, RECENT_MAX) };
        }),

      removeRecent: (kind, id) =>
        set((state) => ({
          recent: state.recent.filter(
            (r) => !(r.kind === kind && r.id === id),
          ),
        })),

      clearRecent: () => set({ recent: [] }),
    }),
    {
      // zustand's own key; combines with namespacedStorage's prefix to
      // land at `open-claude-code:command-palette:state` in localStorage.
      name: "state",
      storage: namespacedStorage("command-palette"),
      // Only persist `recent`. open/query always start fresh.
      partialize: (state) => ({ recent: state.recent }),
    },
  ),
);
