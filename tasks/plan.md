# Agent Runtime Implementation Plan

## Status: In Progress
**Last updated**: 2026-04-06
**Commit baseline**: `9391ad8` (Phase 1 agentic loop skeleton complete)

---

## Dependency Graph

```
                      ┌───────────────────────┐
                      │  Phase 1: Agentic Loop │ ✅ DONE
                      │  (agentic_loop.rs)     │
                      └───────────┬───────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                 ▼
    ┌────────────────┐  ┌────────────────┐  ┌──────────────┐
    │ Phase 2: Wire  │  │ Phase 3: System│  │ Phase 4:     │
    │ Loop into      │  │ Prompt + CLAUDE│  │ Frontend SSE │
    │ append_user_msg│  │ .md loading    │  │ Permission   │
    └───────┬────────┘  └───────┬────────┘  │ Wiring       │
            │                   │           └──────┬───────┘
            └───────────┬───────┘                  │
                        ▼                          │
              ┌──────────────────┐                 │
              │ Phase 5: End-to- │◄────────────────┘
              │ End Integration  │
              │ Test             │
              └────────┬─────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
  ┌──────────────┐ ┌─────────┐ ┌──────────────┐
  │Phase 6: Text │ │Phase 7: │ │Phase 8:      │
  │Delta Streaming│ │Frontend │ │Cancel +      │
  │(token-by-    │ │Cleanup  │ │Robustness    │
  │token)        │ │(stubs,  │ │              │
  │              │ │dual     │ │              │
  │              │ │state)   │ │              │
  └──────────────┘ └─────────┘ └──────────────┘
```

---

## Phase 1: Async Agentic Loop ✅ COMPLETE

**Commit**: `9391ad8`
**Files created**: `rust/crates/desktop-core/src/agentic_loop.rs`
**Files modified**: `rust/crates/desktop-core/src/lib.rs`, `Cargo.toml`

**What was done**:
- `run_agentic_loop()`: async loop — call LLM → parse tool_use → execute_tool → loop
- `PermissionGate`: oneshot channel bridge for async frontend permission prompting
- `DesktopSessionEvent` +2 variants: `PermissionRequest`, `TextDelta`
- `DesktopState` +2 fields: `permission_gates`, `cancel_tokens`
- `forward_permission_decision` real implementation (was TODO stub)

---

## Phase 2: Wire Agentic Loop into Session Flow

**Goal**: Replace the existing `spawn_blocking(turn_executor.execute_turn(...))` call in `append_user_message` with the new async agentic loop, so that sending a message triggers real tool execution.

### Task 2.1: Resolve provider credentials at turn start
**File**: `rust/crates/desktop-core/src/lib.rs`
- In `append_user_message`, after validating the session:
  - Read the session's configured provider from managed_auth
  - Obtain `bearer_token` and `bridge_base_url` from `DesktopManagedAuthRuntimeClient`
  - Determine `model` from session metadata or settings
- **Acceptance criteria**: Given a session with a configured provider, the agentic loop receives valid credentials
- **Verification**: `cargo check -p desktop-server` passes; add unit test that constructs config

### Task 2.2: Spawn agentic loop instead of blocking executor
**File**: `rust/crates/desktop-core/src/lib.rs`
- In `append_user_message`, replace the `tokio::spawn(run_background_turn(...))` block with:
  ```rust
  let cancel_token = CancellationToken::new();
  let permission_gate = Arc::new(PermissionGate::new(sender.clone(), session_id.clone()));
  // Store gate and token for this session
  self.permission_gates.write().await.insert(session_id.clone(), permission_gate.clone());
  self.cancel_tokens.write().await.insert(session_id.clone(), cancel_token.clone());

  tokio::spawn(async move {
      let result = agentic_loop::run_agentic_loop(session, config, sender, session_id, permission_gate, cancel_token).await;
      state.finalize_agentic_turn(&session_id, result).await;
  });
  ```
- Add `finalize_agentic_turn` method that updates session store, sets turn_state=Idle, persists, broadcasts final Snapshot
- **Acceptance criteria**: Sending a message to a session triggers the agentic loop; the old `run_background_turn` is no longer called for agentic sessions
- **Verification**: Start backend, create session, send message via curl, observe SSE events including assistant text

### Task 2.3: Wire cancel_session to CancellationToken
**File**: `rust/crates/desktop-core/src/lib.rs`
- In `cancel_session`, look up and cancel the token:
  ```rust
  if let Some(token) = self.cancel_tokens.read().await.get(session_id) {
      token.cancel();
  }
  ```
- **Acceptance criteria**: Calling cancel during a running turn stops the loop
- **Verification**: Start a long turn, POST cancel, observe turn_state returns to Idle

### Checkpoint 2:
```bash
cargo check -p desktop-server  # compiles
# Manual test: send message → see SSE events with tool_use + tool_result
```

---

## Phase 3: System Prompt + CLAUDE.md Loading

**Goal**: Build a proper system prompt including tool descriptions and project context.

