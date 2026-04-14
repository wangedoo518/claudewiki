# 05 — Schema 模板 + 巡检系统

> **模块**: Schema-driven Quality Assurance  
> **状态**: v2.0 设计稿  
> **上次更新**: 2026-04-14  

---

## 1. 职责边界

Schema 系统拥有以下领域，其他模块不得侵入：

| 归属 | 说明 |
|------|------|
| **模板定义** | 管理 `.clawwiki/schema/templates/` 下的 concept.md、people.md、topic.md、compare.md 四类模板；定义每类页面的 frontmatter 必填/可选字段与校验规则 |
| **Frontmatter 校验** | 对 wiki/ 层的每个页面执行 frontmatter 字段合规检查（必填缺失、类型不匹配、枚举越界） |
| **巡检调度** | 拥有 `/patrol` 定时/手动巡检的调度逻辑，包括调度周期配置、上次执行时间记录 |
| **违规报告** | 生成结构化 PatrolReport，包含各类违规的分类计数与逐条明细，供 Dashboard 和 Settings Modal 消费 |
| **策略管理** | 管理 `.clawwiki/schema/policies/` 下的 conflict.md、maintenance.md、deprecation.md、naming.md 策略文件（只读展示，人写优先） |

**不拥有**：
- wiki 页面的实际 CRUD（属于 wiki_store）
- 巡检结果的修复执行（属于 wiki_maintainer / 用户手动）
- CLAUDE.md / AGENTS.md 的解析执行（属于 SKILL Engine）

---

## 2. 依赖

```
wiki_store ──→ schema 系统（读取所有 wiki 页面用于校验）
wiki_patrol ──→ schema 系统（新 crate，检测函数）
desktop-server ──→ schema 系统（HTTP API 暴露）
```

| 方向 | 依赖 | 用途 |
|------|------|------|
| **读** | `wiki_store::list_all_wiki_pages()` | 获取全量页面列表，驱动巡检遍历 |
| **读** | `wiki_store::read_wiki_page(slug)` | 读取单页 frontmatter + body，执行字段校验 |
| **读** | `wiki_store::list_raw_entries()` | 获取 raw 层列表，用于检测孤儿 raw（无对应 wiki 页面） |
| **新建** | `wiki_patrol` crate | 新 Rust crate，封装所有检测函数与报告生成逻辑 |
| **暴露** | `desktop-server` | 挂载 `/api/wiki/patrol` 和 `/api/wiki/patrol/report` 路由 |
| **前端** | Settings Modal → Schema 区段 | 模板预览、巡检配置、报告展示 |

---

## 3. API

### 已有端点（保持不变）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/wiki/schema` | 返回 `schema/CLAUDE.md` 内容、路径、字节数 |
| `PUT` | `/api/wiki/schema` | 覆写 `schema/CLAUDE.md`，人写路径 |

### 新增端点

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| `POST` | `/api/wiki/patrol` | `{ full?: boolean }` | `PatrolReport`（完整巡检结果） |
| `GET` | `/api/wiki/patrol/report` | — | `PatrolReport \| null`（最近一次报告，缓存在内存或磁盘） |
| `GET` | `/api/wiki/schema/templates` | — | `SchemaTemplate[]`（所有模板定义） |
| `GET` | `/api/wiki/schema/policies` | — | `PolicyFile[]`（所有策略文件的元信息 + 内容） |

#### POST /api/wiki/patrol 响应示例

```json
{
  "run_at": "2026-04-14T10:30:00Z",
  "duration_ms": 342,
  "total_pages_scanned": 87,
  "violations": [
    {
      "kind": "orphan_raw",
      "severity": "warning",
      "target": "raw-42",
      "message": "raw #42 无对应 wiki 页面"
    },
    {
      "kind": "schema_violation",
      "severity": "error",
      "target": "wiki-llm-alignment",
      "message": "people 模板必填字段 birth_year 缺失"
    }
  ],
  "summary": {
    "orphan_raw": 3,
    "stale_pages": 1,
    "schema_violations": 5,
    "oversized_pages": 0,
    "stub_pages": 2,
    "confidence_decay": 1,
    "uncrystallized": 0,
    "total": 12
  }
}
```

---

## 4. 数据模型

### Rust 侧（`wiki_patrol` crate）

