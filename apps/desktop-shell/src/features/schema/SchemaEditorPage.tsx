import { PageStub } from "@/components/PageStub";

/**
 * Schema Editor · Maintainer 的纪律 (wireframes.html §09)
 *
 * Final surface is a left-pane file tree of `~/.clawwiki/schema/`
 * (CLAUDE.md, AGENTS.md, templates/, policies/) + right-pane preview
 * of the selected file. The maintainer agent can PROPOSE changes via
 * Inbox but never writes directly (enforced by §8 CLAUDE.md "Never
 * touch schema/"). MVP is read-only + "view proposal diff" mode.
 *
 * Implemented in S6 (graph + schema editor sprint).
 */
export function SchemaEditorPage() {
  return (
    <PageStub
      icon="📐"
      title="Schema Editor · Maintainer 的纪律"
      tagline="AI 的纪律是什么 — CLAUDE.md / AGENTS.md / templates / policies · 人写优先 · AI 只能提议"
      sprint="S6"
    />
  );
}
