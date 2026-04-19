/**
 * M5 sprint — "配置自动入库群组" modal for the WeChat Bridge page.
 *
 * Controls the whitelist of group_ids whose messages are auto-ingested.
 * Two modes:
 *
 *   - `all`        every incoming group message is ingested
 *   - `whitelist`  only group_ids in `enabled_group_ids` are ingested
 *
 * Why manual `group_id` entry? Explorer A noted that the iLink adapter
 * doesn't yet surface group IDs to the frontend, so we can't populate a
 * picker from the backend. The MVP strategy is: keep this modal lean, let
 * the user paste known group_ids from logs, and let a future pass swap
 * the input for a picker once the backend wire is up.
 *
 * All state is local to the modal until the user clicks `保存`; saving
 * calls `updateWeChatIngestConfig` and reports back to the parent via
 * `onSaved(saved)` so the parent can invalidate its query cache.
 *
 * TODO(worker-a): replace the inline `updateWeChatIngestConfig` stub +
 * `WeChatIngestConfig` type with the real exports from `@/lib/tauri`
 * once M5 contract lands. The shape is already aligned with the spec.
 */

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FailureBanner } from "@/components/ui/failure-banner";
import { cn } from "@/lib/utils";

import {
  updateWeChatIngestConfig,
  type WeChatIngestConfig,
} from "@/features/wechat/health-state";

export interface GroupScopeModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Current (server-side) config — used to seed the draft. */
  config: WeChatIngestConfig;
  /** Called after a successful save with the server's acknowledged config. */
  onSaved: (saved: WeChatIngestConfig) => void;
}

export function GroupScopeModal({
  open,
  onOpenChange,
  config,
  onSaved,
}: GroupScopeModalProps) {
  const [draftMode, setDraftMode] = useState<WeChatIngestConfig["enabled_mode"]>(
    config.enabled_mode,
  );
  const [draftIds, setDraftIds] = useState<string[]>(
    [...config.enabled_group_ids],
  );
  const [newIdInput, setNewIdInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset the draft whenever the modal re-opens so stale edits from a
  // previous session don't leak into the new view. The config object
  // identity is stable enough across refetches that this doesn't thrash.
  useEffect(() => {
    if (open) {
      setDraftMode(config.enabled_mode);
      setDraftIds([...config.enabled_group_ids]);
      setNewIdInput("");
      setSaveError(null);
    }
  }, [open, config]);

  const handleAddId = () => {
    const trimmed = newIdInput.trim();
    if (trimmed.length === 0) return;
    // Silently de-dupe so the user can't get into a bad state where the
    // same group is listed twice.
    if (!draftIds.includes(trimmed)) {
      setDraftIds((prev) => [...prev, trimmed]);
    }
    setNewIdInput("");
  };

  const handleRemoveId = (id: string) => {
    setDraftIds((prev) => prev.filter((x) => x !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateWeChatIngestConfig({
        enabled_mode: draftMode,
        enabled_group_ids: draftMode === "whitelist" ? draftIds : [],
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>配置自动入库群组</DialogTitle>
          <DialogDescription>
            选择哪些微信群的消息会被自动写入 <code>~/.clawwiki/raw/</code>。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Mode toggle */}
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-foreground">入库模式</div>
            <div className="flex flex-col gap-2">
              <ModeRadio
                checked={draftMode === "all"}
                onSelect={() => setDraftMode("all")}
                label="全部群组"
                hint="所有群消息都会自动入库。"
              />
              <ModeRadio
                checked={draftMode === "whitelist"}
                onSelect={() => setDraftMode("whitelist")}
                label="指定群组（白名单）"
                hint="仅列表中的群会被入库。"
              />
            </div>
          </div>

          {/* Whitelist panel */}
          {draftMode === "whitelist" ? (
            <div className="space-y-2 rounded-md border border-border/50 bg-muted/5 p-3">
              <div className="text-[12px] font-medium text-foreground">
                启用的群 group_id
              </div>

              {draftIds.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {draftIds.map((id) => (
                    <li
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                    >
                      {id}
                      <button
                        type="button"
                        aria-label={`移除 ${id}`}
                        onClick={() => handleRemoveId(id)}
                        className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  暂未添加任何群。白名单为空时，不会有群消息入库。
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={newIdInput}
                  onChange={(e) => setNewIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddId();
                    }
                  }}
                  placeholder="手动输入 group_id，例如 12345@chatroom"
                  className="h-8 text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddId}
                  disabled={newIdInput.trim().length === 0}
                >
                  添加
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground/70">
                注意：MVP 仅支持手工输入 group_id，后续可从日志中识别。
              </p>
            </div>
          ) : null}

          {saveError ? (
            <FailureBanner
              severity="error"
              title="保存失败"
              description="配置未能写入，请稍后重试或检查桌面端日志。"
              technicalDetail={saveError}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeRadio({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
        checked
          ? "border-primary/60 bg-primary/5"
          : "border-border/60 bg-background hover:bg-accent/30",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-border",
        )}
      >
        {checked ? (
          <span className="inline-block size-1.5 rounded-full bg-primary" />
        ) : null}
      </span>
      <span>
        <span className="block text-[13px] font-medium text-foreground">
          {label}
        </span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
