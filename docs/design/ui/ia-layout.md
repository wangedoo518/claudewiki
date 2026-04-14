# ClawWiki v2.0 -- 信息架构 + 双 Tab + 多 Tab 浏览器

> 版本: v2.0-draft  
> 最后更新: 2026-04-14  
> 参考来源: Rowboat `apps/x/apps/renderer/src/` (TabBar, ChatSidebar, SidebarContent, GraphView)  
> 现有架构: ClawWikiShell 9 路由 + Sidebar (220/56px)

---

## 1. 整体布局

v2.0 采用「三栏 + 顶部 TabBar」结构，借鉴 Rowboat 的双面板模式（左侧文件树/聊天列表 + 右侧 ChatSidebar），
同时在顶部新增浏览器风格的多 Tab 栏，实现 wiki 页面的多标签浏览。

### 1.1 布局线框 (ASCII)

```
┌─ 顶栏 TabBar (40px) ───────────────────────────────────────────────┐
│  [_index ×] [transformer ×] [Graph View ×] [+]  ← 浏览器风格多Tab  │
├────────────────────────────────────────────────────────────────────┤
│ ┌─ 左侧栏 ──────┐ ┌─ 主内容区 ────────────────┐ ┌─ 右Chat面板 ──┐ │
│ │ [Chat] [Wiki]  │ │                            │ │  (320px)      │ │
│ │  模式切换 Tab   │ │                            │ │               │ │
│ │                │ │                            │ │  紧凑版        │ │
│ │ Chat模式:      │ │    当前 Tab 对应的          │ │  Composer     │ │
│ │  会话列表       │ │    渲染内容                 │ │  + 消息列表    │ │
│ │  (按日期分组)   │ │    (Wiki页/图谱/仪表盘)     │ │               │ │
│ │                │ │                            │ │  折叠按钮 ◀   │ │
│ │ Wiki模式:      │ │                            │ │               │ │
│ │  文件树         │ │                            │ │  Wiki模式下    │ │
│ │  Inbox(badge)  │ │                            │ │  始终可用      │ │
│ │  → Raw素材     │ │    max-width: 720px        │ │               │ │
│ │  → Wiki知识    │ │    居中                     │ │  Chat模式下    │ │
│ │  → Schema      │ │                            │ │  隐藏          │ │
│ │                │ │                            │ │               │ │
│ └────────────────┘ └────────────────────────────┘ └───────────────┘ │
│    240px (可拖拽)       flex-1 (自适应)              320px (可折叠)   │
└────────────────────────────────────────────────────────────────────┘
```

### 1.2 精确尺寸

| 区域           | 宽度              | 高度     | 备注                        |
| -------------- | ----------------- | -------- | --------------------------- |
| 顶栏 TabBar    | 100%              | 40px     | Rowboat `h-10` 精确复刻     |
| 左侧栏         | 240px (默认)      | 100vh-40 | 可拖拽: min 180px, max 360px |
| 主内容区       | flex-1            | 100vh-40 | 文章居中 max-w 720px        |
| 右Chat面板     | 320px (默认)      | 100vh-40 | 可折叠到 0; 可拖拽调宽       |
| 左侧模式Tab    | 100% of sidebar   | 36px     | Chat / Wiki 两个选项        |
| 文件树搜索栏   | 100% - 16px padding | 32px   | 圆角 8px, 固定在顶部        |

---

## 2. 左侧栏两种模式

左侧栏顶部有一组模式切换 Tab，参考 Rowboat `SidebarContent` 中 `ActiveSection` 的 tasks/knowledge 切换模式。

### 2.1 Chat 模式

切换到 Chat 模式时，左侧栏显示聊天会话列表。

```
┌─ 左侧栏 (Chat 模式) ──────┐
│ [Chat ●] [Wiki]   ← Tab   │
│ ─────────────────────────  │
│ 搜索会话...          🔍    │
│ ─────────────────────────  │
│ ▾ 今天                     │
│   ├─ 💬 关于认知架构的讨论   │
│   └─ 💬 调试 wiki_maintainer│
│ ▾ 昨天                     │
│   ├─ 💬 Schema 字段设计     │
│   └─ 💬 ForceGraph 配色调整 │
│ ▾ 更早                     │
│   ├─ 💬 v1.0 功能梳理       │
│   └─ 💬 ...                │
│                            │
│ [+ 新建会话]               │
└────────────────────────────┘
```

- 按日期自动分组: 今天 / 昨天 / 更早
- 每条会话显示: 首条消息摘要 (截断至 1 行)
- 选中态: 左侧 2px 主色竖线 + 背景 `var(--color-accent)`
- 点击会话 → 主内容区切换到该会话的对话视图，同时顶部 Tab 新增/激活对应 Tab

