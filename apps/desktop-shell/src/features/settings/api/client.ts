import { fetchJson } from "@/lib/desktop/transport";
import type {
  DesktopCodexAuthOverviewResponse,
  DesktopCodexLoginSessionResponse,
  DesktopCodexRuntimeResponse,
  DesktopCustomizeResponse,
  DesktopManagedAuthAccountsResponse,
  DesktopManagedAuthLoginSessionResponse,
  DesktopManagedAuthProvidersResponse,
  DesktopSettingsResponse,
} from "@/lib/tauri";

export async function getCustomize(): Promise<DesktopCustomizeResponse> {
  return fetchJson<DesktopCustomizeResponse>("/api/desktop/customize");
}

export async function getSettings(): Promise<DesktopSettingsResponse> {
  return fetchJson<DesktopSettingsResponse>("/api/desktop/settings");
}

export async function getManagedAuthProviders(): Promise<DesktopManagedAuthProvidersResponse> {
  return fetchJson<DesktopManagedAuthProvidersResponse>("/api/desktop/auth/providers");
}

export async function getManagedAuthAccounts(
  providerId: string
): Promise<DesktopManagedAuthAccountsResponse> {
  return fetchJson<DesktopManagedAuthAccountsResponse>(
    `/api/desktop/auth/providers/${providerId}/accounts`
  );
}

export async function importManagedAuthAccounts(
  providerId: string
): Promise<DesktopManagedAuthAccountsResponse> {
  return fetchJson<DesktopManagedAuthAccountsResponse>(
    `/api/desktop/auth/providers/${providerId}/import`,
    {
      method: "POST",
    }
  );
}

export async function beginManagedAuthLogin(
  providerId: string
): Promise<DesktopManagedAuthLoginSessionResponse> {
  return fetchJson<DesktopManagedAuthLoginSessionResponse>(
    `/api/desktop/auth/providers/${providerId}/login`,
    {
      method: "POST",
    }
  );
}

export async function pollManagedAuthLogin(
  providerId: string,
  sessionId: string
): Promise<DesktopManagedAuthLoginSessionResponse> {
  return fetchJson<DesktopManagedAuthLoginSessionResponse>(
    `/api/desktop/auth/providers/${providerId}/login/${sessionId}`
  );
}

export async function setManagedAuthDefaultAccount(
  providerId: string,
  accountId: string
): Promise<DesktopManagedAuthAccountsResponse> {
  return fetchJson<DesktopManagedAuthAccountsResponse>(
    `/api/desktop/auth/providers/${providerId}/accounts/${accountId}/default`,
    {
      method: "POST",
    }
  );
}

export async function refreshManagedAuthAccount(
  providerId: string,
  accountId: string
): Promise<DesktopManagedAuthAccountsResponse> {
  return fetchJson<DesktopManagedAuthAccountsResponse>(
    `/api/desktop/auth/providers/${providerId}/accounts/${accountId}/refresh`,
    {
      method: "POST",
    }
  );
}

export async function removeManagedAuthAccount(
  providerId: string,
  accountId: string
): Promise<DesktopManagedAuthAccountsResponse> {
  return fetchJson<DesktopManagedAuthAccountsResponse>(
    `/api/desktop/auth/providers/${providerId}/accounts/${accountId}`,
    {
      method: "DELETE",
    }
  );
}

export async function getCodexRuntime(): Promise<DesktopCodexRuntimeResponse> {
  return fetchJson<DesktopCodexRuntimeResponse>("/api/desktop/codex/runtime");
}

export async function getCodexAuthOverview(): Promise<DesktopCodexAuthOverviewResponse> {
  return fetchJson<DesktopCodexAuthOverviewResponse>("/api/desktop/codex/auth");
}

export async function importCodexAuthProfile(): Promise<DesktopCodexAuthOverviewResponse> {
  return fetchJson<DesktopCodexAuthOverviewResponse>("/api/desktop/codex/auth/import", {
    method: "POST",
  });
}

export async function activateCodexAuthProfile(
  profileId: string
): Promise<DesktopCodexAuthOverviewResponse> {
  return fetchJson<DesktopCodexAuthOverviewResponse>(
    `/api/desktop/codex/auth/profiles/${profileId}/activate`,
    {
      method: "POST",
    }
  );
}

export async function refreshCodexAuthProfile(
  profileId: string
): Promise<DesktopCodexAuthOverviewResponse> {
  return fetchJson<DesktopCodexAuthOverviewResponse>(
    `/api/desktop/codex/auth/profiles/${profileId}/refresh`,
    {
      method: "POST",
    }
  );
}

