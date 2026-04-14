# ClawWiki v2.0 -- 组件级 UI 规格

> 版本: v2.0-draft  
> 最后更新: 2026-04-14  
> 参考来源: Rowboat `tab-bar.tsx`, `chat-sidebar.tsx`, `graph-view.tsx`, `sidebar-content.tsx`, `ui/button.tsx`, `ui/input.tsx`  
> 现有资产: ClawWiki `globals.css` theme-deeptutor + ForceGraph (Rowboat 精确复刻)

---

## 1. TabBar -- 顶部多 Tab 浏览器

参考 Rowboat `TabBar<T>` 组件 (`components/tab-bar.tsx`)。
在 ClawWiki 中作为全局顶栏，承载 wiki 页面、对话、图谱等多种 Tab。

### 1.1 容器

| 属性           | 值                               | 来源                              |
| -------------- | -------------------------------- | --------------------------------- |
| 高度           | 40px                             | Rowboat `h-10`                    |
| 背景           | `var(--color-sidebar-background)` | Rowboat `bg-sidebar`             |
| 底部边框       | 1px `var(--color-border)`        | Rowboat `border-b border-border`  |
| 内部布局       | `flex`, `items-stretch`          | Rowboat `flex flex-1 self-stretch` |
| 滚动           | `overflow-x: auto`, 隐藏滚动条   | `[scrollbar-width:none]`          |
| 窗口拖拽       | `titlebar-drag-region`           | Rowboat 框架窗口拖拽区域          |

### 1.2 Tab 项

| 属性           | 值                               | 来源                              |
| -------------- | -------------------------------- | --------------------------------- |
| 最小宽度       | 140px                            | Rowboat `min-w-[140px]`           |
| 最大宽度       | 240px                            | Rowboat `max-w-[240px]`           |
| 内边距         | 0 12px (`px-3`)                  | Rowboat 精确值                    |
| 字体大小       | 12px (`text-xs`)                 | Rowboat 精确值                    |
| 元素间距       | 6px (`gap-1.5`)                  | Rowboat 精确值                    |
| flex           | `0 0 auto` (scroll 布局)         | Rowboat `style={{ flex: '0 0 auto' }}` |

### 1.3 Tab 项状态

| 状态    | 背景                    | 文字颜色                | 额外                    |
| ------- | ----------------------- | ---------------------- | ----------------------- |
| 默认    | transparent             | `var(--color-muted-foreground)` | —                |
| 悬停    | `var(--color-accent)/50` | `var(--color-foreground)` | transition-colors   |
| 活跃    | `var(--color-background)` | `var(--color-foreground)` | —                 |
| 拖拽中  | (Phase 2)               | —                      | opacity: 0.5            |

### 1.4 分隔线

| 属性     | 值                   |
| -------- | -------------------- |
| 宽度     | 1px                  |
| 颜色     | `var(--color-border)/70` |
| 位置     | Tab 项之间 + 最后一项右侧 |

### 1.5 关闭按钮

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 图标           | X (`lucide-react`), 12px (`size-3`) |
| 容器           | 圆角 2px (`rounded-sm`), padding 2px (`p-0.5`) |
| 默认透明度     | 0 (隐藏)                         |
| 悬停 Tab 透明度 | 0.6 (`group-hover/tab:opacity-60`) |
| 悬停自身透明度  | 1.0 (`hover:opacity-100!`)       |
| 悬停背景       | `var(--color-foreground)/10`      |
| 动画           | `transition-all`                  |
| 行为           | `e.stopPropagation()` 阻止冒泡    |

### 1.6 新建 Tab 按钮 (+)

| 属性           | 值                                          |
| -------------- | ------------------------------------------- |
| 图标           | SquarePen, 20px (`size-5`)                  |
| 容器尺寸       | 32x32px (`h-8 w-8`)                        |
| 样式           | ghost variant, margin-y 4px (`my-1`)       |
| 颜色           | `muted-foreground`, hover → `foreground`    |
| 提示           | Tooltip "新建 Tab", 底部弹出 (`side="bottom"`) |

