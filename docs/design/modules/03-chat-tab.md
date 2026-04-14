# 03 - Chat Tab 模块规格书

> **模块**: Chat Tab (对话模式重构)
> **版本**: v2.0-draft
> **最后更新**: 2026-04-14
> **状态**: 设计完成, 待实现
> **前置依赖**: `technical-design.md` 第一至五章, `01-skill-engine.md`

Chat Tab 是 ClawWiki 的对话主界面, 承载用户与知识库的所有对话交互。它整合会话管理、SSE 流式渲染、SKILL 命令分发, 并提供 Quick Actions 快捷入口 (投喂URL/查询知识/最近摄入/知识统计)。同时, Chat Tab 的核心组件以紧凑模式复用于 Wiki Explorer 右侧的 ChatSidePanel。

**设计哲学**:

- **对话优先**: 中央区域最大化给消息流, 会话列表默认折叠, 不抢视觉焦点
- **知识集成**: Quick Actions 将知识管理操作前置到对话框, 一键投喂/查询/统计
- **双模复用**: 同一套组件以 `mode: "full" | "compact"` 适配 Chat Tab 独立页面和 Wiki Tab 侧面板
- **零丢失**: 所有对话通过 localStorage sessionId 持久化, 刷新页面不丢失上下文

---

## 1. 职责边界

### 1.1 Chat Tab 拥有的职责

| 职责 | 说明 | 代码位置 |
|------|------|----------|
| 会话管理 | 创建/切换/删除/重命名会话 | `SessionSidebar` (现有) + `useAskSession` |
| 消息流渲染 | SSE 流式渲染 AI 回复, 支持 Markdown + 代码高亮 | `MessageList` + `StreamingMessage` (现有) |
| 消息发送 | 用户输入 → appendMessage → SSE 流 | `Composer` (现有) + `useAskSession.onSend` |
| Quick Actions | 快捷操作按钮: 投喂URL、查询知识、最近摄入、知识统计 | `QuickActionsBar` (新建) |
| /query 集成 | 将用户的知识查询路由到 `POST /api/wiki/query` | `useAskSession` + `SkillRouter` |
| 双模输出 | 以 full/compact 两种模式输出, compact 用于 ChatSidePanel | 所有组件 `mode` prop |
| Provider 切换 | 在对话界面切换 LLM provider | `AskHeader` (现有) |

### 1.2 Chat Tab 不拥有的职责

| 职责 | 归属模块 | 说明 |
|------|----------|------|
| 消息持久化/后端 session 引擎 | `desktop-core` | `DesktopState` 管理 session 生命周期, Chat Tab 只调用 HTTP API |
| SKILL 执行 (absorb/cleanup/patrol) | SKILL Engine | Chat Tab 通过 `/absorb` 等斜杠命令触发, 不直接执行 |
| LLM API 调用 | `codex_broker` | 消息发送后由后端 `agentic_loop` 驱动 LLM 调用 |
| Wiki 页面渲染 | Wiki Explorer | Chat 中引用的 wiki 页面以链接形式展示, 不内联渲染 |
| 微信消息接收 | WeChat Kefu | 微信消息通过后端管道处理, Chat Tab 不感知微信通道 |

### 1.3 双模合约

```
full 模式 (Chat Tab 独立页面):
  - SessionSidebar (左) + ConversationArea (中) + 无右侧面板
  - 完整功能: session CRUD, Quick Actions, Provider 切换, 文件附件

compact 模式 (Wiki Tab ChatSidePanel):
  - 无 SessionSidebar, 无 Provider 切换, 无文件附件
  - 共享 full 模式的 session (通过 localStorage sessionId 同步)
  - Composer 高度限制 max-h-24, 消息列表紧凑间距
```

---

## 2. 依赖关系

### 2.1 组件依赖图

