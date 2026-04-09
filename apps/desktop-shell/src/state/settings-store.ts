import { create } from "zustand";
import { persist } from "zustand/middleware";
import { namespacedStorage, readLegacyPersistedSlice } from "./store-helpers";

export type ThemeMode = "light" | "dark" | "system";
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan";
export type McpTransport = "stdio" | "sse" | "http" | "ws" | "sdk";
export type McpScope = "local" | "user" | "project";

export interface ProviderConfig {
  type: "anthropic" | "openai" | "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
}

export interface UserMcpServer {
  id: string;
  name: string;
  transport: McpTransport;
  target: string;
  scope: McpScope;
  enabled: boolean;
}

export interface SettingsState {
  theme: ThemeMode;
  warwolfTheme: boolean;
  /**
   * ClawWiki canonical shell flag (S0.2).
   *
   * - `false` (default) → the legacy `AppShell` with TabBar, Workbench,
   *   AppsGallery, CodeToolsPage. Preserves 100 % of Phase 6 behavior.
   * - `true` → the new `ClawWikiShell` with Sidebar + 9 routes
   *   (Dashboard / Ask / Inbox / Raw / Wiki / Graph / Schema / WeChat /
   *   Settings) and the DeepTutor warm theme. Most pages are still
   *   stubs at S0.2 — they fill in across S0.3 → S6.
   *
   * Toggling this flag at runtime swaps the shell without reloading
   * the process. Coexistence is intentional: S0 is a gradual cut-over
   * that ends at S0.4 when legacy surfaces get deleted and this flag
   * becomes the only supported mode.
   */
  clawwikiShell: boolean;
  language: string;
  fontSize: number;
  defaultModel: string;
  permissionMode: PermissionMode;
  defaultProjectPath: string;
  provider: ProviderConfig;
  showSessionSidebar: boolean;
  mcpServers: UserMcpServer[];
  setTheme: (theme: ThemeMode) => void;
  setWarwolfTheme: (enabled: boolean) => void;
  setClawwikiShell: (enabled: boolean) => void;
  setLanguage: (language: string) => void;
  setFontSize: (fontSize: number) => void;
  setDefaultModel: (model: string) => void;
  setPermissionMode: (mode: PermissionMode) => void;
  /** Hydrate permissionMode from backend .claw/settings.json for the given project. */
  hydratePermissionModeFromDisk: (projectPath: string) => Promise<void>;
  setDefaultProjectPath: (path: string) => void;
  setProvider: (provider: Partial<ProviderConfig>) => void;
  setShowSessionSidebar: (show: boolean) => void;
  updateSettings: (
    updates: Partial<
      Pick<
        SettingsState,
        | "theme"
        | "warwolfTheme"
        | "clawwikiShell"
        | "language"
        | "fontSize"
        | "defaultModel"
        | "permissionMode"
        | "defaultProjectPath"
        | "provider"
        | "showSessionSidebar"
        | "mcpServers"
      >
    >
  ) => void;
  addMcpServer: (server: UserMcpServer) => void;
  updateMcpServer: (payload: {
    id: string;
    updates: Partial<UserMcpServer>;
  }) => void;
  removeMcpServer: (id: string) => void;
  toggleMcpServer: (id: string) => void;
}

type PersistedSettingsState = Pick<
  SettingsState,
  | "theme"
  | "warwolfTheme"
  | "clawwikiShell"
  | "language"
  | "fontSize"
  | "defaultModel"
  | "permissionMode"
  | "defaultProjectPath"
  | "provider"
  | "showSessionSidebar"
  | "mcpServers"
>;

const defaultSettingsState: PersistedSettingsState = {
  theme: "system",
  warwolfTheme: true,
  // S0.2: default OFF so existing users land on the Phase 6 shell.
  // Flip to `true` once S0.4 executes the legacy delete.
  clawwikiShell: false,
  language: "en",
  fontSize: 14,
  defaultModel: "claude-opus-4-6",
  permissionMode: "default",
  defaultProjectPath: "",
  provider: {
    type: "anthropic",
    apiKey: "",
    baseUrl: "https://api.anthropic.com",
  },
  showSessionSidebar: true,
  mcpServers: [],
};

