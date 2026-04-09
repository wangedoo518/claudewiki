import { PageStub } from "@/components/PageStub";

/**
 * Inbox · CCD 权限确认 + 任务审阅 (wireframes.html §07, SOUL ③+④)
 *
 * Final surface shows the Maintainer agent's pending writes / new
 * pages / conflicts / stale reviews, with a per-task `MaintainerTaskTree`
 * (extracted from `session-workbench/SubagentPanel`) that lets the
 * user approve/reject each tool call individually.
 *
 * Implemented in S4 (maintainer MVP sprint).
 */
export function InboxPage() {
  return (
    <PageStub
      icon="📨"
      title="Inbox · Maintenance Inbox"
      tagline="CCD 灵魂 ③+④ · Maintainer 提的待审任务 · TaskTree 展开每步 tool call + diff · approve / reject / rollback"
      sprint="S4"
    />
  );
}