### 1.7 动画

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 颜色过渡       | `transition-colors` (CSS default 150ms) |
| 关闭按钮       | `transition-all` (150ms)          |

---

## 2. FileTree -- 左侧文件树

参考 Rowboat `SidebarContent` 的树形导航结构 (`SidebarMenu` / `SidebarMenuSub`)。
适配 ClawWiki 的 Inbox → Raw → Wiki → Schema 文件体系。

### 2.1 容器

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 宽度           | 240px (默认)                     |
| 最小宽度       | 180px (拖拽下限)                  |
| 最大宽度       | 360px (拖拽上限)                  |
| 背景           | `var(--color-sidebar-background)` |
| 右边框         | 1px `var(--color-sidebar-border)` |
| 垂直滚动       | `overflow-y: auto`               |
| 滚动条         | 6px 宽, 圆角 3px                 |

### 2.2 拖拽调节手柄

参考 Rowboat `ChatSidebar` 的拖拽 resize 实现:

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 位置           | 右侧边缘, `absolute inset-y-0 right-0` |
| 宽度           | 16px 热区, `-translate-x-1/2`     |
| 光标           | `cursor-col-resize`              |
| 视觉指示器     | 2px 线, `after:w-[2px]`          |
| 默认颜色       | 透明                             |
| 悬停颜色       | `var(--color-sidebar-border)`     |
| 拖拽中颜色     | `var(--color-primary)`            |
| 动画           | `after:transition-colors`         |

### 2.3 搜索栏

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 位置           | 顶部固定 (sticky top-0)          |
| 高度           | 32px                             |
| 圆角           | 8px (`rounded-lg`)               |
| 内边距         | 左 32px (icon) 右 8px            |
| 字体大小       | 13px                             |
| placeholder    | "搜索..." (muted 色)             |
| 搜索图标       | Search, 16px, 绝对定位左 8px     |
| 背景           | `var(--color-background)/90`      |
| 模糊           | `backdrop-filter: blur(8px)`      |
| 外边距         | 8px 水平, 8px 底部                |

### 2.4 文件夹节点

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 缩进           | 每级 16px (`pl-4`)               |
| 展开图标       | ChevronRight, 16px, 旋转 90deg 表示展开 |
| 图标动画       | `transition-transform duration-200` |
| 行高           | 28px                             |
| 字体大小       | 12px (`text-body-sm`)            |
| 字重           | 600 (semibold)                   |
| 颜色           | `var(--color-sidebar-foreground)` |

### 2.5 文件节点

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 缩进           | 父级缩进 + 16px                  |
| 行高           | 28px                             |
| 字体大小       | 12px (`text-body-sm`)            |
| 字重           | 400 (normal)                     |
| 颜色           | `var(--color-sidebar-foreground)` |
| 悬停背景       | `var(--color-sidebar-accent)`     |
| 选中背景       | `var(--color-sidebar-accent)`     |
| 选中指示器     | 左侧 2px 主色竖线                |
| 圆角           | 6px (`rounded-md`)               |
| 左内边距       | 8px (图标 + 文件名)              |

### 2.6 Inbox Badge

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 形状           | 圆角全圆 (`rounded-full`)        |
| 最小宽度       | 18px                             |
| 高度           | 18px                             |
| 背景           | light: `#D44A3C` / dark: `#FF6B80` |
| 文字颜色       | 白色                             |
| 字体大小       | 10px (`text-caption`)            |
| 字重           | 600                              |
| 对齐           | 数字水平垂直居中                  |
| 位置           | Inbox 文件夹行右侧               |

---

## 3. WikiArticle -- Markdown 渲染区

ClawWiki 的核心阅读界面，渲染 wiki_maintainer 生成的 Markdown 内容。