function sanitizeProviderConfig(provider: ProviderConfig) {
  return {
    ...provider,
    apiKey: "",
  };
}

function mergeSettingsState(
  base: PersistedSettingsState,
  persisted?: Partial<PersistedSettingsState> | null
): PersistedSettingsState {
  if (!persisted) {
    return base;
  }

  return {
    ...base,
    ...persisted,
    provider: {
      ...base.provider,
      ...(persisted.provider ?? {}),
    },
    mcpServers: persisted.mcpServers ?? base.mcpServers,
  };
}

function createInitialSettingsState() {
  return mergeSettingsState(
    defaultSettingsState,
    readLegacyPersistedSlice<Partial<PersistedSettingsState>>("settings")
  );
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...createInitialSettingsState(),
      setTheme: (theme) => set({ theme }),
      setWarwolfTheme: (warwolfTheme) => set({ warwolfTheme }),
      setClawwikiShell: (clawwikiShell) => set({ clawwikiShell }),
      setLanguage: (language) => set({ language }),
      setFontSize: (fontSize) => set({ fontSize }),
      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setPermissionMode: (permissionMode) => {
        // Optimistic update: set Zustand state immediately for UI responsiveness.
        const previous = (get() as SettingsState).permissionMode;
        set({ permissionMode });
        // Persist to backend .claw/settings.json so the agentic loop's
        // ConfigLoader reads the same value. Roll back on failure.
        const projectPath = (get() as SettingsState).defaultProjectPath;
        if (!projectPath) {
          // No project yet — Zustand-only update is fine.
          return;
        }
        void import("@/features/session-workbench/api/client")
          .then(({ writePermissionModeToDisk }) =>
            writePermissionModeToDisk(projectPath, permissionMode),
          )
          .catch((err) => {
            console.error(
              "Failed to persist permissionMode to backend; rolling back:",
              err,
            );
            set({ permissionMode: previous });
          });
      },
      hydratePermissionModeFromDisk: async (projectPath: string) => {
        try {
          const { readPermissionModeFromDisk } = await import(
            "@/features/session-workbench/api/client"
          );
          const { mode } = await readPermissionModeFromDisk(projectPath);
          // Only update if mode is a valid value.
          if (
            mode === "default" ||
            mode === "acceptEdits" ||
            mode === "bypassPermissions" ||
            mode === "plan"
          ) {
            set({ permissionMode: mode });
          }
        } catch {
          // Silent fall-through: keep whatever was persisted in localStorage.
        }
      },
      setDefaultProjectPath: (defaultProjectPath) => set({ defaultProjectPath }),
      setProvider: (provider) =>
        set((state) => ({
          provider: {
            ...state.provider,
            ...provider,
          },
        })),
      setShowSessionSidebar: (showSessionSidebar) => set({ showSessionSidebar }),
      updateSettings: (updates) =>
        set((state) => ({
          ...updates,
          provider: updates.provider
            ? {
                ...state.provider,
                ...updates.provider,
              }
            : state.provider,
          mcpServers: updates.mcpServers ?? state.mcpServers,
        })),
      addMcpServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        })),
      updateMcpServer: ({ id, updates }) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((server) =>
            server.id === id
              ? {
                  ...server,
                  ...updates,
                }
              : server
          ),
        })),
      removeMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((server) => server.id !== id),
        })),
      toggleMcpServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((server) =>
            server.id === id
              ? {
                  ...server,
                  enabled: !server.enabled,
                }
              : server
          ),
        })),
    }),
    {
      name: "state",
      storage: namespacedStorage("settings"),
      partialize: (state) => ({
        theme: state.theme,
        warwolfTheme: state.warwolfTheme,
        clawwikiShell: state.clawwikiShell,
        language: state.language,
        fontSize: state.fontSize,
        defaultModel: state.defaultModel,
        permissionMode: state.permissionMode,
        defaultProjectPath: state.defaultProjectPath,
        provider: sanitizeProviderConfig(state.provider),
        showSessionSidebar: state.showSessionSidebar,
        mcpServers: state.mcpServers,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...mergeSettingsState(
          defaultSettingsState,
          persistedState as Partial<PersistedSettingsState> | null
        ),
      }),
    }
  )
);