```
                   ┌────────────────────────────────┐
                   │        ChatTab (容器)            │
                   │    mode: "full" | "compact"      │
                   └──┬──────────────┬───────────────┘
                      │              │
         ┌────────────┘              └────────────┐
         ▼                                        ▼
  ┌──────────────┐                       ┌──────────────────┐
  │SessionSidebar│ (仅 full 模式)         │ ConversationArea │
  │ (左侧边栏)   │                       │ (中央对话区)      │
  └──────────────┘                       └──┬─────────┬─────┘
                                            │         │
                                   ┌────────┘         └────────┐
                                   ▼                           ▼
                            ┌──────────────┐          ┌──────────────┐
                            │ MessageList  │          │  Composer    │
                            │ (消息流)      │          │ (输入框)     │
                            └──────┬───────┘          └──────────────┘
                                   │
                            ┌──────┘
                            ▼
                     ┌──────────────┐
                     │QuickActionsBar│ (仅 full 模式)
                     └──────────────┘
```

### 2.2 上游依赖 (Chat Tab 读取/调用)

| 依赖 | Crate/模块 | 接口 | 用途 |
|------|------------|------|------|
| Session 引擎 | `desktop-core::agentic_loop` | `append_user_message`, `create_session`, `get_session` | 消息处理和会话管理 |
| 知识问答 | `wiki_maintainer::query_wiki` (通过 SKILL Engine) | `POST /api/wiki/query` | /query 命令的 grounded Q&A |
| SSE 订阅 | `desktop-server` | `GET /api/desktop/sessions/{id}/events` | 流式消息接收 |
| Provider 管理 | `desktop-server` | `GET /api/desktop/providers`, `POST /api/desktop/providers/{id}/activate` | LLM provider 切换 |
| 流式状态 | `streaming-store` (Zustand) | `useStreamingStore` | 管理 SSE token 的增量渲染 |

### 2.3 下游消费者 (读取 Chat Tab 的输出)

| 消费者 | 层 | 接口 | 用途 |
|--------|-----|------|------|
| Wiki Explorer ChatSidePanel | `features/wiki/ChatSidePanel.tsx` | `ChatTab mode="compact"` | 右侧面板复用 Chat 组件 |
| Dashboard | `features/dashboard/*` | localStorage sessionId | 展示最近对话摘要 |

---

## 3. API 接口

### 3.1 调用的已有端点清单

| 端点 | 方法 | 用途 | 返回类型 |
|------|------|------|----------|
| `/api/desktop/sessions` | POST | 创建新会话 | `{ session_id: string }` |
| `/api/desktop/sessions` | GET | 列出所有会话 | `DesktopSessionSummary[]` |
| `/api/desktop/sessions/{id}` | GET | 获取会话详情 (含消息历史) | `DesktopSessionDetail` |
| `/api/desktop/sessions/{id}` | DELETE | 删除会话 | 204 |
| `/api/desktop/sessions/{id}/messages` | POST | 追加用户消息, 触发 LLM 回复 | `DesktopSessionDetail` |
| `/api/desktop/sessions/{id}/events` | GET (SSE) | 订阅会话事件流 | SSE stream |
| `/api/desktop/providers` | GET | 获取 LLM provider 列表 | `{ providers: [], active: string }` |
| `/api/desktop/providers/{id}/activate` | POST | 切换活跃 provider | 200 |

### 3.2 新增集成端点

| 端点 | 方法 | 用途 | 来源 |
|------|------|------|------|
| `/api/wiki/query` | POST | Wiki 知识问答 (SKILL Engine 提供) | `01-skill-engine.md` §3.2 |

Chat Tab 通过 Quick Action "查询知识" 或用户输入 `/query` 前缀触发, 转发到 `POST /api/wiki/query`。响应为 SSE 流: `query_sources` → `query_chunk` (多次) → `query_done`。

### 3.3 数据获取策略

