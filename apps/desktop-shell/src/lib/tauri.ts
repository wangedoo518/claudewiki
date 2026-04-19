import { invoke } from "@tauri-apps/api/core";
export { getDesktopApiBase } from "@/lib/desktop/bootstrap";
// S0.4 cut day: workbench / session-workbench / code-tools api clients
// were deleted along with their feature dirs. The post-cut session
// lifecycle ops live under features/ask/api/client.ts now.
export * from "@/features/ask/api/client";
export * from "@/features/settings/api/client";

export type DesktopTabKind =
  | "home"
  | "search"
  | "scheduled"
  | "dispatch"
  | "customize"
  | "open_claw"
  | "settings"
  | "code_session";

export interface DesktopTopTab {
  id: string;
  label: string;
  kind: DesktopTabKind;
  closable: boolean;
}

export interface DesktopLaunchpadItem {
  id: string;
  label: string;
  description: string;
  accent: string;
  tab_id: string;
}

export interface DesktopSettingsGroup {
  id: string;
  label: string;
  description: string;
}

export interface DesktopBootstrap {
  product_name: string;
  code_label: string;
  top_tabs: DesktopTopTab[];
  launchpad_items: DesktopLaunchpadItem[];
  settings_groups: DesktopSettingsGroup[];
  private_cloud_enabled?: boolean;
}

export interface DesktopSidebarAction {
  id: string;
  label: string;
  icon: string;
  target_tab_id: string;
  kind: DesktopTabKind;
}

/**
 * Lifecycle status — orthogonal to turn_state. Backed by
 * `DesktopLifecycleStatus` in Rust desktop-core.
 */
export type DesktopLifecycleStatus =
  | "todo"
  | "in_progress"
  | "needs_review"
  | "done"
  | "archived";

export interface DesktopSessionSummary {
  id: string;
  title: string;
  preview: string;
  bucket: "today" | "yesterday" | "older";
  created_at: number;
  updated_at: number;
  project_name: string;
  project_path: string;
  environment_label: string;
  model_label: string;
  turn_state: "idle" | "running";
  /** Inbox workflow state. Defaults to "todo" for new sessions. */
  lifecycle_status?: DesktopLifecycleStatus;
  /** True if user flagged this session for attention. */
  flagged?: boolean;
}

export interface DesktopSessionSection {
  id: string;
  label: string;
  sessions: DesktopSessionSummary[];
}

export interface DesktopComposerState {
  permission_mode_label: string;
  environment_label: string;
  model_label: string;
  send_label: string;
}

export interface DesktopWorkbench {
  primary_actions: DesktopSidebarAction[];
  secondary_actions: DesktopSidebarAction[];
  project_label: string;
  project_name: string;
  session_sections: DesktopSessionSection[];
  active_session_id: string | null;
  update_banner: {
    version: string;
    cta_label: string;
    body: string;
  };
  account: {
    name: string;
    plan_label: string;
    shortcut_label: string;
  };
  composer: DesktopComposerState;
}

export interface ContentBlockText {
  type: "text";
  text: string;
}

export interface ContentBlockToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: string;
}

export interface ContentBlockToolResult {
  type: "tool_result";
  tool_use_id: string;
  tool_name: string;
  output: string;
  is_error: boolean;
}

export type ContentBlock =
  | ContentBlockText
  | ContentBlockToolUse
  | ContentBlockToolResult;

export interface TokenUsageData {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface RuntimeConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  blocks: ContentBlock[];
  usage?: TokenUsageData;
  /**
   * A1 sprint — context-basis side-channel. Populated by the backend on
   * assistant messages so the UI can surface "what context did the
   * model actually see for this turn?" via `<ContextBasisLabel>`.
   * Absent/null for legacy sessions and for non-assistant roles.
   *
   * Wire format matches `ContextBasis` in `desktop-core::ask_context`
   * (Worker A). See ContextBasis interface below.
   */
  context_basis?: ContextBasis | null;
}

/**
 * Response-context mode — decided per-turn either client-side
 * (auto-detect via `classifyContextMode`) or by the user's explicit
 * override. Mirrors the Rust enum `ContextMode` in
 * `desktop-core::ask_context` (Worker A's contract).
 *
 *   - `follow_up`    — continue the dialogue using prior turns only.
 *   - `source_first` — treat the selected source (URL / raw entry) as
 *                      primary; history is secondary.
 *   - `combine`      — splice prior turns + the selected source into
 *                      a single context.
 */
export type ContextMode = "follow_up" | "source_first" | "combine";

/**
 * Per-turn explanation of what the backend actually fed to the model.
 * Wire format (snake_case) is the serialization of Worker A's
 * `ContextBasis` struct. Attached to assistant messages via
 * `RuntimeConversationMessage.context_basis` and also broadcast on
 * `DesktopSessionEvent::Message`.
 */
export interface ContextBasis {
  /** Which mode the backend resolved for this turn. */
  mode: ContextMode;
  /** How many prior conversation turns were included in the prompt. */
  history_turns_included: number;
  /** Whether a source (URL / raw entry) was injected as context. */
  source_included: boolean;
  /**
   * Approximate token count the backend estimated for the source
   * payload. Absent when `source_included=false` or when the backend
   * did not attempt a token estimate.
   */
  source_token_hint?: number;
  /**
   * True when a hard boundary marker was injected to prevent the
   * model from blending source content with conversational history
   * (e.g. explicit "---" separator + instruction reset).
   */
  boundary_marker: boolean;
  /**
   * A2 sprint — the concrete source the backend injected for this
   * turn, when one was chosen. Populated only when
   * `source_included === true` AND the backend resolved a discrete
   * source ref (typed raw/wiki/inbox). Absent / null on legacy
   * sessions and for turns where `source_included` is derived from a
   * raw URL rather than a bound ref.
   */
  bound_source?: SourceRef | null;
  /**
   * A3 sprint — true when `bound_source` was auto-derived from a
   * fresh URL enrich this turn (not from a persistent session
   * binding). Auto-bound sources don't write SessionMetadata and
   * expire naturally on next turn if no new URL arrives. When
   * absent or false, a present `bound_source` means the A2 session
   * binding is active.
   */
  auto_bound?: boolean;
  /**
   * A4 sprint — true when the system prompt included the "Grounded
   * Mode" instruction block (quote anchoring + conservative
   * behavior + 依据片段 section). Mirrors `bound_source` presence
   * under the A2/A3 paths. UI renders a "✓ Grounded" badge when true.
   */
  grounding_applied?: boolean;
}

/* ──────────────────────────────────────────────────────────────────
 * A2 sprint — Session source binding
 *
 * A persistent, session-scoped binding to a specific source
 * (raw entry / wiki page / inbox task). When a binding is present,
 * the backend's Ask pipeline treats that source as the authoritative
 * context for every turn in the session until the binding is cleared.
 *
 * Wire format mirrors Worker A's Rust `SourceRef` enum with
 * `#[serde(tag = "kind", rename_all = "snake_case")]`:
 *   - { kind: "raw",   id: number,   title: string }
 *   - { kind: "wiki",  slug: string, title: string }
 *   - { kind: "inbox", id: number,   title: string }
 *
 * The parent `SessionSourceBinding` carries the ref plus provenance
 * (`bound_at` epoch-ms, optional `binding_reason` free text for
 * debugging / audit trails).
 * ────────────────────────────────────────────────────────────────── */

