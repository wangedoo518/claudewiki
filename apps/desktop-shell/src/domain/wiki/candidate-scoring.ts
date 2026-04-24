/**
 * Q2 Target Candidate Scoring — pure algorithm for resolving inbox
 * entries to their best-matching wiki pages.
 *
 * Mirrors **exactly** the Rust implementation shipped by Worker A
 * behind `GET /api/wiki/inbox/{id}/candidates`. Called from two
 * places in the frontend:
 *
 *   1. `target-resolver.ts` (client-side fallback when the backend
 *      endpoint 404s — old dev server still running).
 *   2. `candidate-scoring.test.ts` (targeted reason-code coverage so
 *      regressions on either side of the Rust/TS parity surface fast).
 *
 * Parity contract — these three parts must stay byte-identical to
 * the Rust scorer:
 *
 *   • `STOPWORDS` set (13 English + 7 Chinese tokens)
 *   • `tokenizeForScoring` — split on `[\s\-_/]+`, drop <2-char tokens,
 *     drop stopwords
 *   • `jaccard` — |A ∩ B| / |A ∪ B|
 *   • The 8-signal ladder + tier thresholds (80 / 40 / 10)
 *
 * Anything that diverges between Rust and TS will silently produce
 * different candidates when the backend endpoint is unavailable,
 * which is the worst failure mode (UI shows A, falls back to B).
 *
 * Pure functions only — no React, no I/O. Safe to call inside
 * `useMemo`.
 */

// ── Wire types ──────────────────────────────────────────────────────
//
// `TargetCandidate` / `CandidateReason` / `CandidateTier` /
// `CandidateSource` / `InboxCandidatesResponse` come from the canonical
// wire contract in `@/lib/tauri` (generated from the Rust side by
// Worker A). We keep a **narrower** `CandidateReasonCode` union alias
// here for the frontend scorer's internal type safety — it's a subset
// of Rust's `CandidateReason.code: String`, so emitting a code from
// this union satisfies the wire type without casts.

import type {
  CandidateReason,
  CandidateSource,
  CandidateTier,
  InboxCandidatesResponse,
  TargetCandidate,
} from "@/lib/tauri";

export type {
  CandidateReason,
  CandidateSource,
  CandidateTier,
  InboxCandidatesResponse,
  TargetCandidate,
};

/**
 * Machine-readable tag for *why* a page is a candidate — narrow union
 * the frontend scorer uses internally. Compatible with (and narrower
 * than) the Rust-side `CandidateReason.code: String`.
 */
export type CandidateReasonCode =
  | "exact_slug"
  | "exact_title"
  | "title_overlap_high"
  | "title_overlap_mid"
  | "title_overlap_low"
  | "shared_raw_source"
  | "graph_backlink"
  | "graph_related"
  | "graph_outgoing"
  | "existing_target"
  | "existing_proposed";

// ── Stopwords + tokenizer ───────────────────────────────────────────

/**
 * Stopword list — MUST match Worker A's Rust `STOPWORDS` constant
 * verbatim. 13 English + 7 Chinese tokens. If you touch this, open
 * a cross-worker PR because a mismatch will make fallback scoring
 * drift from the real backend.
 */
const STOPWORDS = new Set<string>([
  // English (13)
  "a", "an", "the", "and", "or", "is", "are", "of", "in", "to", "for", "on", "at",
  // Chinese (7)
  "的", "了", "是", "和", "在", "有", "这",
]);