| 数据 | staleTime | refetchInterval | 说明 |
|------|-----------|-----------------|------|
| session list | 10s | 不轮询 | 侧边栏打开时触发, 创建/删除后 invalidate |
| session detail | 0s (always fresh) | 1s (仅 turn 活跃时) | turn 结束后停止轮询, SSE 接管 |
| providers | 30s | 不轮询 | 切换时 invalidate |
| SSE stream | N/A | 实时连接 | EventSource 长连接, 自动重连 |

---

## 4. 数据模型

### 4.1 复用的已有类型

Chat Tab 不引入新数据模型, 完全复用现有类型体系。

| 类型 | 来源 | 说明 |
|------|------|------|
| `DesktopSessionDetail` | `lib/tauri.ts` | 会话详情: id, messages[], turn_state, model_label, environment_label |
| `DesktopSessionSummary` | `lib/tauri.ts` | 会话摘要: id, title, created_at, message_count |
| `Message` | `lib/tauri.ts` | 单条消息: role, content, tool_calls, created_at |
| `StreamingState` | `features/ask/streaming-store.ts` (Zustand) | 流式渲染状态: pendingTokens, isStreaming, sessionId |

### 4.2 Quick Action 定义

```typescript
/**
 * Quick Action 配置项。每个 action 对应一个预填充的 prompt 模板。
 */
interface QuickAction {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /** 图标 (lucide-react 名称) */
  icon: string;
  /** 预填充到 Composer 的 prompt, {placeholder} 会替换为用户输入 */
  promptTemplate: string;
  /** 是否需要用户额外输入 (如 URL) */
  requiresInput: boolean;
  /** 输入提示文本 */
  inputPlaceholder?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "feed-url",
    label: "投喂URL",
    icon: "Link",
    promptTemplate: "请摄入这个URL的内容: {url}",
    requiresInput: true,
    inputPlaceholder: "粘贴 URL...",
  },
  {
    id: "query-wiki",
    label: "查询知识",
    icon: "Search",
    promptTemplate: "/query {question}",
    requiresInput: true,
    inputPlaceholder: "输入问题...",
  },
  {
    id: "recent-ingest",
    label: "最近摄入",
    icon: "Clock",
    promptTemplate: "列出最近 7 天摄入的所有素材和生成的 wiki 页面",
    requiresInput: false,
  },
  {
    id: "wiki-stats",
    label: "知识统计",
    icon: "BarChart3",
    promptTemplate: "统计当前知识库的整体情况: raw 数量、wiki 页面数量、各分类分布、最近活跃页面",
    requiresInput: false,
  },
];
```

---

## 5. Rust 后端变更

Chat Tab 不需要 Rust 后端变更。所有对话基础设施已在 v1.0 中实现完毕。

### 5.1 已有后端能力

| 能力 | 位置 | 说明 |
|------|------|------|
| Session CRUD | `desktop-core::DesktopState` | create_session, get_session, list_sessions, delete_session |
| 消息追加 + LLM 调用 | `desktop-core::agentic_loop` | append_user_message → execute_live_turn → SSE broadcast |
| SSE 广播 | `desktop-server` (axum SSE) | 每个 session 有独立 EventSource endpoint |
| Provider 管理 | `desktop-core::providers_config` | list_providers, activate_provider |
| 权限控制 | `desktop-core::permission_gate` | tool_call 需要用户批准时暂停 turn |

### 5.2 /query 集成

`POST /api/wiki/query` 端点由 SKILL Engine 模块 (`01-skill-engine.md` §3.2) 新增。Chat Tab 仅作为前端消费者, 不需要额外 Rust 改动。

当用户通过 Quick Action 或 `/query` 前缀发送知识查询时, 前端直接 POST 到 `/api/wiki/query` 并消费其 SSE 流, 与普通对话的 SSE 流并行展示。

---

## 6. 前端实现

### 6.1 组件架构