export type SourceRefKind = "raw" | "wiki" | "inbox";

export type SourceRef =
  | { kind: "raw"; id: number; title: string }
  | { kind: "wiki"; slug: string; title: string }
  | { kind: "inbox"; id: number; title: string };

export interface SessionSourceBinding {
  source: SourceRef;
  /** Epoch-ms when the binding was established. */
  bound_at: number;
  /** Optional free-text describing why the binding was made. */
  binding_reason?: string;
}

/**
 * Stable, human-readable display label for a SourceRef.
 * Examples:
 *   - raw   → "raw #00123 · Example Domain"
 *   - wiki  → "wiki:foo-slug · Title"
 *   - inbox → "inbox #42 · Title"
 */
export function formatSourceRefLabel(source: SourceRef): string {
  switch (source.kind) {
    case "raw":
      return `raw #${String(source.id).padStart(5, "0")} · ${source.title}`;
    case "wiki":
      return `wiki:${source.slug} · ${source.title}`;
    case "inbox":
      return `inbox #${String(source.id).padStart(5, "0")} · ${source.title}`;
  }
}

/**
 * Stable, unique key for a SourceRef — safe for React `key={}` and
 * for equality checks. Format: `"<kind>:<id-or-slug>"`.
 */
export function sourceRefKey(source: SourceRef): string {
  switch (source.kind) {
    case "raw":
      return `raw:${source.id}`;
    case "wiki":
      return `wiki:${source.slug}`;
    case "inbox":
      return `inbox:${source.id}`;
  }
}

export interface RuntimeSession {
  version: number;
  messages: RuntimeConversationMessage[];
}

/**
 * URL enrichment status for the current turn. `null` (or absent) when
 * the message had no URL worth enriching; `success` when a raw was
 * ingested; the error variants describe why the fetch/validate didn't
 * produce a useful raw.
 *
 * Wire format is `#[serde(rename_all = "snake_case", tag = "kind")]`
 * on the Rust side — i.e. `{ kind: "success", title: "...", raw_id: 42 }`.
 *
 * M3 adds `reused` to cover the case where the URL-ingest dedupe layer
 * recognised a prior raw for the same canonical URL and handed the
 * existing entry back rather than re-fetching. The payload carries the
 * reused `raw_id` plus a short `reason` string (e.g. "reused existing
 * raw (pending inbox)") that the UI can surface verbatim if useful.
 *
 * The optional `none` kind below is a defensive fallback for
 * environments where the backend may emit an explicit "no enrichment"
 * marker instead of `null`.
 */
export type EnrichStatus =
  | { kind: "none" }
  | { kind: "success"; title: string; raw_id: number }
  | { kind: "reused"; title: string; raw_id: number; reason: string }
  | { kind: "rejected_quality"; reason: string }
  | { kind: "fetch_failed"; reason: string }
  | { kind: "prerequisite_missing"; dep: string; hint: string };

export interface DesktopSessionDetail {
  id: string;
  title: string;
  preview: string;
  created_at: number;
  updated_at: number;
  project_name: string;
  project_path: string;
  environment_label: string;
  model_label: string;
  turn_state: "idle" | "running";
  /** Inbox workflow state. Defaults to "todo" for new sessions. */
  lifecycle_status?: DesktopLifecycleStatus;
  /** True if user flagged this session for attention. */
  flagged?: boolean;
  session: RuntimeSession;
  /**
   * Per-turn URL enrichment side-channel. Populated by
   * `DesktopState::append_user_message` on the Rust side when the
   * outgoing user message contains a URL; `null` / absent otherwise.
   * See `EnrichStatus` for the variant shapes.
   */
  enrich_status?: EnrichStatus | null;
  /**
   * A1 sprint — per-turn context-basis side-channel. Populated by
   * `DesktopState::append_user_message` on the snapshot that fires
   * right after a new user turn is appended; `None` on subsequent
   * snapshots (including reloads / background refetches). Frontend
   * falls back to this when `RuntimeConversationMessage.context_basis`
   * isn't populated (current backend contract).
   *
   * See `ContextBasis` for the shape.
   */
  context_basis?: ContextBasis | null;
  /**
   * A2 sprint — persistent session-scoped source binding. When
   * non-null, the backend injects this source into every turn's
   * context until the binding is cleared. Populated by
   * `POST /api/desktop/sessions/{id}/bind`; cleared by
   * `DELETE /api/desktop/sessions/{id}/bind`. Absent on legacy
   * sessions and on sessions that have never been bound.
   */
  source_binding?: SessionSourceBinding | null;
}

export interface DesktopProviderSetting {
  id: string;
  label: string;
  base_url: string;
  auth_status: string;
}

export interface DesktopProviderModel {
  model_id: string;
  display_name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  billing_kind: string | null;
  capability_tags: string[];
}

export interface DesktopCodexRuntimeState {
  config_dir: string;
  auth_path: string;
  config_path: string;
  active_provider_key: string | null;
  model: string | null;
  base_url: string | null;
  provider_count: number;
  has_api_key: boolean;
  has_chatgpt_tokens: boolean;
  auth_mode: string | null;
  auth_profile_label: string | null;
  auth_plan_type: string | null;
  live_providers: DesktopCodexLiveProvider[];
  health_warnings: string[];
}

export interface DesktopCodexLiveProvider {
  id: string;
  name: string | null;
  base_url: string | null;
  wire_api: string | null;
  requires_openai_auth: boolean;
  model: string | null;
  is_active: boolean;
}

export type DesktopCodexAuthSource = "imported_auth_json" | "browser_login";

export interface DesktopCodexProfileSummary {
  id: string;
  email: string;
  display_label: string;
  chatgpt_account_id: string | null;
  chatgpt_user_id: string | null;
  chatgpt_plan_type: string | null;
  auth_source: DesktopCodexAuthSource;
  active: boolean;
  applied_to_codex: boolean;
  last_refresh_epoch: number | null;
  access_token_expires_at_epoch: number | null;
  updated_at_epoch: number;
}

export interface DesktopCodexInstallationRecord {
  target_id: string;
  target_label: string;
  installed: boolean;
  path: string | null;
  auth_path: string;
}

export interface DesktopCodexAuthOverview {
  profiles: DesktopCodexProfileSummary[];
  installations: DesktopCodexInstallationRecord[];
  active_profile_id: string | null;
  auth_path: string;
  auth_mode: string | null;
  has_chatgpt_tokens: boolean;
  updated_at_epoch: number;
}

export type DesktopCodexLoginSessionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export interface DesktopCodexLoginSessionSnapshot {
  session_id: string;
  status: DesktopCodexLoginSessionStatus;
  authorize_url: string;
  redirect_uri: string;
  error: string | null;
  profile: DesktopCodexProfileSummary | null;
  created_at_epoch: number;
  updated_at_epoch: number;
}

