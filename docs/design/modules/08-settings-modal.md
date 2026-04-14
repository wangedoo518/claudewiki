# 08 — Settings 收敛为 Modal

> **模块**: Settings Modal (Rowboat-style)  
> **状态**: v2.0 设计稿  
> **上次更新**: 2026-04-14  

---

## 1. 职责边界

Settings Modal 拥有以下领域：

| 归属 | 说明 |
|------|------|
| **全部配置 UI** | 所有应用设置的统一入口，从独立页面收敛为模态对话框 |
| **微信助手配置** | 吸收原 `WeChatBridgePage` 的全部功能（QR 登录、账号管理、客服管道配置、连接状态），不再是独立页面 |
| **SKILL 编辑器** | 吸收原 `SchemaEditorPage` 的 CLAUDE.md 查看/编辑功能 |
| **Schema 模板** | 新增区段：模板预览 + 巡检配置（消费 05-schema-system 定义的 API） |
| **模态生命周期** | 打开/关闭/backdrop 点击/Escape 键/滚动位置保持 |

**不拥有**：
- 设置数据的持久化逻辑（属于 settings-store / desktop-server）
- 微信协议层（属于 wechat_ilink / wechat_kefu Rust crates）
- Schema 校验和巡检执行（属于 wiki_patrol crate）

**关键变更**：Settings 从路由级页面 (`/settings`) 变为全局 Modal，不再占用路由。用户在任何页面都可以打开设置，关闭后回到原页面，不产生路由导航。

---

## 2. 依赖

```
settings-store (zustand) ──→ Settings Modal（状态读写）
desktop-server ──→ Settings Modal（设置 API）
wechat_kefu ──→ Settings Modal（客服配置 API）
```

| 方向 | 依赖 | 用途 |
|------|------|------|
| **状态** | `settings-store`（zustand） | 主题切换、语言切换等即时生效的客户端设置 |
| **API** | `GET/PUT /api/desktop/settings` | 持久化设置读写 |
| **API** | `GET/PUT /api/desktop/customize` | 自定义配置（权限、MCP、provider） |
| **API** | `GET /api/desktop/bootstrap` | 功能开关（private_cloud 等） |
| **API** | `/api/wechat/*` 系列端点 | 微信账号 CRUD、QR 登录、连接状态 |
| **API** | `/api/kefu/*` 系列端点 | 客服管道配置 |
| **API** | `GET/PUT /api/wiki/schema` | SKILL 文件读写 |
| **API** | `GET /api/wiki/schema/templates` | 模板列表（新增） |
| **API** | `POST /api/wiki/patrol` | 触发巡检（新增） |
| **API** | `GET /api/wiki/patrol/report` | 最新巡检报告（新增） |
| **UI** | `@radix-ui/react-dialog` | Modal 基础设施 |
| **UI** | 全部现有 settings sections | 迁移到 Modal 内部 |

---

## 3. API

**无新增 API。** Settings Modal 完全消费已有端点和其他模块定义的新端点：

### 复用的已有端点

| 方法 | 路径 | 所属 |
|------|------|------|
| `GET` | `/api/desktop/bootstrap` | desktop-server |
| `GET/PUT` | `/api/desktop/settings` | desktop-server |
| `GET/PUT` | `/api/desktop/customize` | desktop-server |
| `GET` | `/api/wechat/accounts` | wechat_ilink |
| `POST` | `/api/wechat/login` | wechat_ilink |
| `GET` | `/api/wechat/login/status` | wechat_ilink |
| `POST` | `/api/wechat/login/cancel` | wechat_ilink |
| `DELETE` | `/api/wechat/accounts/:id` | wechat_ilink |
| `GET/PUT` | `/api/kefu/config` | wechat_kefu |
| `POST` | `/api/kefu/accounts` | wechat_kefu |
| `GET` | `/api/kefu/contact-url` | wechat_kefu |
| `GET/PUT` | `/api/wiki/schema` | wiki_store |

### 消费其他模块新增端点

| 方法 | 路径 | 定义于 |
|------|------|--------|
| `GET` | `/api/wiki/schema/templates` | 05-schema-system |
| `POST` | `/api/wiki/patrol` | 05-schema-system |
| `GET` | `/api/wiki/patrol/report` | 05-schema-system |

---

## 4. 数据模型

**无新增数据模型。** Settings Modal 纯粹是 UI 层重构，复用全部现有类型：

| 类型 | 来源 |
|------|------|
| `DesktopBootstrap` | `@/lib/tauri` |
| `DesktopSettingsState` | `@/lib/tauri` |
| `DesktopCustomizeState` | `@/lib/tauri` |
| `SettingsSection` 联合类型 | SettingsPage.tsx（扩展后迁移） |
| WeChat 相关类型 | WeChatBridgePage.tsx 内部类型 |
| Schema 相关类型 | 见 05-schema-system 数据模型 |
| PatrolReport 等 | 见 05-schema-system 数据模型 |

