# 通用嵌入浏览器面板 · 统一设计方案

> **日期**: 2026-04-17
> **版本**: v1.0
> **状态**: 团队评审
> **核心洞察**: 右侧嵌入浏览器不是 WeChat Pipeline 的私有组件，
> 而是一个**平台级能力**，所有需要 web 交互的场景共享同一套 UX。

---

## 一、场景清单

当前和未来需要嵌入浏览器的所有场景：

| 场景 | 触发时机 | 嵌入的 URL | 用户操作 |
|------|---------|----------|---------|
| **Cloudflare 注册** | WeChat Pipeline Phase ① | dash.cloudflare.com/sign-up | 真人验证 CAPTCHA |
| **微信扫码授权** | WeChat Pipeline Phase ③ | kf.weixin.qq.com | 手机扫码 |
| **DeepSeek 登录** | ZeroToken 接入 | chat.deepseek.com/login | 账号登录 |
| **Qwen 登录** | ZeroToken 接入 | tongyi.aliyun.com/login | 账号登录 |
| **ChatGPT 登录** | ZeroToken 接入 | chatgpt.com/auth/login | 账号登录 |
| **Claude 登录** | ZeroToken 接入 | claude.ai/login | 账号登录 |
| **GitHub OAuth** | 未来集成 | github.com/login/oauth | OAuth 授权 |
| **Obsidian Clipper** | 素材导入 | 网页全文阅读 | 阅读/剪藏 |

**共同点**：都是"用户需要在嵌入的浏览器中完成某个 web 操作，
然后系统自动检测完成状态并继续后续流程"。

---

## 二、组件抽象

### 2.1 从 Pipeline 专属到平台通用

```
当前（Pipeline 专属）：

ConnectWeChatPipelinePage.tsx
├── 内嵌的 drawer state
├── 内嵌的 webview toolbar
├── 内嵌的 webview content
└── 内嵌的 toggle button

改为（平台通用）：

BrowserDrawer（通用组件）
├── 抽屉容器（300ms 滑动动画）
├── 工具栏（◀ ▶ 🔄 URL 🔗）
├── 内容区（webview / iframe / 占位）
└── 切换按钮（◀/▶）

使用方：
├── ConnectWeChatPipelinePage → <BrowserDrawer url={...} />
├── ZeroTokenPage → <BrowserDrawer url={...} />
├── 任何未来场景 → <BrowserDrawer url={...} />
```

### 2.2 组件 API 设计

```typescript
interface BrowserDrawerProps {
  /** 要加载的 URL，变化时自动导航 */
  url: string | null;

  /** 抽屉标题（工具栏右侧显示） */
  title?: string;

  /** 是否展开 */
  open: boolean;

  /** 展开/收起回调 */
  onOpenChange: (open: boolean) => void;

  /** URL 变化回调（webview 内部导航时触发） */
  onUrlChange?: (url: string) => void;

  /** webview 加载完成回调 */
  onLoad?: () => void;

  /** 占位内容（url 为 null 或加载中时显示） */
  placeholder?: React.ReactNode;

  /** 抽屉宽度，默认 "55vw" */
  width?: string | number;

  /** 最小宽度，默认 400 */
  minWidth?: number;
}
```

### 2.3 使用方式

```tsx
// WeChat Pipeline 中使用
<BrowserDrawer
  url={currentPhase.manual ? phaseUrls[currentPhaseIdx] : null}
  title={currentPhase.drawerTitle}
  open={drawerOpen}
  onOpenChange={setDrawerOpen}
/>

// ZeroToken DeepSeek 登录中使用
<BrowserDrawer
  url="https://chat.deepseek.com/login"
  title="登录 DeepSeek"
  open={showLogin}
  onOpenChange={setShowLogin}
  onUrlChange={(url) => {
    // 检测登录成功（URL 变为 dashboard）
    if (url.includes('/chat')) onLoginSuccess();
  }}
/>
```

---

## 三、统一交互体验

### 3.1 Codex 模式参考

从 Codex 截图分析的交互模式：

| 维度 | Codex 右侧面板 | ClaudeWiki BrowserDrawer |
|------|-------------|------------------------|
| **定位** | 代码审阅/diff 面板 | web 操作/登录面板 |
| **宽度** | 约 50% | 55vw（可调） |
| **触发** | 有 diff 时自动展开 | 需要 web 操作时自动展开 |
| **收起** | 可手动折叠 | 可手动折叠 ◀/▶ |
| **内容** | 代码 diff + 审阅面板 | webview + 导航工具栏 |
| **状态栏** | 文件名 + 行数 | URL + 导航按钮 |

