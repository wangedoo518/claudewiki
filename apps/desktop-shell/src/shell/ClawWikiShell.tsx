import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Sidebar } from "./Sidebar";
import { CLAWWIKI_DEFAULT_ROUTE } from "./clawwiki-routes";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { AskPage } from "@/features/ask/AskPage";
import { InboxPage } from "@/features/inbox/InboxPage";
import { RawLibraryPage } from "@/features/raw/RawLibraryPage";
import { WikiExplorerPage } from "@/features/wiki/WikiExplorerPage";
import { GraphPage } from "@/features/graph/GraphPage";
import { SchemaEditorPage } from "@/features/schema/SchemaEditorPage";
import { WeChatBridgePage } from "@/features/wechat/WeChatBridgePage";
import { SettingsPage } from "@/features/settings/SettingsPage";

/**
 * ClawWikiShell — the canonical (post-D2 override) application shell.
 *
 * Selected instead of `AppShell` when `settings-store.clawwikiShell`
 * is true. Layout:
 *
 *   ┌───────────┬─────────────────────────────────────┐
 *   │           │                                     │
 *   │  Sidebar  │    main (Routes outlet)             │
 *   │  220 / 56 │                                     │
 *   │           │                                     │
 *   └───────────┴─────────────────────────────────────┘
 *
 * No TabBar. No top chrome. Only the sidebar + the active route's
 * page component. Status bar shows up only on Ask and Inbox (added
 * in S3/S4 when those pages promote from stubs to real surfaces).
 *
 * Every route is wrapped in a `PageTransition` + individual
 * `ErrorBoundary` so a single exploding page does not take down the
 * rest of the shell. The top-level ErrorBoundary catches shell-wide
 * crashes (e.g. Sidebar throwing).
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
      </div>
    </ErrorBoundary>
  );
}
