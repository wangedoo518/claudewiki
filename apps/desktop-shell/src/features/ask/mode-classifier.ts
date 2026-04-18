/**
 * A1 sprint — client-side context-mode classifier.
 *
 * Decides which `ContextMode` the UI should hint at (and post to the
 * backend) based on the user's draft message plus whatever inline
 * context the composer carries (e.g. a selected source id from the
 * raw-entry picker, or a detected URL in the draft).
 *
 * Explorer B's decision tree (canonical):
 *
 *   function classifyMode(message, selectedSourceId?, hasFocusedRaw?) {
 *     if (hasCombineExplicitPhrase(message)) return 'combine';
 *     if (hasDoubtCue(message) && hasUrl(message)) return 'follow_up';
 *     if (hasUrl(message) && hasSummarizeIntent(message)
 *           && !hasFollowUpCue(message)) return 'source_first';
 *     if (selectedSourceId && !hasFollowUpCue(message)) return 'source_first';
 *     return 'follow_up';
 *   }
 *
 * Keyword tables are bilingual (Chinese + English) and exported as
 * `const` so the test file (and other call sites — e.g. the inline
 * URL-detect chip) can reuse them.
 *
 * Result shape carries a `confidence` tag the UI can surface as
 * "high/medium/low" coloring plus a `reasons` trail for debuggability.
 * No network I/O; no React hooks — pure function, safe to call on every
 * keystroke.
 */

import type { ContextMode } from "@/lib/tauri";

/**
 * Keyword fragments that strongly indicate the user wants the backend
 * to SUMMARISE / ANALYSE / EXPLAIN a source (as opposed to continuing
 * a conversation).
 */
export const SUMMARIZE_INTENT_KEYWORDS = [
  // Chinese
  "总结", "摘要", "提炼", "看看", "分析", "讲讲", "读一下",
  "这个讲了什么", "讲了什么", "帮我", "是什么",
  // English (lower-case; we compare case-insensitively)
  "summarize", "summary", "tldr", "analyze", "analyse", "read",
  "explain", "what", "tell me about",
] as const;

/**
 * Keyword fragments that indicate the user is continuing a prior
 * thread ("tell me more", "what about", "then", ...).
 */
export const FOLLOW_UP_CUE_KEYWORDS = [
  // Chinese
  "再", "继续", "那它", "所以呢", "接着", "然后", "而且", "另外",
  "那这个",
  // English
  "then", "so", "next", "also", "what about", "additionally",
] as const;

/**
 * Keyword fragments that explicitly ask the model to COMBINE the
 * source with prior history (both worlds at once).
 */
export const COMBINE_KEYWORDS = [
  // Chinese
  "结合", "加上", "综合", "对比", "比较", "用这个", "基于这个",
  "同时考虑", "一起", "和前面",
  // English
  "combine", "together with", "based on this", "compare", "contrast",
] as const;

/**
 * Doubt cues — when present with a URL, they OVERRIDE `source_first`
 * back to `follow_up` because the user is questioning something
 * previously said, not asking for a fresh summary of the link.
 */
export const DOUBT_CUE_KEYWORDS = [
  // Chinese (the task spec is Chinese-only for this bucket)
  "你说过", "之前", "还是说", "是不是", "对不对",
] as const;

/** Strict URL regex — matches `http://` or `https://` followed by
 * non-whitespace and non-CJK punctuation. Lifted from the existing
 * `AskWorkbench.extractUrl` implementation so the two stay in sync. */
const URL_PATTERN = /https?:\/\/[^\s，。！？]+/i;

/** Extract the first URL from a message, or `null` if none. */
export function extractFirstUrl(message: string): string | null {
  const m = message.match(URL_PATTERN);
  return m ? m[0] : null;
}

function matchAny(needle: string, haystack: readonly string[]): string | null {
  const lower = needle.toLowerCase();
  for (const k of haystack) {
    // All keywords are stored lower-case; Chinese is case-invariant.
    if (lower.includes(k)) return k;
  }
  return null;
}

