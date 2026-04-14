# 07 — 认知复利仪表盘

> **模块**: Cognitive Compound Interest Dashboard  
> **状态**: v2.0 设计稿（在现有 DashboardPage 基础上扩展）  
> **上次更新**: 2026-04-14  

---

## 1. 职责边界

仪表盘拥有以下领域，全部为 **只读**，不产生任何写操作：

| 归属 | 说明 |
|------|------|
| **聚合统计展示** | 展示 wiki 各层（raw / wiki / inbox）的汇总数字和趋势变化 |
| **增长趋势可视化** | 按天/周维度的知识页面增长折线图（基于 absorb_log） |
| **活动动态流** | 最近的 absorb 操作记录（创建/更新了哪些 wiki 页面） |
| **巡检摘要** | 最新一次 PatrolReport 的违规计数摘要，链接到完整报告 |
| **快捷入口** | 常用操作的一键跳转（开始维护、查看图谱、打开 Wiki） |

**不拥有**：
- 数据的采集和存储（属于 wiki_store、SKILL Engine、wiki_patrol）
- 维护操作的执行（属于 wiki_maintainer / Inbox）
- 统计数据的计算逻辑（属于 Rust 后端新增 `wiki_stats` 函数）

---

## 2. 依赖

```
wiki_store ──→ Dashboard（统计数据）
SKILL Engine ──→ Dashboard（absorb 历史）
wiki_patrol ──→ Dashboard（最新巡检报告）
```

| 方向 | 依赖 | 用途 |
|------|------|------|
| **数据** | `GET /api/wiki/stats`（新增） | 获取全量聚合统计：各层计数、今日/本周增量、平均字数、知识速率 |
| **数据** | `GET /api/wiki/absorb-log`（新增） | 获取最近 N 条 absorb 操作日志，驱动活动动态流和增长图表 |
| **数据** | `GET /api/wiki/raw`（已有） | 降级数据源：当 wiki_stats 端点不可用时，从 raw 列表计算基本统计 |
| **数据** | `GET /api/wiki/inbox`（已有） | 待审阅计数 |
| **数据** | `GET /api/wiki/pages`（已有） | 已维护页面计数 |
| **数据** | `GET /api/wiki/patrol/report`（新增，见 05-schema-system） | 最新巡检摘要 |
| **数据** | `GET /api/desktop/bootstrap`（已有） | 功能开关（如 private_cloud） |
| **数据** | `GET /api/broker/status`（已有） | Codex 池状态（仅 private_cloud 启用时） |
| **导航** | `react-router-dom` | 统计卡片和快捷入口的页面跳转 |

---

## 3. API

### 已有端点（继续使用）

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/wiki/raw` | raw 列表（降级统计源 + 最近入库展示） |
| `GET` | `/api/wiki/inbox` | inbox 列表（待审阅计数） |
| `GET` | `/api/wiki/pages` | wiki 页面列表（已维护计数） |
| `GET` | `/api/desktop/bootstrap` | 功能开关 |
| `GET` | `/api/broker/status` | Codex 池（可选） |

### 新增端点

| 方法 | 路径 | 响应 |
|------|------|------|
| `GET` | `/api/wiki/stats` | `WikiStats`（全量聚合统计） |
| `GET` | `/api/wiki/absorb-log` | `AbsorbLogEntry[]`（最近 50 条 absorb 操作） |

#### GET /api/wiki/stats 响应示例

```json
{
  "raw_count": 142,
  "wiki_count": 87,
  "inbox_pending": 5,
  "inbox_resolved": 63,
  "today_ingest_count": 3,
  "week_new_pages": 12,
  "avg_page_words": 450,
  "absorb_success_rate": 0.94,
  "knowledge_velocity": 1.7,
  "last_absorb_at": "2026-04-14T09:30:00Z"
}
```

#### GET /api/wiki/absorb-log 响应示例

```json
{
  "entries": [
    {
      "entry_id": 142,
      "timestamp": "2026-04-14T09:30:00Z",
      "action": "create",
      "page_slug": "llm-alignment",
      "page_title": "LLM Alignment",
      "page_category": "concept"
    },
    {
      "entry_id": 139,
      "timestamp": "2026-04-14T08:15:00Z",
      "action": "update",
      "page_slug": "transformer-architecture",
      "page_title": "Transformer 架构",
      "page_category": "topic"
    }
  ]
}
```

---

## 4. 数据模型

### Rust 侧

```rust
/// 全量聚合统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikiStats {
    pub raw_count: usize,                // raw/ 条目总数
    pub wiki_count: usize,               // wiki/ 页面总数
    pub concept_count: usize,
    pub people_count: usize,
    pub topic_count: usize,
    pub compare_count: usize,
    pub edge_count: usize,
    pub orphan_count: usize,
    pub inbox_pending: usize,
    pub inbox_resolved: usize,
    pub today_ingest_count: usize,       // 今日新增 raw 数
    pub week_new_pages: usize,           // 本周新增 wiki 页面数
    pub avg_page_words: usize,           // 平均字数
    pub absorb_success_rate: f64,        // 成功率
    pub knowledge_velocity: f64,         // 近7天日均新增
    pub last_absorb_at: Option<String>,
}

