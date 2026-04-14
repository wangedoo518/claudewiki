# 知识图谱 Rowboat 原版精确重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 ForceGraph.tsx 精确重构为 Rowboat 原版 `graph-view.tsx` 的设计，包括自研物理引擎、浮动呼吸、弧形边线、SVG 辉光滤镜、CSS 点阵背景、搜索栏。

**Architecture:** 丢弃 d3-force/d3-zoom/d3-drag/d3-selection 的使用，改为 Rowboat 原版的自研弹簧-排斥物理引擎 + 手写 pointer event 交互。用 CSS `::before` radial-gradient 做点阵背景。节点从毛玻璃卡片改回纯圆形 + 标签。边线从直线改为 SVG arc path 弧线。新增浮动呼吸动画和搜索栏。

**Tech Stack:** React 18, SVG, CSS radial-gradient, lucide-react, @tanstack/react-query

---

## 与 Rowboat 原版的逐项对照

| 特性 | Rowboat 原版值 | 当前我们的值 | 改动 |
|------|---------------|-------------|------|
| 物理引擎 | 自研弹簧-排斥 240步 | d3-force | **替换** |
| SPRING_LENGTH | 80 | d3 distance 100-140 | **替换** |
| SPRING_STRENGTH | 0.0038 | d3 strength 0.3 | **替换** |
| REPULSION | 5800 | d3 charge -40/-250 | **替换** |
| DAMPING | 0.83 | d3 velocityDecay 0.35 | **替换** |
| 群组聚类 | CLUSTER_STRENGTH=0.0018 | 无 | **新增** |
| 浮动动画 | sin/cos 3.5px 0.0006/frame | 无 | **新增** |
| 节点形状 | 纯圆 `<circle>` r=6-24 | 毛玻璃矩形卡片 120×38 | **替换** |
| 节点大小 | `6 + min(18, degree*2)` | 固定 5/60 | **替换** |
| 辉光滤镜 | SVG `<feGaussianBlur stdDeviation="4">` | CSS drop-shadow | **替换** |
| 悬停光圈 | `<circle r=30 opacity=0.4>` 底层 | 矩形 glow ring | **替换** |
| 边线形状 | SVG `<path>` arc (dr = dist*1.5) | `<line>` 直线 | **替换** |
| 边线默认 | stroke #333, opacity 0.4 | rgba gray, dasharray 动画 | **替换** |
| 边线高亮 | 源节点色, opacity 0.8, width 2 | 同 | 保持 |
| 点阵背景 | CSS `::before` radial-gradient 40px | SVG pattern 20px | **替换** |
| 缩放方式 | 手写 pointer event + Math.exp | d3-zoom | **替换** |
| 缩放范围 | 0.4x - 2.5x, 初始 0.6x | 0.1x - 5x | **替换** |
| 拖拽 | 手写 pointer capture | d3-drag | **替换** |
| 搜索栏 | 底部居中 256px Input + 匹配计数 | 无 | **新增** |
| 图例位置 | 右上角 | 左下角 | **移动** |
| 图例交互 | 点击过滤分组 | 仅显示 | **新增过滤** |
| 标签颜色 | #9ca3af 固定 | 动态 dark/light | 保持 dark/light |
| 标签位置 | y = radius + 16 | 悬停才显示 | **改为始终显示** |
| 色板 | 8色 HSL 按 group 分配 | 5色 hex 按 category | **适配** |

---

## Task 1: CSS 点阵背景替换

**Files:**
- Modify: `apps/desktop-shell/src/globals.css` (底部 graph 动画区域)
- Modify: `apps/desktop-shell/src/features/graph/ForceGraph.tsx` (移除 SVG pattern)

**Step 1: 在 globals.css 替换图谱样式区域**

删除之前加的 `graph-edge-flow` / `graph-edge-flow-active` / `graph-node-enter` / `graph-glow` 动画，替换为 Rowboat 原版 CSS：

```css
/* ── Knowledge Graph: Rowboat-style ── */
.graph-view {
  background-color: var(--color-background);
  user-select: none;
}
.graph-view::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(oklch(0.5 0 0 / 0.15) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}
.dark .graph-view::before {
  background-image: radial-gradient(oklch(0.7 0 0 / 0.08) 1px, transparent 1px);
}
.graph-view > svg {
  position: relative;
  z-index: 1;
  cursor: grab;
}
.graph-view:active > svg {
  cursor: grabbing;
}
.graph-view text {
  pointer-events: none;
  user-select: none;
}
```

**Step 2: cargo/tsc 无需，纯 CSS 改动**

