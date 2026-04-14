# 02 - Wiki Explorer 模块规格书

> **模块**: Wiki Explorer (Wiki Tab 文件树 + Markdown 渲染 + 反链)
> **版本**: v2.0-draft
> **最后更新**: 2026-04-14
> **状态**: 设计完成, 待实现
> **前置依赖**: `technical-design.md` 第一至五章, `01-skill-engine.md`

Wiki Explorer 是 ClawWiki 的知识浏览主界面。它提供三层文件树导航 (Raw/Wiki/Schema)、浏览器风格多标签页、Markdown 渲染、反向链接展示, 以及右侧常驻 Chat 面板。整体交互参考 Rowboat Knowledge Tab 的三栏布局模式。

**设计哲学**:

- **浏览器隐喻**: 标签页 = 打开的知识页面, 文件树 = 书签/目录, 像浏览网页一样浏览知识库
- **上下文不切换**: 右侧常驻 Chat 面板, 阅读时随时可以提问, 不需要跳转 Tab
- **渐进披露**: 文件树默认折叠到分类层级, 不一上来就展示几百个文件
- **零写入**: Wiki Explorer 是纯读取界面, 所有写入操作由 SKILL Engine 或 Inbox 驱动

---

## 1. 职责边界

### 1.1 Wiki Explorer 拥有的职责

| 职责 | 说明 | 代码位置 |
|------|------|----------|
| 文件树导航 | 三层文件树: Raw素材 / Wiki知识 / Schema, 可折叠展开 | `WikiFileTree` (新建) |
| 多标签页浏览 | 浏览器风格标签栏, 支持打开/关闭/切换多个 wiki 页面 | `WikiTabBar` (新建) |
| Markdown 渲染 | 将 wiki page body 渲染为富文本, 支持 wikilink、代码高亮 | `WikiContent` (新建, 基于 ReactMarkdown) |
| 反向链接展示 | 在页面底部展示引用当前页的所有 wiki 页面列表 | `WikiContent` 内 BacklinksSection |
| 全文搜索 | 过滤文件树 + 搜索 wiki 页面内容 | 复用现有 `searchWikiPages` |
| Graph View 标签 | 在标签栏中嵌入 Graph View 作为特殊标签页 | `WikiTabBar` → `GraphPage` |
| 右侧 Chat 面板 | 常驻紧凑型 Ask 面板, 复用 Chat Tab 组件 | `ChatSidePanel` (新建, 复用 features/ask) |

### 1.2 Wiki Explorer 不拥有的职责

| 职责 | 归属模块 | 说明 |
|------|----------|------|
| 数据写入 (raw/wiki/schema) | SKILL Engine / wiki_store | Explorer 只读, 永远不直接写入磁盘 |
| 图谱可视化算法 | Graph View (features/graph) | Explorer 仅在标签页中嵌入 GraphPage |
| 对话引擎 / 消息处理 | Chat Tab / desktop-core | ChatSidePanel 复用 Chat Tab 组件, 不自建消息逻辑 |
| 吸收/清理/巡检 | SKILL Engine | 工具栏按钮只触发 SKILL 命令, 不执行业务逻辑 |
| Inbox 审批流程 | Inbox Module | Explorer 可链接到 Inbox, 不嵌入审批 UI |

### 1.3 层级合约 (不可违反)

```
raw/     Explorer 只读展示, 从 GET /api/wiki/raw 获取列表和详情
wiki/    Explorer 只读展示, 从 GET /api/wiki/pages 获取列表和详情
schema/  Explorer 只读展示, 从 GET /api/wiki/schema 获取 CLAUDE.md 内容
```

---

## 2. 依赖关系

### 2.1 组件依赖图

