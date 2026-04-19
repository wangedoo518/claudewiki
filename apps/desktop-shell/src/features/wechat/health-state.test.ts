/**
 * M5 sprint — unit tests for the WeChat `health-state` derivation
 * helpers owned by Worker B. Covers the 5-state `deriveHealth`
 * ladder and the `formatRelativeTime` zh-CN relative formatter.
 *
 * Authored in the same contract-form pattern used by
 * `queue-intelligence.test.ts` (Q1), `candidate-scoring.test.ts` (Q2)
 * and `combined-proposal-rules.test.ts` (W3):
 *
 *   • vitest is not wired into `apps/desktop-shell` yet — there is
 *     no `vitest` devDependency and no `vitest.config.ts`. Importing
 *     from `"vitest"` would break `tsc --noEmit` on developer
 *     machines that haven't installed the package.
 *
 *   • To keep the file green under the project-wide `tsc --noEmit`
 *     gate while still documenting the locked behavioural contract,
 *     we declare local ambient globals that mirror the subset of
 *     vitest's chai-flavoured API the test bodies need. When a
 *     later sprint wires in vitest + config, the ambient block
 *     becomes a harmless duplicate declaration that can be deleted.
 *
 *   • Worker A has not yet shipped the canonical `ChannelHealth`
 *     export in `@/lib/tauri`, so Worker B's `./health-state`
 *     module currently re-declares the shape as `ChannelHealthLike`
 *     (see the TODO at the top of `health-state.ts`). These tests
 *     import the Worker B alias so the contract is exercised
 *     end-to-end today; Main's integrator will flip both the
 *     helper module and this test file to `import type
 *     { ChannelHealth } from "@/lib/tauri";` once Worker A lands.
 *
 * Coverage matrix (what this file asserts about the helpers):
 *
 *   deriveHealth (5-state ladder):
 *     running=false + last_error=Some                → "error"
 *     running=false + last_error=None                → "disconnected"
 *     running=true  + consecutive_failures >= 3      → "degraded"
 *     running=true  + last_inbound > 30 min ago      → "idle"
 *     running=true  + last_inbound <  30 min ago     → "active"
 *     running=true  + last_inbound = null            → "active"
 *                                                      (never received
 *                                                       a message but
 *                                                       long-poll is up)
 *     precedence: error beats degraded — error only
 *                 fires when running=false, so the
 *                 degraded branch is structurally
 *                 guarded.
 *     precedence: degraded beats idle — when both
 *                 match, degraded wins so the user
 *                 sees the real failure.
 *
 *   formatRelativeTime (zh-CN human formatter):
 *     null input                          → "从未"
 *     delta < 0  (clock skew future ts)   → "刚刚"
 *     delta < 60 s                        → "刚刚"
 *     60 s ≤ delta < 60 min               → "N 分钟前"
 *     60 min ≤ delta < 24 h               → "N 小时前"
 *     24 h ≤ delta                        → "N 天前"
 *     monotonic: larger delta produces a
 *       description whose bucket index is
 *       greater than or equal to a smaller
 *       delta's bucket (hard sort check)
 */

import {
  deriveHealth,
  formatRelativeTime,
  type ChannelHealthLike,
} from "./health-state";

// ── Local vitest ambient globals (drop once vitest is installed) ───

type TestFn = () => void | Promise<void>;
interface SuiteFn {
  (name: string, fn: () => void): void;
  skip: (name: string, fn: () => void) => void;
}
interface ItFn {
  (name: string, fn: TestFn): void;
  skip: (name: string, fn: TestFn) => void;
}
interface Expect<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toContain(expected: unknown): void;
  toMatch(expected: RegExp | string): void;
  toHaveLength(expected: number): void;
  not: Expect<T>;
}
declare const describe: SuiteFn;
declare const it: ItFn;
declare const expect: <T>(actual: T) => Expect<T>;

// ── Fixture helpers ────────────────────────────────────────────────

/**
 * Minimal valid `ChannelHealthLike` factory. All counters zeroed and
 * every timestamp `null` so callers override only the fields
 * relevant to the rule under test.
 *
 * TODO(worker-a): rename the parameter type to `ChannelHealth`
 * (imported from `@/lib/tauri`) once Worker A ships the canonical
 * export — the `Like` alias exists only to bridge the gap while
 * backend + frontend contracts converge.
 */
function makeHealth(partial: Partial<ChannelHealthLike> = {}): ChannelHealthLike {
  return {
    channel: "ilink",
    running: true,
    last_poll_unix_ms: null,
    last_inbound_unix_ms: null,
    last_ingest_unix_ms: null,
    consecutive_failures: 0,
    last_error: null,
    processed_msg_count: 0,
    dedupe_hit_count: 0,
    ...partial,
  };
}

/** A deterministic "now" used across tests to keep assertions pinned. */
const FIXED_NOW = 1_700_000_000_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ── deriveHealth — 5 canonical states + precedence ─────────────────