### Task 3.1: Create system_prompt.rs
**File**: `rust/crates/desktop-core/src/system_prompt.rs` (new)
- `build_system_prompt(project_path, tool_specs) -> String`
- Include: agent preamble, tool descriptions with JSON schemas, working directory context
- **Acceptance criteria**: Returns a coherent system prompt string with all tool definitions
- **Verification**: Unit test asserting prompt contains tool names and schemas

### Task 3.2: CLAUDE.md discovery
**File**: `rust/crates/desktop-core/src/system_prompt.rs`
- `find_claude_md(project_path) -> Option<String>`
- Walk upward from project_path, check for `CLAUDE.md` and `.claude/CLAUDE.md`
- Deduplicate if both exist at same level
- **Acceptance criteria**: Finds CLAUDE.md at project root or parent directories
- **Verification**: Unit test with temp directory containing CLAUDE.md

### Task 3.3: Integrate into agentic loop config
**File**: `rust/crates/desktop-core/src/lib.rs` (in the spawn site)
- Call `build_system_prompt()` before spawning the agentic loop
- Pass as `config.system_prompt`
- **Acceptance criteria**: Every turn includes tool definitions and CLAUDE.md content in system prompt
- **Verification**: Log the system prompt length; confirm it includes tool schemas

### Checkpoint 3:
```bash
cargo check -p desktop-server  # compiles
# Manual test: create CLAUDE.md in project → send message → LLM sees context
```

---

## Phase 4: Frontend SSE Permission Wiring

**Goal**: When the agentic loop emits a `PermissionRequest` SSE event, the frontend shows the dialog and forwards the decision back.

### Task 4.1: Add permission_request listener to SSE subscription
**File**: `apps/desktop-shell/src/lib/tauri.ts`
- In `subscribeToSessionEvents`, add event listener for `"permission_request"` events
- Parse payload and call `handlers.onPermissionRequest?.(payload)`
- Add `onPermissionRequest` to the handlers type
- **Acceptance criteria**: SSE permission_request events are captured and forwarded
- **Verification**: Console log shows permission events during tool execution

### Task 4.2: Dispatch permission events to Redux
**File**: `apps/desktop-shell/src/features/session-workbench/SessionWorkbenchPage.tsx`
- In the `subscribeToSessionEvents` call, add `onPermissionRequest` handler:
  ```typescript
  onPermissionRequest: (payload) => {
    dispatch(setPendingPermission({
      id: payload.request_id,
      toolName: payload.tool_name,
      toolInput: JSON.parse(payload.tool_input),
      riskLevel: inferToolRiskLevel(payload.tool_name),
    }));
  }
  ```
- **Acceptance criteria**: PermissionDialog appears when backend requests permission
- **Verification**: Set bypass_permissions=false, trigger bash tool, dialog appears

### Task 4.3: Verify full permission round-trip
- Frontend shows dialog → user clicks Allow → `forwardPermissionDecision()` called → backend resolves oneshot → tool executes → result broadcast
- **Acceptance criteria**: End-to-end permission flow works without errors
- **Verification**: Manual test with all 3 decisions (Allow, Deny, Allow Always)

### Checkpoint 4:
```bash
npm run dev  # frontend starts without errors
# Manual test: permission dialog → Allow → tool executes → result shows
```

---

## Phase 5: End-to-End Integration Test

**Goal**: Verify the complete flow works: message → LLM → tool_use → local execution → tool_result → LLM continues → final response.

### Task 5.1: Backend integration test
**File**: `rust/crates/desktop-server/src/lib.rs` (test section)
- Add test: create session → append message → subscribe to SSE → verify events include tool_use + tool_result
- May need mock LLM endpoint for deterministic testing
- **Acceptance criteria**: Automated test validates the full agentic turn
- **Verification**: `cargo test -p desktop-server`

### Task 5.2: Manual end-to-end test script
**File**: `tasks/e2e-test.sh` (new)
- Script that: starts backend, creates session, sends "read the file README.md", verifies SSE output
- **Acceptance criteria**: Script exits 0 when flow works correctly

### Checkpoint 5:
```bash
cargo test -p desktop-server  # passes
bash tasks/e2e-test.sh        # passes
```

---

## Phase 6: Text Delta Streaming (Token-by-Token)

**Goal**: Instead of waiting for the full LLM response, stream each text token to the frontend in real time.

### Task 6.1: Switch agentic loop to streaming API calls
**File**: `rust/crates/desktop-core/src/agentic_loop.rs`
- Change `call_llm_api` to send `"stream": true` and consume SSE response
- Parse Anthropic SSE events (content_block_delta with text_delta)
- Broadcast `TextDelta` events as tokens arrive
- Accumulate full response for tool_use extraction
- **Acceptance criteria**: Frontend receives text tokens incrementally
- **Verification**: Watch SSE stream; text_delta events appear before message event

