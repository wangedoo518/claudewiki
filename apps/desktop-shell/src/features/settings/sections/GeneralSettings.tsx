import { SettingGroup, SettingRow } from "../components/SettingGroup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore, type ThemeMode } from "@/state/settings-store";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
] as const;

export function GeneralSettings() {
  const theme = useSettingsStore((state) => state.theme);
  const fontSize = useSettingsStore((state) => state.fontSize);
  const language = useSettingsStore((state) => state.language);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setFontSize = useSettingsStore((state) => state.setFontSize);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  const themes: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
  ];

  const fontSizes = [12, 13, 14, 15, 16];

  return (
    <div className="space-y-4">
      <SettingGroup title="外观">
        <SettingRow label="主题" description="选择你偏好的配色方案">
          <div className="flex gap-1">
            {themes.map((t) => (
              <Button
                key={t.value}
                variant={theme === t.value ? "default" : "outline"}
                size="sm"
                className="text-caption"
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="字体大小" description="编辑器和终端字体大小">
          <div className="flex gap-1">
            {fontSizes.map((size) => (
              <Button
                key={size}
                variant={fontSize === size ? "default" : "outline"}
                size="sm"
                className={cn("w-10 text-caption")}
                onClick={() => setFontSize(size)}
              >
                {size}
              </Button>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup
        title="语言"
        description="应用显示语言"
      >
        <SettingRow label="语言">
          <div className="flex gap-1">
            {LANGUAGES.map((lang) => (
              <Button
                key={lang.value}
                variant={language === lang.value ? "default" : "outline"}
                size="sm"
                className="text-caption"
                onClick={() => setLanguage(lang.value)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