### 扩展 SettingsSection 类型

```typescript
// v1（当前）
type SettingsSection =
  | "general" | "provider" | "multi-provider" | "codex-pool"
  | "wechat" | "mcp" | "permissions" | "shortcuts"
  | "storage" | "data" | "about";

// v2（Modal 重构后）
type SettingsSection =
  | "general"          // 常规（General + Appearance 合并）
  | "llm-model"        // LLM 模型（Provider + Multi-Provider 合并）
  | "wechat"           // 微信助手（吸收 WeChatBridgePage 全部功能）
  | "skill-editor"     // SKILL 编辑器（从 SchemaEditorPage 迁移）
  | "schema"           // Schema 模板（新增）
  | "mcp"              // MCP 工具
  | "permissions"      // 权限
  | "shortcuts"        // 快捷键
  | "storage"          // 存储（Storage + Data 合并）
  | "about";           // 关于
```

---

## 5. Rust 实现要点

**无 Rust 变更。** Settings Modal 是纯前端重构，后端 API 层不受影响。所有现有端点保持原有签名和行为。

---

## 6. 前端实现要点

### 6.1 SettingsModal 组件

基于 `@radix-ui/react-dialog` 构建全屏 overlay：

```typescript
// 触发方式：全局状态控制
const useSettingsModal = create<{
  isOpen: boolean;
  initialSection?: SettingsSection;
  open: (section?: SettingsSection) => void;
  close: () => void;
}>(...)
```

```
┌─ SettingsModal ──────────────────────────────────────────┐
│ ┌─────────────┬──────────────────────────────────────┐   │
│ │             │                                      │   │
│ │ 常规        │  [当前区段内容]                        │   │
│ │ LLM 模型    │                                      │   │
│ │ 微信助手     │                                      │   │
│ │ SKILL 编辑器 │                                      │   │
│ │ Schema 模板  │                                      │   │
│ │ MCP 工具    │                                      │   │
│ │ 权限        │                                      │   │
│ │ 快捷键      │                                      │   │
│ │ 存储        │                                      │   │
│ │ 关于        │                                      │   │
│ │             │                                      │   │
│ └─────────────┴──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Modal 规格**：
- Radix `Dialog.Portal` + `Dialog.Overlay`（半透明黑色背景）
- `Dialog.Content`：`max-w-3xl`、`max-h-[85vh]`、`rounded-lg`
- 关闭方式：点击 overlay / 按 Escape / 点击右上角 X 按钮
- 进入动画：fade-in + scale-up（150ms ease-out）
- 退出动画：fade-out + scale-down（100ms ease-in）

### 6.2 区段重组

原有 11 个 tab 合并为 10 个：

| v2 区段 | 合并来源 | 变更说明 |
|---------|----------|----------|
| **常规** | General + 外观设置 | GeneralSettings 组件保持不变，如有独立外观设置则合入 |
| **LLM 模型** | Provider + Multi-Provider | ProviderSettings 和 MultiProviderSettings 上下排列，中间加分隔线 |
| **微信助手** | WeChatSettings + WeChatBridgePage | 完整吸收 WeChatBridgePage：QR 登录、账号列表、删除、客服管道配置、连接状态轮询。原 WeChatSettings 仅展示账号列表 → 扩展为完整管理界面 |
| **SKILL 编辑器** | SchemaEditorPage | 搬入 SchemaBody 组件（CLAUDE.md 查看/编辑），新增 AGENTS.md 只读展示 |
| **Schema 模板** | 新增 | 模板列表 + 字段详情 + 巡检配置 + 手动巡检 + 报告展示（见 05-schema-system） |
| **MCP 工具** | MCP | McpSettings 保持不变 |
| **权限** | Permissions | PermissionSettings 保持不变 |
| **快捷键** | Shortcuts | ShortcutsSettings 保持不变 |
| **存储** | Storage + Data | StorageSettings 和 DataSettings 合并到同一区段 |
| **关于** | About | AboutSection 保持不变 |

### 6.3 触发入口

```typescript
// Sidebar 中的设置按钮
<button onClick={() => useSettingsModal.getState().open()}>
  <Settings className="size-4" />
</button>

// 从 Dashboard 跳转到特定区段
<button onClick={() => useSettingsModal.getState().open("schema")}>
  查看报告