```rust
/// 模板字段定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateField {
    pub name: String,           // 字段名，如 "title", "birth_year"
    pub required: bool,         // 是否必填
    pub field_type: FieldType,  // String | Number | Date | Enum(Vec<String>)
    pub description: String,    // 字段说明
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FieldType {
    String,
    Number,
    Date,
    Enum(Vec<String>),
}

/// 模板定义（对应一个 templates/*.md 文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaTemplate {
    pub category: String,           // "concept" | "people" | "topic" | "compare"
    pub display_name: String,       // "概念", "人物", "主题", "对比"
    pub fields: Vec<TemplateField>, // frontmatter 字段定义
    pub body_hint: String,          // body 区域的写作提示
    pub file_path: String,          // 模板文件磁盘路径
}

// 巡检检测结果复用 01-skill-engine.md §4 的权威定义：
// - PatrolIssue { kind: PatrolIssueKind, page_slug, description, suggested_action }
// - PatrolIssueKind: Orphan | Stale | SchemaViolation | Oversized | Stub
//                    | ConfidenceDecay | Uncrystallized   ← v2 新增
// 本模块的 detect_* 函数统一返回 Vec<PatrolIssue>，不再使用独立的
// ViolationKind/Severity/ValidationError 类型。

/// 巡检调度配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatrolSchedule {
    pub enabled: bool,
    pub interval_hours: u32,         // 自动巡检间隔（小时）
    pub stale_threshold_days: u32,   // 页面过期天数阈值
    pub min_page_words: u32,         // stub 判断最小字数
    pub max_page_words: u32,         // oversized 判断最大字数
}

```

> **数据模型定义**: 见 `01-skill-engine.md §4` 的 PatrolReport / PatrolSummary / PatrolIssue 权威定义。

### 前端侧（TypeScript）

```typescript
interface SchemaTemplate {
  category: string;
  display_name: string;
  fields: TemplateField[];
  body_hint: string;
  file_path: string;
}

interface TemplateField {
  name: string;
  required: boolean;
  field_type: "String" | "Number" | "Date" | { Enum: string[] };
  description: string;
}

// PatrolReport / PatrolSummary / ValidationError: 见 01-skill-engine.md §4 权威定义
```

---

## 5. Rust 实现要点

### 新 crate: `wiki_patrol`

```
rust/crates/wiki_patrol/
├── Cargo.toml
└── src/
    └── lib.rs
```

**依赖**: `wiki_store`（读取页面和 raw 列表）、`serde`、`chrono`。

#### 核心检测函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `detect_orphans` | `(paths: &WikiPaths) -> Vec<PatrolIssue>` | 扫描 raw/ 中无对应 wiki 页面的条目。通过 `source_raw_id` 反向索引判断。 |
| `detect_stale` | `(paths: &WikiPaths, threshold_days: u32) -> Vec<PatrolIssue>` | 扫描 wiki 页面的 `created_at`，超过阈值天数未更新的标记为 stale。 |
| `detect_schema_violations` | `(paths: &WikiPaths, templates: &[SchemaTemplate]) -> Vec<PatrolIssue>` | 按页面 category 匹配模板，逐字段校验 frontmatter。缺失必填字段 = error，类型不匹配 = warning。 |
| `detect_oversized` | `(paths: &WikiPaths, max_words: u32) -> Vec<PatrolIssue>` | 统计页面 body 字数（中文按字符计），超过阈值的标记。 |
| `detect_stubs` | `(paths: &WikiPaths, min_words: u32) -> Vec<PatrolIssue>` | 统计页面 body 字数，低于阈值的标记为 stub。 |
| `detect_confidence_decay` | `(paths: &WikiPaths) -> Vec<PatrolIssue>` | 扫描 confidence 应衰减的页面: newest_source > 90 天 且 confidence = 0.9 → 建议降级为 0.6。每周执行。 |
| `detect_uncrystallized` | `(paths: &WikiPaths, lookback_days: u32) -> Vec<PatrolIssue>` | 检查最近 N 天内的 /query 回答是否已写入 raw/。未结晶的标记为 warning。 |
| `run_full_patrol` | `(paths: &WikiPaths, schedule: &PatrolSchedule) -> PatrolReport` | 串行调用上述全部检测函数，汇总为 PatrolReport。记录耗时。 |

#### detect_confidence_decay — Confidence 衰减检测

每周执行一次, 扫描所有 wiki 页面, 检测 confidence 应衰减但未衰减的页面。这是认知复利闭环中 "时效性保障" 的关键机制: 知识不会永远保持高置信度, 缺乏新来源佐证的页面应自动降级。