/// 单条 absorb 操作日志
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AbsorbLogEntry {
    pub entry_id: u32,                   // raw entry ID that was absorbed
    pub timestamp: String,               // ISO-8601
    pub action: String,                  // "create" | "update" | "skip"
    pub page_slug: Option<String>,       // wiki page affected (None for skip)
    pub page_title: Option<String>,      // wiki page title (None for skip)
    pub page_category: Option<String>,   // "concept"|"people"|"topic"|"compare"
}
```

### 前端侧（TypeScript）

```typescript
interface WikiStats {
  raw_count: number;
  wiki_count: number;
  concept_count: number;
  people_count: number;
  topic_count: number;
  compare_count: number;
  edge_count: number;
  orphan_count: number;
  inbox_pending: number;
  inbox_resolved: number;
  today_ingest_count: number;
  week_new_pages: number;
  avg_page_words: number;
  absorb_success_rate: number;
  knowledge_velocity: number;
  last_absorb_at: string | null;
}

interface AbsorbLogEntry {
  entry_id: number;
  timestamp: string;
  action: "create" | "update" | "skip";
  page_slug: string | null;
  page_title: string | null;
  page_category: string | null;
}

interface DashboardMetrics {
  daily_ingest_count: number;
  weekly_wiki_growth: number;
  absorb_success_rate: number;
  avg_page_words: number;
  knowledge_velocity: number;
}
```

---

## 5. Rust 实现要点

### `wiki_store::wiki_stats(paths: &WikiPaths) -> Result<WikiStats>`

新增函数，聚合计算跨层统计：

```rust
pub fn wiki_stats(paths: &WikiPaths) -> Result<WikiStats> {
    let raws = list_raw_entries(paths).unwrap_or_default();
    let pages = list_all_wiki_pages(paths).unwrap_or_default();
    let inbox = load_inbox_file(paths).unwrap_or_default();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let today_ingest_count = raws.iter()
        .filter(|r| r.date == today)
        .count();

    let week_ago = (chrono::Local::now() - chrono::Duration::days(7))
        .format("%Y-%m-%d").to_string();
    // ... 从 absorb_log 或 page created_at 统计本周新增

    // absorb_success_rate = resolved / (resolved + pending)
    // knowledge_velocity = week_new_pages / 7.0
    // avg_page_words = 统计各页面 body 字数的平均值

    Ok(WikiStats { ... })
}
```

**性能注意**：此函数遍历全量文件系统。在 100+ 页面规模下预期耗时 < 200ms。结果可在 desktop-server 层缓存 15s（与前端 staleTime 匹配）。

### Absorb Log 存储

absorb_log 写入 `.clawwiki/.clawwiki/absorb_log.jsonl`（追加式 JSONL），每次 absorb 操作时由 wiki_maintainer 追加一行。`GET /api/wiki/absorb-log` 读取最近 50 行倒序返回。

---

## 6. 前端实现要点

### 页面布局（从上到下）

#### 6.1 Hero 区段

```
┌────────────────────────────────────────────┐
│  你的外脑                                    │
│  87 篇知识页面 · 知识速率 1.7 页/天            │
└────────────────────────────────────────────┘
```

- 标题：`"你的外脑"`，serif 字体 18px，与现有 hero 风格统一
- 副标题：核心指标（总页面数 + 知识速率），muted-foreground/60

#### 6.2 统计卡片网格

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 今日入库  │ │ 本周新增  │ │ 维护成功率│ │ 待处理   │
│    3     │ │   12     │ │   94%    │ │    5     │
│ 共 142 条 │ │ 知识页面  │ │ absorb   │ │ inbox 任务│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- 复用现有 StatCard 组件，调整数据源
- 4 列网格（桌面），2 列（移动端）
- 每张卡片左边框带语义 tint 色条
- 点击卡片跳转到对应页面

#### 6.3 活动动态流

```
┌─ 最近动态 ────────────────────── 查看全部 → ─┐
│ 09:30  新建 LLM Alignment (概念)  ← raw #142 │
│ 08:15  更新 Transformer 架构 (主题) ← raw #139│
│ 昨日   新建 Elon Musk (人物)      ← raw #137 │
│ ...                                           │
└───────────────────────────────────────────────┘
```

- 列表项：时间 + 动作（新建/更新）+ 页面标题 + 分类 badge + 来源 raw
- 点击列表项 → 导航到对应 wiki 页面
- 最多展示 8 条，"查看全部" 链接到完整日志页面

#### 6.4 增长图表

```
┌─ 知识增长 ─────────────────────────────────┐
│                                  ╱─        │
│                           ╱──╱──           │
│                    ╱──╱──                  │
│             ╱──╱──                         │
│      ╱──╱──                                │
│ ╱──╱──                                     │
│ 4/7  4/8  4/9  4/10  4/11  4/12  4/13  4/14│
└─────────────────────────────────────────────┘
```

- 简易 SVG 折线图（不引入图表库，手绘 `<polyline>`）
- X 轴：近 7 天日期
- Y 轴：累计页面数
- 数据来源：absorb_log 按天分组

#### 6.5 巡检摘要

```
┌─ 知识质量 ──────────────────── 查看报告 → ──┐
│  ● 5 schema 违规  ● 3 孤儿素材  ● 2 stub    │
│  最近巡检：2026-04-14 10:30                   │
└───────────────────────────────────────────────┘
```

- 消费 `GET /api/wiki/patrol/report` 返回的 PatrolReport.summary
- 各类违规用 color-coded badge 展示
- "查看报告" 链接打开 Settings Modal → Schema tab

#### 6.6 快捷操作

```
┌──────────────────────────────────────────────┐
│  [开始维护]  [查看图谱]  [打开 Wiki]  [问问外脑] │
└──────────────────────────────────────────────┘
```

- 4 个按钮行，分别导航到 /inbox、/graph、/wiki、/ask
- 复用现有 QuickAsk CTA 的设计语言

### 组件结构

```
DashboardPage (重构)
├── DashboardHero           // 标题 + 核心指标
├── StatCardsGrid           // 4 统计卡片
│   └── StatCard (复用)     // 单个统计卡片
├── ActivityFeed            // 活动动态流
│   └── ActivityItem        // 单条活动记录
├── GrowthChart             // SVG 折线图
├── PatrolSummary           // 巡检摘要卡片
├── QuickActions            // 快捷操作按钮组
└── RecentEntries (复用)    // 最近入库列表（保留向后兼容）
```

---

## 7. 交互流程

### 主路径：打开仪表盘

```
用户点击侧边栏 "仪表盘"
  → DashboardPage 加载
  → 并行发起 5+ 个 React Query 请求：
    - GET /api/wiki/stats
    - GET /api/wiki/absorb-log
    - GET /api/wiki/patrol/report
    - GET /api/wiki/raw（降级 + 最近入库）
    - GET /api/desktop/bootstrap
  → 各区段按数据到达顺序渐进渲染（skeleton → 数据）
  → 全部就绪 → 完整仪表盘展示
