/**
 * Q2 sprint — `DuplicateGuardDialog` is Layer 2 of the duplicate-concept
 * guard. It pops as a modal confirmation when the user clicks "执行"
 * on a `create_new` maintain action while the top candidate score is
 * still ≥ 75 AND the Layer 1 ambient banner has not been dismissed.
 *
 * Two-CTA footer mirrors the two likely exits:
 *   - 返回修改  → close + flip action to `update_existing` + seed slug
 *   - 继续新建  → close + proceed (danger variant; user knowingly creates
 *                 a duplicate)
 *
 * Tone rules from the spec ("发现可能 / 建议 / 是否", never 禁止/警告/
 * 错误) are followed in the copy. The danger variant on the proceed
 * button is purely visual — we do not *block* the user.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TargetCandidate } from "@/lib/tauri";

export interface DuplicateGuardDialogProps {
  /** When true, the dialog is mounted and visible. */
  open: boolean;
  /** Radix onOpenChange — propagates close-via-ESC / overlay clicks. */
  onOpenChange: (next: boolean) => void;
  /** Top-1 candidate powering the copy. */
  candidate: TargetCandidate;
  /** User chose "返回修改" — parent flips to update + seeds slug. */
  onSwitchToUpdate: () => void;
  /** User chose "继续新建" — parent proceeds with the create flow. */
  onProceed: () => void;
}

export function DuplicateGuardDialog({
  open,
  onOpenChange,
  candidate,
  onSwitchToUpdate,
  onProceed,
}: DuplicateGuardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认新建？</DialogTitle>
          <DialogDescription>
            已发现相似内容（相似度 {candidate.score}%）。确定要新建独立页面吗？
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
          <div
            className="flex items-center gap-2 font-mono text-muted-foreground/80"
            style={{ fontSize: 11 }}
          >
            <span>相近页：</span>
            <span className="text-foreground/90">{candidate.slug}</span>
          </div>
          <div
            className="mt-0.5 text-foreground"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {candidate.title}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onSwitchToUpdate();
              onOpenChange(false);
            }}
          >
            返回修改
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onProceed();
              onOpenChange(false);
            }}
          >
            继续新建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
