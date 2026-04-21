import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSettingsStore } from "@/state/settings-store";
import {
  CLAWWIKI_ROUTES,
  type ClawWikiRoute,
} from "./clawwiki-routes";
import { useAskSessionContext } from "@/features/ask/AskSessionContext";
import { SessionSidebar } from "@/features/ask/SessionSidebar";
import { WikiFileTree } from "@/features/wiki/WikiFileTree";
import { WeChatStatusBadge } from "@/features/wechat-kefu/WeChatStatusBadge";
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
 * ClawWiki canonical Sidebar — DS1: user-first primary nav.
 *
 * Structure (post-DS1):
 *
 *   Header     → logo + title
 *   PrimaryNav → 首页 / 问问题 / 待整理 / 知识库 / 微信接入
 *                (renders `primary` + `funnel` entries from
 *                 CLAWWIKI_ROUTES; `advanced` stays out of the default
 *                 sidebar, reachable via URL + palette.)
 *   Content    → contextual secondary nav:
 *                  - /ask      → SessionSidebar (conversation history)
 *                  - /wiki*    → WikiFileTree (pages tree)
 *                  - else      → empty (just primary nav showing)
 *   Footer     → WeChat status badge + Settings link
 *
 * What changed in DS1-A vs. pre-DS1:
 * - The "Chat | Wiki" ModeToggle widget was removed. It was an I4-era
 *   transitional UX that forced users to pick a "mode" before seeing
 *   any primary entry; the v2 design-system IA requires all 5 primary
 *   entries visible at once.
 * - `appMode` state is still kept in sync with the route here (via the
 *   existing useEffect below) so `ClawWikiShell.showChatPanel` — which
 *   gates the right-side ChatSidePanel on `appMode === "wiki"` — keeps
 *   its contract. Nothing about route handling or session management
 *   changed; only the sidebar's visible chrome.
 * - Active-route highlighting uses `isActive()` to match a path or its
 *   sub-paths, same as before. Terracotta accent on active items comes
 *   from the shared `SidebarMenuButton` isActive variant.
 *
 * Design notes:
 * - Expanded width (256px) / icon-mode (48px) come from the shared
 *   sidebar.tsx CSS variables — don't hard-code them here.
 * - Auto-collapse below 760px is handled inside SidebarProvider.
 * - Active state for the Settings footer link reads useLocation
 *   directly (not zustand) so history + deep links work.
 */

/** Match the exact path or any subpath (e.g. /ask/:sessionId → /ask). */
function isActive(currentPath: string, itemPath: string): boolean {
  if (currentPath === itemPath) return true;
  return currentPath.startsWith(`${itemPath}/`);
}

/** Which contextual content to show beneath the primary nav. */
type ContextualPane = "sessions" | "wiki-tree" | "none";
function paneForRoute(pathname: string): ContextualPane {
  if (pathname.startsWith("/ask") || pathname.startsWith("/chat")) {
    return "sessions";
  }
  if (
    pathname.startsWith("/wiki") ||
    pathname.startsWith("/raw") ||
    pathname.startsWith("/graph") ||
    pathname.startsWith("/schema")
  ) {
    return "wiki-tree";
  }
  return "none";
}

export function AppSidebar() {
  const location = useLocation();
  const appMode = useSettingsStore((s) => s.appMode);
  const setAppMode = useSettingsStore((s) => s.setAppMode);
  const settingsRoute = CLAWWIKI_ROUTES.find((r) => r.key === "settings");
  const pane = paneForRoute(location.pathname);

  // Keep `appMode` auto-synced with the route so the right-side
  // ChatSidePanel (gated on `appMode === "wiki"`) still appears on
  // wiki-family routes. The old ModeToggle owned this; DS1 collapsed
  // ModeToggle into the primary nav, but the sync is still needed.
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

        {/* Primary nav — always visible (5 task entries).
            Sits in SidebarHeader so it stays fixed above the contextual
            content pane that scrolls below. */}
        <PrimaryNav currentPath={location.pathname} />
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        {pane === "sessions" && <ChatSidebarContent />}
        {pane === "wiki-tree" && <WikiSidebarContent />}
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
// `Sidebar` — keep the alias so other call sites don't break.
export { AppSidebar as Sidebar };

/**
 * Primary nav list rendered inside SidebarHeader. Pulls the 5 top-level
 * user-task entries (`primary` + `funnel` sections) from the shared
 * CLAWWIKI_ROUTES registry so there's only one source of truth.
 *
 * Advanced routes (raw / graph / schema) are intentionally skipped —
 * users find them via the Knowledge Hub tabs (DS1-B) or the command
 * palette. This matches the v2 design's "default layer vs advanced
 * layer" IA.
 */
function PrimaryNav({ currentPath }: { currentPath: string }) {
  const items = CLAWWIKI_ROUTES.filter(
    (r) => r.section === "primary" || r.section === "funnel",
  );
  return (
    <div className="border-b border-sidebar-border px-1 py-1 group-data-[collapsible=icon]:px-0.5">
      <SidebarMenu>
        {items.map((route) => (
          <RouteItem
            key={route.key}
            route={route}
            active={isActive(currentPath, route.path)}
            badge={route.badge}
          />
        ))}
      </SidebarMenu>
    </div>
  );
}

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
 * Wiki mode sidebar content — renders WikiFileTree (Inbox / Raw / Wiki
 * / Schema tree with an opt-in advanced section for power users).
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
