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
 *
 * This component intentionally never filters items itself — `Command`
 * defaults to `shouldFilter={false}` (see components/ui/command.tsx) so
 * cmdk only handles keyboard + selection, not matching.
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
import { useCommandPaletteStore } from "@/state/command-palette-store";
import { useWikiTabStore } from "@/state/wiki-tab-store";
import { useSettingsStore } from "@/state/settings-store";
import { useGroupedPaletteItems } from "@/features/palette/usePaletteItems";
import { executePaletteItem } from "@/features/palette/actions";
import type { PaletteItem } from "@/features/palette/types";

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

  // --- Selection dispatcher ----------------------------------------------
  // `executePaletteItem` is responsible for canonical navigation + the
  // pushRecent side-effect. We close the palette *after* it returns; the
  // store's closePalette also clears `query` so the next open starts
  // clean on the Recent view.
  const handleSelect = (item: PaletteItem) => {
    executePaletteItem(item, {
      navigate,
      openTab,
      setAppMode,
      pushRecent,
      removeRecent,
    });
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
                  return (
                    <CommandItem
                      key={item.value}
                      value={item.value}
                      onSelect={() => handleSelect(item)}
                    >
                      {Icon && (
                        <Icon
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span className="ml-auto text-xs text-muted-foreground truncate">
                          {item.hint}
                        </span>
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