**Step 3: Commit**
```
git add apps/desktop-shell/src/globals.css
git commit -m "style: 替换图谱背景为 Rowboat 原版 CSS radial-gradient 点阵"
```

---

## Task 2: ForceGraph.tsx 完全重写 — 自研物理引擎

**Files:**
- Rewrite: `apps/desktop-shell/src/features/graph/ForceGraph.tsx`

这是核心改动。将 d3-force/d3-zoom/d3-drag 全部替换为 Rowboat 原版的自研物理引擎。

**关键实现点：**

### 2A. 物理引擎常量（精确复制 Rowboat）
```typescript
const SIMULATION_STEPS = 240
const SPRING_LENGTH = 80
const SPRING_STRENGTH = 0.0038
const REPULSION = 5800
const DAMPING = 0.83
const MIN_DISTANCE = 34
const CLUSTER_STRENGTH = 0.0018
const CLUSTER_RADIUS_MIN = 120
const CLUSTER_RADIUS_MAX = 240
const CLUSTER_RADIUS_STEP = 45
```

### 2B. 浮动呼吸动画（精确复制 Rowboat）
```typescript
const FLOAT_BASE = 3.5
const FLOAT_VARIANCE = 2
const FLOAT_SPEED_BASE = 0.0006
const FLOAT_SPEED_VARIANCE = 0.00025

function getMotionSeed(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  const n = Math.abs(hash)
  return {
    phase: ((n % 360) * Math.PI) / 180,
    amplitude: FLOAT_BASE + (n % 7) * (FLOAT_VARIANCE / 6),
    speed: FLOAT_SPEED_BASE + (n % 5) * FLOAT_SPEED_VARIANCE,
  }
}

function getDisplayPosition(id: string, base: {x:number,y:number}, time: number, skip: boolean) {
  if (skip) return { x: base.x, y: base.y }
  const s = getMotionSeed(id)
  const phase = s.phase + time * s.speed
  return {
    x: base.x + Math.sin(phase) * s.amplitude,
    y: base.y + Math.cos(phase * 0.9) * s.amplitude,
  }
}
```

### 2C. 色板 — ClawWiki 5 类适配 Rowboat HSL 风格
```typescript
const CATEGORY_PALETTE: Record<NodeCategory, { hue: number; sat: number; light: number }> = {
  people:  { hue: 210, sat: 72, light: 52 },  // 蓝 — Rowboat palette[0]
  concept: { hue: 28,  sat: 78, light: 52 },  // 橙 — Rowboat palette[1]
  topic:   { hue: 280, sat: 70, light: 56 },  // 紫 — Rowboat palette[4]
  compare: { hue: 55,  sat: 80, light: 52 },  // 黄 — Rowboat palette[6]
  raw:     { hue: 0,   sat: 0,  light: 55 },  // 灰
}

function categoryColor(cat: NodeCategory): string {
  const p = CATEGORY_PALETTE[cat]
  return `hsl(${p.hue}, ${p.sat}%, ${p.light}%)`
}
function categoryStroke(cat: NodeCategory): string {
  const p = CATEGORY_PALETTE[cat]
  return `hsl(${p.hue}, ${Math.min(100, p.sat + 8)}%, ${p.light - 12}%)`
}
```

### 2D. 节点大小 — 按度数动态计算（精确复制 Rowboat）
```typescript
// 在 useMemo 中计算 degree
const degree = links.filter(l => l.source === n.id || l.target === n.id).length
const radius = 6 + Math.min(18, degree * 2)  // 6px~24px
```

### 2E. 边线 — SVG arc path（精确复制 Rowboat）
```typescript
const dx = target.x - source.x
const dy = target.y - source.y
const dr = Math.sqrt(dx * dx + dy * dy) * 1.5
const pathD = `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`
// <path d={pathD} fill="none" stroke={...} />
```

### 2F. 辉光滤镜 — SVG feGaussianBlur（精确复制 Rowboat）
```xml
<filter id="glow-{color}" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
  <feMerge>
    <feMergeNode in="coloredBlur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

### 2G. 悬停光圈 — 底层大圆（精确复制 Rowboat）
```xml
<!-- 外层光晕圆 -->
<circle r={30} fill={node.color} opacity={isPrimary ? 0.4 : 0} />
<!-- 实际节点圆 -->
<circle r={node.radius} fill={node.color} stroke="#0a0a0a" strokeWidth={2}
  filter={isPrimary ? `url(#glow-${colorHex})` : undefined} />