### 3.2 用户心智模型

```
用户认知：
"右侧面板 = 我需要看/操作的外部内容"

不同场景下：
├── WeChat Pipeline → "右侧是 Cloudflare 注册页/微信扫码页"
├── ZeroToken → "右侧是 DeepSeek/Qwen 登录页"
├── 代码审阅 → "右侧是代码 diff"（未来 Codex 模式）
└── 素材预览 → "右侧是网页原文"（未来 Clipper 模式）

统一的交互：
- 需要时自动展开
- 不需要时自动收起
- 用户随时可手动切换
- 工具栏始终一致（◀ ▶ 🔄 URL 🔗）
```

---

## 四、架构设计

### 4.1 组件层次

```
Shell (ClawWikiShell)
├── Sidebar（左侧边栏）
├── Main Content（中间主内容区）
│   ├── 路由页面（Ask/Wiki/Pipeline/ZeroToken/...）
│   └── ChatSidePanel（右侧 Chat 面板，Wiki 模式）
└── BrowserDrawer（右侧浏览器抽屉，需要时才渲染）
    ├── DrawerToggle（◀/▶ 切换按钮）
    ├── BrowserToolbar（URL + 导航）
    └── BrowserContent（webview/iframe）
```

### 4.2 状态管理

```typescript
// zustand store 扩展
interface BrowserDrawerState {
  /** 当前加载的 URL */
  browserUrl: string | null;
  /** 抽屉是否展开 */
  browserDrawerOpen: boolean;
  /** 抽屉标题 */
  browserTitle: string;

  /** 打开浏览器抽屉并导航到 URL */
  openBrowser: (url: string, title?: string) => void;
  /** 关闭浏览器抽屉 */
  closeBrowser: () => void;
  /** 切换展开/收起 */
  toggleBrowser: () => void;
}
```

任何组件都可以通过 zustand 打开浏览器抽屉：

```typescript
// WeChat Pipeline 中
const openBrowser = useSettingsStore(s => s.openBrowser);
openBrowser("https://dash.cloudflare.com/sign-up", "Cloudflare 注册");

// ZeroToken 中
openBrowser("https://chat.deepseek.com/login", "登录 DeepSeek");

// 任何地方
openBrowser("https://example.com", "预览");
```

### 4.3 BrowserDrawer 与 ChatSidePanel 的关系

```
两个右侧面板互斥：
- ChatSidePanel: Wiki 模式下显示 Ask 对话（320px 固定）
- BrowserDrawer: 需要 web 操作时显示浏览器（55vw 可变）

规则：
- BrowserDrawer 打开时，ChatSidePanel 自动隐藏
- BrowserDrawer 关闭时，ChatSidePanel 恢复显示
- BrowserDrawer 优先级高于 ChatSidePanel
```

### 4.4 webview 技术栈

```
桌面端 (Tauri):
  ├── 优先使用 Tauri WebviewWindow（完整浏览器能力）
  └── 降级：<iframe> + sandbox 属性

浏览器开发模式:
  ├── <iframe>（受 X-Frame-Options 限制）
  └── 降级提示："在外部浏览器打开" 按钮

共享能力:
  ├── Cookie 持久化（登录态保持）
  ├── URL 变化检测（导航拦截）
  ├── CSS/JS 注入（自动化操作，桌面端 only）
  └── 加载状态跟踪
```

---

## 五、线框图

### 5.1 BrowserDrawer 展开状态（通用）

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌──── 任意左侧内容 ────────────┐  ┌──── BrowserDrawer ────────────┐ │
│  │                              │  │                               │ │
│  │  （Pipeline 进度 /            │  │ ◀ ▶ 🔄 │ URL 地址 │ 🔗       │ │
│  │   ZeroToken 配置 /           │  │ ─────────────────────────────│ │
│  │   任何内容）                   │  │                               │ │
│  │                              │  │                               │ │
│  │                              │  │     嵌入的网页内容              │ │
│  │                              │  │     (webview/iframe)          │ │
│  │                              │  │                               │ │
│  │                              │  │                               │ │
│  │                              │ ◀│                               │ │
│  │                              │  │                               │ │
│  │                              │  │                               │ │
│  └──────────────────────────────┘  └───────────────────────────────┘ │
│                                                                      │
│  左侧 flex:1 (或 flex:0 0 320px)   右侧 width:55vw, min-width:400   │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 BrowserDrawer 收起状态

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌──── 任意左侧内容（全屏）─────────────────────────────────────────┐▶│
│  │                                                                  │ │
│  │  居中显示进度/内容/表单                                            │ │
│  │                                                                  │ │
│  │  （BrowserDrawer 收起，左侧获得全部空间）                           │ │
│  │                                                                  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3 多场景复用示例