```
                   ┌────────────────────────────────────────────┐
                   │              WikiTab (容器)                 │
                   └──┬──────────┬──────────────┬───────────────┘
                      │          │              │
         ┌────────────┘    ┌─────┘              └──────────┐
         ▼                 ▼                               ▼
  ┌──────────────┐  ┌──────────────┐              ┌──────────────┐
  │ WikiFileTree │  │ WikiTabBar   │              │ChatSidePanel │
  │ (左侧边栏)   │  │ (顶部标签栏)  │              │ (右侧面板)    │
  └──────┬───────┘  └──────┬───────┘              └──────┬───────┘
         │                 │                             │
         │          ┌──────┘                             │
         │          ▼                                    │
         │   ┌──────────────┐                            │
         │   │ WikiContent  │                            │
         │   │ (中央渲染区)  │                            │
         │   └──────────────┘                            │
         │                                               │
         ▼                                               ▼
  ┌──────────────┐                              ┌──────────────┐
  │ wiki_store   │  (HTTP 读取)                 │ features/ask │
  │ desktop-server│                              │ (Chat 组件)  │
  └──────────────┘                              └──────────────┘
```

### 2.2 上游依赖 (Wiki Explorer 读取/调用)

| 依赖 | 来源 | 接口 | 用途 |
|------|------|------|------|
| Wiki 页面列表 | `desktop-server` | `GET /api/wiki/pages` | 填充文件树 Wiki 分支 |
| Wiki 页面详情 | `desktop-server` | `GET /api/wiki/pages/{slug}` | 渲染页面 Markdown |
| 反向链接 | `desktop-server` | `GET /api/wiki/pages/{slug}/backlinks` | 页面底部反链展示 |
| 全文搜索 | `desktop-server` | `GET /api/wiki/search?q=&limit=` | 搜索过滤 |
| Wiki 索引 | `desktop-server` | `GET /api/wiki/index` | 渲染 index.md 特殊页 |
| Wiki 日志 | `desktop-server` | `GET /api/wiki/log` | 渲染 log.md 特殊页 |
| Raw 条目列表 | `desktop-server` | `GET /api/wiki/raw` | 填充文件树 Raw 分支 |
| Schema 内容 | `desktop-server` | `GET /api/wiki/schema` | 填充文件树 Schema 分支 |
| Graph 数据 | `desktop-server` | `GET /api/wiki/graph` | Graph View 标签页 |
| Inbox 计数 | `desktop-server` | `GET /api/wiki/inbox` | Inbox badge 角标数字 |

### 2.3 下游消费者 (读取 Wiki Explorer 的输出)

| 消费者 | 层 | 接口 | 用途 |
|--------|-----|------|------|
| Graph View | `features/graph/GraphPage.tsx` | 点击节点 → `onOpenTab(slug)` 回调 | 从图谱跳转打开 wiki 页面 |
| Chat Tab | `features/ask/*` | ChatSidePanel 共享 session | 阅读时直接发起 `/query` 提问 |
| Inbox | `features/inbox/*` | 点击 "查看来源" 链接 | 从 Explorer 跳转到 Inbox 条目 |

---

## 3. API 接口

Wiki Explorer 为纯前端模块, 不新增后端 API 端点。所有数据通过已有端点获取。

### 3.1 调用的已有端点清单

| 端点 | 方法 | 用途 | 返回类型 |
|------|------|------|----------|
| `/api/wiki/pages` | GET | 获取所有 wiki 页面摘要, 构建文件树 | `WikiPagesListResponse` |
| `/api/wiki/pages/{slug}` | GET | 获取单个页面详情 (含 body), 渲染 Markdown | `WikiPageDetailResponse` |
| `/api/wiki/pages/{slug}/backlinks` | GET | 获取指向该页面的所有反向链接 | `WikiPageSummary[]` |
| `/api/wiki/search?q=&limit=` | GET | 全文搜索, 支持 slug/title/body 匹配 | `WikiSearchResponse` |
| `/api/wiki/index` | GET | 获取 wiki/index.md 特殊文件 | `WikiSpecialFileResponse` |
| `/api/wiki/log` | GET | 获取 wiki/log.md 变更日志 | `WikiSpecialFileResponse` |
| `/api/wiki/raw` | GET | 获取所有 raw 条目列表 | `RawListResponse` |
| `/api/wiki/raw/{id}` | GET | 获取单个 raw 条目详情 | `RawDetailResponse` |
| `/api/wiki/schema` | GET | 获取 schema/CLAUDE.md 内容 | `SchemaResponse` |
| `/api/wiki/graph` | GET | 获取图谱节点和边数据 | `WikiGraphResponse` |
| `/api/wiki/inbox` | GET | 获取 inbox 列表 (用于 badge 计数) | `InboxListResponse` |