```rust
/// 检测 confidence 应衰减的页面。
///
/// 规则:
///   - confidence = 0.9 (high) 且 newest_source > 90 天 → 建议降级为 0.6 (medium)
///   - confidence = 0.6 (medium) 且 newest_source > 180 天 → 建议降级为 0.2 (low)
///   - 手写页面 (owner = "user") 不参与衰减检测
///
/// 建议执行频率: 每周一次 (通过 PatrolSchedule 配置)
pub fn detect_confidence_decay(
    paths: &WikiPaths,
) -> Vec<PatrolIssue> {
    let mut issues = Vec::new();
    let all_pages = wiki_store::list_all_wiki_pages(paths).unwrap_or_default();
    let now = chrono::Utc::now();

    for page in &all_pages {
        // 跳过手写页面
        let (summary, _body) = match wiki_store::read_wiki_page(paths, &page.slug) {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        if summary.owner == "user" { continue; }

        let confidence = page.confidence;
        let newest_source_age = compute_newest_source_age_days(paths, &page.slug, &now);

        // high → medium 衰减
        if confidence >= 0.85 && newest_source_age > 90 {
            issues.push(PatrolIssue {
                kind: PatrolIssueKind::ConfidenceDecay,
                page_slug: page.slug.clone(),
                description: format!(
                    "页面 '{}' confidence={:.1}, 但最新来源已过 {} 天, 建议降级为 0.6",
                    page.title, confidence, newest_source_age
                ),
                suggested_action: format!(
                    "执行 wiki_store::update_page_confidence(paths, \"{}\", 0.6)",
                    page.slug
                ),
            });
        }

        // medium → low 衰减
        if confidence >= 0.5 && confidence < 0.85 && newest_source_age > 180 {
            issues.push(PatrolIssue {
                kind: PatrolIssueKind::ConfidenceDecay,
                page_slug: page.slug.clone(),
                description: format!(
                    "页面 '{}' confidence={:.1}, 最新来源已过 {} 天, 建议降级为 0.2",
                    page.title, confidence, newest_source_age
                ),
                suggested_action: format!(
                    "执行 wiki_store::update_page_confidence(paths, \"{}\", 0.2)",
                    page.slug
                ),
            });
        }
    }
    issues
}
```

#### detect_uncrystallized — 未结晶检测

检查最近 N 天内的 `/query` 回答是否已正常写入 `raw/` 目录。这是对话结晶 (Crystallization) 闭环的健康检查: 如果 query 回答未被结晶, 说明结晶机制可能出现故障, 正反馈闭环断裂。

```rust
/// 检测未结晶的 query 回答。
///
/// 逻辑:
///   1. 读取最近 lookback_days 天内的 query 日志 (从应用日志或 absorb_log 推断)
///   2. 对比 raw/entries/ 中是否存在对应的 query-{slug}.md 文件
///   3. 缺失的标记为 warning
///
/// 建议执行频率: 每周一次
/// 默认 lookback_days: 7
pub fn detect_uncrystallized(
    paths: &WikiPaths,
    lookback_days: u32,
) -> Vec<PatrolIssue> {
    let mut issues = Vec::new();
    let cutoff = chrono::Utc::now()
        - chrono::Duration::days(lookback_days as i64);

    // 读取所有 raw entries, 筛选 source="query" 且在时间窗口内的
    let raw_entries = wiki_store::list_raw_entries(paths).unwrap_or_default();
    let query_raws: Vec<_> = raw_entries.iter()
        .filter(|e| e.source == "query" && e.ingested_at >= cutoff.to_rfc3339())
        .collect();

    // 如果近 lookback_days 天内有 query 活动但 raw/ 中没有 query 类型 entry,
    // 则结晶机制可能失效。
    // 注: 这里简化为检查 raw/ 中 query 条目数量是否合理,
    // 完整实现需要对接 query 执行日志。
    if query_raws.is_empty() {
        // 检查是否有最近的 query 活动 (通过应用日志或其他信号)
        // 如果有 query 活动但 0 条 query raw → 结晶失效
        let has_recent_query_activity = check_recent_query_activity(paths, lookback_days);
        if has_recent_query_activity {
            issues.push(PatrolIssue {
                kind: PatrolIssueKind::Uncrystallized,
                page_slug: String::new(), // 非页面级别, 系统级警告
                description: format!(
                    "最近 {} 天有 /query 活动, 但 raw/ 中无 query 类型条目, 对话结晶机制可能失效",
                    lookback_days
                ),
                suggested_action: "检查 query_wiki 函数的结晶步骤 (01-skill-engine.md §5.2 步骤 6) 是否正常执行".to_string(),
            });
        }
    }

    issues
}

/// 辅助: 检查最近是否有 query 活动 (简化实现)
fn check_recent_query_activity(paths: &WikiPaths, lookback_days: u32) -> bool {
    // 实现: 检查应用日志中是否有 POST /api/wiki/query 请求记录
    // 或检查 wiki_store 中是否有 query 相关的审计日志
    // MVP: 返回 false (不触发误报), 后续接入完整日志系统
    false
}
```

