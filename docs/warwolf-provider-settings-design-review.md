# Warwolf 模型服务设置改版设计方案

## 1. 背景

Warwolf 当前的设置页已经具备基础的两栏结构，但“模型服务”仍停留在只读摘要层：

- 设置页左侧为一级导航，右侧为内容区。
- Provider 区域目前只展示运行时模型、已发现的 provider 列表和 warning。
- 后端数据源仍是桌面运行时的简化快照，只包含少量 provider 与认证状态。

与之相比：

- `cherry-studio` 已经形成成熟的“设置导航 + Provider 列表 + Provider 详情”的交互壳。
- `clawhub123` 已经形成成熟的 provider/openclaw 领域模型、预设目录、CRUD、live config 同步、默认模型、模型目录、env/tools 配置等能力。

因此，本次改版不建议简单复制 Cherry Studio 的业务实现，而应采用：

- **交互层参考 Cherry Studio**
- **数据模型与能力层对齐 clawhub123**

这会让 Warwolf 既拥有 Cherry 风格的可用性，也拥有 clawhub123 对“多渠道模型接入”的真实可扩展能力。

## 2. 设计目标

### 2.1 产品目标

在 Warwolf 设置页中，提供一个完整的“模型服务管理中心”，支持：

- 浏览和搜索支持的渠道模型/provider preset
- 新增、编辑、删除、启停 provider
- 配置 API Key、Base URL、协议类型、模型列表
- 将 provider 同步到 OpenClaw live config
- 管理 OpenClaw 默认模型、模型目录、env、tools
- 在后续版本中承接测速、健康检查、故障切换、使用量等能力

### 2.2 交互目标

- 让“模型服务”从摘要信息页，升级为高频操作页
- 保持 Warwolf 当前设置页的信息架构稳定，不打断已有心智
- 让 provider 的新增和编辑以“可搜索、可比较、可扩展”的方式呈现

### 2.3 技术目标

- 避免把 UI 直接绑定到写死的 provider 组件分支
- 复用 `clawhub123` 已经验证过的 provider preset、OpenClaw 配置能力和同步能力
- 让 Warwolf 后续可以分阶段接入更多渠道，而不是每接一个渠道都改一版页面结构

## 3. 现状分析

## 3.1 Cherry Studio 的可借鉴点

Cherry Studio 的 Provider 设置页，本质是一个稳定的三层交互结构：

- 第一层：设置页一级导航
- 第二层：Provider 列表面板
- 第三层：Provider 详情编辑面板

其优势在于：

- 搜索、筛选、排序、添加 provider 的入口稳定
- 右侧详情区专注“当前选中 provider”的配置
- 模型列表管理被下沉到详情页底部，形成自然工作流
- Provider 特殊配置通过渐进披露呈现，而不是一开始塞满所有字段

适合 Warwolf 直接复用的是 **页面壳和操作节奏**，而不是其大量按 provider 手写分支的实现方式。

## 3.2 clawhub123 的可借鉴点

`clawhub123` 已经具备 Warwolf 真正需要的 provider 能力底座：

- 统一的 provider 类型与分类定义
- 丰富的 provider preset 目录
- OpenClaw 专属 provider 配置结构
- managed provider 的数据库持久化
- provider models 独立存储
- 同步 provider 到 openclaw.json
- 读取和写入 `agents.defaults.model`
- 读取和写入 `agents.defaults.models`
- 读取和写入 `env`
- 读取和写入 `tools`
- 从 OpenClaw live config 导入 provider
- 健康扫描与 live provider 识别

这意味着 Warwolf 的问题已经不是“如何发明一套 Provider 系统”，而是“如何把这些能力以合适的设置交互呈现出来”。

## 3.3 Warwolf 当前差距

Warwolf 当前缺少的不是一个页面，而是三层能力同时缺失：

- **视图层缺失**：没有 provider 列表和详情编辑器
- **状态层缺失**：没有 managed provider 的前端查询/变更模型
- **后端能力缺失**：目前的 settings 接口仍以 runtime summary 为主，不足以支撑 provider 管理

结论：

- Warwolf 不能只做“Cherry 风格 UI”
- 必须同时引入 `clawhub123` 风格的 provider/openclaw 数据面

## 4. 总体设计结论

### 4.1 核心结论

Warwolf 的“模型服务”建议采用如下架构：

- **页面交互形态**：参考 Cherry Studio
- **Provider 数据模型**：对齐 clawhub123
- **OpenClaw 配置写入能力**：对齐 clawhub123
- **Warwolf 特有外壳与主题语言**：延续当前 desktop-shell 风格，不做视觉生搬硬套

