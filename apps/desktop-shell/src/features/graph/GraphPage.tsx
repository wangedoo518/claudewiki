import { PageStub } from "@/components/PageStub";

/**
 * Graph · 你的认知网络 (wireframes.html §08)
 *
 * Final surface is a force-directed node+edge render of the wiki:
 * nodes = pages, color = fresh/stale/conflict, click jumps to
 * `WikiPageDetail`. MVP is read-only with no editing affordances.
 *
 * Implemented in S6 (rich-ingest + graph sprint).
 */
export function GraphPage() {
  return (
    <PageStub
      icon="🕸"
      title="Graph · 你的认知网络"
      tagline="我的脑子里都连起来没 — 节点 = 页面 · 颜色 = fresh/stale/conflict · 力导向 · MVP 只读"
      sprint="S6"
    />
  );
}
