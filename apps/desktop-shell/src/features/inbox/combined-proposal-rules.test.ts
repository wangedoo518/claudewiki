/**
 * W3 sprint — unit tests for `combined-proposal-rules`.
 *
 * Runs under vitest. The harness isn't wired up in `apps/desktop-shell`
 * yet (no `vitest` devDependency / no `vitest.config.ts`), so these
 * tests are authored against the locked contract and will execute
 * verbatim once a later sprint adds vitest. Meanwhile the file still
 * type-checks under the project's main `tsc --noEmit` pass.
 *
 * We avoid `import { describe, it, expect } from "vitest"` so that the
 * missing dependency doesn't break `tsc`. Instead, the globals below
 * are declared locally — vitest's own globals plugin (or the
 * `vitest/globals` types reference) will merge cleanly once installed.
 * Behavioural semantics match vitest's chai-like API.
 */

import {
  BUNDLE_MAX_SIZE,
  BUNDLE_MIN_SIZE,
  computeBundleEligibility,
  formatIneligibilityHint,
  sortBundleByScore,
  type BundleIneligibleReason,
} from "./combined-proposal-rules";
import type { QueueIntelligence } from "./queue-intelligence";
import type { InboxEntry } from "@/features/ingest/types";

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
  toBeLessThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toContain(expected: unknown): void;
  toHaveLength(expected: number): void;
  toMatch(expected: RegExp | string): void;
  not: Expect<T>;
}
declare const describe: SuiteFn;
declare const it: ItFn;
declare const expect: <T>(actual: T) => Expect<T>;

// ── Fixture helpers ────────────────────────────────────────────────

/**
 * Minimal valid `InboxEntry` factory. All fields default to a "blank
 * pending new-raw" shape; callers override only the signals relevant
 * to the rule under test. Callers that want the entry to count as
 * having a target slug should also pass `intelligence` via
 * `makeEntryWithTarget`.
 */
function makeEntry(partial: Partial<InboxEntry> = {}): InboxEntry {
  return {
    id: 1,
    kind: "new-raw",
    status: "pending",
    title: "test entry",
    description: "",
    source_raw_id: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...partial,
  };
}

/**
 * Entry decorated with a minimal `intelligence` envelope pointing at a
 * given target slug — simulates the Q1 output after Q2 candidate
 * scoring has stamped a `target_candidate` on each row.
 */
function makeEntryWithTarget(
  id: number,
  slug: string,
  overrides: Partial<InboxEntry> = {},
): InboxEntry & { intelligence: QueueIntelligence } {
  return {
    ...makeEntry({ id, ...overrides }),
    intelligence: {
      score: 70,
      group_key: "update_existing",
      recommended_action: "update_existing",
      reason_code: "has_target_slug",
      why: "test fixture",
      target_candidate: { slug, source: "target" },
    },
  };
}

/** Entry without any target_candidate on its intelligence envelope. */
function makeEntryNoTarget(
  id: number,
  overrides: Partial<InboxEntry> = {},
): InboxEntry & { intelligence: QueueIntelligence } {
  return {
    ...makeEntry({ id, ...overrides }),
    intelligence: {
      score: 20,
      group_key: "ask_first",
      recommended_action: "ask_first",
      reason_code: "missing_signals",
      why: "test fixture (no target)",
    },
  };
}

// ── computeBundleEligibility — size gates ──────────────────────────

describe("computeBundleEligibility — size gates", () => {
  it("too_few: 0 entries → too_few with actual=0", () => {
    const result = computeBundleEligibility([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("too_few");
      if (result.reason.code === "too_few") {
        expect(result.reason.needed).toBe(BUNDLE_MIN_SIZE);
        expect(result.reason.actual).toBe(0);
      }
    }
  });

  it("too_few: 1 entry → too_few with actual=1", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "foo"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("too_few");
      if (result.reason.code === "too_few") {
        expect(result.reason.actual).toBe(1);
      }
    }
  });

  it("boundary: 2 entries same slug → ok (min boundary)", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "shared-slug"),
      makeEntryWithTarget(2, "shared-slug"),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targetSlug).toBe("shared-slug");
    }
  });

  it("boundary: 6 entries same slug → ok (max boundary)", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntryWithTarget(i + 1, "shared-slug"),
    );
    const result = computeBundleEligibility(entries);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targetSlug).toBe("shared-slug");
    }
  });

  it("too_many: 7 entries → too_many with actual=7, max=6", () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      makeEntryWithTarget(i + 1, "shared-slug"),
    );
    const result = computeBundleEligibility(entries);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("too_many");
      if (result.reason.code === "too_many") {
        expect(result.reason.max).toBe(BUNDLE_MAX_SIZE);
        expect(result.reason.actual).toBe(7);
      }
    }
  });
});