### 4.2 一句话方案

把 Warwolf 的 `Settings > Provider` 从“只读摘要页”升级为“Provider Hub in Settings”：

- 左侧仍是设置一级导航
- 中间是 provider 库与搜索/筛选/新增面板
- 右侧是 provider 详情编辑与 OpenClaw 同步面板

## 5. 信息架构方案

## 5.1 设置页总体结构

保留 Warwolf 现有一级设置导航，不改路由心智：

- General
- Provider
- MCP Servers
- Permissions
- Keyboard
- Data
- About

其中 `Provider` 改造成二级工作台，而不是普通设置卡片。

## 5.2 Provider 页结构

建议 Provider 页采用三栏布局：

### A. 左栏：设置导航

延续现状，不做大改。

### B. 中栏：模型服务列表面板

功能包含：

- 搜索 provider
- 分类筛选
- 状态筛选
- 已启用/未启用标识
- live config 已同步标识
- 默认模型标识
- 添加 provider
- 从 OpenClaw live config 导入

建议列表分组：

- 官方/平台直连
- 国内官方渠道
- 聚合渠道
- 自定义兼容接口
- 已配置 provider

### C. 右栏：Provider 详情面板

右栏建议拆成 4 个逻辑区块，避免单页过长：

1. 基础信息
2. 认证与连接
3. 模型配置
4. OpenClaw 同步与运行时配置

## 5.3 右栏交互分段

建议用 section 而不是复杂 tab，降低切换成本。默认展示顺序如下：

### 1. 头部状态区

包含：

- Provider 名称
- 官方站点跳转
- 是否启用开关
- 是否已同步到 OpenClaw
- 当前是否为默认主模型来源
- 快速操作按钮

快速操作建议：

- 保存
- 测试连接
- 同步到 OpenClaw
- 设为默认
- 删除

### 2. 认证与连接区

字段建议：

- Provider 类型
- 协议类型
- Base URL
- API Key / OAuth 状态
- 自定义 Header 或 auth 绑定信息

交互建议：

- API Key 字段显示 masked 状态
- 提供“检测连接”
- 提供“获取 API Key”外链
- Base URL 下方展示实际请求预览

### 3. 模型配置区

字段建议：

- 模型列表
- 主模型
- 备用模型
- context window
- max output tokens
- billing kind
- capability tags

交互建议：

- 支持“从 preset 带入默认模型”
- 支持“手动新增模型”
- 支持“批量导入 live config 模型”
- 支持按模型查看高级参数

### 4. OpenClaw 运行时区

该区是 Warwolf 相比 Cherry 更应该强化的部分。

建议承载：

- `agents.defaults.model`
- `agents.defaults.models`
- `env`
- `tools`
- live config health warnings

这样用户在一个地方既能管理 provider，又能管理 OpenClaw 运行时结果，不必在多个入口跳转。

## 6. 数据模型方案

## 6.1 设计原则

Warwolf 不应继续使用当前的简化结构：

- `id`
- `label`
- `base_url`
- `auth_status`

这只适合只读展示，不适合 provider 管理。

Warwolf 应引入两层模型：

### A. Managed Provider 层

对齐 `clawhub123` 的 managed provider：

- `id`
- `name`
- `providerType`
- `billingCategory`
- `protocol`
- `baseUrl`
- `apiKeyMasked`
- `hasApiKey`
- `enabled`
- `officialVerified`
- `presetId`
- `websiteUrl`
- `description`
- `models[]`
- `createdAt`
- `updatedAt`

### B. OpenClaw Runtime 层

独立维护：

- `liveProviderIds`
- `defaultModel`
- `modelCatalog`
- `envConfig`
- `toolsConfig`
- `healthWarnings`

### 6.2 不建议的做法

不建议把所有状态揉成一个前端大对象，例如：

- provider 基础信息
- runtime health
- live sync 状态
- model catalog
- env/tools

全部混在同一接口返回

原因：

- Provider CRUD 与 OpenClaw runtime 配置是两类操作
- 查询频率和刷新策略不同
- 编辑回写粒度不同
- 会导致前端保存逻辑越来越脆弱

## 6.3 推荐前端状态拆分

建议 Provider 页面使用 3 组 query/mutation：

1. `provider hub`
2. `openclaw runtime`
3. `provider presets`

具体可拆为：