### 3.2 数据获取策略

| 数据 | staleTime | refetchInterval | 说明 |
|------|-----------|-----------------|------|
| pages list | 10s | 30s | 文件树基础数据, 与现有一致 |
| page detail | 30s | 不轮询 | 打开标签时获取, 关闭时清理缓存 |
| backlinks | 60s | 不轮询 | 变化频率低, 长缓存 |
| search | 5s | 不轮询 | 用户输入触发, debounce 250ms |
| raw list | 10s | 60s | 文件树 Raw 分支, 轮询频率低于 pages |
| inbox count | 30s | 60s | 仅用于 badge 数字 |

---

## 4. 数据模型

### 4.1 前端新增类型

```typescript
/**
 * 文件树节点。将 flat 的 WikiPageSummary[] + RawEntry[] 转换为
 * 树形结构, 按照 Raw/Wiki/Schema 三层组织。
 */
interface WikiFileTreeNode {
  /** 节点类型 */
  type: "folder" | "file";
  /** 显示名称 (中文标题或 slug) */
  name: string;
  /** 唯一路径标识, 如 "wiki/concepts/transformer" */
  path: string;
  /** 子节点 (仅 folder 类型) */
  children?: WikiFileTreeNode[];
  /** 关联的 wiki 页面摘要 (仅 file 类型, wiki 分支) */
  page?: WikiPageSummary;
  /** 关联的 raw 条目 (仅 file 类型, raw 分支) */
  rawEntry?: RawEntry;
  /** 角标数字 (如 Inbox pending count) */
  badge?: number;
  /** 节点图标标识 */
  icon?: "inbox" | "folder" | "file" | "schema" | "index" | "log";
}

/**
 * 标签页状态。标签栏中每个打开的页面/视图。
 */
interface WikiTab {
  /** 唯一标识 */
  id: string;
  /** 标签类型 */
  kind: "wiki-page" | "raw-entry" | "index" | "log" | "schema" | "graph";
  /** 显示标题 */
  title: string;
  /** wiki page slug (kind=wiki-page 时) */
  slug?: string;
  /** raw entry id (kind=raw-entry 时) */
  rawId?: number;
  /** 是否固定 (pinned tab 不可关闭) */
  pinned?: boolean;
}

/**
 * Wiki Explorer 全局状态 (Zustand store)
 */
interface WikiExplorerStore {
  /** 打开的标签页列表 */
  tabs: WikiTab[];
  /** 当前活跃标签页 ID */
  activeTabId: string | null;
  /** 文件树展开状态 (path -> expanded) */
  expandedPaths: Set<string>;
  /** 文件树搜索过滤词 */
  treeFilter: string;
  /** Chat 面板折叠状态 */
  chatPanelCollapsed: boolean;

  /** 打开一个标签页 (已存在则切换, 不存在则创建) */
  openTab: (tab: Omit<WikiTab, "id">) => void;
  /** 关闭标签页 */
  closeTab: (tabId: string) => void;
  /** 切换活跃标签 */
  setActiveTab: (tabId: string) => void;
  /** 切换文件树节点展开/折叠 */
  toggleExpanded: (path: string) => void;
  /** 设置树过滤词 */
  setTreeFilter: (filter: string) => void;
  /** 切换 Chat 面板 */
  toggleChatPanel: () => void;
}
```

### 4.2 复用的已有类型