export type DesktopManagedAuthProviderKind = "codex_openai" | "qwen_code";

export type DesktopManagedAuthSource =
  | "imported_auth_json"
  | "browser_login"
  | "device_code";

export type DesktopManagedAuthAccountStatus =
  | "ready"
  | "expiring"
  | "expired"
  | "needs_reauth";

export type DesktopManagedAuthLoginSessionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export interface DesktopManagedAuthRuntimeBinding {
  runtime_name: string;
  auth_path: string | null;
  config_path: string | null;
  synced: boolean;
  synced_account_id: string | null;
}

export interface DesktopManagedAuthProvider {
  id: string;
  name: string;
  kind: DesktopManagedAuthProviderKind;
  website_url: string | null;
  description: string | null;
  models: DesktopProviderModel[];
  default_model_id: string | null;
  account_count: number;
  default_account_id: string | null;
  default_account_label: string | null;
  runtime: DesktopManagedAuthRuntimeBinding;
}

export interface DesktopManagedAuthAccount {
  id: string;
  provider_id: string;
  email: string | null;
  subject: string | null;
  display_label: string;
  plan_label: string | null;
  auth_source: DesktopManagedAuthSource;
  status: DesktopManagedAuthAccountStatus;
  is_default: boolean;
  applied_to_runtime: boolean;
  created_at_epoch: number;
  updated_at_epoch: number;
  last_refresh_epoch: number | null;
  access_token_expires_at_epoch: number | null;
  resource_url: string | null;
}

export interface DesktopManagedAuthLoginSessionSnapshot {
  session_id: string;
  provider_id: string;
  status: DesktopManagedAuthLoginSessionStatus;
  authorize_url: string | null;
  verification_uri: string | null;
  verification_uri_complete: string | null;
  user_code: string | null;
  redirect_uri: string | null;
  error: string | null;
  account: DesktopManagedAuthAccount | null;
  created_at_epoch: number;
  updated_at_epoch: number;
}

export interface CodeToolsTerminalConfig {
  id: string;
  name: string;
  customPath?: string | null;
}

export interface CodeToolSelectedModelPayload {
  providerId: string;
  providerName: string;
  providerType: string;
  baseUrl: string;
  protocol: string;
  modelId: string;
  displayName: string;
  hasStoredCredential: boolean;
}

export interface RunCodeToolPayload {
  cliTool: string;
  directory: string;
  terminal: string;
  autoUpdateToLatest: boolean;
  environmentVariables: Record<string, string>;
  selectedModel: CodeToolSelectedModelPayload | null;
}

export interface CodeToolRunResult {
  success: boolean;
  message: string | null;
}

export interface DesktopStorageLocation {
  label: string;
  path: string;
  description: string;
}

export interface DesktopSettingsState {
  project_path: string;
  config_home: string;
  desktop_session_store_path: string;
  oauth_credentials_path: string | null;
  providers: DesktopProviderSetting[];
  storage_locations: DesktopStorageLocation[];
  warnings: string[];
}

export interface DesktopCustomizeSummary {
  loaded_config_count: number;
  mcp_server_count: number;
  plugin_count: number;
  enabled_plugin_count: number;
  plugin_tool_count: number;
  pre_tool_hook_count: number;
  post_tool_hook_count: number;
}

export interface DesktopConfigFile {
  source: string;
  path: string;
}

export interface DesktopHookConfigView {
  pre_tool_use: string[];
  post_tool_use: string[];
}

export interface DesktopMcpServer {
  name: string;
  scope: string;
  transport: string;
  target: string;
}

export interface DesktopPluginView {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: string;
  source: string;
  root_path: string | null;
  enabled: boolean;
  default_enabled: boolean;
  tool_count: number;
  pre_tool_hook_count: number;
  post_tool_hook_count: number;
}

export interface DesktopCustomizeState {
  project_path: string;
  model_id: string;
  model_label: string;
  permission_mode: string;
  summary: DesktopCustomizeSummary;
  loaded_configs: DesktopConfigFile[];
  hooks: DesktopHookConfigView;
  mcp_servers: DesktopMcpServer[];
  plugins: DesktopPluginView[];
  warnings: string[];
}

export interface CreateDesktopSessionResponse {
  session: DesktopSessionDetail;
}

export interface AppendDesktopMessageResponse {
  session: DesktopSessionDetail;
}

export interface DesktopCustomizeResponse {
  customize: DesktopCustomizeState;
}

export interface DesktopSettingsResponse {
  settings: DesktopSettingsState;
}

export interface DesktopManagedAuthProvidersResponse {
  providers: DesktopManagedAuthProvider[];
}

export interface DesktopManagedAuthAccountsResponse {
  provider: DesktopManagedAuthProvider;
  accounts: DesktopManagedAuthAccount[];
}

export interface DesktopManagedAuthLoginSessionResponse {
  session: DesktopManagedAuthLoginSessionSnapshot;
}

export interface DesktopCodexRuntimeResponse {
  runtime: DesktopCodexRuntimeState;
}

export interface DesktopCodexAuthOverviewResponse {
  overview: DesktopCodexAuthOverview;
}

export interface DesktopCodexLoginSessionResponse {
  session: DesktopCodexLoginSessionSnapshot;
}

export interface DesktopSearchHit {
  session_id: string;
  title: string;
  project_name: string;
  project_path: string;
  bucket: "today" | "yesterday" | "older";
  preview: string;
  snippet: string;
  updated_at: number;
}

export interface DesktopSessionsResponse {
  sessions: DesktopSessionSummary[];
}

export interface SearchDesktopSessionsResponse {
  results: DesktopSearchHit[];
}

export type DesktopWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DesktopScheduledTaskStatus = "idle" | "running";
export type DesktopScheduledRunStatus = "success" | "error";
export type DesktopScheduledTaskTargetKind = "new_session" | "existing_session";

export interface DesktopScheduledSummary {
  total_task_count: number;
  enabled_task_count: number;
  running_task_count: number;
  blocked_task_count: number;
  due_task_count: number;
}

export interface DesktopScheduledTaskTarget {
  kind: DesktopScheduledTaskTargetKind;
  session_id: string | null;
  label: string;
}

export type DesktopScheduledSchedule =
  | {
      kind: "hourly";
      interval_hours: number;
    }
  | {
      kind: "weekly";
      days: DesktopWeekday[];
      hour: number;
      minute: number;
    };

export interface DesktopScheduledTask {
  id: string;
  title: string;
  prompt: string;
  project_name: string;
  project_path: string;
  schedule: DesktopScheduledSchedule;
  schedule_label: string;
  target: DesktopScheduledTaskTarget;
  enabled: boolean;
  blocked_reason: string | null;
  status: DesktopScheduledTaskStatus;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
  last_run_status: DesktopScheduledRunStatus | null;
  last_outcome: string | null;
}

export interface DesktopScheduledState {
  project_path: string;
  summary: DesktopScheduledSummary;
  tasks: DesktopScheduledTask[];
  trusted_project_paths: string[];
  warnings: string[];
}

