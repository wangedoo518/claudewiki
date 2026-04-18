/**
 * Q2 Target Candidate Scoring — unit tests for the 8-signal ladder,
 * the two short-circuit branches, tier thresholds, and top-K
 * truncation.
 *
 * Authored in the same contract-form as `queue-intelligence.test.ts`:
 * vitest is not wired into `apps/desktop-shell` yet, so we declare
 * local ambient globals to keep `tsc --noEmit` green. When a later
 * sprint adds vitest + a config, delete the ambient block and switch
 * to `import { describe, it, expect } from "vitest"` — the test
 * bodies already match vitest's chai-ish API.
 *
 * Coverage matrix (what this file asserts about the scorer):
 *
 *   tokenizer      → stopwords, length floor, whitespace split
 *   jaccard        → full overlap, no overlap, empty-set degenerate
 *   short-circuits → existing_target (100), existing_proposed (90)
 *   reason codes   → exact_slug, exact_title, title_overlap_*,
 *                    shared_raw_source (graph_* deferred to backend
 *                    coverage — fallback path omits graphs)
 *   tier           → score ≥ 80 → "strong", [40, 80) → "likely",
 *                    [10, 40) → "weak"; < 10 dropped
 *   truncation     → top-3 cap + sort desc
 */

import {
  computeCandidates,
  inferSlugFromTitle,
  jaccard,
  normalizeForCandidate,
  tierFor,
  tokenizeForScoring,
  type CandidatePageInput,
  type ScoringInput,
} from "./candidate-scoring";

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
  toBeLessThanOrEqual(expected: number): void;
  toBeCloseTo(expected: number, digits?: number): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toContain(expected: unknown): void;
  toHaveLength(expected: number): void;
  not: Expect<T>;
}
declare const describe: SuiteFn;
declare const it: ItFn;
declare const expect: <T>(actual: T) => Expect<T>;

// ── Fixture helpers ────────────────────────────────────────────────

/** A minimal `ScoringInput` with no signals set — callers override. */
function baseInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    inbox_title: "test",
    inbox_source_raw_id: null,
    inbox_target_page_slug: null,
    inbox_proposed_wiki_slug: null,
    wiki_pages: [],
    ...overrides,
  };
}

function page(
  slug: string,
  title: string,
  source_raw_id: number | null = null,
): CandidatePageInput {
  return { slug, title, source_raw_id };
}

// ── normalizeForCandidate / inferSlugFromTitle ──────────────────────

describe("normalizeForCandidate", () => {
  it("lowercase + trim", () => {
    expect(normalizeForCandidate("  Example Domain  ")).toBe("example domain");
  });
});

describe("inferSlugFromTitle", () => {
  it("Example Domain → example-domain", () => {
    expect(inferSlugFromTitle("Example Domain")).toBe("example-domain");
  });
  it("保留 CJK 字符", () => {
    // Chinese title with internal spaces converts spaces to dashes and
    // keeps ideographs verbatim.
    expect(inferSlugFromTitle("强化 学习")).toBe("强化-学习");
  });
  it("去掉标点", () => {
    expect(inferSlugFromTitle("Hello, World!")).toBe("hello-world");
  });
});

// ── tokenizeForScoring ─────────────────────────────────────────────

describe("tokenizeForScoring", () => {
  it("过滤 stopwords", () => {
    const tokens = [...tokenizeForScoring("The quick brown fox")];
    expect(tokens).toEqual(["quick", "brown", "fox"]);
  });

  it("过滤短词（<2 chars）", () => {
    const tokens = [...tokenizeForScoring("a b c ab cd")];
    // "a"/"b"/"c" < 2 chars, filtered.
    expect(tokens).toEqual(["ab", "cd"]);
  });

  it("按空格/连字符/下划线/斜杠 split", () => {
    const tokens = [...tokenizeForScoring("python-async_programming/guide")];
    expect(tokens).toEqual(["python", "async", "programming", "guide"]);
  });

  it("去重（Set 语义）", () => {
    const tokens = tokenizeForScoring("python python python");
    expect(tokens.size).toBe(1);
  });

  it("CJK 无空格 → 单 token（MVP 限制）", () => {
    // No whitespace inside, CJK collapses to a single token.
    const tokens = [...tokenizeForScoring("强化学习")];
    expect(tokens).toEqual(["强化学习"]);
  });
});

