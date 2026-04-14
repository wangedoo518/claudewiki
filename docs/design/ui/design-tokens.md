# ClawWiki v2.0 -- 设计令牌系统

> 版本: v2.0-draft  
> 最后更新: 2026-04-14  
> 来源: ClawWiki `globals.css` theme-deeptutor 色板 + Rowboat `App.css` 令牌体系  
> 策略: 保留 DeepTutor 暖色基调，融入 Rowboat 的毛玻璃/动画/图谱令牌

---

## 1. 色板 (Color Palette)

### 1.1 基础色 (DeepTutor 暖色调，保留)

从 `globals.css` `.theme-deeptutor` 精确提取:

| 令牌名                  | 浅色模式                       | 深色模式                       | 说明          |
| ----------------------- | ------------------------------ | ------------------------------ | ------------- |
| `--color-background`    | `#FAF9F6` rgb(250,249,246)     | `#1A1915` rgb(26,25,21)        | 纸色/浓缩咖啡 |
| `--color-foreground`    | `#2D2B28` rgb(45,43,40)        | `#E8E4DE` rgb(232,228,222)     | 炭色/暖白     |
| `--color-card`          | `#FFFFFF` rgb(255,255,255)     | `#252320` rgb(37,35,32)        | 卡片背景      |
| `--color-card-foreground`| `#2D2B28` rgb(45,43,40)       | `#E8E4DE` rgb(232,228,222)     | 卡片文字      |
| `--color-primary`       | `#C35A2C` rgb(195,90,44)       | `#D4734B` rgb(212,115,75)      | 烧陶橙        |
| `--color-primary-foreground` | `#FFFFFF`                 | `#1A1915`                      | 主色上文字    |
| `--color-secondary`     | `#F0EDE7` rgb(240,237,231)     | `#2C2925` rgb(44,41,37)        | 次要背景      |
| `--color-muted`         | `#F0EDE7` rgb(240,237,231)     | `#2C2925` rgb(44,41,37)        | 静音背景      |
| `--color-muted-foreground`| `#8B8580` rgb(139,133,128)   | `#9A9489` rgb(154,148,137)     | 静音文字      |
| `--color-accent`        | `#E8E4DE` rgb(232,228,222)     | `#3A3733` rgb(58,55,51)        | 强调背景      |
| `--color-border`        | `#E8E4DE` rgb(232,228,222)     | `#3A3733` rgb(58,55,51)        | 边框色        |
| `--color-input`         | `#E8E4DE` rgb(232,228,222)     | `#3A3733` rgb(58,55,51)        | 输入框边框    |
| `--color-ring`          | `#C35A2C` rgb(195,90,44)       | `#D4734B` rgb(212,115,75)      | 焦点光环      |
| `--color-destructive`   | `#D44A3C` rgb(212,74,60)       | `#FF6B5C` rgb(255,107,92)      | 危险色        |

### 1.2 侧栏色

| 令牌名                         | 浅色模式                       | 深色模式                       |
| ------------------------------ | ------------------------------ | ------------------------------ |
| `--color-sidebar-background`   | `#F6F3EE` rgb(246,243,238)     | `#211F1B` rgb(33,31,27)        |
| `--color-sidebar-foreground`   | `#5A5753` rgb(90,87,83)        | `#9A9489` rgb(154,148,137)     |
| `--color-sidebar-primary`      | `#C35A2C` rgb(195,90,44)       | `#D4734B` rgb(212,115,75)      |
| `--color-sidebar-accent`       | `#E8E4DE` rgb(232,228,222)     | `#3A3733` rgb(58,55,51)        |
| `--color-sidebar-border`       | `#DBD6CD` rgb(219,214,205)     | `#3A3733` rgb(58,55,51)        |

### 1.3 语义色 (DeepTutor 补充令牌)