/** @internal — exported for unit tests. */
export function hasUrl(message: string): boolean {
  return URL_PATTERN.test(message);
}

/** @internal — exported for unit tests. */
export function hasSummarizeIntent(message: string): boolean {
  return matchAny(message, SUMMARIZE_INTENT_KEYWORDS) !== null;
}

/** @internal — exported for unit tests. */
export function hasFollowUpCue(message: string): boolean {
  return matchAny(message, FOLLOW_UP_CUE_KEYWORDS) !== null;
}

/** @internal — exported for unit tests. */
export function hasCombineExplicitPhrase(message: string): boolean {
  return matchAny(message, COMBINE_KEYWORDS) !== null;
}

/** @internal — exported for unit tests. */
export function hasDoubtCue(message: string): boolean {
  return matchAny(message, DOUBT_CUE_KEYWORDS) !== null;
}

export interface ClassifyResult {
  mode: ContextMode;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface ClassifyOptions {
  /** Raw-entry / URL id the user has explicitly pinned in the composer.
   *  Presence nudges the default toward `source_first`. */
  selectedSourceId?: string;
  /** Legacy — true when the user has an inline focused raw (e.g. the
   *  side-panel "currently reading" raw). Treated the same as
   *  `selectedSourceId` for routing purposes. */
  hasFocusedRaw?: boolean;
}

/**
 * Classify the current composer state into a `ContextMode` hint.
 *
 * Pure function. Called on every keystroke; keep fast (regex + set
 * lookup only, no allocations in the hot path beyond the result array).
 */
export function classifyContextMode(
  message: string,
  opts: ClassifyOptions = {},
): ClassifyResult {
  const reasons: string[] = [];

  // Rule 1 — explicit combine wins over everything.
  if (hasCombineExplicitPhrase(message)) {
    const kw = matchAny(message, COMBINE_KEYWORDS);
    reasons.push(`combine keyword: "${kw}"`);
    return { mode: "combine", confidence: "high", reasons };
  }

  const urlPresent = hasUrl(message);
  const doubtPresent = hasDoubtCue(message);

  // Rule 2 — doubt cue + URL ⇒ follow_up (override). User is
  // questioning something previously said; don't treat the URL as
  // a fresh "read this" signal.
  if (doubtPresent && urlPresent) {
    const kw = matchAny(message, DOUBT_CUE_KEYWORDS);
    reasons.push(`doubt cue override: "${kw}" + URL`);
    return { mode: "follow_up", confidence: "high", reasons };
  }

  const summarizePresent = hasSummarizeIntent(message);
  const followUpPresent = hasFollowUpCue(message);

  // Rule 3 — URL + summarize intent + no follow-up cue ⇒ source_first.
  if (urlPresent && summarizePresent && !followUpPresent) {
    reasons.push("url present");
    reasons.push(`summarize intent: "${matchAny(message, SUMMARIZE_INTENT_KEYWORDS)}"`);
    return { mode: "source_first", confidence: "high", reasons };
  }

  // Rule 4 — selected source pin (no follow-up cue) ⇒ source_first.
  const hasPin = Boolean(opts.selectedSourceId) || Boolean(opts.hasFocusedRaw);
  if (hasPin && !followUpPresent) {
    reasons.push(
      opts.selectedSourceId
        ? `selected source id: ${opts.selectedSourceId}`
        : "focused raw present",
    );
    // medium confidence because the pin alone (no intent keyword) is
    // a weak-ish signal; user might just be typing casually.
    return { mode: "source_first", confidence: "medium", reasons };
  }

  // Fallback — follow_up.
  if (followUpPresent) {
    reasons.push(`follow-up cue: "${matchAny(message, FOLLOW_UP_CUE_KEYWORDS)}"`);
    return { mode: "follow_up", confidence: "high", reasons };
  }
  if (urlPresent) {
    reasons.push("url present but no summarize intent");
    return { mode: "follow_up", confidence: "low", reasons };
  }

  reasons.push("default (no strong signal)");
  return { mode: "follow_up", confidence: "low", reasons };
}
