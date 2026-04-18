/**
 * Shared ingest/fetch error formatting utilities.
 *
 * ClawWiki's ingest pipeline spans multiple Rust crates
 * (`wechat_ilink`, `wechat_kefu`, `wechat_fetch`, `markitdown_bridge`,
 * etc.) and each surfaces failures as raw `stderr`/`anyhow` chains when
 * a prerequisite is missing or a remote fetch fails. The shell used to
 * display those chains verbatim, which was wildly user-hostile ("No
 * module named 'playwright'. See https://..." with no actionable hint
 * on what to install).
 *
 * This module centralises the classification + Chinese-language hint
 * logic so every ingress surface (WeChat Bridge, Ask URL enrich,
 * EnvironmentDoctor) renders the same human-readable guidance. The
 * wire-format for a Rust `Error::to_string()` is unstable and varies
 * per crate, so we match on **substrings** rather than exact strings.
 *
 * See also: `EnvironmentDoctor` which calls the various
 * `/api/desktop/.../check` endpoints and funnels their `error` fields
 * through `formatIngestError`.
 */

/**
 * Canonical prerequisite identifier. Wire values match the Rust side:
 * `desktop-core::prerequisites::MissingPrerequisite::as_str()` returns
 * the exact strings below (snake_case / kebab-case, lowercase). Keep
 * this union in sync with that `as_str` match arm.
 *
 * Backends that surface a `PrerequisiteMissing { dep, hint }` over the
 * wire (e.g. the Ask enrich side-channel) will hand the frontend the
 * `dep` string directly — in those cases consumers should prefer the
 * backend-provided value over calling `detectPrerequisite` locally.
 */
export type PrerequisiteKind =
  | "node"
  | "npx"
  | "python"
  | "playwright"
  | "chromium"
  | "opencli"
  | "browser-bridge"
  | "markitdown"
  | "other";

/**
 * Classify a raw Rust error string against the known prerequisite
 * catalogue. Returns the canonical `PrerequisiteKind` when we can be
 * confident about the missing dependency; `null` for errors that are
 * NOT about a missing prerequisite (network failures, bad content,
 * cancellations, etc.).
 *
 * Order matters: more-specific patterns (e.g. `playwright` before
 * bare `python`) come first so we return the useful narrow answer.
 *
 * Note: the backend's `PrerequisiteMissing.dep` field already carries a
 * canonical `PrerequisiteKind`, so code paths that have access to the
 * structured side-channel should prefer that over re-detecting from a
 * stderr blob. This helper stays useful for surfaces that only see the
 * raw error string (EnvironmentDoctor, legacy fetch error banners).
 */
export function detectPrerequisite(err: string): PrerequisiteKind | null {
  const normalized = err.toLowerCase();

  // Playwright-specific first (Python Playwright is a superset of Python)
  if (
    normalized.includes("no module named 'playwright'") ||
    normalized.includes('no module named "playwright"') ||
    normalized.includes("playwright not installed") ||
    normalized.includes("playwright._impl")
  ) {
    return "playwright";
  }

  // Chromium / browser executable (often surfaced by Playwright)
  if (
    normalized.includes("executable doesn't exist") ||
    normalized.includes("executable does not exist") ||
    normalized.includes("browsertype.launch") ||
    normalized.includes("browser_type.launch") ||
    normalized.includes("looks like playwright was just installed or updated")
  ) {
    return "chromium";
  }

  // Markitdown package missing
  if (
    normalized.includes("no module named 'markitdown'") ||
    normalized.includes('no module named "markitdown"') ||
    normalized.includes("markitdown not installed") ||
    normalized.includes("markitdown unavailable")
  ) {
    return "markitdown";
  }

  // Python runtime missing (after narrower matches so we don't
  // swallow the playwright/markitdown cases above).
  if (
    normalized.includes("failed to spawn python") ||
    normalized.includes("python not found") ||
    normalized.includes("'python' is not recognized") ||
    normalized.includes("python3 not found") ||
    normalized.includes("no python interpreter")
  ) {
    return "python";
  }

  if (normalized.includes("npx not found")) {
    return "npx";
  }

  if (normalized.includes("node.js not found") || normalized.includes("node not found")) {
    return "node";
  }

  if (normalized.includes("opencli unavailable") || normalized.includes("opencli not found")) {
    return "opencli";
  }

  if (
    normalized.includes("browser bridge unavailable") ||
    normalized.includes("browser-bridge unavailable")
  ) {
    return "browser-bridge";
  }

  return null;
}

/** Human-readable install / repair hint for a prerequisite kind. */
export function prerequisiteHint(kind: PrerequisiteKind): string {
  switch (kind) {
    case "node":
      return "未找到 Node.js。请安装 Node.js 20+ 并确认终端能运行 node -v。";
    case "npx":
      return "未找到 npx。通常是 Node.js 未安装，或安装后 PATH 尚未生效。请确认终端能运行 node -v 和 npx -v。";
    case "python":
      return "未找到 Python。请安装 Python 3.11+ 并加入 PATH，确保终端能运行 python --version。";
    case "playwright":
      return "未安装 Python Playwright。请运行：pip install playwright && python -m playwright install chromium";
    case "chromium":
      return "未找到 Chrome/Edge/Chromium 浏览器。请安装任意一款 Chromium 内核浏览器，或运行：python -m playwright install chromium";
    case "opencli":
      return "未找到 OpenCLI。请确认 OpenCLI 已安装，且当前桌面应用继承到了它所在的 PATH。";
    case "browser-bridge":
      return "未找到 browser-bridge 脚本。请确认 desktop-core 自带的 browser-bridge 目录存在且可执行。";
    case "markitdown":
      return "未安装 MarkItDown。请运行：pip install markitdown 或在 设置 → 存储 页面自动安装。";
    case "other":
      return "环境缺少依赖，请根据原始错误信息排查。";
  }
}

/**
 * Convert a raw ingest / fetch error into a Chinese human-readable
 * message. This is the single format funnel — every surface that
 * renders ingest errors (WeChat Bridge panels, Ask URL enrich,
 * EnvironmentDoctor, pipeline log lines) should pass through this.
 *
 * Logic:
 *   1. If the error matches a known prerequisite, return the install
 *      hint plus the raw error for power-user debugging.
 *   2. If it matches a known **semantic** failure (anti-bot, too-short
 *      content), return a tailored Chinese message.
 *   3. Otherwise return the raw trimmed text.
 */
export function formatIngestError(err: string | null | undefined): string {
  const raw = (err ?? "").trim();
  if (!raw) return "";

  const kind = detectPrerequisite(raw);
  if (kind) {
    return `${prerequisiteHint(kind)} 原始错误：${raw}`;
  }

  const normalized = raw.toLowerCase();

  // Anti-bot / verification page hit
  if (
    normalized.includes("anti-bot") ||
    normalized.includes("反爬验证页") ||
    normalized.includes("environment.verify") ||
    normalized.includes("访问频繁，请稍后") ||
    normalized.includes("请完成安全验证")
  ) {
    return `内容被反爬验证拦截。请稍后重试，或手动打开链接复制内容。原始错误：${raw}`;
  }

  // Shell page / too-short content
  if (
    normalized.includes("too short") ||
    normalized.includes("内容过短") ||
    normalized.includes("content length below")
  ) {
    return `抓取到的内容过短，可能是空壳页面或加载失败。原始错误：${raw}`;
  }

  return raw;
}