**场景 A: WeChat Pipeline**
```
┌─ 左侧 ─────────────────┐ ┌─ BrowserDrawer ────────────┐
│ ⚠ 需要手动操作           │ │ dash.cloudflare.com/sign-up │
│ 请完成 Cloudflare 注册    │ │ ┌────────────────────────┐ │
│                          │ │ │ Cloudflare 注册表单      │ │
│ 步骤 1/5                 │ │ │ [☑ 真人验证 CAPTCHA]     │ │
└──────────────────────────┘ └────────────────────────────┘
```

**场景 B: ZeroToken DeepSeek 登录**
```
┌─ 左侧 ─────────────────┐ ┌─ BrowserDrawer ────────────┐
│ 🔑 登录 DeepSeek         │ │ chat.deepseek.com/login     │
│                          │ │ ┌────────────────────────┐ │
│ 登录后 ClaudeWiki 将      │ │ │ DeepSeek 登录页面       │ │
│ 自动获取你的 token        │ │ │ [用户名] [密码] [登录]   │ │
│                          │ │ │                        │ │
│ 支持的模型：              │ │ └────────────────────────┘ │
│ ✅ DeepSeek-V3           │ │                            │
│ ✅ DeepSeek-R1           │ │                            │
└──────────────────────────┘ └────────────────────────────┘
```

**场景 C: 素材原文预览**
```
┌─ 左侧 ─────────────────┐ ┌─ BrowserDrawer ────────────┐
│ Raw 素材详情              │ │ mp.weixin.qq.com/s/xxxxx    │
│                          │ │ ┌────────────────────────┐ │
│ Karpathy LLM Wiki 方法论 │ │ │                        │ │
│ 来源: 微信公众号          │ │ │  公众号文章原文          │ │
│ 摘要: ...                │ │ │  （webview 渲染）        │ │
│                          │ │ │                        │ │
│ [存入 Wiki] [删除]       │ │ └────────────────────────┘ │
└──────────────────────────┘ └────────────────────────────┘
```

---

## 六、实施计划

### Phase 1: 提取通用组件（从 Pipeline 中抽出）

| 任务 | 产出 |
|------|------|
| 创建 `src/components/BrowserDrawer.tsx` | 通用抽屉浏览器组件 |
| 添加 `browserDrawer` state 到 zustand | 全局状态管理 |
| 从 `ConnectWeChatPipelinePage` 中移除内嵌 drawer 代码 | 改为引用 BrowserDrawer |
| 更新 `ClawWikiShell` 挂载 BrowserDrawer | Shell 级渲染 |

### Phase 2: 与 ChatSidePanel 互斥

| 任务 | 产出 |
|------|------|
| ChatSidePanel 检测 BrowserDrawer 状态 | BrowserDrawer open 时自动隐藏 |
| BrowserDrawer close 时 ChatSidePanel 恢复 | 平滑过渡 |

### Phase 3: ZeroToken 场景接入

| 任务 | 产出 |
|------|------|
| ZeroToken 配置页调用 `openBrowser(url)` | DeepSeek/Qwen 登录 |
| URL 变化检测 → 自动提取 token | 登录成功检测 |

---

## 七、与 Codex 的统一心智模型

```
Codex 用户心智：
  "左边是 Agent 对话，右边是代码审阅"

ClaudeWiki 用户心智：
  "左边是 Wiki/对话/配置，右边是我需要操作的网页"

统一抽象：
  左侧 = 应用逻辑（对话、配置、进度）
  右侧 = 外部内容（代码、网页、预览）

  右侧面板是一个"窗口"，透过它看到外部世界。
  用户永远知道：需要我操作时它展开，不需要时它收起。
```
