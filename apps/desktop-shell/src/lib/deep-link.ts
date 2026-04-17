/**
 * Deep-link helpers — shared URL-driven selection primitives.
 *
 * Used by features that expose a single "focused item" through a URL
 * query param (Raw Library ?entry=N, Inbox ?task=N). Keeps the
 * URL↔state contract in one place so pages can't drift apart.
 *
 * Contract (per F2 stop A):
 *  - history strategy is always `{ replace: true }`; selection never
 *    pushes a new history entry
 *  - URL is the source of truth on mount (lazy useState init)
 *  - URL → state is reverse-synced on every searchParams change so
 *    same-page paste / link click / address-bar edit all take effect
 *  - Parser must return `null` for any invalid / missing value; pages
 *    decide separately whether to show a not-found banner
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Parse a URL param as a positive integer. Rejects NaN, 0, negative,
 * and non-integer values. Backend ids start from 1, so 0 is not a
 * valid id either — don't relax this.
 */
export function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Copy the current full URL (including HashRouter hash) to the
 * clipboard. Returns true on success, false on failure (permission
 * denied, insecure context, etc). Callers should surface feedback.
 */
export async function copyCurrentUrl(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}

/**
 * URL-driven selection state.
 *
 *   const [selectedId, setSelectedId] = useDeepLinkState("entry", parsePositiveInt);
 *
 * - Initial value: parsed from URL on mount
 * - Reverse sync: if URL changes externally (paste, link click,
 *   browser back), state follows
 * - Setter: updates state AND URL in one call, always with replace
 * - Passing `null` clears the param from the URL
 *
 * The setter intentionally mutates only the target param key: any
 * other query params that happen to live on the same URL are
 * preserved through a URLSearchParams copy. This future-proofs pages
 * that later add a second param (e.g. `?entry=5&tab=history`).
 */
export function useDeepLinkState<T>(
  paramKey: string,
  parse: (raw: string | null) => T | null,
): [T | null, (next: T | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Lazy init — runs once per mount; subsequent URL changes are
  // handled by the reverse-sync effect below.
  const [state, setState] = useState<T | null>(() =>
    parse(searchParams.get(paramKey)),
  );

  // Reverse sync: URL → state. Uses a functional setState so we skip
  // re-renders when URL and state already agree. This is the only
  // place state is read from searchParams after mount, so there's no
  // infinite loop even though the setter also calls setSearchParams
  // (setSearchParams reference is stable per react-router v6).
  useEffect(() => {
    const urlValue = parse(searchParams.get(paramKey));
    setState((prev) => (prev === urlValue ? prev : urlValue));
    // `parse` is assumed stable (module-level or useCallback'd by caller).
    // paramKey is a constant string literal in every current call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setter = useCallback(
    (next: T | null) => {
      setState(next);
      setSearchParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (next === null || next === undefined) {
            copy.delete(paramKey);
          } else {
            copy.set(paramKey, String(next));
          }
          return copy;
        },
        { replace: true },
      );
    },
    [paramKey, setSearchParams],
  );

  return [state, setter];
}
