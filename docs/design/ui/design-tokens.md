# ClawWiki v3.0 — 设计令牌系统

> 版本: v3.0
> 最后更新: 2026-04-15
> 来源: Claude Anthropic 暖羊皮纸调色板 + Rowboat 7 档 radius 工程 + shadcn 命名约定
> 策略: 全面迁移至 OkLCH 色彩空间，统一暖色基调，无任何冷色调灰

---

## 1. 设计哲学

ClawWiki v3 的视觉语言脱胎于 Claude (Anthropic) 的「温暖羊皮纸」美学 — 把产品界面当成一张优质纸张，而不是一块发光的屏幕。整个设计不再追求冷峻的科技感，而是像一本好书、一间书房：不慌不忙，克制而温和。

### 1.1 为什么选 OkLCH

我们放弃了 HSL / HEX 直写，全面改用 **OkLCH** 色彩空间作为令牌的第一表达：

- **感知均匀** — OkLCH 是基于 Oklab 的圆柱坐标表示，相同 L (lightness) 的颜色在人眼上看起来亮度也相同，这在 HSL 下永远做不到（HSL 的 L=50% 的黄色和蓝色亮度差异巨大）。
- **可推理的暖色微调** — 我们的暖色调需要在 L 几乎不变的前提下微调 C (chroma) 和 H (hue) 来获得「纸张温度」。OkLCH 允许我们写 `oklch(0.9660 0.0093 100.0)` 这样的数值，直接控制「亮度 96.6% / 色度 0.9% / 色相 100°（偏黄绿）」—— 一眼就知道它是「几乎无彩的暖色背景」。
- **暗色映射友好** — 深色主题下只需调整 L 通道，色相和色度保持一致，暗色版本的「温度感」就能自动传承下来。
- **现代浏览器原生支持** — CSS Color Module 4 已被所有主流浏览器原生实现，CSS 端无需任何转换。

### 1.2 为什么选暖羊皮纸

ClawWiki 是一个长期阅读 + 沉浸创作的工具。屏幕时间往往很长，视觉疲劳是首要敌人：