#### 模板解析

从 `.clawwiki/schema/templates/*.md` 读取模板文件。模板文件格式约定：

```markdown
---
category: people
display_name: 人物
---

## 必填字段

- title (String): 人物姓名
- birth_year (Number): 出生年份
- domain (Enum: [科技, 哲学, 艺术, 商业, 其他]): 主要领域

## 可选字段

- nationality (String): 国籍
- summary (String): 一句话简介

## Body 提示

请按以下结构撰写：生平概述 → 主要成就 → 与其他概念的关联。
```

`parse_template(path) -> SchemaTemplate` 函数负责将此格式解析为结构化数据。

---

## 6. 前端实现要点

### 位置：Settings Modal → Schema 区段

Schema 相关 UI 从独立的 `SchemaEditorPage` 迁移到 Settings Modal 的两个子 tab：

#### 6.1 SKILL 编辑器 tab（原 SchemaEditorPage 功能）

- 展示 `schema/CLAUDE.md` 内容（只读/编辑切换）
- 展示 `schema/AGENTS.md` 内容
- 保留原有 Edit / Save / Cancel 操作栏
- 代码复用：直接搬迁 `SchemaEditorPage` 的 SchemaBody 组件

#### 6.2 Schema 模板 tab

- **模板列表**：左侧展示 4 类模板卡片（concept / people / topic / compare），点击展开字段详情
- **模板预览**：右侧展示选中模板的字段表格（名称、类型、是否必填、说明）
- **巡检配置**：
  - 开关：启用/禁用自动巡检
  - 间隔：下拉选择（6h / 12h / 24h / 手动）
  - 阈值：过期天数、最小字数、最大字数（数字输入框）
- **手动巡检按钮**：点击触发 `POST /api/wiki/patrol`，展示进度 spinner
- **最新报告**：
  - 摘要卡片：各类违规计数（color-coded badge）
  - 展开列表：逐条违规，点击 target 可跳转到对应 wiki 页面

#### 组件结构

```
SettingsModal
└── SchemaSection
    ├── TemplateList          // 4 类模板卡片
    ├── TemplateDetail        // 选中模板的字段表
    ├── PatrolConfig          // 巡检参数配置
    ├── PatrolTriggerButton   // 手动触发 + spinner
    └── PatrolReportView      // 最新报告摘要 + 违规列表
```

---

## 7. 交互流程

### 主路径：手动巡检

```
用户打开 Settings Modal
  → 点击左侧 "Schema 模板" tab
  → 看到 4 类模板卡片 + 巡检配置
  → 点击 "立即巡检" 按钮
  → 按钮变为 spinner + "巡检中..."
  → POST /api/wiki/patrol 返回 PatrolReport
  → 摘要卡片刷新（如 "5 schema 违规, 3 孤儿 raw, 2 stub"）
  → 用户展开违规列表
  → 点击某条违规的 target
  → 关闭 Settings Modal → 导航到对应 wiki 页面
```

### 辅助路径：查看模板

```
用户点击 "people" 模板卡片
  → 右侧展示字段表格：
    | 字段名    | 类型   | 必填 | 说明     |
    | title     | String | Y    | 人物姓名 |
    | birth_year| Number | Y    | 出生年份 |
    | domain    | Enum   | Y    | 主要领域 |
    | ...       |        |      |          |
  → 用户可只读浏览，理解 wiki 页面应遵循的结构
```

### 辅助路径：编辑 SKILL 文件

```
Settings Modal → 点击 "SKILL 编辑器" tab
  → 展示 CLAUDE.md 内容（只读模式）
  → 点击 "Edit" → 进入编辑模式
  → 修改内容 → 点击 "Save"
  → PUT /api/wiki/schema → 成功提示
```

---

## 8. 测试策略

### 单元测试（Rust, `wiki_patrol` crate）

