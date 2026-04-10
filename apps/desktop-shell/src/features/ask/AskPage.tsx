/**
 * Ask · CCD 工作台 + 流式会话 (wireframes.html §06, SOUL ①+②)
 *
 * S3 — the CCD soul injection sprint. We promote the page from a
 * stub to a real workbench by:
 *
 *   1. Using `useAskSession` to resolve (or create) the active
 *      Desktop session and track its turn state.
 *   2. Mounting the S0.3-extracted `<AskWorkbench />` component with
 *      the hook's session / onSend / isSending wiring. The workbench
 *      already owns the sidebar, streaming, composer, permission
 *      dialog, and status line — S0.3 proved the component compiles
 *      standalone, and S3 just feeds it a real backend.
 *   3. Rendering a thin loading overlay while the first session
 *      resolves so users aren't greeted by an empty black canvas.
 *
 * canonical §6.1 mapping:
 *   工作台 (sidebar + main + status line)  = AskWorkbench.tsx
 *   流式会话 (virtual list + tool cards)    = MessageList.tsx + Message.tsx
 *   权限确认 (low/medium/high)              = WikiPermissionDialog.tsx
 *
 * S4 will add the Inbox-facing `MaintainerTaskTree` integration —
 * the workbench already has a button that toggles a stub subagent
 * panel, and S4 will replace its content with real maintainer
 * actions.
 */

import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { AskWorkbench } from "./AskWorkbench";
import { useAskSession } from "./useAskSession";
import { useAskSSE } from "./useAskSSE";

export function AskPage() {
  const {
    sessionId,
    session,
    isLoadingSession,
    isSending,
    isTurnActive,
    errorMessage,
    onSend,
    onResetSession,
  } = useAskSession();

  // Wire SSE subscription for real-time streaming + permission requests
  useAskSSE(sessionId, isTurnActive);

  // First-mount state: session creation in flight. Show a centered
  // spinner so the page transition animation has something to land
  // on instead of a blank main pane.
  if (isLoadingSession && !session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Resolving your Ask session…</span>
        </div>
      </div>
    );
  }

  // Hard failure: session could not be created AND there's no
  // stale snapshot to fall back to. Show the error with a retry
  // button. This is where users will land when `desktop-server`
  // isn't running or the Codex pool is empty.
  if (errorMessage && !session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="max-w-md rounded-lg border px-6 py-5 text-center"
          style={{
            borderColor:
              "color-mix(in srgb, var(--color-error) 30%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--color-error) 4%, transparent)",
          }}
        >
          <AlertTriangle
            className="mx-auto mb-2 size-6"
            style={{ color: "var(--color-error)" }}
          />
          <div
            className="mb-1 text-body font-semibold"
            style={{ color: "var(--color-error)" }}
          >
            Could not start an Ask session
          </div>
          <div className="mb-4 text-caption text-muted-foreground">
            {errorMessage}
          </div>
          <button
            type="button"
            onClick={onResetSession}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Happy path: mount the workbench. AskWorkbench handles its own
  // "no messages yet" welcome screen (with the sample-data demo
  // toggle), so we do NOT need a separate placeholder here.
  return (
    <AskWorkbench
      session={session}
      isLoadingSession={isLoadingSession}
      isSending={isSending}
      errorMessage={errorMessage}
      onSend={onSend}
      onCreateSession={onResetSession}
      // modelLabel / environmentLabel fall through to the workbench
      // defaults (`Codex GPT-5.4` / `via internal broker`), which is
      // the right narrative for S3 even though the real route still
      // goes through the legacy env-var auth chain until ask_runtime
      // lands.
    />
  );
}