export async function removeCodexAuthProfile(
  profileId: string
): Promise<DesktopCodexAuthOverviewResponse> {
  return fetchJson<DesktopCodexAuthOverviewResponse>(
    `/api/desktop/codex/auth/profiles/${profileId}`,
    {
      method: "DELETE",
    }
  );
}

export async function beginCodexLogin(): Promise<DesktopCodexLoginSessionResponse> {
  return fetchJson<DesktopCodexLoginSessionResponse>("/api/desktop/codex/auth/login", {
    method: "POST",
  });
}

export async function pollCodexLogin(
  sessionId: string
): Promise<DesktopCodexLoginSessionResponse> {
  return fetchJson<DesktopCodexLoginSessionResponse>(
    `/api/desktop/codex/auth/login/${sessionId}`
  );
}

// ── Phase 3: Multi-provider registry ──────────────────────────────
//
// These calls manage `.claw/providers.json` via the desktop-server
// HTTP API. The backend supports Anthropic + any OpenAI-compatible
// endpoint (DeepSeek, Qwen/DashScope, Moonshot/Kimi, Zhipu/GLM,
// xAI, OpenAI itself). API keys are redacted in list responses and
// only the first-4 / last-4 chars + length are shown to the UI.

/** Wire protocol for a provider entry. Matches `ProviderKind` in the Rust backend. */
export type ProviderKind = "anthropic" | "openai_compat";

/** Redacted provider record returned by list/upsert endpoints. The
 *  raw `api_key` is never sent back to the frontend. */
export interface DesktopProviderSummary {
  id: string;
  kind: ProviderKind;
  display_name: string | null;
  base_url: string;
  /** Format: `"sk-d...cdef (34 chars)"` or `"***"` for short keys. */
  api_key_display: string;
  api_key_length: number;
  model: string;
  max_tokens: number;
}

export interface DesktopProvidersListResponse {
  version: number;
  active: string;
  providers: DesktopProviderSummary[];
}

/** Payload sent to POST /api/desktop/providers. `entry.api_key` is
 *  the raw key; the server stores it verbatim into `.claw/providers.json`
 *  (Phase 3.6 will add AES-256-GCM at-rest encryption). */
export interface UpsertProviderRequest {
  id: string;
  project_path?: string;
  entry: {
    kind: ProviderKind;
    display_name?: string;
    base_url?: string;
    api_key: string;
    model: string;
    max_tokens?: number;
  };
}

export interface UpsertProviderResponse {
  ok: boolean;
  id: string;
  active: string;
  entry: DesktopProviderSummary;
}

/** Built-in provider template returned by GET /api/desktop/providers/templates */
export interface DesktopProviderTemplate {
  id: string;
  display_name: string;
  kind: ProviderKind;
  base_url: string;
  default_model: string;
  max_tokens: number;
  description: string;
  api_key_url: string;
}

export interface DesktopProviderTemplatesResponse {
  templates: DesktopProviderTemplate[];
}

export async function listProviders(
  projectPath?: string
): Promise<DesktopProvidersListResponse> {
  const query = projectPath
    ? `?project_path=${encodeURIComponent(projectPath)}`
    : "";
  return fetchJson<DesktopProvidersListResponse>(
    `/api/desktop/providers${query}`
  );
}

export async function listProviderTemplates(): Promise<DesktopProviderTemplatesResponse> {
  return fetchJson<DesktopProviderTemplatesResponse>(
    "/api/desktop/providers/templates"
  );
}

export async function upsertProvider(
  request: UpsertProviderRequest
): Promise<UpsertProviderResponse> {
  return fetchJson<UpsertProviderResponse>("/api/desktop/providers", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function deleteProvider(
  id: string,
  projectPath?: string
): Promise<{ deleted: boolean; id: string; active: string }> {
  const query = projectPath
    ? `?project_path=${encodeURIComponent(projectPath)}`
    : "";
  return fetchJson<{ deleted: boolean; id: string; active: string }>(
    `/api/desktop/providers/${encodeURIComponent(id)}${query}`,
    { method: "DELETE" }
  );
}

export async function activateProvider(
  id: string,
  projectPath?: string
): Promise<{ ok: boolean; active: string }> {
  const query = projectPath
    ? `?project_path=${encodeURIComponent(projectPath)}`
    : "";
  return fetchJson<{ ok: boolean; active: string }>(
    `/api/desktop/providers/${encodeURIComponent(id)}/activate${query}`,
    { method: "POST" }
  );
}