### 3.1 容器

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 最大宽度       | 720px                            |
| 居中           | `margin: 0 auto`                 |
| 内边距         | 32px 水平, 24px 垂直             |
| 背景           | `var(--color-background)`         |

### 3.2 文章标题

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体族         | `var(--font-family-dt-serif)` (Lora) |
| 字体大小       | 24px                             |
| 字重           | 600                              |
| 行高           | 1.3                              |
| 颜色           | `var(--color-foreground)`         |
| 底部间距       | 8px                              |

### 3.3 元数据行

```
[concept] badge   ·   2026-04-14   ·   3 min read
```

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 11px (`text-label`)              |
| 颜色           | `var(--color-muted-foreground)`   |
| 底部间距       | 24px                             |
| 分隔符         | `·` 中点, 间距 8px                |

**Type Badge:**

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 圆角           | 4px (`rounded-xs`)               |
| 内边距         | 2px 8px                          |
| 字体大小       | 10px (`text-caption`)            |
| 字重           | 500                              |
| concept 色     | 主色背景/10, 主色文字             |
| people 色      | 蓝色背景/10, 蓝色文字            |
| topic 色       | 紫色背景/10, 紫色文字            |
| compare 色     | 黄色背景/10, 黄色文字            |

### 3.4 正文排版

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体族         | system sans-serif (Plus Jakarta Sans) |
| 字体大小       | 15px (`text-head`)               |
| 行高           | 1.7                              |
| 颜色           | `var(--color-foreground)`         |
| 段落间距       | 16px (`my-4`)                    |
| 链接颜色       | `var(--color-primary)`            |
| 链接下划线     | underline, `underline-offset-2`   |

### 3.5 Wikilink 样式

wiki 内部链接 `[[slug]]` 的特殊样式:

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 颜色           | `var(--color-primary)`            |
| 下划线         | 虚线 (`text-decoration: underline dashed`) |
| 下划线偏移     | 3px                              |
| 悬停下划线     | 实线 (`text-decoration: underline solid`) |
| 光标           | `cursor-pointer`                  |
| 行为           | 点击打开新 Tab                    |

### 3.6 代码块

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 圆角           | 8px (`rounded-lg`)               |
| 字体族         | `var(--font-family-dt-mono)` (JetBrains Mono) |
| 字体大小       | 13px                             |
| 行高           | 1.5                              |
| 背景           | light: `var(--color-secondary)` / dark: `var(--color-card)` |
| 内边距         | 16px                             |
| 水平滚动       | `overflow-x: auto`               |
| 顶部边距       | 12px (`my-3`)                    |

**内联代码:**

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 背景           | `var(--color-muted)`              |
| 内边距         | 2px 6px (`px-1.5 py-0.5`)        |
| 圆角           | 4px                              |
| 字体大小       | 比正文小 1px (14px)               |

### 3.7 反链区 (Backlinks)

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 位置           | 文章底部                         |
| 顶部分隔线     | 1px `var(--color-border)`, margin-top 48px |
| 标题           | "被引用" (Referenced by)          |
| 标题字体       | 13px, 600 weight, muted 色       |
| 链接列表       | 无序列表, 每项: slug 名 + 摘要    |
| 链接颜色       | `var(--color-primary)`            |
| 链接下划线     | 虚线 (与 wikilink 一致)           |
| 摘要           | 11px, muted 色, 截断 1 行        |

---

## 4. ChatSidePanel -- 右侧聊天面板

参考 Rowboat `ChatSidebar` 组件的精简版本。

### 4.1 容器

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 宽度           | 320px (固定)                     |
| 背景           | `var(--color-background)`         |
| 左边框         | 1px `var(--color-border)`         |
| 过渡动画       | `transition-[width] duration-200 ease-linear` |

### 4.2 消息气泡

与主对话页面相比，右侧面板采用更紧凑的间距:

