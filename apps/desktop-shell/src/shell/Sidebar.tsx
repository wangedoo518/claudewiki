import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "@/state/settings-store";
import {
  CLAWWIKI_ROUTES,
  type ClawWikiRoute,
  type ClawWikiSection,
} from "./clawwiki-routes";
import { useAskSessionContext } from "@/features/ask/AskSessionContext";
import { SessionSidebar } from "@/features/ask/SessionSidebar";
import { WikiFileTree } from "@/features/wiki/WikiFileTree";
import { WeChatStatusBadge } from "@/features/wechat-kefu/WeChatStatusBadge";
import { listInboxEntries } from "@/features/ingest/persist";
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * ClawWiki canonical Sidebar — task-first layout (I4).
 *
 * Post-I4 structure:
 *
 *   Header  → logo + title
 *   Content → 5-item primary task nav (首页 / 问问题 / 待整理 / 知识库
 *             / 微信接入) + context-aware secondary pane (Ask sessions
 *             on /ask, WikiFileTree elsewhere)
 *   Footer  → WeChat status badge + Settings link
 *
 * Pre-I4 the top of the sidebar was a "Chat | Wiki" mode toggle and
 * the route entries from `CLAWWIKI_ROUTES` never actually rendered
 * as sidebar buttons — most of the product was reachable only via
 * the WikiFileTree secondary pane or via deep-link URLs. That read
 * like a system module directory; the I4 sprint turns the default
 * sidebar into an answer to "what do you want to do next?".
 *
 * The `appMode` zustand slice still exists so `ClawWikiShell` can
 * keep deciding whether to mount the right-docked `ChatSidePanel`.
 * It's now derived from the route instead of from a manual toggle;
 * see the effect below.
 *
 * Design decisions captured here:
 * - Expanded width (256px) and icon-mode width (3rem / 48px) come from
 *   the shared sidebar.tsx CSS variables. Don't hard-code pixel widths
 *   in this file.
 * - Auto-collapse below 760px is handled inside SidebarProvider via
 *   matchMedia — we don't touch it here.
 * - Active state comes from `useLocation` (not zustand) so
 *   back/forward browser history and deep links work without extra
 *   plumbing.
 * - Inbox badge: pending count comes from a react-query-backed hook;
 *   other primary items don't carry badges today.
 */

function groupBySection(
  routes: readonly ClawWikiRoute[],
): Record<ClawWikiSection, ClawWikiRoute[]> {
  const grouped: Record<ClawWikiSection, ClawWikiRoute[]> = {
    primary: [],
    funnel: [],
    advanced: [],
    settings: [],
  };
  for (const r of routes) {
    grouped[r.section].push(r);
  }
  return grouped;
}

/** Match the exact path or any subpath (e.g. /ask/:sessionId → /ask). */
function isActive(currentPath: string, itemPath: string): boolean {
  if (currentPath === itemPath) return true;
  return currentPath.startsWith(`${itemPath}/`);
}

