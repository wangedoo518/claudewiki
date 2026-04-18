/**
 * R1 sprint — classifier for raw Ask-runtime error strings into a
 * coarse kind that the UI can map to a friendly `FailureBanner`.
 *
 * Background: the Desktop runtime propagates errors as plain strings
 * through `DesktopState::send_message` → React Query `mutation.error`.
 * Those strings are authored for ops-style logs ("failed to resolve
 * model authentication: missing Anthropic credentials; export
 * ANTHROPIC_AUTH_TOKEN ...") and are useless — even intimidating — to
 * the end user sitting in Ask.
 *
 * This module is deliberately conservative:
 *
 *   - Pattern matching is regex-based and case-insensitive where it
 *     makes sense, but every pattern is keyed on a phrase the Rust
 *     side explicitly emits (see `crates/ask-runtime/*.rs`). We do
 *     NOT guess based on English verbs — that would false-positive on
 *     legitimate assistant replies that happen to contain "failed".
 *
 *   - Unknown errors fall through to `{ kind: "unknown" }`. The UI
 *     treats `unknown` as "show a generic failure banner with the raw
 *     string under the technical-detail `<details>`" so we never hide
 *     information; we only reshape the high-frequency known kinds.
 *
 *   - `classifyAskError` is a pure function and has no React deps so
 *     it can also be used from Message.tsx's ErrorMessage renderer
 *     (where `text` blocks sometimes carry the same strings) and from
 *     future unit tests.
 */

export type AskErrorKind =
  | "credentials_missing"
  | "broker_empty"
  | "session_not_found"
  | "url_enrich_failed"
  | "unknown";

export interface AskErrorClassification {
  kind: AskErrorKind;
  raw: string;
}

/** Patterns that gate each non-`unknown` branch. Order matters:
 *  credentials_missing is checked before broker_empty because the
 *  former is the strict subset (no account at all vs. account pool
 *  temporarily empty). */
const PATTERNS: Array<{ kind: AskErrorKind; re: RegExp }> = [
  {
    kind: "credentials_missing",
    re: /missing\s+anthropic\s+credentials|failed\s+to\s+resolve\s+model\s+authentication|no\s+api\s+key\s+configured|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY/i,
  },
  {
    kind: "broker_empty",
    re: /no\s+codex\s+account\s+available|broker.*(empty|no\s+accounts)|account\s+pool\s+(empty|exhausted)/i,
  },
  {
    kind: "session_not_found",
    re: /session\s+not\s+found|session\s+does\s+not\s+exist|unknown\s+session\s+id/i,
  },
  {
    kind: "url_enrich_failed",
    re: /url\s+enrich.*fail|failed\s+to\s+enrich\s+url|link\s+fetch\s+failed/i,
  },
];

export function classifyAskError(raw: string): AskErrorClassification {
  const text = raw ?? "";
  for (const { kind, re } of PATTERNS) {
    if (re.test(text)) {
      return { kind, raw: text };
    }
  }
  return { kind: "unknown", raw: text };
}

/**
 * Heuristic guard used by `Message.tsx`'s assistant-side error
 * renderer: does this text block *look* like a runtime failure marker
 * the user should see as a friendly banner, rather than a genuine
 * assistant reply? Only returns true when the block starts with one of
 * a small set of known marker prefixes so we don't accidentally
 * re-skin a legitimate reply that mentions "failed".
 */
export function looksLikeAskRuntimeError(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trimStart();
  return (
    /^Desktop runtime couldn't execute/i.test(trimmed) ||
    /^failed to resolve model authentication/i.test(trimmed) ||
    /^missing Anthropic credentials/i.test(trimmed) ||
    /^no codex account available/i.test(trimmed)
  );
}
