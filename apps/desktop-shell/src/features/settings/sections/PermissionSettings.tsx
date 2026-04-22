import { SettingGroup } from "../components/SettingGroup";
import { cn } from "@/lib/utils";
import { PERMISSION_MODES } from "@/features/permission/permission-config";
import type { DesktopCustomizeState } from "@/lib/tauri";
import { useSettingsStore } from "@/state/settings-store";

interface PermissionSettingsProps {
  customize: DesktopCustomizeState | null;
  error?: string;
}

/**
 * PermissionSettings — DS1.4 localised copy.
 *
 * Pre-DS1.4 this surface leaked three English strings into the
 * default layer:
 *   - "Permission Mode"
 *   - "Controls how tool execution permissions are handled"
 *   - "Runtime value: Danger full access"
 *
 * The first two became plain Chinese. The third (the raw runtime
 * value from `customize.permission_mode`) is a debug value; DS1.4
 * keeps it, but only inside a collapsed `<details>` block so
 *灰度测试 users don't see "Danger full access" as the dominant
 * headline of their permissions page.
 */
export function PermissionSettings({
  customize,
  error,
}: PermissionSettingsProps) {
  const currentMode = useSettingsStore((state) => state.permissionMode);
  const setPermissionMode = useSettingsStore((state) => state.setPermissionMode);

  return (
    <div className="space-y-4">
      <SettingGroup
        title="权限模式"
        description="决定执行工具和修改文件前是否需要你确认。灰度测试建议保持「需要确认」。"
      >
        <div className="space-y-2">
          {PERMISSION_MODES.map((mode) => {
            const Icon = mode.icon;
            const isActive = currentMode === mode.value;
            return (
              <button
                key={mode.value}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30"
                )}
                onClick={() => setPermissionMode(mode.value)}
              >
                <Icon
                  className="size-5 shrink-0"
                  style={mode.color ? { color: mode.color } : undefined}
                />
                <div className="flex-1">
                  <div className="text-body-sm font-semibold text-foreground">
                    {mode.label}
                  </div>
                  <div className="text-caption text-muted-foreground">
                    {mode.desc}
                  </div>
                </div>
                {isActive && (
                  <div className="size-2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        {customize?.permission_mode && (
          <details className="ds-settings-advanced">
            <summary>技术详情</summary>
            <div className="ds-settings-advanced-body">
              runtime permission_mode = {customize.permission_mode}
            </div>
          </details>
        )}
      </SettingGroup>

      {error && (
        <SettingGroup title="警告">
          <div className="text-caption text-muted-foreground">{error}</div>
        </SettingGroup>
      )}
    </div>
  );
}
