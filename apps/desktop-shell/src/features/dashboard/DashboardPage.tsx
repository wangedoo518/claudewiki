/**
 * Dashboard · 你的外脑主页 (wireframes.html §01)
 *
 * S3 real implementation. The canonical §5 wireframe shows six
 * regions: logo strip, today's ingest count, broker pool size,
 * maintainer "pages touched today", pending Inbox, and a QuickAsk
 * composer. S3 wires the first four to live data; QuickAsk is
 * reduced to a "Start a conversation" button that jumps to `/ask`
 * (MVP — the full inline composer lands after S4 when the Ask
 * runtime supports "one-shot sessions" as described in D19).
 *
 * Data sources:
 *   GET /api/wiki/raw             — total ingest count + today's new
 *   GET /api/broker/status         — pool size + requests today
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
  Inbox as InboxIcon,
  ArrowRight,
} from "lucide-react";
import { listRawEntries } from "@/features/ingest/persist";
import { getBrokerStatus } from "@/features/settings/api/client";

const dashboardKeys = {
  raw: () => ["wiki", "raw", "list"] as const,
  broker: () => ["broker", "status"] as const,
};

export function DashboardPage() {
  const rawQuery = useQuery({
    queryKey: dashboardKeys.raw(),
    queryFn: () => listRawEntries(),
    staleTime: 15_000,
  });

  const brokerQuery = useQuery({
    queryKey: dashboardKeys.broker(),
    queryFn: () => getBrokerStatus(),
    staleTime: 15_000,
  });

  // Derive "today's new ingests" on the client so we don't need a
  // dedicated backend endpoint during S3. `entry.date` is the
  // ISO `YYYY-MM-DD` from the filename; comparing against the
  // local-time today is fine because ingests happen on the same
  // machine as the frontend.
  const todayDate = formatLocalDate(new Date());
  const rawEntries = rawQuery.data?.entries ?? [];
  const totalIngests = rawEntries.length;
  const todaysIngests = rawEntries.filter((e) => e.date === todayDate).length;

  const brokerStatus = brokerQuery.data;
  const brokerError =
    brokerQuery.error instanceof Error ? brokerQuery.error.message : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Hero */}
      <section className="border-b border-border/50 px-8 py-6">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl">📊</span>
          <h1
            className="text-head font-semibold text-foreground"
            style={{ fontFamily: "var(--font-serif, Lora, serif)" }}
          >
            Dashboard · 你的外脑主页
          </h1>
        </div>
        <p className="mt-1 text-label text-muted-foreground">
          我的外脑今天长了多少 — 粘贴 / 转发一份新素材，微信漏斗自动进 Raw Library · 维护任务进 Inbox 等你审阅
        </p>
      </section>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-3 px-8 py-5 md:grid-cols-4">
        <StatCard
          icon={FileStack}
          label="Today's ingests"
          value={rawQuery.isLoading ? "…" : String(todaysIngests)}
          hint={`of ${totalIngests} total`}
          tint="var(--color-success)"
          link="/raw"
        />
        <StatCard
          icon={ServerCog}
          label="Codex pool"
          value={
            brokerQuery.isLoading
              ? "…"
              : brokerStatus
                ? String(brokerStatus.pool_size)
                : "—"
          }
          hint={
            brokerError
              ? "broker unreachable"
              : brokerStatus
                ? `${brokerStatus.fresh_count} fresh`
                : "connecting…"
          }
          tint={brokerError ? "var(--color-error)" : "var(--claude-blue)"}
          link="/settings"
        />
        <StatCard
          icon={Brain}
          label="Pages maintained"
          value="—"
          hint="wiki_maintainer lands in S4"
          tint="var(--muted-foreground)"
        />
        <StatCard
          icon={InboxIcon}
          label="Pending review"
          value="—"
          hint="inbox lands in S4"
          tint="var(--muted-foreground)"
          link="/inbox"
        />
      </section>

      {/* QuickAsk CTA */}
      <section className="px-8 py-2">
        <div className="rounded-lg border border-border bg-muted/10 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-0.5 flex items-center gap-2 text-body font-semibold text-foreground">
                <MessageCircle
                  className="size-4"
                  style={{ color: "var(--claude-orange)" }}
                />
                Ask your external brain
              </div>
              <p className="text-caption text-muted-foreground">
                Jump into a conversation with Codex over your raw entries.
                Mentions + @raw/ references land in S3 as CCD soul ① + ②.
              </p>
            </div>
            <Link
              to="/ask"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open Ask
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Recent raw entries */}
      <section className="min-h-0 flex-1 px-8 pb-6 pt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-subhead font-semibold text-foreground">
            Recent raw entries
          </h2>
          <Link
            to="/raw"
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        <RecentEntries
          isLoading={rawQuery.isLoading}
          error={rawQuery.error}
          entries={rawEntries.slice(-5).reverse()}
        />
      </section>
    </div>
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
    <div className="h-full rounded-lg border border-border bg-muted/10 px-4 py-3 transition-colors group-hover:bg-muted/20">
      <div className="mb-1.5 flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon className="size-3" style={tint ? { color: tint } : undefined} />
        {label}
      </div>
      <div
        className="text-head font-semibold tabular-nums leading-none"
        style={tint ? { color: tint } : { color: "var(--color-foreground)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 truncate text-caption text-muted-foreground/70">
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
        Loading recent entries…
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
        Failed to load recent entries: {error.message}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border/50 bg-muted/10 px-4 py-6 text-center text-caption text-muted-foreground">
        No raw entries yet.{" "}
        <Link to="/raw" className="text-primary hover:underline">
          Paste your first one →
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border bg-muted/5">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            to="/raw"
            className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-muted/20"
          >
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="shrink-0 font-mono text-caption text-muted-foreground">
                #{String(entry.id).padStart(5, "0")}
              </span>
              <span className="truncate text-body-sm font-medium text-foreground">
                {entry.slug}
              </span>
              <span className="shrink-0 rounded-sm bg-muted/40 px-1 text-caption text-muted-foreground">
                {entry.source}
              </span>
            </div>
            <div className="shrink-0 text-caption text-muted-foreground">
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