export interface DesktopScheduledResponse {
  scheduled: DesktopScheduledState;
}

export interface DesktopScheduledTaskResponse {
  task: DesktopScheduledTask;
}

export type DesktopDispatchSourceKind =
  | "local_inbox"
  | "remote_bridge"
  | "scheduled";
export type DesktopDispatchTargetKind = "new_session" | "existing_session";
export type DesktopDispatchPriority = "low" | "normal" | "high";
export type DesktopDispatchStatus =
  | "unread"
  | "read"
  | "delivering"
  | "delivered"
  | "archived"
  | "error";

export interface DesktopDispatchSummary {
  total_item_count: number;
  unread_item_count: number;
  pending_item_count: number;
  delivered_item_count: number;
  archived_item_count: number;
}

export interface DesktopDispatchSource {
  kind: DesktopDispatchSourceKind;
  label: string;
}

export interface DesktopDispatchTarget {
  kind: DesktopDispatchTargetKind;
  session_id: string | null;
  label: string;
}

export interface DesktopDispatchItem {
  id: string;
  title: string;
  body: string;
  project_name: string;
  project_path: string;
  source: DesktopDispatchSource;
  priority: DesktopDispatchPriority;
  target: DesktopDispatchTarget;
  status: DesktopDispatchStatus;
  created_at: number;
  updated_at: number;
  delivered_at: number | null;
  last_outcome: string | null;
}

export interface DesktopDispatchState {
  project_path: string;
  summary: DesktopDispatchSummary;
  items: DesktopDispatchItem[];
  warnings: string[];
}

export interface DesktopDispatchResponse {
  dispatch: DesktopDispatchState;
}

export interface DesktopDispatchItemResponse {
  item: DesktopDispatchItem;
}

export type DesktopSessionEvent =
  | {
      type: "snapshot";
      session: DesktopSessionDetail;
    }
  | {
      type: "message";
      session_id: string;
      message: RuntimeConversationMessage;
      /**
       * A1 sprint — context-basis side-channel on assistant messages.
       * Worker A broadcasts this alongside the runtime message so the
       * UI can render `<ContextBasisLabel>` without a polling round-trip.
       * Same payload as `RuntimeConversationMessage.context_basis`;
       * duplicated here so the top-level event carries an authoritative
       * value even if the embedded message was materialized before the
       * basis was known. Optional to stay backwards-compatible with
       * pre-A1 backends.
       */
      context_basis?: ContextBasis | null;
    }
  | {
      type: "text_delta";
      session_id: string;
      content: string;
    }
  | {
      type: "permission_request";
      session_id: string;
      request_id: string;
      tool_name: string;
      tool_input: string;
    };


// ---------------------------------------------------------------------------
// Agent pipeline commands (OpenClaw install / start / uninstall)
// ---------------------------------------------------------------------------

import type {
  AgentId,
  AgentPipelineAction,
  AgentPipelineStatus,
  OpenclawConnectStatus,
  OpenclawRuntimeSnapshot,
  SetupProductOverview,
  OpenclawServiceControlResult,
} from "@/types/agent";

/**
 * Start an agent pipeline action (install, start, or uninstall).
 * The backend spawns an async task and returns the initial status.
 * Frontend should poll `agentPipelineStatus` to track progress.
 */
export async function agentPipelineStart(
  agentId: AgentId,
  action: AgentPipelineAction
): Promise<AgentPipelineStatus> {
  return invoke<AgentPipelineStatus>("agent_pipeline_start", {
    agentId,
    action,
  });
}

/**
 * Get the current status of an agent pipeline action.
 * Returns running/finished/success flags, logs, and hints.
 */
export async function agentPipelineStatus(
  agentId: AgentId,
  action: AgentPipelineAction
): Promise<AgentPipelineStatus> {
  return invoke<AgentPipelineStatus>("agent_pipeline_status", {
    agentId,
    action,
  });
}

/**
 * Check OpenClaw installation and connection status.
 * Runs binary detection, version check, and health probe.
 */
export async function openclawConnectStatus(): Promise<OpenclawConnectStatus> {
  return invoke<OpenclawConnectStatus>("openclaw_connect_status");
}

/**
 * Get OpenClaw runtime snapshot (process info, memory, uptime).
 * Checks if the gateway process is running on port 18790.
 */
export async function openclawRuntimeSnapshot(): Promise<OpenclawRuntimeSnapshot> {
  return invoke<OpenclawRuntimeSnapshot>("openclaw_runtime_snapshot");
}

/**
 * Get OpenClaw setup product overview (installed, running, version).
 * Reads install state file + live status.
 */
export async function openclawSetupOverview(): Promise<SetupProductOverview> {
  return invoke<SetupProductOverview>("openclaw_setup_overview");
}

/**
 * Control the OpenClaw service (currently only "stop" is supported).
 * Kills the gateway process.
 */
export async function openclawServiceControl(
  action: "stop"
): Promise<OpenclawServiceControlResult> {
  return invoke<OpenclawServiceControlResult>("openclaw_service_control", {
    action,
  });
}

/**
 * Open a URL in the system's default browser.
 * Used to open the OpenClaw dashboard page.
 *
 * Falls back to `window.open` when running in a plain browser
 * (dev mode via `npm run dev`) where Tauri's IPC bridge is not
 * available. The Tauri `invoke` function exists (it's imported)
 * but throws when the Tauri runtime isn't present.
 */
