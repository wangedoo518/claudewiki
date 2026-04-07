# Performance Report — 2026-04-07

Baseline measurements from `bench_long_session_append_and_persist`
benchmark in `rust/crates/desktop-core/src/lib.rs`.

## How to run

```bash
cd rust
# Debug mode (10x slower, useful for finding correctness issues):
cargo test -p desktop-core bench_long_session -- --ignored --nocapture

# Release mode (production-representative):
cargo test -p desktop-core bench_long_session --release -- --ignored --nocapture
```

## Results

### Scenario
- 1 session, 200 turns, each turn appends 2 messages (user + assistant)
- Final session has 400 messages
- Each message is a ~70 char text block
- Persistence: full `DesktopStore` JSON serialized to a fixture file on each turn

### Release mode numbers

| Operation | n | Total | Avg | p50 | p99 | min | max |
|-----------|---|-------|-----|-----|-----|-----|-----|
| `append` (push 2 blocks) | 200 | 584µs | 2.92µs | 2.30µs | 12.80µs | 800ns | 16.90µs |
| `persist` (whole-store JSON write) | 200 | **135.43ms** | **677µs** | 638µs | **2.91ms** | 371µs | 3.07ms |
| `list_sessions` (1 session, 400 msgs) | 1 | — | — | — | — | — | 31.60µs |
| `get_session` (400 msgs) | 1 | — | — | — | — | — | 61.50µs |

### Debug mode numbers (for reference)

| Operation | Avg | p99 |
|-----------|-----|-----|
| append | 17.79µs | 245µs |
| persist | 1.85ms | 3.95ms |

## Analysis

### ✅ Fast paths
- `append` (push messages to the in-memory store) is **microseconds** — not a bottleneck.
- `list_sessions` and `get_session` are both under 100µs even with 400 messages — pagination/virtualization not required at this scale.

### 🔴 Persist is the dominant cost
- `persist()` is **232x slower than append** (677µs vs 2.92µs).
- Every `append_user_message` or `on_iteration_complete` callback triggers a full-store rewrite.
- For a 20-iteration turn that's ~14ms of persistence I/O in the critical path.
- For a 100-iteration session that's **~70ms**.

### Why is persist slow?
Looking at `DesktopPersistence::save()` (grep for `fn save` in `lib.rs`):
1. Reads the entire in-memory store
2. Serializes EVERYTHING to a JSON `Vec<u8>`
3. Writes the complete blob to disk in one syscall

The serialization cost scales with the **total number of messages across all sessions**, not just the delta. For a user with 10 sessions × 50 messages each, that's 500 messages serialized per turn — even if only one session was touched.

## Recommended optimizations (not yet implemented)

Ordered by impact vs. complexity:

### 1. Debounce persist calls (easy, ~10x win)
- Don't persist after every append — batch writes every 500ms or every 5 iterations
- Flush synchronously on turn completion (`finalize_agentic_turn`) for durability
- **Risk**: crash between debounce intervals could lose the last few messages
- **Mitigation**: keep an in-memory journal of pending writes, replay on startup

### 2. Per-session persistence files (medium, ~20x win for multi-session users)
- Split `sessions.json` into `sessions/{session_id}.json`
- Each persist writes only the affected session
- `list_sessions()` reads directory index (or a lightweight `index.json`)
- **Migration**: write a one-time migration that splits existing `sessions.json`

### 3. Binary persistence (hard, ~5x win but invasive)
- Replace JSON with `bincode` or `postcard`
- Much faster serialize/deserialize, smaller disk footprint
- **Risk**: breaks hand-inspection + debugging; tool for pretty-printing needed
- **Migration**: read-both-write-new transition period

### 4. Don't persist every iteration (easy, 10-100x win if combined with #1)
- `on_iteration_complete` currently persists every tool-use round
- For a 20-iteration turn that's 20 full writes
- Only the LAST state in a turn is durable-relevant — intermediate states are recoverable from the (already persisted) message log
- Change: in the persist callback, only write in-memory, defer disk flush to `finalize_agentic_turn`

## Next steps
- Implement #1 (debounce) + #4 (skip mid-turn disk flush) — they're fast wins with minimal risk
- Measure again with the same benchmark after changes
- Decide whether #2 is worth the migration complexity

## Benchmark environment
- Platform: Windows 11, x86_64
- Rustc: (as of 2026-04-07)
- Storage: local disk (not verified SSD vs HDD)
- Build profile: `--release`
- Persistence target: temp file, overwritten each turn
