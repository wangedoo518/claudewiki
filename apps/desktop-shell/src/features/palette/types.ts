/**
 * Palette type contract — shared by Worker A (UI) and Worker B (data).
 *
 * The UI shell consumes `PaletteGroup[]` and dispatches `onSelect(item)`
 * with a concrete `PaletteItem`. The data layer produces these items
 * from React Query data + CLAWWIKI_ROUTES + the recent store.
 *
 * `value` is the cmdk item identity — format is `"kind:id"` so the
 * UI dispatcher can look up the action regardless of shape. Parsing
 * is done via `paletteValueFor(...)` which both sides MUST use.
 */

import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

/** Icon type alias (Lucide forwards refs). */
export type PaletteIcon = ComponentType<LucideProps>;

export type PaletteItemKind = "route" | "wiki" | "raw" | "inbox";

interface PaletteItemBase {
  /** Unique value for cmdk; format `${kind}:${id}`. */
  value: string;
  /** Primary display text in the row. */
  label: string;
  /** Secondary muted text (e.g. source type, status, id). */
  hint?: string;
  /** Optional leading icon. */
  icon?: PaletteIcon;
}

export interface RoutePaletteItem extends PaletteItemBase {
  kind: "route";
  /** Route key from CLAWWIKI_ROUTES (stable across renames). */
  routeKey: string;
  /** Pathname to navigate to. */
  path: string;
}

export interface WikiPaletteItem extends PaletteItemBase {
  kind: "wiki";
  slug: string;
  title: string;
}

export interface RawPaletteItem extends PaletteItemBase {
  kind: "raw";
  id: number;
}

export interface InboxPaletteItem extends PaletteItemBase {
  kind: "inbox";
  id: number;
}

export type PaletteItem =
  | RoutePaletteItem
  | WikiPaletteItem
  | RawPaletteItem
  | InboxPaletteItem;

/** Stable group ids (order preserved in the UI). */
export type PaletteGroupId = "recent" | "pages" | "wiki" | "raw" | "inbox";

export interface PaletteGroup {
  id: PaletteGroupId;
  /** Section heading shown above items. */
  heading: string;
  items: PaletteItem[];
  /** Shows a CommandLoading row when true (only meaningful for async groups). */
  isLoading?: boolean;
  /** Tags the group's fetch as failed; UI renders a muted warning row. */
  isError?: boolean;
}

/**
 * Recent store schema — persisted via zustand + namespacedStorage.
 *
 * We store a display-label *snapshot* so that if the underlying record
 * is deleted (raw entry purged, wiki page removed), the recent item
 * still reads correctly. Re-navigation uses F2's deep-link banner for
 * the degraded path on Raw/Inbox; Wiki gets its own graceful-remove
 * path in the action dispatcher.
 */
export interface PaletteRecentItem {
  kind: PaletteItemKind;
  /** route.key | wiki slug | raw id toString | inbox id toString */
  id: string;
  label: string;
  hint?: string;
  timestamp: number;
}

/** Build the cmdk `value` string from kind + id. Both sides MUST use this. */
export function paletteValueFor(kind: PaletteItemKind, id: string | number): string {
  return `${kind}:${id}`;
}
