import { PageStub } from "@/components/PageStub";

/**
 * Dashboard · 你的外脑主页 (wireframes.html §01)
 *
 * Final surface will show:
 * - Today's ingest count + pages maintained + pending Inbox items
 * - QuickAsk composer (extracted from CCD InputBar, see §6.1)
 * - Graph of this week's new nodes
 *
 * Implemented in S3 (CCD extraction sprint).
 */
export function DashboardPage() {
  return (
    <PageStub
      icon="📊"
      title="Dashboard · 你的外脑主页"
      tagline="我的外脑今天长了多少 — ingest 统计 · QuickAsk 快速提问 · 维护摘要 · 待审阅任务"
      sprint="S3"
    />
  );
}