| 类型 | 来源 | 说明 |
|------|------|------|
| `WikiPageSummary` | `features/ingest/types.ts` | slug, title, summary, source_raw_id, created_at, byte_size |
| `WikiPageDetailResponse` | `features/ingest/types.ts` | summary + body (markdown 全文) |
| `WikiSearchHit` | `features/ingest/types.ts` | page + score + snippet |
| `WikiSearchResponse` | `features/ingest/types.ts` | query, hits[], total_matches, limit |
| `WikiSpecialFileResponse` | `features/ingest/types.ts` | path, content, byte_size, exists |
| `RawEntry` | `features/ingest/types.ts` | id, filename, source, slug, date, source_url, ingested_at, byte_size |
| `WikiGraphNode` / `WikiGraphEdge` | `features/ingest/types.ts` | 图谱节点和边 |
| `InboxListResponse` | `features/ingest/types.ts` | entries[], pending_count, total_count |

---

## 5. Rust 后端变更

Wiki Explorer 为纯前端模块, 不需要 Rust 后端变更。

所有需要的数据端点已在 `desktop-server/src/lib.rs` 中注册:

| 路由 | Handler | 行号 (约) |
|------|---------|-----------|
| `GET /api/wiki/pages` | `list_wiki_pages_handler` | 529 |
| `GET /api/wiki/pages/{slug}` | `get_wiki_page_handler` | 530 |
| `GET /api/wiki/pages/{slug}/backlinks` | `get_wiki_backlinks_handler` | 560 |
| `GET /api/wiki/search` | `search_wiki_pages_handler` | 536 |
| `GET /api/wiki/index` | `get_wiki_index_handler` | 542 |
| `GET /api/wiki/log` | `get_wiki_log_handler` | 543 |
| `GET /api/wiki/raw` | `list_wiki_raw_handler` | 483 |
| `GET /api/wiki/raw/{id}` | `get_wiki_raw_handler` | 486 |
| `GET /api/wiki/schema` | `get_wiki_schema_handler` | 551 |
| `GET /api/wiki/graph` | `get_wiki_graph_handler` | 558 |

**未来可选**: 若搜索性能不足, 可在 `wiki_store` 中新增 `search_raw_entries` 函数支持 raw 层搜索。当前 MVP 仅搜索 wiki 层。

---

## 6. 前端实现

### 6.1 组件架构

```
WikiTab (容器, flex 三栏布局)
├── WikiFileTree (左侧边栏, w-64, 可折叠至 w-0)
│   ├── TreeHeader (搜索框 + 折叠按钮)
│   ├── TreeSection: "Inbox" (badge: pending_count)
│   │   └── → 点击跳转 Inbox 页面
│   ├── TreeSection: "Raw 素材"
│   │   └── TreeNode[] (按日期分组的 RawEntry)
│   ├── TreeSection: "Wiki 知识"
│   │   ├── TreeFolder: "concepts" (概念)
│   │   ├── TreeFolder: "people" (人物)
│   │   ├── TreeFolder: "topics" (主题)
│   │   └── TreeFolder: "compare" (对比)
│   ├── TreeSection: "Schema"
│   │   └── TreeNode: "CLAUDE.md"
│   └── TreeSection: "特殊文件"
│       ├── TreeNode: "index.md"
│       └── TreeNode: "log.md"
│
├── CenterArea (flex-1, flex-col)
│   ├── WikiTabBar (顶部标签栏, h-9)
│   │   ├── TabItem[] (打开的页面标签, 可关闭)
│   │   ├── TabItem: "Graph View" (特殊标签)
│   │   └── NewTabButton (+)
│   └── WikiContent (flex-1, overflow-y-auto)
│       ├── PageHeader (标题 + 元信息 + 阅读时间)
│       ├── MarkdownBody (ReactMarkdown 渲染)
│       └── BacklinksSection (反向链接列表)
│
└── ChatSidePanel (右侧面板, w-80, 可折叠至 w-0)
    ├── PanelHeader ("Ask" + 折叠按钮)
    ├── CompactMessageList (简化消息列表)
    └── CompactComposer (简化输入框)
```

### 6.2 核心组件规格

#### WikiFileTree