```
ChatTab (容器, mode="full")
├── SessionSidebar (左侧, w-64, 可折叠)
│   ├── SidebarHeader ("对话" + 新建按钮)
│   ├── SessionGroup: "今天"
│   │   └── SessionItem[] (标题 + 时间 + 消息数)
│   ├── SessionGroup: "昨天"
│   │   └── SessionItem[]
│   └── SessionGroup: "更早"
│       └── SessionItem[]
│
└── ConversationArea (flex-1, flex-col)
    ├── AskHeader (顶部, 模型名 + provider 切换)
    ├── QuickActionsBar (消息列表上方, 仅空会话时显示)
    │   ├── ActionButton: "投喂URL" (Link icon)
    │   ├── ActionButton: "查询知识" (Search icon)
    │   ├── ActionButton: "最近摄入" (Clock icon)
    │   └── ActionButton: "知识统计" (BarChart3 icon)
    ├── MessageList (flex-1, overflow-y-auto)
    │   ├── Message (user) — 右对齐, 暖色气泡
    │   ├── Message (assistant) — 左对齐, 透明背景
    │   ├── StreamingMessage — SSE 实时渲染
    │   ├── ToolActionsGroup — 工具调用展示
    │   └── ScrollToBottomButton — 新消息提示
    └── Composer (底部)
        ├── PermissionDropdown (mode 选择)
        ├── Textarea (auto-grow, 历史翻阅)
        ├── FileAttachment (拖拽上传)
        └── SendButton (圆形暖色)

---

ChatSidePanel (compact 模式, 嵌入 Wiki Tab 右侧)
├── PanelHeader ("Ask" + 折叠按钮)
├── CompactMessageList (缩小间距, 无 ToolActionsGroup)
└── CompactComposer (无文件附件, 无 Permission, max-h-24)
```

### 6.2 核心组件规格

#### SessionSidebar (重构)

现有 `features/ask/SessionSidebar.tsx` 已实现核心逻辑。v2.0 增强:

- **按日期分组**: today / yesterday / older, 使用 `date-fns` 或手动计算
- **重命名**: 双击标题进入编辑模式 (contentEditable), blur 时保存
- **删除确认**: 点击删除图标 → 短暂变红 + "确定?" 文字, 再次点击真正删除
- **未读标记**: session 有新 AI 回复但用户未查看时, 标题左侧蓝色圆点

```typescript
interface SessionSidebarProps {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}
```

#### QuickActionsBar

```typescript
interface QuickActionsBarProps {
  /** 点击 action 后触发 */
  onAction: (action: QuickAction, userInput?: string) => void;
  /** 是否可见 (仅空会话时显示) */
  visible: boolean;
}
```

- 布局: 2x2 网格 (或 1x4 横排), 居中于 ConversationArea
- 每个按钮: 图标 + 标签, 48x48 圆角卡片, hover 放大效果
- 需要输入的 action (投喂URL, 查询知识): 点击后展开内联输入框
- 不需要输入的 action (最近摄入, 知识统计): 点击直接发送 promptTemplate

#### ConversationArea

```typescript
interface ConversationAreaProps {
  session: DesktopSessionDetail | null;
  isLoadingSession: boolean;
  isSending: boolean;
  errorMessage: string | null;
  onSend: (message: string) => void;
  onCreateSession: () => void;
  modelLabel?: string;
  environmentLabel?: string;
  mode: "full" | "compact";
}
```

- full 模式: 完整布局, 包含 AskHeader + QuickActionsBar + MessageList + Composer
- compact 模式: 去掉 AskHeader 和 QuickActionsBar, MessageList 紧凑间距, Composer 简化

### 6.3 消息流渲染

#### 已有组件复用

