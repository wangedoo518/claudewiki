---
title: Phase 2 Closure
doc_type: plan
status: closed
owner: desktop-shell
last_verified: 2026-04-24
related:
  - docs/desktop-shell/plans/2026-04-24-phase-2-readiness-audit.md
  - docs/desktop-shell/plans/2026-04-24-phase-2-to-4-long-run-checklist.md
  - backlog/phase1-deferred.md
---

# Phase 2 Closure

Phase 2 is closed at code-readiness level. The sprint goal changed from a
14-day feature build to a validation/gap-fill sprint after the pre-land scan
showed that most query, WeChat, absorb, and merge surfaces were already present.

The operating loop stayed: `pre-land scan -> audit -> gap-fill ->
trust-but-verify`. Phase 2 should not keep accepting new feature work. New work
now belongs in Phase 2.5 architecture debt or Phase 3 patrol/quality.

## Closure Matrix

| Area | Closure status | Evidence |
| --- | --- | --- |
| Provider runtime fallback | Closed | Local ignored `.claw/providers.json` can activate an OpenAI-compatible provider. Provider config tolerates BOM and `/api/wiki/absorb` now returns `503 BROKER_UNAVAILABLE` for non-empty batches when runtime auth is unavailable. |
| `/api/wiki/query` | Closed | HTTP smoke streams `query_chunk`, `query_done`, and source metadata. `query_wiki` covers empty-wiki friendly failure and source propagation. |
| Ask query frontend | Closed | Ask `?question` and `/query question` route through `useWikiQuery`; source DTOs live under `src/api/wiki/types.ts`, not the ingest feature barrel. |
| WeChat Kefu `?` query | Closed by mock/handler coverage | `?` and full-width `？` classification call `query_wiki`; formatted replies include sources. Real device pass remains environment-dependent. |
| URL/text ingest conflict notification | Closed by mock/handler coverage | Conflict inbox entries are formatted and surfaced through Kefu notification helpers for both URL and text ingest paths. |
| Absorb progress UI | Closed | `AbsorbEventsBridge` consumes `/api/wiki/absorb/events`; `AbsorbTriggerButton` no longer relies on `last_absorb_at` polling. |
| UX item 11 | Closed | `WikiFileTree` supports roving focus and ArrowUp/ArrowDown/Home/End/ArrowLeft/ArrowRight navigation. |
| UX item 12 | Closed | `WikiArticle` displays `confidence` and `last_verified`; `wiki_store` persists and surfaces both fields. |
| Merge / update branch | Closed | `absorb_batch` update path uses the LLM merge prompt/parser, and W2 proposal/apply has HTTP smoke coverage. |
| Bidirectional link visibility | Closed | Backlinks/index/page graph parse frontend wikilinks `[[slug]]`, `[[slug|label]]`, and anchors in addition to `concepts/{slug}.md` Markdown links. |

## Residual Risk

The only Phase 2 residual is live enterprise WeChat/device E2E. Code readiness is
covered by handler/mock tests, but a real credential/device pass must be tracked
as an environment validation item, not as blocking application code.

## Verification Set

Use this set when re-validating the closure:

```bash
cd rust
cargo test -p wiki_maintainer query_wiki
cargo test -p wiki_maintainer absorb_batch
cargo test -p desktop-server query_wiki_http_smoke
cargo test -p desktop-server proposal_http_smoke
cargo test -p desktop-core wechat_kefu
cargo check --workspace

cd ../apps/desktop-shell/src-tauri
cargo check

cd ..
npm run build
```

Expected warnings today:

- `redis v0.25.4` future-incompat warning from the Rust workspace.
- Existing Tauri unused/dead-code warnings.
- Existing Vite CSS/chunk warnings.

## Handoff

- Phase 2.5: continue architecture debt only, especially handler-body extraction
  from `desktop-server/src/lib.rs` and any remaining `src/lib/tauri.ts` boundary
  cleanup.
- Phase 3: start `wiki_patrol` dashboardization, quality sampling, stale/orphan
  surfacing, and cleanup proposals.