```typescript
interface WikiFileTreeProps {
  /** 文件树节点数据 (由 useWikiFileTree hook 构建) */
  nodes: WikiFileTreeNode[];
  /** 展开状态 */
  expandedPaths: Set<string>;
  /** 搜索过滤词 */
  filter: string;
  /** 点击节点回调 */
  onSelect: (node: WikiFileTreeNode) => void;
  /** 展开/折叠回调 */
  onToggle: (path: string) => void;
  /** 过滤词变更回调 */
  onFilterChange: (filter: string) => void;
}
```

- 宽度: `w-64` (256px), 与 `SessionSidebar` 保持一致
- 搜索框: 顶部常驻, 带 `Search` 图标, debounce 200ms
- 分区图标: Inbox → `Inbox`, Raw → `FileText`, Wiki → `BookOpen`, Schema → `ScrollText`
- 角标: Inbox 分区显示 `pending_count`, 红色圆角
- CJK 标题: 优先显示 `WikiPageSummary.title`, 回退到 slug

#### WikiTabBar

```typescript
interface WikiTabBarProps {
  tabs: WikiTab[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}
```

- 高度: `h-9` (36px)
- 样式: 浏览器标签页风格, 活跃标签高亮 + 底部 2px 边框
- 关闭按钮: hover 时显示 `X` 图标, 16px
- Graph View: 固定在最右侧, 不可关闭, 图标 `ListTree`
- 溢出: 标签过多时水平滚动, 不换行

#### WikiContent

```typescript
interface WikiContentProps {
  tab: WikiTab;
}
```

- ReactMarkdown 渲染, 继承现有 `WikiExplorerPage` 中的渲染逻辑
- Wikilink 解析: `[[slug]]` 和 `[[slug|display text]]` → 可点击链接, 点击后 `openTab`
- Frontmatter 展示: 顶部卡片显示 slug、创建时间、来源 raw ID、字节数
- 阅读时间: 按中文 400 字/分钟计算, 英文 200 词/分钟
- 反向链接: 页面底部 `BacklinksSection`, 调用 `GET /api/wiki/pages/{slug}/backlinks`
- 代码块: 支持语法高亮 (复用 react-markdown + rehype-highlight)

#### ChatSidePanel

```typescript
interface ChatSidePanelProps {
  /** 是否折叠 */
  collapsed: boolean;
  /** 折叠切换回调 */
  onToggle: () => void;
}
```

- 宽度: `w-80` (320px), 折叠后 `w-0`
- 复用 `features/ask/Composer.tsx` (简化版, 去掉文件附件)
- 复用 `features/ask/MessageList.tsx` (简化版, 缩小间距)
- 共享 Ask session: 使用 `useAskSession` 钩子, 与 Chat Tab 共用同一会话
- Quick Action: 输入框上方一行快捷按钮: "查询知识" → 自动插入 `/query ` 前缀

### 6.3 Zustand Store

```typescript
// stores/wiki-explorer-store.ts
import { create } from "zustand";

export const useWikiExplorerStore = create<WikiExplorerStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  expandedPaths: new Set(["wiki"]),  // 默认展开 Wiki 分支
  treeFilter: "",
  chatPanelCollapsed: false,

  openTab: (tabDef) => {
    const id = tabDef.slug ?? tabDef.rawId?.toString() ?? tabDef.kind;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: id });
    } else {
      set((s) => ({
        tabs: [...s.tabs, { ...tabDef, id }],
        activeTabId: id,
      }));
    }
  },
  closeTab: (tabId) => set((s) => {
    const filtered = s.tabs.filter((t) => t.id !== tabId);
    const newActive = s.activeTabId === tabId
      ? (filtered[filtered.length - 1]?.id ?? null)
      : s.activeTabId;
    return { tabs: filtered, activeTabId: newActive };
  }),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  toggleExpanded: (path) => set((s) => {
    const next = new Set(s.expandedPaths);
    next.has(path) ? next.delete(path) : next.add(path);
    return { expandedPaths: next };
  }),
  setTreeFilter: (filter) => set({ treeFilter: filter }),
  toggleChatPanel: () => set((s) => ({ chatPanelCollapsed: !s.chatPanelCollapsed })),
}));
```

