/**
 * SettingsPage — DS1.4 · editorial settings center.
 *
 * IA mapping (pre-DS1.4 → DS1.4):
 *
 *   general          ─┐
 *   shortcuts        ─┴→  外观与快捷键       (appearance)
 *
 *   provider         ─┐
 *   multi-provider   ─┤
 *   codex-pool       ─┴→  账户与模型          (account-model)
 *
 *   wechat           ──→  微信接入            (wechat)
 *
 *   permissions      ──→  权限与安全          (security)
 *
 *   storage          ─┐
 *   data             ─┤
 *   about            ─┴→  数据与备份          (data-backup)
 *
 *   mcp              ──→  高级                (advanced)
 *
 * Deep-link aliases: legacy `?tab=` query values are routed to the
 * new group and, where a group contains multiple old sections, scroll
 * the right pane to the relevant card. Nothing old gets removed.
 *
 * Visual contract:
 *   - serif h1 "设置" + caption at top (editorial header)
 *   - 176 px left nav + flexible content (max 860 px wide), LEFT-aligned
 *   - Each section renders inside `.ds-settings-card`; cards stack with
 *     12 px gap. No more mx-auto max-w-3xl island.
 *   - Existing section components (GeneralSettings / ProviderSettings /
 *     WeChatSettings / McpSettings / …) are mounted verbatim inside
 *     the new shell — DS1.4 is a wrapper pass, not a business rewrite.
 *     The one exception is PermissionSettings, where the English
 *     "Permission Mode / Runtime value" copy was user-visible noise
 *     and gets localised in a separate edit.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Cpu,
  MessageCircle,
  ShieldCheck,
  Palette,
  Database,
  Wrench,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import { GeneralSettings } from "./sections/GeneralSettings";
import { ProviderSettings } from "./sections/ProviderSettings";
import { MultiProviderSettings } from "./sections/MultiProviderSettings";
import { SubscriptionCodexPool } from "./sections/private-cloud/SubscriptionCodexPool";
import { WeChatSettings } from "./sections/WeChatSettings";
import { McpSettings } from "./sections/McpSettings";
import { PermissionSettings } from "./sections/PermissionSettings";
import { DataSettings } from "./sections/DataSettings";
import { StorageSettings } from "./sections/StorageSettings";
import { ShortcutsSettings } from "./sections/ShortcutsSettings";
import { AboutSection } from "./sections/AboutSection";
import { settingsKeys } from "./api/query";
import {
  getBootstrap,
  getCustomize,
  getSettings,
  type DesktopBootstrap,
  type DesktopCustomizeState,
  type DesktopSettingsState,
} from "@/lib/tauri";
import { useSettingsStore } from "@/state/settings-store";

/* ─── Group taxonomy ──────────────────────────────────────────── */

type GroupId =
  | "account-model"
  | "wechat"
  | "security"
  | "appearance"
  | "data-backup"
  | "advanced";

interface GroupMeta {
  id: GroupId;
  label: string;
  caption: string;
  icon: LucideIcon;
}

// DS1.5 · captions ≤ 12 字, 书章节式。组名能说清楚的不写 caption。
const GROUPS: readonly GroupMeta[] = [
  {
    id: "account-model",
    label: "账户与模型",
    caption: "选择模型服务。",
    icon: Cpu,
  },
  {
    id: "wechat",
    label: "微信接入",
    caption: "绑定和长轮询。",
    icon: MessageCircle,
  },
  {
    id: "security",
    label: "权限与安全",
    caption: "限制 AI 可以读写的文件。",
    icon: ShieldCheck,
  },
  {
    id: "appearance",
    label: "外观与快捷键",
    caption: "",
    icon: Palette,
  },
  {
    id: "data-backup",
    label: "数据与备份",
    caption: "你的数据存在哪里。",
    icon: Database,
  },
  {
    id: "advanced",
    label: "高级",
    caption: "MCP、扩展和运行时路径。",
    icon: Wrench,
  },
];

/**
 * Map a legacy `?tab=` value to its new group + optional anchor. When
 * a link from an old surface lands here we still honour it.
 */
