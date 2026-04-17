/**
 * Palette filter helpers — query normalization + substring matching.
 *
 * The palette uses simple case-insensitive substring matching against
 * label, hint, and optional extra fields. UTF-8 `includes` works for
 * Chinese without any additional pinyin / fuzzy scoring — the product
 * is CN-only until MVP ships so this is the right default.
 *
 * We preserve input order (no scoring/ranking) — callers order items
 * intentionally (Pages in route declaration order, Raw by id desc,
 * etc.) and we do not want to disturb that.
 */

/** Lowercase + trim. Exposed for callers that need consistent normalization. */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Filter `items` by matching `query` against `label`, `hint`, and any
 * additional fields returned by `extraFields`.
 *
 * - Empty/whitespace query returns all items unchanged.
 * - Match is case-insensitive substring (works for Chinese too).
 * - Input order is preserved.
 */
export function filterPaletteItems<T extends { label: string; hint?: string }>(
  items: T[],
  query: string,
  extraFields?: (item: T) => string[],
): T[] {
  const nq = normalizeForSearch(query);
  if (nq === "") return items;

  return items.filter((item) => {
    if (normalizeForSearch(item.label).includes(nq)) return true;
    if (item.hint && normalizeForSearch(item.hint).includes(nq)) return true;
    if (extraFields) {
      const extras = extraFields(item);
      for (const field of extras) {
        if (normalizeForSearch(field).includes(nq)) return true;
      }
    }
    return false;
  });
}