export async function openDashboardUrl(url: string): Promise<void> {
  try {
    await invoke<void>("open_dashboard_url", { url });
  } catch {
    // Tauri IPC not available (browser dev mode) — fall back to
    // opening the URL in a new tab.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// ---------------------------------------------------------------------------
// OpenClaw simplified commands (cherry-studio compatible)
// ---------------------------------------------------------------------------

export interface OpenclawInstallCheck {
  installed: boolean;
  path: string | null;
  needsMigration: boolean;
}

export interface OpenclawGatewayStatusResult {
  status: "stopped" | "running";
  port: number;
}

/**
 * Check if OpenClaw binary is installed on the system.
 * Returns installed flag and binary path.
 */
export async function openclawCheckInstalled(): Promise<OpenclawInstallCheck> {
  return invoke<OpenclawInstallCheck>("openclaw_check_installed");
}

/**
 * Get the current gateway status (stopped/running) and port.
 */
export async function openclawGetStatus(): Promise<OpenclawGatewayStatusResult> {
  return invoke<OpenclawGatewayStatusResult>("openclaw_get_status");
}

/**
 * Get the OpenClaw dashboard URL for embedding as MinApp webview.
 */
export async function openclawGetDashboardUrl(): Promise<string> {
  return invoke<string>("openclaw_get_dashboard_url");
}

// ---------------------------------------------------------------------------
// Code tools commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// W1 Maintainer Workbench wrappers
// ---------------------------------------------------------------------------
//
// Thin re-exports over `features/ingest/persist.ts` so call sites in
// the Inbox Workbench can import everything from `@/lib/tauri`
// without depending on the ingest module structure. `fetchRawById` is
// an alias for the existing `getRawEntry` detail fetch, returning
// `{ entry, body }`. `maintainInboxEntry` talks to Worker B's
// `/api/wiki/inbox/{id}/maintain` contract.
import { fetchJson as _fetchJsonForMaintain } from "@/lib/desktop/transport";
import {
  getRawEntry as _getRawEntry,
  createProposal as _createProposal,
  applyProposal as _applyProposal,
  cancelProposal as _cancelProposal,
} from "@/features/ingest/persist";
import type {
  InboxEntry,
  MaintainAction,
  MaintainOutcome,
  MaintainRequest,
  MaintainResponse,
  RawDetailResponse,
  UpdateProposal,
} from "@/features/ingest/types";

// ── W1 Maintainer Workbench type mirrors (re-export + alias) ──────────
//
// Worker B's Rust contract names the wire types `InboxMaintainRequest`
// / `InboxMaintainResponse` to match the handler function names in
// `rust/crates/desktop-server/src/lib.rs`. The frontend types were
// landed earlier under the shorter `MaintainRequest` / `MaintainResponse`
// identifiers in `features/ingest/types.ts` — we alias both shapes
// here so any caller that imports from `@/lib/tauri` gets the full
// W1 vocabulary (MaintainAction, MaintainOutcome, InboxEntry +
// request/response envelopes under both names).
//
// The `InboxEntry` interface re-exported below already carries the
// four W1-optional fields the backend writes back after a maintain
// call (see `rust/crates/wiki_store/src/lib.rs` `InboxEntry` +
// `#[serde(default, skip_serializing_if = "Option::is_none")]`):
//   * `proposed_wiki_slug`
//   * `target_page_slug`
//   * `maintain_action`
//   * `rejection_reason`

export type { InboxEntry, MaintainAction, MaintainOutcome };
export type {
  MaintainRequest as InboxMaintainRequest,
  MaintainResponse as InboxMaintainResponse,
};
// Also re-export under the short names for callers that followed the
// original ingest/types.ts naming.
export type { MaintainRequest, MaintainResponse };
// W2 update_existing preview/apply surface — the `UpdateProposal`
// type + the three HTTP wrappers (create / apply / cancel) hang off
// the single @/lib/tauri import boundary so the Workbench doesn't
// need to know about the ingest module structure.
export type { UpdateProposal };

/**
 * Fetch a single raw entry by id, returning metadata + markdown body.
 * Alias of `getRawEntry` from `features/ingest/persist.ts` — exposed
 * here so the Workbench can pull it from a single import boundary.
 */
export async function fetchRawById(id: number): Promise<RawDetailResponse> {
  return _getRawEntry(id);
}

/**
 * `POST /api/wiki/inbox/{id}/maintain` — execute a maintainer action
 * (create_new / update_existing / reject) against an inbox task and
 * return the outcome envelope. Contract owned by Worker B.
 *
 * The caller is responsible for client-side validation (e.g.
 * non-empty `target_page_slug` when `action === "update_existing"`).
 */
export async function maintainInboxEntry(
  id: number,
  payload: MaintainRequest,
): Promise<MaintainResponse> {
  return _fetchJsonForMaintain<MaintainResponse>(
    `/api/wiki/inbox/${id}/maintain`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

// ── Q1 Inbox Queue Intelligence: batch resolve ──────────────────────
//
// `POST /api/wiki/inbox/batch/resolve` — resolve many inbox entries
// in one HTTP round trip. Backs the Batch Triage UI: multi-select a
// group of pending tasks, pick an action (Q1 MVP: only `reject`),
// optionally supply a shared rejection reason (>=4 chars), submit.
//
// Partial success is allowed — the server loops per-id and returns
// two lists (`success` + `failed`) so the UI can toast "已处理 N/M"
// and highlight which ids to inspect.

/** Server-side wire shape — one id that failed to resolve. */
export interface BatchFailedItem {
  id: number;
  error: string;
}

/** Server-side wire shape for the batch resolve response. */
export interface BatchResolveInboxResponse {
  success: number[];
  failed: BatchFailedItem[];
  total: number;
  processed: number;
}

/**
 * `POST /api/wiki/inbox/batch/resolve` — apply the same action to
 * many inbox ids in a single call. Q1 MVP accepts only
 * `action === "reject"`; passing `"approve"` will surface the
 * server's 400 "not supported in Q1" error. `reason` is required
 * (>=4 chars) when `action === "reject"`.
 */
export async function batchResolveInboxEntries(
  ids: number[],
  action: "reject" | "approve",
  reason?: string,
): Promise<BatchResolveInboxResponse> {
  return _fetchJsonForMaintain<BatchResolveInboxResponse>(
    "/api/wiki/inbox/batch/resolve",
    {
      method: "POST",
      body: JSON.stringify({ ids, action, reason }),
    },
  );
}

/**
 * `POST /api/wiki/inbox/{id}/proposal` — generate a diff proposal
 * for merging the raw into the target wiki slug. Re-export of
 * `persist.createProposal`; see that function for the contract.
 */
export async function createProposal(
  inboxId: number,
  targetSlug: string,
): Promise<UpdateProposal> {
  return _createProposal(inboxId, targetSlug);
}

/**
 * `POST /api/wiki/inbox/{id}/proposal/apply` — commit the pending
 * update proposal. Re-export of `persist.applyProposal`.
 */
export async function applyProposal(
  inboxId: number,
): Promise<{ outcome: string; target_page_slug: string }> {
  return _applyProposal(inboxId);
}

/**
 * `POST /api/wiki/inbox/{id}/proposal/cancel` — discard the pending
 * update proposal. Re-export of `persist.cancelProposal`.
 */
export async function cancelProposal(inboxId: number): Promise<void> {
  return _cancelProposal(inboxId);
}

// ---------------------------------------------------------------------------
// W3 Combined Proposal — multi-source preview + atomic apply
// ---------------------------------------------------------------------------
//
// Wire contract produced by Worker A at:
//   * `POST /api/wiki/proposal/combined`
//   * `POST /api/wiki/proposal/combined/apply`
//
// The W3 path folds 2..=6 pending inbox entries into a single wiki
// page in one LLM call. Unlike the single-source W2 path, preview is
// ephemeral — the server writes NO inbox staging fields. The frontend
// echoes the critical pieces (`after_markdown`, `summary`,
// `before_hash`) back on apply so the server can detect concurrent
// edits without storing snapshot state.
//
// The TS shapes below mirror `GeneratedCombinedProposalRequest`,
// `GeneratedCombinedProposalResponse`, `GeneratedCombinedApplyRequest`,
// `GeneratedCombinedApplyResponse` in `protocol.generated.ts`.

/** One source entry returned in the combined proposal preview. */
export interface CombinedProposalSource {
  inbox_id: number;
  title: string;
  /** Absent when the inbox entry has no upstream raw id. */
  source_raw_id?: number | null;
}

/** Request body for `POST /api/wiki/proposal/combined`. */
export interface CombinedProposalRequest {
  target_slug: string;
  /** 2..=6 inbox ids (enforced server-side with 400 on violation). */
  inbox_ids: number[];
}

/**
 * Response body for `POST /api/wiki/proposal/combined`. The preview
 * is body-in / body-out; the server does NOT persist any of this
 * state on the inbox. Frontend keeps it in local state and echoes
 * `after_markdown` / `summary` / `before_hash` back on apply.
 */
export interface CombinedProposalResponse {
  target_slug: string;
  inbox_ids: number[];
  before_markdown: string;
  after_markdown: string;
  summary: string;
  /** Lowercase hex SHA-256 of `before_markdown`; apply sends it back. */
  before_hash: string;
  /** Unix milliseconds when the preview was generated. */
  generated_at: number;
  /** One entry per source id, in the same order as `inbox_ids`. */
  source_titles: CombinedProposalSource[];
}

/** Request body for `POST /api/wiki/proposal/combined/apply`. */
export interface CombinedApplyRequest {
  target_slug: string;
  inbox_ids: number[];
  /** Echoed from the preview `before_hash`. Mismatch → concurrent_edit. */
  expected_before_hash: string;
  after_markdown: string;
  summary: string;
}

/**
 * Outcome marker returned by the combined apply. The UI must branch
 * on all four:
 *   * `"applied"`          — full success.
 *   * `"partial_applied"`  — wiki write succeeded but at least one
 *     inbox flip failed; see `failed_inbox_ids`.
 *   * `"concurrent_edit"`  — page changed since preview; no write.
 *   * `"stale_inbox"`      — inbox entries gone/non-pending; no write.
 */
export type CombinedApplyOutcome =
  | "applied"
  | "partial_applied"
  | "concurrent_edit"
  | "stale_inbox";

/** Response body for `POST /api/wiki/proposal/combined/apply`. */
export interface CombinedApplyResponse {
  outcome: CombinedApplyOutcome;
  target_page_slug: string;
  applied_inbox_ids: number[];
  /** Only populated when `outcome === "partial_applied"`. */
  failed_inbox_ids?: number[];
  /** Single-line audit summary echoed from the server log entry. */
  audit_entry: string;
}

/**
 * `POST /api/wiki/proposal/combined` — generate a combined diff that
 * folds 2..=6 inbox entries into the target wiki slug in one LLM call.
 * Does NOT touch the inbox file; the caller must echo the response
 * fields back to {@link applyCombinedProposal} on commit.
 *
 * 400 on count out of range / non-pending entry / missing raw.
 * 404 on missing target page or raw.
 * 500 on broker / LLM parse failure.
 */
export async function fetchCombinedProposal(
  request: CombinedProposalRequest,
): Promise<CombinedProposalResponse> {
  return _fetchJsonForMaintain<CombinedProposalResponse>(
    "/api/wiki/proposal/combined",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

/**
 * `POST /api/wiki/proposal/combined/apply` — atomically write the
 * merged markdown to the target page and flip N inbox entries to
 * Approved. Partial-flip failures do NOT roll back the wiki write;
 * instead the response reports `outcome: "partial_applied"` with
 * `failed_inbox_ids`. UI should toast "已合并 X/N 来源，Y 条稍后重试"
 * and leave the wiki update intact.
 */
export async function applyCombinedProposal(
  request: CombinedApplyRequest,
): Promise<CombinedApplyResponse> {
  return _fetchJsonForMaintain<CombinedApplyResponse>(
    "/api/wiki/proposal/combined/apply",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

// ---------------------------------------------------------------------------
// Q2 Target Resolver — ranked target-page candidates for an inbox entry
// ---------------------------------------------------------------------------
//
// Wire contract produced by Worker A at
// `GET /api/wiki/inbox/{id}/candidates`. Pure read route. The backend
// scores every wiki page against the inbox entry using an 8-signal
// additive scheme (see `wiki_maintainer::resolve_target_candidates`)
// and returns the top 3 ranked candidates.
//
// Consumed by the "pick target page" surface of the Workbench so the
// user can one-click accept the strongest match (score ≥ 80) or
// review the Likely / Weak buckets. The shapes below mirror the
// Rust `TargetCandidate` / `CandidateReason` / `CandidateTier` /
// `CandidateSource` types surfaced in `protocol.generated.ts` as
// `GeneratedTargetCandidate` etc.

/**
 * Confidence bucket assigned to a candidate by the backend scorer.
 *   * `"strong"` — score ≥ 80, safe to auto-accept.
 *   * `"likely"` — 40 ≤ score < 80, review recommended.
 *   * `"weak"`   — 10 ≤ score < 40, expandable "more options".
 */
export type CandidateTier = "strong" | "likely" | "weak";

/**
 * Provenance of a candidate. Drives whether the UI short-circuits to
 * an already-locked target or renders the scorer's reason chips.
 *   * `"existing_target"`   — `inbox.target_page_slug` is already
 *     set; the candidate echoes that choice.
 *   * `"existing_proposed"` — `inbox.proposed_wiki_slug` is set but
 *     not yet committed.
 *   * `"resolved"`          — produced by the 8-signal scorer.
 */
export type CandidateSource =
  | "existing_target"
  | "existing_proposed"
  | "resolved";

/**
 * One reason the scorer emitted for a candidate. The `detail` string
 * is Chinese copy ≤ 50 chars, shown verbatim in the UI; `code` is a
 * machine-stable id (e.g. `"exact_slug"`) for analytics + narrow
 * type guards.
 */
export interface CandidateReason {
  code: string;
  weight: number;
  detail: string;
}

/**
 * One ranked target-page suggestion returned by
 * `GET /api/wiki/inbox/{id}/candidates`. Up to three of these make
 * the final list, sorted by `score` descending.
 */
export interface TargetCandidate {
  slug: string;
  title: string;
  score: number;
  tier: CandidateTier;
  source: CandidateSource;
  /** Top-3 reasons by weight, strongest first. */
  reasons: CandidateReason[];
}

/**
 * Response envelope for `GET /api/wiki/inbox/{id}/candidates`.
 */
export interface InboxCandidatesResponse {
  inbox_id: number;
  candidates: TargetCandidate[];
}

/**
 * `GET /api/wiki/inbox/{id}/candidates` — fetch ranked target-page
 * candidates for an inbox entry. Used by the Workbench target
 * picker.
 *
 * Options:
 *   * `with_graph` (default `false`) — when `true`, the backend
 *     runs a second scoring pass that folds graph-based signals
 *     (backlinks / related / outgoing) from the top-3 preliminary
 *     hits into the final scores. Costs 3 extra page-graph
 *     reads; turn on only when the user is triaging a single
 *     entry, not during list-view prefetches.
 */
export async function fetchInboxCandidates(
  id: number,
  options?: { with_graph?: boolean },
): Promise<InboxCandidatesResponse> {
  const qs = options?.with_graph ? "?with_graph=true" : "";
  return _fetchJsonForMaintain<InboxCandidatesResponse>(
    `/api/wiki/inbox/${id}/candidates${qs}`,
  );
}

// ---------------------------------------------------------------------------
// G1 sprint — Per-page relations graph (backlinks + outgoing + related)
// ---------------------------------------------------------------------------
//
// Wire contract produced by Worker A at
// `GET /api/wiki/pages/:slug/graph`. Supersedes the legacy
// `/api/wiki/pages/:slug/backlinks` endpoint the old `BacklinksSection`
// read — the new 3-panel `WikiArticleRelationsPanel` component consumes
// the fuller shape (outgoing + backlinks + related-with-reasons) in a
// single round trip.
//
// The `reasons[]` strings on each related hit come verbatim from the
// backend scorer (e.g. "共同作者", "同分类", "距离 2 跳") — the UI
// just joins them with " · " as small muted caption text.

/** One entry in the related-pages list returned by the graph endpoint. */
export interface RelatedPageHit {
  slug: string;
  title: string;
  category: string;
  summary?: string;
  /** Backend-authored reason tags explaining why this page is related. */
  reasons: string[];
  /** Opaque scorer output; callers shouldn't interpret the magnitude. */
  score: number;
}

/** Minimal node descriptor used for backlinks / outgoing links. */
export interface PageGraphNode {
  slug: string;
  title: string;
  category: string;
}

/**
 * Response envelope for `GET /api/wiki/pages/:slug/graph`.
 * Owned by Worker A; consumed by `WikiArticleRelationsPanel`.
 */
export interface PageGraph {
  slug: string;
  title: string;
  category: string;
  summary?: string;
  /** Pages this page links out to. */
  outgoing: PageGraphNode[];
  /** Pages that link to this page. */
  backlinks: PageGraphNode[];
  /** Related (non-adjacent) pages with scorer reasons. */
  related: RelatedPageHit[];
}

/**
 * Fetch the per-page relations graph for a single wiki slug. Used by
 * the 3-panel `WikiArticleRelationsPanel` under the markdown body.
 */
export async function getWikiPageGraph(slug: string): Promise<PageGraph> {
  return _fetchJsonForMaintain<PageGraph>(
    `/api/wiki/pages/${encodeURIComponent(slug)}/graph`,
  );
}

// ---------------------------------------------------------------------------
// URL ingest diagnostics (M3)
// ---------------------------------------------------------------------------

/**
 * Decision made by the URL ingest orchestrator for a given request.
 *
 * Wire format is `#[serde(tag = "kind", rename_all = "snake_case")]`
 * on the Rust side — see `rust/crates/desktop-core/src/url_ingest/dedupe.rs`.
 *
 * - `created_new`: no prior raw for the canonical URL, a fresh fetch+ingest
 *   ran.
 * - `reused_with_pending_inbox`: a prior raw exists with an inbox task still
 *   pending, so the same raw was handed back (no re-fetch) and the new
 *   request was suppressed to avoid duplicate inbox entries.
 * - `reused_approved`: a prior raw exists that was already approved into
 *   the wiki, reuse it silently.
 * - `reused_after_reject`: a prior raw was rejected; reuse surfaces the
 *   rejection context rather than re-attempting.
 * - `reused_silent`: miscellaneous reuse path that doesn't fit the above
 *   three (catch-all).
 * - `explicit_reingest`: user explicitly asked to re-ingest; carries the
 *   previous raw_id for provenance.
 * - `refreshed_content` (M4): the canonical URL was seen before but the
 *   live fetch produced different content — a fresh raw was created
 *   while the prior raw is kept for history. Carries `previous_raw_id`
 *   and `previous_content_hash` for diff / audit.
 * - `content_duplicate` (M4): a *different* URL resolves to identical
 *   content as an existing raw (content-hash collision). The existing
 *   raw is reused; `matching_raw_id` + `matching_url` point at it.
 */
export type IngestDecision =
  | { kind: "created_new" }
  | { kind: "reused_with_pending_inbox"; reason: string }
  | { kind: "reused_approved"; reason: string }
  | { kind: "reused_after_reject"; reason: string }
  | { kind: "reused_silent"; reason: string }
  | { kind: "explicit_reingest"; previous_raw_id: number }
  | {
      kind: "refreshed_content";
      previous_raw_id: number;
      previous_content_hash: string;
    }
  | {
      kind: "content_duplicate";
      matching_raw_id: number;
      matching_url: string;
    };

/**
 * Classification of the outcome of a single URL ingest request, as shown
 * in the RecentIngestCard diagnostics table. Mirrors the
 * `outcome_kind` string on the Rust `RecentIngestEntry`.
 */
export type RecentIngestOutcomeKind =
  | "ingested"
  | "reused_existing"
  | "inbox_suppressed"
  | "fallback_to_text"
  | "rejected_quality"
  | "fetch_failed"
  | "prerequisite_missing"
  | "invalid_url";

/**
 * One entry in the recent URL ingest decision log. Backed by
 * `desktop-core::url_ingest::recent::RecentIngestEntry` on the Rust
 * side. Intended for the WeChat Bridge / EnvironmentDoctor diagnostics
 * surface — developers and power users ask "why was my URL reused /
 * suppressed / rejected?" and this shape is the primary answer.
 */
export interface RecentIngestEntry {
  timestamp_ms: number;
  canonical_url: string;
  original_url: string;
  /** Which pipeline the request came from (ask-enrich / ilink / kefu / ...). */
  entry_point: string;
  outcome_kind: RecentIngestOutcomeKind;
  decision?: IngestDecision | null;
  raw_id?: number | null;
  inbox_id?: number | null;
  adapter?: string | null;
  duration_ms?: number | null;
  summary: string;
  /**
   * M4 observability — human-readable reason tag emitted alongside the
   * decision (e.g. "refreshed:prev=42", "content_duplicate:src=...").
   * Optional because older backends don't set it.
   */
  decision_reason?: string | null;
  /**
   * M4 observability — hex-encoded content hash computed from the
   * fetched body. Absent when the fetch failed / the outcome was not
   * an ingest.
   */
  content_hash?: string | null;
  /**
   * M4 observability — true when this hash matched an existing raw
   * (content-duplicate / refresh paths). Absent on older backends.
   */
  content_hash_hit?: boolean | null;
}

/**
 * M4 aggregate stats over the in-memory decision ring buffer. Currently
 * exposed as two `kind → count` maps (by decision kind, by entry point)
 * so the UI can render a compact summary strip without re-aggregating
 * client-side. Optional on the response envelope because the field did
 * not exist before M4 — legacy backends return `undefined`.
 */
export interface RecentIngestStats {
  by_kind: Record<string, number>;
  by_entry_point: Record<string, number>;
}

/**
 * Response shape for `GET /api/desktop/url-ingest/recent`.
 * `total` counts all decisions currently retained; `capacity` is the
 * ring-buffer upper bound (so the UI can show "most recent N of M").
 *
 * `stats` (M4) is a summary over the retained decisions. Older
 * backends omit the field; the UI should treat `undefined` as "no
 * summary available" rather than an error.
 */
export interface RecentIngestResponse {
  decisions: RecentIngestEntry[];
  total: number;
  capacity: number;
  stats?: RecentIngestStats;
}

// ---------------------------------------------------------------------------
// M5 WeChat bridge — health + group-scope config
// ---------------------------------------------------------------------------
//
// Three routes backing the M5 Settings → WeChat bridge panel:
//
//   * `GET /api/wechat/bridge/health` — latest per-channel status
//     (poll/inbound/ingest timestamps, dedupe counters, bound config).
//   * `GET /api/wechat/bridge/config` — current group-scope config.
//   * `POST /api/wechat/bridge/config` — replace the config; body must
//     be a full `WeChatIngestConfig` payload.
//
// Wire shapes are pinned by the Rust structs in
// `rust/crates/desktop-server/src/lib.rs` and the codegen outputs
// `GeneratedBridgeHealthResponse` / `GeneratedChannelHealth` /
// `GeneratedWeChatIngestConfig` in `protocol.generated.ts`. The
// hand-authored interfaces below are stricter (e.g. explicit
// `| null` for Option fields) so call sites get tight narrowing.

/** Group-scope config for the WeChat auto-ingest bridge. */
export interface WeChatIngestConfig {
  /** "all" passes every event; "whitelist" requires a known group_id. */
  enabled_mode: "all" | "whitelist";
  /** WeChat-side group ids allowed under `"whitelist"` mode. */
  enabled_group_ids: string[];
}

/** Per-channel health snapshot returned by the bridge health route. */
export interface WeChatChannelHealth {
  channel: "ilink" | "kefu";
  running: boolean;
  last_poll_unix_ms: number | null;
  last_inbound_unix_ms: number | null;
  last_ingest_unix_ms: number | null;
  consecutive_failures: number;
  last_error: string | null;
  processed_msg_count: number;
  dedupe_hit_count: number;
}

/** Envelope returned by `GET /api/wechat/bridge/health`. */
export interface WeChatBridgeHealthResponse {
  ilink: WeChatChannelHealth;
  kefu: WeChatChannelHealth;
  config: WeChatIngestConfig;
}

/**
 * Fetch the merged per-channel health snapshot for the WeChat bridge.
 * Used by the Settings panel heartbeat; cheap enough to poll every
 * few seconds.
 */
export async function fetchWeChatBridgeHealth(): Promise<WeChatBridgeHealthResponse> {
  return _fetchJsonForMaintain<WeChatBridgeHealthResponse>(
    "/api/wechat/bridge/health",
  );
}

/** Fetch the currently-active group-scope config. */
export async function fetchWeChatIngestConfig(): Promise<WeChatIngestConfig> {
  return _fetchJsonForMaintain<WeChatIngestConfig>(
    "/api/wechat/bridge/config",
  );
}

/**
 * Replace the group-scope config. Server persists the payload to
 * `~/.clawwiki/wechat_ingest_config.json` and swaps the runtime cache.
 * Returns the value that was actually stored (mirrors the POST body
 * on success).
 */
export async function updateWeChatIngestConfig(
  config: WeChatIngestConfig,
): Promise<WeChatIngestConfig> {
  return _fetchJsonForMaintain<WeChatIngestConfig>(
    "/api/wechat/bridge/config",
    {
      method: "POST",
      body: JSON.stringify(config),
    },
  );
}

// ---------------------------------------------------------------------------
// P1 End-to-End Provenance + Lineage Explorer
// ---------------------------------------------------------------------------
//
// Three read APIs over `{meta}/lineage.jsonl`. The wire types mirror
// the `wiki_store::provenance` Rust structs and are mechanically
// regenerated via `protocol.generated.ts`
// (`Generated{LineageEvent,LineageRef,...}`) — we redeclare them here
// as hand-written shapes to keep the frontend-facing API explicit
// about the discriminated-union shape of `LineageRef` / `LineageEventType`.
//
// Usage:
//   * Wiki page lineage tab:  `fetchWikiLineage(slug, { limit, offset })`
//   * Inbox detail pane:      `fetchInboxLineage(id)` → upstream + downstream
//   * Raw inspector:          `fetchRawLineage(id)` → flat list

/** Discriminator string for `LineageEvent.event_type`. */
export type LineageEventType =
  | "raw_written"
  | "inbox_appended"
  | "proposal_generated"
  | "wiki_page_applied"
  | "combined_wiki_page_applied"
  | "inbox_rejected"
  | "wechat_message_received"
  | "url_ingested";

/**
 * `LineageRef` — a discriminated-union pointer into one of the five
 * canonical pipeline surfaces (raw / inbox / wiki page / wechat msg
 * / url). Matches the Rust `#[serde(tag = "kind", rename_all =
 * "snake_case")]` encoding.
 */
export type LineageRef =
  | { kind: "raw"; id: number }
  | { kind: "inbox"; id: number }
  | { kind: "wiki_page"; slug: string; title?: string }
  | { kind: "wechat_message"; event_key: string }
  | { kind: "url_source"; canonical: string };

/** One row in `lineage.jsonl`. */
export interface LineageEvent {
  event_id: string;
  event_type: LineageEventType;
  timestamp_ms: number;
  upstream: LineageRef[];
  downstream: LineageRef[];
  display_title: string;
  metadata: Record<string, unknown>;
}

/** Response envelope for `GET /api/lineage/wiki/:slug`. */
export interface WikiLineageResponse {
  events: LineageEvent[];
  total_count: number;
}

/** Response envelope for `GET /api/lineage/inbox/:id`. */
export interface InboxLineageResponse {
  upstream_events: LineageEvent[];
  downstream_events: LineageEvent[];
}

/** Response envelope for `GET /api/lineage/raw/:id`. */
export interface RawLineageResponse {
  events: LineageEvent[];
}

/**
 * Fetch the lineage timeline for a wiki page. `limit` / `offset`
 * are server-side — the backend linearly scans `lineage.jsonl`,
 * filters by slug, sorts descending, then slices.
 */
export async function fetchWikiLineage(
  slug: string,
  options?: { limit?: number; offset?: number },
): Promise<WikiLineageResponse> {
  const parts: string[] = [];
  if (options?.limit !== undefined) {
    parts.push(`limit=${options.limit}`);
  }
  if (options?.offset !== undefined) {
    parts.push(`offset=${options.offset}`);
  }
  const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
  return _fetchJsonForMaintain<WikiLineageResponse>(
    `/api/lineage/wiki/${encodeURIComponent(slug)}${qs}`,
  );
}

/**
 * Fetch the lineage for a single inbox id, split into upstream
 * (events that produced this inbox entry) and downstream (events
 * this inbox entry drove).
 */
export async function fetchInboxLineage(
  id: number,
): Promise<InboxLineageResponse> {
  return _fetchJsonForMaintain<InboxLineageResponse>(
    `/api/lineage/inbox/${id}`,
  );
}

/**
 * Fetch the flat lineage for a single raw id — every event whose
 * upstream or downstream mentions this raw, sorted newest-first.
 */
export async function fetchRawLineage(
  id: number,
): Promise<RawLineageResponse> {
  return _fetchJsonForMaintain<RawLineageResponse>(
    `/api/lineage/raw/${id}`,
  );
}
