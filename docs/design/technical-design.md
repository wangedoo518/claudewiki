# ClawWiki v2.0 技术设计文档

> **文档版本**: v2.0-draft  
> **最后更新**: 2026-04-14  
> **作者**: Wang-Yeah623  
> **状态**: 设计阶段 (第一至五章)

本文档是 ClawWiki v2.0 的权威技术蓝图。所有后续开发必须严格遵循本文档中定义的 API 路径、数据模型字段和函数签名。

---

## 目录

- [第一章：架构概览](#第一章架构概览)
- [第二章：API 接口定义（v2）](#第二章api-接口定义v2)
- [第三章：数据模型](#第三章数据模型)
- [第四章：Rust 模块架构](#第四章rust-模块架构)
- [第五章：前端模块架构](#第五章前端模块架构)

---

## 第一章：架构概览

### 1.1 当前 Rust Workspace 依赖图 (v1)

```
                     ┌──────────────┐
                     │ desktop-cli  │
                     └──────┬───────┘
                            │ (启动入口)
                            ▼
                   ┌─────────────────┐
                   │ desktop-server  │  (Axum HTTP, port 4357)
                   │  105 routes     │
                   └────────┬────────┘
                            │ depends on
                            ▼
                   ┌─────────────────┐
                   │  desktop-core   │  (DesktopState, codex_broker,
                   │  ~6000 lines    │   wechat_ilink, providers_config,
                   │                 │   agentic_loop, BrokerAdapter)
                   └───┬────┬────┬───┘
                       │    │    │
          ┌────────────┘    │    └────────────┐
          ▼                 ▼                 ▼
  ┌──────────────┐ ┌───────────────┐ ┌──────────────┐
  │wiki_maintainer│ │  wiki_ingest  │ │    server     │
  │  643 lines   │ │  ~1200 lines  │ │ (vendor/parity│
  │  18 tests    │ │  64 tests     │ │  runtime)     │
  └──────┬───────┘ └──────┬────────┘ └──────────────┘
         │                │
         └───────┬────────┘
                 ▼
         ┌──────────────┐
         │  wiki_store   │  (~3200 lines, 87 tests)
         │  on-disk CRUD │  (raw/wiki/schema/inbox)
         └──────────────┘
```

**依赖流向规则**:
- `wiki_store` 是最底层 crate, 零内部依赖
- `wiki_maintainer` 和 `wiki_ingest` 依赖 `wiki_store`, 不依赖 `desktop-core`
- `desktop-core` 依赖 `wiki_maintainer` + `wiki_ingest` + `wiki_store`
- `desktop-server` 依赖 `desktop-core`
- `desktop-cli` 仅依赖 `desktop-server` (启动入口)

### 1.2 v2 新增 / 修改 Crate

#### 新增 Crate

| Crate | 职责 | 依赖 |
|-------|------|------|
| `wiki_patrol` | 定期巡检引擎: 孤儿页检测、过期检测、Schema 违规检测、超长/残桩检测 | `wiki_store` |

#### 修改 Crate

| Crate | 修改内容 |
|-------|----------|
| `wiki_store` | +`append_absorb_log`, +`list_absorb_log`, +`is_entry_absorbed`, +`build_backlinks_index`, +`save_backlinks_index`, +`validate_frontmatter`, +`wiki_stats`; 新增 `ABSORB_LOG_GUARD` 互斥锁; 扩展 `WikiStoreError` 新变体 |
| `wiki_maintainer` | 保留 `propose_for_raw_entry` 不变; +`absorb_batch` (批量吸收循环), +`query_wiki` (Wiki-grounded Q&A); 新增 `AbsorbResult`, `QueryResult` 类型 |
| `desktop-core` | +SKILL 命令路由器 (`SkillRouter`); 扩展 `BrokerAdapter` 支持新的 maintainer 异步调用; +`AbsorbTaskManager` 进度追踪 |
| `desktop-server` | +9 个新 HTTP 端点 (absorb, query, cleanup, patrol, absorb-log, backlinks, stats, patrol/report, schema/templates); 扩展 SSE 事件类型 |

### 1.3 v2 Rust Workspace 依赖图

```
                     ┌──────────────┐
                     │ desktop-cli  │
                     └──────┬───────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ desktop-server  │  (Axum HTTP, port 4357)
                   │  105 + 9 routes │  (+absorb,query,cleanup,
                   │                 │   patrol,absorb-log,
                   │                 │   backlinks,stats,
                   │                 │   patrol/report,
                   │                 │   schema/templates)
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  desktop-core   │
                   │  +SkillRouter   │
                   │  +AbsorbTask    │
                   │   Manager       │
                   └───┬──┬──┬──┬────┘
                       │  │  │  │
          ┌────────────┘  │  │  └────────────────┐
          ▼               │  │                   ▼
  ┌──────────────┐        │  │           ┌──────────────┐
  │wiki_maintainer│       │  │           │    server     │
  │ +absorb_batch │       │  │           └──────────────┘
  │ +query_wiki   │       │  │
  └──────┬───────┘        │  │
         │    ┌───────────┘  └───────────┐
         │    ▼                          ▼
         │  ┌──────────────┐   ┌──────────────┐
         │  │  wiki_ingest  │   │ wiki_patrol  │ ← 新增
         │  └──────┬────────┘   │ (巡检引擎)   │
         │         │            └──────┬───────┘
         └────┬────┘                   │
              │    ┌───────────────────┘
              ▼    ▼
         ┌──────────────┐
         │  wiki_store   │
         │ +absorb_log   │
         │ +backlinks    │
         │ +validate_fm  │
         │ +wiki_stats   │
         └──────────────┘
```

### 1.4 前端模块结构

#### v1 结构 (当前)

```
App
 └─ QueryClientProvider + HashRouter + ThemeProvider
     └─ ClawWikiShell
         ├─ Sidebar (固定左栏, 220px/56px collapsed)
         └─ <main> Routes
             ├─ /dashboard  → DashboardPage
             ├─ /ask/*      → AskPage
             ├─ /inbox      → InboxPage
             ├─ /raw/*      → RawLibraryPage
             ├─ /wiki/*     → WikiExplorerPage
             ├─ /graph      → GraphPage
             ├─ /schema/*   → SchemaEditorPage
             ├─ /wechat     → WeChatBridgePage
             └─ /settings   → SettingsPage
```

#### v2 结构 (目标: 双 Tab 架构)

```
App
 └─ QueryClientProvider + HashRouter + ThemeProvider
     └─ ClawWikiShell
         ├─ Sidebar (固定左栏, 220px/56px collapsed)
         │   ├─ primary: Dashboard, Inbox, Raw, Graph, Schema
         │   ├─ funnel: WeChat Bridge
         │   └─ settings: Settings
         └─ <main>
             ├─ TabBar (Chat | Wiki 双 Tab 切换)
             │   ├─ ChatTab (AskPage 整合)
             │   │   └─ 会话列表 + 对话区 + SKILL 输入
             │   └─ WikiTab (WikiExplorerPage 整合)
             │       └─ 多标签浏览器 (tabStore 驱动)
             │           ├─ WikiPageView
             │           ├─ WikiSearchPanel
             │           └─ WikiGraphMinimap
             └─ Routes (非 Tab 页面保持独立路由)
                 ├─ /dashboard  → DashboardPage
                 ├─ /inbox      → InboxPage
                 ├─ /raw/*      → RawLibraryPage
                 ├─ /graph      → GraphPage
                 ├─ /schema/*   → SchemaEditorPage
                 ├─ /wechat     → WeChatBridgePage
                 └─ /settings   → SettingsModalTrigger (兼容路由, 打开 Modal)
```

### 1.5 路由表变更 (Before / After)

| v1 路由 | v1 页面 | v2 路由 | v2 页面 | 变更说明 |
|---------|---------|---------|---------|----------|
| `/dashboard` | DashboardPage | `/dashboard` | DashboardPage | 不变, +统计卡片接入 `/api/wiki/stats` |
| `/ask/*` | AskPage | `/chat/*` | ChatTab | **重命名** ask -> chat; 整合到主 Tab 区域 |
| `/inbox` | InboxPage | `/inbox` | InboxPage | 不变, +新 inbox kind 类型支持 |
| `/raw/*` | RawLibraryPage | `/raw/*` | RawLibraryPage | 不变 |
| `/wiki/*` | WikiExplorerPage | `/wiki/*` | WikiTab | **升级**: 整合到主 Tab 区域, 支持多标签浏览 |
| `/graph` | GraphPage | `/graph` | GraphPage | 不变, +backlinks 边渲染 |
| `/schema/*` | SchemaEditorPage | `/schema/*` | SchemaEditorPage | 不变 |
| `/wechat` | WeChatBridgePage | `/wechat` | WeChatBridgePage | 不变 |
| `/settings` | SettingsPage | `/settings` | `SettingsModalTrigger` | 兼容路由：打开 SettingsModal 后立即导航回前一页面。v2 Settings 不是独立页面，而是全局 Modal，可从任意页面通过侧边栏图标打开。保留路由仅为向后兼容。 |

**路由总数**: v1 = 9, v2 = 9 (数量不变, `/ask` 重命名为 `/chat`)

### 1.6 Rowboat 双 Tab 设计

双 Tab 架构参照 Rowboat 桌面端模式:

```
┌─────────────────────────────────────────────────────┐
│  [ Chat ]  [ Wiki ]                    [搜索] [设置] │  ← TabBar
├─────────────────────────────────────────────────────┤
│                                                     │
│   Chat Tab 激活时:                                   │
│   ┌─────────────┬───────────────────────────────┐   │
│   │ 会话列表     │  对话区域                      │   │
│   │ (session    │  ┌─────────────────────────┐  │   │
│   │  sidebar)   │  │ ASSISTANT 消息           │  │   │
│   │             │  │ ...                     │  │   │
│   │ [+新对话]    │  │ USER 消息               │  │   │
│   │ session-1   │  └─────────────────────────┘  │   │
│   │ session-2   │  ┌─────────────────────────┐  │   │
│   │ session-3   │  │ /absorb /query /cleanup │  │   │
│   │             │  │ 输入框 + 发送按钮         │  │   │
│   └─────────────┴──┴─────────────────────────┘  │   │
│                                                     │
│   Wiki Tab 激活时:                                   │
│   ┌─────────────────────────────────────────────┐   │
│   │ [page-1.md] [page-2.md] [+]    ← 多标签栏   │   │
│   ├─────────────────────────────────────────────┤   │
│   │                                             │   │
│   │  Wiki 页面 Markdown 渲染区域                  │   │
│   │  (split-pane: 目录 | 正文 | 元数据)          │   │
│   │                                             │   │
│   └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 1.7 SKILL 命令体系

v2 定义四个一级 SKILL 命令, 均通过 Chat Tab 输入框触发:

| SKILL | 触发方式 | 后端端点 | 执行模式 |
|-------|----------|----------|----------|
| `/absorb` | 用户在 Chat 中输入 `/absorb` | `POST /api/wiki/absorb` | 异步 + SSE 进度 |
| `/query` | 用户在 Chat 中输入 `/query {question}` | `POST /api/wiki/query` | SSE 流式应答 |
| `/cleanup` | 用户在 Chat 中输入 `/cleanup` | `POST /api/wiki/cleanup` | 异步 + SSE 报告 |
| `/patrol` | 用户在 Chat 中输入 `/patrol` | `POST /api/wiki/patrol` | 异步 + SSE 报告 |

---

## 第二章：API 接口定义（v2）

### 2.1 POST /api/wiki/absorb

触发 SKILL `/absorb`, 对 pending 状态的 raw entries 执行批量吸收。

**Method**: `POST`  
**Path**: `/api/wiki/absorb`  
**Content-Type**: `application/json`

#### Request Body

```json
{
  "entry_ids": [1, 2, 3],
  "date_range": {
    "from": "2026-04-01",
    "to": "2026-04-14"
  }
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `entry_ids` | `number[] \| null` | 否 | `null` | 指定要吸收的 raw entry ID 列表; `null` 时吸收所有未吸收的 entries |
| `date_range` | `object \| null` | 否 | `null` | 按日期范围过滤 |
| `date_range.from` | `string` | 是 (若 date_range 存在) | - | ISO 日期 `YYYY-MM-DD`, 含当日 |
| `date_range.to` | `string` | 是 (若 date_range 存在) | - | ISO 日期 `YYYY-MM-DD`, 含当日 |

**约束**: `entry_ids` 和 `date_range` 互斥, 同时提供时 `entry_ids` 优先。

#### Response (202 Accepted)

```json
{
  "task_id": "absorb-1713072000-a3f2",
  "status": "started",
  "total_entries": 5
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务唯一标识, 格式 `absorb-{unix_ts}-{4hex}` |
| `status` | `string` | 恒为 `"started"` |
| `total_entries` | `number` | 待吸收的 entry 总数 |

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `400` | `INVALID_DATE_RANGE` | `from` 晚于 `to`, 或日期格式错误 |
| `404` | `ENTRIES_NOT_FOUND` | `entry_ids` 中包含不存在的 ID |
| `409` | `ABSORB_IN_PROGRESS` | 已有 absorb 任务正在执行 |
| `503` | `BROKER_UNAVAILABLE` | codex_broker 无可用 provider |

#### SSE 事件 (通过 `/api/desktop/sessions/{id}/events`)

**事件类型**: `absorb_progress`

```json
{
  "type": "absorb_progress",
  "task_id": "absorb-1713072000-a3f2",
  "processed": 2,
  "total": 5,
  "current_entry_id": 3,
  "action": "create",
  "page_slug": "transformer-architecture",
  "page_title": "Transformer 架构",
  "error": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 恒为 `"absorb_progress"` |
| `task_id` | `string` | 对应 absorb 任务 ID |
| `processed` | `number` | 已处理的 entry 数 |
| `total` | `number` | 总 entry 数 |
| `current_entry_id` | `number` | 当前正在处理的 raw entry ID |
| `action` | `string` | `"create"` (新建页面), `"update"` (更新已有页面), `"skip"` (跳过, 已吸收或无需处理) |
| `page_slug` | `string \| null` | 生成/更新的 wiki page slug; `action="skip"` 时为 `null` |
| `page_title` | `string \| null` | 生成/更新的 wiki page title |
| `error` | `string \| null` | 单条处理失败时的错误信息; 成功时为 `null` |

**完成事件**: `absorb_complete`

```json
{
  "type": "absorb_complete",
  "task_id": "absorb-1713072000-a3f2",
  "created": 3,
  "updated": 1,
  "skipped": 1,
  "failed": 0,
  "duration_ms": 12500
}
```

### 2.2 POST /api/wiki/query

触发 SKILL `/query`, 基于 Wiki 知识库进行 grounded Q&A。

**Method**: `POST`  
**Path**: `/api/wiki/query`  
**Content-Type**: `application/json`

#### Request Body

```json
{
  "question": "Transformer 和 RNN 有什么区别?",
  "session_id": "ask-session-abc123",
  "max_sources": 5
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `question` | `string` | 是 | - | 用户提问, 不得为空, 最大 2000 字符 |
| `session_id` | `string \| null` | 否 | `null` | 关联的 Ask 会话 ID, 用于上下文追踪 |
| `max_sources` | `number` | 否 | `5` | 最多引用的 wiki 页面数量, 范围 [1, 20] |

#### Response (200 OK, SSE stream)

**Content-Type**: `text/event-stream`

事件序列:

1. `query_sources` (一次):
```json
{
  "type": "query_sources",
  "sources": [
    {
      "slug": "transformer-architecture",
      "title": "Transformer 架构",
      "relevance_score": 0.95,
      "snippet": "Transformer 是一种基于自注意力机制的..."
    }
  ]
}
```

2. `query_chunk` (多次, 流式):
```json
{
  "type": "query_chunk",
  "delta": "根据你的知识库记录, ",
  "source_refs": ["transformer-architecture"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `delta` | `string` | 增量文本片段 |
| `source_refs` | `string[]` | 本片段引用的 wiki page slug 列表 |

3. `query_done` (一次):
```json
{
  "type": "query_done",
  "total_tokens": 850,
  "sources_used": ["transformer-architecture", "rnn-basics"]
}
```

#### Crystallization (对话结晶)

`/query` 生成的实质性回答 (>200 字符) 会自动写入 `raw/entries/` 目录, 作为新的 raw entry:

- **路径格式**: `raw/entries/{date}_query-{slug}.md`
- **source_type**: `"query"`
- **触发条件**: `answer.len() > 200` (仅结晶有深度的回答)
- **后续流程**: 下次 `/absorb` 执行时, query 类型的 raw entry 会被正常吸收进 Wiki

这构成了 "问得越多 → Wiki 越强 → 回答越准" 的正反馈闭环。详见 `01-skill-engine.md §5.2` 的结晶步骤。

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `400` | `EMPTY_QUESTION` | question 为空或仅包含空白字符 |
| `400` | `QUESTION_TOO_LONG` | question 超过 2000 字符 |
| `404` | `WIKI_EMPTY` | Wiki 中没有任何页面, 无法回答 |
| `503` | `BROKER_UNAVAILABLE` | codex_broker 无可用 provider |

### 2.3 POST /api/wiki/cleanup

触发 SKILL `/cleanup`, 对 Wiki 进行质量审计。

**Method**: `POST`  
**Path**: `/api/wiki/cleanup`  
**Content-Type**: `application/json`

#### Request Body

```json
{}
```

无参数。Request body 为空对象或可省略。

#### Response (202 Accepted)

```json
{
  "task_id": "cleanup-1713072000-b4e1",
  "status": "started"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务唯一标识, 格式 `cleanup-{unix_ts}-{4hex}` |
| `status` | `string` | 恒为 `"started"` |

#### SSE 事件

**事件类型**: `cleanup_progress`

```json
{
  "type": "cleanup_progress",
  "task_id": "cleanup-1713072000-b4e1",
  "phase": "analyzing",
  "checked": 15,
  "total": 30
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | `string` | `"analyzing"` (分析中), `"generating_suggestions"` (生成建议中), `"complete"` (完成) |
| `checked` | `number` | 已检查的页面数 |
| `total` | `number` | 总页面数 |

**完成事件**: `cleanup_report`

```json
{
  "type": "cleanup_report",
  "task_id": "cleanup-1713072000-b4e1",
  "suggestions": [
    {
      "kind": "merge",
      "pages": ["transformer-architecture", "attention-mechanism"],
      "reason": "内容高度重叠, 建议合并",
      "confidence": 0.85
    },
    {
      "kind": "expand",
      "pages": ["rag-overview"],
      "reason": "页面内容不足 50 词, 建议扩展",
      "confidence": 0.92
    }
  ],
  "inbox_entries_created": 2,
  "duration_ms": 8000
}
```

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `409` | `CLEANUP_IN_PROGRESS` | 已有 cleanup 任务正在执行 |
| `503` | `BROKER_UNAVAILABLE` | codex_broker 无可用 provider |

### 2.4 POST /api/wiki/patrol

触发 SKILL `/patrol`, 执行结构化巡检。

**Method**: `POST`  
**Path**: `/api/wiki/patrol`  
**Content-Type**: `application/json`

#### Request Body

```json
{}
```

无参数。Request body 为空对象或可省略。

#### Response (202 Accepted)

```json
{
  "task_id": "patrol-1713072000-c5d2",
  "status": "started"
}
```

#### SSE 事件

**事件类型**: `patrol_progress`

```json
{
  "type": "patrol_progress",
  "task_id": "patrol-1713072000-c5d2",
  "check": "orphans",
  "status": "running"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `check` | `string` | 当前检查项: `"orphans"`, `"stale"`, `"schema_violations"`, `"oversized"`, `"stubs"` |
| `status` | `string` | `"running"` (进行中), `"done"` (该项完成) |

**完成事件**: `patrol_report`

```json
{
  "type": "patrol_report",
  "task_id": "patrol-1713072000-c5d2",
  "issues": [
    {
      "kind": "orphan",
      "page_slug": "abandoned-concept",
      "description": "该页面无任何入链, 且不被 index.md 引用",
      "suggested_action": "添加至相关 topic 页面的引用, 或标记为 deprecated"
    },
    {
      "kind": "stale",
      "page_slug": "old-api-design",
      "description": "最后验证时间超过 90 天 (2026-01-05)",
      "suggested_action": "重新验证页面内容时效性"
    },
    {
      "kind": "schema-violation",
      "page_slug": "quick-note",
      "description": "缺少必填字段: summary",
      "suggested_action": "补充 frontmatter 中的 summary 字段"
    },
    {
      "kind": "oversized",
      "page_slug": "mega-article",
      "description": "页面正文超过 500 行 (实际 823 行)",
      "suggested_action": "拆分为多个独立概念页面"
    },
    {
      "kind": "stub",
      "page_slug": "placeholder-topic",
      "description": "页面正文不足 10 行 (实际 3 行)",
      "suggested_action": "扩充内容或合并到相关页面"
    }
  ],
  "summary": {
    "orphans": 2,
    "stale": 3,
    "schema_violations": 1,
    "oversized": 1,
    "stubs": 2
  },
  "inbox_entries_created": 9,
  "duration_ms": 350
}
```

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `409` | `PATROL_IN_PROGRESS` | 已有 patrol 任务正在执行 |

### 2.5 GET /api/wiki/absorb-log

读取 `_absorb_log.json` 吸收记录。

**Method**: `GET`  
**Path**: `/api/wiki/absorb-log`  
**Query Parameters**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `limit` | `number` | 否 | `100` | 最大返回条数, 范围 [1, 1000] |
| `offset` | `number` | 否 | `0` | 分页偏移量 |

#### Response (200 OK)

```json
{
  "entries": [
    {
      "entry_id": 5,
      "timestamp": "2026-04-14T10:30:00Z",
      "action": "create",
      "page_slug": "transformer-architecture",
      "page_title": "Transformer 架构",
      "page_category": "topic"
    },
    {
      "entry_id": 3,
      "timestamp": "2026-04-14T10:29:55Z",
      "action": "skip",
      "page_slug": null,
      "page_title": null,
      "page_category": null
    }
  ],
  "total": 42
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `entries` | `AbsorbLogEntry[]` | 吸收记录列表, 按 timestamp 倒序 |
| `total` | `number` | 总记录数 (忽略分页) |

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `500` | `LOG_READ_FAILED` | `_absorb_log.json` 读取或解析失败 |

### 2.6 GET /api/wiki/backlinks

读取完整反向链接索引。

> **与已有端点的关系**: `GET /api/wiki/pages/{slug}/backlinks` 返回单个页面的反向引用列表。
> 本端点 `GET /api/wiki/backlinks` 返回完整的反链索引 (_backlinks.json)，供前端缓存和图谱渲染使用。
> 两者共存，前者用于页面详情，后者用于全局视图。

**Method**: `GET`  
**Path**: `/api/wiki/backlinks`  
**Query Parameters**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `slug` | `string` | 否 | - | 指定 slug 时仅返回该页面的反向链接; 省略时返回完整索引 |
| `format` | `string` | 否 | `wrapped` | `raw` 时返回裸 `BacklinksIndex` HashMap (见下); 其他/缺省时返回包装结构。仅在 `slug` 未指定时生效 |

#### Response (200 OK) -- 完整索引 (默认, `format=wrapped`)

```json
{
  "index": {
    "transformer-architecture": ["attention-mechanism", "bert-overview"],
    "rag-overview": ["transformer-architecture"]
  },
  "total_pages": 15,
  "total_backlinks": 23
}
```

#### Response (200 OK) -- `?format=raw` (裸 HashMap)

用于 CLI / 外部工具直接反序列化为 `BacklinksIndex` 类型。

```json
{
  "transformer-architecture": ["attention-mechanism", "bert-overview"],
  "rag-overview": ["transformer-architecture"]
}
```

> **何时使用 raw**: 调用方已持有 `list_all_wiki_pages` 或 `wiki_stats` 可独立计算 `total_*` 指标时, 直接消费原始索引比丢弃包装字段更直观。UI 侧继续使用包装格式 (默认)。

#### Response (200 OK) -- 指定 slug

```json
{
  "slug": "transformer-architecture",
  "backlinks": [
    {
      "slug": "attention-mechanism",
      "title": "注意力机制",
      "category": "concept"
    },
    {
      "slug": "bert-overview",
      "title": "BERT 概述",
      "category": "concept"
    }
  ],
  "count": 2
}
```

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `404` | `PAGE_NOT_FOUND` | 指定的 slug 不存在 |
| `500` | `INDEX_BUILD_FAILED` | 反向链接索引构建失败 |

### 2.7 GET /api/wiki/stats

读取 Wiki 聚合统计数据。

**Method**: `GET`  
**Path**: `/api/wiki/stats`

无参数。

#### Response (200 OK)

```json
{
  "raw_count": 142,
  "wiki_count": 87,
  "concept_count": 45,
  "people_count": 12,
  "topic_count": 22,
  "compare_count": 8,
  "edge_count": 35,
  "orphan_count": 3,
  "inbox_pending": 5,
  "inbox_resolved": 63,
  "today_ingest_count": 3,
  "week_new_pages": 12,
  "avg_page_words": 450,
  "absorb_success_rate": 0.94,
  "knowledge_velocity": 1.7,
  "last_absorb_at": "2026-04-14T09:30:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `raw_count` | `number` | raw/ 目录下的条目总数 |
| `wiki_count` | `number` | wiki/ 下所有页面总数 (所有分类之和) |
| `concept_count` | `number` | wiki/concepts/ 下的页面数 |
| `people_count` | `number` | wiki/people/ 下的页面数 |
| `topic_count` | `number` | wiki/topics/ 下的页面数 |
| `compare_count` | `number` | wiki/compare/ 下的页面数 |
| `edge_count` | `number` | 知识图谱中的边总数 |
| `orphan_count` | `number` | 无入链的孤儿页面数 |
| `inbox_pending` | `number` | Inbox 中 pending 状态的条目数 |
| `inbox_resolved` | `number` | Inbox 中 resolved 状态的条目数 |
| `today_ingest_count` | `number` | 今日新增 raw 条目数 |
| `week_new_pages` | `number` | 本周新增 wiki 页面数 |
| `avg_page_words` | `number` | wiki 页面的平均字数 (正文, 不含 frontmatter) |
| `absorb_success_rate` | `number` | absorb 成功率 (resolved / (resolved + pending)) |
| `knowledge_velocity` | `number` | 知识速率 (近 7 天日均新增页面数) |
| `last_absorb_at` | `string \| null` | 最后一次吸收操作的时间; 从未执行过时为 `null` |

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `500` | `STATS_COMPUTE_FAILED` | 统计计算失败 (磁盘 I/O 错误) |

### 2.8 GET /api/wiki/patrol/report

获取最近一次巡检报告。

**Method**: `GET`  
**Path**: `/api/wiki/patrol/report`

无参数。

#### Response (200 OK)

返回最近一次 `POST /api/wiki/patrol` 生成的 `PatrolReport`，缓存在内存或磁盘。若从未运行过巡检，返回 `null`。

```json
{
  "issues": [
    {
      "kind": "orphan",
      "page_slug": "raw-42",
      "description": "raw #42 无对应 wiki 页面",
      "suggested_action": "执行 absorb 或手动创建页面"
    }
  ],
  "summary": {
    "orphans": 3,
    "stale": 1,
    "schema_violations": 5,
    "oversized": 0,
    "stubs": 2
  },
  "checked_at": "2026-04-14T10:30:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `issues` | `PatrolIssue[]` | 所有违规项列表 |
| `summary` | `PatrolSummary` | 各类违规的分类计数 |
| `checked_at` | `string` | 巡检执行时间 (ISO-8601) |

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `500` | `REPORT_READ_FAILED` | 报告读取失败 |

### 2.9 GET /api/wiki/schema/templates

获取所有 Schema 模板定义。

**Method**: `GET`  
**Path**: `/api/wiki/schema/templates`

无参数。

#### Response (200 OK)

```json
[
  {
    "category": "concept",
    "display_name": "概念",
    "fields": [
      {"name": "title", "required": true, "field_type": "String", "description": "概念名称"},
      {"name": "aliases", "required": false, "field_type": "String", "description": "别名"}
    ],
    "body_hint": "请按以下结构撰写：定义 → 核心要点 → 关联概念。",
    "file_path": ".clawwiki/schema/templates/concept.md"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | `string` | 模板分类: `"concept"` / `"people"` / `"topic"` / `"compare"` |
| `display_name` | `string` | 模板显示名称 |
| `fields` | `TemplateField[]` | frontmatter 字段定义列表 |
| `body_hint` | `string` | body 区域的写作提示 |
| `file_path` | `string` | 模板文件磁盘路径 |

#### Error Codes

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| `404` | `TEMPLATES_DIR_NOT_FOUND` | 模板目录不存在 |
| `500` | `TEMPLATE_PARSE_FAILED` | 模板文件解析失败 |

### 2.10 SSE 事件类型扩展

现有 `/api/desktop/sessions/{id}/events` 和 `/api/ask/sessions/{id}/events` 端点需扩展以支持 SKILL 事件。

#### 新增事件类型注册表

| 事件类型 | 来源 SKILL | 数据结构 | 说明 |
|----------|-----------|----------|------|
| `absorb_progress` | `/absorb` | 见 2.1 | 单条 entry 吸收进度 |
| `absorb_complete` | `/absorb` | 见 2.1 | 批量吸收完成汇总 |
| `query_sources` | `/query` | 见 2.2 | 查询引用的来源列表 |
| `query_chunk` | `/query` | 见 2.2 | 查询回答增量文本 |
| `query_done` | `/query` | 见 2.2 | 查询完成信号 |
| `cleanup_progress` | `/cleanup` | 见 2.3 | cleanup 检查进度 |
| `cleanup_report` | `/cleanup` | 见 2.3 | cleanup 审计报告 |
| `patrol_progress` | `/patrol` | 见 2.4 | patrol 检查进度 |
| `patrol_report` | `/patrol` | 见 2.4 | patrol 巡检报告 |

#### SSE 通用信封格式

所有 SKILL SSE 事件遵循统一信封:

```
event: skill
data: {"type":"absorb_progress","task_id":"absorb-...","processed":2,"total":5,...}
```

前端根据 `data.type` 字段分发到对应 handler。

### 2.11 现有端点兼容性声明

以下现有端点在 v2 中保持 **完全向后兼容**, 不修改 request/response schema:

| 端点 | 说明 |
|------|------|
| `GET/POST /api/wiki/raw` | Raw CRUD |
| `GET/DELETE /api/wiki/raw/{id}` | Raw 单条操作 |
| `GET /api/wiki/inbox` | Inbox 列表 |
| `POST /api/wiki/inbox/{id}/resolve` | Inbox 审批 |
| `POST /api/wiki/inbox/{id}/propose` | 维护者提议 |
| `POST /api/wiki/inbox/{id}/approve-with-write` | 批准并写入 |
| `GET /api/wiki/pages` | Wiki 页面列表 |
| `GET /api/wiki/pages/{slug}` | Wiki 页面详情 |
| `GET /api/wiki/search` | Wiki 搜索 |
| `GET /api/wiki/index` | Wiki 目录 |
| `GET /api/wiki/log` | Wiki 日志 |
| `GET/PUT /api/wiki/schema` | Schema CRUD |
| `GET /api/wiki/graph` | 知识图谱 |
| `GET /api/wiki/pages/{slug}/backlinks` | 单页反向链接 (已有) |
| `POST /api/wiki/fetch` | URL 预览提取 |
| 全部 `/api/desktop/sessions/*` | 会话管理 |
| 全部 `/api/ask/sessions/*` | Ask 会话管理 |
| 全部 `/api/desktop/wechat/*` | WeChat iLink |
| 全部 `/api/desktop/wechat-kefu/*` | WeChat 客服 |

---

## 第三章：数据模型

### 3.1 RawEntry (现有, 不变)

文件位置: `wiki_store/src/lib.rs`

```rust
pub struct RawEntry {
    pub id: u32,
    pub filename: String,
    pub source: String,
    pub slug: String,
    pub date: String,
    pub source_url: Option<String>,
    pub ingested_at: String,
    pub byte_size: u64,
}
```

| 字段 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|------|------|------|--------|----------|------|
| `id` | `u32` | 是 | 自增 | >= 1, 唯一 | 5 位前缀 ID, 从磁盘扫描 max+1 |
| `filename` | `String` | 是 | 自动生成 | 格式 `NNNNN_{source}_{slug}_{date}.md` | 文件 basename |
| `source` | `String` | 是 | - | 枚举值: `paste`, `wechat-text`, `wechat-article`, `url`, `pdf`, `docx`, `pptx`, `image`, `voice`, `video` | 来源标识 |
| `slug` | `String` | 是 | - | kebab-case ASCII, <= 64 chars | 文件名中的 slug 段 |
| `date` | `String` | 是 | 自动 | `YYYY-MM-DD` 格式 | 从 `ingested_at` 截取的日期 |
| `source_url` | `Option<String>` | 否 | `None` | 有效 URL 或 None | 原始来源 URL |
| `ingested_at` | `String` | 是 | `now_iso8601()` | ISO-8601 格式 | 写入时间戳 |
| `byte_size` | `u64` | 是 | 自动 | >= 0 | 磁盘文件大小 |

### 3.2 WikiPageSummary (扩展)

v2 新增 4 个字段: `status`, `confidence`, `last_verified`, `word_count`。

```rust
pub struct WikiPageSummary {
    // ── 现有字段 (不变) ──
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub source_raw_id: Option<u32>,
    pub created_at: String,
    pub byte_size: u64,
    pub category: String,
    // ── v2 新增字段 ──
    pub status: String,
    pub confidence: f32,
    pub last_verified: Option<String>,
    pub word_count: u32,
}
```

| 字段 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|------|------|------|--------|----------|------|
| `slug` | `String` | 是 | - | kebab-case ASCII, 1-64 chars, 匹配 `[a-z0-9._-]+` | 主键, 文件名 stem |
| `title` | `String` | 是 | - | 非空, <= 200 chars | 显示标题 |
| `summary` | `String` | 是 | - | 非空, <= 200 chars | 一行摘要 |
| `source_raw_id` | `Option<u32>` | 否 | `None` | 若存在, 必须对应已存在的 raw entry | 来源 raw ID |
| `created_at` | `String` | 是 | `now_iso8601()` | ISO-8601 格式 | 创建时间 |
| `byte_size` | `u64` | 是 | 自动 | >= 0 | 磁盘文件大小 |
| `category` | `String` | 是 | `"concept"` | 枚举: `concept`, `people`, `topic`, `compare` | 页面分类 |
| `status` | `String` | 是 | `"draft"` | 枚举: `draft`, `canonical`, `deprecated`, `stub` | **v2 新增**: 页面生命周期状态 |
| `confidence` | `f32` | 是 | `0.0` | 范围 [0.0, 1.0] | **v2 新增**: LLM 生成时的置信度评分; 手写页面默认 0.0 |
| `last_verified` | `Option<String>` | 否 | `None` | ISO-8601 格式或 None | **v2 新增**: 最近一次人工或自动验证的时间 |
| `word_count` | `u32` | 是 | `0` | >= 0 | **v2 新增**: 正文字数 (不含 frontmatter) |

**向后兼容**: 从磁盘解析旧页面时, 缺少新字段的使用以下降级逻辑:
- `status`: 缺失时默认 `"draft"`
- `confidence`: 缺失时默认 `0.0`
- `last_verified`: 缺失时默认 `None`
- `word_count`: 缺失时从正文实时计算

### 3.3 WikiFrontmatter (完整 YAML Schema)

Wiki 页面的磁盘 frontmatter 格式。v2 扩展后的完整定义:

```yaml
---
type: concept          # 必填. 枚举: concept | people | topic | compare
status: draft          # 必填. 枚举: draft | canonical | deprecated | stub
owner: maintainer      # 必填. 枚举: maintainer | user
schema: v1             # 必填. 恒为 "v1"
title: "页面标题"       # 必填. 人类可读标题, <= 200 chars
summary: "一句话摘要"   # 必填. 一行摘要, <= 200 chars
source_raw_id: 5       # 可选. 来源 raw entry ID
created_at: "2026-04-14T10:30:00Z"  # 必填. ISO-8601
confidence: 0.85       # v2 新增, 可选. 浮点数 [0.0, 1.0], 默认 0.0. **自动计算, 不可手动设置**
last_verified: "2026-04-14T12:00:00Z"  # v2 新增, 可选. ISO-8601
tags: ["ai", "architecture"]  # v2 新增, 可选. 标签列表
superseded: []         # v2 新增, 可选. 判断变迁记录数组
---
```

**Rust 结构体** (v2 扩展):

```rust
pub struct WikiFrontmatter {
    pub kind: String,           // 序列化为 YAML "type"
    pub status: String,
    pub owner: String,
    pub schema: String,
    pub title: String,
    pub summary: String,
    pub source_raw_id: Option<u32>,
    pub created_at: String,
    // ── v2 新增 ──
    pub confidence: Option<f32>,
    pub last_verified: Option<String>,
    pub tags: Vec<String>,
    // ── v2 新增: 判断变迁记录 ──
    pub superseded: Vec<SupersessionRecord>,
}

/// 判断变迁记录: 当 /absorb 检测到新信息推翻旧判断且用户在 Inbox 中批准后,
/// 旧判断不会被删除, 而是记录到此结构中, 保留认知演变历史。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupersessionRecord {
    /// 被取代的旧主张
    pub claim: String,
    /// 取代旧主张的新主张
    pub replaced_by: String,
    /// 变迁日期 (ISO-8601)
    pub date: String,
    /// 触发变迁的来源 raw entry 路径
    pub source: String,
}
```

| 字段 | YAML key | 类型 | 必填 | 默认值 | 验证规则 |
|------|----------|------|------|--------|----------|
| `kind` | `type` | `String` | 是 | - | 枚举: `concept`, `people`, `topic`, `compare` |
| `status` | `status` | `String` | 是 | `"draft"` | 枚举: `draft`, `canonical`, `deprecated`, `stub` |
| `owner` | `owner` | `String` | 是 | `"maintainer"` | 枚举: `maintainer`, `user` |
| `schema` | `schema` | `String` | 是 | `"v1"` | 恒为 `"v1"` |
| `title` | `title` | `String` | 是 | - | 非空, <= 200 chars |
| `summary` | `summary` | `String` | 是 | - | 非空, <= 200 chars |
| `source_raw_id` | `source_raw_id` | `Option<u32>` | 否 | `None` | >= 1 或 None |
| `created_at` | `created_at` | `String` | 是 | `now_iso8601()` | ISO-8601 |
| `confidence` | `confidence` | `Option<f32>` | 否 | `None` | [0.0, 1.0] 或 None。**自动计算, 见下方规则** |
| `last_verified` | `last_verified` | `Option<String>` | 否 | `None` | ISO-8601 或 None |
| `tags` | `tags` | `Vec<String>` | 否 | `[]` | 每项 <= 50 chars, ASCII + CJK, 最多 20 项 |
| `superseded` | `superseded` | `Vec<SupersessionRecord>` | 否 | `[]` | 判断变迁记录数组, 见下方说明 |

#### Confidence 自动计算规则

`confidence` 字段由 `/absorb` 流程自动计算, **不可手动设置**。每次 absorb 写入或更新页面后, 根据以下规则重新计算:

| 条件 | 等级 | 数值 |
|------|------|------|
| `source_count >= 3` AND `newest_source < 30 天` AND 无未解决冲突 | `high` | `0.9` |
| `source_count >= 2` AND `newest_source < 90 天` | `medium` | `0.6` |
| 存在未解决冲突 (Inbox 中有 pending 的 conflict 条目) | `contested` | `0.3` |
| 其他 (单一来源、来源陈旧等) | `low` | `0.2` |

**计算伪代码**:

```rust
fn compute_confidence(
    source_count: usize,
    newest_source_age_days: u64,
    has_pending_conflict: bool,
) -> f32 {
    if has_pending_conflict {
        return 0.3; // contested: 有未解决冲突, 最高优先判定
    }
    if source_count >= 3 && newest_source_age_days < 30 {
        return 0.9; // high: 多源佐证 + 时效性
    }
    if source_count >= 2 && newest_source_age_days < 90 {
        return 0.6; // medium: 有交叉验证
    }
    0.2 // low: 单源或陈旧
}
```

**衰减机制**: `wiki_patrol` 的 `detect_confidence_decay` 检测器每周扫描, 将 `newest_source > 90 天` 且 `confidence = 0.9` 的页面降级为 `0.6`。详见 `05-schema-system.md`。

#### Supersession (判断变迁) 说明

当 `/absorb` 检测到新信息与现有页面判断矛盾时, 不会静默覆盖。处理流程:

1. 冲突检测 → 创建 Inbox 条目 (`kind: conflict`)
2. 用户在 Inbox 中审阅, 选择 "采纳新观点"
3. 系统将旧判断记录到 `superseded` 数组, 更新页面内容为新判断
4. 写入 changelog

YAML 示例:

```yaml
superseded:
  - claim: "RAG 适合企业知识库"
    replaced_by: "结构化 Wiki 优于 RAG（Karpathy 范式）"
    date: 2026-04-14
    source: raw/2026-04-14-url-042.md
```

这保证了认知演变的完整可追溯性: 旧判断不会丢失, 而是留下历史记录。

### 3.4 InboxEntry (扩展 kind 枚举)

v2 扩展 `kind` 字段, 新增 4 种类型。

```rust
pub struct InboxEntry {
    pub id: u32,
    pub kind: String,
    pub status: String,
    pub title: String,
    pub description: String,
    pub source_raw_id: Option<u32>,
    pub created_at: String,
    pub resolved_at: Option<String>,
}
```

| 字段 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|------|------|------|--------|----------|------|
| `id` | `u32` | 是 | 自增 | >= 1, 唯一 | Inbox 条目 ID |
| `kind` | `String` | 是 | - | 见下方枚举表 | 条目类型 |
| `status` | `String` | 是 | `"pending"` | 枚举: `pending`, `approved`, `rejected`, `dismissed` | 审批状态 |
| `title` | `String` | 是 | - | 非空 | 条目标题 |
| `description` | `String` | 是 | `""` | - | 详细描述 |
| `source_raw_id` | `Option<u32>` | 否 | `None` | 若存在, 对应有效 raw entry ID | 关联的 raw entry |
| `created_at` | `String` | 是 | `now_iso8601()` | ISO-8601 | 创建时间 |
| `resolved_at` | `Option<String>` | 否 | `None` | ISO-8601 或 None; status 非 pending 时必须有值 | 处理时间 |

**kind 枚举表**:

> **序列化规则**: `InboxKind` 使用 `#[serde(rename_all = "kebab-case")]`，PascalCase 变体自动转为 kebab-case 字符串。

| kind 值 | Rust 变体 | 来源 | v1/v2 | 说明 |
|---------|-----------|------|-------|------|
| `"new-raw"` | `NewRaw` | 自动 (raw 写入后触发) | v1 | 新 raw entry 待维护者处理 |
| `"conflict"` | `Conflict` | `/absorb` | v1 (已有) | 吸收时发现冲突: raw entry 内容与已有 wiki page 矛盾 |
| `"stale"` | `Stale` | `/patrol` | v1 (已有) | 巡检发现过期页面 |
| `"deprecate"` | `Deprecate` | 手动 / `/patrol` | v1 (已有) | 提议废弃已有页面 |
| `"schema-violation"` | `SchemaViolation` | `/patrol` | **v2 新增** | 巡检发现 schema 违规 |
| `"cleanup-suggestion"` | `CleanupSuggestion` | `/cleanup` | **v2 新增** | cleanup 审计生成的优化建议 (合并/扩展/删除) |

### 3.5 AbsorbLogEntry (新增)

记录每次 absorb 操作的结果, 持久化到 `{meta}/_absorb_log.json`。

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AbsorbLogEntry {
    pub entry_id: u32,                   // raw entry ID that was absorbed
    pub timestamp: String,               // ISO-8601
    pub action: String,                  // "create" | "update" | "skip"
    pub page_slug: Option<String>,       // wiki page affected (None for skip)
    pub page_title: Option<String>,      // wiki page title (None for skip)
    pub page_category: Option<String>,   // "concept"|"people"|"topic"|"compare"
}
```

| 字段 | 类型 | 必填 | 默认值 | 验证规则 | 说明 |
|------|------|------|--------|----------|------|
| `entry_id` | `u32` | 是 | - | >= 1, 对应已存在的 raw entry ID | 被吸收的 raw entry ID |
| `timestamp` | `String` | 是 | `now_iso8601()` | ISO-8601 格式 | 精确到秒的时间戳 |
| `action` | `String` | 是 | - | 枚举: `"create"`, `"update"`, `"skip"` | 执行的动作 |
| `page_slug` | `Option<String>` | 否 | `None` | `action` 为 `"skip"` 时为 `None`; 其他时必须为有效 slug | 目标 wiki page slug |
| `page_title` | `Option<String>` | 否 | `None` | `action` 为 `"skip"` 时为 `None` | 目标 wiki page 标题 |
| `page_category` | `Option<String>` | 否 | `None` | 枚举: `"concept"`, `"people"`, `"topic"`, `"compare"` | 目标 wiki page 分类 |

**磁盘格式**: JSON 数组, 追加写入:

```json
[
  {"entry_id":1,"timestamp":"2026-04-14T10:30:00Z","action":"create","page_slug":"transformer-architecture","page_title":"Transformer 架构","page_category":"topic"},
  {"entry_id":2,"timestamp":"2026-04-14T10:30:05Z","action":"skip","page_slug":null,"page_title":null,"page_category":null}
]
```

**文件路径**: `{wiki_root}/.clawwiki/_absorb_log.json`

### 3.6 BacklinksIndex (新增)

反向链接索引, 持久化到 `{meta}/_backlinks.json`。

```rust
pub type BacklinksIndex = std::collections::HashMap<String, Vec<String>>;
```

**语义**: `key` = 被引用的 wiki page slug, `value` = 引用该页面的 slug 列表。

示例:
```json
{
  "transformer-architecture": ["attention-mechanism", "bert-overview", "gpt-history"],
  "rag-overview": ["transformer-architecture", "langchain-intro"]
}
```

| 属性 | 说明 |
|------|------|
| Key 类型 | `String`, 有效 wiki page slug |
| Value 类型 | `Vec<String>`, 有效 wiki page slug 列表, 去重, 按字母序排列 |
| 更新时机 | 调用方在适当时机手动调用 `build_backlinks_index` + `save_backlinks_index` 重建。`absorb_batch` 在每 15 条 checkpoint 和批次结束时重建。单次 `write_wiki_page` **不**自动触发重建 (避免 N 次全量扫描的性能问题)。 |
| 文件路径 | `{wiki_root}/.clawwiki/_backlinks.json` |
| 空值处理 | 无入链的页面不出现在 index 中 (不写入 `"slug": []` 空数组) |

### 3.7 SchemaTemplate (新增)

定义 wiki 页面的 frontmatter 模板, 用于 `/patrol` 的 schema 验证。

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchemaTemplate {
    pub name: String,
    pub fields: Vec<TemplateField>,
    pub required_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TemplateField {
    pub name: String,
    pub field_type: FieldType,
    pub description: String,
    pub default_value: Option<serde_json::Value>,
    pub validation: Option<FieldValidation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum FieldType {
    String,
    Number,
    Boolean,
    StringList,
    Enum(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FieldValidation {
    pub max_length: Option<usize>,
    pub min_length: Option<usize>,
    pub pattern: Option<String>,
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
}
```

| 字段 | 类型 | 必填 | 验证规则 | 说明 |
|------|------|------|----------|------|
| `name` | `String` | 是 | 非空, 匹配 `[a-z_]+`, <= 32 chars | 模板名称, 如 `"concept"`, `"people"` |
| `fields` | `Vec<TemplateField>` | 是 | 非空 | 字段定义列表 |
| `required_fields` | `Vec<String>` | 是 | 每项必须在 `fields` 中存在 | 必填字段名列表 |

**内置模板** (对应 `schema/templates/` 下的 4 个 `.md` 文件):

- `concept`: type, status, owner, schema, title, summary, source_raw_id, created_at
- `people`: type, status, owner, schema, title, summary, affiliation, role, created_at
- `topic`: type, status, owner, schema, title, summary, subtopics, created_at
- `compare`: type, status, owner, schema, title, summary, item_a, item_b, created_at

#### 3.7.1 SchemaTemplateInfo (API DTO, 新增)

`SchemaTemplate` 是内部验证对象, 由 `validate_frontmatter` 消费, 字段精简、保留运行时所需的 `FieldType` / `FieldValidation`。
而 `GET /api/wiki/schema/templates` (§2.9) 面向前端模板选择 UI, 需要展示名称、写作提示和磁盘路径等元数据, 这些并非验证所需。两种诉求正交, 因此引入独立的响应 DTO:

```rust
/// API-facing template metadata (technical-design.md §2.9 response shape).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SchemaTemplateInfo {
    pub category: String,       // file stem, e.g. "concept"
    pub display_name: String,   // 中文显示名, e.g. "概念"
    pub fields: Vec<TemplateFieldInfo>,
    pub body_hint: String,      // 模板 body 部分(frontmatter 之后), 作为写作提示
    pub file_path: String,      // .clawwiki/schema/templates/<category>.md
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TemplateFieldInfo {
    pub name: String,
    pub required: bool,         // 所有 frontmatter 字段默认为 true
    pub field_type: String,     // 当前统一为 "String"; 预留日后按值类型推断
    pub description: String,
}
```

加载器 `wiki_store::load_schema_template_infos(paths) -> Result<Vec<SchemaTemplateInfo>>` 扫描 `schema/templates/*.md`, 每个文件产出一个 `SchemaTemplateInfo`。display_name 通过内置映射表补全 (`concept→概念`, `people→人物`, `topic→主题`, `compare→对比`); 未知分类回退为原始字符串。结果按 `category` 字母序排序以保证 API 稳定。

### 3.8 PatrolIssue (新增)

巡检发现的单个问题。

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PatrolIssue {
    pub kind: PatrolIssueKind,
    pub page_slug: String,
    pub description: String,
    pub suggested_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PatrolIssueKind {
    Orphan,
    Stale,
    SchemaViolation,
    Oversized,
    Stub,
}
```

| 字段 | 类型 | 必填 | 验证规则 | 说明 |
|------|------|------|----------|------|
| `kind` | `PatrolIssueKind` | 是 | 见枚举 | 问题类别 |
| `page_slug` | `String` | 是 | 有效 wiki page slug | 问题页面 |
| `description` | `String` | 是 | 非空, <= 500 chars | 问题描述 (中文) |
| `suggested_action` | `String` | 是 | 非空, <= 500 chars | 建议修复操作 (中文) |

**PatrolIssueKind 枚举**:

| 变体 | JSON 序列化值 | 说明 | 检测逻辑 |
|------|--------------|------|----------|
| `Orphan` | `"orphan"` | 孤儿页面 | 无任何入链 (backlinks 为空) 且不在 index.md 中 |
| `Stale` | `"stale"` | 过期页面 | `last_verified` 为 None 或距今超过 `max_age_days` 天 |
| `SchemaViolation` | `"schema-violation"` | Schema 违规 | frontmatter 缺少必填字段或值不合法 |
| `Oversized` | `"oversized"` | 超长页面 | 正文行数超过 `max_lines` 阈值 |
| `Stub` | `"stub"` | 残桩页面 | 正文行数不足 `min_lines` 阈值 |

**PatrolReport** (巡检报告汇总):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatrolReport {
    pub issues: Vec<PatrolIssue>,
    pub summary: PatrolSummary,
    pub checked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatrolSummary {
    pub orphans: usize,
    pub stale: usize,
    pub schema_violations: usize,
    pub oversized: usize,
    pub stubs: usize,
}
```

### 3.9 WikiStats (新增)

聚合统计数据模型, 由 `wiki_stats()` 函数在每次调用时实时计算。

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiStats {
    pub raw_count: usize,                // raw/ 条目总数
    pub wiki_count: usize,               // wiki/ 页面总数
    pub concept_count: usize,
    pub people_count: usize,
    pub topic_count: usize,
    pub compare_count: usize,
    pub edge_count: usize,
    pub orphan_count: usize,
    pub inbox_pending: usize,
    pub inbox_resolved: usize,
    pub today_ingest_count: usize,       // 今日新增 raw 数
    pub week_new_pages: usize,           // 本周新增 wiki 页面数
    pub avg_page_words: usize,           // 平均字数
    pub absorb_success_rate: f64,        // 成功率
    pub knowledge_velocity: f64,         // 近7天日均新增
    pub last_absorb_at: Option<String>,
}
```

| 字段 | 类型 | 计算方式 |
|------|------|----------|
| `raw_count` | `usize` | `list_raw_entries(paths).len()` |
| `wiki_count` | `usize` | `list_all_wiki_pages(paths).len()` |
| `concept_count` | `usize` | 过滤 `category == "concept"` |
| `people_count` | `usize` | 过滤 `category == "people"` |
| `topic_count` | `usize` | 过滤 `category == "topic"` |
| `compare_count` | `usize` | 过滤 `category == "compare"` |
| `edge_count` | `usize` | `build_wiki_graph(paths).edge_count` |
| `orphan_count` | `usize` | 遍历所有 wiki pages, 检查 backlinks index 中无入链的数量 |
| `inbox_pending` | `usize` | `load_inbox_file(paths)` 过滤 `status == "pending"` |
| `inbox_resolved` | `usize` | `load_inbox_file(paths)` 过滤 `status == "resolved"` |
| `today_ingest_count` | `usize` | 今日新增 raw 条目数 (按 `ingested_at` 日期过滤) |
| `week_new_pages` | `usize` | 本周新增 wiki 页面数 (按 `created_at` 近 7 天过滤) |
| `avg_page_words` | `usize` | 所有 wiki pages 正文字数的算术平均值 (向下取整) |
| `absorb_success_rate` | `f64` | `inbox_resolved / (inbox_resolved + inbox_pending)` |
| `knowledge_velocity` | `f64` | `week_new_pages / 7.0` (近 7 天日均新增页面数) |
| `last_absorb_at` | `Option<String>` | `list_absorb_log(paths)` 的最后一条的 `timestamp` |

---

## 第四章：Rust 模块架构

### 4.1 wiki_store 扩展

#### 4.1.1 新增公共函数

```rust
/// 追加一条吸收日志到 `{meta}/_absorb_log.json`。
/// 原子写入: load → append → tmp + rename。
/// 受 ABSORB_LOG_GUARD 保护, 序列化并发写入。
pub fn append_absorb_log(
    paths: &WikiPaths,
    entry: AbsorbLogEntry,
) -> Result<()>
```

```rust
/// 读取完整吸收日志, 按 timestamp 倒序返回。
/// 文件不存在时返回空 Vec (不是错误)。
pub fn list_absorb_log(paths: &WikiPaths) -> Result<Vec<AbsorbLogEntry>>
```

```rust
/// 判断指定 raw entry 是否已被吸收。
/// 在 absorb 流程中用于跳过已处理的 entry, 避免重复吸收。
/// 实现: 线性扫描 _absorb_log.json, 查找匹配的 entry_id
///       且 action != "skip"。
pub fn is_entry_absorbed(paths: &WikiPaths, entry_id: u32) -> bool
```

```rust
/// 从磁盘重建完整的反向链接索引。
/// 遍历所有 wiki pages, 对每个页面调用 extract_internal_links(),
/// 收集 slug → [referring slugs] 映射。
/// 返回值不持久化 — 调用方决定是否调用 save_backlinks_index。
pub fn build_backlinks_index(paths: &WikiPaths) -> Result<BacklinksIndex>
```

```rust
/// 将反向链接索引持久化到 `{meta}/_backlinks.json`。
/// 原子写入: tmp + rename。
pub fn save_backlinks_index(
    paths: &WikiPaths,
    index: &BacklinksIndex,
) -> Result<()>
```

```rust
/// 加载已持久化的反向链接索引。
/// 文件不存在时返回空 HashMap。
pub fn load_backlinks_index(paths: &WikiPaths) -> Result<BacklinksIndex>
```

```rust
/// 验证 wiki 页面 frontmatter 是否符合指定的 SchemaTemplate。
/// 返回所有违规项列表; 空列表表示完全合规。
pub fn validate_frontmatter(
    content: &str,
    template: &SchemaTemplate,
) -> Vec<ValidationError>
```

```rust
/// 计算并返回 Wiki 聚合统计数据。
/// 实时计算, 不使用缓存。适用于 Dashboard 和 /api/wiki/stats。
pub fn wiki_stats(paths: &WikiPaths) -> Result<WikiStats>
```

#### 4.1.2 新增类型

```rust
/// 前置验证错误 (validate_frontmatter 的输出项)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub expected: String,
    pub actual: String,
    pub message: String,
}
```

#### 4.1.3 新增互斥锁

```rust
/// 序列化 _absorb_log.json 的读-修改-写操作。
/// 与 INBOX_WRITE_GUARD 同理: 防止并发追加时的 TOCTOU 竞态。
static ABSORB_LOG_GUARD: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_absorb_log_writes() -> MutexGuard<'static, ()> {
    ABSORB_LOG_GUARD
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
```

#### 4.1.4 错误类型扩展

```rust
pub enum WikiStoreError {
    // ── 现有变体 (不变) ──
    #[error("filesystem error at {path}: {source}")]
    Io { path: PathBuf, #[source] source: io::Error },
    #[error("raw entry not found: id={0}")]
    NotFound(u32),
    #[error("invalid input: {0}")]
    Invalid(String),
    // ── v2 新增 ──
    #[error("absorb log corrupted: {0}")]
    AbsorbLogCorrupted(String),
    #[error("backlinks index corrupted: {0}")]
    BacklinksCorrupted(String),
}
```

#### 4.1.5 修改函数

| 函数 | 修改内容 |
|------|----------|
| `write_wiki_page` | 行为不变。调用方负责在适当时机调用 `build_backlinks_index` + `save_backlinks_index` 重建索引 (不在单次写入中自动重建, 避免 `absorb_batch` 批量写入时 N 次全量扫描) |
| `write_wiki_page_in_category` | 同上 |
| `init_wiki` | 新增初始化 `{meta}/_absorb_log.json` (空数组) 和 `{meta}/_backlinks.json` (空对象) |
| `WikiFrontmatter::to_yaml_block` | 支持序列化 v2 新增字段 (`confidence`, `last_verified`, `tags`) |
| `WikiFrontmatter::for_concept` | 新增可选参数支持 confidence |

### 4.2 wiki_maintainer 演进

#### 4.2.1 保持不变

`propose_for_raw_entry` 函数签名和行为完全不变。它仍然是单条 raw entry -> WikiPageProposal 的核心转换单元。

#### 4.2.2 新增公共函数

```rust
/// 批量吸收: 对一批 raw entries 依次执行 propose + write 循环。
///
/// 流程 (per entry):
///   1. 检查 is_entry_absorbed() → 如已吸收则 skip
///   2. 调用 propose_for_raw_entry() 获取 WikiPageProposal
///   3. 检查目标 slug 是否已存在 → 存在则 action="update"
///   4. 调用 wiki_store::write_wiki_page_in_category() 写入磁盘
///   5. 调用 wiki_store::append_absorb_log() 记录日志
///   6. 通过 progress_tx 发送进度事件
///
/// 单条失败不中断批次: 失败的 entry 记录到 AbsorbResult.failed
/// 并通过 progress_tx 发送 error 事件。
///
/// CancellationToken: 遵循 agentic_loop 的取消协议。
/// 每次循环迭代前检查 token.is_cancelled(), 收到取消信号时
/// 提前终止并返回已完成部分的 AbsorbResult。
pub async fn absorb_batch(
    paths: &wiki_store::WikiPaths,
    entry_ids: Vec<u32>,
    broker: &(impl BrokerSender + ?Sized),
    progress_tx: tokio::sync::mpsc::Sender<AbsorbProgressEvent>,
    cancel_token: tokio_util::sync::CancellationToken,
) -> Result<AbsorbResult>
```

```rust
/// Wiki-grounded Q&A: 检索相关 wiki 页面, 构建 RAG prompt,
/// 流式返回回答。
///
/// 流程:
///   1. 调用 wiki_store::search_wiki_pages() 检索相关页面
///   2. 读取 top-K 页面正文作为 context
///   3. 构建 RAG prompt (system: wiki context + user: question)
///   4. 调用 broker.chat_completion() 获取流式回答
///   5. 通过 response_tx 逐 chunk 发送
///
/// 当 Wiki 为空时返回 MaintainerError::RawNotAvailable。
pub async fn query_wiki(
    paths: &wiki_store::WikiPaths,
    question: &str,
    max_sources: usize,
    broker: &(impl BrokerSender + ?Sized),
    response_tx: tokio::sync::mpsc::Sender<QueryChunkEvent>,
) -> Result<QueryResult>
```

#### 4.2.3 新增类型

```rust
/// absorb_batch 的进度事件 (通过 mpsc channel 发送)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbsorbProgressEvent {
    pub processed: usize,
    pub total: usize,
    pub current_entry_id: u32,
    pub action: String,        // "create" | "update" | "skip"
    pub page_slug: Option<String>,
    pub page_title: Option<String>,
    pub error: Option<String>,
}

/// absorb_batch 的最终结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbsorbResult {
    pub created: usize,
    pub updated: usize,
    pub skipped: usize,
    pub failed: usize,
    pub duration_ms: u64,
    pub cancelled: bool,
}

/// query_wiki 的流式回答片段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryChunkEvent {
    pub delta: String,
    pub source_refs: Vec<String>,
}

/// query_wiki 的最终结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub sources: Vec<QuerySource>,
    pub total_tokens: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuerySource {
    pub slug: String,
    pub title: String,
    pub relevance_score: f32,
    pub snippet: String,
}
```

#### 4.2.4 错误类型扩展

```rust
pub enum MaintainerError {
    // ── 现有变体 (不变) ──
    #[error("raw entry not available: {0}")]
    RawNotAvailable(String),
    #[error("broker error: {0}")]
    Broker(String),
    #[error("malformed LLM response: {reason}")]
    BadJson { reason: String, preview: String },
    #[error("invalid proposal shape: {0}")]
    InvalidProposal(String),
    // ── v2 新增 ──
    #[error("wiki store error: {0}")]
    Store(String),
    #[error("absorb cancelled by user")]
    Cancelled,
}
```

### 4.3 wiki_patrol (新增 Crate)

**Cargo.toml 配置**:

```toml
[package]
name = "wiki_patrol"
version.workspace = true
edition.workspace = true

[dependencies]
wiki_store = { path = "../wiki_store" }
serde = { version = "1", features = ["derive"] }
serde_json.workspace = true
thiserror = "2"

[dev-dependencies]
tempfile = "3"
```

**Workspace 注册** (`rust/Cargo.toml`):

```toml
[workspace]
members = [
    # ... 现有 members ...
    "crates/wiki_patrol",
]
```

#### 4.3.1 公共函数

```rust
/// 检测孤儿页面: 无任何入链且不被 index.md 引用的 wiki 页面。
///
/// 实现:
///   1. 加载 backlinks index (或实时构建)
///   2. 遍历所有 wiki pages
///   3. 对每个 page, 检查 backlinks_index[slug] 是否为空
///   4. 额外检查 index.md 中是否提及该 slug
///   5. 两者都不满足则标记为 orphan
pub fn detect_orphans(paths: &wiki_store::WikiPaths) -> Vec<PatrolIssue>
```

```rust
/// 检测过期页面: last_verified 为 None 或距今超过 max_age_days 天。
///
/// 参数:
///   max_age_days: 过期阈值, 推荐默认 90
pub fn detect_stale(
    paths: &wiki_store::WikiPaths,
    max_age_days: u32,
) -> Vec<PatrolIssue>
```

```rust
/// 检测 Schema 违规: frontmatter 缺少必填字段或值不在允许范围内。
///
/// 实现:
///   1. 加载 schema/templates/ 下的模板文件
///   2. 遍历所有 wiki pages
///   3. 根据页面 type 字段匹配对应模板
///   4. 调用 wiki_store::validate_frontmatter() 检查合规性
pub fn detect_schema_violations(
    paths: &wiki_store::WikiPaths,
) -> Vec<PatrolIssue>
```

```rust
/// 检测超长页面: 正文行数超过 max_lines。
///
/// 参数:
///   max_lines: 行数阈值, 推荐默认 500
pub fn detect_oversized(
    paths: &wiki_store::WikiPaths,
    max_lines: u32,
) -> Vec<PatrolIssue>
```

```rust
/// 检测残桩页面: 正文行数不足 min_lines。
///
/// 参数:
///   min_lines: 最少行数阈值, 推荐默认 10
pub fn detect_stubs(
    paths: &wiki_store::WikiPaths,
    min_lines: u32,
) -> Vec<PatrolIssue>
```

```rust
/// 运行完整巡检: 依次执行所有检测器, 汇总为 PatrolReport。
///
/// 使用默认阈值:
///   - stale: max_age_days = 90
///   - oversized: max_lines = 500
///   - stubs: min_lines = 10
pub fn run_full_patrol(
    paths: &wiki_store::WikiPaths,
) -> PatrolReport
```

```rust
/// 运行完整巡检并自定义阈值。
pub fn run_full_patrol_with_config(
    paths: &wiki_store::WikiPaths,
    config: &PatrolConfig,
) -> PatrolReport
```

#### 4.3.2 类型定义

```rust
/// 巡检配置
#[derive(Debug, Clone)]
pub struct PatrolConfig {
    pub max_stale_days: u32,     // 默认 90
    pub max_page_lines: u32,     // 默认 500
    pub min_page_lines: u32,     // 默认 10
    pub skip_deprecated: bool,   // 默认 true, 跳过 status="deprecated" 的页面
}

impl Default for PatrolConfig {
    fn default() -> Self {
        Self {
            max_stale_days: 90,
            max_page_lines: 500,
            min_page_lines: 10,
            skip_deprecated: true,
        }
    }
}

/// 巡检错误
#[derive(Debug, thiserror::Error)]
pub enum PatrolError {
    #[error("wiki store error: {0}")]
    Store(#[from] wiki_store::WikiStoreError),
}

pub type Result<T> = std::result::Result<T, PatrolError>;
```

### 4.4 desktop-server 新路由

#### 4.4.1 路由注册

在 `desktop-server/src/lib.rs` 的 router 构建中新增:

```rust
// ── v2 SKILL endpoints ──────────────────────────────────────
.route("/api/wiki/absorb", post(absorb_handler))
.route("/api/wiki/query", post(query_handler))
.route("/api/wiki/cleanup", post(cleanup_handler))
.route("/api/wiki/patrol", post(patrol_handler))
// ── v2 data endpoints ───────────────────────────────────────
.route("/api/wiki/absorb-log", get(list_absorb_log_handler))
.route("/api/wiki/backlinks", get(get_backlinks_handler))
.route("/api/wiki/stats", get(get_wiki_stats_handler))
```

#### 4.4.2 Handler 函数签名

> **State 类型说明**: 与现有 105 个端点一致, 所有 handler 使用 `State<AppState>`。
> 通过 `state.desktop` 访问 `DesktopState`, 通过 `state.desktop.wiki_paths()` 获取 `WikiPaths`。

```rust
/// POST /api/wiki/absorb
async fn absorb_handler(
    State(state): State<AppState>,
    Json(request): Json<AbsorbRequest>,
) -> impl IntoResponse
```

```rust
/// POST /api/wiki/query
async fn query_handler(
    State(state): State<AppState>,
    Json(request): Json<QueryRequest>,
) -> Sse<impl Stream<Item = std::result::Result<Event, Infallible>>>
```

```rust
/// POST /api/wiki/cleanup
async fn cleanup_handler(
    State(state): State<AppState>,
) -> impl IntoResponse
```

```rust
/// POST /api/wiki/patrol
async fn patrol_handler(
    State(state): State<AppState>,
) -> impl IntoResponse
```

```rust
/// GET /api/wiki/absorb-log
async fn list_absorb_log_handler(
    State(state): State<AppState>,
    Query(params): Query<AbsorbLogQueryParams>,
) -> impl IntoResponse
```

```rust
/// GET /api/wiki/backlinks
async fn get_backlinks_handler(
    State(state): State<AppState>,
    Query(params): Query<BacklinksQueryParams>,
) -> impl IntoResponse
```

```rust
/// GET /api/wiki/stats
async fn get_wiki_stats_handler(
    State(state): State<AppState>,
) -> impl IntoResponse
```

#### 4.4.3 Request/Response 类型

```rust
#[derive(Deserialize)]
struct AbsorbRequest {
    entry_ids: Option<Vec<u32>>,
    date_range: Option<DateRange>,
}

#[derive(Deserialize)]
struct DateRange {
    from: String,
    to: String,
}

#[derive(Deserialize)]
struct QueryRequest {
    question: String,
    session_id: Option<String>,
    max_sources: Option<usize>,
}

#[derive(Deserialize)]
struct AbsorbLogQueryParams {
    limit: Option<usize>,
    offset: Option<usize>,
}

#[derive(Deserialize)]
struct BacklinksQueryParams {
    slug: Option<String>,
}
```

### 4.5 desktop-core 扩展

#### 4.5.1 SkillRouter (新增模块)

```rust
// desktop-core/src/skill_router.rs

/// SKILL 命令路由器。解析用户在 Chat 中输入的 /skill 命令,
/// 路由到对应的后端处理函数。
pub struct SkillRouter {
    state: Arc<DesktopState>,
}

impl SkillRouter {
    pub fn new(state: Arc<DesktopState>) -> Self {
        Self { state }
    }

    /// 解析并路由 SKILL 命令。
    /// 返回 None 表示输入不是 SKILL 命令 (普通消息)。
    pub async fn route(
        &self,
        input: &str,
        session_id: &str,
    ) -> Option<SkillResult>

    /// 检查输入是否以 / 开头且匹配已注册的 SKILL。
    pub fn is_skill_command(input: &str) -> bool
}

/// SKILL 命令解析结果
pub enum SkillCommand {
    Absorb { entry_ids: Option<Vec<u32>> },
    Query { question: String },
    Cleanup,
    Patrol,
}

pub enum SkillResult {
    /// 异步任务已启动, 进度通过 SSE 推送
    TaskStarted { task_id: String },
    /// 同步结果 (仅 query 使用 SSE 流)
    StreamStarted { task_id: String },
    /// 命令解析失败
    ParseError { message: String },
}
```

#### 4.5.2 AbsorbTaskManager (新增模块)

```rust
// desktop-core/src/absorb_task.rs

use std::collections::HashMap;
use tokio::sync::RwLock;

/// 追踪正在执行的异步 SKILL 任务, 防止重复执行。
pub struct TaskManager {
    active_tasks: RwLock<HashMap<String, TaskInfo>>,
}

pub struct TaskInfo {
    pub task_id: String,
    pub kind: String,          // "absorb" | "cleanup" | "patrol"
    pub started_at: String,
    pub cancel_token: tokio_util::sync::CancellationToken,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            active_tasks: RwLock::new(HashMap::new()),
        }
    }

    /// 注册新任务。如果同类任务已在执行中, 返回 Err (409)。
    pub async fn register(
        &self,
        kind: &str,
    ) -> std::result::Result<(String, CancellationToken), TaskConflictError>

    /// 标记任务完成, 从 active_tasks 中移除。
    pub async fn complete(&self, task_id: &str)

    /// 取消指定任务。
    pub async fn cancel(&self, task_id: &str) -> bool

    /// 检查某类任务是否正在执行。
    pub async fn is_running(&self, kind: &str) -> bool
}
```

---

## 第五章：前端模块架构

### 5.1 路由重构方案

#### 当前路由 (v1, 9 条)

```typescript
// ClawWikiShell.tsx
<Routes>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/ask/*" element={<AskPage />} />
  <Route path="/inbox" element={<InboxPage />} />
  <Route path="/raw/*" element={<RawLibraryPage />} />
  <Route path="/wiki/*" element={<WikiExplorerPage />} />
  <Route path="/graph" element={<GraphPage />} />
  <Route path="/schema/*" element={<SchemaEditorPage />} />
  <Route path="/wechat" element={<WeChatBridgePage />} />
  <Route path="/settings" element={<SettingsPage />} />
  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>
```

#### 目标路由 (v2, 9 条)

```typescript
// ClawWikiShell.tsx (v2)
<Routes>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/chat/*" element={<MainTabArea defaultTab="chat" />} />
  <Route path="/wiki/*" element={<MainTabArea defaultTab="wiki" />} />
  <Route path="/inbox" element={<InboxPage />} />
  <Route path="/raw/*" element={<RawLibraryPage />} />
  <Route path="/graph" element={<GraphPage />} />
  <Route path="/schema/*" element={<SchemaEditorPage />} />
  <Route path="/wechat" element={<WeChatBridgePage />} />
  <Route path="/settings" element={<SettingsPage />} />
  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>
```

**关键变更**:
- `/ask/*` 重命名为 `/chat/*`
- `/chat/*` 和 `/wiki/*` 共享 `MainTabArea` 组件, 通过 `defaultTab` prop 决定初始激活的 Tab
- 其余 7 条路由不变

#### 路由定义更新

```typescript
// clawwiki-routes.ts (v2)
export const CLAWWIKI_ROUTES: readonly ClawWikiRoute[] = [
  {
    key: "dashboard",
    path: "/dashboard",
    icon: "LayoutDashboard",  // 迁移到 lucide-react
    label: "Dashboard",
    section: "primary",
    sprint: "S3",
  },
  {
    key: "chat",              // ask → chat
    path: "/chat",
    icon: "MessageSquare",
    label: "Chat",
    section: "primary",
    sprint: "S3",
  },
  {
    key: "wiki",
    path: "/wiki",
    icon: "BookOpen",
    label: "Wiki",
    section: "primary",
    sprint: "S4",
  },
  {
    key: "inbox",
    path: "/inbox",
    icon: "Inbox",
    label: "Inbox",
    section: "primary",
    sprint: "S4",
    badge: "—",
  },
  // ... raw, graph, schema, wechat, settings 不变
] as const;
```

### 5.2 组件树

```
ClawWikiShell
├── Sidebar
│   ├── SidebarNav
│   │   ├── NavItem (Dashboard)
│   │   ├── NavItem (Chat) ← 原 Ask
│   │   ├── NavItem (Wiki)
│   │   ├── NavItem (Inbox)
│   │   ├── NavItem (Raw Library)
│   │   ├── NavItem (Graph)
│   │   └── NavItem (Schema)
│   ├── SidebarFunnel
│   │   └── NavItem (WeChat Bridge)
│   └── SidebarFooter
│       └── NavItem (Settings)
│
├── MainTabArea ← 新增 (Chat/Wiki 共享容器)
│   ├── TabBar
│   │   ├── TabButton ("Chat")
│   │   └── TabButton ("Wiki")
│   ├── ChatTab (当 activeTab === "chat")
│   │   ├── ChatSessionSidebar
│   │   │   ├── SessionList
│   │   │   └── NewSessionButton
│   │   └── ChatContent
│   │       ├── MessageList
│   │       │   ├── AssistantMessage
│   │       │   ├── UserMessage
│   │       │   └── SkillResultMessage ← 新增
│   │       └── ChatInput
│   │           ├── SkillCommandInput ← 新增
│   │           └── SendButton
│   └── WikiTab (当 activeTab === "wiki")
│       ├── WikiTabBar ← 新增 (多标签浏览器)
│       │   ├── WikiTabItem (page-slug-1)
│       │   ├── WikiTabItem (page-slug-2)
│       │   └── NewTabButton
│       └── WikiContent
│           ├── WikiPageView
│           │   ├── WikiFrontmatterPanel
│           │   ├── WikiMarkdownRenderer
│           │   └── WikiBacklinksPanel ← 新增
│           ├── WikiSearchPanel
│           └── WikiGraphMinimap ← 新增
│
├── DashboardPage
│   ├── StatsCards ← 新增 (接入 /api/wiki/stats)
│   ├── RecentActivity
│   └── QuickActions
│
├── InboxPage (扩展 kind 支持)
│   ├── InboxList
│   │   ├── InboxItem (kind=new-raw)
│   │   ├── InboxItem (kind=conflict) ← v1 已有, v2 由 /absorb 自动生成
│   │   ├── InboxItem (kind=stale) ← v1 已有, v2 由 /patrol 自动生成
│   │   ├── InboxItem (kind=schema-violation) ← 新增
│   │   └── InboxItem (kind=cleanup-suggestion) ← 新增
│   └── InboxDetailPane
│
├── RawLibraryPage (不变)
├── GraphPage (不变, 接入 backlinks 数据)
├── SchemaEditorPage (不变)
├── WeChatBridgePage (不变)
└── SettingsPage (不变)
```

### 5.3 新增 Zustand Stores

#### 5.3.1 tabStore (多标签浏览器状态)

```typescript
// src/state/tab-store.ts

import { create } from "zustand";

interface WikiBrowserTab {
  id: string;              // 唯一标识, 格式 "wiki-tab-{nanoid}"
  slug: string;            // wiki page slug
  title: string;           // 显示标题
  scrollPosition: number;  // 滚动位置 (恢复用)
  isPinned: boolean;       // 是否固定
  openedAt: number;        // 打开时间戳 (排序用)
}

interface MainTabState {
  // ── 主 Tab 切换 ──
  activeMainTab: "chat" | "wiki";
  setActiveMainTab: (tab: "chat" | "wiki") => void;

  // ── Wiki 多标签浏览器 ──
  wikiTabs: WikiBrowserTab[];
  activeWikiTabId: string | null;

  openWikiPage: (slug: string, title: string) => void;
  closeWikiTab: (tabId: string) => void;
  setActiveWikiTab: (tabId: string) => void;
  pinWikiTab: (tabId: string) => void;
  unpinWikiTab: (tabId: string) => void;
  updateScrollPosition: (tabId: string, position: number) => void;
  closeAllUnpinnedTabs: () => void;
}

export const useTabStore = create<MainTabState>()((set, get) => ({
  activeMainTab: "chat",
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),

  wikiTabs: [],
  activeWikiTabId: null,

  openWikiPage: (slug, title) => {
    const { wikiTabs } = get();
    // 如果已打开同 slug 的 tab, 激活它而不是新建
    const existing = wikiTabs.find((t) => t.slug === slug);
    if (existing) {
      set({ activeWikiTabId: existing.id, activeMainTab: "wiki" });
      return;
    }
    const newTab: WikiBrowserTab = {
      id: `wiki-tab-${Date.now().toString(36)}`,
      slug,
      title,
      scrollPosition: 0,
      isPinned: false,
      openedAt: Date.now(),
    };
    set({
      wikiTabs: [...wikiTabs, newTab],
      activeWikiTabId: newTab.id,
      activeMainTab: "wiki",
    });
  },

  closeWikiTab: (tabId) => {
    const { wikiTabs, activeWikiTabId } = get();
    const filtered = wikiTabs.filter((t) => t.id !== tabId);
    let nextActive = activeWikiTabId;
    if (activeWikiTabId === tabId) {
      // 激活最近打开的 tab, 或 null
      nextActive = filtered.length > 0
        ? filtered[filtered.length - 1].id
        : null;
    }
    set({ wikiTabs: filtered, activeWikiTabId: nextActive });
  },

  setActiveWikiTab: (tabId) => set({ activeWikiTabId: tabId }),

  pinWikiTab: (tabId) =>
    set((s) => ({
      wikiTabs: s.wikiTabs.map((t) =>
        t.id === tabId ? { ...t, isPinned: true } : t,
      ),
    })),

  unpinWikiTab: (tabId) =>
    set((s) => ({
      wikiTabs: s.wikiTabs.map((t) =>
        t.id === tabId ? { ...t, isPinned: false } : t,
      ),
    })),

  updateScrollPosition: (tabId, position) =>
    set((s) => ({
      wikiTabs: s.wikiTabs.map((t) =>
        t.id === tabId ? { ...t, scrollPosition: position } : t,
      ),
    })),

  closeAllUnpinnedTabs: () =>
    set((s) => {
      const pinned = s.wikiTabs.filter((t) => t.isPinned);
      const nextActive =
        pinned.find((t) => t.id === s.activeWikiTabId)?.id ??
        (pinned.length > 0 ? pinned[0].id : null);
      return { wikiTabs: pinned, activeWikiTabId: nextActive };
    }),
}));
```

#### 5.3.2 skillStore (SKILL 执行状态)

```typescript
// src/state/skill-store.ts

import { create } from "zustand";

interface SkillTask {
  taskId: string;
  kind: "absorb" | "cleanup" | "patrol";
  status: "running" | "completed" | "failed" | "cancelled";
  progress?: {
    processed: number;
    total: number;
  };
  result?: unknown;
  startedAt: number;
  completedAt?: number;
}

interface SkillState {
  activeTasks: Record<string, SkillTask>;
  taskHistory: SkillTask[];

  startTask: (taskId: string, kind: SkillTask["kind"]) => void;
  updateProgress: (taskId: string, processed: number, total: number) => void;
  completeTask: (taskId: string, result: unknown) => void;
  failTask: (taskId: string, error: string) => void;
  cancelTask: (taskId: string) => void;

  isKindRunning: (kind: SkillTask["kind"]) => boolean;
  getActiveTask: (kind: SkillTask["kind"]) => SkillTask | undefined;
}

export const useSkillStore = create<SkillState>()((set, get) => ({
  activeTasks: {},
  taskHistory: [],

  startTask: (taskId, kind) =>
    set((s) => ({
      activeTasks: {
        ...s.activeTasks,
        [taskId]: {
          taskId,
          kind,
          status: "running",
          startedAt: Date.now(),
        },
      },
    })),

  updateProgress: (taskId, processed, total) =>
    set((s) => ({
      activeTasks: {
        ...s.activeTasks,
        [taskId]: {
          ...s.activeTasks[taskId],
          progress: { processed, total },
        },
      },
    })),

  completeTask: (taskId, result) =>
    set((s) => {
      const task = s.activeTasks[taskId];
      if (!task) return s;
      const completed = { ...task, status: "completed" as const, result, completedAt: Date.now() };
      const { [taskId]: _, ...rest } = s.activeTasks;
      return {
        activeTasks: rest,
        taskHistory: [completed, ...s.taskHistory].slice(0, 50),
      };
    }),

  failTask: (taskId, error) =>
    set((s) => {
      const task = s.activeTasks[taskId];
      if (!task) return s;
      const failed = { ...task, status: "failed" as const, result: { error }, completedAt: Date.now() };
      const { [taskId]: _, ...rest } = s.activeTasks;
      return {
        activeTasks: rest,
        taskHistory: [failed, ...s.taskHistory].slice(0, 50),
      };
    }),

  cancelTask: (taskId) =>
    set((s) => {
      const task = s.activeTasks[taskId];
      if (!task) return s;
      const cancelled = { ...task, status: "cancelled" as const, completedAt: Date.now() };
      const { [taskId]: _, ...rest } = s.activeTasks;
      return {
        activeTasks: rest,
        taskHistory: [cancelled, ...s.taskHistory].slice(0, 50),
      };
    }),

  isKindRunning: (kind) =>
    Object.values(get().activeTasks).some((t) => t.kind === kind),

  getActiveTask: (kind) =>
    Object.values(get().activeTasks).find((t) => t.kind === kind),
}));
```

### 5.4 状态流示例

#### 场景 A: 用户打开 Wiki 页面

```
1. 用户在 WikiSearchPanel 搜索 "Transformer"
   → 调用 searchWikiPages("Transformer")
   → 返回 hits 列表

2. 用户点击搜索结果 "Transformer 架构"
   → tabStore.openWikiPage("transformer-architecture", "Transformer 架构")
   → tabStore 检查是否已有同 slug 的 tab
     → 无: 创建 WikiBrowserTab, 加入 wikiTabs, 设为 activeWikiTabId
     → 有: 直接设置 activeWikiTabId
   → tabStore.activeMainTab 自动切换为 "wiki"

3. WikiTab 组件 re-render
   → WikiTabBar 渲染 tab 列表, 高亮 activeWikiTabId
   → WikiContent 根据 activeWikiTabId 查找对应 slug
   → 触发 useQuery: getWikiPage("transformer-architecture")
   → WikiPageView 渲染 frontmatter + markdown body + backlinks

4. 用户切换到另一个 wiki tab
   → tabStore.updateScrollPosition(oldTabId, currentScroll) 保存滚动位置
   → tabStore.setActiveWikiTab(newTabId)
   → WikiContent 切换渲染, 恢复 scrollPosition
```

#### 场景 B: 用户执行 /absorb

```
1. 用户在 Chat 输入框输入 "/absorb"
   → ChatInput 识别 SKILL 命令前缀
   → 调用 POST /api/wiki/absorb (body: {})

2. 后端返回 202: { task_id: "absorb-...", status: "started", total_entries: 5 }
   → skillStore.startTask("absorb-...", "absorb")
   → ChatContent 显示 SkillResultMessage (进度卡片)

3. SSE 事件 absorb_progress 持续到达
   → skillStore.updateProgress("absorb-...", processed, total)
   → SkillResultMessage 实时更新进度条

4. SSE 事件 absorb_complete 到达
   → skillStore.completeTask("absorb-...", result)
   → SkillResultMessage 显示完成汇总
   → invalidateQueries(["wikiPages", "wikiGraph", "wikiStats"])
     触发 Dashboard 和 Wiki Tab 数据刷新
```

### 5.5 API Client 扩展

在 `features/ingest/persist.ts` 中新增以下函数:

```typescript
// ── v2 SKILL API ──────────────────────────────────────────

/** POST /api/wiki/absorb — 触发批量吸收 */
export async function triggerAbsorb(
  request: AbsorbRequest = {},
): Promise<AbsorbTaskResponse> {
  return fetchJson<AbsorbTaskResponse>("/api/wiki/absorb", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/** POST /api/wiki/query — Wiki-grounded Q&A (返回 EventSource URL) */
export function createQueryStream(
  question: string,
  sessionId?: string,
  maxSources?: number,
): EventSource {
  const params = new URLSearchParams();
  params.set("question", question);
  if (sessionId) params.set("session_id", sessionId);
  if (maxSources) params.set("max_sources", String(maxSources));
  // query 使用 SSE, 通过 EventSource 连接
  // 注: 实际实现可能使用 fetch + ReadableStream 代替 EventSource
  // 以支持 POST body
  return new EventSource(`/api/wiki/query?${params.toString()}`);
}

/** POST /api/wiki/query — 使用 fetch 的 SSE 流式版本 */
export async function queryWiki(
  request: QueryRequest,
): Promise<Response> {
  return fetch("/api/wiki/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

/** POST /api/wiki/cleanup — 触发 cleanup 审计 */
export async function triggerCleanup(): Promise<TaskResponse> {
  return fetchJson<TaskResponse>("/api/wiki/cleanup", {
    method: "POST",
  });
}

/** POST /api/wiki/patrol — 触发巡检 */
export async function triggerPatrol(): Promise<TaskResponse> {
  return fetchJson<TaskResponse>("/api/wiki/patrol", {
    method: "POST",
  });
}

// ── v2 Data API ───────────────────────────────────────────

/** GET /api/wiki/absorb-log — 获取吸收日志 */
export async function getAbsorbLog(
  limit = 100,
  offset = 0,
): Promise<AbsorbLogResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return fetchJson<AbsorbLogResponse>(
    `/api/wiki/absorb-log?${params.toString()}`,
  );
}

/** GET /api/wiki/backlinks — 获取反向链接 */
export async function getBacklinks(
  slug?: string,
): Promise<BacklinksResponse> {
  const params = new URLSearchParams();
  if (slug) params.set("slug", slug);
  const qs = params.toString();
  return fetchJson<BacklinksResponse>(
    `/api/wiki/backlinks${qs ? `?${qs}` : ""}`,
  );
}

/** GET /api/wiki/stats — 获取聚合统计 */
export async function getWikiStats(): Promise<WikiStats> {
  return fetchJson<WikiStats>("/api/wiki/stats");
}
```

### 5.6 TypeScript 类型扩展

在 `features/ingest/types.ts` 中新增:

```typescript
// ── v2 Request Types ──────────────────────────────────────

export interface AbsorbRequest {
  entry_ids?: number[];
  date_range?: {
    from: string;
    to: string;
  };
}

export interface QueryRequest {
  question: string;
  session_id?: string;
  max_sources?: number;
}

// ── v2 Response Types ─────────────────────────────────────

export interface AbsorbTaskResponse {
  task_id: string;
  status: "started";
  total_entries: number;
}

export interface TaskResponse {
  task_id: string;
  status: "started";
}

export interface AbsorbLogEntry {
  entry_id: number;
  timestamp: string;
  action: "create" | "update" | "skip";
  page_slug: string | null;
  page_title: string | null;
  page_category: string | null;
}

export interface AbsorbLogResponse {
  entries: AbsorbLogEntry[];
  total: number;
}

export interface BacklinksResponse {
  index?: Record<string, string[]>;
  slug?: string;
  backlinks?: Array<{
    slug: string;
    title: string;
    category: string;
  }>;
  count?: number;
  total_pages?: number;
  total_backlinks?: number;
}

export interface PatrolIssue {
  kind: "orphan" | "stale" | "schema-violation" | "oversized" | "stub";
  page_slug: string;
  description: string;
  suggested_action: string;
}

export interface WikiStats {
  raw_count: number;
  wiki_count: number;
  concept_count: number;
  people_count: number;
  topic_count: number;
  compare_count: number;
  edge_count: number;
  orphan_count: number;
  inbox_pending: number;
  inbox_resolved: number;
  today_ingest_count: number;
  week_new_pages: number;
  avg_page_words: number;
  absorb_success_rate: number;
  knowledge_velocity: number;
  last_absorb_at: string | null;
}

// ── v2 SSE Event Types ────────────────────────────────────

export interface AbsorbProgressEvent {
  type: "absorb_progress";
  task_id: string;
  processed: number;
  total: number;
  current_entry_id: number;
  action: "create" | "update" | "skip";
  page_slug: string | null;
  page_title: string | null;
  error: string | null;
}

export interface AbsorbCompleteEvent {
  type: "absorb_complete";
  task_id: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  duration_ms: number;
}

export interface QuerySourcesEvent {
  type: "query_sources";
  sources: Array<{
    slug: string;
    title: string;
    relevance_score: number;
    snippet: string;
  }>;
}

export interface QueryChunkEvent {
  type: "query_chunk";
  delta: string;
  source_refs: string[];
}

export interface QueryDoneEvent {
  type: "query_done";
  total_tokens: number;
  sources_used: string[];
}

export interface PatrolReportEvent {
  type: "patrol_report";
  task_id: string;
  issues: PatrolIssue[];
  summary: {
    orphans: number;
    stale: number;
    schema_violations: number;
    oversized: number;
    stubs: number;
  };
  inbox_entries_created: number;
  duration_ms: number;
}

export type SkillEvent =
  | AbsorbProgressEvent
  | AbsorbCompleteEvent
  | QuerySourcesEvent
  | QueryChunkEvent
  | QueryDoneEvent
  | PatrolReportEvent;
```

### 5.7 React Query 集成

新增 query keys 和 hooks:

```typescript
// src/features/wiki/hooks.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWikiStats,
  getAbsorbLog,
  getBacklinks,
  triggerAbsorb,
  triggerCleanup,
  triggerPatrol,
} from "@/features/ingest/persist";

// ── Query Keys ────────────────────────────────────────────

export const wikiKeys = {
  all: ["wiki"] as const,
  stats: () => [...wikiKeys.all, "stats"] as const,
  absorbLog: (limit: number, offset: number) =>
    [...wikiKeys.all, "absorb-log", limit, offset] as const,
  backlinks: (slug?: string) =>
    [...wikiKeys.all, "backlinks", slug ?? "all"] as const,
};

// ── Hooks ─────────────────────────────────────────────────

export function useWikiStats() {
  return useQuery({
    queryKey: wikiKeys.stats(),
    queryFn: getWikiStats,
    staleTime: 10_000,
  });
}

export function useAbsorbLog(limit = 100, offset = 0) {
  return useQuery({
    queryKey: wikiKeys.absorbLog(limit, offset),
    queryFn: () => getAbsorbLog(limit, offset),
  });
}

export function useBacklinks(slug?: string) {
  return useQuery({
    queryKey: wikiKeys.backlinks(slug),
    queryFn: () => getBacklinks(slug),
  });
}

export function useAbsorbMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerAbsorb,
    onSuccess: () => {
      // absorb 完成后刷新相关数据
      queryClient.invalidateQueries({ queryKey: wikiKeys.stats() });
      queryClient.invalidateQueries({ queryKey: ["wikiPages"] });
      queryClient.invalidateQueries({ queryKey: ["wikiGraph"] });
    },
  });
}

export function useCleanupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerCleanup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}

export function usePatrolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerPatrol,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.stats() });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });
}
```

---

## 第六章：前后端交互协议

### 6.1 SSE 事件流架构

**现有 SSE 端点:**

```
GET /api/desktop/sessions/{id}/events
```

**已有事件类型（v1，PascalCase）:**

> **命名约定说明**: 已有事件沿用 v1 代码中的 PascalCase 命名（`TextDelta`、`ToolStart` 等），
> 这是因为它们已在 `desktop-core/src/agentic_loop.rs` 和前端 `useAskSSE.ts` 中广泛使用，
> 改名会破坏向后兼容。v2 新增事件统一使用 snake_case，与 Rust 序列化默认风格一致。
> 长期规划：v3 大版本时统一迁移为 snake_case。

| 事件类型 | 说明 |
|---------|------|
| `TextDelta` | 流式文本增量 |
| `ToolStart` | 工具调用开始 |
| `ToolResult` | 工具调用结果 |
| `PermissionRequest` | 权限请求 |
| `TurnComplete` | 回合完成 |
| `Error` | 错误事件 |

**新增事件类型（v2，snake_case）:**

| 事件类型 | 说明 | 触发场景 |
|---------|------|---------|
| `absorb_progress` | 摄入进度更新 | `/absorb` 执行期间，每处理一条 inbox 项发送一次 |
| `patrol_report` | 巡检报告推送 | `/patrol` 完成后推送检测结果 |
| `wiki_updated` | Wiki 页面变更通知 | wiki 页面创建/更新/删除时 |
| `inbox_changed` | Inbox 变更通知 | 新消息入库或消息状态变更时 |

**事件数据格式:**

```
event: {type}\ndata: {json}\n\n
```

示例:

```
event: absorb_progress
data: {"processed": 3, "total": 10, "current_slug": "rust-ownership", "status": "processing"}

event: wiki_updated
data: {"slug": "rust-ownership", "action": "created", "title": "Rust 所有权机制"}

event: patrol_report
data: {"orphans": 2, "stale": 5, "schema_violations": 1, "total_issues": 8}

event: inbox_changed
data: {"action": "added", "source": "wechat", "count": 1}
```

**重连策略:**

- 使用浏览器原生 `EventSource` API，自动重连
- 支持 `Last-Event-ID` 头，服务端据此恢复事件流
- 重连间隔: 默认 3 秒，指数退避最大 30 秒
- 前端维护事件序列号，重连后请求缺失事件

### 6.2 WebSocket 扩展

**现有 WebSocket 端点:**

```
/ws/wechat-inbox   # inbox 变更通知
```

**扩展为通用事件总线:**

```
/ws/events   # 统一事件总线
```

覆盖场景:
- Wiki 变更通知（页面创建/更新/删除）
- Absorb 进度实时推送
- Patrol 巡检报告
- Inbox 变更通知（兼容原有 `/ws/wechat-inbox`）

**消息格式:**

```json
{
  "type": "wiki_updated",
  "payload": {
    "slug": "rust-ownership",
    "action": "created",
    "title": "Rust 所有权机制"
  },
  "timestamp": "2026-04-14T10:30:00Z"
}
```

**消息类型枚举:**

```typescript
type WsMessageType =
  | "wiki_updated"      // wiki 页面变更
  | "absorb_progress"   // 摄入进度
  | "patrol_report"     // 巡检报告
  | "inbox_changed"     // inbox 变更
  | "system_status";    // 系统状态变更
```

### 6.3 错误处理统一方案

**HTTP 错误响应格式:**

```json
{
  "error": "Wiki page not found",
  "code": "WIKI_NOT_FOUND",
  "details": {
    "slug": "nonexistent-page"
  }
}
```

**标准错误码:**

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `INVALID_REQUEST` | 请求参数无效 |
| 404 | `WIKI_NOT_FOUND` | Wiki 页面不存在 |
| 404 | `SESSION_NOT_FOUND` | 会话不存在 |
| 409 | `ABSORB_IN_PROGRESS` | 摄入任务正在进行中 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |
| 500 | `LLM_ERROR` | LLM 调用失败 |

**SSE 错误事件:**

```
event: error
data: {"message": "LLM rate limit exceeded", "recoverable": true}
```

- `recoverable: true` — 前端可提示用户重试
- `recoverable: false` — 前端显示错误并停止轮询

**前端错误边界:**

- 每个路由级组件包裹 `ErrorBoundary`，捕获渲染异常
- API 错误通过 `react-hot-toast` 显示 toast 通知
- 网络错误触发全局重连逻辑
- 关键操作（absorb、patrol）失败时显示详细错误面板

**Rust 错误链:**

```
thiserror 定义错误类型
  → axum IntoResponse trait 实现
    → JSON error body 序列化
```

每个 crate 定义自己的 `Error` enum，通过 `#[from]` 自动转换:

```rust
#[derive(Debug, thiserror::Error)]
pub enum WikiError {
    #[error("Page not found: {slug}")]
    NotFound { slug: String },

    #[error("Frontmatter validation failed: {reason}")]
    InvalidFrontmatter { reason: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
```

### 6.4 请求认证

**当前方案（桌面单用户）:**

- 无认证，所有 API 端点开放
- 仅监听 `127.0.0.1`，拒绝外部访问
- Tauri 内部通过 localhost 调用

**未来方案（Web viewer 场景）:**

- JWT Token 认证，参照 llm-wiki 的 `middleware.ts` 实现
- Token 生成: 桌面端生成 JWT，手动分享给 Web viewer
- Token 验证: axum middleware 拦截，验证签名和过期时间
- 权限级别: `read-only`（Web viewer）/ `full`（桌面端）

---

## 第七章：安全 & 数据策略

### 7.1 Token 存储

**微信 Token:**

- 加密算法: AES-256-GCM
- 实现模块: `secure_storage` module
- 密钥派生: 从系统用户凭据派生，非硬编码
- 存储位置: `$CLAWWIKI_HOME/.tokens/wechat.enc`

**API Keys:**

- 存储路径: `~/.warwolf/.secret-key`
- 加密方式: 文件级加密，启动时解密到内存
- 权限控制: 文件权限 `0600`（仅所有者可读写）

**codex_broker pool:**

- 运行时: 内存持有，进程退出即清除
- 持久化: 磁盘加密存储，启动时加载
- 轮转: 支持多 key 轮转，自动跳过失效 key

### 7.2 CLAWWIKI_HOME 路径

**默认路径:**

```
$HOME/.clawwiki/
```

**目录结构:**

```
~/.clawwiki/
├── wiki/              # Wiki 页面 (Markdown)
├── inbox/             # Inbox 消息
├── absorb-log/        # 摄入日志
├── .tokens/           # 加密 token
├── .backlinks.json    # 反链索引
├── config.toml        # 用户配置
└── .git/              # 可选 git 版本控制
```

**Windows 兼容性问题:**

- `C:\Users\{name}\` 路径可能涉及管理员权限
- Tauri app 以当前用户权限运行
- 如果默认路径写入失败，fallback 到 `%LOCALAPPDATA%\clawwiki\`
- 路径探测优先级:
  1. 环境变量 `CLAWWIKI_HOME`（最高优先级）
  2. `$HOME/.clawwiki/`
  3. `%LOCALAPPDATA%\clawwiki/`（Windows fallback）

### 7.3 Git 版本化

**初始化:**

- `wiki/` 目录支持可选 `git init`
- 用户在 Settings 中开启/关闭
- 首次开启时自动执行 `git init` + initial commit

**自动提交:**

- 每次 `write_wiki_page` 完成后，自动 `git add` + `git commit`
- commit message 格式: `wiki: update {slug}` 或 `wiki: create {slug}`
- 可在 `config.toml` 中配置开关: `git_auto_commit = true/false`

**冲突解决:**

- 场景: 用户同时用 Obsidian 和 ClawWiki 编辑同一文件
- 检测: 写入前检查文件 mtime，发现冲突则标记
- 处理: `mark_conflict` → 写入 inbox → 用户人工裁决
- 冲突标记格式: 在 inbox 中生成冲突通知，附带两个版本的 diff

### 7.4 数据备份

**设计原则: 数据即文件，文件即备份。**

- 所有数据为纯 Markdown 文件 + JSON 索引
- 可直接 `cp -r ~/.clawwiki/ /backup/` 完成备份
- 支持 `rsync` 增量同步到远程

**Obsidian 兼容:**

- 用户可直接用 Obsidian 打开 `~/.clawwiki/wiki/` 目录
- frontmatter 格式兼容 Obsidian（YAML 格式）
- `[[wikilink]]` 语法兼容
- 标签系统兼容 Obsidian 的 `#tag` 语法

**导出:**

- 整个 `wiki/` 目录即为导出结果
- 无需专门的导出功能，用户可直接复制文件
- JSON 索引文件（`_backlinks.json`、`_stats.json`）可从 Markdown 文件重建

---

## 第八章：测试策略

### 8.1 Rust 单元测试

**现有基线:**

- 385 个测试，全部通过
- 覆盖: codex_broker、desktop-server、wiki_store 核心模块

**测试目标:**

- 每个新 `pub fn` 至少 2 个测试: happy path + error path
- 关键模块（wiki_store、wiki_patrol）每个函数至少 3 个测试

**wiki_store 新函数测试计划:**

| 函数 | 测试用例 |
|------|---------|
| `absorb_log` | 空日志读取、写入+读取、分页查询 |
| `backlinks_index` | 无反链、单页反链、多页交叉反链 |
| `validate_frontmatter` | 合法 frontmatter、缺少必填字段、非法日期格式 |
| `wiki_stats` | 空 wiki 统计、正常统计、大量页面性能 |

**wiki_patrol 测试计划:**

| 函数 | 测试用例 |
|------|---------|
| `detect_orphans` | 空 wiki、无孤立页、存在孤立页 |
| `detect_stale` | 全部新鲜、部分过期、全部过期 |
| `detect_schema_violations` | 全部合规、缺少字段、类型错误 |

**wiki_maintainer 测试:**

- `absorb_batch`: 使用 `MockBrokerSender` 模拟 LLM 调用
- 测试场景: 空 inbox、正常批次、LLM 返回错误、部分成功

### 8.2 集成测试

**desktop-server 端点测试:**

- 每个新 API 端点至少 1 个 integration test
- 使用 `axum::test::TestClient` 发送真实 HTTP 请求
- Mock wiki 目录通过 `tempdir` crate 创建临时目录

**测试覆盖:**

| 端点 | 测试内容 |
|------|---------|
| `POST /absorb` | 触发摄入 → 检查 wiki 页面生成 |
| `GET /absorb-log` | 写入日志 → 查询 → 验证分页 |
| `GET /backlinks/{slug}` | 创建多页 → 查询反链 → 验证正确性 |
| `GET /stats` | 创建 wiki 内容 → 查询统计 → 验证数值 |
| `POST /patrol` | 创建问题页面 → 触发巡检 → 验证报告 |
| `POST /query` | 写入 wiki → 查询 → 验证 LLM 回答引用正确来源 |

### 8.3 前端测试

**测试框架:**

- 组件测试: Vitest + `@testing-library/react`
- API Mock: MSW (Mock Service Worker)
- 快照测试: 关键 UI 状态快照

**关键组件测试:**

| 组件 | 测试场景 |
|------|---------|
| `TabBar` | Tab 切换、激活状态、Badge 显示 |
| `WikiFileTree` | 文件树展开/折叠、文件选中、搜索过滤 |
| `ChatPanel` | 消息发送、流式渲染、错误状态 |
| `SkillProgressCard` | 进度更新、完成状态、错误状态 |
| `AbsorbButton` | 点击触发、loading 状态、成功/失败反馈 |
| `PatrolReport` | 报告渲染、问题分类展示、空报告状态 |

**API Mock 策略:**

- 使用 MSW 拦截所有 `/api/wiki/*` 请求
- 为每个测试场景准备固定 fixture 数据
- SSE 事件流通过自定义 mock handler 模拟

### 8.4 E2E 测试

**测试框架:**

- Tauri webdriver（基于 Selenium）
- 运行环境: CI 中使用 headless 模式

**核心流程测试:**

| 流程 | 步骤 |
|------|------|
| 摄入流程 | 输入 URL → 触发 /absorb → 等待完成 → 验证 wiki 页面生成 |
| Wiki 浏览 | 打开 Wiki Tab → 选择页面 → 验证 Markdown 渲染 → 检查反链 |
| 搜索流程 | 输入关键词 → 触发搜索 → 验证结果列表 → 点击跳转 |
| 微信闭环 | mock Kefu callback → 验证 inbox 更新 → 触发 absorb → 验证回复 |

**微信 Mock:**

- 在测试环境中启动 mock HTTP server
- 模拟微信客服消息回调端点
- 验证消息接收、处理、回复全流程

---

## 第九章：实施优先级

### 9.1 Phase 1: SKILL Engine + Wiki Explorer（2 周）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-3 | wiki_store 扩展 | `absorb_log`、`backlinks_index`、`validate_frontmatter` 函数实现 + 单元测试 |
| Day 4-5 | wiki_maintainer `absorb_batch` | 批量摄入逻辑 + MockBrokerSender 测试 |
| Day 6-7 | desktop-server 新端点 | `/absorb`、`/absorb-log`、`/backlinks`、`/stats` 四个端点 + 集成测试 |
| Day 8-10 | 前端 Wiki Tab | 文件树组件 + Markdown 渲染 + 反链面板 |
| Day 11-12 | /absorb 前端集成 | 触发按钮 + SSE 进度条 + 完成通知 |
| Day 13-14 | 测试 + 修 bug + 文档 | 全量测试通过，README 更新 |

### 9.2 Phase 2: Chat Tab + 微信闭环（2 周）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-3 | 前端双 Tab 重构 | Chat \| Wiki 双 Tab 布局，路由适配 |
| Day 4-5 | 右侧 Chat 面板 | Wiki 模式下可用的 Chat 侧面板 |
| Day 6-7 | /query 端点 + 前端集成 | 自然语言查询 wiki，结果带来源引用 |
| Day 8-10 | 微信 Kefu → ingest adapter | 客服消息自动入库 → `/absorb` 自动触发 |
| Day 11-12 | 微信查询（?前缀） | `?前缀` 消息 → `/query` → 回复用户 |
| Day 13-14 | 微信审核通知推送 | 需人工审核的内容推送到微信 |

### 9.3 Phase 3: Schema 巡检 + Dashboard（2 周）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-3 | wiki_patrol crate 实现 | `detect_orphans`、`detect_stale`、`detect_schema_violations` |
| Day 4-5 | /patrol 端点 + 定时调度 | 巡检 API + cron 定时触发 |
| Day 6-7 | Schema 模板系统 | 可配置的 frontmatter 模板，校验规则 |
| Day 8-10 | Dashboard 重构 | 认知复利仪表盘：页面数趋势、反链密度、摄入频率 |
| Day 11-12 | 巡检报告 UI | 问题分类展示、一键修复建议 |
| Day 13-14 | 集成测试 | 全流程集成测试通过 |

### 9.4 Phase 4: 图谱增强 + 消费层（2 周）

| 天数 | 任务 | 产出 |
|------|------|------|
| Day 1-3 | Graph View 增强 | 分组聚类、搜索高亮、缩放平移 |
| Day 4-5 | /cleanup + /breakdown 端点 | 内容清洗 + 长文拆分 API |
| Day 6-7 | 多 Tab 浏览器完善 | Tab 管理优化、Tab 间状态同步 |
| Day 8-10 | Settings Modal 重构 | 所有配置项收敛到统一 Modal |
| Day 11-12 | Web viewer（可选） | ~500 行 Next.js，只读 wiki 浏览 |
| Day 13-14 | 全量 E2E 测试 + 发布准备 | E2E 全部通过，版本号、changelog |

### 9.5 里程碑验收标准

| Phase | 验收标准 |
|-------|---------|
| Phase 1 | 能手动触发 `/absorb`，在 Wiki Tab 看到自动生成的 wiki 页，`_backlinks.json` 正确 |
| Phase 2 | 微信发 URL → 自动入库 + `/absorb` → wiki 页生成 → 微信回复确认 |
| Phase 3 | `/patrol` 每日自动运行，孤立页/过期内容/模板违规检出，Dashboard 展示趋势 |
| Phase 4 | 完整的 Chat\|Wiki 双 Tab 体验，图谱可按分组过滤+搜索，Settings Modal 收敛 |

---

---

## 第十章：认知复利三大闭环

ClawWiki 的核心价值主张不是静态知识库, 而是 "使用越多 → 越强" 的认知复利系统。以下三大闭环机制驱动这一正反馈:

```
┌─────────────────────────────────────────────────────────────┐
│                   认知复利闭环                                │
│                                                             │
│  投喂 ──→ raw/ ──→ /absorb ──→ wiki/ ──→ confidence 自动计算  │
│   ▲                              │                           │
│   │         Crystallization      │    Supersession           │
│   │              ▲               ▼                           │
│   │              │         判断变迁记录                       │
│   │              │               │                           │
│   └── raw/query ◄── /query ◄────┘                           │
│                                                             │
│  问得越多 → Wiki 越强 → 回答越准 → 又产生新知识               │
└─────────────────────────────────────────────────────────────┘
```

### 10.1 Confidence 自动计算

每个 Wiki 页面的 `confidence` 字段不再是被动标注, 而是由 `/absorb` 流程根据来源数量、时效性和冲突状态自动计算。多源交叉验证 + 时效性 = 高置信度; 存在未解决冲突 = 受争议状态。`wiki_patrol` 的 `detect_confidence_decay` 检测器每周扫描, 确保过期页面的置信度自动衰减。

**实现位置**: `technical-design.md §3.3 WikiFrontmatter` (计算规则), `01-skill-engine.md §5.1 absorb_batch 步骤 3g-extra` (计算触发点), `05-schema-system.md` (衰减巡检)。

### 10.2 Supersession 判断变迁

当新信息推翻旧判断时, 系统不会静默覆盖, 而是通过 Inbox 让用户审批, 然后将旧判断记录到 `superseded` 数组中。这保证了认知演变的完整可追溯性: 你可以看到自己的知识体系是如何一步步更新的。

**实现位置**: `technical-design.md §3.3 WikiFrontmatter` (SupersessionRecord 结构体), `01-skill-engine.md §5.1 absorb_batch 步骤 3i-extra` (冲突解决时创建记录), `04-wechat-kefu.md §3.3` (用户通知)。

### 10.3 Crystallization 对话结晶

`/query` 生成的高质量回答自动写入 `raw/` 目录, 下次 `/absorb` 时被吸收进 Wiki。这构成了 "问得越多 → Wiki 越强 → 回答越准 → 又产生新知识" 的正反馈飞轮。query 类型的 raw entry 优先级低于微信文章但高于粘贴文本, 确保结晶内容被吸收但不会压制真实来源素材。

**实现位置**: `technical-design.md §2.2 POST /api/wiki/query` (结晶说明), `01-skill-engine.md §5.2 query_wiki 步骤 6` (结晶写入), `01-skill-engine.md §5.1 source_priority` (优先级), `05-schema-system.md` (未结晶检测)。

---

> **文档边界**: 第六至十章 (Schema 引擎、WeChat Kefu 管线、测试策略、部署方案、迁移指南) 将在第二阶段设计文档中定义。
