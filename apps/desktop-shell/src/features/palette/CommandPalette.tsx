/**
 * CommandPalette — global Ctrl/Cmd+K palette UI shell.
 *
 * Responsibilities of this file (Worker A scope):
 *   1. Register the global Ctrl/Cmd+K shortcut (capture-phase, IME-guarded)
 *      that opens / closes the palette via the zustand store.
 *   2. Render `CommandDialog` with `CommandInput` + grouped results.
 *   3. Manage focus — `CommandDialog` suppresses Radix's auto-focus so we
 *      manually focus the input on every open via rAF.
 *   4. Dispatch selected items to Worker B's `executePaletteItem` with the
 *      navigation context (react-router + wiki tab + settings + recent).
 *
 * Data / filtering / action execution all live in Worker B's modules:
 *   - `useGroupedPaletteItems(query)` → pre-filtered `PaletteGroup[]`
 *   - `executePaletteItem(item, ctx)` → canonical navigation + pushRecent
 *   - `executePaletteItemAction(item, actionId, ctx)` → secondary chips
 *
 * S1 — Unified Search extensions
 *   - Each row now renders (left → right):
 *       [kind icon] [title / subtitle+kind-badge / why-tag] [chips]
 *   - Kind badge: small coloured pill (wiki=success, raw=primary,
 *     inbox=warning, route=muted) matching R1 design tokens.
 *   - Why tag: muted 11px caption explaining the match reason
 *     (populated by Worker A).
 *   - Secondary chips: one per `item.secondaryActions[]`. Tab enters
 *     the chip row; Shift+Enter fires the first chip action.
 */

import * as React from "react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useCommandPaletteStore } from "@/state/command-palette-store";
import { useWikiTabStore } from "@/state/wiki-tab-store";
import { useSettingsStore } from "@/state/settings-store";
import { useGroupedPaletteItems } from "@/features/palette/usePaletteItems";
import {
  executePaletteItem,
  executePaletteItemAction,
  type PaletteActionContext,
} from "@/features/palette/actions";
import type {
  PaletteItem,
  PaletteItemKind,
  PaletteItemSecondaryAction,
} from "@/features/palette/types";

// ── S1 visual config ──────────────────────────────────────────────

/**
 * Per-kind badge visuals. Colours are expressed via CSS vars +
 * alpha so both light and dark themes stay on brand. Label is the
 * literal text rendered inside the pill.
 */
const KIND_BADGE: Record<
  PaletteItemKind,
  { label: string; background: string; color: string }
> = {
  wiki: {
    label: "wiki",
    background: "color-mix(in oklab, var(--color-success) 10%, transparent)",
    color: "var(--color-success)",
  },
  raw: {
    label: "raw",
    background: "color-mix(in oklab, var(--color-primary) 10%, transparent)",
    color: "var(--color-primary)",
  },
  inbox: {
    label: "inbox",
    background: "color-mix(in oklab, var(--color-warning) 10%, transparent)",
    color: "var(--color-warning)",
  },
  route: {
    label: "route",
    background: "var(--muted)",
    color: "var(--muted-foreground)",
  },
};