| 组件 | 路径 | 职责 |
|------|------|------|
| `Message.tsx` | `features/ask/Message.tsx` | 单条消息气泡 (user/assistant 样式分化) |
| `StreamingMessage.tsx` | `features/ask/StreamingMessage.tsx` | SSE 流式 token 实时渲染 |
| `MessageList.tsx` | `features/ask/MessageList.tsx` | 消息列表容器, 自动滚动到底部 |
| `ToolActionsGroup.tsx` | `features/ask/ToolActionsGroup.tsx` | 工具调用折叠展示 |
| `ScrollToBottomButton.tsx` | `features/ask/ScrollToBottomButton.tsx` | 新消息到达时的跳转按钮 |
| `ConversationScroller.tsx` | `features/ask/ConversationScroller.tsx` | 智能滚动控制 |
| `Shimmer.tsx` | `features/ask/Shimmer.tsx` | 加载骨架屏 |

#### /query 结果特殊渲染

当 `/query` 命令返回结果时, 消息中包含 `query_sources` 引用:

- 在 AI 回答顶部展示 "引用来源" 卡片: 每个 source 显示标题 + relevance_score 进度条 + snippet 摘要
- 卡片可点击, 跳转到 Wiki Explorer 打开对应 wiki 页面 (通过 `useWikiExplorerStore.openTab`)
- 回答正文中的 `[source_ref]` 标记渲染为上标数字链接

### 6.4 SSE 流式渲染管道

```
EventSource 连接 /api/desktop/sessions/{id}/events
  → useAskSSE 订阅事件
  → 事件类型分发:
      "message_delta" → streaming-store 追加 token → StreamingMessage 渲染
      "message_complete" → 清除 streaming-store, 追加完整 Message
      "turn_complete" → 停止轮询, 更新 session detail
      "permission_request" → 弹出权限确认对话框
      "query_sources" → 渲染来源卡片
      "query_chunk" → 流式追加查询回答
      "query_done" → 标记查询完成
```

---

## 7. 交互流程

### 7.1 新建会话并发送消息

```
用户点击 SessionSidebar "+" 按钮
  → onNewSession() 调用
  → POST /api/desktop/sessions 创建新会话
  → localStorage 保存 activeSessionId
  → ConversationArea 切换到空会话, 显示 QuickActionsBar
  → 用户在 Composer 输入文本, 按 Enter / 点击发送
  → onSend(text) → POST /api/desktop/sessions/{id}/messages
  → useAskSSE 开始接收 SSE 事件
  → StreamingMessage 逐字渲染 AI 回复
  → turn_complete 后, StreamingMessage 替换为完整 Message
```

### 7.2 Quick Action: 查询知识

```
用户点击 QuickActionsBar "查询知识" 按钮
  → 展开内联输入框, placeholder "输入问题..."
  → 用户输入 "Transformer 和 RNN 的区别", 按 Enter
  → onAction({ id: "query-wiki", promptTemplate: "/query {question}" }, "Transformer 和 RNN 的区别")
  → Composer 填入 "/query Transformer 和 RNN 的区别" 并自动发送
  → 后端 SkillRouter 识别 /query 前缀, 路由到 wiki_maintainer::query_wiki
  → SSE 返回 query_sources → 来源卡片渲染
  → SSE 返回 query_chunk (多次) → 流式追加回答文本
  → SSE 返回 query_done → 标记完成
```

### 7.3 Quick Action: 投喂URL

```
用户点击 QuickActionsBar "投喂URL" 按钮
  → 展开内联输入框, placeholder "粘贴 URL..."
  → 用户粘贴 URL, 按 Enter
  → onAction({ id: "feed-url", promptTemplate: "请摄入这个URL的内容: {url}" }, url)
  → Composer 填入 "请摄入这个URL的内容: https://..." 并自动发送
  → 后端 agentic_loop 处理: 调用 wiki_ingest::url::fetch_and_body → wiki_store::write_raw_entry
  → AI 回复确认: "已成功摄入, raw #42, 标题: xxx, 3200 字"
```

### 7.4 切换会话

```
用户点击 SessionSidebar 中另一个 session
  → onSelectSession(newId)
  → localStorage 更新 activeSessionId
  → useQuery invalidate 当前 session detail
  → ConversationArea 切换到新会话的消息历史
  → 如果新会话有活跃 turn, useAskSSE 重新订阅
```