| 属性           | 面板值  | 主对话值 | 差异               |
| -------------- | ------- | -------- | ------------------ |
| 消息间距       | 8px     | 12px     | 紧凑 33%           |
| 气泡内边距     | 8px 12px | 12px 16px | 紧凑              |
| 字体大小       | 13px    | 14px     | 小 1px             |
| 最大宽度       | 100%    | 75%      | 面板窄, 不限制宽度  |
| 行高           | 1.5     | 1.6      | 略紧               |

### 4.3 紧凑 Composer

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 布局           | 单行 `flex` (input + send btn)    |
| 输入框高度     | 36px                             |
| 输入框圆角     | 8px                              |
| 输入框字体     | 13px                             |
| placeholder    | "问点什么..." (muted 色)          |
| 发送按钮       | 圆形 28px, 主色背景, 白色箭头图标 |
| 底部安全区     | 12px padding-bottom              |
| 背景           | 渐变遮罩向上淡出 6px              |

### 4.4 折叠按钮

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 位置           | 左侧边缘中央 (`left-0, top-50%, -translate-y-1/2`) |
| 形状           | 圆形 24px                        |
| 背景           | `var(--color-background)`         |
| 边框           | 1px `var(--color-border)`         |
| 阴影           | `var(--deeptutor-shadow-sm)`      |
| 图标           | 展开态: ◀ (ChevronLeft) / 折叠态: ▶ (ChevronRight) |
| 图标大小       | 14px                             |
| 悬停           | 背景 `var(--color-accent)`        |
| z-index        | 20                               |

---

## 5. SkillProgressCard -- SKILL 执行进度

wiki_maintainer 执行维护任务时的进度显示卡片。

### 5.1 卡片容器

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 圆角           | 12px (`rounded-lg`)              |
| 边框           | 1px `var(--color-border)`         |
| 背景           | 毛玻璃 (见 design-tokens.md 8.毛玻璃) |
| 内边距         | 16px                             |
| 阴影           | `var(--deeptutor-shadow-sm)`      |

### 5.2 进度条

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 高度           | 4px                              |
| 圆角           | 9999px (`rounded-full`)          |
| 轨道背景       | `var(--color-muted)`              |
| 填充颜色       | `var(--color-primary)`            |
| 动画           | `transition: width 0.3s ease-out` |
| 填充模式       | 从左到右, `width: {percent}%`     |

### 5.3 状态文字

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 12px (`text-body-sm`)            |
| 颜色           | `var(--color-muted-foreground)`   |
| 格式           | "正在维护... 3/15"                |
| 位置           | 进度条上方, 右对齐               |

### 5.4 子任务列表

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 11px (`text-label`)              |
| 行高           | 24px                             |
| 已完成项       | 绿色勾 + 删除线文字              |
| 进行中项       | 主色旋转 Loader + 正常文字       |
| 待执行项       | 灰色圆圈 + muted 文字            |

---

## 6. StatCard -- 仪表盘统计卡片

参考 Rowboat 风格的数据展示卡片。

### 6.1 卡片容器

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 圆角           | 12px (`rounded-lg`)              |
| 背景           | `var(--color-card)`               |
| 边框           | 1px `var(--color-border)`         |
| 内边距         | 20px (`p-5`)                     |
| 最小高度       | 100px                            |
| 悬停阴影       | `var(--deeptutor-shadow-md)`      |
| 悬停位移       | `translateY(-1px)`               |
| 过渡           | `transition: all 200ms ease-out`  |

### 6.2 图标

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 大小           | 24px                             |
| 颜色           | `var(--color-muted-foreground)`   |
| 位置           | 左上角                           |
| 底部间距       | 12px                             |

### 6.3 数字

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 28px                             |
| 字重           | 600                              |
| 颜色           | `var(--color-foreground)`         |
| 行高           | 1.2                              |
| 底部间距       | 4px                              |

### 6.4 标签

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 11px (`text-label`)              |
| 颜色           | `var(--color-muted-foreground)`   |
| 字重           | 400                              |

