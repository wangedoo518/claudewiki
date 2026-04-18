/**
 * EnvironmentDoctor — ingest dependency dashboard.
 *
 * Renders a capability matrix for the WeChat/ingest pipeline so a user
 * can see at a glance whether Playwright and MarkItDown are wired up
 * correctly without having to trigger a failing fetch first. Each row
 * calls a dedicated `/api/desktop/.../check` endpoint (non-mutating,
 * cheap) and routes the error through `formatIngestError` for a
 * Chinese actionable hint.
 *
 * Graceful degradation: if a check endpoint returns 404 (Worker A's
 * `/wechat-fetch/check` may not have shipped yet in every build), the
 * row collapses to a neutral "环境检查功能待更新" label instead of
 * blocking the rest of the dashboard.
 *
 * Visual language mirrors `KefuCapabilitiesPanel` in WeChatBridgePage
 * so the two cards read as a coherent family.
 */

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle, Stethoscope } from "lucide-react";
import { fetchJson } from "@/lib/desktop/transport";
import { formatIngestError } from "@/lib/ingest/format-error";

interface GenericCheckResult {
  available: boolean;
  message?: string;
  error?: string;
  version?: string;
  supported_formats?: string[];
}

interface DoctorRowProps {
  label: string;
  description: string;
  queryKey: readonly string[];
  endpoint: string;
  /** Override install guidance shown when `available === false`. */
  fallbackHint?: string;
}

/**
 * Lightweight tri-state badge matching the KefuCapabilitiesPanel
 * visual language. Deliberately no `emoji` — the icon carries the
 * state signal.
 */
function StatusBadge({
  state,
}: {
  state: "ok" | "bad" | "loading" | "unknown";
}) {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-caption text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        检测中
      </span>
    );
  }
  if (state === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-caption text-primary">
        <CheckCircle2 className="size-3" />
        可用
      </span>
    );
  }
  if (state === "bad") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption"
        style={{
          borderColor: "color-mix(in srgb, var(--color-error) 35%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--color-error) 10%, transparent)",
          color: "var(--color-error)",
        }}
      >
        <XCircle className="size-3" />
        不可用
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-2 py-0.5 text-caption text-muted-foreground">
      待更新
    </span>
  );
}

function DoctorRow({ label, description, queryKey, endpoint, fallbackHint }: DoctorRowProps) {
  const checkQuery = useQuery<GenericCheckResult>({
    queryKey,
    queryFn: async () => {
      try {
        return await fetchJson<GenericCheckResult>(endpoint);
      } catch (err) {
        // Surface a structured "endpoint missing" sentinel so the row
        // can collapse gracefully when Worker A's backend hasn't
        // shipped the check endpoint yet.
        const msg = err instanceof Error ? err.message : String(err);
        if (/status\s+404/i.test(msg) || /404/.test(msg)) {
          return {
            available: false,
            error: "__endpoint_missing__",
          };
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000, // 5 min per task spec
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = checkQuery.data;
  const endpointMissing = data?.error === "__endpoint_missing__";
  const available = data?.available === true;

  let state: "ok" | "bad" | "loading" | "unknown";
  if (checkQuery.isLoading) state = "loading";
  else if (endpointMissing) state = "unknown";
  else if (available) state = "ok";
  else state = "bad";

  let hint = "";
  if (endpointMissing) {
    hint = "环境检查功能待更新（后端 /check endpoint 尚未上线）。";
  } else if (!available && data) {
    const formatted = formatIngestError(data.error);
    hint = formatted || fallbackHint || "未知错误，请查看桌面日志。";
  } else if (!available && checkQuery.error) {
    hint = formatIngestError(
      checkQuery.error instanceof Error
        ? checkQuery.error.message
        : String(checkQuery.error),
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-background px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-medium text-foreground">{label}</span>
          <StatusBadge state={state} />
          {available && data?.version && (
            <span className="font-mono text-caption text-muted-foreground/60">
              v{data.version}
            </span>
          )}
        </div>
        <p className="mt-1 text-caption text-muted-foreground">{description}</p>
        {hint && (
          <p
            className="mt-1.5 whitespace-pre-wrap text-caption"
            style={{ color: state === "bad" ? "var(--color-error)" : "var(--muted-foreground)" }}
          >
            {hint}
          </p>
        )}
        {available && data?.supported_formats && data.supported_formats.length > 0 && (
          <p className="mt-1 text-caption text-muted-foreground/60">
            支持格式：{data.supported_formats.map((f) => `.${f}`).join(" ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function EnvironmentDoctor() {
  return (
    <section className="border-b border-border/50 px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Stethoscope className="size-4" style={{ color: "var(--claude-orange)" }} />
        <h2 className="uppercase tracking-widest text-muted-foreground/60" style={{ fontSize: 11 }}>
          Environment doctor
        </h2>
      </div>

      <p className="mb-3 text-caption text-muted-foreground/70">
        微信 / URL 内容抓取所需的运行时依赖体检。每 5 分钟自动刷新一次。
      </p>

      <div className="space-y-2">
        <DoctorRow
          label="Node.js + npx"
          description="OpenCLI、MCP plugin 脚本、部分 fetcher 都需要 Node 运行时。"
          queryKey={["env-doctor", "node", "check"]}
          endpoint="/api/desktop/node/check"
          fallbackHint="未找到 Node.js。请安装 Node.js 20+ 并确认终端能运行 node -v 与 npx -v。"
        />
        <DoctorRow
          label="Chromium/Chrome 浏览器"
          description="Playwright 抓取微信文章等内容时调用的浏览器内核。"
          queryKey={["env-doctor", "chromium", "check"]}
          endpoint="/api/desktop/chromium/check"
          fallbackHint="未找到 Chrome/Edge/Chromium。请安装任意一款 Chromium 内核浏览器，或运行：python -m playwright install chromium"
        />
        <DoctorRow
          label="OpenCLI"
          description="浏览器桥、RAG 工具链与 MCP runtime 的桌面端网关。"
          queryKey={["env-doctor", "opencli", "check"]}
          endpoint="/api/desktop/opencli/check"
          fallbackHint="未找到 OpenCLI。请安装 @jackwener/opencli，或允许桌面端通过 npx --yes 拉起。"
        />
        <DoctorRow
          label="Python + Playwright"
          description="抓取微信公众号文章等需要浏览器渲染的页面。"
          queryKey={["env-doctor", "wechat-fetch", "check"]}
          endpoint="/api/desktop/wechat-fetch/check"
          fallbackHint="Playwright 未就绪。请运行：pip install playwright && python -m playwright install chromium"
        />
        <DoctorRow
          label="Python + MarkItDown"
          description="把 PDF / Word / PPT / Excel 转成 Markdown 入库。"
          queryKey={["env-doctor", "markitdown", "check"]}
          endpoint="/api/desktop/markitdown/check"
          fallbackHint="MarkItDown 未安装。请到 设置 → 存储 页面触发自动安装，或手动运行：pip install markitdown"
        />
      </div>
    </section>
  );
}
