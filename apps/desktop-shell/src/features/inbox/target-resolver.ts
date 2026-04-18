/**
 * Q2 Target Resolver — client-side fallback for
 * `GET /api/wiki/inbox/{id}/candidates`.
 *
 * The primary scorer lives in Worker A's Rust handler. When the
 * backend endpoint returns 404 (older dev server running without the
 * Q2 patch), `persist.fetchInboxCandidates` lazy-imports this module
 * and runs the TS port of the same algorithm against
 * `listInboxEntries` + `listWikiPages` so the Inbox UI keeps showing
 * a candidate picker.
 *
 * Parity with the server — `computeCandidates` lives in
 * `candidate-scoring.ts` and is a 1:1 port of the Rust scorer.
 * Graph signals are *not* computed in fallback mode (collecting the
 * per-page graph context client-side requires an O(N) loop over
 * every page's relations endpoint; not worth it for a degraded path).
 * Non-graph reason codes — exact_slug, exact_title, title_overlap_*,
 * shared_raw_source, existing_target, existing_proposed — still fire
 * so the common cases stay covered.
 */

import { computeCandidates, type InboxCandidatesResponse } from "./candidate-scoring";
import { listInboxEntries, listWikiPages } from "@/features/ingest/persist";

/**
 * Resolve top-K candidate wiki pages for an inbox entry using the
 * client-side scorer. Fetches `listInboxEntries` + `listWikiPages`
 * in parallel so the total fallback cost is one RTT for each, not
 * two sequential RTTs.
 *
 * Returns `{ inbox_id, candidates: [] }` with an empty list when:
 *   • the inbox entry doesn't exist (e.g. just resolved / race),
 *   • the scorer finds nothing above the 10-point floor.
 *
 * Never throws on scorer internals — propagation of errors is
 * limited to `fetch` failures from the two list endpoints (those
 * bubble to the caller's error boundary).
 */
export async function resolveInboxCandidatesClientSide(
  inboxId: number,
): Promise<InboxCandidatesResponse> {
  const [inboxRes, pagesRes] = await Promise.all([
    listInboxEntries(),
    listWikiPages(),
  ]);

  const inbox = (inboxRes.entries ?? []).find((e) => e.id === inboxId);
  if (!inbox) {
    return { inbox_id: inboxId, candidates: [] };
  }

  const pages = (pagesRes.pages ?? []).map((p) => ({
    slug: p.slug,
    title: p.title,
    source_raw_id: p.source_raw_id ?? null,
  }));

  const candidates = computeCandidates({
    inbox_title: inbox.title,
    inbox_source_raw_id: inbox.source_raw_id ?? null,
    inbox_target_page_slug: inbox.target_page_slug ?? null,
    inbox_proposed_wiki_slug: inbox.proposed_wiki_slug ?? null,
    wiki_pages: pages,
    // graphs omitted — too expensive to compute client-side.
  });

  return { inbox_id: inboxId, candidates };
}