### 6.5 副数字 (可选)

```
  42          ← 主数字
  +3 today    ← 副数字 (绿色, 小字)
  Total pages ← 标签
```

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 12px                             |
| 颜色           | `var(--deeptutor-ok)` (绿色)     |
| 字重           | 500                              |
| 前缀           | "+" / "-"                        |
| 位置           | 主数字右侧, 基线对齐             |

---

## 7. SearchBar -- 全局搜索 / 文件树搜索

参考 Rowboat `GraphView` 底部搜索栏和 `CommandPalette` (search-dialog.tsx)。

### 7.1 Graph 搜索栏 (内嵌在图谱画布)

| 属性           | 值                               | 来源                     |
| -------------- | -------------------------------- | ------------------------ |
| 位置           | 画布底部居中                     | `absolute bottom-4 left-1/2 -translate-x-1/2` |
| 宽度           | 256px (`w-64`)                   | Rowboat 精确值           |
| 圆角           | 8px                              | Rowboat Input 默认圆角   |
| 背景           | 见 Input 组件                    | —                        |
| 阴影           | `shadow-lg`                      | Rowboat 精确值           |
| 模糊           | `backdrop-blur`                  | Rowboat 精确值           |
| 搜索图标       | Search, 16px, 绝对定位左 12px    | `left-3 size-4`          |
| 输入框左内边距 | 36px (`pl-9`)                    | 为图标留空间             |
| 匹配计数       | 右侧, 12px, muted 色             | Rowboat `text-xs text-muted-foreground` |
| 清除按钮       | X 图标, 16px, 悬停高亮            | Rowboat `hover:text-foreground` |
| z-index        | 20                               | Rowboat 精确值           |

### 7.2 全局搜索面板 (Cmd+K)

参考 Rowboat `CommandPalette` 组件:

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 触发           | Ctrl/Cmd + K                     |
| 位置           | 顶部 20% (`top-[20%] translate-y-0`) |
| 宽度           | 640px (Radix Dialog 默认)         |
| 圆角           | 12px                             |
| 背景           | `var(--color-popover)`            |
| 阴影           | `var(--deeptutor-shadow-lg)`      |
| 动画           | `animate-slide-up` (150ms)        |
| 模式切换       | Tab 键切换 Chat / Search          |

**模式切换按钮:**

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 圆角           | 6px (`rounded-md`)               |
| 内边距         | 10px 4px (`px-2.5 py-1`)         |
| 字体大小       | 12px (`text-xs`)                 |
| 字重           | 500 (`font-medium`)              |
| 活跃态背景     | `var(--color-accent)`             |
| 非活跃态       | `text-muted-foreground`           |
| 悬停           | `hover:bg-accent/50`             |

**搜索结果项:**

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 行高           | 40px                             |
| 内边距         | 8px 12px                         |
| 图标           | FileText (knowledge) / MessageSquare (chat), 16px |
| 标题           | `font-medium`, 截断              |
| 预览           | 12px, muted 色, 截断              |
| 悬停背景       | `var(--color-accent)`             |
| 选中背景       | `var(--color-accent)`             |

---

## 8. LegendPanel -- 图谱图例

已在 ClawWiki ForceGraph 中实现 (精确复刻 Rowboat `GraphView`)。
此处记录规格以确保 v2.0 迁移时保持一致。

### 8.1 容器

| 属性           | 值                               | 来源                     |
| -------------- | -------------------------------- | ------------------------ |
| 位置           | 右上角 (`absolute right-3 top-3`) | Rowboat 精确值          |
| z-index        | 20                               | Rowboat 精确值           |
| 圆角           | 6px (`rounded-md`)               | Rowboat 精确值           |
| 边框           | `border-border/80`               | Rowboat 精确值           |
| 背景           | `var(--color-background)/90`      | 毛玻璃半透              |
| 模糊           | `backdrop-blur`                  | Rowboat 精确值           |
| 阴影           | `shadow-sm`                      | Rowboat 精确值           |
| 内边距         | 12px 8px (`px-3 py-2`)           | Rowboat 精确值           |
| 字体大小       | 12px (`text-xs`)                 | Rowboat 精确值           |