- `listProviderPresets`
- `listManagedProviders`
- `upsertManagedProvider`
- `deleteManagedProvider`
- `importProvidersFromLive`
- `getOpenClawLiveProviderIds`
- `syncProviderToOpenClaw`
- `getOpenClawDefaultModel`
- `setOpenClawDefaultModel`
- `getOpenClawModelCatalog`
- `setOpenClawModelCatalog`
- `getOpenClawEnv`
- `setOpenClawEnv`
- `getOpenClawTools`
- `setOpenClawTools`
- `scanOpenClawConfigHealth`

## 7. 后端接口方案

## 7.1 短期策略

Warwolf 不建议继续扩展当前 `getSettings()` 这类 summary 接口来承载 provider 管理。

建议新增独立的 Tauri command/API：

- `provider_hub_presets`
- `provider_hub_list`
- `provider_hub_upsert`
- `provider_hub_delete`
- `provider_hub_sync_openclaw`
- `import_openclaw_providers_from_live`
- `get_openclaw_live_provider_ids`
- `scan_openclaw_config_health`
- `get_openclaw_default_model`
- `set_openclaw_default_model`
- `get_openclaw_model_catalog`
- `set_openclaw_model_catalog`
- `get_openclaw_env`
- `set_openclaw_env`
- `get_openclaw_tools`
- `set_openclaw_tools`

这些接口的能力边界已经在 `clawhub123` 中被验证过，Warwolf 更适合直接对齐，而不是重新设计。

## 7.2 中期策略

建议把 provider hub 与 openclaw config 的核心能力抽到共享 Rust crate，降低 Warwolf 与 clawhub123 的后续漂移。

可共享的重点包括：

- managed provider 持久化
- provider preset 注册表
- openclaw.json 读写
- provider -> openclaw provider fragment 同步
- default model / model catalog / env / tools 操作
- health scan

## 7.3 兼容策略

Warwolf 需要考虑两类 provider 来源：

1. **Preset-based provider**
2. **用户手动创建的 custom provider**

因此接口层必须支持：

- 从预设创建
- 编辑为自定义
- 从 live config 导入已有 provider

## 8. 交互方案细节

## 8.1 新增 Provider 流程

建议流程：

1. 点击“添加”
2. 打开 provider 选择器
3. 可搜索 preset
4. 选择 preset 后预填基础配置和模型
5. 用户补充 API Key / Base URL
6. 保存后进入详情编辑态
7. 可继续点击“同步到 OpenClaw”

为什么不直接复制 Cherry 的新增弹窗：

- Cherry 更偏“新增 provider 实例”
- Warwolf 需要更明确地承接 `clawhub123` 的 preset 目录和 OpenClaw 目标结构

因此建议新增面板更强调：

- preset 选择
- 协议确认
- 模型预填
- 是否同步为默认

## 8.2 编辑 Provider 流程

编辑态建议遵循：

- 变更字段即本地 dirty
- 离开详情区前提醒未保存
- 保存只写 managed provider
- 同步到 OpenClaw 是显式动作

不要把“保存 provider”和“写入 openclaw.json”做成一个隐式动作，否则会增加用户对运行时结果的不可预测感。

## 8.3 同步 Provider 到 OpenClaw

建议使用显式 CTA：

- `同步到 OpenClaw`
- `同步并设为默认`

同步结果反馈：

- 成功 toast
- 写入的模型数量
- 设置为默认后的主模型 ID
- live config path

失败反馈：

- 配置写入失败
- provider 没有模型
- provider 类型不允许直接同步

## 8.4 默认模型设置

不建议把默认模型设置埋在一个不明显的位置。

建议在右栏头部和模型区都提供入口：

- 头部显示“当前默认”
- 模型区允许快速设为主模型

## 8.5 健康与诊断

Cherry 侧的“检测”动作值得保留，但 Warwolf 应更进一步：

- 检测 provider 连通性
- 扫描 openclaw.json 健康问题
- 显示 live config 中是否缺少 provider/models/defaults

建议右栏底部增加“诊断结果”区域。

## 9. 视觉与样式建议

## 9.1 应参考 Cherry 的部分

- 三栏关系
- provider 列表密度
- 搜索与筛选的位置
- 详情面板的标题和操作区
- 模型区作为详情页下半部分

## 9.2 不建议直接复制的部分

- 过多的 provider-specific 手写分支 UI
- 过重的表单堆叠
- 某些过于“配置台”风格的密集输入布局

## 9.3 Warwolf 的视觉落点

建议保持 Warwolf 当前桌面端气质：