| 令牌名                | 浅色模式                       | 深色模式                       | 用途            |
| --------------------- | ------------------------------ | ------------------------------ | --------------- |
| `--deeptutor-ok`      | `#3F8F5E` rgb(63,143,94)       | `#5FB47D` rgb(95,180,125)      | Success 成功    |
| `--deeptutor-ok-soft` | `rgba(63,143,94, 0.12)`        | `rgba(95,180,125, 0.16)`       | Success 软背景  |
| `--deeptutor-warn`    | `#C88B1A` rgb(200,139,26)      | `#ECB246` rgb(236,178,70)      | Warning 警告    |
| `--deeptutor-warn-soft`| `rgba(200,139,26, 0.14)`      | `rgba(236,178,70, 0.18)`       | Warning 软背景  |
| `--deeptutor-danger`  | `#D44A3C` rgb(212,74,60)       | `#FF6B5C` rgb(255,107,92)      | Error 错误      |
| `--deeptutor-danger-soft`| `rgba(212,74,60, 0.14)`     | `rgba(255,107,92, 0.18)`       | Error 软背景    |
| `--deeptutor-wechat`  | `#07C160` rgb(7,193,96)        | `#34D682` rgb(52,214,130)      | 微信官方绿      |
| `--deeptutor-wechat-soft`| `rgba(7,193,96, 0.12)`      | `rgba(52,214,130, 0.18)`       | 微信软背景      |
| `--deeptutor-purple`  | `#8B5CF6` rgb(139,92,246)      | `#A783FF` rgb(167,131,255)     | 特殊/记忆色     |
| `--deeptutor-purple-soft`| `rgba(139,92,246, 0.10)`    | `rgba(167,131,255, 0.16)`      | 特殊软背景      |

### 1.4 图谱节点色 (Rowboat HSL 风格)

ClawWiki ForceGraph 已精确复刻 Rowboat 的 HSL 调色方案。
深色模式 lightness 提升 8% 以保持可读性。

| 类别      | 浅色模式 HSL                | 深色模式 HSL                | 色值 (浅色)  |
| --------- | --------------------------- | --------------------------- | ------------ |
| People    | `hsl(210, 72%, 52%)`       | `hsl(210, 72%, 60%)`       | `#3380CC`    |
| Concept   | `hsl(28, 78%, 52%)`        | `hsl(28, 78%, 60%)`        | `#D47723`    |
| Topic     | `hsl(280, 70%, 56%)`       | `hsl(280, 70%, 64%)`       | `#A346D1`    |
| Compare   | `hsl(55, 80%, 52%)`        | `hsl(55, 80%, 58%)`        | `#CCC025`    |
| Raw       | `hsl(220, 8%, 55%)`        | `hsl(220, 8%, 62%)`        | `#878A90`    |

每个节点同时有 `stroke` 色 (边框), 为 `color` 的暗化版 (lightness -15%):

| 类别      | stroke 浅色              | stroke 深色              |
| --------- | ------------------------ | ------------------------ |
| People    | `hsl(210, 72%, 37%)`    | `hsl(210, 72%, 45%)`    |
| Concept   | `hsl(28, 78%, 37%)`     | `hsl(28, 78%, 45%)`     |
| Topic     | `hsl(280, 70%, 41%)`    | `hsl(280, 70%, 49%)`    |
| Compare   | `hsl(55, 80%, 37%)`     | `hsl(55, 80%, 43%)`     |
| Raw       | `hsl(220, 8%, 40%)`     | `hsl(220, 8%, 47%)`     |

### 1.5 Ask 对话色 (继承 theme-deeptutor)

| 令牌名                    | 浅色模式                       | 深色模式                       |
| ------------------------- | ------------------------------ | ------------------------------ |
| `--claude-orange`         | `#C35A2C` rgb(195,90,44)       | `#D4734B` rgb(212,115,75)      |
| `--claude-orange-shimmer` | `#D4734B` rgb(212,115,75)      | `#E88B64` rgb(232,139,100)     |
| `--color-msg-user-bg`     | `oklch(0.25 0.01 50)`          | `oklch(0.85 0.01 50)`          |
| `--color-msg-assistant-bg`| `transparent`                  | `transparent`                  |
| `--color-label-claude`    | `#C35A2C`                      | `#D4734B`                      |

