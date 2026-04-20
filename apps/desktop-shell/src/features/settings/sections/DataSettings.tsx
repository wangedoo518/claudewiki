import { SettingGroup, SettingRow } from "../components/SettingGroup";
import type { DesktopSettingsState } from "@/lib/tauri";

interface DataSettingsProps {
  settings: DesktopSettingsState | null;
  error?: string;
}

export function DataSettings({ settings, error }: DataSettingsProps) {
  return (
    <div className="space-y-4">
      <SettingGroup
        title="知识库根目录"
        description="ClawWiki 的所有素材、知识页、整理规则都保存在这个目录下。一台机器只有一个根目录。"
      >
        <SettingRow
          label="当前运行路径"
          description="桌面端当前使用的知识库目录"
        >
          <div className="max-w-[360px] text-right text-caption text-muted-foreground">
            {settings?.project_path ?? "暂不可用"}
          </div>
        </SettingRow>
        <SettingRow
          label="配置文件目录"
          description="ClawWiki / OpenClaudeCode 的配置文件所在目录"
        >
          <div className="max-w-[360px] text-right text-caption text-muted-foreground">
            {settings?.config_home ?? "暂不可用"}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title="存储位置"
        description="桌面端运行时正在使用的各类文件路径"
      >
        <div className="space-y-2">
          {settings?.storage_locations.map((location) => (
            <div
              key={`${location.label}-${location.path}`}
              className="rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div className="text-body-sm font-semibold text-foreground">
                {location.label}
              </div>
              <div className="mt-0.5 break-all text-caption text-muted-foreground">
                {location.path}
              </div>
              <div className="mt-1 text-caption text-muted-foreground">
                {location.description}
              </div>
            </div>
          ))}

          {settings?.storage_locations.length === 0 && (
            <div className="py-4 text-center text-caption text-muted-foreground">
              运行时未汇报任何存储位置。
            </div>
          )}
        </div>
      </SettingGroup>

      {(error || settings?.warnings.length) && (
        <SettingGroup title="警告">
          <div className="space-y-2 text-caption text-muted-foreground">
            {error && <div>{error}</div>}
            {settings?.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        </SettingGroup>
      )}
    </div>
  );
}
