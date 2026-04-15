import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { CLAWWIKI_DEFAULT_ROUTE } from "./clawwiki-routes";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { AskPage } from "@/features/ask/AskPage";
import { ChatSidePanel } from "@/features/ask/ChatSidePanel";
import { InboxPage } from "@/features/inbox/InboxPage";
import { RawLibraryPage } from "@/features/raw/RawLibraryPage";
import { WikiExplorerPage } from "@/features/wiki/WikiExplorerPage";
import { GraphPage } from "@/features/graph/GraphPage";
import { SchemaEditorPage } from "@/features/schema/SchemaEditorPage";
import { WeChatBridgePage } from "@/features/wechat/WeChatBridgePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SettingsModal } from "@/features/settings/SettingsModal";
import { useSettingsStore } from "@/state/settings-store";

/**
 * ClawWikiShell — v2 dual-tab shell (Chat | Wiki).
 *
 * Layout (per ia-layout.md §1):
 *
 *   ┌───────────┬─────────────────────────┬───────────────┐
 *   │           │                         │ ChatSidePanel │
 *   │  Sidebar  │    main (Routes)        │ (Wiki mode)   │
 *   │  220 / 56 │                         │  320px        │
 *   │           │                         │               │
 *   └───────────┴─────────────────────────┴───────────────┘
 *
 * The Sidebar has a Chat/Wiki mode toggle at the top.
 * ChatSidePanel appears on the right only in Wiki mode.
 * All existing routes remain compatible.
 */
function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="flex h-full flex-col animate-fade-in">
      {children}
    </div>
  );
}

export function ClawWikiShell() {
  const appMode = useSettingsStore((s) => s.appMode);
  const location = useLocation();

  // v2 bugfix: ChatSidePanel shows ONLY when
  //   (1) appMode is "wiki" (sidebar toggle chose Wiki), AND
  //   (2) we're not currently on a Chat-dedicated route.
  // Per ia-layout.md §4: "Chat 模式下隐藏（避免重复）". Since appMode
  // is independent of the URL (persisted in localStorage), /ask can be
  // active even when appMode=="wiki" — so we gate on the route too to
  // prevent the dual-chatbox UX issue.
  const isChatRoute =
    location.pathname.startsWith("/ask") ||
    location.pathname.startsWith("/chat");
  const showChatPanel = appMode === "wiki" && !isChatRoute;

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="relative flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            <Routes>
              <Route
                path="/dashboard"
                element={
                  <PageTransition>
                    <DashboardPage />
                  </PageTransition>
                }
              />
              <Route
                path="/ask/*"
                element={
                  <PageTransition>
                    <AskPage />
                  </PageTransition>
                }
              />
              <Route
                path="/inbox"
                element={
                  <PageTransition>
                    <InboxPage />
                  </PageTransition>
                }
              />
              <Route
                path="/raw/*"
                element={
                  <PageTransition>
                    <RawLibraryPage />
                  </PageTransition>
                }
              />
              <Route
                path="/wiki/*"
                element={
                  <PageTransition>
                    <WikiExplorerPage />
                  </PageTransition>
                }
              />
              <Route
                path="/graph"
                element={
                  <PageTransition>
                    <GraphPage />
                  </PageTransition>
                }
              />
              <Route
                path="/schema/*"
                element={
                  <PageTransition>
                    <SchemaEditorPage />
                  </PageTransition>
                }
              />
              <Route
                path="/wechat"
                element={
                  <PageTransition>
                    <WeChatBridgePage />
                  </PageTransition>
                }
              />
              <Route
                path="/settings"
                element={
                  <PageTransition>
                    <SettingsPage />
                  </PageTransition>
                }
              />
              <Route
                path="*"
                element={<Navigate to={CLAWWIKI_DEFAULT_ROUTE} replace />}
              />
            </Routes>
          </ErrorBoundary>
        </main>
        {/* Right-side Chat panel — wiki mode only, and never on Chat routes.
            External conditional render (not a prop) avoids mounting then
            immediately unmounting the heavy useAskSession hook. */}
        {showChatPanel && <ChatSidePanel />}
      </div>
      {/* Global Settings Modal — 08-settings-modal.md */}
      <SettingsModal />
    </ErrorBoundary>
  );
}
