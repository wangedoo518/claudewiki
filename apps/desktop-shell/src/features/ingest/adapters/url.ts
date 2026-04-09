// S1 paste-URL adapter (minimal).
//
// MVP behavior: we accept the URL string and store it as the body of a
// `url`-source entry, with the URL itself echoed into both the body
// and the frontmatter `source_url` field. We deliberately do NOT fetch
// the URL contents in S1 — that responsibility moves to S6 when the
// `wiki_ingest` Rust crate lands defuddle + obsidian-clipper integration
// per canonical §7.3.
//
// The structure of this file matches the future shape so the S6 swap is
// a single function-body change with no consumer rewrites.

import { ingestRawEntry } from "../persist";
import type { RawEntry } from "../types";

export interface IngestUrlInput {
  url: string;
  title?: string;
}

/**
 * Build a minimal markdown body that captures just the URL. Future
 * S6 work will replace this with the defuddle-extracted article text
 * and a richer frontmatter (published date, author, ...).
 */
function buildPlaceholderBody(url: string): string {
  return [
    `# ${url}`,
    "",
    "_This entry was ingested via the S1 minimal URL adapter._",
    "_Full article extraction (defuddle + obsidian-clipper) lands in S6._",
    "",
    `<${url}>`,
    "",
  ].join("\n");
}

export async function ingestUrl(input: IngestUrlInput): Promise<RawEntry> {
  const url = input.url.trim();
  if (!url) {
    throw new Error("ingestUrl: url is empty");
  }
  // Best-effort title fallback: take the URL hostname.
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
    body: buildPlaceholderBody(url),
    source_url: url,
  });
}