### 6.4 文件树构建 Hook

```typescript
// hooks/useWikiFileTree.ts

function useWikiFileTree(
  pages: WikiPageSummary[],
  rawEntries: RawEntry[],
  inboxPendingCount: number,
): WikiFileTreeNode[] {
  return useMemo(() => {
    // 1. Inbox 节点
    const inbox: WikiFileTreeNode = {
      type: "folder", name: "Inbox", path: "inbox",
      badge: inboxPendingCount, icon: "inbox", children: [],
    };

    // 2. Raw 分支: 按月份分组
    const rawByMonth = groupBy(rawEntries, (e) => e.date.slice(0, 7));
    const rawNode: WikiFileTreeNode = {
      type: "folder", name: "Raw 素材", path: "raw",
      icon: "folder",
      children: Object.entries(rawByMonth).map(([month, entries]) => ({
        type: "folder" as const, name: month, path: `raw/${month}`,
        children: entries.map((e) => ({
          type: "file" as const, name: e.slug, path: `raw/${e.id}`,
          rawEntry: e, icon: "file" as const,
        })),
      })),
    };

    // 3. Wiki 分支: 按 category 分组
    const categories = ["concepts", "people", "topics", "compare"];
    const wikiNode: WikiFileTreeNode = {
      type: "folder", name: "Wiki 知识", path: "wiki",
      icon: "folder",
      children: categories.map((cat) => ({
        type: "folder" as const, name: cat, path: `wiki/${cat}`,
        children: pages
          .filter((p) => (p as any).category === cat || (cat === "concepts" && !(p as any).category))
          .map((p) => ({
            type: "file" as const, name: p.title || p.slug, path: `wiki/${cat}/${p.slug}`,
            page: p, icon: "file" as const,
          })),
      })),
    };

    // 4. Schema 节点
    const schemaNode: WikiFileTreeNode = {
      type: "folder", name: "Schema", path: "schema",
      icon: "schema",
      children: [{
        type: "file", name: "CLAUDE.md", path: "schema/CLAUDE.md",
        icon: "schema",
      }],
    };

    // 5. 特殊文件
    const specialNode: WikiFileTreeNode = {
      type: "folder", name: "特殊文件", path: "special",
      children: [
        { type: "file", name: "index.md", path: "special/index", icon: "index" },
        { type: "file", name: "log.md", path: "special/log", icon: "log" },
      ],
    };

    return [inbox, rawNode, wikiNode, schemaNode, specialNode];
  }, [pages, rawEntries, inboxPendingCount]);
}
```

### 6.5 工具栏

Wiki Tab 顶部左侧, 与 WikiTabBar 同行:

| 图标 | 操作 | 说明 |
|------|------|------|
| `FilePlus` | 新建 | 跳转到 Raw Library 投喂新素材 |
| `FolderInput` | 导入 | 打开 URL 投喂对话框 |
| `Link2` | 反链 | 高亮当前页面的反向链接 (toggle) |
| `BarChart3` | 统计 | 打开 Dashboard 统计面板 |
| `PanelRightClose` | 折叠Chat | 切换右侧 Chat 面板 |

---

## 7. 交互流程

### 7.1 打开 Wiki 页面

```
用户点击文件树 WikiPageSummary 节点
  → onSelect(node) 被调用
  → openTab({ kind: "wiki-page", title: node.page.title, slug: node.page.slug })
  → WikiExplorerStore 检查是否已存在同 slug 标签
    ├── 已存在: setActiveTab(existingId)
    └── 不存在: 追加新 tab + setActiveTab(newId)
  → WikiContent 挂载, useQuery 获取 GET /api/wiki/pages/{slug}
  → ReactMarkdown 渲染 body
  → 同时 useQuery 获取 GET /api/wiki/pages/{slug}/backlinks
  → BacklinksSection 渲染反链列表
```