describe("deriveHealth — 5 状态分类", () => {
  it("running=false + last_error=Some → error", () => {
    const h = makeHealth({
      running: false,
      last_error: "network fail",
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("error");
  });

  it("running=false + last_error=None → disconnected", () => {
    const h = makeHealth({
      running: false,
      last_error: null,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("disconnected");
  });

  it("running=true + consecutive_failures=3 → degraded (边界)", () => {
    // 3 is the documented threshold: > 30 min idle is still only
    // "idle", but 3 consecutive long-poll failures flips to
    // "degraded" even if activity is otherwise recent.
    const h = makeHealth({
      running: true,
      consecutive_failures: 3,
      last_inbound_unix_ms: FIXED_NOW - 5 * MINUTE_MS,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("degraded");
  });

  it("running=true + consecutive_failures=10 → degraded (任意 ≥ 3)", () => {
    const h = makeHealth({
      running: true,
      consecutive_failures: 10,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("degraded");
  });

  it("running=true + last_inbound=31min ago → idle", () => {
    // Just past the 30-minute idle window — should tip from
    // "active" into "idle".
    const h = makeHealth({
      running: true,
      last_inbound_unix_ms: FIXED_NOW - 31 * MINUTE_MS,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("idle");
  });

  it("running=true + last_inbound=5min ago → active", () => {
    const h = makeHealth({
      running: true,
      last_inbound_unix_ms: FIXED_NOW - 5 * MINUTE_MS,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("active");
  });

  it("running=true + last_inbound=null → active (从未收到消息也算 active)", () => {
    // Fresh long-poll that has not yet received a message still
    // reports "active" — the connection itself is healthy. This
    // matters on day-one for accounts that only receive sporadic
    // traffic; we don't want them flashing "idle" on boot.
    const h = makeHealth({
      running: true,
      last_inbound_unix_ms: null,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("active");
  });

  it("precedence: stopped + error beats degraded signal", () => {
    // Even if failure count is huge, `running=false` routes to
    // "error" / "disconnected" first — the degraded branch only
    // fires while the long-poll is alive.
    const h = makeHealth({
      running: false,
      last_error: "auth expired",
      consecutive_failures: 99,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("error");
  });

  it("precedence: degraded beats idle (both match)", () => {
    // running=true, last_inbound stale *and* consecutive_failures
    // ≥ 3 → degraded should win so the user sees the real problem.
    const h = makeHealth({
      running: true,
      consecutive_failures: 5,
      last_inbound_unix_ms: FIXED_NOW - 2 * HOUR_MS,
    });
    expect(deriveHealth(h, FIXED_NOW)).toBe("degraded");
  });
});

// ── formatRelativeTime — null / 刚刚 / 分钟 / 小时 / 天 ─────────────

describe("formatRelativeTime — zh-CN 相对时间", () => {
  it("null → 从未", () => {
    expect(formatRelativeTime(null, FIXED_NOW)).toBe("从未");
  });

  it("< 60s → 刚刚", () => {
    expect(formatRelativeTime(FIXED_NOW - 5_000, FIXED_NOW)).toBe("刚刚");
  });

  it("exactly at now (delta=0) → 刚刚", () => {
    expect(formatRelativeTime(FIXED_NOW, FIXED_NOW)).toBe("刚刚");
  });

  it("clock skew / future timestamp → 刚刚", () => {
    // Defensive: if the backend ts is slightly ahead of the
    // renderer's clock the formatter should still return a sane
    // label rather than "-1 分钟前".
    expect(formatRelativeTime(FIXED_NOW + 2_000, FIXED_NOW)).toBe("刚刚");
  });

  it("分钟 bucket: 3 分钟前", () => {
    expect(formatRelativeTime(FIXED_NOW - 3 * MINUTE_MS, FIXED_NOW)).toMatch(
      /^3\s*分钟前$/,
    );
  });

  it("分钟 bucket: 59 分钟前 (边界)", () => {
    expect(formatRelativeTime(FIXED_NOW - 59 * MINUTE_MS, FIXED_NOW)).toMatch(
      /^59\s*分钟前$/,
    );
  });

  it("小时 bucket: 2 小时前", () => {
    expect(formatRelativeTime(FIXED_NOW - 2 * HOUR_MS, FIXED_NOW)).toMatch(
      /^2\s*小时前$/,
    );
  });

  it("小时 bucket: 23 小时前 (边界)", () => {
    expect(formatRelativeTime(FIXED_NOW - 23 * HOUR_MS, FIXED_NOW)).toMatch(
      /^23\s*小时前$/,
    );
  });

  it("天 bucket: 1 天前", () => {
    expect(formatRelativeTime(FIXED_NOW - 1 * DAY_MS, FIXED_NOW)).toMatch(
      /^1\s*天前$/,
    );
  });

  it("天 bucket: 7 天前", () => {
    expect(formatRelativeTime(FIXED_NOW - 7 * DAY_MS, FIXED_NOW)).toMatch(
      /^7\s*天前$/,
    );
  });

  it("时序保证: delta 递增对应的 bucket 索引不下降", () => {
    // Sort a spread of deltas ascending and walk the bucket index
    // across `刚刚` → 分钟 → 小时 → 天. The bucket for each
    // successive delta must be >= the previous one — a small but
    // powerful guard against someone accidentally flipping a
    // threshold the wrong way.
    const bucket = (label: string): number => {
      if (label === "从未") return -1;
      if (label === "刚刚") return 0;
      if (label.endsWith("分钟前")) return 1;
      if (label.endsWith("小时前")) return 2;
      if (label.endsWith("天前")) return 3;
      return 99;
    };
    const deltas = [
      10_000, // 刚刚
      2 * MINUTE_MS, // 分钟
      45 * MINUTE_MS, // 分钟
      3 * HOUR_MS, // 小时
      22 * HOUR_MS, // 小时
      2 * DAY_MS, // 天
      30 * DAY_MS, // 天
    ];
    let prev = -1;
    for (const d of deltas) {
      const label = formatRelativeTime(FIXED_NOW - d, FIXED_NOW);
      const b = bucket(label);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
});