function aliasLegacyTab(legacy: string | null): {
  group: GroupId;
  anchor: string | null;
} {
  switch (legacy) {
    case "general":
    case "shortcuts":
    case "appearance":
      return { group: "appearance", anchor: legacy === "shortcuts" ? "shortcuts" : null };
    case "provider":
    case "multi-provider":
    case "codex-pool":
    case "account-model":
      return { group: "account-model", anchor: legacy };
    case "wechat":
      return { group: "wechat", anchor: null };
    case "permissions":
    case "security":
      return { group: "security", anchor: null };
    case "storage":
    case "data":
    case "about":
    case "data-backup":
      return { group: "data-backup", anchor: legacy === "about" ? "about" : null };
    case "mcp":
    case "advanced":
      return { group: "advanced", anchor: null };
    default:
      return { group: "account-model", anchor: null };
  }
}

/* ─── Page component ─────────────────────────────────────────── */

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const language = useSettingsStore((state) => state.language);
  const { i18n } = useTranslation();

  // Seed default group from legacy `?tab=` alias so deep-links keep
  // working. When the URL has no tab query, default to 账户与模型.
  const initial = useMemo(
    () => aliasLegacyTab(searchParams.get("tab")),
    [searchParams],
  );
  const activeGroup: GroupId = initial.group;
  const anchor = initial.anchor;

  const setGroup = useCallback(
    (next: GroupId) => {
      const params = new URLSearchParams(searchParams);
      if (next === "account-model") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Keep i18n in sync with the user-preferred language (pre-DS1.4
  // behaviour: Settings was often the first page users land on, and
  // if they'd changed the language persisted in the store we want it
  // reflected everywhere on load).
  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language, i18n]);

  // Shared backend data — fetched once per page load. Individual
  // sections read the slices they need.
  const bootstrapQuery = useQuery({
    queryKey: settingsKeys.bootstrap(),
    queryFn: getBootstrap,
  });
  const settingsQuery = useQuery({
    queryKey: settingsKeys.settings(),
    queryFn: getSettings,
  });
  const customizeQuery = useQuery({
    queryKey: settingsKeys.customize(),
    queryFn: getCustomize,
  });

  const privateCloudEnabled =
    bootstrapQuery.data?.private_cloud_enabled === true;

  const isLoading =
    (bootstrapQuery.isLoading && !bootstrapQuery.isError) ||
    (settingsQuery.isLoading && !settingsQuery.isError) ||
    (customizeQuery.isLoading && !customizeQuery.isError);
  const error = extractErrorMessage(
    bootstrapQuery.error,
    settingsQuery.error,
    customizeQuery.error,
  );

  const currentMeta = GROUPS.find((g) => g.id === activeGroup) ?? GROUPS[0];

  return (
    <div className="ds-settings-shell ds-canvas">
      <header className="ds-settings-header">
        <h1 className="ds-settings-title">设置</h1>
        <p className="ds-settings-subtitle">
          调整模型、权限、微信接入和本地数据。
        </p>
      </header>

      <div className="ds-settings-layout">
        <nav className="ds-settings-nav" aria-label="设置分组">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g.id)}
                className="ds-settings-nav-item"
                data-active={g.id === activeGroup || undefined}
                aria-current={g.id === activeGroup ? "page" : undefined}
              >
                <Icon
                  className="size-3.5 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span>{g.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ds-settings-content">
          <div className="ds-settings-content-inner">
            <div className="ds-settings-section-head">
              <h2 className="ds-settings-section-h">{currentMeta.label}</h2>
              {currentMeta.caption && (
                <p className="ds-settings-section-help">
                  {currentMeta.caption}
                </p>
              )}
            </div>

            <GroupBody
              group={activeGroup}
              anchor={anchor}
              privateCloudEnabled={privateCloudEnabled}
              isLoading={isLoading}
              bootstrap={bootstrapQuery.data}
              settings={settingsQuery.data?.settings ?? null}
              customize={customizeQuery.data?.customize ?? null}
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Group body — stacks the relevant existing sections ─────── */