### 7.2 点击 Wikilink

```
用户在 Markdown 中点击 [[other-concept]] 链接
  → WikiContent 内的 wikilink renderer 拦截点击
  → openTab({ kind: "wiki-page", title: "other-concept", slug: "other-concept" })
  → 标签页行为与 7.1 相同
```

### 7.3 搜索过滤

```
用户在文件树搜索框输入 "transformer"
  → debounce 250ms 后 setTreeFilter("transformer")
  → useWikiFileTree 重新计算: 过滤 node.name 不含 filter 的节点
  → 同时触发 searchWikiPages("transformer", 30)
  → 搜索结果在文件树底部追加 "搜索结果" 分区 (高亮匹配)
```

### 7.4 Graph View 联动

```
用户点击 Graph View 中的节点
  → GraphPage 触发 onOpenTab 回调 (通过 props 或 Zustand)
  → openTab({ kind: "wiki-page", slug: node.id })
  → 标签栏切换到对应页面, 中央渲染区展示内容
```

### 7.5 ChatSidePanel 提问

```
用户在右侧 Chat 面板输入 "/query Transformer 和 RNN 的区别"
  → CompactComposer 调用 onSend
  → 复用 useAskSession → appendMessage → SSE 流式渲染
  → 后端识别 /query 前缀, 路由到 wiki_maintainer::query_wiki
  → 流式回答展示在 ChatSidePanel 的 MessageList 中
```

---

## 8. 测试计划

### 8.1 单元测试

| 测试用例 | 预期 | 覆盖组件 |
|----------|------|----------|
| `useWikiFileTree` 正确构建三层树 | 给定 3 个 pages + 5 个 raw entries, 生成正确的嵌套结构 | Hook |
| `useWikiFileTree` 空数据 | 给定空数组, 仍生成骨架文件夹节点 | Hook |
| `WikiExplorerStore.openTab` 去重 | 连续 openTab 同一 slug, tabs.length 不增加 | Store |
| `WikiExplorerStore.closeTab` 切换 active | 关闭当前活跃标签, activeTabId 回退到上一个 | Store |
| `WikiExplorerStore.closeTab` 最后一个 | 关闭唯一标签, activeTabId 变为 null | Store |
| 搜索过滤 | 输入 "trans" 后, 仅匹配节点可见 | WikiFileTree |

### 8.2 集成测试

| 测试用例 | 预期 | 覆盖范围 |
|----------|------|----------|
| 点击文件树节点 → 打开标签 → 渲染内容 | tab 出现, WikiContent 显示 markdown | FileTree + TabBar + Content |
| 点击 wikilink → 新标签打开 | `[[slug]]` 点击后 tabs 增加一项 | WikiContent + Store |
| 搜索 → 点击结果 → 打开对应页面 | 搜索结果可点击, 打开正确的标签页 | FileTree + Search + Store |
| 反向链接渲染 | backlinks API 返回 2 项, 页面底部显示 2 个链接 | WikiContent + BacklinksSection |
| ChatSidePanel 折叠/展开 | 点击折叠按钮, 面板 width 变为 0 | ChatSidePanel |

### 8.3 视觉回归

| 场景 | 要点 |
|------|------|
| 暗色模式 | 文件树、标签栏、Markdown body 配色正确 |
| 中文长标题 | 文件树节点和标签页正确截断, 不溢出 |
| 响应式 | 窗口宽度 < 900px 时 ChatSidePanel 自动折叠 |

---

## 9. 边界条件与风险

### 9.1 边界条件

