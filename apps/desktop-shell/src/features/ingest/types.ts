// S1 ingest pipeline — wire types.
//
// Mirrors the JSON shapes returned by the desktop-server `/api/wiki/raw`
// routes (handlers in `rust/crates/desktop-server/src/lib.rs`). Keep
// this file in sync when the Rust struct changes.

export type RawSource =
  | "paste"
  | "wechat-text"
  | "wechat-article"
  | "url"
  | "voice"
  | "image"
  | "pdf"
  | "pptx"
  | "docx"
  | "video"
  | "card"
  | "chat";

export interface RawEntry {
  id: number;
  filename: string;
  source: string;
  slug: string;
  /** ISO date `YYYY-MM-DD` from the filename. */
  date: string;
  source_url?: string | null;
  /** ISO-8601 datetime from the frontmatter. */
  ingested_at: string;
  byte_size: number;
}

export interface IngestRawRequest {
  source: RawSource;
  title: string;
  body: string;
  source_url?: string;
}

export interface RawListResponse {
  entries: RawEntry[];
}

export interface RawDetailResponse {
  entry: RawEntry;
  body: string;
}
