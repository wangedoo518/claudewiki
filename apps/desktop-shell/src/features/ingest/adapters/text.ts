// S1 paste-text adapter.
//
// The "happy path" Raw Library form: user pastes plain text, optionally
// supplies a title, and we round-trip it to `~/.clawwiki/raw/` as a
// `paste`-source entry. No transformation, no defuddle, no markdown
// rewriting — bytes go in verbatim.
//
// Per canonical §11.2, more elaborate adapters (wechat-article via
// defuddle, voice via whisper, image via Vision) ship in S6.

import { ingestRawEntry } from "@/api/wiki/repository";
import type { RawEntry } from "@/api/wiki/types";

export interface IngestTextInput {
  title: string;
  body: string;
}

export async function ingestText(input: IngestTextInput): Promise<RawEntry> {
  return ingestRawEntry({
    source: "paste",
    title: input.title.trim() || "untitled",
    body: input.body,
  });
}
