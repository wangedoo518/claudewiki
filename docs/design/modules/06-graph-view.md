# 06 — 知识图谱（已实现，补充 Spec）

> **模块**: Force-Directed Knowledge Graph (Rowboat Clone)  
> **状态**: v1.0 已实现，本文档为回溯补充 spec  
> **上次更新**: 2026-04-14  

---

## 1. 职责边界

知识图谱模块拥有以下领域：

| 归属 | 说明 |
|------|------|
| **图谱可视化渲染** | 自研弹簧-排斥物理引擎驱动的力导向布局，SVG 渲染节点 + 弧形边线 |
| **节点交互** | hover 高亮子图、drag 重定位、click 跳转 wiki 页面/素材库 |
| **搜索与过滤** | 底部搜索栏实时过滤节点，右侧图例按分类过滤 |
| **浮动动画** | 基于 sin/cos 的呼吸式微幅漂浮，每个节点独立相位和振幅 |
| **视觉风格** | Rowboat 原版精确复刻：CSS 点阵画布、SVG feGaussianBlur 辉光、语义配色 |

**不拥有**：
- 图谱数据的构建（属于 `wiki_store::build_wiki_graph`）
- wiki 页面的 CRUD（属于 wiki_store）
- 页面打开/编辑逻辑（属于 Wiki Explorer）

---

## 2. 依赖

```
wiki_store::build_wiki_graph ──→ ForceGraph（数据源）
Wiki Explorer ←── ForceGraph（点击节点后跳转）
```

| 方向 | 依赖 | 用途 |
|------|------|------|
| **数据** | `GET /api/wiki/graph` → `wiki_store::build_wiki_graph()` | 获取节点列表（含 category）和边列表（含 kind），驱动整个图谱渲染 |
| **数据** | `GET /api/wiki/raw` → `listRawEntries()` | 获取 raw 条目详情，用于给 raw 节点生成友好标签（来源类型 + ID） |
| **导航** | `react-router-dom` `useNavigate` | 点击 concept 节点 → `/wiki?page={slug}`；点击 raw 节点 → `/raw` |
| **样式** | `globals.css` `.graph-view` 相关规则 | 点阵画布背景、光标样式、文本不可选中 |

---

## 3. API

### 已有端点（不需要变更）

| 方法 | 路径 | 响应体 |
|------|------|--------|
| `GET` | `/api/wiki/graph` | `WikiGraph { nodes, edges, raw_count, concept_count, edge_count }` |

#### 响应结构

```typescript
interface WikiGraphResponse {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  raw_count: number;
  concept_count: number;
  edge_count: number;
}

interface WikiGraphNode {
  id: string;       // "raw-{id}" 或 "wiki-{slug}"
  label: string;    // 显示标签
  kind: string;     // "raw" | "concept"
  category: string; // "raw" | "concept" | "people" | "topic" | "compare"
}

interface WikiGraphEdge {
  from: string;     // 源节点 id
  to: string;       // 目标节点 id
  kind: string;     // "derived-from" | "references"
}
```

后端已返回所有渲染所需数据，无需新增端点。

---

## 4. 数据模型

### 前端类型（ForceGraph.tsx 内部定义）

```typescript
type NodeCategory = "raw" | "concept" | "people" | "topic" | "compare";

interface ForceNode {
  id: string;            // 稳定标识（来自 API）
  label: string;         // 显示标签（经友好化处理）
  kind: "raw" | "concept";
  category: NodeCategory;
  degree: number;        // 连接度（边数）
  radius: number;        // 渲染半径 = 6 + min(18, degree * 2)
  color: string;         // HSL 填充色（由 category 决定）
  stroke: string;        // HSL 边框色（比 color 更深 12%）
}

interface ForceEdge {
  source: string;        // 源节点 id
  target: string;        // 目标节点 id
}

interface NodePosition {
  x: number;             // 当前 x 坐标
  y: number;             // 当前 y 坐标
  vx: number;            // x 方向速度
  vy: number;            // y 方向速度
}
```

### Rust 侧（wiki_store，已实现）

```rust
pub struct WikiGraphNode { pub id, pub label, pub kind, pub category }
pub struct WikiGraphEdge { pub from, pub to, pub kind }
pub struct WikiGraph { pub nodes, pub edges, pub raw_count, pub concept_count, pub edge_count }
```

---

## 5. Rust 实现要点

**当前状态：不需要任何变更。**

`wiki_store::build_wiki_graph(paths)` 已完整实现：

| 能力 | 实现位置 |
|------|----------|
| 扫描 raw/ 目录生成 raw 节点 | `build_wiki_graph()` 前半段 |
| 扫描 wiki/ 所有分类目录生成 concept 节点 | `list_all_wiki_pages()` → 遍历 WIKI_CATEGORIES |
| `derived-from` 边：concept → raw（通过 `source_raw_id`） | frontmatter 解析后匹配 |
| `references` 边：concept → concept（通过 body 中的 markdown 链接） | `extract_internal_links()` 解析 `](concepts/slug.md)` 模式 |
| category 字段：从页面所在子目录推断 | `list_all_wiki_pages()` 遍历时设置 |