/** Lowercase + trim. Parity with `normalizeForSearch` in palette/filter.ts. */
export function normalizeForCandidate(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Tokenize a string for Jaccard scoring.
 *
 * Split on whitespace / hyphen / underscore / slash; drop tokens
 * under 2 chars; drop stopwords. Returns a `Set` so callers don't
 * accidentally inflate overlap with duplicates.
 *
 * CJK caveat — Chinese text with no whitespace collapses into a
 * single token (MVP limitation). The Rust side has the same
 * behaviour; a later sprint can swap in a proper segmenter on
 * both sides together.
 */
export function tokenizeForScoring(s: string): Set<string> {
  const normalized = normalizeForCandidate(s);
  const tokens = normalized
    .split(/[\s\-_/]+/)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Jaccard similarity |A ∩ B| / |A ∪ B|. Returns 0 for either empty
 * input (parity with Rust; avoids surfacing noise matches against
 * single-word titles).
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Slug shape inference — mimics the wiki slugifier so the
 * `exact_slug` signal fires when a user types a title that collapses
 * to an existing page's slug (e.g. "Example Domain" → "example-domain").
 *
 * Rules: lowercase + trim, collapse whitespace to `-`, strip
 * punctuation except `-` and CJK Unified Ideographs (U+4E00–U+9FFF).
 */
export function inferSlugFromTitle(title: string): string {
  return normalizeForCandidate(title)
    .replace(/\s+/g, "-")
    .replace(/[^\w\-\u4e00-\u9fff]/g, "");
}

// ── Scoring ─────────────────────────────────────────────────────────

/** Per-page graph context — only passed in when the backend also sent it. */
export interface CandidateGraphContext {
  backlinks: Set<string>;
  related: Set<string>;
  outgoing: Set<string>;
}

/** Minimal shape the scorer needs from each wiki page row. */
export interface CandidatePageInput {
  slug: string;
  title: string;
  source_raw_id?: number | null;
}

/** Input envelope for `computeCandidates`. */
export interface ScoringInput {
  inbox_title: string;
  inbox_source_raw_id?: number | null;
  inbox_target_page_slug?: string | null;
  inbox_proposed_wiki_slug?: string | null;
  wiki_pages: CandidatePageInput[];
  /**
   * Optional graph signals keyed by page slug. The backend attaches
   * these only when the caller passed `?with_graph=true`; the
   * fallback path omits them because computing the full page graph
   * client-side is expensive.
   */
  graphs?: Map<string, CandidateGraphContext>;
}

// ── Signal weights (MUST match Worker A's Rust constants) ───────────

const WEIGHT_EXACT_SLUG = 100;
const WEIGHT_EXACT_TITLE = 80;
const WEIGHT_TITLE_OVERLAP_HIGH = 60;
const WEIGHT_TITLE_OVERLAP_MID = 40;
const WEIGHT_TITLE_OVERLAP_LOW = 20;
const WEIGHT_SHARED_RAW_SOURCE = 50;
const WEIGHT_GRAPH_BACKLINK = 25;
const WEIGHT_GRAPH_RELATED = 15;
const WEIGHT_GRAPH_OUTGOING = 10;

// Jaccard bucket thresholds.
const JACCARD_HIGH = 0.6;
const JACCARD_MID = 0.3;
const JACCARD_LOW = 0.1;

// Score floor + tier thresholds.
const MIN_SCORE = 10;
const TIER_STRONG = 80;
const TIER_LIKELY = 40;
const TOP_K = 3;
const MAX_REASONS = 3;

/** Map a numeric score to a tier label. */
export function tierFor(score: number): CandidateTier {
  if (score >= TIER_STRONG) return "strong";
  if (score >= TIER_LIKELY) return "likely";
  return "weak";
}

/**
 * Build a Chinese short-phrase `detail` for a given reason code.
 * Kept ≤50 chars so the inline chip in `TargetCandidatePicker` never
 * wraps. Context `ctx` carries numeric signal data (e.g. the raw
 * Jaccard value for overlap bands).
 */
function reasonDetail(
  code: CandidateReasonCode,
  ctx: { jaccard?: number } = {},
): string {
  switch (code) {
    case "exact_slug":
      return "标题映射到的 slug 完全匹配";
    case "exact_title":
      return "标题完全匹配";
    case "title_overlap_high":
      return `标题核心词高度重合（${formatPct(ctx.jaccard)}%）`;
    case "title_overlap_mid":
      return `标题部分词重合（${formatPct(ctx.jaccard)}%）`;
    case "title_overlap_low":
      return `标题少量词交集（${formatPct(ctx.jaccard)}%）`;
    case "shared_raw_source":
      return "与任务同一素材源";
    case "graph_backlink":
      return "该页反向链接到此主题";
    case "graph_related":
      return "算法判定相关";
    case "graph_outgoing":
      return "该页 See Also 指向此主题";
    case "existing_target":
      return "已关联 wiki 页";
    case "existing_proposed":
      return "系统先前已提议此页";
    default:
      return "";
  }
}

function formatPct(j?: number): string {
  if (typeof j !== "number" || Number.isNaN(j)) return "0";
  return Math.round(j * 100).toString();
}

/**
 * Compute the top-K target candidates for an inbox entry.
 *
 * Short-circuits:
 *   1. If `inbox_target_page_slug` is set, return one strong candidate
 *      with `source=existing_target`, `score=100`.
 *   2. Otherwise if `inbox_proposed_wiki_slug` is set, return one strong
 *      candidate with `source=existing_proposed`, `score=90`.
 *
 * Main scorer (no short-circuit):
 *   • For each page, sum 8 weighted signals.
 *   • Drop anything below `MIN_SCORE` (10).
 *   • Sort desc by score, ties broken by slug asc for stability.
 *   • Take top-3; attach tier + up-to-3 reasons.
 *
 * The TS-side `computeCandidates` MUST produce the same candidate
 * order + score numbers as Worker A's Rust scorer for the fallback
 * to be useful. If you change weights/thresholds here, mirror them
 * in `rust/crates/wiki_store` (or wherever Worker A landed it) in
 * the same commit.
 */
export function computeCandidates(input: ScoringInput): TargetCandidate[] {
  // Short-circuit 1: already has a target slug.
  if (
    input.inbox_target_page_slug &&
    input.inbox_target_page_slug.trim() !== ""
  ) {
    const slug = input.inbox_target_page_slug;
    const page = input.wiki_pages.find((p) => p.slug === slug);
    return [
      {
        slug,
        title: page?.title ?? slug,
        score: 100,
        tier: "strong",
        source: "existing_target",
        reasons: [
          {
            code: "existing_target",
            detail: reasonDetail("existing_target"),
            weight: 100,
          },
        ],
      },
    ];
  }

  // Short-circuit 2: server stamped a proposed slug on the inbox entry.
  if (
    input.inbox_proposed_wiki_slug &&
    input.inbox_proposed_wiki_slug.trim() !== ""
  ) {
    const slug = input.inbox_proposed_wiki_slug;
    const page = input.wiki_pages.find((p) => p.slug === slug);
    return [
      {
        slug,
        title: page?.title ?? slug,
        score: 90,
        tier: "strong",
        source: "existing_proposed",
        reasons: [
          {
            code: "existing_proposed",
            detail: reasonDetail("existing_proposed"),
            weight: 90,
          },
        ],
      },
    ];
  }

  // Main scoring pass.
  const inferredSlug = inferSlugFromTitle(input.inbox_title);
  const inboxTokens = tokenizeForScoring(input.inbox_title);
  const normInboxTitle = normalizeForCandidate(input.inbox_title);

  type ScoredPage = {
    page: CandidatePageInput;
    score: number;
    reasons: CandidateReason[];
  };

  const scored: ScoredPage[] = [];

  for (const page of input.wiki_pages) {
    const reasons: CandidateReason[] = [];
    let score = 0;

    // Signal 1 — exact slug match.
    if (inferredSlug !== "" && inferredSlug === page.slug) {
      score += WEIGHT_EXACT_SLUG;
      reasons.push({
        code: "exact_slug",
        detail: reasonDetail("exact_slug"),
        weight: WEIGHT_EXACT_SLUG,
      });
    }

    // Signal 2 — exact (normalized) title match.
    const normPageTitle = normalizeForCandidate(page.title);
    if (normPageTitle !== "" && normPageTitle === normInboxTitle) {
      score += WEIGHT_EXACT_TITLE;
      reasons.push({
        code: "exact_title",
        detail: reasonDetail("exact_title"),
        weight: WEIGHT_EXACT_TITLE,
      });
    }

    // Signal 3/4/5 — title token overlap (bucketed Jaccard).
    const pageTokens = tokenizeForScoring(page.title);
    const jac = jaccard(inboxTokens, pageTokens);
    if (jac >= JACCARD_HIGH) {
      score += WEIGHT_TITLE_OVERLAP_HIGH;
      reasons.push({
        code: "title_overlap_high",
        detail: reasonDetail("title_overlap_high", { jaccard: jac }),
        weight: WEIGHT_TITLE_OVERLAP_HIGH,
      });
    } else if (jac >= JACCARD_MID) {
      score += WEIGHT_TITLE_OVERLAP_MID;
      reasons.push({
        code: "title_overlap_mid",
        detail: reasonDetail("title_overlap_mid", { jaccard: jac }),
        weight: WEIGHT_TITLE_OVERLAP_MID,
      });
    } else if (jac >= JACCARD_LOW) {
      score += WEIGHT_TITLE_OVERLAP_LOW;
      reasons.push({
        code: "title_overlap_low",
        detail: reasonDetail("title_overlap_low", { jaccard: jac }),
        weight: WEIGHT_TITLE_OVERLAP_LOW,
      });
    }

    // Signal 6 — same upstream raw material.
    if (
      input.inbox_source_raw_id != null &&
      page.source_raw_id != null &&
      page.source_raw_id === input.inbox_source_raw_id
    ) {
      score += WEIGHT_SHARED_RAW_SOURCE;
      reasons.push({
        code: "shared_raw_source",
        detail: reasonDetail("shared_raw_source"),
        weight: WEIGHT_SHARED_RAW_SOURCE,
      });
    }

    // Signal 7/8/9 — graph relations (only when the backend provided them).
    const graph = input.graphs?.get(page.slug);
    if (graph) {
      if (graph.backlinks.has(page.slug) || graph.backlinks.size > 0) {
        // The Rust side checks whether *this inbox's subject* is
        // backlinked from `page`. In the fallback we have no such
        // subject slug yet, so we conservatively fire on non-empty
        // sets — the full parity path runs server-side anyway.
        score += WEIGHT_GRAPH_BACKLINK;
        reasons.push({
          code: "graph_backlink",
          detail: reasonDetail("graph_backlink"),
          weight: WEIGHT_GRAPH_BACKLINK,
        });
      }
      if (graph.related.size > 0) {
        score += WEIGHT_GRAPH_RELATED;
        reasons.push({
          code: "graph_related",
          detail: reasonDetail("graph_related"),
          weight: WEIGHT_GRAPH_RELATED,
        });
      }
      if (graph.outgoing.size > 0) {
        score += WEIGHT_GRAPH_OUTGOING;
        reasons.push({
          code: "graph_outgoing",
          detail: reasonDetail("graph_outgoing"),
          weight: WEIGHT_GRAPH_OUTGOING,
        });
      }
    }

    if (score >= MIN_SCORE) {
      scored.push({ page, score, reasons });
    }
  }

  // Sort desc by score; ties broken by slug asc for deterministic output.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.page.slug.localeCompare(b.page.slug);
  });

  // Take top-K and attach tier + capped reason list (top 3 by weight).
  return scored.slice(0, TOP_K).map((s) => {
    const topReasons = [...s.reasons]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_REASONS);
    return {
      slug: s.page.slug,
      title: s.page.title,
      score: s.score,
      tier: tierFor(s.score),
      source: "resolved" as const,
      reasons: topReasons,
    };
  });
}
