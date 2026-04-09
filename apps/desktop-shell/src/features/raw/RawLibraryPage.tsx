import { PageStub } from "@/components/PageStub";

/**
 * Raw Library · 不可变事实层 (wireframes.html §03)
 *
 * Final surface lists every file in `~/.clawwiki/raw/` — WeChat
 * ingested articles, voice transcripts, PPT slides, videos, etc.
 * The layout is read-only by contract (schema CLAUDE.md §Layer
 * contract). Users filter by kind/date/source and click through to
 * a `RawDetailPage` showing frontmatter + original body + attachments.
 *
 * Implemented in S1 (ingest funnel sprint). Note: the on-disk shape
 * was already laid by the `wiki_store::init_wiki` function in S0.1.
 */
export function RawLibraryPage() {
  return (
    <PageStub
      icon="📥"
      title="Raw Library · 不可变事实层"
      tagline="我喂进去什么了 — 微信转发、语音转写、PPT 抽取、视频关键帧 · 只读、每条带 sha256"
      sprint="S1"
    />
  );
}
