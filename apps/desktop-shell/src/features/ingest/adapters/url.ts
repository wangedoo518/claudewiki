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

import { ingestRawEntry } from "../persist";
import type { RawEntry } from "../types";

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

export async function ingestUrl(input: IngestUrlInput): Promise<RawEntry> {
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

  return ingestRawEntry({
    source: "url",
    title: input.title?.trim() || fallbackTitle,
    body: input.body ?? "",
    source_url: url,
  });
}