</button>
```

侧边栏的 Settings 图标不再导航到 `/settings` 路由，而是调用 `open()` 打开 Modal。

### 6.4 路由兼容

- `/settings` 路由保留（向后兼容），但渲染时自动打开 SettingsModal + 重定向回上一页面
- 深链接支持：`/settings?section=wechat` → 打开 Modal 并定位到微信区段

### 6.5 滚动位置保持

每个区段的滚动位置缓存在 `useRef<Map<SettingsSection, number>>()`，切换 tab 时恢复。

### 6.6 微信助手区段详情

吸收 WeChatBridgePage 的全部功能：

```
┌─ 微信助手 ──────────────────────────────────┐
│                                              │
│ ┌─ 连接状态 ──────────────────────────────┐  │
│ │ ● 已连接  wxid_abc123  (WeChat 名称)    │  │
│ │   最后活跃: 2 分钟前                     │  │
│ └──────────────────────────────────────────┘  │
│                                              │
│ ┌─ 账号管理 ──────────────────────────────┐  │
│ │ [+ 添加新账号]  (触发 QR 登录流程)       │  │
│ │                                          │  │
│ │ wxid_abc123  ● 在线  [删除]              │  │
│ │ wxid_def456  ○ 离线  [删除]              │  │
│ └──────────────────────────────────────────┘  │
│                                              │
│ ┌─ 客服管道 ──────────────────────────────┐  │
│ │ 状态: 已启用                             │  │
│ │ 联系链接: https://kefu.xxx/contact       │  │
│ │ [配置客服管道]                            │  │
│ └──────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

### 组件结构

```
SettingsModal
├── Dialog.Portal
│   ├── Dialog.Overlay          // 半透明背景
│   └── Dialog.Content          // max-w-3xl 容器
│       ├── ModalHeader         // 标题 + X 关闭按钮
│       ├── div.flex
│       │   ├── TabMenu         // 左侧导航（200px）
│       │   │   └── TabItem[]   // 10 个区段按钮
│       │   └── ScrollArea      // 右侧内容区（flex-1）
│       │       └── SectionContent  // 根据 active 渲染对应组件
│       │           ├── GeneralSettings
│       │           ├── LLMModelSettings       // 新组合
│       │           ├── WeChatAssistantSection  // 新组合
│       │           ├── SkillEditorSection      // 迁移
│       │           ├── SchemaTemplateSection   // 新增
│       │           ├── McpSettings
│       │           ├── PermissionSettings
│       │           ├── ShortcutsSettings
│       │           ├── StorageDataSection      // 新组合
│       │           └── AboutSection
│       └── ModalFooter?        // 可选：全局保存按钮（若有需要）
```

---

## 7. 交互流程

### 主路径：打开设置 → 修改 → 关闭

```
用户在任意页面（如 Wiki Explorer）
  → 点击侧边栏 Settings 图标
  → SettingsModal 以 fade-in 动画打开（overlay + content）
  → 底层页面保持可见但不可交互（overlay 遮罩）
  → 用户切换到 "LLM 模型" tab
  → 修改 provider 配置
  → 设置自动保存（失焦 / onChange → debounced PUT）
  → 用户按 Escape 或点击 overlay
  → Modal 以 fade-out 动画关闭
  → 回到 Wiki Explorer，无路由变化，之前的滚动位置保持
```

### 辅助路径：从 Dashboard 跳转到巡检报告

```
用户在 Dashboard 看到巡检摘要 "5 schema 违规"
  → 点击 "查看报告"
  → SettingsModal 打开，直接定位到 "Schema 模板" tab
  → 展示完整巡检报告
  → 用户点击某条违规 → 关闭 Modal → 导航到 wiki 页面
```

### 辅助路径：微信 QR 登录

```
SettingsModal → 微信助手 tab
  → 点击 "添加新账号"
  → 触发 POST /api/wechat/login
  → 展示 QR 码 + 轮询 status
  → 用户扫码确认
  → 账号出现在列表中
  → 连接状态切换为 "在线"
```

### 辅助路径：SKILL 编辑

```
SettingsModal → SKILL 编辑器 tab
  → 展示 CLAUDE.md 内容（只读模式）
  → 点击 "Edit" → textarea 编辑模式
  → 修改规则内容
  → 点击 "Save" → PUT /api/wiki/schema
  → 成功提示，退出编辑模式
```

---

## 8. 测试策略

### 单元测试（组件级）

| 测试场景 | 预期 |
|----------|------|
| Modal 打开/关闭 | `isOpen=true` → Dialog.Content 可见；`isOpen=false` → 不渲染 |
| Escape 关闭 | 按 Escape → `close()` 被调用 |
| Overlay 点击关闭 | 点击 overlay → `close()` 被调用 |
| Tab 切换 | 点击 "微信助手" → 右侧渲染 WeChatAssistantSection |
| 初始区段 | `open("schema")` → 打开后直接展示 Schema 模板 tab |

### 集成测试（功能级）

| 测试场景 | 预期 |
|----------|------|
| 设置持久化 | 修改语言设置 → 关闭 Modal → 重新打开 → 语言保持 |
| 微信区段连接状态 | mock 在线账号 → 绿色状态指示器 |
| SKILL 编辑器保存 | 编辑 → Save → mock 200 → 退出编辑模式 + toast |
| Schema 巡检触发 | 点击 "立即巡检" → mock PatrolReport → 摘要卡片更新 |