未来可扩展的边类型（已在代码注释中标记）：
- `mentions`：命名实体重叠
- `conflicts-with`：冲突检测

---

## 6. 前端实现要点

### 物理引擎常量

| 常量 | 值 | 说明 |
|------|----|------|
| `SIMULATION_STEPS` | 240 | 物理模拟总帧数 |
| `SPRING_LENGTH` | 80 | 弹簧自然长度（px） |
| `SPRING_STRENGTH` | 0.0038 | 弹簧力系数 |
| `REPULSION` | 5800 | 排斥力常数（库仑系数） |
| `DAMPING` | 0.83 | 速度衰减因子 |
| `MIN_DISTANCE` | 34 | 最小节点间距（防穿透） |
| `CLUSTER_STRENGTH` | 0.0018 | 聚类吸引力系数 |
| `CLUSTER_RADIUS_MIN` | 120 | 聚类中心分布最小半径 |
| `CLUSTER_RADIUS_MAX` | 240 | 聚类中心分布最大半径 |
| `CLUSTER_RADIUS_STEP` | 45 | 每增加一个分类的半径步长 |

### 浮动动画常量

| 常量 | 值 | 说明 |
|------|----|------|
| `FLOAT_BASE` | 3.5 | 基础漂浮振幅（px） |
| `FLOAT_VARIANCE` | 2 | 振幅随机差异范围 |
| `FLOAT_SPEED_BASE` | 0.0006 | 基础漂浮速度 |
| `FLOAT_SPEED_VARIANCE` | 0.00025 | 速度随机差异范围 |

### 语义配色方案（HSL）

| 分类 | hue | sat | light | 中文标签 |
|------|-----|-----|-------|----------|
| `people` | 210 | 72% | 52% | 人物 |
| `concept` | 28 | 78% | 52% | 概念 |
| `topic` | 280 | 70% | 56% | 主题 |
| `compare` | 55 | 80% | 52% | 对比 |
| `raw` | 220 | 8% | 55% | 素材 |

stroke 颜色 = 在 color 基础上 sat + 8%, light - 12%。

### 节点大小

`radius = 6 + min(18, degree * 2)` — 度数越高节点越大，范围 6px ~ 24px。

### 标签友好化（raw 节点）

raw 节点标签从原始 `{source}: {slug}` 转换为中文来源标签：

```typescript
const SOURCE_LABELS = {
  paste: "粘贴", url: "网页", "wechat-text": "微信消息",
  "wechat-article": "微信文章", "wechat-url": "微信链接",
  voice: "语音", image: "图片", pdf: "PDF", pptx: "PPT",
  docx: "文档", video: "视频", card: "名片", chat: "聊天",
};
```

标签超过 14 字截断为 12 字 + "..."。

### SVG 渲染层次

1. **点阵画布**：`.graph-view::before` CSS radial-gradient 伪元素
2. **弧形边线**：SVG `<path>` 使用 arc（`A` 命令），曲率 = 距离 * 1.5
3. **辉光滤镜**：SVG `<defs>` 中按 category 生成 `feGaussianBlur` (stdDeviation=4) + `feMerge`
4. **节点**：外层辉光圆（r=30, opacity 0~0.4）+ 内层实心圆（r=node.radius）+ 文本标签
5. **图例面板**：绝对定位右上角，`backdrop-blur` 毛玻璃
6. **搜索栏**：绝对定位底部居中

### 交互处理

| 动作 | 实现 |
|------|------|
| **缩放** | `onWheel` → 指数缩放（sensitivity 区分高精度触控板 vs 滚轮），范围 0.4x ~ 2.5x |
| **平移** | pointerDown → 记录起始坐标，pointerMove → 计算偏移更新 pan |
| **拖拽节点** | pointerDown 在节点上 → 捕获指针，pointerMove → 直接设置 pos.x/y |
| **点击节点** | pointerUp 时若 moved=false → concept 节点导航到 wiki，raw 节点导航到素材库 |
| **hover** | pointerEnter → 高亮当前节点 + 连接节点，其余降低透明度 |

---

## 7. 交互流程

### 主路径：浏览图谱

```
用户点击侧边栏 "知识图谱"
  → GraphPage 加载
  → 并行请求 GET /api/wiki/graph + GET /api/wiki/raw
  → 数据就绪 → ForceGraph 组件挂载
  → 物理引擎运行 240 帧 → 节点稳定布局
  → 浮动动画循环启动（每 32ms 更新一帧）
  → 用户自由探索
```

### 辅助路径：hover 高亮子图

```
鼠标移入节点 A
  → setHoveredNodeId(A.id)
  → 计算 A 的直接邻居集合 connectedNodes
  → 非连接节点 opacity 降至 0.3
  → 非连接边 opacity 降至 0.1
  → A 节点触发辉光滤镜
鼠标移出
  → 恢复所有节点/边的完整透明度
```

