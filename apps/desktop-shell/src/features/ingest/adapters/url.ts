// Paste-URL adapter.
//
// B.2 upgrade: the backend `ingest_wiki_raw_handler` now honors
// `{source: "url", body: "", source_url: "..."}` by delegating to
// `wiki_ingest::url::fetch_and_body`, which actually fetches the URL
// and stores the response body (text/html wrapped in a code fence,
// text/plain/markdown verbatim, opaque MIMEs get a stub). This
// adapter therefore sends an empty body and lets the server do the
// real work.
//
// A caller that wants to skip the network fetch (e.g. a manual
// import of cached content) can pass `body` directly; the server
// only triggers `wiki_ingest` when `body` is empty.
//
// M4 upgrade: the backend now returns an **envelope** rather than a
// flat `RawEntry`:
//
//   {
//     raw_entry: RawEntry,
//     inbox_entry?: InboxEntry | null,
//     decision?: IngestDecision | null,
//     dedupe?: boolean,            // true for reused/suppressed paths
//     content_hash?: string | null,
//   }
//
// Older backends (pre-M4) still return a flat `RawEntry`, so this
// adapter normalises both into the same `IngestUrlResult` shape —
// when we see the envelope we pass fields through as-is, otherwise we
// synthesize an envelope around the flat entry with `decision = null`.
// Callers can therefore branch on `decision?.kind` without worrying
// about which backend shipped the response.

import { fetchJson } from "@/lib/desktop/transport";
import type { IngestDecision } from "@/lib/tauri";
import type { InboxEntry, RawEntry } from "../types";

export interface IngestUrlInput {
  url: string;
  title?: string;
  /**
   * Optional pre-fetched body. When absent (the common case),
   * `ingest_wiki_raw_handler` will call `wiki_ingest::url::fetch_and_body`
   * and populate the body from the live URL.
   */
  body?: string;
}

/**
 * Normalised result of a URL ingest request. Always carries a
 * `raw_entry` so callers can continue their existing "splice into
 * list" flow without branching on backend age. Other fields are best-
 * effort: `decision` / `dedupe` / `content_hash` come from the M4
 * envelope and will be `null` / `undefined` against a legacy server.
 */
export interface IngestUrlResult {
  raw_entry: RawEntry;
  inbox_entry?: InboxEntry | null;
  /** M4: the decision the orchestrator made for this request. */
  decision?: IngestDecision | null;
  /** M4: true when the decision was a reuse / suppress path. */
  dedupe?: boolean;
  /** M4: hex-encoded content hash of the fetched body. */
  content_hash?: string | null;
}

/**
 * Raw wire shape returned by `POST /api/wiki/raw`. The server may
 * emit either:
 *   - legacy flat `RawEntry` (pre-M4), or
 *   - an M4 envelope `{ raw_entry, inbox_entry, decision, dedupe, content_hash }`.
 * Detected by presence of the `raw_entry` key.
 */
type IngestUrlWire =
  | RawEntry
  | {
      raw_entry: RawEntry;
      inbox_entry?: InboxEntry | null;
      decision?: IngestDecision | null;
      dedupe?: boolean;
      content_hash?: string | null;
    };

/**
 * True when the wire response is the M4 envelope shape. Checks the
 * presence of `raw_entry` (legacy shape has `id` + `filename` at top
 * level and no `raw_entry` key).
 */
function isEnvelope(
  wire: IngestUrlWire,
): wire is Extract<IngestUrlWire, { raw_entry: RawEntry }> {
  return (
    typeof wire === "object" &&
    wire !== null &&
    "raw_entry" in wire &&
    typeof (wire as { raw_entry?: unknown }).raw_entry === "object"
  );
}

export async function ingestUrl(input: IngestUrlInput): Promise<IngestUrlResult> {
  const url = input.url.trim();
  if (!url) {
    throw new Error("ingestUrl: url is empty");
  }
  // Best-effort title fallback: take the URL hostname. The backend
  // will override this with the wiki_ingest result if we don't
  // supply an explicit title.
  const fallbackTitle = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const wire = await fetchJson<IngestUrlWire>("/api/wiki/raw", {
    method: "POST",
    body: JSON.stringify({
      source: "url",
      title: input.title?.trim() || fallbackTitle,
      body: input.body ?? "",
      source_url: url,
    }),
  });

  // Normalise legacy flat `RawEntry` into the envelope shape so
  // downstream consumers only have to deal with one type.
  if (isEnvelope(wire)) {
    return {
      raw_entry: wire.raw_entry,
      inbox_entry: wire.inbox_entry ?? null,
      decision: wire.decision ?? null,
      dedupe: wire.dedupe,
      content_hash: wire.content_hash ?? null,
    };
  }
  return {
    raw_entry: wire,
    decision: null,
  };
}