- 更克制的层级
- 更清晰的内容分区
- 更少但更明确的操作按钮
- 用 badge 呈现状态，而不是到处放说明文案

建议视觉语义：

- 已启用：绿色
- 未配置认证：黄色
- 未同步到 OpenClaw：灰色
- 健康风险：红色/橙色
- 官方预设：品牌色 badge

## 10. 支持渠道接入策略

## 10.1 渠道来源建议

Warwolf 的渠道目录不应手工维护一份新名单，建议直接基于：

- `clawhub123` 的 `providerPresets`
- `clawhub123` 的 `openclawProviderPresets`

在 Warwolf 中按场景展示：

- OpenClaw 可直接同步的 provider
- 仅 provider hub 管理的 provider
- 自定义兼容 provider

## 10.2 展示层分类建议

建议前台以“用户能理解的来源”分类，而不是完全暴露技术字段：

- 官方
- 国内官方
- 聚合平台
- 自定义兼容
- 已配置

而不是直接暴露底层：

- `cn_official`
- `aggregator`
- `custom`

这些字段保留在内部映射层即可。

## 10.3 产品开关问题

当前 `clawhub123` 存在 edition/channel gating 逻辑。

团队需要明确：

- Warwolf 是首版即展示全部 preset
- 还是只展示当前 edition 启用渠道

建议评审结论：

- **UI 首版可展示完整目录**
- **实际可用性通过状态与说明区分**

这样便于建立用户对产品能力全貌的认知，同时保留后端 gating 空间。

## 11. 推荐实施分期

## Phase 1: 交互外壳 + 只读能力对齐

目标：

- 完成 Cherry 风格三栏布局
- 接入 preset 列表
- 接入 managed provider 列表
- 接入 provider 详情只读展示
- 接入 OpenClaw live 状态只读展示

产出：

- 团队先确认 IA 与页面节奏
- 不马上进入复杂写入流程

## Phase 2: Provider CRUD + 同步 OpenClaw

目标：

- 新增/编辑/删除 managed provider
- 从 preset 创建 provider
- 从 live config 导入 provider
- 同步 provider 到 OpenClaw
- 设置默认模型

产出：

- 形成完整可用的 provider 管理闭环

## Phase 3: 模型管理与诊断增强

目标：

- 模型列表高级编辑
- 模型目录管理
- 健康扫描
- 连接测试
- env/tools 配置编辑

产出：

- 从“可配置”升级为“可运营”

## Phase 4: 高阶能力

目标：

- 测速
- 健康评分
- failover priority
- usage/成本视图
- provider 排序和推荐

这些能力建议在基础配置稳定后再引入。

## 12. 关键评审问题

团队评审时建议重点确认以下问题：

### 1. 是否接受“三栏 Provider 工作台”作为长期形态

这是最关键的 IA 决策。

### 2. Warwolf 是否直接复用 clawhub123 的 provider/openclaw API 语义

如果不复用，后续会产生长期维护分叉。

### 3. Provider 保存与 OpenClaw 同步是否分离

建议分离，这会让运行时结果更可控。

### 4. UI 首版是否展示完整渠道目录

建议展示完整目录，但用状态区分“可立即使用”和“需后续支持”。

### 5. OpenClaw 运行时配置是否与 Provider 详情同页

建议同页，否则用户会在“配置 provider”和“配置默认模型/env/tools”之间来回跳转。

## 13. 推荐决策

本方案的推荐决策如下：

- **采纳 Cherry Studio 的 Provider 页面交互结构**
- **采纳 clawhub123 的 provider/openclaw 数据与接口语义**
- **Warwolf 不再扩展当前 summary 型 settings 接口来承载 provider 管理**
- **Provider 保存与同步 OpenClaw 显式分离**
- **首版先完成 Phase 1 + Phase 2 的能力闭环**

## 14. 预期收益

完成后，Warwolf 将得到：

- 一个真正可用的模型服务设置中心
- 一个能承接多渠道模型扩展的统一入口
- 一个与 OpenClaw 运行时强绑定、但用户感知清晰的配置工作流
- 一套后续可以逐步接入测速、健康、故障切换、用量分析的可扩展骨架

## 15. 附：对实现路径的建议

如果进入开发阶段，建议按以下顺序推进：

1. 先把桌面端 Settings Provider 页改造成三栏骨架
2. 再引入 provider hub 与 openclaw runtime 的 query 层
3. 再落 provider 编辑器与 preset 选择器
4. 最后接模型管理、健康扫描和高级配置

这样可以先把页面节奏和状态边界做稳，再逐步接复杂表单逻辑。
