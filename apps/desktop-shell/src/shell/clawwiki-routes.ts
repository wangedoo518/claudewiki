/**
 * Single source of truth for ClawWiki canonical shell routes.
 *
 * The shell exposes user-task-oriented PRIMARY entries, plus a few
 * SECONDARY / ADVANCED routes that stay reachable by URL + palette
 * + in-page links but don't occupy a top-level slot in the sidebar.
 * The Sidebar component, the `ClawWikiShell` route table, the command
 * palette, and any future "go to next section" keyboard shortcut all
 * read from this list so they stay in sync.
 *
 * Each entry:
 * - `path` is the HashRouter pathname (must start with `/`)
 * - `key` is stable across renames and is used in tests / analytics
 * - `icon` uses a single-char glyph so we don't need to import a full
 *   icon library at the Sidebar level (Lucide is available but the
 *   wireframes already use these emoji, keeping parity is cheaper)
 * - `label` is the Chinese user-facing label — I4 sprint moved
 *   everything to task-oriented language (问问题 / 待整理 / 知识库
 *   etc.) so the default sidebar stops reading like a system module
 *   directory.
 * - `section` groups items for Sidebar rendering
 *     primary  — always-visible top-level task entries
 *     funnel   — always-visible entry that points at a specific flow
 *                (WeChat onboarding — separate group so users can find
 *                it even if they're not in the middle of an Ask/Wiki
 *                workflow)
 *     advanced — reachable by URL + palette + in-page links, NOT
 *                rendered in the sidebar's default top-level list
 *     settings — pinned to the sidebar foot
 * - `sprint` tags when each surface is planned to light up
 * - `badge` is an optional Sidebar counter (e.g. Inbox unread) — for
 *   S0.2 all badges are static "—" placeholders
 */
export type ClawWikiSection = "primary" | "funnel" | "advanced" | "settings";

export interface ClawWikiRoute {
  key: string;
  path: string;
  icon: string;
  label: string;
  section: ClawWikiSection;
  sprint: string;
  badge?: string;
}

export const CLAWWIKI_ROUTES: readonly ClawWikiRoute[] = [
  {
    key: "dashboard",
    path: "/dashboard",
    icon: "🏠",
    label: "首页",
    section: "primary",
    sprint: "S3",
  },
  // Ask is promoted back to a top-level primary entry so the sidebar
  // reads "问问题" instead of forcing users through the old Chat/Wiki
  // mode toggle.
  {
    key: "ask",
    path: "/ask",
    icon: "💬",
    label: "问问题",
    section: "primary",
    sprint: "S3",
  },
  {
    key: "inbox",
    path: "/inbox",
    icon: "📥",
    label: "待整理",
    section: "primary",
    sprint: "S4",
    badge: "—",
  },
  {
    key: "wiki",
    path: "/wiki",
    icon: "📖",
    label: "知识库",
    section: "primary",
    sprint: "S4",
  },
  {
    key: "wechat",
    path: "/wechat",
    icon: "🔗",
    label: "微信接入",
    section: "funnel",
    sprint: "S5 (iLink)",
  },
  // ── Advanced / secondary routes — not rendered in the default
  //    sidebar but still accessible by direct URL, command palette,
  //    and in-page links (Dashboard quick actions, Wiki article
  //    "查看关系图" button, Settings → 高级).
  {
    key: "raw",
    path: "/raw",
    icon: "📄",
    label: "素材库",
    section: "advanced",
    sprint: "S1",
  },
  {
    key: "graph",
    path: "/graph",
    icon: "🕸",
    label: "关系图",
    section: "advanced",
    sprint: "S6",
  },
  {
    key: "schema",
    path: "/schema",
    icon: "📐",
    label: "整理规则",
    section: "advanced",
    sprint: "S6",
  },
  {
    key: "settings",
    path: "/settings",
    icon: "⚙️",
    label: "设置",
    section: "settings",
    sprint: "reused",
  },
] as const;

/**
 * The route the ClawWiki shell falls back to when a legacy or unknown
 * path is visited. Dashboard is chosen per canonical §5: "用户最高频的
 * 动作是在微信发一条 → 然后回到桌面看 Inbox → 点 Ask 接着挖", and
 * Dashboard is the surface that answers "my external brain grew by
 * how much today?".
 */
export const CLAWWIKI_DEFAULT_ROUTE = "/dashboard";