---

## 2. 字体 (Typography)

### 2.1 字体族

从 `globals.css` `.theme-deeptutor` 精确提取:

| 令牌名                     | 值                                                                    | 用途            |
| -------------------------- | --------------------------------------------------------------------- | --------------- |
| `--font-family-dt-sans`    | `"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Segoe UI", Roboto, sans-serif` | 正文、UI 元素   |
| `--font-family-dt-serif`   | `"Lora", Georgia, "Songti SC", serif`                                  | 标题、wiki 页标题 |
| `--font-family-dt-mono`    | `"JetBrains Mono", "Cascadia Code", "SF Mono", Consolas, monospace`    | 代码块、终端     |

### 2.2 字号比例

从 `globals.css` `@theme` 字号定义精确提取:

| 令牌名          | 字号  | Tailwind 类      | 用途                              |
| --------------- | ----- | ----------------- | --------------------------------- |
| `--font-size-micro`    | 8px   | `text-micro`     | 极少使用，最小 UI 元素            |
| `--font-size-nano`     | 9px   | `text-nano`      | 微型标签、快捷键提示              |
| `--font-size-caption`  | 10px  | `text-caption`   | 元数据、时间戳、badge 数字        |
| `--font-size-label`    | 11px  | `text-label`     | 最常用: UI chrome、侧栏项        |
| `--font-size-body-sm`  | 12px  | `text-body-sm`   | 按钮、设置行、文件树节点          |
| `--font-size-body`     | 13px  | `text-body`      | 主要内容文字                      |
| `--font-size-subhead`  | 14px  | `text-subhead`   | 区段标题                          |
| `--font-size-head`     | 15px  | `text-head`      | wiki 正文 (偏大以增强可读性)      |

**扩展比例 (v2.0 新增, 不影响现有):**

| 名称     | 字号  | 用途                     |
| -------- | ----- | ------------------------ |
| title    | 18px  | 仪表盘页标题 (serif)     |
| display  | 24px  | wiki 文章标题 (serif)    |

### 2.3 行高

| 场景           | 行高   | 适用                    |
| -------------- | ------ | ----------------------- |
| UI chrome      | 1.2    | 标签、badge、按钮        |
| 紧凑正文       | 1.4    | 侧栏项、表格单元格      |
| 标准正文       | 1.5    | body (13px)、Chat 气泡   |
| 宽松正文       | 1.7    | wiki 文章正文 (15px)     |
| 标题           | 1.3    | display (24px)           |

### 2.4 字重

| 值    | 用途                                    |
| ----- | --------------------------------------- |
| 400   | 正文、文件树文件节点                    |
| 500   | 中等: badge、工具提示、搜索结果标题     |
| 600   | 半粗: 标题、文件夹名、统计数字、按钮    |

---

## 3. 间距 (Spacing)

### 3.1 基础单元

基础间距单元: **4px**

### 3.2 间距比例

| 步进  | 值    | 常见用途                          |
| ----- | ----- | --------------------------------- |
| 1     | 4px   | 图标与文字间距、内联元素 gap       |
| 2     | 8px   | 紧凑消息间距、按钮内边距          |
| 3     | 12px  | 标准元素间距、卡片内间距          |
| 4     | 16px  | 文件树缩进、代码块内边距          |
| 5     | 20px  | 卡片内边距 (StatCard)             |
| 6     | 24px  | 页面内边距、区段间距              |
| 8     | 32px  | 大区段间距、wiki 文章水平边距     |
| 10    | 40px  | 顶栏高度                          |
| 12    | 48px  | 反链区顶部间距                    |
| 16    | 64px  | (保留)                             |

### 3.3 场景化间距

| 场景               | 值         | 说明                      |
| ------------------ | ---------- | ------------------------- |
| 组件内边距         | 8-16px     | 按紧凑度选择              |
| 区段间距           | 24-32px    | 页面内大块之间            |
| 页面外边距 (桌面)  | 24px       | 左右 padding              |
| 页面外边距 (小屏)  | 16px       | <1024px 时缩小            |
| TabBar 内部        | 0px 垂直   | items-stretch 撑满高度    |
| 消息间距 (主对话)  | 12px       | Ask 页面标准              |
| 消息间距 (侧面板)  | 8px        | 右侧 Chat 面板紧凑        |

