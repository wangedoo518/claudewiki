/**
 * MaintainActionRadio — Section 2 (Maintain) decision widget.
 *
 * Three radio options driven by the `MaintainAction` union
 * (`create_new` / `update_existing` / `reject`), surfaced on the
 * wire as the `maintain_action` field on inbox entries and
 * `action` on the `/maintain` request body. Selecting
 * `update_existing` reveals a target-page picker slot (consumed by
 * Worker C's `WikiPageSearchField`); selecting `reject` reveals a
 * rejection-reason textarea with a 4-char minimum.
 *
 * The component is fully controlled: the parent owns `value`,
 * `targetPageSlug`, and `rejectionReason`. This keeps the workbench
 * submission logic in the parent where it can be gated on validation
 * before firing `maintainInboxEntry()`.
 */

import type { ReactNode } from "react";
import type { MaintainAction } from "@/features/ingest/types";

/**
 * Ordered list of every `MaintainAction` — used by the radio group
 * and by verification tests that want to exhaustively iterate over
 * the vocabulary. Adding a variant here will trigger a missing-case
 * compile error in any switch that exhausts over `MaintainAction`.
 */
export const MAINTAIN_ACTIONS: readonly MaintainAction[] = [
  "create_new",
  "update_existing",
  "reject",
] as const;

export interface MaintainActionRadioProps {
  value: MaintainAction;
  onValueChange: (next: MaintainAction) => void;

  /** Current target slug when `update_existing` is selected. */
  targetPageSlug: string | null;
  /** Rejection reason text when `reject` is selected. */
  rejectionReason: string;
  onRejectionReasonChange: (next: string) => void;

  /**
   * Render prop slot for the wiki-page search field (Worker C). When
   * undefined, a lightweight fallback placeholder is rendered so the
   * rest of the workbench stays usable pre-integration.
   */
  wikiPageSearchSlot?: ReactNode;

  /** Disables all inputs — used when a maintain call is in flight. */
  disabled?: boolean;
}

export function MaintainActionRadio({
  value,
  onValueChange,
  targetPageSlug,
  rejectionReason,
  onRejectionReasonChange,
  wikiPageSearchSlot,
  disabled = false,
}: MaintainActionRadioProps) {
  const missingChars = Math.max(0, 4 - rejectionReason.trim().length);
  return (
    <div className="space-y-3">
      <RadioOption
        id="maintain-action-create-new"
        checked={value === "create_new"}
        onSelect={() => onValueChange("create_new")}
        disabled={disabled}
        label="新建知识页"
        sublabel="Create New"
        hint="让维护器从这条素材生成一个全新的 wiki 页面（默认）。"
      />
      <RadioOption
        id="maintain-action-update-existing"
        checked={value === "update_existing"}
        onSelect={() => onValueChange("update_existing")}
        disabled={disabled}
        label="合并到已有页"
        sublabel="Update Existing"
        hint="把这条素材追加/合并到指定 wiki 页面。需要选择目标页。"
      >
        {value === "update_existing" && (
          <div className="mt-2 space-y-1">
            {wikiPageSearchSlot ?? (
              <div data-slot="wiki-page-search-field-slot" className="rounded-md border border-dashed border-border/50 px-3 py-2 text-muted-foreground/60" style={{ fontSize: 11 }}>
                页面搜索组件待接入（Worker C 提供 WikiPageSearchField）
              </div>
            )}
            {targetPageSlug ? (
              <div className="text-muted-foreground/80" style={{ fontSize: 11 }}>
                已选目标页：<span className="ml-1 font-mono text-foreground/90">{targetPageSlug}</span>
              </div>
            ) : (
              <div className="text-muted-foreground/60" style={{ fontSize: 11 }}>
                尚未选择目标页 — 请在上方搜索框中挑一个 wiki 页面。
              </div>
            )}
          </div>
        )}
      </RadioOption>
      <RadioOption
        id="maintain-action-reject"
        checked={value === "reject"}
        onSelect={() => onValueChange("reject")}
        disabled={disabled}
        label="拒绝该条"
        sublabel="Reject"
        hint="放弃这条素材并记录拒绝原因（便于审计与日后复用判断）。"
      >
        {value === "reject" && (
          <div className="mt-2 space-y-1">
            <label htmlFor="maintain-rejection-reason" className="block text-muted-foreground/80" style={{ fontSize: 11 }}>
              拒绝原因 <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <textarea
              id="maintain-rejection-reason"
              value={rejectionReason}
              onChange={(ev) => onRejectionReasonChange(ev.target.value)}
              minLength={4}
              rows={3}
              disabled={disabled}
              placeholder="至少 4 个字符 — 例如：与现有 wiki 内容重复、来源不可靠、内容质量差…"
              className="w-full resize-y rounded-md border border-border/50 bg-transparent px-2 py-1.5 font-mono text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontSize: 12, lineHeight: 1.5 }}
            />
            <div className="flex items-center justify-between text-muted-foreground/50" style={{ fontSize: 10 }}>
              <span>{missingChars > 0 ? `还需 ${missingChars} 个字符` : "已达最小长度"}</span>
              <span>{rejectionReason.length} 字</span>
            </div>
          </div>
        )}
      </RadioOption>
    </div>
  );
}

/* ── Internal radio row ─────────────────────────────────────────── */

function RadioOption({
  id,
  checked,
  onSelect,
  disabled,
  label,
  sublabel,
  hint,
  children,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
  label: string;
  sublabel: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={
        "block cursor-pointer rounded-md border px-3 py-2.5 transition-colors " +
        (checked ? "border-primary/50 bg-primary/5" : "border-border/40 hover:border-border hover:bg-accent/30") +
        (disabled ? " opacity-60 pointer-events-none" : "")
      }
    >
      <div className="flex items-start gap-2">
        <input
          id={id}
          name="maintain-action"
          type="radio"
          checked={checked}
          onChange={() => onSelect()}
          disabled={disabled}
          className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-primary"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
            <span className="font-mono text-muted-foreground/50" style={{ fontSize: 10 }}>{sublabel}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground/70" style={{ fontSize: 11, lineHeight: 1.5 }}>{hint}</p>
          {children}
        </div>
      </div>
    </label>
  );
}
