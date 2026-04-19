/**
 * M5 sprint — top-of-page bridge health summary for `WeChatBridgePage`.
 *
 * Renders a compact single/dual-row summary of the iLink + kefu channels,
 * with the severity of each row dictated by `deriveHealth`. The mapping
 * between state and R1 primitive is:
 *
 *   active       → `Badge` + "上次消息 N 前 / 上次入库 M 前"
 *   idle         → compact `EmptyState` (clock icon) + 运行正常 reassurance
 *   degraded     → `FailureBanner` severity=warning (consecutive failures)
 *   disconnected → `FailureBanner` severity=error + `重连` CTA stub
 *   error        → `FailureBanner` severity=error + technical detail,
 *                  dismissible so the banner doesn't block re-login flows
 *
 * Each channel row is rendered by `ChannelHealthRow`. The iLink channel is
 * the primary focus — kefu is always rendered, even when disconnected, so
 * ops can see at-a-glance that channel B is the reason traffic dropped
 * (the MVP never runs kefu by default; once it does this component
 * doesn't need to change).
 */

import { useMemo } from "react";
import { Clock } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { FailureBanner } from "@/components/ui/failure-banner";

import {
  channelLabel,
  deriveHealth,
  formatRelativeTime,
  type BridgeHealth,
  type ChannelHealthLike,
} from "@/features/wechat/health-state";
import { HealthStatusBadge } from "@/features/wechat/components/HealthStatusBadge";

export interface BridgeHealthHeaderProps {
  ilink: ChannelHealthLike;
  kefu: ChannelHealthLike;
  /** Parent-owned dismiss flag for the `error` banner. Optional — when
   *  absent the banner stays sticky. */
  onErrorDismiss?: (channel: "ilink" | "kefu") => void;
  /** Stub hook for the `disconnected` recovery CTA. Clicking the button
   *  currently just fires this; the reconnection flow itself still lives
   *  in the QR login section below the header. */
  onReconnect?: (channel: "ilink" | "kefu") => void;
  /** Indicates parent has already dismissed the error banner for a
   *  channel so we render the quieter active/idle surface instead. */
  dismissedErrorChannels?: ReadonlySet<"ilink" | "kefu">;
}

export function BridgeHealthHeader({
  ilink,
  kefu,
  onErrorDismiss,
  onReconnect,
  dismissedErrorChannels,
}: BridgeHealthHeaderProps) {
  // `nowMs` pinned for the whole render so both rows agree on "now" and
  // the relative-time strings don't drift during a single pass. Memoised
  // on the two channel objects so parent polling triggers a fresh pass.
  const nowMs = useMemo(() => Date.now(), [ilink, kefu]);

  return (
    <section className="border-b border-border/50 px-6 py-4">
      <h2
        className="mb-2 uppercase tracking-widest text-muted-foreground/60"
        style={{ fontSize: 11 }}
      >
        Bridge health
      </h2>
      <div className="space-y-2">
        <ChannelHealthRow
          channel={ilink}
          nowMs={nowMs}
          onErrorDismiss={onErrorDismiss}
          onReconnect={onReconnect}
          dismissedError={dismissedErrorChannels?.has("ilink") ?? false}
        />
        <ChannelHealthRow
          channel={kefu}
          nowMs={nowMs}
          onErrorDismiss={onErrorDismiss}
          onReconnect={onReconnect}
          dismissedError={dismissedErrorChannels?.has("kefu") ?? false}
          mutedWhenDisconnected
        />
      </div>
    </section>
  );
}

interface ChannelHealthRowProps {
  channel: ChannelHealthLike;
  nowMs: number;
  onErrorDismiss?: (channel: "ilink" | "kefu") => void;
  onReconnect?: (channel: "ilink" | "kefu") => void;
  dismissedError?: boolean;
  /**
   * kefu row renders as muted text (not a loud error banner) when it's
   * simply disconnected — MVP ships without kefu running by default so a
   * red banner would be misleading. iLink still uses the full banner.
   */
  mutedWhenDisconnected?: boolean;
}

function ChannelHealthRow({
  channel,
  nowMs,
  onErrorDismiss,
  onReconnect,
  dismissedError,
  mutedWhenDisconnected,
}: ChannelHealthRowProps) {
  const health = deriveHealth(channel, nowMs);
  const label = channelLabel(channel.channel);
  const effectiveHealth: BridgeHealth =
    health === "error" && dismissedError ? "active" : health;

  if (effectiveHealth === "active") {
    return (
      <ActiveRow channel={channel} label={label} nowMs={nowMs} />
    );
  }

  if (effectiveHealth === "idle") {
    return <IdleRow channel={channel} label={label} nowMs={nowMs} />;
  }

  if (effectiveHealth === "degraded") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <HealthStatusBadge health="degraded" />
          <span className="text-[12px] text-foreground">{label}</span>
        </div>
        <FailureBanner
          severity="warning"
          title={`${label} 桥连续失败 ${channel.consecutive_failures} 次`}
          description="后端仍在运行但最近几次轮询失败，入库可能延迟。可等待自动恢复，或在下方排查账号。"
          technicalDetail={channel.last_error ?? undefined}
        />
      </div>
    );
  }

  if (effectiveHealth === "disconnected") {
    if (mutedWhenDisconnected) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <HealthStatusBadge health="disconnected" />
          <span className="text-[12px] text-muted-foreground">
            {label} · 未启动
          </span>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <HealthStatusBadge health="disconnected" />
          <span className="text-[12px] text-foreground">{label}</span>
        </div>
        <FailureBanner
          severity="error"
          title={`${label} 桥已断开`}
          description="后端未在运行，新的消息不会入库。请重新扫码登录或启动监听。"
          actions={
            onReconnect
              ? [
                  {
                    label: "重连",
                    variant: "primary",
                    onClick: () => onReconnect(channel.channel),
                  },
                ]
              : undefined
          }
        />
      </div>
    );
  }

  // error
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <HealthStatusBadge health="error" />
        <span className="text-[12px] text-foreground">{label}</span>
      </div>
      <FailureBanner
        severity="error"
        title={`${label} 桥异常`}
        description="后端报告无法继续处理消息。请查看技术细节排查，再重新启动。"
        technicalDetail={channel.last_error ?? undefined}
        dismissible={Boolean(onErrorDismiss)}
        onDismiss={onErrorDismiss ? () => onErrorDismiss(channel.channel) : undefined}
      />
    </div>
  );
}

function ActiveRow({
  channel,
  label,
  nowMs,
}: {
  channel: ChannelHealthLike;
  label: string;
  nowMs: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <HealthStatusBadge health="active" />
      <span className="text-[12px] text-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">
        上次消息 {formatRelativeTime(channel.last_inbound_unix_ms, nowMs)}
        {" · "}
        上次入库 {formatRelativeTime(channel.last_ingest_unix_ms, nowMs)}
      </span>
      {channel.processed_msg_count > 0 ? (
        <span className="text-[11px] text-muted-foreground/70">
          累计 {channel.processed_msg_count} 条
        </span>
      ) : null}
    </div>
  );
}

function IdleRow({
  channel,
  label,
  nowMs,
}: {
  channel: ChannelHealthLike;
  label: string;
  nowMs: number;
}) {
  return (
    <div className="rounded-md border border-dashed border-border/40">
      <EmptyState
        size="compact"
        icon={Clock}
        title={`${label} 桥空闲`}
        description={
          <>
            上次消息是
            <span className="mx-1 font-medium text-foreground">
              {formatRelativeTime(channel.last_inbound_unix_ms, nowMs)}
            </span>
            · 运行正常
          </>
        }
      />
    </div>
  );
}