---

## 4. 圆角 (Border Radius)

### 4.1 圆角比例

从 Rowboat `App.css` 和 ClawWiki 组件实践综合:

| 令牌名  | 值       | Tailwind           | 用途                            |
| ------- | -------- | ------------------ | ------------------------------- |
| xs      | 4px      | `rounded-xs`       | badge、内联标签、type badge      |
| sm      | 6px      | `rounded-sm`       | 按钮、输入框、tooltip            |
| md      | 8px      | `rounded-md` / `rounded-lg` | 卡片、搜索栏、代码块  |
| lg      | 12px     | `rounded-xl`       | 模态框、面板、StatCard           |
| xl      | 16px     | `rounded-2xl`      | Hero 区段 (保留)                 |
| full    | 9999px   | `rounded-full`     | 头像、进度条、badge 计数、发送按钮 |

### 4.2 Rowboat 基础半径

Rowboat `App.css` 定义 `--radius: 0.625rem` (10px) 作为基础值:

```css
--radius-sm: calc(var(--radius) - 4px);   /* 6px */
--radius-md: calc(var(--radius) - 2px);   /* 8px */
--radius-lg: var(--radius);                /* 10px */
--radius-xl: calc(var(--radius) + 4px);    /* 14px */
```

ClawWiki 沿用相同 `--radius: 0.625rem` 基础值。

---

## 5. 阴影 (Shadows)

### 5.1 DeepTutor 暖色调阴影

从 `globals.css` `--deeptutor-shadow-*` 精确提取:

| 令牌名                   | 值                                              | 用途              |
| ------------------------ | ----------------------------------------------- | ----------------- |
| `--deeptutor-shadow-sm`  | `0 1px 3px rgba(45,43,40,0.04), 0 1px 2px rgba(45,43,40,0.06)` | 卡片、下拉菜单 |
| `--deeptutor-shadow-md`  | `0 4px 12px -2px rgba(45,43,40,0.10), 0 2px 4px rgba(45,43,40,0.04)` | 弹出层、悬停卡片 |
| `--deeptutor-shadow-lg`  | `0 20px 50px -16px rgba(45,43,40,0.20), 0 4px 12px rgba(45,43,40,0.06)` | 模态框、搜索面板 |

注意: 阴影色使用 `rgba(45,43,40,...)` 而非纯黑，保持暖色调一致。

### 5.2 图谱辉光阴影

| 令牌名      | 值                          | 用途              |
| ----------- | --------------------------- | ----------------- |
| glow        | `0 0 10px {node_color}`     | 图谱节点 hover    |

