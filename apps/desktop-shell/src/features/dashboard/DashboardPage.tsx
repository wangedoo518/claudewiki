/**
 * Dashboard · 你的外脑主页
 *
 * S3 real implementation. The canonical §5 wireframe shows six
 * regions: logo strip, today's ingest count, optional runtime-status
 * card, maintainer "pages touched today", pending Inbox, and a QuickAsk
 * composer. S3 wires the first four to live data; QuickAsk is
 * reduced to a "Start a conversation" button that jumps to `/ask`
 * (MVP — the full inline composer lands after S4 when the Ask
 * runtime supports "one-shot sessions" as described in D19).
 *
 * Data sources:
 *   GET /api/wiki/raw             — total ingest count + today's new
 *   GET /api/desktop/bootstrap    — feature capabilities
 *   GET /api/broker/status        — private-cloud pool stats (optional)
 *
 * The page is intentionally LIGHT on logic. Anything that looks like
 * a real statistic (maintenance digest, inbox unread, etc.) lights
 * up in S4 once the maintainer + Inbox sprints add the backend
 * endpoints. Until then those cards render a gentle "—" so users
 * aren't misled by zero values that mean "unknown" rather than "none".
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  MessageCircle,
  FileStack,
  ServerCog,
  Brain,
  BookOpen,
  Link2,
  Inbox as InboxIcon,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { listRawEntries, listInboxEntries, getWikiStats, getAbsorbLog, getPatrolReport, triggerPatrol } from "@/features/ingest/persist";
// useSettingsStore / useWikiTabStore available for future Quick Action routing.
import { getBootstrap } from "@/features/settings/api/client";
import { getBrokerStatus } from "@/features/settings/api/private-cloud";
import { getKefuStatus } from "@/features/settings/api/client";
import { cn } from "@/lib/utils";

const dashboardKeys = {
  bootstrap: () => ["desktop", "bootstrap"] as const,
  raw: () => ["wiki", "raw", "list"] as const,
  broker: () => ["broker", "status"] as const,
  inbox: () => ["wiki", "inbox", "list"] as const,
  wikiPages: () => ["wiki", "pages", "list"] as const,
  stats: () => ["wiki", "stats"] as const,
  // DS1-D: WeChat Kefu status — summarized on Dashboard so the user
  // sees at a glance whether their 外脑 intake channel is ready.
  wechatKefu: () => ["wechat-kefu", "status"] as const,
};

export function DashboardPage() {
  const bootstrapQuery = useQuery({
    queryKey: dashboardKeys.bootstrap(),
    queryFn: getBootstrap,
    staleTime: 60_000,
  });
  const rawQuery = useQuery({
    queryKey: dashboardKeys.raw(),
    queryFn: () => listRawEntries(),
    staleTime: 15_000,
  });

  const privateCloudEnabled =
    bootstrapQuery.data?.private_cloud_enabled === true;

  const brokerQuery = useQuery({
    queryKey: dashboardKeys.broker(),
    queryFn: () => getBrokerStatus(),
    staleTime: 15_000,
    enabled: privateCloudEnabled,
  });

  const inboxQuery = useQuery({
    queryKey: dashboardKeys.inbox(),
    queryFn: () => listInboxEntries(),
    staleTime: 15_000,
  });

  // wikiQuery removed in v2 — stat cards now use statsQuery.data.wiki_count.

  // v2: WikiStats from the new /api/wiki/stats endpoint.
  const statsQuery = useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => getWikiStats(),
    staleTime: 15_000,
  });

  // v2: ActivityFeed + PatrolSummary data.
  const absorbLogQuery = useQuery({
    queryKey: [...dashboardKeys.stats(), "absorb-log"],
    queryFn: () => getAbsorbLog(10),
    staleTime: 15_000,
  });
  const patrolQuery = useQuery({
    queryKey: [...dashboardKeys.stats(), "patrol-report"],
    queryFn: () => getPatrolReport(),
    staleTime: 60_000,
  });

  // DS1-D: lightweight WeChat status summary for the default layer.
  // Graceful degradation: if the endpoint is unreachable or returns an
  // error the summary chip just reads "未连接" instead of exploding.
  const kefuStatusQuery = useQuery({
    queryKey: dashboardKeys.wechatKefu(),
    queryFn: () => getKefuStatus(),
    staleTime: 30_000,
    retry: false,
  });

  // Derive "today's new ingests" on the client so we don't need a
  // dedicated backend endpoint during S3. `entry.date` is the
  // ISO `YYYY-MM-DD` from the filename; comparing against the
  // local-time today is fine because ingests happen on the same
  // machine as the frontend.
  const todayDate = formatLocalDate(new Date());
  const rawEntries = rawQuery.data?.entries ?? [];
  const totalIngests = rawEntries.length;
  const todaysIngests = statsQuery.data?.today_ingest_count
    ?? rawEntries.filter((e) => e.date === todayDate).length;

  // DS1-D — we no longer surface broker pool_size at the default layer,
  // so only the error signal is kept (for the inline FYI banner below).
  // `brokerQuery.data` is still held by React Query for any power-user
  // view that wants to read it via useQuery(..., { queryKey: broker }).
  const brokerError =
    privateCloudEnabled && brokerQuery.error instanceof Error
      ? brokerQuery.error.message
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hero — 07-dashboard.md §6.1 */}
      <section className="px-8 py-6">
        <h1 className="text-3xl font-medium text-foreground">
          你的外脑
        </h1>
        <p className="mt-1 text-muted-foreground/60" style={{ fontSize: 11 }}>
          {statsQuery.data
            ? `${statsQuery.data.wiki_count} 篇知识页面 · 知识速率 ${statsQuery.data.knowledge_velocity.toFixed(1)} 页/天`
            : "加载中..."}
        </p>
        {/* v3 visual anchor — warm gradient divider (Claude chapter-section feel) */}
        <div className="section-divider-warm mt-4" />
      </section>

      {/* DS1-D · 快速开始 — 4 cards, user-task oriented.
          Sits above the stats so a brand-new user's first eye-line is
          "what can I do?" rather than "what does this dashboard measure?".
          Each card is a link to the corresponding primary route so
          keyboard users can Tab through them, and every card carries a
          plain-Chinese subtitle that matches the v2 design kit's
          SkillCard treatment. */}
      <section className="px-8 py-3">
        <h2
          className="mb-3 uppercase tracking-widest text-muted-foreground/60"
          style={{ fontSize: 11 }}
        >
          快速开始
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickStartCard
            icon={MessageCircle}
            title="问一个问题"
            sub="让 AI 基于你的内容回答"
            to="/ask"
            tint="var(--claude-orange)"
          />
          <QuickStartCard
            icon={InboxIcon}
            title="查看待整理"
            sub={
              inboxQuery.data?.pending_count
                ? `${inboxQuery.data.pending_count} 条待你审阅`
                : "还没有待处理的提议"
            }
            to="/inbox"
            tint="var(--color-warning)"
          />
          <QuickStartCard
            icon={BookOpen}
            title="打开知识库"
            sub="浏览页面、关系图、素材"
            to="/wiki"
            tint="var(--deeptutor-purple, var(--agent-purple))"
          />
          <QuickStartCard
            icon={Link2}
            title="连接微信"
            sub={
              kefuStatusQuery.data?.configured
                ? kefuStatusQuery.data.account_created
                  ? "已配置，可转发内容"
                  : "已配置，未创建账号"
                : "尚未连接"
            }
            to="/wechat"
            tint="var(--color-success)"
          />
        </div>
      </section>

      {/* Stat cards — DS1-D simplified.
          `Codex 令牌池` got dropped: it exposes runtime terminology at
          the default layer and is irrelevant to a普通用户. Advanced
          users still find broker status via `/settings → 高级`.
          Remaining cards answer "今天增长了多少 / 本周新增 / 待审阅" —
          the three questions the 工作起点 actually needs. */}
      <section
        className={cn(
          "grid grid-cols-1 gap-3 px-8 py-4",
          "md:grid-cols-3"
        )}
      >
        <StatCard
          icon={FileStack}
          label="今日入库"
          value={rawQuery.isLoading ? "…" : String(todaysIngests)}
          hint={`共 ${totalIngests} 条`}
          tint="var(--color-success)"
          link="/wiki?view=raw"
        />
        <StatCard
          icon={Brain}
          label="本周新增"
          value={statsQuery.isLoading ? "…" : String(statsQuery.data?.week_new_pages ?? 0)}
          hint={`共 ${statsQuery.data?.wiki_count ?? 0} 个知识页面`}
          tint="var(--deeptutor-purple, var(--agent-purple))"
          link="/wiki"
        />
        <StatCard
          icon={InboxIcon}
          label="待审阅"
          value={inboxQuery.isLoading ? "…" : String(inboxQuery.data?.pending_count ?? 0)}
          hint={inboxQuery.error ? "加载失败" : `共 ${inboxQuery.data?.total_count ?? 0} 条任务`}
          tint={inboxQuery.error ? "var(--color-error)" : "var(--color-warning)"}
          link="/inbox"
        />
      </section>

      {/* Activity Feed — 07-dashboard.md §6.3 */}
      <section className="px-8 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="uppercase tracking-widest text-muted-foreground/60" style={{ fontSize: 11 }}>
            最近动态
          </h2>
          <Link
            to="/raw"
            className="text-muted-foreground/50 hover:text-foreground"
            style={{ fontSize: 11 }}
          >
            查看全部 →
          </Link>
        </div>
        {absorbLogQuery.data?.entries && absorbLogQuery.data.entries.length > 0 ? (
          <div className="space-y-1.5">
            {absorbLogQuery.data.entries.slice(0, 8).map((entry, i) => (
              <div
                key={`${entry.entry_id}-${i}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-accent/50 transition-colors"
              >
                <span className="text-muted-foreground/60 w-12 shrink-0 text-[11px]">
                  {entry.timestamp.slice(11, 16)}
                </span>
                <span className={
                  entry.action === "create"
                    ? "text-[var(--deeptutor-ok,#3F8F5E)]"
                    : entry.action === "update"
                      ? "text-[var(--color-primary)]"
                      : "text-muted-foreground"
                }>
                  {entry.action === "create" ? "新建" : entry.action === "update" ? "更新" : "跳过"}
                </span>
                <span className="flex-1 truncate text-foreground">
                  {entry.page_title ?? entry.page_slug ?? `raw #${entry.entry_id}`}
                </span>
                {entry.page_category && (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                    {entry.page_category}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <RecentEntries
            isLoading={rawQuery.isLoading}
            error={rawQuery.error}
            entries={rawEntries.slice(-5).reverse()}
          />
        )}
      </section>

      {/* Patrol Summary — DS1-D downgraded from default layer to
          `<details>` collapsible. The list of "schema 违规 / 孤儿页 /
          stub / 过期 / 超长" is maintainer-facing terminology —普通
          用户打开首页不应该先看到这 5 个术语。默认折叠；需要的人一键
          展开。 */}
      <details className="group px-8 pb-6">
        <summary className="flex cursor-pointer items-center gap-2 rounded-md border border-border/40 px-4 py-3 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40">
          <Sparkles className="size-3.5" />
          <span className="font-semibold uppercase tracking-widest">
            知识质量巡检
          </span>
          <span className="text-muted-foreground/60">· 高级</span>
          <span className="ml-auto text-muted-foreground/60 group-open:hidden">
            展开
          </span>
          <span className="ml-auto hidden text-muted-foreground/60 group-open:inline">
            收起
          </span>
        </summary>
        <div className="mt-2 rounded-md border border-border/40 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              知识质量
            </h3>
            <button
              onClick={() => triggerPatrol().then(() => patrolQuery.refetch())}
              className="rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10 transition-colors"
            >
              立即巡检
            </button>
          </div>
          {patrolQuery.data ? (
            <div className="flex flex-wrap gap-2">
              {patrolQuery.data.summary.schema_violations > 0 && (
                <span className="rounded-full bg-[var(--color-destructive)]/10 px-2 py-0.5 text-[10px] text-[var(--color-destructive)]">
                  {patrolQuery.data.summary.schema_violations} schema 违规
                </span>
              )}
              {patrolQuery.data.summary.orphans > 0 && (
                <span className="rounded-full bg-[var(--deeptutor-warn,#C88B1A)]/10 px-2 py-0.5 text-[10px] text-[var(--deeptutor-warn,#C88B1A)]">
                  {patrolQuery.data.summary.orphans} 孤儿页
                </span>
              )}
              {patrolQuery.data.summary.stubs > 0 && (
                <span className="rounded-full bg-[var(--deeptutor-warn,#C88B1A)]/10 px-2 py-0.5 text-[10px] text-[var(--deeptutor-warn,#C88B1A)]">
                  {patrolQuery.data.summary.stubs} stub
                </span>
              )}
              {patrolQuery.data.summary.stale > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {patrolQuery.data.summary.stale} 过期
                </span>
              )}
              {patrolQuery.data.summary.oversized > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {patrolQuery.data.summary.oversized} 超长
                </span>
              )}
              {Object.values(patrolQuery.data.summary).every((v) => v === 0) && (
                <span className="text-[11px] text-[var(--deeptutor-ok,#3F8F5E)]">
                  全部通过
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/50">
                {patrolQuery.data.checked_at.slice(0, 10)}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/50">
              尚未运行巡检
            </p>
          )}
        </div>
      </details>

      {/* DS1-D: drop the explicit Quick Actions row — 快速开始 row at
          the top already covers 待整理 / 知识库 / 微信接入 with clearer
          copy, and "查看关系图" no longer belongs at the default layer
          (users reach Graph via 知识库 → 关系图 tab). Advanced users
          still have the palette (Ctrl/Cmd+K) for deep-linking. */}
      {/* Private-cloud broker reference — render only when the feature
          is actually enabled AND errored out, as an inline FYI.
          Otherwise the default layer stays free of "Codex 令牌池" jargon. */}
      {privateCloudEnabled && brokerError && (
        <section className="px-8 pb-6">
          <div
            className="rounded-md border px-4 py-2 text-[11px]"
            style={{
              borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--color-error) 4%, transparent)",
              color: "var(--color-error)",
            }}
          >
            <ServerCog className="mr-1 inline size-3 align-[-2px]" />
            私有云代理不可达 · <Link to="/settings" className="underline">打开设置排查 →</Link>
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── DS1-D helpers ─────────────────────────────────────────────── */

/**
 * 快速开始 card — link with a warm Terracotta accent on the icon
 * rail and a two-line label. Visually the warm-ring treatment from the
 * design system; keeps the action obvious without being loud.
 */
function QuickStartCard({
  icon: Icon,
  title,
  sub,
  to,
  tint,
}: {
  icon: typeof MessageCircle;
  title: string;
  sub: string;
  to: string;
  tint?: string;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border bg-card p-4 shadow-warm-ring transition-shadow hover:shadow-warm-ring-hover"
      style={
        tint ? { borderLeft: `3px solid ${tint}` } : undefined
      }
    >
      <div className="flex items-center gap-2 text-foreground">
        <Icon
          className="size-4"
          strokeWidth={1.5}
          style={tint ? { color: tint } : undefined}
        />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
        <ArrowRight
          className="ml-auto size-3.5 opacity-40 transition-opacity group-hover:opacity-80"
          strokeWidth={1.5}
        />
      </div>
      <p className="mt-1.5 text-muted-foreground/80" style={{ fontSize: 11 }}>
        {sub}
      </p>
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tint,
  link,
}: {
  icon: typeof FileStack;
  label: string;
  value: string;
  hint?: string;
  tint?: string;
  link?: string;
}) {
  const body = (
    <div
      className="h-full rounded-xl border bg-card p-6 shadow-warm-ring transition-shadow hover:shadow-warm-ring-hover"
      style={{ borderLeft: `3px solid ${tint ?? "var(--color-border)"}` }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground/60" style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
        <Icon className="size-3" style={tint ? { color: tint } : undefined} />
        {label}
      </div>
      <div
        className="tabular-nums leading-none"
        style={{ fontSize: 18, fontWeight: 600, color: tint ?? "var(--color-foreground)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 truncate text-muted-foreground/50" style={{ fontSize: 11 }}>
          {hint}
        </div>
      )}
    </div>
  );

  if (link) {
    return (
      <Link to={link} className="group block">
        {body}
      </Link>
    );
  }
  return <div className="group">{body}</div>;
}

function RecentEntries({
  isLoading,
  error,
  entries,
}: {
  isLoading: boolean;
  error: Error | null;
  entries: Array<{
    id: number;
    source: string;
    slug: string;
    date: string;
    byte_size: number;
  }>;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="rounded-md border px-3 py-2 text-caption"
        style={{
          borderColor:
            "color-mix(in srgb, var(--color-error) 30%, transparent)",
          backgroundColor:
            "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        加载失败：{error.message}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="px-1 py-6 text-center text-muted-foreground/60" style={{ fontSize: 11 }}>
        还没有素材。{" "}
        <Link to="/raw" className="text-primary hover:underline">
          粘贴第一条 →
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/30">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            to="/raw"
            className="flex items-center justify-between px-1 py-2.5 transition-colors hover:bg-accent/50"
          >
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="shrink-0 font-mono text-muted-foreground/40" style={{ fontSize: 11 }}>
                #{String(entry.id).padStart(5, "0")}
              </span>
              <span className="truncate text-foreground" style={{ fontSize: 14 }}>
                {entry.slug}
              </span>
              <span className="shrink-0 text-muted-foreground/50" style={{ fontSize: 11 }}>
                {entry.source}
              </span>
            </div>
            <div className="shrink-0 text-muted-foreground/40" style={{ fontSize: 11 }}>
              {entry.date} · {entry.byte_size} B
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, "0");
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
