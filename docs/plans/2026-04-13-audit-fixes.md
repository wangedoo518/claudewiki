# ClawWiki 审计修复实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复审计发现的 1 个 P0 和 5 个 P1 关键漏洞，消除竞态条件、数据丢失和级联 panic 风险。

**Architecture:** 6 个独立修复，按依赖顺序执行。每个修复改 1-2 个文件，可独立验证。不涉及前端改动。

**Tech Stack:** Rust (desktop-core, wiki_store, codex_broker, wiki_maintainer)

---

### Task 1: 消除 CLAWWIKI_URL_CONTEXT 环境变量竞态（P0）

**Files:**
- Modify: `rust/crates/desktop-core/src/lib.rs:2999-3001` (maybe_enrich_url 返回值)
- Modify: `rust/crates/desktop-core/src/lib.rs:3310-3331` (OpenAI compat 路径)
- Modify: `rust/crates/desktop-core/src/lib.rs:4553-4561` (execute_live_turn 读取点)

**问题:** 全局 env var 在并发请求下互相覆盖。

**方案:** 改用 `DesktopTurnRequest` 新增字段传递 enriched 内容。

**Step 1: 给 DesktopTurnRequest 加 url_context 字段**

找到 `DesktopTurnRequest` struct，加一个 `pub url_context: Option<String>` 字段。

**Step 2: 发送端传入 url_context**

```rust
// 替换 lines 3310-3331
// 删除 set_var / remove_var
// 改为：
DesktopTurnRequest {
    message: message.clone(),
    project_path,
    url_context: if has_enrichment { Some(enriched.clone()) } else { None },
}
```

**Step 3: 接收端从 request 读取**

```rust
// 替换 lines 4553-4561 (execute_live_turn 里)
if let Some(ref ctx) = request.url_context {
    system_prompt.push(ctx.clone());
}
// 删除 std::env::var("CLAWWIKI_URL_CONTEXT") 读取
```

**Step 4: 删除所有 set_var/remove_var 调用**

**Step 5: 验证**
```bash
cargo check -p desktop-core
cargo test -p desktop-core
```

**Step 6: Commit**
```
fix(P0): replace global env var with per-turn url_context field
```

---

### Task 2: 给 write_raw_entry 加写锁（P1）

**Files:**
- Modify: `rust/crates/wiki_store/src/lib.rs:64-71` (加 RAW_WRITE_GUARD)
- Modify: `rust/crates/wiki_store/src/lib.rs:688` (write_raw_entry 加锁)

**问题:** next_raw_id() 无锁保护，并发调用产生重复 ID。

**Step 1: 加 RAW_WRITE_GUARD（复制 INBOX_WRITE_GUARD 模式）**

```rust
static RAW_WRITE_GUARD: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_raw_writes() -> MutexGuard<'static, ()> {
    RAW_WRITE_GUARD
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
```

**Step 2: write_raw_entry 开头加锁**

```rust
pub fn write_raw_entry(...) -> Result<RawEntry> {
    let _guard = lock_raw_writes();
    // ... 现有代码不变
}
```

**Step 3: 验证**
```bash
cargo test -p wiki_store
```

**Step 4: Commit**
```
fix(P1): guard write_raw_entry with RAW_WRITE_GUARD to prevent duplicate IDs
```

---

### Task 3: RwLock 毒化恢复（P1）

**Files:**
- Modify: `rust/crates/desktop-core/src/codex_broker.rs:292,303,321,339,446,480`

**问题:** 6 处 `.expect()` 在 RwLock 毒化时 panic。

**Step 1: 全局替换**

```rust
// 所有 6 处：
// 旧：.expect("broker pool RwLock poisoned")
// 新：.unwrap_or_else(|poisoned| poisoned.into_inner())
```

**Step 2: 验证**
```bash
cargo check -p desktop-core
cargo test -p desktop-core -- codex_broker
```

**Step 3: Commit**
```
fix(P1): RwLock poison recovery in codex_broker (6 sites)
```

---

### Task 4: LLM JSON 解析失败优雅降级（P1）

**Files:**
- Modify: `rust/crates/wiki_maintainer/src/lib.rs:125-151`

**问题:** LLM 返回非 JSON 时，Inbox 任务永久挂起。

**Step 1: 在 propose_for_raw_entry 的 parse_proposal 调用处加 fallback**

```rust
// Line 150: 替换
// 旧：parse_proposal(&raw_json, raw_id)
// 新：
match parse_proposal(&raw_json, raw_id) {
    Ok(proposal) => Ok(proposal),
    Err(e) => {
        eprintln!("[maintainer] LLM response parse failed: {e}");
        eprintln!("[maintainer] raw response: {}", raw_json.chars().take(200).collect::<String>());
        Err(e)
    }
}
```

注意：不在这里自动 reject（让用户决定），但记录详细日志帮助排查。

**Step 2: 验证**
```bash
cargo test -p wiki_maintainer
```

**Step 3: Commit**
```
fix(P1): log LLM parse failures with response preview for debugging
```

---

### Task 5: 删除 raw entry 时级联清理 Inbox（P1）

**Files:**
- Modify: `rust/crates/wiki_store/src/lib.rs:773-782` (delete_raw_entry)

**Step 1: 在文件删除后加 inbox 清理**

```rust
pub fn delete_raw_entry(paths: &WikiPaths, id: u32) -> Result<()> {
    let entries = list_raw_entries(paths)?;
    let entry = entries
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| WikiStoreError::NotFound(id))?;
    let path = paths.raw.join(&entry.filename);
    fs::remove_file(&path).map_err(|e| WikiStoreError::io(path, e))?;

    // Cascade: remove orphaned inbox entries referencing this raw id
    let _guard = lock_inbox_writes();
    let mut inbox = load_inbox_file(paths)?;
    let before = inbox.len();
    inbox.retain(|e| e.source_raw_id != Some(id));
    if inbox.len() != before {
        save_inbox_file(paths, &inbox)?;
    }
    Ok(())
}
```

**Step 2: 验证**
```bash
cargo test -p wiki_store
```

**Step 3: Commit**
```
fix(P1): cascade delete orphaned inbox entries when raw entry is removed
```

---

### Task 6: 后台写入串行化（P1）

**Files:**
- Modify: `rust/crates/desktop-core/src/lib.rs:2967-2984` (background spawn)

**问题:** tokio::spawn 里的 write_raw_entry 与主流程竞争。

**方案:** Task 2 的 RAW_WRITE_GUARD 已经解决了这个问题——write_raw_entry 内部加了锁，不管从哪里调用都是串行的。本 task 只需验证。

**Step 1: 验证 Task 2 的锁在 spawn 内也生效**

`RAW_WRITE_GUARD` 是 `static`，跨线程跨 task 都有效。tokio::spawn 内调用 `write_raw_entry()` 会自动获取锁。无需额外改动。

**Step 2: Commit（可合并到 Task 2）**

---

## 执行顺序

```
Task 2 (写锁) → Task 6 (验证) → Task 1 (env var) → Task 3 (RwLock) → Task 4 (LLM) → Task 5 (cascade)
```

Task 2 先做因为 Task 6 依赖它。其余独立。

## 验证清单

```bash
cargo check --workspace
cargo test --workspace
npx tsc --noEmit  # 前端无改动，但确认不破坏
```
