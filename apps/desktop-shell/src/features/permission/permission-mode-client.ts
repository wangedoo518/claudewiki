// S0.4 extraction: permission-mode HTTP client.
//
// History: these two functions used to live in
// `features/session-workbench/api/client.ts`, which gets deleted on the
// cut day. They are dynamically imported by `state/settings-store.ts`
// to round-trip the user's permission-mode pick to the project's
// `.claw/settings.json`. Hosting them under `features/permission/`
// keeps them next to the rest of the permission UI surface.

import { fetchJson } from "@/lib/desktop/transport";

/** Write the permission mode to the project's `.claw/settings.json`. */
export async function writePermissionModeToDisk(
  projectPath: string,
  mode: "default" | "acceptEdits" | "bypassPermissions" | "plan",
): Promise<{ ok: boolean; mode: string }> {
  return fetchJson<{ ok: boolean; mode: string }>(
    `/api/desktop/settings/permission-mode`,
    {
      method: "POST",
      body: JSON.stringify({ project_path: projectPath, mode }),
    },
  );
}

/** Read the current permission mode from the project's `.claw/settings.json`. */
export async function readPermissionModeFromDisk(
  projectPath: string,
): Promise<{ mode: string }> {
  const params = new URLSearchParams({ project_path: projectPath });
  return fetchJson<{ mode: string }>(
    `/api/desktop/settings/permission-mode?${params.toString()}`,
    { method: "GET" },
  );
}