### 7.5 ChatSidePanel (compact 模式) 同步

```
Wiki Tab 的 ChatSidePanel 挂载
  → 读取 localStorage activeSessionId (与 Chat Tab 同一个)
  → useAskSession(mode="compact") 获取同一会话
  → 用户在 SidePanel 输入消息
  → onSend → 追加到同一 session → Chat Tab 同步可见 (通过 React Query invalidate)
```

---

## 8. 测试计划

### 8.1 单元测试

| 测试用例 | 预期 | 覆盖组件 |
|----------|------|----------|
| `useAskSession` 创建新会话 | POST 成功后 sessionId 更新, localStorage 写入 | Hook |
| `useAskSession` 恢复会话 | localStorage 有 sessionId 时, 直接 GET 加载 | Hook |
| `useAskSession.onSend` 发送消息 | POST messages 成功, isSending 状态正确切换 | Hook |
| QuickAction "查询知识" 生成正确 prompt | 用户输入 "xxx", 输出 "/query xxx" | QuickActionsBar |
| QuickAction "投喂URL" 生成正确 prompt | 用户输入 URL, 输出预填充 prompt | QuickActionsBar |
| QuickAction 无需输入直接发送 | "最近摄入" 点击后立即调用 onAction | QuickActionsBar |
| SessionSidebar 按日期分组 | 3 个不同日期的 session, 分到 3 个组 | SessionSidebar |

### 8.2 集成测试

| 测试用例 | 预期 | 覆盖范围 |
|----------|------|----------|
| 完整对话流: 发送 → 流式渲染 → 完成 | 消息发送成功, SSE token 逐字渲染, 最终消息完整 | Session + SSE + MessageList |
| 会话切换保持独立 | 切换后消息历史正确加载, 不混淆 | SessionSidebar + useAskSession |
| Quick Action → 知识查询 → 来源卡片 | 点击 "查询知识" → 发送 /query → 渲染 query_sources 卡片 | QuickActionsBar + MessageList |
| compact 模式 session 同步 | ChatSidePanel 和 ChatTab 使用同一 session, 消息双向可见 | ChatSidePanel + ChatTab |
| Provider 切换后新消息使用新模型 | 切换 provider → 发送消息 → 回复的 model_label 是新 provider | AskHeader + useAskSession |

### 8.3 SSE 可靠性测试

| 测试用例 | 预期 |
|----------|------|
| SSE 连接断开后自动重连 | useAskSSE 检测到 EventSource error, 2s 后重建连接 |
| SSE 重连后消息不丢失 | 重连后 GET session detail 补全缺失消息 |
| 并发 session 切换不混乱 | 快速切换 3 个 session, 每个的消息流独立 |
| turn 超时处理 | turn 超过 120s 未完成, 显示超时提示 |

---

## 9. 边界条件与风险

### 9.1 边界条件

| 场景 | 处理策略 |
|------|----------|
| 并发 session (多标签页) | 通过 localStorage + BroadcastChannel 同步 activeSessionId |
| 超长对话 (200+ 消息) | MessageList 使用 `react-window` 虚拟列表, 仅渲染可视区域 |
| SSE 重连失败 (网络断开) | 显示 "连接断开" banner, 手动重试按钮, 指数退避 (2s/4s/8s/16s max) |
| 空会话 (零消息) | 居中显示 QuickActionsBar 引导用户操作 |
| /query 在 wiki 为空时 | 后端返回 404 WIKI_EMPTY, 前端显示 "知识库为空, 请先投喂素材" |
| 超长用户输入 (> 10000 字) | Composer textarea max-length 10000, 超出时禁用发送按钮 |
| Provider 不可用 | 发送失败, 显示 "LLM 服务暂不可用" 错误, 提示检查 LLM Gateway 设置 |
| 中文输入法 composing 时按 Enter | 检测 `isComposing` 状态, composing 中 Enter 不触发发送 |