图谱节点使用 SVG `feGaussianBlur` 滤镜实现辉光效果:
```xml
<filter id="glow-{color}">
  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
  <feMerge>
    <feMergeNode in="coloredBlur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

---

## 6. 动画 (Animation)

### 6.1 持续时间

| 令牌名    | 值     | 用途                                   |
| --------- | ------ | -------------------------------------- |
| instant   | 100ms  | 开关切换、toggle                       |
| fast      | 150ms  | hover 状态、关闭按钮透明度             |
| normal    | 200ms  | 标准过渡、opacity、面板宽度、Tab 切换  |
| slow      | 300ms  | 面板滑动、进度条填充                    |

### 6.2 缓动函数

| 令牌名     | 值                                      | 用途              |
| ---------- | --------------------------------------- | ----------------- |
| spring     | `cubic-bezier(0.34, 1.56, 0.64, 1)`    | 弹性入场动画      |
| ease-out   | `cubic-bezier(0.16, 1, 0.3, 1)`        | 滑动动画          |
| ease-linear| `linear`                                | 面板宽度过渡      |

Rowboat `ChatSidebar` 使用 `duration-200 ease-linear` 作为面板宽度过渡。

### 6.3 图谱浮动动画 (Rowboat 精确复刻)

从 Rowboat `graph-view.tsx` 和 ClawWiki `ForceGraph.tsx` 精确提取:

| 常量               | 值       | 说明                      |
| ------------------ | -------- | ------------------------- |
| `FLOAT_BASE`       | 3.5      | 浮动振幅基础值 (px)       |
| `FLOAT_VARIANCE`   | 2        | 振幅随机范围              |
| `FLOAT_SPEED_BASE` | 0.0006   | 浮动速度基础值            |
| `FLOAT_SPEED_VARIANCE` | 0.00025 | 速度随机范围          |

浮动算法:
```
phase = seed.phase + time * seed.speed
x_offset = sin(phase) * seed.amplitude
y_offset = cos(phase * 0.9) * seed.amplitude
```

### 6.4 图谱物理引擎 (Rowboat 精确复刻)

| 常量               | 值       | 说明                      |
| ------------------ | -------- | ------------------------- |
| `SIMULATION_STEPS` | 240      | 模拟步数                  |
| `SPRING_LENGTH`    | 80       | 弹簧自然长度 (px)         |
| `SPRING_STRENGTH`  | 0.0038   | 弹簧强度                  |
| `REPULSION`        | 5800     | 排斥力常数                |
| `DAMPING`          | 0.83     | 阻尼系数                  |
| `MIN_DISTANCE`     | 34       | 最小节点距离 (px)         |
| `CLUSTER_STRENGTH` | 0.0018   | 聚类吸引力                |
| `CLUSTER_RADIUS_MIN`| 120     | 聚类最小半径 (px)         |
| `CLUSTER_RADIUS_MAX`| 240     | 聚类最大半径 (px)         |
| `CLUSTER_RADIUS_STEP`| 45     | 聚类半径步进 (px)         |

### 6.5 CSS 关键帧动画 (已在 globals.css 中定义)

| 动画名                | 描述                    | 参数                    |
| --------------------- | ----------------------- | ----------------------- |
| `shimmer`             | 流式加载闪烁            | 1.5s ease-in-out infinite |
| `slide-up`            | 命令面板弹出            | 0.15s ease-out          |
| `fade-in`             | 页面切换淡入            | 0.2s ease-out           |
| `dt-border-pulse`     | 流式消息左边框脉动      | 2s ease-in-out infinite |
| `ask-shimmer-flow`    | 文字流光效果            | 1.5s linear infinite    |
| `ask-blink`           | 块状光标闪烁            | 0.8s steps(2) infinite  |

---

## 7. 层级 (Z-Index)

| 令牌名    | 值   | 用途                                      |
| --------- | ---- | ----------------------------------------- |
| base      | 0    | 正常文档流                                |
| dropdown  | 10   | 下拉菜单、popover                         |
| sticky    | 20   | 图谱图例、搜索栏、文件树搜索 sticky       |
| overlay   | 30   | 响应式抽屉 overlay 背景                    |
| sidebar   | 35   | 响应式抽屉侧栏 (在 overlay 上)             |
| modal     | 50   | 模态对话框、Cmd+K 搜索面板                |
| toast     | 100  | 消息提示 (sonner toast)                   |

---

## 8. 毛玻璃 (Glassmorphism) -- Rowboat 风格

### 8.1 基础令牌

| 令牌名                     | 浅色模式                           | 深色模式                           |
| -------------------------- | ---------------------------------- | ---------------------------------- |
| `--glass-bg`               | `rgba(255, 255, 255, 0.65)`        | `rgba(37, 35, 32, 0.65)`          |
| `--glass-border`           | `rgba(255, 255, 255, 0.18)`        | `rgba(255, 255, 255, 0.06)`       |
| `--glass-blur`             | `backdrop-filter: blur(12px) saturate(1.4)` | 同左                        |

深色模式使用 `rgba(37, 35, 32, ...)` (DeepTutor espresso #252320) 而非纯黑。

### 8.2 应用场景

| 组件              | 背景                    | 边框                    | 滤镜                |
| ----------------- | ----------------------- | ----------------------- | ------------------- |
| 图谱图例          | `--glass-bg`            | `border-border/80`      | `backdrop-blur`     |
| 图谱搜索栏        | Input 默认 + `shadow-lg` | Input 默认             | `backdrop-blur`     |
| SkillProgressCard | `--glass-bg`            | `--glass-border`        | `--glass-blur`      |
| 浮动面板          | `--glass-bg`            | `--glass-border`        | `--glass-blur`      |
| Chat Composer 遮罩 | 渐变 `from-background to-transparent` | 无 | 无                  |

### 8.3 Rowboat 参考值

Rowboat `graph-view.tsx` 图例面板:
```
className="bg-background/90 ... backdrop-blur"
```

Rowboat `App.css` 点阵画布:
```css
.onboarding-dot-grid {
  background-image: radial-gradient(circle, oklch(0.5 0 0 / 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

---

## 9. 暗色模式

### 9.1 切换机制

```html
<html class="theme-deeptutor dark">
```

- 在 `<html>` 元素上添加 `.dark` class
- Tailwind 自定义变体: `@custom-variant dark (&:is(.dark *));`
- 所有 CSS 变量通过 `.theme-deeptutor.dark` 选择器自动翻转
- ThemeProvider 组件管理状态，持久化到 settings-store

### 9.2 色值翻转规则

| 属性           | 浅色模式         | 深色模式         | 变化                |
| -------------- | ---------------- | ---------------- | ------------------- |
| Background     | 高亮 (#FAF9F6)   | 低亮 (#1A1915)   | 反转                |
| Foreground     | 低亮 (#2D2B28)   | 高亮 (#E8E4DE)   | 反转                |
| Primary        | 标准 (#C35A2C)   | 提亮 (#D4734B)   | lightness +10       |
| Border         | 浅色 (#E8E4DE)   | 深色 (#3A3733)   | 反转                |
| Muted          | 浅灰 (#F0EDE7)   | 深灰 (#2C2925)   | 反转                |
| Muted-fg       | 中灰 (#8B8580)   | 中灰 (#9A9489)   | 略提亮              |

### 9.3 毛玻璃暗色翻转

| 属性           | 浅色模式                      | 深色模式                      |
| -------------- | ----------------------------- | ----------------------------- |
| glass-bg       | `rgba(255,255,255,0.65)`      | `rgba(37,35,32,0.65)`         |
| glass-border   | `rgba(255,255,255,0.18)`      | `rgba(255,255,255,0.06)`      |
| blur 参数      | `blur(12px) saturate(1.4)`    | 不变                          |

### 9.4 图谱点阵暗色翻转

从 `globals.css` 精确提取:

```css
/* 浅色模式 */
.graph-view::before {
  background-image: radial-gradient(oklch(0.5 0 0 / 0.15) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* 深色模式 */
.dark .graph-view::before {
  background-image: radial-gradient(oklch(0.7 0 0 / 0.08) 1px, transparent 1px);
}
```

| 属性        | 浅色模式                      | 深色模式                      |
| ----------- | ----------------------------- | ----------------------------- |
| 点色 L 值   | 0.5                           | 0.7                           |
| 点透明度    | 0.15                          | 0.08                          |
| 点间距      | 40px                          | 40px (不变)                   |

### 9.5 图谱节点暗色调整

所有节点 HSL 颜色在深色模式下 lightness 提升 8%:

```
浅色: hsl(H, S%, L%)
深色: hsl(H, S%, L+8%)
```

---

## 10. 选中色 (Selection)

| 令牌名                   | 浅色模式                       | 深色模式                       |
| ------------------------ | ------------------------------ | ------------------------------ |
| `--color-selection-bg`   | `rgba(195,90,44, 0.18)`        | `rgba(212,115,75, 0.26)`       |

使用主色 (烧陶橙) 的半透明版本，与全局暖色调保持一致。

---

## 11. 滚动条

### 11.1 全局滚动条

从 `globals.css` 精确提取:

| 属性           | 浅色模式                | 深色模式                |
| -------------- | ----------------------- | ----------------------- |
| 宽度           | 6px                     | 6px                     |
| 轨道背景       | transparent             | transparent             |
| 滑块颜色       | `oklch(0.7 0 0 / 0.3)` | `oklch(0.4 0 0 / 0.3)` |
| 滑块悬停       | `oklch(0.6 0 0 / 0.5)` | `oklch(0.5 0 0 / 0.5)` |
| 圆角           | 3px                     | 3px                     |

### 11.2 隐藏滚动条

TabBar 和特定容器使用隐藏滚动条:
```css
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
```

---

## 12. CSS 变量完整映射

### 12.1 Tailwind CSS 使用方式

在 `globals.css` 中通过 `@theme` 和 `@layer base` 定义变量后，
Tailwind 类自动映射:

```
bg-background     → var(--color-background)
text-foreground   → var(--color-foreground)
bg-card           → var(--color-card)
bg-primary        → var(--color-primary)
text-primary      → var(--color-primary)
border-border     → var(--color-border)
bg-muted          → var(--color-muted)
text-muted-foreground → var(--color-muted-foreground)
bg-accent         → var(--color-accent)
bg-destructive    → var(--color-destructive)
bg-sidebar-background → var(--color-sidebar-background)
```

### 12.2 DeepTutor 专用变量使用方式

DeepTutor 补充变量不在 Tailwind `@theme` 中注册，需通过内联样式或自定义类使用:

```jsx
// 内联样式
<div style={{ color: 'var(--deeptutor-ok)' }}>

// 自定义 Tailwind 类 (v2.0 可考虑注册到 @theme)
className="text-[var(--deeptutor-ok)]"

// 阴影
style={{ boxShadow: 'var(--deeptutor-shadow-md)' }}
```

---

## 13. 设计令牌 CSS 变量速查

以下为 v2.0 全部设计令牌，按类别排列:

```css
/* === 基础色 (theme-deeptutor) === */
--color-background
--color-foreground
--color-card
--color-card-foreground
--color-primary
--color-primary-foreground
--color-secondary
--color-secondary-foreground
--color-muted
--color-muted-foreground
--color-accent
--color-accent-foreground
--color-border
--color-input
--color-ring
--color-destructive
--color-destructive-foreground

/* === 侧栏 === */
--color-sidebar-background
--color-sidebar-foreground
--color-sidebar-primary
--color-sidebar-primary-foreground
--color-sidebar-accent
--color-sidebar-accent-foreground
--color-sidebar-border
--color-sidebar-ring

/* === 语义色 (DeepTutor 补充) === */
--deeptutor-primary
--deeptutor-primary-hi
--deeptutor-primary-soft
--deeptutor-ok
--deeptutor-ok-soft
--deeptutor-warn
--deeptutor-warn-soft
--deeptutor-danger
--deeptutor-danger-soft
--deeptutor-wechat
--deeptutor-wechat-soft
--deeptutor-purple
--deeptutor-purple-soft

/* === 阴影 === */
--deeptutor-shadow-sm
--deeptutor-shadow-md
--deeptutor-shadow-lg

/* === 字体族 === */
--font-family-dt-sans
--font-family-dt-serif
--font-family-dt-mono

/* === 字号 === */
--font-size-micro      /* 8px */
--font-size-nano       /* 9px */
--font-size-caption    /* 10px */
--font-size-label      /* 11px */
--font-size-body-sm    /* 12px */
--font-size-body       /* 13px */
--font-size-subhead    /* 14px */
--font-size-head       /* 15px */

/* === Ask 对话 === */
--claude-orange
--claude-orange-shimmer
--color-msg-user-bg
--color-msg-user-fg
--color-msg-assistant-bg
--color-label-claude
--color-label-you

/* === 选中 === */
--color-selection-bg

/* === 圆角 === */
--radius                /* 0.625rem = 10px (基础值) */

/* === 毛玻璃 (v2.0 新增建议) === */
--glass-bg
--glass-border
--glass-blur
```
