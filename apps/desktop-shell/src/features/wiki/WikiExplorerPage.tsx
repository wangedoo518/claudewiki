import { PageStub } from "@/components/PageStub";

/**
 * Wiki Pages Explorer (wireframes.html §04, §05)
 *
 * Final surface is a two-pane explorer:
 * - Left: categories (concepts / people / topics / compare / changelog)
 *   + search + fresh/stale/conflict filter
 * - Right: `WikiPageDetail` rendering the page as Lora-serif body
 *   with frontmatter chip strip + backlinks aside + history aside
 *
 * Implemented in S4 (maintainer MVP sprint — we need the maintainer
 * to actually produce pages before the explorer has anything to show).
 */
export function WikiExplorerPage() {
  return (
    <PageStub
      icon="📖"
      title="Wiki Pages · LLM 主笔层"
      tagline="AI 帮我长出了什么 — concept / people / topic / compare · Lora 衬线正文 · backlinks 网络"
      sprint="S4"
    />
  );
}