### 回归测试

| 测试场景 | 预期 |
|----------|------|
| `/settings` 路由向后兼容 | 访问 `/settings` → Modal 自动打开 |
| `/settings?section=wechat` 深链接 | 打开 Modal 并定位到微信 tab |
| 所有现有设置功能正常 | General/Provider/MCP/Permissions/Shortcuts/About 行为不变 |

---

## 9. 边界条件

| 场景 | 处理策略 |
|------|----------|
| **移动端（窄屏）** | Modal 变为全屏（`w-full h-full`），左侧 tab 菜单收缩为顶部水平滚动条或 dropdown select。内容区占满宽度。 |
| **设置保存失败** | 失败的区段展示内联错误信息（红色 border + 错误文案）。不阻止其他区段的操作。Toast 通知 "保存失败"。 |
| **并发设置修改** | 各区段独立保存，不存在全局 "保存" 按钮。并发修改不同区段不会冲突。同一区段的并发修改以最后写入为准。 |
| **Modal 打开时底层路由变化** | Modal 关闭。通过 `useEffect` 监听 location 变化，触发 `close()`。 |
| **微信 QR 登录超时** | 轮询 60s 后超时，展示 "二维码已过期，请重试" + 重新生成按钮。 |
| **大量设置区段内容** | 右侧 ScrollArea 独立滚动，不影响左侧 tab 菜单。滚动位置按区段缓存。 |
| **Modal 打开时按 Tab 键** | 焦点限制在 Modal 内部（Radix Dialog 内置 focus trap）。 |
| **无 Codex 池** | `private_cloud_enabled=false` 时，"订阅池" tab 不显示在菜单中（已有逻辑保留）。合并到 "LLM 模型" 区段时同样条件隐藏。 |
| **SchemaEditorPage 独立路由** | 保留 `/schema` 路由作为向后兼容入口，内部渲染与 Modal 内相同的 SchemaBody 组件。 |

---

## 10. 复用清单

| 现有资产 | 复用方式 |
|----------|----------|
| **`features/settings/SettingsPage.tsx`** | 核心架构（tab 导航 + 条件渲染）迁移到 SettingsModal 内部。SettingsPage 文件保留，改为薄壳：打开 Modal + 路由重定向。 |
| **`features/settings/sections/GeneralSettings.tsx`** | 原样迁入 "常规" tab |
| **`features/settings/sections/ProviderSettings.tsx`** | 迁入 "LLM 模型" tab 上半部分 |
| **`features/settings/sections/MultiProviderSettings.tsx`** | 迁入 "LLM 模型" tab 下半部分 |
| **`features/settings/sections/WeChatSettings.tsx`** | 迁入 "微信助手" tab 的账号列表部分 |
| **`features/settings/sections/McpSettings.tsx`** | 原样迁入 "MCP 工具" tab |
| **`features/settings/sections/PermissionSettings.tsx`** | 原样迁入 "权限" tab |
| **`features/settings/sections/ShortcutsSettings.tsx`** | 原样迁入 "快捷键" tab |
| **`features/settings/sections/StorageSettings.tsx`** | 迁入 "存储" tab 上半部分 |
| **`features/settings/sections/DataSettings.tsx`** | 迁入 "存储" tab 下半部分 |
| **`features/settings/sections/AboutSection.tsx`** | 原样迁入 "关于" tab |
| **`features/settings/sections/private-cloud/SubscriptionCodexPool.tsx`** | 条件渲染，合并到 "LLM 模型" tab（private_cloud 启用时显示） |
| **`features/settings/api/query.ts`** | 设置相关 query key 工厂，全部保留 |
| **`features/settings/api/client.ts`** | API 调用函数，全部保留 |
| **`features/settings/components/SettingGroup.tsx`** | 通用设置分组组件，各 tab 内复用 |
| **`features/wechat/WeChatBridgePage.tsx`** | 核心逻辑（QR 登录流、账号管理、客服配置）提取为独立 hooks/组件，迁入 "微信助手" tab。WeChatBridgePage 路由保留为向后兼容薄壳。 |
| **`features/schema/SchemaEditorPage.tsx`** | SchemaBody 组件提取，迁入 "SKILL 编辑器" tab。getWikiSchema / putWikiSchema API 调用保留。 |
| **`@radix-ui/react-dialog`** | Modal 基础设施（项目已安装） |
| **`@/components/ui/scroll-area`** | 右侧内容区滚动容器（已在 SettingsPage 中使用） |
| **`useSettingsStore`（zustand）** | 客户端设置状态管理，保持不变 |
| **`useTranslation`（i18next）** | 多语言支持，保持不变 |