function GroupBody({
  group,
  anchor,
  privateCloudEnabled,
  isLoading,
  bootstrap,
  settings,
  customize,
  error,
}: {
  group: GroupId;
  anchor: string | null;
  privateCloudEnabled: boolean;
  isLoading: boolean;
  bootstrap: DesktopBootstrap | undefined;
  settings: DesktopSettingsState | null;
  customize: DesktopCustomizeState | null;
  error?: string;
}) {
  // Scroll to anchor when the user arrives with a legacy `?tab=` alias.
  useEffect(() => {
    if (!anchor) return;
    const el = document.getElementById(`ds-settings-anchor-${anchor}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [anchor]);

  if (group === "appearance") {
    return (
      <>
        <SettingsCard
          title="外观"
          help="调整主题、字号，以及界面语言。"
          anchorId="appearance"
        >
          <GeneralSettings />
        </SettingsCard>
        <SettingsCard
          title="快捷键"
          help="在 Ask 对话中生效的键位。"
          anchorId="shortcuts"
        >
          <ShortcutsSettings />
        </SettingsCard>
      </>
    );
  }

  if (group === "account-model") {
    if (isLoading) return <SectionLoading />;
    return (
      <>
        <SettingsCard
          title="OpenAI · OAuth 登录"
          help="Ask 默认使用的模型服务。登录后 ClawWiki 会把凭据写入本地配置。"
          anchorId="provider"
        >
          <ProviderSettings customize={customize} error={error} />
        </SettingsCard>
        <SettingsCard
          title="更多模型服务"
          help="接入 Moonshot、Qwen、DeepSeek 等兼容 OpenAI 接口的服务，管理多个 provider。"
          anchorId="multi-provider"
        >
          <MultiProviderSettings />
        </SettingsCard>
        {privateCloudEnabled && (
          <SettingsCard
            title="私有订阅池"
            help="私有部署下的 Codex 订阅凭据池。普通版本不显示。"
            anchorId="codex-pool"
          >
            <SubscriptionCodexPool />
          </SettingsCard>
        )}
      </>
    );
  }

  if (group === "wechat") {
    return (
      <SettingsCard
        title="已绑定的微信小号"
        help="管理已经接入的外脑小号。第一次接入请从侧边「微信接入」开始。"
        anchorId="wechat"
      >
        <WeChatSettings />
      </SettingsCard>
    );
  }

  if (group === "security") {
    if (isLoading) return <SectionLoading />;
    return (
      <SettingsCard
        title="权限模式"
        help="决定执行工具和修改文件前是否需要你确认。"
        anchorId="permissions"
      >
        <PermissionSettings customize={customize} error={error} />
      </SettingsCard>
    );
  }

  if (group === "data-backup") {
    if (isLoading) return <SectionLoading />;
    return (
      <>
        <SettingsCard
          title="知识库位置"
          help="桌面端当前使用的本地知识库目录和配置目录。"
          anchorId="data"
        >
          <DataSettings settings={settings} error={error} />
        </SettingsCard>
        <SettingsCard
          title="存储位置细节"
          help="运行时汇报的其他存储路径，包含对话存档与 OAuth 凭据。"
          anchorId="storage"
        >
          <StorageSettings settings={settings} error={error} />
        </SettingsCard>
        <SettingsCard
          title="关于 ClawWiki"
          help="当前版本与运行态基础信息。"
          anchorId="about"
        >
          <AboutSection
            productName={bootstrap?.product_name}
            error={error}
            settings={settings}
          />
        </SettingsCard>
      </>
    );
  }

  if (group === "advanced") {
    if (isLoading) return <SectionLoading />;
    return (
      <>
        <SettingsCard
          title="工具插件"
          help="让 ClawWiki 调用外部工具。多数用户不需要配置。技术名称：MCP。"
          anchorId="mcp"
        >
          <McpSettings customize={customize} error={error} />
        </SettingsCard>
      </>
    );
  }

  return null;
}

/* ─── Card wrapper — DS1.4 editorial card for a section ─────── */

function SettingsCard({
  title,
  help,
  anchorId,
  children,
}: {
  title: string;
  help: string;
  anchorId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`ds-settings-anchor-${anchorId}`}
      className="ds-settings-card"
    >
      <header className="ds-settings-card-header">
        <div>
          <div className="ds-settings-card-title">{title}</div>
          <div className="ds-settings-card-help">{help}</div>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────── */

function SectionLoading() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 px-4 py-3 text-muted-foreground/60" style={{ fontSize: 13 }}>
      <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
      <span>加载中…</span>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function extractErrorMessage(...errors: Array<unknown>): string | undefined {
  for (const error of errors) {
    if (error instanceof Error) {
      return error.message;
    }
  }
  return undefined;
}
