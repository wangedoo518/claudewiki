// S0.4 ask client — minimal session-lifecycle HTTP wrappers.
//
// History: this file was extracted from
// `features/session-workbench/api/client.ts` on cut day. Only the
// functions that have at least one live consumer in the post-cut tree
// are kept here:
//   - session lifecycle (get/create/cancel/delete/rename/resume/append)
//   - forwardPermissionDecision  (AskWorkbench permission flow)
//
// Dropped on cut day because they no longer have any consumer:
//   - listWorkspaceSkills / WorkspaceSkill   (WorkspaceSkillsPanel deleted)
//   - forkSession / setSessionFlagged        (Inbox flow deferred to S4)
//   - setSessionLifecycleStatus              (Inbox flow deferred to S4)
//   - subscribeToSessionEvents               (S3 will rewire via ask_runtime)
//   - compactSession                         (slash commands cut)
//   - writePermissionModeToDisk              (moved to features/permission/permission-mode-client.ts)
//   - readPermissionModeFromDisk             (same)
//
// S3 will replace these wrappers with the typed `ask_runtime` client
// once that crate lands.

import { fetchJson } from "@/lib/desktop/transport";
import type {
  AppendDesktopMessageResponse,
  CreateDesktopSessionResponse,
  DesktopSessionDetail,
} from "@/lib/tauri";

export async function getSession(
  sessionId: string,
): Promise<DesktopSessionDetail> {
  return fetchJson<DesktopSessionDetail>(`/api/desktop/sessions/${sessionId}`);
}

export async function createSession(payload: {
  title?: string;
  project_name?: string;
  project_path?: string;
}): Promise<CreateDesktopSessionResponse> {
  return fetchJson<CreateDesktopSessionResponse>("/api/desktop/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function appendMessage(
  sessionId: string,
  message: string,
): Promise<AppendDesktopMessageResponse> {
  return fetchJson<AppendDesktopMessageResponse>(
    `/api/desktop/sessions/${sessionId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  );
}

export async function cancelSession(
  sessionId: string,
): Promise<DesktopSessionDetail> {
  return fetchJson<DesktopSessionDetail>(
    `/api/desktop/sessions/${sessionId}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function deleteSession(
  sessionId: string,
): Promise<{ deleted: boolean }> {
  return fetchJson<{ deleted: boolean }>(
    `/api/desktop/sessions/${sessionId}`,
    { method: "DELETE" },
  );
}

export async function renameSession(
  sessionId: string,
  title: string,
): Promise<DesktopSessionDetail> {
  return fetchJson<DesktopSessionDetail>(
    `/api/desktop/sessions/${sessionId}/title`,
    { method: "POST", body: JSON.stringify({ title }) },
  );
}

export async function resumeSession(
  sessionId: string,
): Promise<DesktopSessionDetail> {
  return fetchJson<DesktopSessionDetail>(
    `/api/desktop/sessions/${sessionId}/resume`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function forwardPermissionDecision(
  sessionId: string,
  payload: {
    requestId: string;
    decision: string;
  },
): Promise<{ forwarded: boolean }> {
  return fetchJson<{ forwarded: boolean }>(
    `/api/desktop/sessions/${sessionId}/permission`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