### 9.2 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| compact 模式与 full 模式 session 竞争写入 | 中 | 两个模式共享 sessionId, 但 onSend 有 mutex (isSending flag) |
| SSE 内存泄漏 (EventSource 未正确关闭) | 中 | useAskSSE 在 useEffect cleanup 中显式 close EventSource |
| Quick Action prompt 注入 | 低 | promptTemplate 中的 `{placeholder}` 使用字面替换, 不经过 eval |
| 流式渲染闪烁 | 低 | StreamingMessage 使用 requestAnimationFrame 批量更新, 16ms 节流 |

---

## 10. 复用清单

### 10.1 直接复用 (import as-is)

| 资源 | 路径 | 用法 |
|------|------|------|
| AskPage 主页面 | `features/ask/AskPage.tsx` | v2.0 重构为 ChatTab, 保留核心逻辑 |
| AskWorkbench | `features/ask/AskWorkbench.tsx` | 重构为 ConversationArea, 新增 mode prop |
| Composer | `features/ask/Composer.tsx` | 完整复用, compact 模式隐藏文件附件 |
| Message | `features/ask/Message.tsx` | 完整复用, user/assistant 气泡 |
| MessageList | `features/ask/MessageList.tsx` | 完整复用 |
| StreamingMessage | `features/ask/StreamingMessage.tsx` | 完整复用, SSE token 渲染 |
| ToolActionsGroup | `features/ask/ToolActionsGroup.tsx` | 完整复用 (compact 模式隐藏) |
| ScrollToBottomButton | `features/ask/ScrollToBottomButton.tsx` | 完整复用 |
| ConversationScroller | `features/ask/ConversationScroller.tsx` | 完整复用 |
| Shimmer | `features/ask/Shimmer.tsx` | 完整复用 |
| SessionSidebar | `features/ask/SessionSidebar.tsx` | 重构增强: 日期分组、重命名、删除确认 |
| AskHeader | `features/ask/AskHeader.tsx` | 完整复用, Provider 切换 |
| SlashCommandPalette | `features/ask/SlashCommandPalette.tsx` | 完整复用 (未来 SKILL 命令入口) |
| useAskSession | `features/ask/useAskSession.ts` | 完整复用, 核心 session 管理 hook |
| useAskSSE | `features/ask/useAskSSE.ts` | 完整复用, SSE 订阅 hook |
| streaming-store | `features/ask/streaming-store.ts` (推测) | 完整复用, 流式状态 Zustand store |
| tool-meta | `features/ask/tool-meta.ts` | 完整复用, 工具调用元数据 |
| mockDemoMessages | `features/ask/mockDemoMessages.ts` | 开发阶段 mock 数据 |
| 图标库 | `lucide-react` | Link, Search, Clock, BarChart3, Plus, MessageSquare, Trash2, Edit3 |

### 10.2 重构迁移

| 来源 | 提取内容 | 目标 |
|------|----------|------|
| `AskPage.tsx` | 重构为 `ChatTab.tsx`, 新增 `mode` prop 和 `compact` 分支 | `features/chat/ChatTab.tsx` |
| `AskWorkbench.tsx` | 重构为 `ConversationArea.tsx`, 新增 QuickActionsBar 插槽 | `features/chat/ConversationArea.tsx` |
| `SessionSidebar.tsx` | 增强日期分组、重命名、删除确认 | `features/chat/SessionSidebar.tsx` |

### 10.3 新建文件清单

| 文件 | 说明 |
|------|------|
| `features/chat/ChatTab.tsx` | 容器组件, 替代 AskPage, 支持 full/compact 双模 |
| `features/chat/ConversationArea.tsx` | 对话区域 (从 AskWorkbench 重构) |
| `features/chat/QuickActionsBar.tsx` | 快捷操作栏 |
| `features/chat/QuerySourcesCard.tsx` | /query 结果来源卡片 |