| 测试场景 | 预期 |
|----------|------|
| 模板解析：合法 people.md | 返回正确的 SchemaTemplate，字段数量和类型匹配 |
| 模板解析：语法错误（缺少 frontmatter） | 返回描述性错误，不 panic |
| `detect_schema_violations`：people 页面缺失 `birth_year` | 返回 1 条 PatrolIssue { kind: SchemaViolation } |
| `detect_schema_violations`：所有字段合规 | 返回空 Vec |
| `detect_orphans`：3 条 raw 无对应 wiki | 返回 3 条 PatrolIssue { kind: Orphan } |
| `detect_orphans`：所有 raw 均有 wiki | 返回空 Vec |
| `detect_stale`：阈值 30 天，1 页面 45 天前创建 | 返回 1 条 PatrolIssue { kind: Stale } |
| `detect_stubs`：阈值 100 字，1 页面仅 20 字 | 返回 1 条 StubPage |
| `detect_oversized`：阈值 5000 字，1 页面 6000 字 | 返回 1 条 OversizedPage |
| `detect_confidence_decay`：1 页面 confidence=0.9, newest_source=100 天前 | 返回 1 条 PatrolIssue { kind: ConfidenceDecay }, 建议降级为 0.6 |
| `detect_confidence_decay`：1 页面 confidence=0.6, newest_source=200 天前 | 返回 1 条 PatrolIssue { kind: ConfidenceDecay }, 建议降级为 0.2 |
| `detect_confidence_decay`：1 页面 confidence=0.9, newest_source=20 天前 | 返回空 Vec (无需衰减) |
| `detect_confidence_decay`：owner="user" 的手写页面 | 跳过, 返回空 Vec |
| `detect_uncrystallized`：有 query 活动但 raw/ 无 query 条目 | 返回 1 条 PatrolIssue { kind: Uncrystallized } |
| `detect_uncrystallized`：有 query 活动且 raw/ 有 query 条目 | 返回空 Vec |
| `detect_uncrystallized`：无 query 活动 | 返回空 Vec (不误报) |
| `run_full_patrol`：综合场景 | summary.total = 各子项之和 |

### 集成测试（API）

| 测试场景 | 预期 |
|----------|------|
| `POST /api/wiki/patrol`（空 wiki） | 返回 200，violations 为空数组，total = 0 |
| `GET /api/wiki/patrol/report`（从未运行过） | 返回 200，body 为 null |
| `GET /api/wiki/schema/templates` | 返回 4 个模板对象 |

### 前端测试

| 测试场景 | 预期 |
|----------|------|
| Schema tab 渲染 4 个模板卡片 | 卡片数量 = 4，标签分别为概念/人物/主题/对比 |
| 点击巡检按钮 → mock 返回 report | 摘要卡片更新，违规列表展示 |
| SKILL 编辑器 Save 成功 | toast 提示 "Saved"，退出编辑模式 |

---

## 9. 边界条件

| 场景 | 处理策略 |
|------|----------|
| **空 wiki**（0 页面，0 raw） | 巡检正常返回：total_pages_scanned = 0，violations = []，summary 全零。前端展示 "知识库为空，暂无需巡检" 状态。 |
| **全部合规**（所有页面通过校验） | PatrolReport.summary.total = 0。前端展示 "全部通过" 绿色状态。 |
| **模板文件语法错误** | `parse_template` 返回 Err，`detect_schema_violations` 跳过该类别并在 report 中附加一条 info 级别的 "模板解析失败" 记录。 |
| **模板目录不存在** | 退化为零模板模式，跳过 schema 校验，仅执行 orphan/stale/size 检测。 |
| **超大 wiki（1000+ 页面）** | `run_full_patrol` 单线程串行扫描，预期耗时 < 2s（纯 I/O + 字符串解析）。前端 spinner 覆盖整个交互周期。 |
| **并发巡检请求** | 服务端用 `Mutex` 保护巡检执行，后到请求排队等待。不返回 409，而是排队执行。 |
| **磁盘读取失败（权限问题）** | 单页读取失败不中断整体巡检，该页面计入 1 条 error 级别违规："读取失败: {io_error}"。 |

---

## 10. 复用清单

| 现有资产 | 复用方式 |
|----------|----------|
| `features/schema/SchemaEditorPage.tsx` | SchemaBody 组件搬入 Settings Modal 的 SKILL 编辑器 tab。SchemaEditorPage 作为独立路由保留（向后兼容），内部渲染同一组件。 |
| `wiki_store::list_all_wiki_pages()` | 巡检遍历的数据源，直接调用 |
| `wiki_store::read_wiki_page(slug)` | 单页 frontmatter 校验时读取内容 |
| `wiki_store::list_raw_entries()` | orphan 检测的 raw 层数据源 |
| `.clawwiki/schema/templates/*.md` | 模板定义文件，新增解析逻辑 |
| `.clawwiki/schema/policies/*.md` | 策略文件，只读展示 |
| `getWikiSchema()` / `putWikiSchema()` | 前端 persist 层已有的 API 调用函数 |
| `@tanstack/react-query` | 巡检报告的缓存与刷新策略 |