// ── computeBundleEligibility — not_pending ─────────────────────────

describe("computeBundleEligibility — not_pending", () => {
  it("not_pending: one approved entry in selection → not_pending", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug-a"),
      makeEntryWithTarget(2, "slug-a", { status: "approved" }),
      makeEntryWithTarget(3, "slug-a"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("not_pending");
      if (result.reason.code === "not_pending") {
        expect(result.reason.nonPendingIds).toEqual([2]);
      }
    }
  });

  it("not_pending: multiple rejected → collect all non-pending ids", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug", { status: "rejected" }),
      makeEntryWithTarget(2, "slug"),
      makeEntryWithTarget(3, "slug", { status: "approved" }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("not_pending");
      if (result.reason.code === "not_pending") {
        expect(result.reason.nonPendingIds).toEqual([1, 3]);
      }
    }
  });
});

// ── computeBundleEligibility — no_target ───────────────────────────

describe("computeBundleEligibility — no_target", () => {
  it("no_target: one entry missing intelligence.target_candidate.slug", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug-a"),
      makeEntryNoTarget(2),
      makeEntryWithTarget(3, "slug-a"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("no_target");
      if (result.reason.code === "no_target") {
        expect(result.reason.inboxIdsWithoutTarget).toEqual([2]);
      }
    }
  });

  it("no_target: entry with intelligence but undefined target_candidate", () => {
    const noTargetEntry: InboxEntry & { intelligence?: QueueIntelligence } = {
      ...makeEntry({ id: 5 }),
      intelligence: {
        score: 10,
        group_key: "ask_first",
        recommended_action: "ask_first",
        reason_code: "missing_signals",
        why: "fixture",
        // target_candidate intentionally omitted
      },
    };
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug-a"),
      noTargetEntry,
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("no_target");
    }
  });
});

// ── computeBundleEligibility — mixed_targets ──────────────────────

describe("computeBundleEligibility — mixed_targets", () => {
  it("mixed_targets: 2 distinct slugs → mixed_targets with both slugs sorted", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "zebra"),
      makeEntryWithTarget(2, "alpha"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("mixed_targets");
      if (result.reason.code === "mixed_targets") {
        // Sorted alphabetically (asc) so the hint is deterministic.
        expect(result.reason.foundSlugs).toEqual(["alpha", "zebra"]);
      }
    }
  });

  it("mixed_targets: 3 distinct slugs", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "page-a"),
      makeEntryWithTarget(2, "page-b"),
      makeEntryWithTarget(3, "page-c"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("mixed_targets");
      if (result.reason.code === "mixed_targets") {
        expect(result.reason.foundSlugs).toEqual(["page-a", "page-b", "page-c"]);
      }
    }
  });
});

// ── computeBundleEligibility — ok paths ────────────────────────────

describe("computeBundleEligibility — ok paths", () => {
  it("ok: 3 pending entries same slug → ok + targetSlug echoed", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "target-page"),
      makeEntryWithTarget(2, "target-page"),
      makeEntryWithTarget(3, "target-page"),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.targetSlug).toBe("target-page");
    }
  });
});

// ── computeBundleEligibility — precedence ─────────────────────────

