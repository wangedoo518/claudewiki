/**
 * Ask session lifecycle hook (S0.3 extraction, S0.4 self-contained).
 *
 * History: extracted from features/session-workbench/useSessionLifecycle.ts.
 * S0.4 inlines the React Query keys (formerly imported from
 * `features/{workbench,session-workbench}/api/query`, both deleted on
 * the cut day). The askKeys / workbenchKeys constants live here now so
 * this hook has zero external deps on the killed feature trees.
 *
 * Wraps Tauri API calls with React Query mutations and provides error
 * handling + query cache invalidation.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelSession,
  deleteSession,
  renameSession,
  resumeSession,
  type DesktopSessionDetail,
} from "@/lib/tauri";

/**
 * React Query keys for the Ask page session cache. Inlined here during
 * S0.4 — the original `sessionWorkbenchKeys` lived in the deleted
 * session-workbench/api/query module. Keep the same key shape so any
 * cache entries written by the legacy hook (during the dual-track
 * period) still resolve.
 */
const askKeys = {
  all: ["desktop-session"] as const,
  detail: (sessionId: string | null | undefined) =>
    ["desktop-session", sessionId ?? "missing"] as const,
};

/**
 * React Query root key for workbench-level invalidation. Same value as
 * the deleted `workbenchRootKey` so existing cache entries from
 * neighbouring hooks (e.g. `useSession`) stay coherent.
 */
const workbenchRootKey = ["desktop-workbench"] as const;

interface UseAskLifecycleOptions {
  activeSessionId?: string | null;
  onSessionDeleted?: (sessionId: string) => void;
  onSessionCancelled?: (session: DesktopSessionDetail) => void;
}

export function useAskLifecycle({
  activeSessionId,
  onSessionDeleted,
  onSessionCancelled,
}: UseAskLifecycleOptions = {}) {
  const queryClient = useQueryClient();

  // Cancel (stop) a running session
  const cancelMutation = useMutation({
    mutationFn: (sessionId: string) => cancelSession(sessionId),
    onSuccess: (session) => {
      queryClient.setQueryData(askKeys.detail(session.id), session);
      void queryClient.invalidateQueries({ queryKey: workbenchRootKey });
      onSessionCancelled?.(session);
    },
  });

  // Delete a session
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: (_result, sessionId) => {
      queryClient.removeQueries({
        queryKey: askKeys.detail(sessionId),
      });
      void queryClient.invalidateQueries({ queryKey: workbenchRootKey });
      onSessionDeleted?.(sessionId);
    },
  });

  // Rename a session
  const renameMutation = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      renameSession(sessionId, title),
    onSuccess: (session) => {
      queryClient.setQueryData(askKeys.detail(session.id), session);
      void queryClient.invalidateQueries({ queryKey: workbenchRootKey });
    },
  });

  // Resume a detached session
  const resumeMutation = useMutation({
    mutationFn: (sessionId: string) => resumeSession(sessionId),
    onSuccess: (session) => {
      queryClient.setQueryData(askKeys.detail(session.id), session);
      void queryClient.invalidateQueries({ queryKey: workbenchRootKey });
    },
  });

  // Convenience wrappers that use activeSessionId
  const handleCancel = useCallback(() => {
    if (activeSessionId) {
      cancelMutation.mutate(activeSessionId);
    }
  }, [activeSessionId, cancelMutation]);

  const handleDelete = useCallback(
    (sessionId?: string) => {
      const id = sessionId ?? activeSessionId;
      if (id) {
        deleteMutation.mutate(id);
      }
    },
    [activeSessionId, deleteMutation]
  );

  const handleRename = useCallback(
    (title: string, sessionId?: string) => {
      const id = sessionId ?? activeSessionId;
      if (id) {
        renameMutation.mutate({ sessionId: id, title });
      }
    },
    [activeSessionId, renameMutation]
  );

  const handleResume = useCallback(
    (sessionId?: string) => {
      const id = sessionId ?? activeSessionId;
      if (id) {
        resumeMutation.mutate(id);
      }
    },
    [activeSessionId, resumeMutation]
  );

  return {
    // Mutations
    cancelMutation,
    deleteMutation,
    renameMutation,
    resumeMutation,

    // Convenience handlers
    handleCancel,
    handleDelete,
    handleRename,
    handleResume,

    // Loading states
    isCancelling: cancelMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isRenaming: renameMutation.isPending,
    isResuming: resumeMutation.isPending,

    // Error states
    cancelError: cancelMutation.error,
    deleteError: deleteMutation.error,
    renameError: renameMutation.error,
    resumeError: resumeMutation.error,
  };
}
