# Task Checklist

## Phase 1: Async Agentic Loop ✅
- [x] Create `agentic_loop.rs` with `run_agentic_loop()`, `PermissionGate`, types
- [x] Extend `DesktopSessionEvent` with `PermissionRequest` + `TextDelta`
- [x] Add `permission_gates` + `cancel_tokens` to `DesktopState`
- [x] Implement `forward_permission_decision` (was TODO stub)
- [x] Add `tokio-util` dependency
- [x] `cargo check -p desktop-server` passes

## Phase 2: Wire Loop into Session Flow
- [ ] **2.1** Resolve provider credentials (bearer_token, bridge_url, model) at turn start
- [ ] **2.2** Replace `spawn_blocking(turn_executor)` with `tokio::spawn(run_agentic_loop)`
- [ ] **2.3** Add `finalize_agentic_turn()` method
- [ ] **2.4** Wire `cancel_session` to `CancellationToken`
- [ ] **Checkpoint**: Send message → see tool_use + tool_result in SSE stream

## Phase 3: System Prompt + CLAUDE.md
- [ ] **3.1** Create `system_prompt.rs` with `build_system_prompt()`
- [ ] **3.2** Implement `find_claude_md()` upward directory walk
- [ ] **3.3** Integrate into agentic loop config
- [ ] **Checkpoint**: LLM receives tool schemas + project context

## Phase 4: Frontend SSE Permission Wiring
- [ ] **4.1** Add `permission_request` listener in `subscribeToSessionEvents`
- [ ] **4.2** Dispatch to Redux `setPendingPermission`
- [ ] **4.3** Verify full round-trip: dialog → decision → tool executes
- [ ] **Checkpoint**: Permission dialog works end-to-end

## Phase 5: End-to-End Integration Test
- [ ] **5.1** Backend integration test (automated)
- [ ] **5.2** Manual e2e test script
- [ ] **Checkpoint**: `cargo test` + `e2e-test.sh` pass

## Phase 6: Text Delta Streaming
- [ ] **6.1** Switch to streaming API calls in agentic loop
- [ ] **6.2** Frontend streaming text display
- [ ] **Checkpoint**: Text appears token-by-token

## Phase 7: Frontend Cleanup
- [ ] **7.1** Eliminate session dual state (Redux vs React Query)
- [ ] **7.2** Remove 8 stub slash commands
- [ ] **7.3** Type contract unification (`protocol.ts`)
- [ ] **7.4** Dead code removal
- [ ] **Checkpoint**: `tsc --noEmit` + `npm run dev` clean

## Phase 8: Cancellation + Robustness
- [ ] **8.1** Incremental persistence during loop
- [ ] **8.2** Error recovery (API error, tool panic, max iterations)
- [ ] **8.3** Cleanup gates/tokens on turn completion
- [ ] **Checkpoint**: Stress test passes, no stuck sessions