describe("computeBundleEligibility — precedence", () => {
  it("size wins over not_pending (0 entries → too_few, not not_pending)", () => {
    const result = computeBundleEligibility([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("too_few");
    }
  });

  it("not_pending wins over mixed_targets (approved + mixed slugs → not_pending)", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug-a", { status: "approved" }),
      makeEntryWithTarget(2, "slug-b"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("not_pending");
    }
  });

  it("no_target wins over mixed_targets (missing + distinct → no_target)", () => {
    const result = computeBundleEligibility([
      makeEntryWithTarget(1, "slug-a"),
      makeEntryNoTarget(2),
      makeEntryWithTarget(3, "slug-b"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe("no_target");
    }
  });
});

// ── formatIneligibilityHint ────────────────────────────────────────

describe("formatIneligibilityHint", () => {
  it("too_few: outputs non-empty Chinese string with the minimum count", () => {
    const hint = formatIneligibilityHint({
      code: "too_few",
      needed: 2,
      actual: 1,
    });
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("2");
    // Non-empty + contains CJK characters (rough check).
    expect(hint).toMatch(/[\u4e00-\u9fff]/);
  });

  it("too_many: mentions the max", () => {
    const hint = formatIneligibilityHint({ code: "too_many", max: 6, actual: 7 });
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("6");
    expect(hint).toMatch(/[\u4e00-\u9fff]/);
  });

  it("mixed_targets: lists up to 3 slugs", () => {
    const hint = formatIneligibilityHint({
      code: "mixed_targets",
      foundSlugs: ["a", "b", "c", "d"],
    });
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("a");
    expect(hint).toContain("b");
    expect(hint).toContain("c");
    // "d" should NOT be in the hint because we only surface first 3.
    expect(hint.includes("d")).toBe(false);
    expect(hint).toMatch(/[\u4e00-\u9fff]/);
  });

  it("no_target: mentions the count of tasks missing target", () => {
    const hint = formatIneligibilityHint({
      code: "no_target",
      inboxIdsWithoutTarget: [11, 22, 33],
    });
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("3");
    expect(hint).toMatch(/[\u4e00-\u9fff]/);
  });

  it("not_pending: mentions the non-pending count", () => {
    const hint = formatIneligibilityHint({
      code: "not_pending",
      nonPendingIds: [7, 8],
    });
    expect(hint.length).toBeGreaterThan(0);
    expect(hint).toContain("2");
    expect(hint).toMatch(/[\u4e00-\u9fff]/);
  });

  it("every code branch returns non-empty (exhaustive)", () => {
    const allReasons: BundleIneligibleReason[] = [
      { code: "too_few", needed: 2, actual: 0 },
      { code: "too_many", max: 6, actual: 9 },
      { code: "mixed_targets", foundSlugs: ["x"] },
      { code: "no_target", inboxIdsWithoutTarget: [1] },
      { code: "not_pending", nonPendingIds: [1] },
    ];
    for (const reason of allReasons) {
      const hint = formatIneligibilityHint(reason);
      expect(hint.length).toBeGreaterThan(0);
    }
  });
});

// ── sortBundleByScore ──────────────────────────────────────────────

describe("sortBundleByScore", () => {
  it("desc by score", () => {
    const scores: Record<number, number> = { 1: 40, 2: 90, 3: 60 };
    const sorted = sortBundleByScore([1, 2, 3], (id) => scores[id]);
    expect(sorted).toEqual([2, 3, 1]);
  });

  it("tie-break: equal scores → id asc", () => {
    const scores: Record<number, number> = { 1: 50, 2: 50, 3: 50 };
    const sorted = sortBundleByScore([3, 1, 2], (id) => scores[id]);
    expect(sorted).toEqual([1, 2, 3]);
  });

  it("missing score → treated as 0 (sinks to bottom)", () => {
    const scores: Record<number, number> = { 1: 50, 3: 30 };
    // id 2 has no score → 0 → last.
    const sorted = sortBundleByScore([1, 2, 3], (id) => scores[id]);
    expect(sorted).toEqual([1, 3, 2]);
  });

  it("pure: does not mutate input array", () => {
    const input = [3, 1, 2];
    const scores: Record<number, number> = { 1: 10, 2: 20, 3: 30 };
    sortBundleByScore(input, (id) => scores[id]);
    expect(input).toEqual([3, 1, 2]);
  });

  it("empty input → empty output", () => {
    expect(sortBundleByScore([], () => 0)).toEqual([]);
  });
});