```

### 2H. 缩放 — 手写 wheel + cursor-pivot（精确复制 Rowboat）
```typescript
const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault()
  const nd = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * viewport.height : e.deltaY
  const sensitivity = Math.abs(nd) < 40 ? 0.004 : 0.0022
  const factor = Math.exp(-nd * sensitivity)
  const next = Math.min(2.5, Math.max(0.4, zoom * factor))
  // Pivot around cursor
  const rect = container.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const gx = (cx - pan.x) / zoom
  const gy = (cy - pan.y) / zoom
  setZoom(next)
  setPan({ x: cx - gx * next, y: cy - gy * next })
}
```

### 2I. 搜索栏 — 底部居中（精确复制 Rowboat）
```tsx
<div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
  <div className="relative flex items-center">
    <Search className="absolute left-3 size-4 text-muted-foreground" />
    <input
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      placeholder="搜索节点..."
      className="w-64 rounded-md border border-border bg-background/90 py-2 pl-9 pr-20 text-sm shadow-lg backdrop-blur"
    />
    {searchMatchingNodes && (
      <span className="absolute right-9 text-xs text-muted-foreground">
        {searchMatchingNodes.directMatches.size}
      </span>
    )}
    {searchQuery && (
      <button onClick={() => setSearchQuery('')} className="absolute right-3">
        <X className="size-4 text-muted-foreground" />
      </button>
    )}
  </div>
</div>
```

### 2J. 图例 — 右上角 + 点击过滤（精确复制 Rowboat）
```tsx
<div className="absolute right-3 top-3 z-20 rounded-md border border-border/80 bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
  <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
    分类
  </div>
  {categories.map(cat => (
    <button key={cat} onClick={() => toggleGroup(cat)}
      className={`flex items-center gap-2 rounded px-1.5 py-1 hover:bg-foreground/10 ${selected === cat ? 'bg-foreground/15' : ''}`}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${stroke}` }} />
      <span>{label}</span>
      {selected === cat && <X className="ml-auto size-3 text-muted-foreground" />}
    </button>
  ))}
</div>
```

**Step: 验证编译**
```bash
cd apps/desktop-shell && npx tsc --noEmit
```

**Step: Commit**
```
git add apps/desktop-shell/src/features/graph/ForceGraph.tsx
git commit -m "feat: 按 Rowboat 原版精确重写知识图谱 — 自研物理引擎+浮动呼吸+弧形边线+搜索"
```

---

## Task 3: GraphPage.tsx 容器适配

**Files:**
- Modify: `apps/desktop-shell/src/features/graph/GraphPage.tsx`

**改动点：**
- ForceGraph 的外层 div 加 `graph-view` class（触发 CSS 点阵背景）
- 确保 ForceGraph 拿到 `className="graph-view"` 或者外层容器有这个 class

**Step: Commit**
```
git commit -m "fix: GraphPage 容器加 graph-view class 触发点阵背景"
```

---

## Task 4: 移除未使用的 d3 import

**Files:**
- Modify: `apps/desktop-shell/src/features/graph/ForceGraph.tsx`

确认 ForceGraph 不再 import d3-force / d3-zoom / d3-selection / d3-drag。这些包仍保留在 package.json 中（其他地方可能用到），但 ForceGraph 不再依赖。

---

## Task 5: 全局验证

**Step 1: Rust 后端**
```bash
cd rust && cargo check --workspace && cargo test --workspace
```

**Step 2: TypeScript 前端**
```bash
cd apps/desktop-shell && npx tsc --noEmit
```

**Step 3: 视觉验证清单**
- [ ] 点阵背景：40px 网格、1px 圆点、暗色模式透明度翻转
- [ ] 节点：纯圆形、大小按度数 6-24px
- [ ] 悬停：底层大圆光晕 r=30 opacity=0.4 + SVG feGaussianBlur 辉光
- [ ] 边线：弧形曲线、默认 #333 opacity=0.4、高亮 2px 源色 opacity=0.8
- [ ] 浮动：节点持续微幅漂浮（3-5px sin/cos）
- [ ] 搜索：底部居中 256px 输入框、实时匹配高亮 + 计数
- [ ] 图例：右上角、点击过滤分组、backdrop-blur
- [ ] 缩放：滚轮 0.4x-2.5x、以鼠标为中心
- [ ] 拖拽：节点拖拽 + 画布平移
- [ ] 暗色：切换后全部元素正确翻转

**Step: Final Commit**
```
git commit -m "chore: 全局验证通过 — Rowboat 原版知识图谱精确重构完成"
```
