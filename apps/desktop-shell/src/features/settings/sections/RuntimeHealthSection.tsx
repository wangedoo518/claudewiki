import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/desktop/transport";
import {
  getCodexRuntime,
  getKefuStatus,
  listProviders,
  type KefuStatus,
} from "@/api/desktop/settings";
import type {
  DesktopCodexRuntimeResponse,
  DesktopSettingsResponse,
} from "@/api/contracts/desktop";

type HealthLevel = "ok" | "warn" | "error";

interface Captured<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface AvailabilityCheck {
  available?: boolean;
  ok?: boolean;
  installed?: boolean;
  version?: string | null;
  path?: string | null;
  error?: string | null;
}

interface HealthRow {
  key: string;
  label: string;
  detail: string;
  level: HealthLevel;
}

async function capture<T>(fn: () => Promise<T>): Promise<Captured<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadRuntimeHealth(): Promise<HealthRow[]> {
  const [
    healthz,
    settings,
    providers,
    runtime,
    kefu,
    markitdown,
    wechatFetch,
    node,
    opencli,
    chromium,
  ] = await Promise.all([
    capture(() => fetchJson<unknown>("/healthz")),
    capture(() => fetchJson<DesktopSettingsResponse>("/api/desktop/settings")),
    capture(() => listProviders()),
    capture(() => getCodexRuntime()),
    capture(() => getKefuStatus()),
    capture(() => fetchJson<AvailabilityCheck>("/api/desktop/markitdown/check")),
    capture(() => fetchJson<AvailabilityCheck>("/api/desktop/wechat-fetch/check")),
    capture(() => fetchJson<AvailabilityCheck>("/api/desktop/node/check")),
    capture(() => fetchJson<AvailabilityCheck>("/api/desktop/opencli/check")),
    capture(() => fetchJson<AvailabilityCheck>("/api/desktop/chromium/check")),
  ]);

  return [
    providerRow(providers, runtime),
    storageRow(settings),
    wechatRow(kefu, wechatFetch),
    runtimeRow(healthz, runtime),
    toolRow("markitdown", "File conversion", markitdown),
    toolRow("node", "Node runtime", node),
    toolRow("opencli", "OpenCLI bridge", opencli),
    toolRow("chromium", "Chromium browser", chromium),
  ];
}

function providerRow(
  providers: Captured<Awaited<ReturnType<typeof listProviders>>>,
  runtime: Captured<DesktopCodexRuntimeResponse>,
): HealthRow {
  if (!providers.ok) {
    return {
      key: "providers",
      label: "Provider fallback",
      level: "error",
      detail: providers.error ?? "Provider registry unavailable.",
    };
  }
  const count = providers.data?.providers.length ?? 0;
  const active = providers.data?.active ?? runtime.data?.runtime.active_provider_key;
  const runtimeReady =
    runtime.data?.runtime.has_api_key === true ||
    runtime.data?.runtime.has_chatgpt_tokens === true ||
    count > 0;
  return {
    key: "providers",
    label: "Provider fallback",
    level: count > 0 && runtimeReady ? "ok" : "warn",
    detail:
      count > 0
        ? `${count} provider(s), active: ${active ?? "unset"}`
        : "No providers.json fallback configured.",
  };
}

function storageRow(settings: Captured<DesktopSettingsResponse>): HealthRow {
  const projectPath = settings.data?.settings.project_path;
  return {
    key: "storage",
    label: "Storage",
    level: settings.ok && projectPath ? "ok" : "error",
    detail: projectPath ?? settings.error ?? "Desktop settings unavailable.",
  };
}

function wechatRow(
  kefu: Captured<KefuStatus>,
  wechatFetch: Captured<AvailabilityCheck>,
): HealthRow {
  if (!kefu.ok) {
    return {
      key: "wechat",
      label: "WeChat / Kefu",
      level: "warn",
      detail: kefu.error ?? "Kefu status unavailable.",
    };
  }
  const fetchReady = isAvailable(wechatFetch.data);
  const configured = kefu.data?.configured === true;
  const running = kefu.data?.monitor_running === true;
  return {
    key: "wechat",
    label: "WeChat / Kefu",
    level: configured && fetchReady ? "ok" : "warn",
    detail: configured
      ? `Configured, monitor ${running ? "running" : "stopped"}`
      : "Kefu not configured yet.",
  };
}

function runtimeRow(
  healthz: Captured<unknown>,
  runtime: Captured<DesktopCodexRuntimeResponse>,
): HealthRow {
  if (!healthz.ok) {
    return {
      key: "runtime",
      label: "Desktop runtime",
      level: "error",
      detail: healthz.error ?? "Server health check failed.",
    };
  }
  const warnings = runtime.data?.runtime.health_warnings ?? [];
  return {
    key: "runtime",
    label: "Desktop runtime",
    level: warnings.length > 0 ? "warn" : "ok",
    detail:
      warnings.length > 0
        ? warnings.join("; ")
        : `Server healthy, ${runtime.data?.runtime.provider_count ?? 0} live provider(s).`,
  };
}

function toolRow(
  key: string,
  label: string,
  result: Captured<AvailabilityCheck>,
): HealthRow {
  if (!result.ok) {
    return {
      key,
      label,
      level: "warn",
      detail: result.error ?? "Check endpoint unavailable.",
    };
  }
  const ready = isAvailable(result.data);
  return {
    key,
    label,
    level: ready ? "ok" : "warn",
    detail: ready
      ? [result.data?.version, result.data?.path].filter(Boolean).join(" / ") ||
        "Available"
      : result.data?.error ?? "Not available.",
  };
}

function isAvailable(data?: AvailabilityCheck): boolean {
  return data?.available === true || data?.ok === true || data?.installed === true;
}

export function RuntimeHealthSection() {
  const healthQuery = useQuery({
    queryKey: ["settings", "runtime-health"],
    queryFn: loadRuntimeHealth,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const rows = healthQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-foreground">
            Runtime readiness
          </div>
          <div className="text-xs text-muted-foreground">
            Provider, storage, WeChat, and local tool health in one sweep.
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={healthQuery.isFetching}
          onClick={() => void healthQuery.refetch()}
        >
          {healthQuery.isFetching ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {healthQuery.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
          {healthQuery.error instanceof Error
            ? healthQuery.error.message
            : String(healthQuery.error)}
        </div>
      )}

      {healthQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking runtime...
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <HealthRowItem key={row.key} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function HealthRowItem({ row }: { row: HealthRow }) {
  const Icon =
    row.level === "ok"
      ? CheckCircle2
      : row.level === "warn"
        ? AlertTriangle
        : XCircle;
  const color =
    row.level === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : row.level === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{row.label}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.detail}
        </div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${color}`}>
        {row.level}
      </span>
    </div>
  );
}