export function AppSidebar() {
  const location = useLocation();
  const appMode = useSettingsStore((s) => s.appMode);
  const setAppMode = useSettingsStore((s) => s.setAppMode);
  const grouped = useMemo(() => groupBySection(CLAWWIKI_ROUTES), []);

  const primaryRoutes = grouped.primary;
  const funnelRoutes = grouped.funnel;
  const settingsRoute = grouped.settings[0];

  // Inbox pending-count badge. Kept small and resilient: if the
  // fetch errors or is still loading, we silently skip the badge
  // rather than render a fragile "…" / "!" placeholder.
  const inboxBadgeQuery = useQuery({
    queryKey: ["wiki", "inbox", "list"] as const,
    queryFn: () => listInboxEntries(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const inboxPending = inboxBadgeQuery.data?.pending_count ?? 0;

  // Derive `appMode` from the current route so `ClawWikiShell` still
  // knows whether to mount the right-docked `ChatSidePanel`. We no
  // longer require the user to press a Chat/Wiki toggle — landing
  // on /ask implies "chat", knowledge-flow paths imply "wiki", and
  // everything else preserves the last mode.
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/ask") || path.startsWith("/chat")) {
      if (appMode !== "chat") setAppMode("chat");
    } else if (
      path.startsWith("/wiki") ||
      path.startsWith("/graph") ||
      path.startsWith("/schema") ||
      path.startsWith("/inbox") ||
      path.startsWith("/raw")
    ) {
      if (appMode !== "wiki") setAppMode("wiki");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Secondary content is derived from the path, not from `appMode`,
  // so the sidebar body always reflects where the user is right
  // now — independent of whatever mode was last persisted.
  const path = location.pathname;
  const secondary: "sessions" | "tree" | "none" = path.startsWith("/ask")
    ? "sessions"
    : path.startsWith("/wiki") ||
        path.startsWith("/inbox") ||
        path.startsWith("/raw")
      ? "tree"
      : "none";

  return (
    <UiSidebar collapsible="icon">
      <SidebarHeader className="gap-0 p-0">
        {/* Logo row */}
        <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            C
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-foreground">
              ClawWiki
            </span>
            <span className="text-[10px] text-muted-foreground">你的外脑</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        {/* Primary task nav (I4) — always visible at the top. */}
        <div className="flex flex-col gap-0.5 border-b border-sidebar-border/60 px-2 py-2">
          <SidebarMenu>
            {primaryRoutes.map((route) => (
              <RouteItem
                key={route.key}
                route={route}
                active={isActive(location.pathname, route.path)}
                badge={
                  route.key === "inbox" && inboxPending > 0
                    ? String(inboxPending)
                    : undefined
                }
              />
            ))}
            {funnelRoutes.map((route) => (
              <RouteItem
                key={route.key}
                route={route}
                active={isActive(location.pathname, route.path)}
                badge={undefined}
              />
            ))}
          </SidebarMenu>
        </div>

        {/* Context pane — SessionSidebar on /ask*, WikiFileTree on
            knowledge-flow pages, nothing elsewhere. This keeps the
            sidebar useful without turning it into a control panel. */}
        {secondary === "sessions" && <ChatSidebarContent />}
        {secondary === "tree" && <WikiSidebarContent />}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <WeChatStatusBadge />
          {settingsRoute && (
            <RouteItem
              route={settingsRoute}
              active={isActive(location.pathname, settingsRoute.path)}
              badge={undefined}
            />
          )}
        </SidebarMenu>
      </SidebarFooter>
    </UiSidebar>
  );
}

// Back-compat default export name. ClawWikiShell still imports
// `Sidebar` — keep the alias so other call sites (if any) don't break.
export { AppSidebar as Sidebar };

/**
 * Chat mode sidebar content — renders SessionSidebar (conversation list).
 */
function ChatSidebarContent() {
  const { sessionId, onSwitchSession, onResetSession } =
    useAskSessionContext();
  const navigate = useNavigate();

  return (
    <SessionSidebar
      activeSessionId={sessionId}
      onSelectSession={(id) => {
        onSwitchSession(id);
        navigate("/ask");
      }}
      onNewSession={() => {
        onResetSession();
        navigate("/ask");
      }}
    />
  );
}

/**
 * Wiki mode sidebar content — renders WikiFileTree (待整理 / 素材库 /
 * 知识库 sections, plus an opt-in "高级 · 整理规则 / 最近变更" collapsed
 * section for power users).
 */
function WikiSidebarContent() {
  return <WikiFileTree embedded />;
}

interface RouteItemProps {
  route: ClawWikiRoute;
  active: boolean;
  badge?: string;
}

function RouteItem({ route, active, badge }: RouteItemProps) {
  const Icon = route.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={route.label}>
        <Link to={route.path} aria-current={active ? "page" : undefined}>
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0"
            strokeWidth={1.5}
          />
          <span>{route.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}