### Task 6.2: Frontend streaming text display
**File**: `apps/desktop-shell/src/features/session-workbench/SessionWorkbenchTerminal.tsx`
- Listen for `text_delta` SSE events
- Append to a streaming buffer in Redux or local state
- Render the partial text in the message list
- On `message` event (complete), finalize the message
- **Acceptance criteria**: User sees text appear character by character
- **Verification**: Visual inspection; text appears progressively

### Checkpoint 6:
```bash
# Manual test: send message → watch text appear token-by-token
```

---

## Phase 7: Frontend Cleanup

**Goal**: Fix architectural issues and remove stubs.

### Task 7.1: Eliminate session dual state
**Files**: `store/slices/sessions.ts`, `SessionWorkbenchSidebar.tsx`, `SessionWorkbenchPage.tsx`
- Remove `list` from Redux sessions slice
- All session list reads go through React Query `["desktop-workbench"]`
- Keep only `activeSessionId`, `isStreaming`, `streamingContent` in Redux
- **Acceptance criteria**: No session data in both Redux and React Query simultaneously
- **Verification**: Redux DevTools shows no `sessions.list`; sidebar still renders

### Task 7.2: Remove stub commands
**File**: `features/session-workbench/commandExecutor.ts`
- Remove or clearly mark the 8 non-functional commands: `/doctor`, `/init`, `/login`, `/logout`, `/memory`, `/model`, `/terminal-setup`, `/vim`
- **Acceptance criteria**: No "Coming soon" placeholder responses
- **Verification**: Type `/` in input → only functional commands shown

### Task 7.3: Type contract unification
**File**: `apps/desktop-shell/src/types/protocol.ts` (new)
- Extract shared types from `lib/tauri.ts`
- Ensure `ConversationMessage` matches backend `DesktopConversationMessage`
- **Acceptance criteria**: Single source of truth for message types
- **Verification**: TypeScript compilation passes

### Task 7.4: Dead code removal
- Remove unused `AppsPage` import in `HomePage.tsx`
- Remove unused `onExportSession` callback in `SessionWorkbenchSidebar.tsx`
- Clean up unused imports across modified files
- **Acceptance criteria**: No dead code warnings from linter
- **Verification**: `npx tsc --noEmit` passes clean

### Checkpoint 7:
```bash
cd apps/desktop-shell && npx tsc --noEmit  # no type errors
npm run dev                                 # no console errors
```

---

## Phase 8: Cancellation + Robustness

**Goal**: Handle edge cases gracefully.

### Task 8.1: Incremental persistence during loop
**File**: `rust/crates/desktop-core/src/agentic_loop.rs`
- After each loop iteration, persist the session state to disk
- Prevents data loss on crash mid-loop
- **Acceptance criteria**: If process crashes during turn, session recovers with partial state
- **Verification**: Kill process mid-turn, restart, verify messages are preserved

### Task 8.2: Error recovery in agentic loop
**File**: `rust/crates/desktop-core/src/agentic_loop.rs`
- On API error: create error message, broadcast, set turn_state=Idle
- On tool panic: catch via spawn_blocking, create error tool_result, continue loop
- On max iterations: create system message explaining limit
- **Acceptance criteria**: No turn gets stuck in Running state forever
- **Verification**: Simulate API timeout, verify session returns to Idle

### Task 8.3: Cleanup gates and tokens on turn completion
**File**: `rust/crates/desktop-core/src/lib.rs`
- In `finalize_agentic_turn`, remove the session's permission_gate and cancel_token
- Prevents memory leak for long-lived sessions
- **Acceptance criteria**: HashMap sizes stay bounded
- **Verification**: Create 10 sessions, run turns, check hashmap sizes

### Checkpoint 8:
```bash
cargo test -p desktop-server  # all tests pass
# Stress test: rapid send/cancel cycles → no panics
```

---

## Future Phases (Not Scoped Yet)

| Phase | Description | Dependency |
|-------|-------------|------------|
| 9 | MCP Client (connect to MCP servers, expose tools) | Phase 5 |
| 10 | Sub-agent spawning (Agent tool implementation) | Phase 5 |
| 11 | Plan Mode (EnterPlanMode/ExitPlanMode) | Phase 5 |
| 12 | Session compaction/fork | Phase 5 |
| 13 | TodoWrite tracking | Phase 5 |
| 14 | Hooks system (PreToolUse/PostToolUse) | Phase 5 |
| 15 | Windows terminal support | Independent |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| CWD contention between sessions | Tool writes to wrong directory | Process-wide CWD mutex (already exists) + turn_lock serializes |
| code_tools_bridge format mismatch | Tool schemas rejected by upstream | Use `tools::mvp_tool_specs()` which matches Claude API format |
| Permission timeout blocks turn | Session stuck in Running | 5-min timeout with auto-deny; cancel_token as escape hatch |
| Large tool output overwhelms SSE | Frontend freeze | Truncate tool output at 100KB (match Claude Code behavior) |
| Upstream API rate limit | Turn fails mid-loop | Retry with backoff on 429; create error tool_result on persistent failure |