/** Read a loose optional property from a palette item without a cast. */
function readItemWhy(item: PaletteItem): string | undefined {
  const v = (item as { why?: unknown }).why;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Read the secondary action list from an item; empty array when absent. */
function readItemSecondaryActions(
  item: PaletteItem,
): PaletteItemSecondaryAction[] {
  const v = (item as { secondaryActions?: unknown }).secondaryActions;
  if (!Array.isArray(v)) return [];
  // Defensive filter — only keep entries with the expected shape.
  return v.filter(
    (x): x is PaletteItemSecondaryAction =>
      x !== null &&
      typeof x === "object" &&
      typeof (x as { id?: unknown }).id === "string" &&
      typeof (x as { label?: unknown }).label === "string",
  );
}

/**
 * Read the "subtitle" of a row. Item types expose `hint`; the S1
 * contract also allows a dedicated `subtitle` field. Prefer
 * `subtitle` when present, fall back to `hint`.
 */
function readItemSubtitle(item: PaletteItem): string | undefined {
  const sub = (item as { subtitle?: unknown }).subtitle;
  if (typeof sub === "string" && sub.length > 0) return sub;
  return item.hint;
}

/**
 * Read the "title" of a row. Prefer `title` (new S1 field) over
 * `label` (existing field) for display consistency with Worker A's
 * data — both are human-friendly strings.
 */
function readItemTitle(item: PaletteItem): string {
  const t = (item as { title?: unknown }).title;
  if (typeof t === "string" && t.length > 0) return t;
  return item.label;
}

// ── Sub-components ────────────────────────────────────────────────

function KindBadge({ kind }: { kind: PaletteItemKind }) {
  const cfg = KIND_BADGE[kind];
  return (
    <span
      aria-label={`${cfg.label} 类型`}
      className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium leading-4"
      style={{ backgroundColor: cfg.background, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

/**
 * A single secondary action chip. Uses the shadcn Button (ghost /
 * sm) so hover + focus-visible styling is consistent with the rest
 * of the app. Clicks are stopped from propagating to the parent
 * `CommandItem` so they don't trigger the primary select action.
 */
function SecondaryChip({
  action,
  onRun,
}: {
  action: PaletteItemSecondaryAction;
  onRun: (actionId: PaletteItemSecondaryAction["id"]) => void;
}) {
  // onMouseDown prevents the cmdk item from being "selected" the
  // instant the chip takes focus — otherwise a click would both
  // fire the primary action and the chip action.
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={action.label}
      className="h-6 px-2 text-[11px]"
      onMouseDown={stop}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        onRun(action.id);
      }}
      onKeyDown={(e) => {
        // Keep Enter inside the chip scope; cmdk would otherwise
        // also interpret Enter as "select the focused item".
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onRun(action.id);
        }
      }}
    >
      {action.label}
    </Button>
  );
}

// ── Main component ────────────────────────────────────────────────

export function CommandPalette() {
  // --- Store selectors (each picked narrowly to avoid needless rerenders) ---
  const open = useCommandPaletteStore((s) => s.open);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const query = useCommandPaletteStore((s) => s.query);
  const setQuery = useCommandPaletteStore((s) => s.setQuery);
  const pushRecent = useCommandPaletteStore((s) => s.pushRecent);
  const removeRecent = useCommandPaletteStore((s) => s.removeRecent);

  // --- Action-dispatch context collaborators ---
  const navigate = useNavigate();
  const openTab = useWikiTabStore((s) => s.openTab);
  const setAppMode = useSettingsStore((s) => s.setAppMode);

  // --- Data (Worker B is responsible for ordering + filtering) ---
  const groups = useGroupedPaletteItems(query);

  // --- Global Ctrl/Cmd+K listener -----------------------------------------
  // Capture phase so we beat any page-level input handlers. IME guard
  // prevents the toggle from firing while the user is mid-composition
  // (e.g. Chinese/Japanese IME) — `isComposing` covers modern browsers
  // and `keyCode === 229` is the legacy signal some IMEs still emit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      e.stopPropagation();
      if (open) {
        closePalette();
      } else {
        openPalette();
      }
    };
    document.addEventListener("keydown", handler, /* capture */ true);
    return () =>
      document.removeEventListener("keydown", handler, /* capture */ true);
  }, [open, openPalette, closePalette]);

  // --- Focus management ---------------------------------------------------
  // CommandDialog calls `onOpenAutoFocus: e.preventDefault()` inside the
  // shadcn wrapper, so Radix hands focus to *nothing* by default. We
  // manually focus the input after the Portal has mounted (next rAF).
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // --- Action context (memoized so child callbacks stay stable) -----------
  const actionCtx: PaletteActionContext = React.useMemo(
    () => ({
      navigate,
      openTab,
      setAppMode,
      pushRecent,
      removeRecent,
    }),
    [navigate, openTab, setAppMode, pushRecent, removeRecent],
  );

  // --- Selection dispatcher ----------------------------------------------
  // `executePaletteItem` is responsible for canonical navigation + the
  // pushRecent side-effect. We close the palette *after* it returns; the
  // store's closePalette also clears `query` so the next open starts
  // clean on the Recent view.
  const handleSelect = (item: PaletteItem) => {
    executePaletteItem(item, actionCtx);
    closePalette();
  };

  // Handler for secondary chip — always closes palette after dispatch,
  // mirroring the primary select semantics.
  const handleRunAction = (
    item: PaletteItem,
    actionId: PaletteItemSecondaryAction["id"],
  ) => {
    executePaletteItemAction(item, actionId, actionCtx);
    closePalette();
  };

  // --- Empty-state detection ---------------------------------------------
  // Only show the "no results" row when every group is empty, settled
  // (not loading), and not in error. Excluding `isError` groups prevents
  // a misleading "没有匹配的结果" when every fetch actually failed —
  // those groups render their own error rows below.
  const isFullyEmpty = groups.every(
    (g) => g.items.length === 0 && !g.isLoading && !g.isError,
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? openPalette() : closePalette())}
    >
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder="搜索页面、Wiki、素材、任务…"
      />
      <CommandList>
        {isFullyEmpty && (
          <CommandEmpty>
            {query ? "没有匹配的结果" : "输入关键词或选择最近项"}
          </CommandEmpty>
        )}
        {groups.map((group, i) => {
          // Previous visible group separator: only render when *this*
          // group is going to render something AND at least one prior
          // group also did. Keeping this simple — worst case we emit a
          // redundant separator that cmdk's `[hidden]` CSS hides.
          const showSeparator =
            i > 0 &&
            (group.items.length > 0 || group.isLoading || group.isError);

          if (group.isLoading && group.items.length === 0) {
            return (
              <React.Fragment key={group.id}>
                {showSeparator && <CommandSeparator />}
                <CommandLoading>加载 {group.heading} 中…</CommandLoading>
              </React.Fragment>
            );
          }

          // Error state: the fetch for this group failed and no cached
          // items are available. Render a muted, non-interactive row so
          // the user knows it's an error (vs the group quietly missing).
          if (group.isError && group.items.length === 0) {
            return (
              <React.Fragment key={group.id}>
                {showSeparator && <CommandSeparator />}
                <div
                  role="status"
                  className="px-3 py-2 text-xs text-muted-foreground"
                  style={{ color: "var(--color-warning)" }}
                >
                  加载 {group.heading} 失败
                </div>
              </React.Fragment>
            );
          }

          if (group.items.length === 0) {
            return null;
          }

          return (
            <React.Fragment key={group.id}>
              {showSeparator && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const title = readItemTitle(item);
                  const subtitle = readItemSubtitle(item);
                  const why = readItemWhy(item);
                  const secondary = readItemSecondaryActions(item);
                  const firstAction = secondary[0];

                  return (
                    <CommandItem
                      key={item.value}
                      value={item.value}
                      onSelect={() => handleSelect(item)}
                      onKeyDown={(e) => {
                        // Shift+Enter → first secondary action.
                        // Plain Enter continues to fire onSelect via cmdk.
                        if (e.key === "Enter" && e.shiftKey && firstAction) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRunAction(item, firstAction.id);
                        }
                      }}
                    >
                      {Icon && (
                        <Icon
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm">{title}</span>
                        {(subtitle || item.kind) && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {subtitle && (
                              <span className="truncate">{subtitle}</span>
                            )}
                            <KindBadge kind={item.kind} />
                          </span>
                        )}
                        {why && (
                          <span className="truncate text-[11px] text-muted-foreground/80">
                            {why}
                          </span>
                        )}
                      </div>
                      {secondary.length > 0 && (
                        <div
                          className="ml-auto flex shrink-0 items-center gap-1"
                          // Prevent Tab from escaping cmdk's nav — chips
                          // share the normal tab order so users flow
                          // through them naturally with Tab.
                          role="group"
                          aria-label="次动作"
                        >
                          {secondary.map((action) => (
                            <SecondaryChip
                              key={action.id}
                              action={action}
                              onRun={(id) => handleRunAction(item, id)}
                            />
                          ))}
                        </div>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </React.Fragment>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