### 2.2 Wiki 模式

切换到 Wiki 模式时，左侧栏显示文件树。

```
┌─ 左侧栏 (Wiki 模式) ──────┐
│ [Chat] [Wiki ●]   ← Tab   │
│ ─────────────────────────  │
│ 搜索...              🔍    │
│ ─────────────────────────  │
│ ▾ 📨 Inbox          (3)   │  ← badge 红色圆形
│   ├─ 待处理素材 1          │
│   ├─ 待处理素材 2          │
│   └─ 待处理素材 3          │
│ ▾ 📥 Raw 素材             │
│   ├─ 2026-04-14_chat.md   │
│   ├─ 2026-04-13_url.md    │
│   └─ ...                  │
│ ▾ 📖 Wiki 知识            │
│   ▾ concepts/             │
│     ├─ transformer.md     │
│     ├─ attention.md       │
│     └─ ...                │
│   ▾ people/               │
│     └─ karpathy.md        │
│   ▾ topics/               │
│     └─ llm-wiki.md        │
│ ▸ 📐 Schema               │
│   └─ CLAUDE.md            │
└────────────────────────────┘
```

文件树规格:
- 缩进层级: 每级 16px (Rowboat `SidebarMenuSub` 标准)
- 展开/折叠图标: ▸ (收起) / ▾ (展开)，12px 大小
- 文件图标: 根据类型着色 (raw=灰, concept=橙, people=蓝, topic=紫)
- Inbox badge: 红色圆形 (#D44A3C light / #FF6B80 dark)，min-width 18px，数字居中
- 右键菜单: 重命名 / 删除 / 复制 slug / 在新 Tab 打开

---

## 3. 顶部 Tab Bar

参考 Rowboat `tab-bar.tsx` 的 `TabBar<T>` 泛型组件，适配 ClawWiki 的多页面浏览场景。

### 3.1 Tab 结构

```
┌──────────────────────────────────────────────────────────────┐
│ [🏠 _index] [📖 transformer ×] [📖 attention ×] [🕸 Graph ×] [+] │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Tab 项规格

| 属性           | 值                                           |
| -------------- | -------------------------------------------- |
| 高度           | 40px (`self-stretch`, Rowboat `h-10`)         |
| 最小宽度       | 140px (scroll 模式下)                         |
| 最大宽度       | 240px (Rowboat `max-w-[240px]`)               |
| 内边距         | 水平 12px (`px-3`)                            |
| 字体大小       | 12px (`text-xs`)                              |
| 分隔线         | 1px `bg-border/70` (Rowboat 精确值)           |
| 活跃态         | `bg-background text-foreground`               |
| 非活跃态       | `text-muted-foreground`                       |
| 悬停态         | `hover:bg-accent/50 hover:text-foreground`    |
| 关闭按钮       | 16px X 图标, `opacity-0` 默认, hover 时 `opacity-60` |
| 标题截断       | `truncate` 单行省略                           |

### 3.3 Tab 类型

| Tab 类型     | 图标    | 可关闭 | 说明                       |
| ------------ | ------- | ------ | -------------------------- |
| _index       | 🏠      | 否     | 固定首页/仪表盘 Tab         |
| Wiki 页面    | 📖      | 是     | 点击文件树/wikilink 打开    |
| Chat 会话    | 💬      | 是     | 点击会话列表打开            |
| Graph View   | 🕸       | 是     | 点击左侧 Graph 菜单打开     |
| Settings     | ⚙       | 是     | 点击左侧 Settings 菜单打开  |

### 3.4 Tab 溢出处理

- 默认: `layout='scroll'` 水平滚动，隐藏滚动条 (`[scrollbar-width:none]`)
- 当 Tab 总宽度超过可用空间:
  - 可水平滚动
  - 右侧出现下拉菜单按钮 (ChevronDown)
  - 下拉菜单列出所有 Tab，点击可切换

### 3.5 Tab 交互

| 操作               | 行为                                |
| ------------------ | ----------------------------------- |
| 左键单击           | 切换到该 Tab                        |
| 点击关闭按钮 (×)   | 关闭该 Tab (stopPropagation)        |
| 中键单击           | 关闭该 Tab                          |
| 双击 (未来)        | 编辑 Tab 标题                       |
| 拖拽 (未来)        | 重新排序 Tab                        |
| Ctrl/Cmd+W         | 关闭当前活跃 Tab                     |
| Ctrl/Cmd+T         | 新建 Tab (_index)                   |
| Ctrl/Cmd+1-9       | 切换到第 N 个 Tab                    |

---

## 4. 右侧 Chat 面板

参考 Rowboat `ChatSidebar` 组件 (360px 最小, 460px 默认, 可拖拽)。
在 ClawWiki v2.0 中简化为 320px 固定宽度的辅助 Chat 面板。

### 4.1 面板线框

```
┌─ 右Chat面板 (320px) ──────────────────┐
│ ◀ 折叠                                │  ← 左侧边缘中央
│ ─────────────────────────────────────  │
│                                       │
│  [AI 消息气泡]                         │
│  紧凑间距 8px                          │
│                                       │
│  [用户消息气泡]                        │
│                                       │
│  [AI 消息气泡]                         │
│                                       │
│ ─────────────────────────────────────  │
│ [输入框 ···················] [发送]    │  ← 紧凑 Composer
└───────────────────────────────────────┘
```

### 4.2 面板行为

| 场景                       | 右Chat面板状态 |
| -------------------------- | -------------- |
| Wiki 模式, 主内容=Wiki页面  | 展开 (可折叠)  |
| Wiki 模式, 主内容=Graph     | 展开 (可折叠)  |
| Wiki 模式, 主内容=仪表盘    | 展开 (可折叠)  |
| Chat 模式, 主内容=对话      | **隐藏**       |
| Chat 模式, 主内容=Wiki页面  | **隐藏**       |

设计原则: Chat 模式下主内容区已经是完整对话界面，右侧 Chat 面板隐藏避免重复。
Wiki 模式下右侧 Chat 面板始终可用，可以一边看 wiki 一边问问题。

### 4.3 折叠交互

- 折叠按钮: 左侧边缘中央, 圆形 24px, 图标 ◀ (展开时) / ▶ (折叠时)
- 折叠动画: `transition-[width] duration-200 ease-linear` (Rowboat 精确值)
- 折叠后宽度: 0px (完全隐藏)
- 键盘快捷键: Ctrl/Cmd+\ 切换折叠

### 4.4 紧凑 Composer

相比主对话页面的完整 Composer:
- 单行输入框 (非 textarea)
- 发送按钮缩小为 28px
- 无附件上传入口 (v2.0 暂不需要)
- 无 @ mention (v2.0 暂不需要)
- 支持 Enter 发送, Shift+Enter 换行

---

## 5. 响应式断点

三组断点覆盖桌面到小屏场景。ClawWiki 是 Tauri 桌面应用，
但需要处理窗口缩放场景。

### 5.1 断点定义

| 断点         | 窗口宽度     | 布局               | 说明               |
| ------------ | ------------ | ------------------ | ------------------ |
| 大屏         | >= 1440px    | 三栏               | 240 + flex + 320   |
| 中屏         | >= 1024px    | 两栏               | 240 + flex         |
| 小屏         | < 1024px     | 单栏               | flex (侧栏=抽屉)   |

### 5.2 各断点行为

**大屏 (>= 1440px)**
```
┌─ TabBar ──────────────────────────────────────────┐
├─ 左侧栏 240px ─┤─── 主内容 flex ───┤─ Chat 320px ─┤
```
- 三栏同时可见
- Chat 面板默认展开
- 左侧栏可拖拽调宽 (180-360px)

**中屏 (>= 1024px)**
```
┌─ TabBar ─────────────────────────────┐
├─ 左侧栏 240px ─┤─── 主内容 flex ─────┤
```
- Chat 面板自动收起
- 点击展开时覆盖主内容 (overlay)
- 左侧栏宽度可缩小到 180px

**小屏 (< 1024px)**
```
┌─ TabBar ────────────────────────┐
├─────── 主内容 100% ──────────────┤
```
- 左侧栏变为抽屉式 (从左滑出, overlay)
- Chat 面板变为抽屉式 (从右滑出, overlay)
- TabBar 仍可见, Tab 项缩小到 min-width
- 汉堡菜单按钮出现在 TabBar 左侧

---

## 6. 导航流

### 6.1 文件树 → 新 Tab

```
用户点击文件树中的 wiki 页
  ↓
检查顶部 Tab 中是否已有该页的 Tab
  ├─ 已有 → 激活该 Tab
  └─ 没有 → 创建新 Tab (📖 slug_name), 激活, 主内容渲染 Markdown
```

### 6.2 Wikilink → 新 Tab

```
用户在 wiki 文章中点击 [[wikilink]]
  ↓
解析 wikilink → 对应 slug
  ↓
检查顶部 Tab 中是否已有
  ├─ 已有 → 激活
  └─ 没有 → 新建 Tab, 激活
```

### 6.3 Graph 节点 → 新 Tab

```
用户在 Graph View 中点击节点
  ↓
节点 id = wiki slug
  ↓
新建/激活对应 wiki 页 Tab
```

### 6.4 搜索结果 → 新 Tab

```
用户使用 Cmd+K 搜索
  ↓
选择搜索结果
  ├─ knowledge 类型 → 新建/激活 wiki 页 Tab
  └─ chat 类型 → 新建/激活对话 Tab
```

### 6.5 Tab 间状态

- 每个 Tab 维护独立的滚动位置
- Tab 切换时恢复滚动位置
- 关闭 Tab 时自动激活相邻 Tab (优先右侧, 无则左侧)
- `_index` Tab 不可关闭，始终存在

---

## 7. 与当前架构的迁移路径

### 7.1 现有架构 (v1.x)

```
ClawWikiShell
├── Sidebar (220/56px) — 9 个菜单项
└── Routes
    ├── /dashboard
    ├── /ask/*
    ├── /inbox
    ├── /raw/*
    ├── /wiki/*
    ├── /graph
    ├── /schema/*
    ├── /wechat
    └── /settings
```

### 7.2 迁移阶段

**Phase 1: 并行运行 (不破坏现有功能)**

- 新增 `/v2` 路由前缀
- `/v2` 路由加载新的 `V2Shell` 组件 (双 Tab 架构)
- 现有 9 路由完全保留，不做任何修改
- 在 Settings 中增加 "体验 v2.0 布局" 开关
- 开关打开时重定向到 `/v2/dashboard`

```
App.tsx
├── ClawWikiShell (默认)
│   └── Routes: /dashboard, /ask, ...
└── V2Shell (实验性)
    └── Routes: /v2/dashboard, /v2/wiki/:slug, ...
```

**Phase 2: V2 成为默认**

- `/v2` 路由稳定后 (无回归 bug, 用户反馈良好)
- `V2Shell` 替换 `ClawWikiShell` 成为默认 Shell
- 旧路由 301 重定向到新路由
- Settings 中的开关变为 "使用经典布局" (反向)

**Phase 3: 清理**

- 移除旧的 `ClawWikiShell` 和 `Sidebar` 组件
- 移除 `/v2` 前缀, 路由归一化
- 清理 `clawwiki-routes.ts` 中旧的路由定义

### 7.3 路由映射

| v1.x 路由       | v2.0 Tab 类型   | 映射方式                  |
| --------------- | --------------- | ------------------------- |
| /dashboard      | _index Tab      | _index 固定 Tab 内容      |
| /ask/*          | Chat Tab        | 每个会话一个 Tab          |
| /inbox          | _index Tab      | Inbox 徽标在文件树        |
| /raw/*          | Wiki Tab        | 文件树 Raw 分组           |
| /wiki/*         | Wiki Tab        | 文件树 Wiki 分组          |
| /graph          | Graph Tab       | 专用 Tab 类型             |
| /schema/*       | Wiki Tab        | 文件树 Schema 分组        |
| /wechat         | Settings Tab    | 集成到设置页面            |
| /settings       | Settings Tab    | 专用 Tab 类型             |

### 7.4 数据层无变化

- 路由 `/api/wiki/*` 不变
- Zustand store 结构不变
- React Query 缓存键不变
- 仅 Shell 层组件替换，数据层零改动

---

## 8. 键盘快捷键

| 快捷键                  | 行为                        |
| ---------------------- | --------------------------- |
| Ctrl/Cmd + K           | 打开搜索面板                 |
| Ctrl/Cmd + T           | 新建 Tab                    |
| Ctrl/Cmd + W           | 关闭当前 Tab                 |
| Ctrl/Cmd + 1-9         | 切换到第 N 个 Tab            |
| Ctrl/Cmd + Tab         | 切换到下一个 Tab             |
| Ctrl/Cmd + Shift + Tab | 切换到上一个 Tab             |
| Ctrl/Cmd + \           | 切换右侧 Chat 面板折叠       |
| Ctrl/Cmd + B           | 切换左侧栏折叠              |
| Ctrl/Cmd + E           | 左侧栏: Chat/Wiki 模式切换  |
| Ctrl/Cmd + Enter       | 发送消息 (在 Chat 面板中)    |

---

## 9. URL 路由设计 (v2)

```
/v2/                          → 重定向到 /v2/home
/v2/home                      → _index Tab (仪表盘)
/v2/wiki/:slug                → Wiki Tab (渲染 Markdown)
/v2/chat/:sessionId           → Chat Tab (对话视图)
/v2/graph                     → Graph Tab
/v2/settings                  → Settings Tab (含 WeChat 子页)
```

- 浏览器地址栏仅反映「当前活跃 Tab」的 URL
- 非活跃 Tab 的状态存储在内存 (Zustand store)
- 刷新页面只恢复当前 Tab, 其他 Tab 需从 localStorage 恢复 (Phase 2)