### 辅助路径：搜索过滤

```
用户在搜索栏输入 "LLM"
  → searchQuery 更新 → 实时计算匹配节点
  → 直接匹配节点（label/id 包含 "LLM"）: opacity=1, 白色 stroke
  → 间接匹配节点（直接匹配的邻居）: opacity=0.5
  → 无关节点: opacity=0.1
  → 搜索栏右侧显示匹配数量
```

### 辅助路径：图例过滤

```
用户点击图例中 "人物" 分类
  → selectedGroup = "people"
  → 非 people 节点 opacity=0.1
  → 非 people 边 opacity=0.05
  → 再次点击同一分类 → 取消过滤
```

### 辅助路径：节点跳转

```
用户点击 concept 节点 "LLM Alignment"
  → onClickConcept("llm-alignment")
  → navigate("/wiki?page=llm-alignment")
  → Wiki Explorer 打开对应页面

用户点击 raw 节点
  → onClickRaw()
  → navigate("/raw")
```

---

## 8. 测试策略

### 单元测试（ForceGraph 组件）

| 测试场景 | 预期 |
|----------|------|
| 空图谱（0 nodes, 0 edges） | SVG 正常渲染，无节点/边元素，无 JS 错误 |
| 节点数量匹配 API 数据 | 渲染的 `<g>` 元素数量 = `graphData.nodes.length` |
| 搜索 "不存在的词" | directMatches.size = 0，所有节点 opacity 降低 |
| 搜索匹配 1 个节点 | 该节点 opacity=1 + 白色 stroke，邻居 opacity=0.5 |
| 图例点击过滤 | 选中分类节点 opacity=1，其余 opacity=0.1 |
| 缩放边界 | zoom 不低于 0.4，不超过 2.5 |

### 集成测试（GraphPage）

| 测试场景 | 预期 |
|----------|------|
| API 返回正常数据 | ForceGraph 组件挂载，无 loading spinner |
| API 返回错误 | 展示 GraphError 组件，红色错误信息 |
| API 返回空数据（0 节点） | 展示 GraphEmpty 组件，引导文案 |

### 性能测试

| 测试场景 | 预期 |
|----------|------|
| 500+ 节点渲染 | 物理模拟 240 帧内完成，浮动动画保持 30fps |
| 快速连续缩放 | 无卡顿，zoom 值连续平滑变化 |

---

## 9. 边界条件

| 场景 | 处理策略 |
|------|----------|
| **0 节点** | GraphPage 展示 GraphEmpty 空状态：图标 + "你的认知网络还是空的" 引导文案。ForceGraph 不会被挂载。 |
| **500+ 节点性能** | 物理引擎 O(n^2) 排斥力计算。500 节点 = 125,000 对。单帧约 2ms，240 帧约 0.5s。可接受。超过 1000 节点可考虑 Barnes-Hut 优化（未来）。 |
| **单个孤立节点（无边）** | 正常渲染为浮动圆点。degree=0 → radius=6（最小值）。聚类吸引力将其拉向所属分类中心。 |
| **所有节点同一 category** | groupCenters 仅包含 1 个中心点。所有节点围绕原点布局，图例仅显示 1 行。 |
| **标签超长** | 14 字截断 + "..."，SVG text 不会溢出。 |
| **raw 节点无对应 RawEntry** | 回退到 API 原始 label，按 `:` 分隔取来源前缀。 |
| **浏览器窗口极小** | ResizeObserver 自动更新 viewport，SVG 填满容器。zoom 下限 0.4x 保证最小可读性。 |
| **图谱数据加载失败** | GraphPage 展示 GraphError 红色错误卡片，包含具体错误信息。 |

---

## 10. 复用清单

| 现有资产 | 状态 | 说明 |
|----------|------|------|
| `features/graph/ForceGraph.tsx` | 刚完成 | 完整的 Rowboat 风格力导向图组件，约 800 行。含物理引擎、渲染、交互、搜索、图例。 |
| `features/graph/GraphPage.tsx` | 刚完成 | 页面壳：hero + loading/error/empty 状态 + ForceGraph 容器。 |
| `globals.css` `.graph-view` 相关规则 | 刚完成 | 6 条 CSS 规则：点阵画布背景（light/dark 双主题）、光标样式、文本不可选中。 |
| `wiki_store::build_wiki_graph()` | 已实现 | Rust 后端完整实现，含 raw 节点、concept 节点、derived-from 边、references 边。 |
| `wiki_store::extract_internal_links()` | 已实现 | 解析 markdown body 中的内部链接，驱动 backlink 边生成。 |
| `features/ingest/persist.ts` → `getWikiGraph()` | 已实现 | 前端 API 调用封装。 |
| `features/ingest/types.ts` → `WikiGraphResponse` | 已实现 | TypeScript 类型定义。 |
| `@tanstack/react-query` | 项目通用 | 图谱数据缓存，staleTime 30s。 |