### 8.2 标题

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 字体大小       | 约 9px (`text-[0.7rem]`)         |
| 字重           | 600 (`font-semibold`)            |
| 大写           | `uppercase`                      |
| 字间距         | `tracking-wide`                  |
| 颜色           | `var(--color-muted-foreground)`   |
| 底部间距       | 8px (`mb-2`)                     |
| 文案           | "分类" (Rowboat 原文 "Folders")   |

### 8.3 图例项

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 布局           | `grid gap-1`                     |
| 内边距         | 6px 4px (`px-1.5 py-1`)          |
| 圆角           | 4px (`rounded`)                  |
| 悬停背景       | `var(--color-foreground)/10`      |
| 选中背景       | `var(--color-foreground)/15`      |
| 色点           | 10px 圆形 (`h-2.5 w-2.5 rounded-full`) |
| 色点阴影       | `0 0 0 1px {stroke_color}`       |
| 标签           | `truncate`, 12px                 |
| 清除图标       | X, 12px, 选中时可见, 未选中时 `invisible` |

### 8.4 节点类别色

| 类别      | 浅色模式                    | 深色模式                    |
| --------- | --------------------------- | --------------------------- |
| People    | `hsl(210, 72%, 52%)`       | `hsl(210, 72%, 60%)`       |
| Concept   | `hsl(28, 78%, 52%)`        | `hsl(28, 78%, 60%)`        |
| Topic     | `hsl(280, 70%, 56%)`       | `hsl(280, 70%, 64%)`       |
| Compare   | `hsl(55, 80%, 52%)`        | `hsl(55, 80%, 58%)`        |
| Raw       | `hsl(220, 8%, 55%)`        | `hsl(220, 8%, 62%)`        |

---

## 9. 通用 UI 基元

以下组件直接复用 Rowboat / shadcn 实现，仅记录 ClawWiki 的定制差异。

### 9.1 Button

基于 Rowboat `ui/button.tsx` (class-variance-authority):

| 变体      | 用途              | ClawWiki 定制                |
| --------- | ----------------- | ---------------------------- |
| default   | 主操作            | 主色=烧陶橙, 非 shadcn 黑    |
| ghost     | Tab 关闭, 工具栏  | 无变更                       |
| outline   | 次要操作          | 无变更                       |
| destructive | 删除操作        | 无变更                       |

| 尺寸      | 值                |
| --------- | ----------------- |
| default   | 36px (`h-9`)      |
| xs        | 24px (`h-6`)      |
| sm        | 32px (`h-8`)      |
| lg        | 40px (`h-10`)     |
| icon      | 36x36px (`size-9`) |
| icon-xs   | 24x24px (`size-6`) |
| icon-sm   | 32x32px (`size-8`) |

### 9.2 Input

基于 Rowboat `ui/input.tsx`:

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 高度           | 36px (`h-9`)                     |
| 圆角           | `var(--radius)` (10px)            |
| 边框           | 1px `var(--color-input)`          |
| 背景           | 透明 / dark: `input/30`          |
| 阴影           | `shadow-xs`                      |
| focus 边框     | `var(--color-ring)`              |
| focus 光环     | `ring-ring/50, ring-[3px]`       |
| 字体大小       | 16px (mobile) / 14px (md+)       |

### 9.3 Tooltip

| 属性           | 值                               |
| -------------- | -------------------------------- |
| 延迟           | 300ms (默认)                     |
| 圆角           | 6px                              |
| 背景           | `var(--color-popover)`            |
| 字体大小       | 12px                             |
| 内边距         | 4px 8px                          |
| 阴影           | `var(--deeptutor-shadow-sm)`      |
| 动画           | fade 150ms                       |