- **纯白背景 (#ffffff)** 在长时间阅读场景下会诱发眩光和视觉疲劳 —— 这是 v3 不会在任何地方出现纯白的根本原因。
- **羊皮纸底色 (Parchment `#f5f4ed`)** 在视觉上接近纸张在温暖室内灯光下的色温，大脑会把它识别为「这是纸」而不是「这是屏幕」，阅读状态更稳定。
- **暖色灰 (Olive Gray `#5e5d59` / Stone Gray `#87867f`)** 每一档灰都带有极轻微的黄-褐底色，和羊皮纸形成和谐的「同系色过渡」。

### 1.3「无冷色蓝灰」原则

这是 v3 最重要的硬规则 — **整个调色板中只允许一处冷色: Focus Blue (`#3898ec`)**，且仅用于输入框聚焦环 (ring) 的可访问性诉求。除此之外:

- ✗ 不允许 `oklch(0.97 0 0)` 这样「纯中性灰」（色度 = 0，无暖感）
- ✗ 不允许 `hsl(210 10% 50%)` 这样色相偏蓝的灰
- ✓ 所有灰都必须满足「色相 in [95°, 110°]（偏黄-绿-褐）且色度 ≥ 0.005（带极轻微彩度）」

这条规则让整个产品保持**陈述性的温度一致性**：用户在 300ms 的首印象内就能判断「这是一个暖的、安静的、不刺眼的工具」。

---

## 2. OkLCH 色板表

下表所有 OkLCH 数值与 `globals.css` 中的令牌定义**逐字符一致**，可直接 `diff` 核对。

### 2.1 浅色模式 (Light)

| 令牌 | OkLCH | Hex 近似 | 暖度描述 | 用途 |
|------|-------|---------|---------|------|
| `--background` | `oklch(0.9660 0.0093 100.0)` | `#f5f4ed` | 暖米黄羊皮调 Parchment | 页面主背景 |
| `--foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰 Charcoal Warm | 主要文本 |
| `--card` | `oklch(0.9818 0.0054 95.1)` | `#faf9f5` | 象牙白 Ivory | 卡片/容器表面 |
| `--card-foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰（同 foreground） | 卡片文本 |
| `--popover` | `oklch(0.9818 0.0054 95.1)` | `#faf9f5` | 象牙白 Ivory（**绝无纯白**） | 弹层背景 |
| `--popover-foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰 | 弹层文本 |
| `--primary` | `oklch(0.6171 0.1375 39.0)` | `#c96442` | 赤陶砖红 Terracotta | 主 CTA / 品牌色 |
| `--primary-foreground` | `oklch(0.9818 0.0054 95.1)` | `#faf9f5` | 象牙白 Ivory | Terracotta 上的文字 |
| `--secondary` | `oklch(0.9237 0.0135 97.5)` | `#e8e6dc` | 暖砂灰 Warm Sand | 次要按钮底 |
| `--secondary-foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰 | 次要按钮文字 |
| `--muted` | `oklch(0.9237 0.0135 97.5)` | `#e8e6dc` | 暖砂灰 Warm Sand | 静音区底色 |
| `--muted-foreground` | `oklch(0.4780 0.0064 95.2)` | `#5e5d59` | 橄榄灰 Olive Gray | 次要文本/描述 |
| `--accent` | `oklch(0.9237 0.0135 97.5)` | `#e8e6dc` | 暖砂灰 Warm Sand | 强调区底色 |
| `--accent-foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰 | 强调区文字 |
| `--destructive` | `oklch(0.5191 0.1669 25.1)` | `#b53333` | 深茜红 Crimson | 错误/危险状态 |
| `--border` | `oklch(0.9485 0.0109 95.2)` | `#f0eee6` | 米色边 Border Cream | 标准边框 |
| `--input` | `oklch(0.9237 0.0135 97.5)` | `#e8e6dc` | 暖砂边 Border Warm | 输入框边框 |
| `--ring` | `oklch(0.6634 0.1531 248.9)` | `#3898ec` | 聚焦蓝 Focus Blue（**全局唯一冷色**） | 输入聚焦环 |
| `--chart-1` | `oklch(0.6171 0.1375 39.0)` | `#c96442` | Terracotta | 图表主色 |
| `--chart-2` | `oklch(0.6800 0.1350 45.0)` | `#d97757` | 珊瑚橙 Coral | 图表第二色 |
| `--chart-3` | `oklch(0.7500 0.1200 80.0)` | `#d4a355` | 琥珀黄 Amber | 图表第三色 |
| `--chart-4` | `oklch(0.5800 0.0900 110.0)` | `#8a8a4d` | 橄榄绿 Olive | 图表第四色 |
| `--chart-5` | `oklch(0.5500 0.1400 50.0)` | `#a66438` | 赭石棕 Sienna | 图表第五色 |
| `--sidebar` | `oklch(0.9818 0.0054 95.1)` | `#faf9f5` | 象牙白 Ivory | 侧栏底 |
| `--sidebar-foreground` | `oklch(0.4161 0.0067 95.2)` | `#4d4c48` | 暖炭灰 | 侧栏文本 |
| `--sidebar-primary` | `oklch(0.6171 0.1375 39.0)` | `#c96442` | Terracotta | 侧栏活动项 |
| `--sidebar-accent` | `oklch(0.9237 0.0135 97.5)` | `#e8e6dc` | 暖砂灰 | 侧栏 hover |
| `--sidebar-border` | `oklch(0.9485 0.0109 95.2)` | `#f0eee6` | 米色边 | 侧栏分隔线 |

### 2.2 深色模式 (Dark)

| 令牌 | OkLCH | Hex 近似 | 暖度描述 | 用途 |
|------|-------|---------|---------|------|
| `--background` | `oklch(0.1908 0.0020 106.6)` | `#141413` | Anthropic 近黑 Near Black | 深色主背景 |
| `--foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 Warm Silver | 深色主文本 |
| `--card` | `oklch(0.3085 0.0035 106.6)` | `#30302e` | 深色表面 Dark Surface | 深色卡片 |
| `--card-foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 | 深色卡片文本 |
| `--popover` | `oklch(0.3085 0.0035 106.6)` | `#30302e` | 深色表面 Dark Surface | 深色弹层 |
| `--popover-foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 | 深色弹层文本 |
| `--primary` | `oklch(0.6171 0.1375 39.0)` | `#c96442` | Terracotta（**跨模式保持一致**） | 主 CTA |
| `--primary-foreground` | `oklch(0.9818 0.0054 95.1)` | `#faf9f5` | 象牙白 | Terracotta 上文字 |
| `--secondary` | `oklch(0.3590 0.0051 106.6)` | `#3a3a38` | 略亮表面 | 深色次要按钮 |
| `--secondary-foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 | 深色次按钮文字 |
| `--muted` | `oklch(0.3590 0.0051 106.6)` | `#3a3a38` | 略亮表面 | 深色静音区 |
| `--muted-foreground` | `oklch(0.6188 0.0104 100.1)` | `#87867f` | 石灰 Stone Gray | 深色次要文本 |
| `--accent` | `oklch(0.3590 0.0051 106.6)` | `#3a3a38` | 略亮表面 | 深色强调区 |
| `--accent-foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 | 深色强调文字 |
| `--destructive` | `oklch(0.5800 0.1669 25.1)` | `#cc4040` | 深色提亮 Crimson | 深色危险 |
| `--border` | `oklch(0.3085 0.0035 106.6)` | `#30302e` | 深色表面（= card） | 深色边框 |
| `--input` | `oklch(0.3590 0.0051 106.6)` | `#3a3a38` | 略亮表面 | 深色输入框 |
| `--ring` | `oklch(0.6634 0.1531 248.9)` | `#3898ec` | 聚焦蓝 Focus Blue | 深色聚焦环 |
| `--sidebar` | `oklch(0.3085 0.0035 106.6)` | `#30302e` | 深色表面 | 深色侧栏底 |
| `--sidebar-foreground` | `oklch(0.7499 0.0129 96.5)` | `#b0aea5` | 暖银灰 | 深色侧栏文本 |
| `--sidebar-primary` | `oklch(0.6171 0.1375 39.0)` | `#c96442` | Terracotta | 深色侧栏活动项 |
| `--sidebar-border` | `oklch(0.3085 0.0035 106.6)` | `#30302e` | 深色表面 | 深色侧栏分隔 |

---

## 3. Typography（字体系统）

### 3.1 字族（Font Family）

```css
--font-serif: 'Lora', Georgia, 'Times New Roman', serif;
--font-sans:  system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono:  ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
```

- **Lora Serif（标题专用）** — 一款带现代感的过渡型衬线字体（类似 Anthropic Serif），笔画粗细均衡，在 weight 500 下具有印刷书籍感。ClawWiki 所有 H1–H4 都用它。
- **System Sans（UI 专用）** — 使用系统默认字体以获得最佳原生渲染，避免额外字体请求。
- **System Mono（代码专用）** — 代码块、行内代码、技术数字。

### 3.2 字重（Weight）

| 用途 | Weight | 说明 |
|------|-------|------|
| Serif 标题 | **500** | 所有 Lora 标题统一用 500，**不允许 bold (700)**。单一字重创造「同一作者的语气」 |
| UI 正文 | 400 | 默认正文 |
| UI 强调 | 500 | 按钮、强调标签 |
| Code | 400 | 代码一律 400 |

### 3.3 字号与行高（Size & Line-Height）

| 角色 | 字号 | 字重 | 行高 | 字距 |
|------|------|------|------|------|
| Display / Hero | `4rem` (64px) | 500 Serif | **1.10** | normal |
| H1 (Section) | `3.25rem` (52px) | 500 Serif | **1.20** | normal |
| H2 (Subsection) | `2.3rem` (36.8px) | 500 Serif | **1.30** | normal |
| H3 | `2rem` (32px) | 500 Serif | 1.20 | normal |
| H4 | `1.6rem` (25.6px) | 500 Serif | 1.20 | normal |
| Feature Title | `1.3rem` (20.8px) | 500 Serif | 1.20 | normal |
| Body Large | `1.25rem` (20px) | 400 Sans | **1.60** | normal |
| Body Serif | `1.06rem` (17px) | 400 Serif | **1.60** | normal |
| Body | `1rem` (16px) | 400 Sans | **1.60** | normal |
| Body Small | `0.94rem` (15px) | 400 Sans | 1.60 | normal |
| Caption | `0.88rem` (14px) | 400 Sans | 1.43 | normal |
| Label | `0.75rem` (12px) | 500 Sans | 1.40 | 0.12px |
| Overline | `0.63rem` (10px) | 400 Sans | 1.60 | 0.5px |
| Code | `0.94rem` (15px) | 400 Mono | 1.60 | -0.32px |

### 3.4 设计原则

- **Serif 代表权威，Sans 代表实用** — 衬线字体承载所有内容型标题，给每个标题以「书名的分量」；无衬线字体承担所有功能性 UI。
- **衬线行高紧但不压迫（1.10–1.30）** — 衬线字母本身需要呼吸空间，过紧会让字体显「脏」。
- **正文行高慷慨（1.60）** — 远大于典型网页的 1.4–1.5，创造阅读一本书的沉浸感。
- **小号文字要加字距** — 12px 以下的 Sans 文字一律加 0.12px–0.5px 的 letter-spacing 维持可读性。

---

## 4. 圆角 7 档系统

继承 Rowboat 的工程化设计：以 `--radius` 为基础，用 `calc()` 派生 7 档，确保跨组件一致性。

```css
:root {
  --radius: 0.625rem; /* 10px 基准 */
  --radius-sm:  calc(var(--radius) - 4px);  /*  6px */
  --radius-md:  calc(var(--radius) - 2px);  /*  8px */
  --radius-lg:  var(--radius);               /* 10px */
  --radius-xl:  calc(var(--radius) + 4px);  /* 14px */
  --radius-2xl: calc(var(--radius) + 8px);  /* 18px */
  --radius-3xl: calc(var(--radius) + 12px); /* 22px */
  --radius-4xl: calc(var(--radius) + 16px); /* 26px */
}
```

### 4.1 各档用途

| 档位 | 值 | Tailwind 类 | 推荐用途 |
|------|----|----|---------|
| `--radius-sm` | 6px | `rounded-sm` | 最小内联元素（标签、徽章、小 chip） |
| `--radius-md` | 8px | `rounded-md` | 次级按钮、次级卡片、下拉菜单项 |
| `--radius-lg` | 10px | `rounded-lg` | **标准按钮、标准卡片**（默认层级） |
| `--radius-xl` | 14px | `rounded-xl` | 强调卡片、输入框、导航元素 |
| `--radius-2xl` | 18px | `rounded-2xl` | 特色容器、Tab 列表、弹窗 |
| `--radius-3xl` | 22px | `rounded-3xl` | 视频播放器、大图容器 |
| `--radius-4xl` | 26px | `rounded-4xl` | Hero 容器、Marketing 嵌入媒体 |

### 4.2 使用原则

- **绝不用尖角 (< 6px)** — Claude 体系的「柔软」性格要求最小圆角也要 6px。
- **单层内只用一档** — 一个卡片内部的按钮应比卡片本身小一档（例如 `--radius-xl` 卡片里放 `--radius-lg` 按钮）。
- **媒体内容走大半径** — 视频、图片、带截图的 Hero 用 22–26px 创造柔和的「信息岛」感。

---

## 5. 阴影系统

Claude 的招牌做法是**用 ring-based shadow 代替传统 drop shadow**。深度通过「像边框一样的光环」表达，而非投影。v3 严格禁止厚重的传统 drop shadow。

### 5.1 Shadow 令牌

```css
:root {
  /* Ring-based 暖色光环（唯一的主要阴影） */
  --shadow-warm-ring:       0 0 0 1px oklch(0.8533 0.0138 97.5); /* Ring Warm #d1cfc5 */
  --shadow-warm-ring-hover: 0 0 0 1px oklch(0.7800 0.0150 97.5); /* Ring Deep #c2c0b6 */

  /* 极柔软飘浮感（偶尔使用，仅限高光卡片） */
  --shadow-whisper: 0 4px 24px oklch(0 0 0 / 0.05);
}

.dark {
  --shadow-warm-ring:       0 0 0 1px oklch(0.3590 0.0051 106.6); /* #3a3a38 */
  --shadow-warm-ring-hover: 0 0 0 1px oklch(0.4161 0.0067 95.2);  /* Charcoal Warm #4d4c48 */
  --shadow-whisper:         0 4px 24px oklch(0 0 0 / 0.20);
}
```

### 5.2 深度层级

| 层级 | 处理 | 用途 |
|------|------|------|
| Level 0 (平面) | 无阴影、无边框 | Parchment 背景、内联文本 |
| Level 1 (有界) | 1px solid `--border` | 标准卡片静态态 |
| Level 2 (Ring) | `--shadow-warm-ring` | 按钮、交互卡片、hover 态 |
| Level 3 (Ring Hover) | `--shadow-warm-ring-hover` | 按钮 hover、活跃卡片 |
| Level 4 (Whisper) | `--shadow-whisper` | 高光产品截图、特色容器 |

### 5.3 设计哲学

- **Ring 阴影其实是「假装成边框的阴影」** — `0 0 0 1px` 让边界柔和得像一圈光晕，比真实 `border` 更少切割感。
- **极度克制的 Whisper drop** — 当必须用投影时，0.05 不透明度 + 24px 模糊 = 几乎看不见的飘浮。
- **禁止的做法**:
  - ✗ `box-shadow: 0 10px 20px rgba(0,0,0,0.3)` （过厚）
  - ✗ `box-shadow: 0 0 0 2px cool-gray` （冷色环）
  - ✗ Material Design 风格的多层阴影

---

## 6. 间距（Spacing）

### 6.1 基础

**8px 基准**，沿用 Tailwind 标准 scale：

| Token | 值 | Tailwind | 典型场景 |
|-------|----|---------|---------|
| `space-0.5` | 2px | `p-0.5` | 极紧凑徽章内填充 |
| `space-1` | 4px | `p-1` | 图标间隙 |
| `space-1.5` | 6px | `p-1.5` | 小按钮垂直 padding |
| `space-2` | 8px | `p-2` | 默认内填充单位 |
| `space-3` | 12px | `p-3` | 标准按钮水平 padding |
| `space-4` | 16px | `p-4` | 标准卡片内填充 |
| `space-5` | 20px | `p-5` | 次级卡片内填充 |
| `space-6` | 24px | `p-6` | **标准卡片内填充（默认）** |
| `space-8` | 32px | `p-8` | 特色卡片内填充 |
| `space-10` | 40px | `p-10` | 大区块内填充 |
| `space-12` | 48px | `p-12` | Hero 区块 |
| `space-16` | 64px | `p-16` | Section 纵向间距 |
| `space-20` | 80px | `p-20` | Section 间大间距 |
| `space-24` | 96px | `p-24` | Chapter 级别分隔 |

### 6.2 排版留白哲学

- **Editorial Pacing（编辑节奏）** — 每个 Section 像杂志内页一样呼吸：上下 80–120px 的 margin 创造自然的阅读停顿。
- **Serif-driven Rhythm** — 衬线标题自带权威感，需要比无衬线设计更大的留白来匹配这种「文学语气」。
- **Content Island（内容岛）** — Section 之间用 light/dark 交替 + 大间距创造「章节」感，像书一样可以翻。
- **按钮内填充可非对称** — 带图标的按钮允许 `0 12px 0 8px`（图标侧少一点），保持视觉平衡。
- **卡片标配 24px** — 标准卡片默认 `p-6` (24px) 内填充；特色卡片用 `p-8` (32px)。

---

## 7. 动画（Animation）

设计原则：**Hover 要温和，Focus 要即时，绝不花哨**。

### 7.1 Motion Tokens

```css
:root {
  /* 缓动函数 */
  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);   /* 柔和落定 */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);   /* 标准平滑 */
  --ease-linear: linear;                          /* 渐变专用 */

  /* 时长 */
  --duration-instant: 0ms;      /* Focus ring / 紧急反馈 */
  --duration-fast:    150ms;    /* Hover 颜色过渡 */
  --duration-normal:  200ms;    /* Hover 位移 / 透明度 */
  --duration-slow:    300ms;    /* 展开折叠 */
  --duration-page:    400ms;    /* 页面切换 */
}
```

### 7.2 标准过渡

| 交互 | Duration | Easing | 说明 |
|------|---------|--------|------|
| 按钮颜色 hover | 150ms | `--ease-out` | 快速反馈 |
| 按钮位移/缩放 | 200ms | `--ease-out` | 温和的 lift |
| Tab / Tooltip 显示 | 200ms | `--ease-out` | 柔和落定 |
| 展开折叠面板 | 300ms | `--ease-in-out` | 自然伸缩 |
| Focus ring | **0ms（即时）** | — | 可访问性诉求：不能有延迟 |
| 页面切换淡入 | 400ms | `--ease-out` | 大尺度变化 |

### 7.3 设计原则

- **没有浮夸效果** — 不允许 bounce、spring overshoot、shake、grain-sweep 等炫技动画。Claude 的品格是安静。
- **Hover 只做三件事** — 颜色变化、阴影变化、极轻微位移（≤ 2px），绝不做大尺度移动。
- **Focus 绝对即时** — 键盘用户依赖聚焦环立即出现，任何 delay 都是可访问性问题。
- **尊重 `prefers-reduced-motion`** — 所有动画在用户系统偏好下应退化为 0ms（色值切换除外）。

---

## 8. 暗色模式

### 8.1 映射表（Light → Dark）

| 令牌 | Light | Dark | 变化说明 |
|------|-------|------|---------|
| `--background` | Parchment `#f5f4ed` | Near Black `#141413` | 主背景反转 |
| `--foreground` | Charcoal Warm `#4d4c48` | Warm Silver `#b0aea5` | 主文本反转 |
| `--card` | Ivory `#faf9f5` | Dark Surface `#30302e` | 卡片背景反转 |
| `--popover` | Ivory `#faf9f5` | Dark Surface `#30302e` | 弹层反转 |
| `--primary` | Terracotta `#c96442` | Terracotta `#c96442` | **保持不变（品牌统一）** |
| `--secondary` / `--accent` / `--muted` | Warm Sand `#e8e6dc` | Dark Variant `#3a3a38` | 反转但维持暖色 |
| `--muted-foreground` | Olive Gray `#5e5d59` | Stone Gray `#87867f` | 次要文本反转 |
| `--border` | Border Cream `#f0eee6` | Dark Surface `#30302e` | 反转为深色 |
| `--destructive` | Crimson `#b53333` | Brighter Crimson（L 提升到 0.58） | 深色提亮以保证可见性 |
| `--ring` | Focus Blue `#3898ec` | Focus Blue `#3898ec` | **保持不变（可访问性）** |

### 8.2 跨模式保持不变的

- **Terracotta 品牌色 `oklch(0.6171 0.1375 39.0)`** — 贯穿 light/dark 两种模式，是 ClawWiki 的视觉 signature。Terracotta 在暖黑和暖白背景下都保持温暖，无需调整。
- **Focus Blue `oklch(0.6634 0.1531 248.9)`** — 全局唯一冷色，两种模式下相同值，以保证键盘用户的聚焦反馈跨主题一致。
- **所有色相值（Hue）** — 所有灰都保持在 95°–110°（黄-褐区间）。暗色模式下只调 L，不换 H。

### 8.3 跨模式调整的

- **L (Lightness) 大幅反转** — 0.96 → 0.19（背景），0.42 → 0.75（文本）。
- **C (Chroma) 微调** — 深色下某些灰的 chroma 略低（0.0035 vs 0.0093），因为深色下高饱和会显脏。
- **Destructive 在深色下亮度 +0.06** — Crimson 在深色背景下需要提亮才能保证 4.5:1 对比度。
- **Shadow 不透明度翻 4 倍** — light 的 whisper 是 0.05 alpha，dark 是 0.20，以在深色下仍然可见。

---

## 9. v2 → v3 差异表（迁移指南）

这一节为正在迁移的下游代码提供**逐项映射**，以及破坏性变更的告警。

### 9.1 令牌命名变化（shadcn 约定）

| v2 令牌 | v3 令牌 | 变更类型 | 备注 |
|---------|---------|---------|------|
| `var(--color-background)` | `var(--background)` | 🔄 重命名 | 去掉 `color-` 前缀，遵循 shadcn 约定 |
| `var(--color-foreground)` | `var(--foreground)` | 🔄 重命名 | 同上 |
| `var(--color-card)` | `var(--card)` | 🔄 重命名 | 同上 |
| `var(--color-primary)` | `var(--primary)` | 🔄 重命名 | 值也变更（见下） |
| `var(--color-muted-foreground)` | `var(--muted-foreground)` | 🔄 重命名 | 同上 |
| `var(--color-border)` | `var(--border)` | 🔄 重命名 | 同上 |
| `var(--color-sidebar-background)` | `var(--sidebar)` | 🔄 + 简化 | 去掉冗余的 `-background` |
| `var(--color-sidebar-foreground)` | `var(--sidebar-foreground)` | 🔄 重命名 | 同上 |

**迁移脚本建议**:
```bash
# 批量替换（先在分支上试跑）
rg -l 'var\(--color-' src/ | xargs sed -i 's/var(--color-/var(--/g'
```

### 9.2 色值变化（v2 HEX → v3 OkLCH）

| 角色 | v2 值 | v3 值 | 变化本质 |
|------|-------|-------|---------|
| Primary 品牌色 | `#C35A2C`（烧陶橙） | `#c96442` (`oklch(0.6171 0.1375 39.0)`) Terracotta | 更亮、更橙、更暖 |
| 主背景 | `#FAF9F6` | `#f5f4ed` (`oklch(0.9660 0.0093 100.0)`) | 更偏米黄，色度增加 |
| 次要灰 v2 类似 | `oklch(0.97 0 0)` 冷中性 | `oklch(0.9237 0.0135 97.5)` Warm Sand | **从冷中性灰 → 带 chroma 的暖灰** |
| 主文本 | `#2D2B28` | `#4d4c48` (`oklch(0.4161 0.0067 95.2)`) | L 提升，更柔和不刺眼 |
| Destructive | `#D44A3C` | `#b53333` (`oklch(0.5191 0.1669 25.1)`) | 更深、更稳重 |

**关键变化**: v2 用过 `oklch(0.97 0 0)` 这样的**纯中性灰**（chroma = 0）；v3 要求**所有灰都带 ≥ 0.005 的 chroma**，通过色度 + 色相一起表达暖感。

### 9.3 硬编码颜色必须迁移

| v2 写法 | v3 写法 | 说明 |
|---------|---------|------|
| `#fff` / `#ffffff` / `bg-white` | `bg-card` 或 `bg-background` | **纯白在 v3 不存在** |
| `bg-black` / `#000` | `bg-foreground`（浅色）或 `bg-background`（深色） | Near Black `#141413` 代替纯黑 |
| `text-gray-500` | `text-muted-foreground` | Tailwind gray 是冷色 → 必须改语义令牌 |
| `text-gray-700` | `text-foreground` | 同上 |
| `text-gray-400` | `text-muted-foreground` | 同上 |
| `border-gray-200` | `border-border` | 同上 |
| `bg-gray-50` | `bg-muted` 或 `bg-secondary` | 同上 |
| `bg-gray-100` | `bg-muted` | 同上 |
| `shadow-sm` / `shadow-md` | `shadow-warm-ring` | 冷色 drop shadow → 暖色 ring |
| `shadow-lg` / `shadow-xl` | `shadow-warm-ring-hover` 或 `shadow-whisper` | 同上 |

### 9.4 新增工具类（Phase 2 加入）

```css
/* 在 globals.css / tailwind plugin 中定义 */
.shadow-warm-ring       { box-shadow: var(--shadow-warm-ring); }
.shadow-warm-ring-hover { box-shadow: var(--shadow-warm-ring-hover); }
.shadow-whisper         { box-shadow: var(--shadow-whisper); }
```

使用示例:
```tsx
<button className="bg-secondary text-secondary-foreground shadow-warm-ring hover:shadow-warm-ring-hover transition-shadow duration-150">
  次要按钮
</button>
```

### 9.5 破坏性变更（Breaking Notes）

1. **所有 `var(--color-*)` 令牌名失效** — 必须全局替换为 `var(--*)`（无 `color-` 前缀）。Tailwind theme 映射层（`@theme inline`）会把 `--color-*` 映射成 `--*`，不要再手写 `--color-` 版本。
2. **`theme-deeptutor` class 命名空间废除** — v2 的 `.theme-deeptutor` 选择器不再使用。v3 色值直接挂在 `:root` 和 `.dark` 下。
3. **DeepTutor 补充令牌移除** — `--deeptutor-ok` / `--deeptutor-warn` 等业务语义令牌整合进 chart palette，或用 destructive/primary 的衍生色表达。
4. **所有硬编码 `#hex` 必须审计** — 通过 `rg '#[0-9a-fA-F]{3,6}'` 找出，然后映射到最近的语义令牌。
5. **Primary 色值微调** — 从 `#C35A2C` (烧陶橙) 改为 `#c96442` (Terracotta)，**更亮一档**。下游 UI 对比度测试需要复跑。
6. **Focus Blue 是全局唯一允许的冷色** — 任何其他组件若使用冷蓝灰必须替换。

### 9.6 迁移检查清单

- [ ] 全局替换 `var(--color-*)` → `var(--*)`
- [ ] 搜索所有 `#[0-9a-f]{3,6}` 硬编码色值并映射到语义令牌
- [ ] 搜索 `bg-white` / `text-white` / `bg-black` / `text-black` 并改语义令牌
- [ ] 搜索 `text-gray-*` / `bg-gray-*` / `border-gray-*` 并改语义令牌
- [ ] 搜索 `shadow-sm/md/lg/xl/2xl` 并评估是否需要改为 `shadow-warm-ring*`
- [ ] 验证所有 Primary CTA 在新 Terracotta 值下仍满足 WCAG AA 对比度
- [ ] Dark mode 截图跑一轮，确认 Destructive 在深色下可见性
- [ ] 更新 Storybook / 组件库文档的色值引用

---

> 本文档的所有 OkLCH 数值与 `apps/desktop-shell/src/styles/globals.css` 中的令牌逐字符一致，可由 review agent 用 `diff` 直接校验。