| 场景 | 处理策略 |
|------|----------|
| 空 Wiki (零页面) | 文件树显示骨架节点, WikiContent 显示引导 CTA: "开始投喂你的第一条素材" |
| 超长页面 (> 50KB body) | ReactMarkdown 虚拟滚动不做 (MVP), 但 body 延迟渲染, 先 skeleton |
| 断裂 Wikilink (`[[不存在的slug]]`) | 渲染为红色虚线链接, tooltip "页面不存在", 点击无操作 |
| CJK slug 处理 | slug 已在后端 `wiki_store::slugify` 中转为 kebab-case ASCII, 前端无需处理 |
| 同时打开 20+ 标签 | 标签栏水平滚动, 不限制数量, 但 React Query 仅缓存活跃标签的详情 |
| Raw 条目无 source_url | 文件树中不显示外链图标, 详情页省略 "原始来源" 字段 |
| index.md / log.md 不存在 | `WikiSpecialFileResponse.exists === false` → 显示 "暂无内容" 提示 |

### 9.2 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 大量页面 (500+) 导致文件树渲染慢 | 中 | 使用 `react-window` 虚拟列表, 仅渲染可见节点 |
| ChatSidePanel 与 Chat Tab 的 session 冲突 | 中 | 共享同一 sessionId, 通过 localStorage 同步 |
| Wikilink 解析正则不完善 | 低 | 复用 `wiki_store::extract_internal_links` 相同的正则: `\[\[([^\]]+)\]\]` |
| Graph View 嵌入标签页性能 | 低 | GraphPage 已有 SVG 优化, 标签页切换时 unmount 非活跃标签 |

---

## 10. 复用清单

### 10.1 直接复用 (import as-is)

| 资源 | 路径 | 用法 |
|------|------|------|
| Wiki API 函数 | `features/ingest/persist.ts` | `listWikiPages`, `getWikiPage`, `searchWikiPages`, `getWikiIndex`, `getWikiLog` |
| Wiki 类型定义 | `features/ingest/types.ts` | `WikiPageSummary`, `WikiPageDetailResponse`, `WikiSearchHit`, `WikiSearchResponse`, `WikiSpecialFileResponse`, `RawEntry`, `WikiGraphResponse` |
| Ask 组件 | `features/ask/Composer.tsx` | ChatSidePanel 复用 (简化 props) |
| Ask 组件 | `features/ask/MessageList.tsx` | ChatSidePanel 复用 (简化布局) |
| Ask 钩子 | `features/ask/useAskSession.ts` | ChatSidePanel 共享 session 逻辑 |
| Ask 钩子 | `features/ask/useAskSSE.ts` | ChatSidePanel 流式渲染 |
| Graph 组件 | `features/graph/GraphPage.tsx` | Graph View 标签页直接嵌入 |
| 图标库 | `lucide-react` | BookOpen, FileText, Search, Link2, ListTree, Inbox, ScrollText, X, PanelRightClose, FilePlus, FolderInput, BarChart3 |
| Markdown | `react-markdown` | WikiContent 渲染引擎 |

### 10.2 重构迁移 (从现有代码提取)

| 来源 | 路径 | 提取内容 |
|------|------|----------|
| WikiExplorerPage | `features/wiki/WikiExplorerPage.tsx` | `wikiKeys` 查询键、`useDebouncedValue` hook、`Selection` type、ReactMarkdown 渲染逻辑、搜索查询策略 |
| SessionSidebar | `features/ask/SessionSidebar.tsx` | 侧边栏折叠/展开交互模式 (宽度动画、toggle 按钮) |
| AskWorkbench | `features/ask/AskWorkbench.tsx` | 消息列表 + 输入框布局模式 |

### 10.3 新建文件清单

| 文件 | 说明 |
|------|------|
| `features/wiki/WikiTab.tsx` | 容器组件, 三栏布局 |
| `features/wiki/WikiFileTree.tsx` | 文件树组件 |
| `features/wiki/WikiTabBar.tsx` | 标签栏组件 |
| `features/wiki/WikiContent.tsx` | Markdown 渲染 + 反链 |
| `features/wiki/ChatSidePanel.tsx` | 右侧紧凑 Chat 面板 |
| `features/wiki/BacklinksSection.tsx` | 反向链接列表组件 |
| `stores/wiki-explorer-store.ts` | Zustand 状态管理 |
| `hooks/useWikiFileTree.ts` | 文件树构建 hook |