// ── jaccard ────────────────────────────────────────────────────────

describe("jaccard", () => {
  it("完全重合 → 1.0", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBeCloseTo(1.0);
  });

  it("无交集 → 0", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("空集 → 0", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });

  it("部分交集：{a,b,c} vs {b,c,d} = 2/4 = 0.5", () => {
    expect(
      jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"])),
    ).toBeCloseTo(0.5);
  });
});

// ── tierFor ────────────────────────────────────────────────────────

describe("tierFor", () => {
  it("score >= 80 → strong", () => {
    expect(tierFor(80)).toBe("strong");
    expect(tierFor(100)).toBe("strong");
  });
  it("40 <= score < 80 → likely", () => {
    expect(tierFor(40)).toBe("likely");
    expect(tierFor(79)).toBe("likely");
  });
  it("score < 40 → weak", () => {
    expect(tierFor(10)).toBe("weak");
    expect(tierFor(39)).toBe("weak");
  });
});

// ── computeCandidates — short-circuits ─────────────────────────────

describe("computeCandidates — short-circuits", () => {
  it("existing_target → source='existing_target', score=100", () => {
    const res = computeCandidates(
      baseInput({
        inbox_target_page_slug: "example-page",
        wiki_pages: [page("example-page", "Example Page")],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].slug).toBe("example-page");
    expect(res[0].source).toBe("existing_target");
    expect(res[0].score).toBe(100);
    expect(res[0].tier).toBe("strong");
    expect(res[0].reasons[0].code).toBe("existing_target");
  });

  it("existing_target 即使 wiki_pages 为空也返回（用 slug 当 title）", () => {
    const res = computeCandidates(
      baseInput({ inbox_target_page_slug: "missing-slug", wiki_pages: [] }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].source).toBe("existing_target");
    expect(res[0].title).toBe("missing-slug");
  });

  it("existing_proposed → source='existing_proposed', score=90", () => {
    const res = computeCandidates(
      baseInput({
        inbox_proposed_wiki_slug: "proposed-slug",
        wiki_pages: [page("proposed-slug", "Proposed Title")],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].source).toBe("existing_proposed");
    expect(res[0].score).toBe(90);
    expect(res[0].tier).toBe("strong");
    expect(res[0].reasons[0].code).toBe("existing_proposed");
  });

  it("existing_target 优先于 existing_proposed（两者同时存在）", () => {
    const res = computeCandidates(
      baseInput({
        inbox_target_page_slug: "target-one",
        inbox_proposed_wiki_slug: "proposed-two",
      }),
    );
    expect(res[0].source).toBe("existing_target");
  });
});

// ── computeCandidates — signal coverage ────────────────────────────

describe("computeCandidates — 信号覆盖", () => {
  it("exact_slug → score=100, tier=strong", () => {
    const res = computeCandidates(
      baseInput({
        inbox_title: "example-domain",
        wiki_pages: [page("example-domain", "Example Domain")],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].tier).toBe("strong");
    expect(res[0].score).toBeGreaterThanOrEqual(100);
    const codes = res[0].reasons.map((r) => r.code);
    expect(codes).toContain("exact_slug");
  });

  it("exact_title → reason=exact_title, score≥80", () => {
    const res = computeCandidates(
      baseInput({
        inbox_title: "Python Async Guide",
        wiki_pages: [page("another-slug", "Python Async Guide")],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].score).toBeGreaterThanOrEqual(80);
    const codes = res[0].reasons.map((r) => r.code);
    expect(codes).toContain("exact_title");
  });

  it("title_overlap 命中（部分词重合触发某一档 overlap）", () => {
    const res = computeCandidates(
      baseInput({
        inbox_title: "python async programming tutorial",
        wiki_pages: [page("python-async-guide", "python async guide")],
      }),
    );
    expect(res).toHaveLength(1);
    const codes = res[0].reasons.map((r) => r.code);
    // At least one of the three overlap bands must fire.
    const hitsOverlap = codes.some(
      (c) =>
        c === "title_overlap_high" ||
        c === "title_overlap_mid" ||
        c === "title_overlap_low",
    );
    expect(hitsOverlap).toBe(true);
  });

  it("shared_raw_source → +50", () => {
    const res = computeCandidates(
      baseInput({
        inbox_source_raw_id: 12,
        inbox_title: "Some Unrelated Title",
        wiki_pages: [page("cohort-page", "Cohort Page", 12)],
      }),
    );
    expect(res).toHaveLength(1);
    const codes = res[0].reasons.map((r) => r.code);
    expect(codes).toContain("shared_raw_source");
    expect(res[0].score).toBeGreaterThanOrEqual(50);
  });

  it("shared_raw_source 需要双边都有 id（inbox 无 raw_id 则不触发）", () => {
    const res = computeCandidates(
      baseInput({
        inbox_source_raw_id: null,
        inbox_title: "Some Unrelated Title",
        wiki_pages: [page("cohort-page", "Cohort Page", 12)],
      }),
    );
    // No signal matches → empty candidate list.
    expect(res).toEqual([]);
  });
});

// ── computeCandidates — truncation / sorting / floor ───────────────

describe("computeCandidates — top-K / sort / score floor", () => {
  it("top-3 截断", () => {
    // 10 pages all sharing the same raw source → each gets +50, all
    // tied. Truncation + stable sort should yield exactly 3.
    const pages = Array.from({ length: 10 }, (_, i) =>
      page(`slug-${i}`, `Title ${i}`, 7),
    );
    const res = computeCandidates(
      baseInput({
        inbox_source_raw_id: 7,
        inbox_title: "inbox seed",
        wiki_pages: pages,
      }),
    );
    expect(res).toHaveLength(3);
  });

  it("sort by score desc", () => {
    // Page A: exact_title (+80) + exact_slug (+100 via inferred slug)
    // Page B: only shared_raw_source (+50)
    const res = computeCandidates(
      baseInput({
        inbox_title: "example-domain",
        inbox_source_raw_id: 5,
        wiki_pages: [
          page("example-domain", "example-domain"),
          page("other-page", "Completely Unrelated", 5),
        ],
      }),
    );
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res[0].score).toBeGreaterThanOrEqual(res[1].score);
    expect(res[0].slug).toBe("example-domain");
  });

  it("score < 10 被丢弃", () => {
    const res = computeCandidates(
      baseInput({
        inbox_title: "completely unrelated alpha beta",
        wiki_pages: [page("foo", "totally different bar baz")],
      }),
    );
    // No signal above the 10-point floor → empty list.
    expect(res).toEqual([]);
  });

  it("无 wiki_pages → 空数组", () => {
    const res = computeCandidates(baseInput({ inbox_title: "anything" }));
    expect(res).toEqual([]);
  });
});

// ── tier 阈值边界 ──────────────────────────────────────────────────

describe("computeCandidates — tier 阈值", () => {
  it("exact_slug-only → strong (score >= 80)", () => {
    const res = computeCandidates(
      baseInput({
        inbox_title: "example-domain",
        wiki_pages: [page("example-domain", "Example Domain")],
      }),
    );
    expect(res[0].tier).toBe("strong");
  });

  it("shared_raw_source-only (+50) → likely (40 ≤ score < 80)", () => {
    const res = computeCandidates(
      baseInput({
        inbox_source_raw_id: 99,
        inbox_title: "zzz aaa qqq",
        wiki_pages: [page("shared", "ppp ooo iii", 99)],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].tier).toBe("likely");
  });
});

// ── reasons 数量上限 ──────────────────────────────────────────────

describe("computeCandidates — reasons 封顶", () => {
  it("reasons 最多 3 条", () => {
    // Pile on signals: exact slug + exact title + shared raw source.
    // That is 3 exactly — but the overlap signal can also fire, so
    // the cap must kick in.
    const res = computeCandidates(
      baseInput({
        inbox_title: "example-domain",
        inbox_source_raw_id: 1,
        wiki_pages: [page("example-domain", "example-domain", 1)],
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0].reasons.length).toBeLessThanOrEqual(3);
  });
});
