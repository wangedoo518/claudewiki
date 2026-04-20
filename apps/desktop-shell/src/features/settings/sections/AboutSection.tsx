import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingGroup } from "../components/SettingGroup";
import type { DesktopSettingsState } from "@/lib/tauri";

interface AboutSectionProps {
  productName?: string;
  settings: DesktopSettingsState | null;
  error?: string;
}

export function AboutSection({
  productName,
  settings,
  error,
}: AboutSectionProps) {
  return (
    <div className="space-y-4">
      <SettingGroup title="关于">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="size-6 text-primary" />
          </div>
          <div>
            <div className="text-subhead font-semibold text-foreground">
              {productName ?? "Warwolf"}
            </div>
            <div className="text-caption text-muted-foreground">
              桌面外脑
            </div>
            <div className="mt-1 flex gap-1">
              <Badge variant="secondary" className="text-caption">
                Tauri 2
              </Badge>
              <Badge variant="secondary" className="text-caption">
                React 19
              </Badge>
              <Badge variant="secondary" className="text-caption">
                Rust 运行时
              </Badge>
            </div>
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="运行路径">
        <div className="space-y-1.5 text-body-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">知识库</span>
            <span className="max-w-[360px] truncate text-right">
              {settings?.project_path ?? "暂不可用"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">对话存档</span>
            <span className="max-w-[360px] truncate text-right">
              {settings?.desktop_session_store_path ?? "暂不可用"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">OAuth 凭据</span>
            <span className="max-w-[360px] truncate text-right">
              {settings?.oauth_credentials_path ?? "暂不可用"}
            </span>
          </div>
        </div>
      </SettingGroup>

      {error && (
        <SettingGroup title="警告">
          <div className="text-caption text-muted-foreground">{error}</div>
        </SettingGroup>
      )}
    </div>
  );
}