```

### 辅助路径：点击统计卡片

```
用户点击 "今日入库" 卡片
  → Link to="/raw"
  → 导航到素材库页面

用户点击 "待处理" 卡片
  → Link to="/inbox"
  → 导航到 Inbox 页面
```

### 辅助路径：点击活动项

```
用户点击 "新建 LLM Alignment" 活动条目
  → navigate("/wiki?page=llm-alignment")
  → Wiki Explorer 打开对应页面
```

### 降级路径：新端点不可用

```
GET /api/wiki/stats 返回 404（后端未升级）
  → 降级到现有逻辑：
    - 从 raw 列表计算 today_ingest_count
    - 从 wiki/pages 列表获取 wiki_count
    - 其他指标显示 "—"（同 v1 行为）
```

---

## 8. 测试策略

### 单元测试（Rust）

| 测试场景 | 预期 |
|----------|------|
| `wiki_stats` 空 wiki | 所有计数为 0，velocity = 0.0，success_rate = 0.0 |
| `wiki_stats` 有数据 | today_ingest_count 正确过滤今日条目 |
| `wiki_stats` absorb_success_rate | = resolved / (resolved + pending) |
| `wiki_stats` knowledge_velocity | = week_new_pages / 7.0 |
| absorb_log 读取最近 50 条 | 返回倒序，最多 50 条 |

### 前端组件测试

| 测试场景 | 预期 |
|----------|------|
| 统计卡片展示正确数字 | mock WikiStats 数据，验证各卡片 value 渲染正确 |
| 活动动态流展示最近条目 | mock AbsorbLogEntry[]，验证列表项数量和内容 |
| 空状态 | 全新安装（0 数据），展示引导文案而非空白 |
| 降级模式 | stats 端点 404 → 回退到 raw 列表计算，无 JS 错误 |
| 统计卡片点击导航 | 点击 "今日入库" → 路由变为 /raw |

### 集成测试（API）

| 测试场景 | 预期 |
|----------|------|
| `GET /api/wiki/stats`（空 wiki） | 200，全零统计 |
| `GET /api/wiki/absorb-log`（无日志） | 200，entries 为空数组 |

---

## 9. 边界条件

| 场景 | 处理策略 |
|------|----------|
| **全新安装（0 数据）** | 所有统计卡片显示 `0`（非 "—"，因为 0 是真实值）。活动动态流显示空状态引导："入库第一条素材，仪表盘就会活起来"。增长图表显示平坦的零线。 |
| **活跃 wiki（1000+ 条目）** | `wiki_stats` 函数遍历全量文件，预期 < 500ms。前端 staleTime=15s 避免频繁请求。增长图表仍只展示近 7 天。 |
| **长期不活跃（无近期 absorb）** | knowledge_velocity 趋近 0。活动动态流展示历史记录。last_absorb_at 显示具体日期。无特殊空状态处理。 |
| **巡检报告不存在** | PatrolSummary 区段展示 "尚未运行巡检"，附带 "立即巡检" 按钮（跳转到 Settings → Schema tab）。 |
| **多个请求部分失败** | 各区段独立渲染。stats 失败 → 降级；absorb-log 失败 → 活动流显示错误提示；其余区段不受影响。 |
| **时区差异** | `today_ingest_count` 使用 Rust `chrono::Local::now()` 计算本地日期，与前端 `formatLocalDate(new Date())` 语义一致。 |
| **absorb_log 文件过大** | JSONL 格式，仅读取末尾 50 行。可用 `seek` 到文件末尾反向扫描，避免全量加载。 |

---

## 10. 复用清单

| 现有资产 | 复用方式 |
|----------|----------|
| `features/dashboard/DashboardPage.tsx` | 在现有基础上重构：保留 hero/StatCard/RecentEntries 结构，新增 ActivityFeed/GrowthChart/PatrolSummary/QuickActions 区段 |
| `StatCard` 组件（DashboardPage 内部） | 直接复用，调整 label/value/hint 属性。考虑提取为独立文件以便其他页面引用。 |
| `RecentEntries` 组件（DashboardPage 内部） | 保留在页面底部，作为降级数据展示和最近入库速览 |
| `formatLocalDate` 函数（DashboardPage 内部） | 本地日期格式化工具函数，统计计算复用 |
| `listRawEntries()`、`listInboxEntries()`、`listWikiPages()` | 已有的前端 API 调用函数，降级模式下直接使用 |
| `getBootstrap()`、`getBrokerStatus()` | 已有的前端 API 调用函数，继续使用 |
| `@tanstack/react-query` | 所有数据请求的缓存与状态管理 |
| `dashboardKeys` 查询键工厂 | 已有的 query key 命名空间，新增 stats / absorb-log 键 |
| `react-router-dom` `<Link>` | 统计卡片和活动项的导航 |
| `lucide-react` 图标 | 已在项目中广泛使用 |
