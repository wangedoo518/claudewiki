# ClawWiki 基础设施设计方案 · canonical

> **主题**：如何用 `gpt-register` + `sub2api` 构建一条"macOS 机器采集 Codex OAuth token → 云端中转 → 供给 ClawWiki"的供血链路
>
> **姊妹文档**：
> - [`product-design.md`](./product-design.md) · ClawWiki 的**产品侧**设计（微信漏斗、CCD 4 件套、Karpathy 三层）
> - **本文（infra-design.md）** · ClawWiki 的**基础设施侧**设计（供血链路、token 池、云端中转）

---

## 0. TL;DR（90 秒读完）

### 问题

ClawWiki 的 canonical 产品设计里的 "Codex GPT-5.4 海量 token" 这个前提，在基础设施层面需要具体的供血机制。我们有三个现成的开源项目可以拼装：

- **`gpt-register`**（Python · macOS）· 已经能自动注册 ChatGPT 账号 + 提取 Codex OAuth token（CLIENT_ID 就是 `app_EMoamEEZ73f0CkXaXp7hrann`）· 缺的是"上传到云端"这一步
- **`sub2api`**（Go + Vue · PostgreSQL + Redis）· 一个生产级的 AI 账号池中转平台，已经内建了 OpenAI OAuth 支持、`RefreshTokenWithClientID`、`DataImportRequest` 批量导入、`/v1/messages` + `/v1/chat/completions` 双协议 gateway、per-key 配额、admin UI
- **`claude-relay-service`**（Node.js · Redis only）· 一个类似的中转平台，架构更轻，但**默认不支持 Codex OAuth**（只支持 Claude OAuth），且 v1.1.248 存在 admin 认证绕过漏洞

### 决策

| 维度 | 决策 | 理由 |
|---|---|---|
| **云端中转** | **sub2api**（不用 CRS） | OpenAI OAuth + `RefreshTokenWithClientID` + `ImportData` 批量入库——**三件核心能力 sub2api 全是开箱即用，CRS 需要 refactor** |
| **是否 fork sub2api** | **不 fork**。只在 config + admin API key 层面定制 | sub2api 的 `DataAccount.Credentials` 是 `map[string]any`，能直接装我们的 Codex token shape |
| **token 采集** | `gpt-register` + **一个新写的 `sub2api_uploader.py`**（~100 行） | gpt-register 已经能产 token，缺的就是上传 |
| **claudewiki 接入方式** | 新增 `managed_auth::CloudManaged` source + 一个 Rust HTTP client 调用 `https://relay/v1/messages` | 跟 canonical product-design §3 D3 的"Broker 只服务 ClawWiki"语义兼容，只是 Broker **位置从 127.0.0.1 的 Rust 内聚变成了云端**——见 §8 reconciliation |
| **订阅 → API key 发放** | 复用已有的 `trade-service`，新增 "调 sub2api admin API 发/撤 key" 逻辑 | 不新增微服务 |

### 核心数据流（一张图）

```
┌────────────────────────────────┐
│  macOS fleet (5-20 台)         │
│  每台跑 gpt-register daemon     │
│  ├─ Selenium 注册新 ChatGPT 账号│
│  ├─ PKCE 提取 Codex OAuth token │
│  └─ sub2api_uploader.py (新)    │
└──────────────┬─────────────────┘
               │ POST /api/v1/admin/accounts/import-data
               │ Authorization: Bearer <fleet-admin-jwt>
               ▼
┌────────────────────────────────┐
│  sub2api 云端 (单机或集群)      │
│  ├─ PostgreSQL (账号 + 配额)     │
│  ├─ Redis (缓存 + 调度)         │
│  ├─ AES-256-GCM 加密静态凭据    │
│  ├─ AccountScheduler 轮询 + 粘滞 │
│  ├─ OAuthService refresh loop   │
│  │    (RefreshTokenWithClientID)│
│  └─ Gateway Handler              │
│      POST /v1/messages           │
│      POST /v1/chat/completions   │
└──────────────┬─────────────────┘
               │ cw_* 密钥鉴权 + 配额enforce
               ▼
┌────────────────────────────────┐
│  trade-service (已有 Java svc)  │
│  订阅 ACTIVE → 调 sub2api admin │
│    /api/v1/admin/api-keys 发 key│
│  订阅过期 → revoke               │
│  /api/v1/codex-accounts/me 返回 │
│    cw_* key 给 claudewiki        │
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│  ClawWiki 桌面 (Tauri)          │
│                                │
│  rust/desktop-core:             │
│  ├─ managed_auth::CloudManaged  │
│  │   (新增 source 变体)          │
│  │   存 cw_* key 到 OS keychain │
│  └─ codex_broker::CodexBroker   │
│      (Rust struct · 唯一消费者)  │
│      ├─ AskSession              │
│      ├─ WikiMaintainer          │
│      └─ WikiIngest (voice/video)│
└────────────────────────────────┘
```

**关键不变量**：
1. `access_token` / `refresh_token` 永远只存在 sub2api 的 PostgreSQL（AES-256-GCM）
2. claudewiki 前端永远只见到 `cw_*` 长期 key（存 OS keychain），**永远不见**底层 Codex token
3. `cw_*` key 只发给有 active 订阅的用户，**不对外开放**——保持 canonical D3 "只服务 ClawWiki" 的语义
4. gpt-register 采集的 token 从 macOS 上传后，macOS 本地**立刻删除**，避免多副本

---

## 1. 问题定义

### 1.1 ClawWiki 产品侧的前提

从 [`product-design.md §4 刃一`](./product-design.md)：

> 用户买的不是"Codex 代理服务"，是"一个会替自己长大的外脑"。
> Codex 账号是订阅附赠的燃料，不是产品本身。

这个前提暗含三个基础设施需求：

1. **供给侧**：海量 Codex OAuth token 的持续产出与维护
2. **中转侧**：Token 池调度 + 自动刷新 + 配额分发 + 格式转换（claudewiki 的 Rust 侧更习惯 Anthropic `/v1/messages`，而 Codex 后端走 OpenAI 格式）
3. **消费侧**：claudewiki 如何从云端安全拿到 API 能力

### 1.2 基础设施设计的三个硬约束

| 约束 | 来源 | 含义 |
|---|---|---|
| **C1** 原始 Codex token 永远不出 Rust 层 | canonical D3 "Token 100% 内部消化" | claudewiki 前端永远看不到 `sk-...` / `access_token` |
| **C2** 只服务 ClawWiki 用户，不对外开放 | canonical D3 "砍掉对外 HTTP 路由" | 不能出现 "Cursor/Codex CLI 用户用同一套" 的 hookup 文档 |
| **C3** 成本 ≤ 订阅价 × 毛利率 | 商业可行性 | Codex 账号的采集 + 中转 + 刷新的总成本必须低于订阅定价 |

### 1.3 需要基础设施新建/改造的部分

| 模块 | 现状 | 目标 |
|---|---|---|
| 云端中转服务 | 不存在 | 部署 sub2api + 少量 config |
| macOS 批量采集 | `gpt-register` 单机能跑 | 增加 `sub2api_uploader.py` + 多机协同 |
| 订阅 → key 发放 | `trade-service` 返回"平台分配的 codex accounts" | 改造为"调 sub2api admin API 发 `cw_*` key" |
| claudewiki 接入 | `managed_auth::DesktopManagedAuthSource` 只有 3 种 | 新增 `CloudManaged` 变体 + HTTP client |

---

## 2. 四项目分析

### 2.1 `sub2api`（Go 后端 + Vue 前端 · 生产级多账号中转平台）

**路径**：`/Users/champion/Documents/develop/factory/sub2api`
**License**：MIT
**技术栈**：Go 1.26+ · Gin · Ent ORM · PostgreSQL 15+ · Redis 7+ · Vue 3 · Vite

#### 对我们有用的核心能力（全都是现成的）

| 能力 | 文件 | 备注 |
|---|---|---|
| OpenAI OAuth 凭据管理 | `backend/internal/service/oauth_service.go:14-17` | `OpenAIOAuthClient` 接口 + `RefreshTokenWithClientID(refreshToken, proxyURL, clientID)` |
| 多账号池调度 | `backend/internal/service/account_service.go` + `account_scheduler.go` | 轮询 · 粘滞 session · 失败自动切换 |
| 静态加密 | `backend/internal/repository/aes_encryptor.go` | AES-256-GCM，nonce 包含在密文里 |
| 批量账号导入 | `backend/internal/handler/admin/account_data.go:60-79` | **`DataImportRequest { Data: DataPayload{Accounts: []DataAccount} }`** |
| Token refresh 循环 | `oauth_service.go:78-120` | `OAuthService.RefreshAccountToken()` 自动处理 401/403 |
| Anthropic ↔ OpenAI 格式转换 | `handler/openai_gateway_handler.go` + `service/openai_gateway_service.go` | 让 claudewiki 直接用 `/v1/messages` 就能消费 Codex |
| Per-key 配额 + 限流 | `backend/ent/schema/api_key.go` + `server/middleware/api_key_auth.go` | 天然支持按订阅发 key |
| Admin UI | `frontend/src/views/Admin.vue` + `components/admin/*` | 运维用 |

#### 关键发现：`DataAccount` 结构是通用的

```go
// account_data.go:45
type DataAccount struct {
    Name         string
    Platform     string         // 填 "openai"
    Type         string         // 填 "chatgpt_oauth"（待确认具体枚举）
    Credentials  map[string]any // 装 {access_token, refresh_token, id_token, account_id, client_id}
    Extra        map[string]any // 装 {email, plan_type, registered_at}
    Concurrency  int
    Priority     int
    ...
}
```

这意味着：**我们不需要给 sub2api 新增 endpoint，也不需要动任何 Go 代码**。只要构造出符合这个 shape 的 JSON，POST 到现有的 `/api/v1/admin/accounts/import-data`，就能入库。

#### 不相关的能力（我们不用但也不删）

- Claude / Gemini / Antigravity / Bedrock 多平台支持 → 保留但只用 OpenAI 一条
- 多用户 SaaS（自助注册 + 付费）→ 切到 "simple mode"（`RUN_MODE=simple`，禁用公开注册）
- Promo codes / 兑换码 → 不启用
- TLS fingerprint profiles → 不需要

#### 部署复杂度

三个服务：`sub2api` + PostgreSQL 15 + Redis 7。单机 `docker-compose up` 就能跑，文档齐全。

#### 已知风险

- README 明确写着 "使用 sub2api 可能违反 Anthropic ToS"——对我们来说只相关 OpenAI/Codex ToS，但仍然是风险提示
- 依赖 Ent ORM，升级成本较高（但我们不打算改代码，问题不大）

### 2.2 `claude-relay-service`（Node.js · Redis only · 更轻但更有问题）

**路径**：`/Users/champion/Documents/develop/factory/claude-relay-service`
**License**：MIT
**技术栈**：Node.js 18 · Express · ioredis · Vue 3 (admin) · Redis 7 only

#### 和 sub2api 的关键差异

| 维度 | sub2api | claude-relay-service | 赢家 |
|---|---|---|---|
| **Codex OAuth 支持** | ✅ 开箱即用（`RefreshTokenWithClientID`）| ❌ 只支持 Claude OAuth，需要 refactor `claudeAccountService.js` 新增 codex account type | **sub2api** |
| **批量导入 API** | ✅ `DataImportRequest` 现成 | ❌ 只有单账号 admin UI | **sub2api** |
| **存储层** | PostgreSQL + Redis | Redis only | sub2api（PG 适合审计/备份/分析） |
| **加密** | AES-256-**GCM**（AEAD）| AES-256-**CBC** | sub2api |
| **已知 CVE** | 无 | v1.1.248 admin 认证绕过，必须升到 .249+ | **sub2api** |
| **代码量** | 843 Go 文件 | ~200 JS 文件 | CRS 更轻 |
| **部署依赖** | app + PG + Redis | app + Redis | CRS 简单一丁点 |
| **Anthropic ↔ OpenAI 格式转换** | ✅ `openai_gateway_*` | ✅ `openaiToClaude.js` | 平手 |
| **多平台**（Bedrock/Gemini/Droid/CCR）| ✅ | ✅ 更多种 | 对我们无关 |
| **格式 bridge 大小** | 中等 | `anthropicGeminiBridgeService.js` 100KB（复杂）| sub2api 更干净 |
| **Streaming SSE** | ✅ | ✅ | 平手 |

#### 结论：**不用 CRS，用 sub2api**

最硬的三条决定性理由：

1. **Codex OAuth**：sub2api 有 `RefreshTokenWithClientID(refreshToken, proxyURL, clientID)`——能指定 `client_id` 刷新，这就是 gpt-register 产出的 token 要求的事。CRS 的 `claudeAccountService.js` 只有 Claude 的 `grant_type=refresh_token`，新增一个 codex 分支至少是 3-5 天的事
2. **批量导入 API**：sub2api 的 `ImportData` 本来就是批量接口；CRS 的 admin 是"点一个按钮填一个账号"的逐个流程
3. **CVE**：v1.1.248 认证绕过对一个装着大量 OAuth token 的服务来说是 P0 级别的风险

### 2.3 `gpt-register`（Python · 单机 Codex token 采集工具）

**路径**：`/Users/champion/Documents/develop/factory/gpt-register`
**License**：未明确声明（需要确认）
**技术栈**：Python 3.13 · Selenium + undetected-chromedriver · curl-cffi · Cloudflare Worker 临时邮箱

#### 关键能力

已经做到了：

1. **自动注册新 ChatGPT 账号**（浏览器自动化 + 临时邮箱 OTP）· `register.py`
2. **Codex OAuth 提取**（PKCE + Sentinel Token bypass）· `token_extractor.py`
   - `CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"` —— 就是 Codex CLI 的客户端 ID
   - `SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke"`
3. **单机 token 池管理**（daemon 模式 + 配额轮换 + 自动续期）· `token_pool.py` + `daemon.py`
4. **输出到 `~/.codex/auth.json`** 给本机的 Codex CLI / open-claude-code 用 · `codex_export.py`

#### 缺的能力

1. **云端上传**：没有任何 `cloud_uploader` 之类的模块。需要新写 `sub2api_uploader.py`
2. **多机协调**：没有分布式锁，多实例跑在同一 Mac 会 race `data/pool_state.json` 和 `data/tokens/`。我们的方案：**一台 Mac 一个 daemon**，机器间不共享本地 pool
3. **ToS 合规**：README 没有任何 "仅供学习" 式免责。批量注册是 OpenAI ToS 明禁的。风险由运营方承担
4. **邮箱依赖**：config.yaml 里 `yongshengxingda.com` 这个临时邮箱 worker URL 是硬编码的单点。要么买自己的域名，要么加 fallback
5. **phone verification**：遇到就直接跳转 consent（`token_extractor.py:304-311`），遇到强制 phone 验证的账号会失败——需要监控失败率
6. **无 metrics / observability**：fleet 管理需要自加 Prometheus / 日志采集

#### 输出的 token 格式（我们要的就是这个）

```json
{
  "type": "codex",
  "email": "tmpyz9llxs29j@yongshengxingda.com",
  "access_token": "eyJh...",       // JWT
  "refresh_token": "rt_...",
  "id_token": "eyJh...",            // JWT with OpenAI claims
  "account_id": "0d40cc03-...",
  "plan_type": "free",              // from id_token claim
  "registered_at": "2026-04-09T..."
}
```

这正好能塞进 sub2api 的 `DataAccount.Credentials` map。

### 2.4 `claudewiki`（消费侧 · Tauri 2 + React + Rust · 已深度熟悉）

**路径**：`/Users/champion/Documents/develop/Warwolf/claudewiki`（就是本仓库）

从前面几轮产品设计已经建立的 mental model：

- **canonical 产品文档**：[`product-design.md`](./product-design.md)
- **关键模块**：`rust/crates/desktop-core/src/managed_auth.rs`
- **现状**：`DesktopManagedAuthSource` enum 只有 `ImportedAuthJson / BrowserLogin / DeviceCode`——**没有 `CloudManaged` 变体**
- **canonical 规划**：S2 Sprint 要加 `CloudManaged` source
- **内聚 Broker 设计**：`CodexBroker` 是一个 Rust struct，提供 `chat_completion(req)` 函数，只给 `AskSession` 和 `WikiMaintainer` 调用

本文档的基础设施设计要**回答一个具体问题**：`CloudManaged` source 的 `chat_completion` 实现里，Rust 怎么拿到上游能力？

答案：调 sub2api 的 `/v1/messages`，用 `cw_*` key 鉴权。

---

## 3. 端到端架构

### 3.1 组件边界

```
┌────────────────────────────────────────────────────────────────────┐
│  L1 · 采集层（macOS fleet · 5-20 台）                               │
│                                                                     │
│  ┌─────────────────────────────────┐                                │
│  │ Mac #1  gpt-register daemon     │                                │
│  │ ┌───────────────────────────┐   │                                │
│  │ │ register.py (已有)         │   │                                │
│  │ │   ├─ Selenium 注册         │   │                                │
│  │ │   ├─ 临时邮箱 OTP          │   │                                │
│  │ │   └─ token_extractor.py    │   │                                │
│  │ └──────────┬────────────────┘   │                                │
│  │            │                    │                                │
│  │            ▼                    │                                │
│  │ ┌───────────────────────────┐   │                                │
│  │ │ sub2api_uploader.py (新)   │   │                                │
│  │ │   ├─ 构造 DataPayload      │   │                                │
│  │ │   ├─ HTTPS POST            │   │                                │
│  │ │   ├─ 上传成功后删本地 token │   │                                │
│  │ │   └─ 失败加 local queue 重试│   │                                │
│  │ └──────────┬────────────────┘   │                                │
│  └────────────┼──────────────────┘                                  │
│               │                                                     │
│  Mac #2 ... Mac #20 (相同结构)                                      │
└───────────────┼─────────────────────────────────────────────────────┘
                │
                │ POST https://relay.clawwiki.dev/api/v1/admin/accounts/import-data
                │ Authorization: Bearer <FLEET_INGEST_JWT>
                │ Content-Type: application/json
                │
┌───────────────▼─────────────────────────────────────────────────────┐
│  L2 · 中转层（sub2api · 云端单机或集群）                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ sub2api backend (Go)                                         │    │
│  │                                                              │    │
│  │ ┌──────────────────────┐    ┌─────────────────────────────┐ │    │
│  │ │ Admin API            │    │ Gateway API                  │ │    │
│  │ │ POST /admin/accounts/│    │ POST /v1/messages            │ │    │
│  │ │   import-data        │    │ POST /v1/chat/completions    │ │    │
│  │ │ POST /admin/api-keys │    │                              │ │    │
│  │ │ DELETE /admin/.../:id│    │ ├─ cw_* key 鉴权             │ │    │
│  │ │                      │    │ ├─ per-user 配额 enforce      │ │    │
│  │ └──────────┬───────────┘    │ ├─ AccountScheduler          │ │    │
│  │            │                │ │   (round-robin + sticky)    │ │    │
│  │            ▼                │ ├─ OAuthService.Refresh*     │ │    │
│  │ ┌──────────────────────┐    │ │   (懒 refresh on 401)      │ │    │
│  │ │ Account repo         │◀──▶│ ├─ 格式转换 Anthropic↔OpenAI │ │    │
│  │ │  (Ent ORM)           │    │ └─ 上游调 ChatGPT backend API │ │    │
│  │ │  AES-256-GCM 加密     │    │                              │ │    │
│  │ └──────────┬───────────┘    └──────────────────────────────┘ │    │
│  │            │                                                 │    │
│  │            ▼                                                 │    │
│  │ ┌─────────────────┐   ┌─────────────────┐                    │    │
│  │ │ PostgreSQL 15   │   │ Redis 7         │                    │    │
│  │ │  accounts       │   │  cache          │                    │    │
│  │ │  api_keys       │   │  scheduler lock │                    │    │
│  │ │  usage_logs     │   │  rate limit     │                    │    │
│  │ └─────────────────┘   └─────────────────┘                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 │ trade-service 调 sub2api admin API 发 key
                 │ (POST /api/v1/admin/api-keys)
                 │
┌────────────────▼───────────────────────────────────────────────────┐
│  L3 · 订阅层（trade-service · 已有 Java 微服务）                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 现有路由（不动）：                                            │   │
│  │   POST /api/v1/plans            查套餐                        │   │
│  │   POST /api/v1/orders           下单                          │   │
│  │   GET  /api/v1/subscriptions/me 我的订阅                      │   │
│  │                                                              │   │
│  │ 改造的路由：                                                  │   │
│  │   GET  /api/v1/codex-accounts/me                             │   │
│  │     (现状：返回平台分配的 codex token 明文)                   │   │
│  │     (新版：返回 cw_* 长期 key)                               │   │
│  │                                                              │   │
│  │ 新增订阅状态 webhook：                                        │   │
│  │   subscription ACTIVE                                         │   │
│  │     ├─ 调 sub2api POST /admin/api-keys                       │   │
│  │     ├─ body: { name, user_id, group_id, quota, ...}          │   │
│  │     └─ 存 key → user 表                                       │   │
│  │   subscription EXPIRED                                        │   │
│  │     └─ 调 sub2api DELETE /admin/api-keys/:id                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────┬───────────────────────────────────────────────────┘
                 │
                 │ cloud transport 拿 cw_* key
                 │ (desktop-shell 登录后首次 fetch)
                 │
┌────────────────▼───────────────────────────────────────────────────┐
│  L4 · 消费层（ClawWiki · Tauri）                                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ apps/desktop-shell (React + Tauri 2)                         │   │
│  │   features/auth · 登录后调 trade-service /codex-accounts/me   │   │
│  │   features/billing · cloud-accounts-sync 改走 Rust endpoint  │   │
│  └──────────────┬──────────────────────────────────────────────┘   │
│                 │ tauri invoke("save_cloud_key", ...)                │
│                 ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ rust/crates/desktop-core                                     │   │
│  │                                                              │   │
│  │ ┌─────────────────────────────┐                              │   │
│  │ │ managed_auth.rs              │                              │   │
│  │ │                              │                              │   │
│  │ │ enum DesktopManagedAuthSource│                              │   │
│  │ │ ├─ ImportedAuthJson          │  ← 已有                      │   │
│  │ │ ├─ BrowserLogin              │  ← 已有                      │   │
│  │ │ ├─ DeviceCode                │  ← 已有                      │   │
│  │ │ └─ CloudManaged    (NEW)     │  ← S2 新增                   │   │
│  │ │       cw_* key                │                              │   │
│  │ │       存 OS keychain           │                              │   │
│  │ └──────────┬──────────────────┘                              │   │
│  │            │                                                 │   │
│  │            ▼                                                 │   │
│  │ ┌─────────────────────────────┐                              │   │
│  │ │ codex_broker.rs  (NEW)       │                              │   │
│  │ │                              │                              │   │
│  │ │ pub struct CodexBroker {     │                              │   │
│  │ │   cw_key: OnceCell<String>,  │                              │   │
│  │ │   relay_base: Url,           │                              │   │
│  │ │   http: reqwest::Client,     │                              │   │
│  │ │ }                            │                              │   │
│  │ │                              │                              │   │
│  │ │ impl CodexBroker {           │                              │   │
│  │ │   async fn chat_completion(  │                              │   │
│  │ │     &self,                   │                              │   │
│  │ │     req: ChatRequest,        │                              │   │
│  │ │   ) -> ChatStream { ... }    │                              │   │
│  │ │ }                            │                              │   │
│  │ │                              │                              │   │
│  │ │ 消费者（且只有这些）：        │                              │   │
│  │ │   - ask_runtime crate        │                              │   │
│  │ │   - wiki_maintainer crate    │                              │   │
│  │ │   - wiki_ingest crate        │                              │   │
│  │ └─────────────────────────────┘                              │   │
│  │                                                              │   │
│  │ 前端永远见不到 cw_* key（除了初次从 trade-service 收到时）    │   │
│  │ desktop-server 永远不暴露 /v1/* HTTP 路由给本机其它进程        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 一次请求的完整数据流（Ask 会话为例）

```
[用户在 ClawWiki Ask 页输入: "结合今天的 14 份微信材料…"]
       │
       ▼
[features/ask/AskPage.tsx]
  └─ tauri invoke("ask_chat_completion", { prompt, context, ... })
       │
       ▼
[rust/ask_runtime]
  └─ CodexBroker.chat_completion(ChatRequest { ... })
       │
       ▼
[rust/desktop-core::codex_broker]
  └─ POST https://relay.clawwiki.dev/v1/messages
       Headers:
         Authorization: Bearer cw_<user 的 key>
         Content-Type: application/json
       Body (Anthropic format):
         { model: "claude-opus-4-6", messages: [...], stream: true }
       │
       ▼
[sub2api gateway handler]
  ├─ 1. api_key_auth middleware 验证 cw_*（redis + db hit）
  ├─ 2. rate limit middleware：per-key 日配额 / 并发控制
  ├─ 3. group lookup：该 user → "codex-fleet" group
  ├─ 4. AccountScheduler.Pick(group)：轮询选一个 active 账号
  │     - 如果该账号 access_token 快过期，OAuthService.RefreshAccountToken
  │     - refresh 用 RefreshTokenWithClientID(refreshToken, "", "app_EMoamEEZ73f0CkXaXp7hrann")
  ├─ 5. openai_gateway_service.ConvertAnthropicToOpenAI(req)
  ├─ 6. 转发上游：POST https://chat.openai.com/backend-api/codex/responses
  │     Authorization: Bearer <account.access_token>
  ├─ 7. 收到 SSE 流，边读边 ConvertOpenAIToAnthropic(chunk)
  ├─ 8. SSE 流回写给 claudewiki
  └─ 9. 计费 usage_log：prompt_tokens, completion_tokens, cost
       │
       ▼
[claudewiki 渲染流式消息]
```

**响应时间**：
- L4 → L2 网络：30-80ms（取决于云区域，建议选 HK/SG/Tokyo）
- L2 内部调度 + refresh check：< 10ms（缓存热命中时）
- L2 → ChatGPT upstream：200-800ms（typical）
- 总 TTFB：250-900ms。和直连 Codex CLI 基本持平。

---

## 4. 层级设计

### 4.1 L1 · gpt-register 修改

#### 4.1.1 新增文件 `gpt_register/sub2api_uploader.py`（~120 行）

```python
"""
sub2api uploader · 把本机 token_pool 里的 Codex OAuth token 上报到 sub2api。
被 register.py 在新注册完一个账号后调用，也被 daemon.py 在刷新 token 后调用。
"""
import json
import time
from pathlib import Path
from typing import Optional
import requests

from .config import Config


UPLOAD_QUEUE = Path("data/upload_queue.jsonl")


def build_data_account(token_file: Path) -> dict:
    """把 data/tokens/<email>.json 转成 sub2api 的 DataAccount shape"""
    token = json.loads(token_file.read_text())
    return {
        "name": f"codex-fleet-{token['email'].split('@')[0][:12]}",
        "platform": "openai",                  # sub2api 平台枚举
        "type": "chatgpt_oauth",               # 待团队确认具体字符串
        "credentials": {
            "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",  # Codex CLI
            "access_token": token["access_token"],
            "refresh_token": token["refresh_token"],
            "id_token": token["id_token"],
            "account_id": token["account_id"],
        },
        "extra": {
            "email": token["email"],
            "plan_type": token.get("plan_type", "free"),
            "registered_at": token.get("registered_at"),
            "fleet_host": _get_hostname(),
        },
        "concurrency": 4,                      # per-account 并发
        "priority": 50,                        # 默认优先级
    }


def upload(cfg: Config, token_files: list[Path]) -> tuple[int, int]:
    """
    上传一批 token 到 sub2api。返回 (成功数, 失败数)。
    失败的 token_file 路径会进入 UPLOAD_QUEUE 等下次重试。
    """
    payload = {
        "data": {
            "type": "sub2api-data",
            "version": 1,
            "exported_at": _now_iso(),
            "proxies": [],
            "accounts": [build_data_account(f) for f in token_files],
        },
        "skip_default_group_bind": False,      # 自动绑定到默认 group
    }

    url = f"{cfg.sub2api.base_url}/api/v1/admin/accounts/import-data"
    headers = {
        "Authorization": f"Bearer {cfg.sub2api.fleet_admin_jwt}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            result = resp.json()
            created = result.get("data", {}).get("account_created", 0)
            failed = result.get("data", {}).get("account_failed", 0)
            _delete_uploaded_tokens(token_files[:created])
            _append_queue(token_files[created:])
            return created, failed
        else:
            _append_queue(token_files)
            return 0, len(token_files)
    except requests.RequestException as e:
        _log_error(f"upload failed: {e}")
        _append_queue(token_files)
        return 0, len(token_files)


def flush_queue(cfg: Config) -> None:
    """daemon 周期性调：把积压的 token 重新尝试上传"""
    if not UPLOAD_QUEUE.exists():
        return
    lines = UPLOAD_QUEUE.read_text().splitlines()
    if not lines:
        return
    token_files = [Path(p) for p in lines if Path(p).exists()]
    UPLOAD_QUEUE.unlink()
    if token_files:
        upload(cfg, token_files)


def _delete_uploaded_tokens(files: list[Path]) -> None:
    """上传成功后立即删本机 token——避免多副本"""
    for f in files:
        try:
            f.unlink()
        except OSError:
            pass


def _append_queue(files: list[Path]) -> None:
    UPLOAD_QUEUE.parent.mkdir(parents=True, exist_ok=True)
    with UPLOAD_QUEUE.open("a") as f:
        for p in files:
            f.write(str(p) + "\n")


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _get_hostname() -> str:
    import socket
    return socket.gethostname()


def _log_error(msg: str) -> None:
    print(f"[sub2api_uploader] {msg}")
```

#### 4.1.2 修改 `gpt_register/register.py`

在 `register_one_account()` 成功后追加：

```python
# 现有逻辑：保存 token → token_pool → ~/.codex/auth.json
...
# 新增：上传到 sub2api
from .sub2api_uploader import upload
if cfg.sub2api.enabled:
    created, failed = upload(cfg, [token_file])
    if created > 0:
        logger.info(f"uploaded token to sub2api relay")
```

#### 4.1.3 修改 `gpt_register/daemon.py`

在主循环里追加：

```python
# 每 N 轮刷新后 flush upload queue
from .sub2api_uploader import flush_queue
flush_queue(cfg)
```

#### 4.1.4 新增 config 段

```yaml
# config.yaml
sub2api:
  enabled: true
  base_url: "https://relay.clawwiki.dev"
  fleet_admin_jwt: "${SUB2API_FLEET_JWT}"       # env var, 长期 admin JWT
```

#### 4.1.5 多机协调策略

- **一台 Mac 一个 daemon 实例**，不跑多实例
- 多台 Mac 独立跑，**上游 sub2api 是唯一的真理源**
- 本机 `data/tokens/` 是临时 buffer，**上传成功后立即删除**
- 本机不跑长期 pool state——这个职责完全交给 sub2api

### 4.2 L2 · sub2api 部署 & 配置

#### 4.2.1 部署（docker-compose）

```yaml
# deploy/docker-compose.clawwiki.yml
version: "3.9"
services:
  sub2api:
    image: sub2api:clawwiki-v1    # 从上游 main 构建
    restart: unless-stopped
    ports:
      - "4460:8080"              # 本机监听端口，Caddy/nginx 反代
    environment:
      DATABASE_URL: postgres://sub2api:${PG_PASS}@postgres:5432/sub2api
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      TOTP_ENCRYPTION_KEY: ${TOTP_KEY}         # 32 bytes hex
      RUN_MODE: simple                          # 禁用公开注册
      ADMIN_EMAIL: fleet@clawwiki.dev
      ADMIN_PASSWORD: ${INITIAL_ADMIN_PASS}
      SERVER_PORT: "8080"
    depends_on: [postgres, redis]

  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: sub2api
      POSTGRES_PASSWORD: ${PG_PASS}
      POSTGRES_DB: sub2api
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data

volumes:
  pgdata: {}
  redisdata: {}
```

**前面再套一层 Caddy** 做 HTTPS + mTLS（只允许 fleet 机器 ingest）：

```caddy
relay.clawwiki.dev {
    # 公共 API（v1/messages, v1/chat/completions, v1/models）
    @public path /v1/*
    reverse_proxy @public sub2api:4460

    # Admin API（只允许 fleet IP 白名单 + Ingest JWT）
    @admin path /api/v1/admin/*
    handle @admin {
        @fleet_ip remote_ip 10.0.0.0/8 1.2.3.4/32    # fleet 出口 IP
        handle @fleet_ip {
            reverse_proxy sub2api:4460
        }
        respond "forbidden" 403
    }
}
```

#### 4.2.2 需要的运行时配置

创建三个 `api_key` 性质的长期凭据：

| 名字 | 用途 | 权限 | 发给谁 |
|---|---|---|---|
| `fleet-ingest-jwt` | gpt-register 批量上传 | 只能调 `/admin/accounts/import-data` | macOS fleet 共享（env var） |
| `trade-service-admin-jwt` | trade-service 发/撤 `cw_*` key | `/admin/api-keys`（创建 + 删除） | trade-service env var |
| `default` group | 所有新导入的账号的归属 | 绑到 ClawWiki 的 pool | sub2api admin UI 手动建 |

#### 4.2.3 需要在 sub2api admin UI 手动做的一次性设置

1. **创建 Group "codex-clawwiki-pool"**
   - 绑定的 platform: openai
   - 绑定的 models: gpt-5.4, gpt-5, gpt-4o（按 ChatGPT 后端实际支持的模型）
   - Rate multiplier: 1.0
   - Priority strategy: round-robin with sticky sessions（由 sub2api 默认支持）

2. **创建 Default API Key Template**
   - Group: codex-clawwiki-pool
   - Concurrency limit: 3
   - Daily cost cap: ¥10（对应 ~10k req 的订阅份额）
   - Weekly cost cap: ¥50
   - Model blacklist: [] (全部允许)
   - IP whitelist: 空（订阅用户动态 IP）

3. **设置 OAuth refresh 策略**
   - `auto_pause_on_expired: true`
   - `refresh_before_expiry: 300s`
   - 指定默认 `client_id` for openai accounts: `app_EMoamEEZ73f0CkXaXp7hrann`

### 4.3 L3 · trade-service 改造

#### 4.3.1 订阅状态 → sub2api key 生命周期

trade-service 已有的 subscription state machine（`ACTIVE` / `EXPIRED` / `CANCELLED`）新增 hook：

```java
// 伪代码
@EventListener
public void onSubscriptionActivated(SubscriptionActivatedEvent event) {
    // 调 sub2api 创建 cw_* key
    Sub2apiClient.CreateApiKeyRequest req = new Sub2apiClient.CreateApiKeyRequest(
        name = "cw_" + event.getUserId(),
        groupId = "codex-clawwiki-pool",
        concurrency = 3,
        dailyQuota = event.getPlan().getDailyQuota(),
        weeklyQuota = event.getPlan().getWeeklyQuota(),
        expiresAt = event.getExpiresAt()
    );
    Sub2apiClient.ApiKeyResult result = sub2apiClient.createApiKey(req);
    userRepository.saveCloudApiKey(event.getUserId(), result.getKey(), result.getId());
}

@EventListener
public void onSubscriptionExpired(SubscriptionExpiredEvent event) {
    String sub2apiKeyId = userRepository.getSub2apiKeyId(event.getUserId());
    if (sub2apiKeyId != null) {
        sub2apiClient.deleteApiKey(sub2apiKeyId);
        userRepository.clearCloudApiKey(event.getUserId());
    }
}
```

#### 4.3.2 改造 `GET /api/v1/codex-accounts/me`

从"返回平台分配的 codex token 明文列表"改为"返回一个 cw_* key 和 relay base_url"：

```json
// 旧版（废弃）
{
  "accounts": [
    { "codex_user_id": "...", "access_token": "eyJ...", "refresh_token": "...", ... }
  ]
}

// 新版
{
  "relay": {
    "base_url": "https://relay.clawwiki.dev",
    "cw_key": "cw_2f8c4a9b...",
    "expires_at": "2026-05-08T00:00:00Z",
    "quota": {
      "daily_requests": 10000,
      "daily_cost_cents": 1000,
      "remaining_daily_requests": 8742
    }
  }
}
```

### 4.4 L4 · claudewiki 侧改造

#### 4.4.1 `rust/crates/desktop-core/src/managed_auth.rs` 新增 `CloudManaged` variant

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DesktopManagedAuthSource {
    ImportedAuthJson,
    BrowserLogin,
    DeviceCode,
    CloudManaged,            // NEW
}

/// 新的云端托管账号记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudManagedAccount {
    pub relay_base_url: String,
    pub cw_key_id: String,
    pub cw_key_cipher: Vec<u8>,     // AES-256-GCM 加密后的 cw_* key
    pub expires_at: DateTime<Utc>,
    pub daily_quota_cents: i64,
    pub synced_at: DateTime<Utc>,
}

impl DesktopManagedAuthRuntimeClient {
    pub async fn import_cloud_managed(
        &self,
        acct: CloudManagedAccount,
    ) -> Result<(), ManagedAuthError> { /* ... */ }

    pub async fn get_cloud_managed(&self) -> Option<CloudManagedAccount> { /* ... */ }

    pub async fn clear_cloud_managed(&self) -> Result<(), ManagedAuthError> { /* ... */ }
}
```

Key 存储：走 OS keychain（`secure_storage.rs` 已有的 AES-256-GCM encrypt 路径）。

#### 4.4.2 新增 `rust/crates/desktop-core/src/codex_broker.rs`

```rust
use std::sync::Arc;
use reqwest::Client;
use serde_json::Value;
use tokio::sync::OnceCell;

use crate::managed_auth::DesktopManagedAuthRuntimeClient;

pub struct CodexBroker {
    managed_auth: Arc<DesktopManagedAuthRuntimeClient>,
    http: Client,
    cached_key: OnceCell<(String, String)>,    // (relay_base_url, cw_key)
}

impl CodexBroker {
    pub fn new(managed_auth: Arc<DesktopManagedAuthRuntimeClient>) -> Self {
        Self {
            managed_auth,
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .unwrap(),
            cached_key: OnceCell::new(),
        }
    }

    async fn resolve_key(&self) -> Result<(String, String), BrokerError> {
        if let Some(c) = self.cached_key.get() {
            return Ok(c.clone());
        }
        let acct = self
            .managed_auth
            .get_cloud_managed()
            .await
            .ok_or(BrokerError::NotProvisioned)?;
        let key = self
            .managed_auth
            .decrypt_cw_key(&acct.cw_key_cipher)
            .await?;
        let pair = (acct.relay_base_url, key);
        let _ = self.cached_key.set(pair.clone());
        Ok(pair)
    }

    /// 唯一入口。只给同 workspace 的其它 crate 调用。
    pub async fn chat_completion(
        &self,
        req: ChatRequest,
    ) -> Result<ChatStream, BrokerError> {
        let (base, key) = self.resolve_key().await?;
        let url = format!("{}/v1/messages", base);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&key)
            .json(&req)
            .send()
            .await
            .map_err(BrokerError::Transport)?;

        if resp.status() == 401 || resp.status() == 403 {
            // key 过期 / 被撤销。清缓存让下次重新走 managed_auth
            self.cached_key.take();
            return Err(BrokerError::KeyRevoked);
        }
        if !resp.status().is_success() {
            return Err(BrokerError::Upstream(resp.status(), resp.text().await.unwrap_or_default()));
        }
        // 透传 SSE 流
        Ok(ChatStream::from_response(resp))
    }

    /// 给 Settings 页 GET /api/broker/status 用
    /// 只返回数字，不返回任何 key
    pub async fn public_status(&self) -> BrokerPublicStatus {
        let acct = self.managed_auth.get_cloud_managed().await;
        BrokerPublicStatus {
            provisioned: acct.is_some(),
            expires_at: acct.as_ref().map(|a| a.expires_at),
            daily_quota_cents: acct.map(|a| a.daily_quota_cents).unwrap_or(0),
            // NOT: any key / token material
        }
    }
}
```

#### 4.4.3 desktop-server 路由

```rust
// rust/crates/desktop-server/src/lib.rs · 新增
POST /api/desktop/cloud/key/sync     // 从 trade-service 收到后同步到 managed_auth
GET  /api/desktop/cloud/key/status   // 只返回数字，给 Settings 页
POST /api/desktop/cloud/key/clear    // 退订时清
GET  /api/broker/status              // BrokerPublicStatus

// NOT：
//   POST /v1/chat/completions
//   POST /v1/messages
//   这两个绝对不暴露，CodexBroker 只给同 workspace 的其它 crate 调用
```

#### 4.4.4 前端 `features/billing/cloud-accounts-sync.ts` 重写

目前这个文件写了一个不规范的路径（把 token 明文存前端 JSON）。改成：

```ts
export async function syncCloudKey(payload: CloudKeyResp) {
  // 1. desktop-server 收到 payload
  await desktopTransport.post("/api/desktop/cloud/key/sync", payload);
  // 2. 前端只保留一个引用 ID，不存 key material
  localStorage.setItem("occ-cloud-key-synced", "true");
}

export async function clearCloudKey() {
  await desktopTransport.post("/api/desktop/cloud/key/clear", {});
  localStorage.removeItem("occ-cloud-key-synced");
}
```

---

## 5. Token 生命周期 + 安全模型

### 5.1 Token 在每一层的状态

| 层 | Token 形态 | 明文位置 | 加密位置 | 生命周期 |
|---|---|---|---|---|
| **L1 macOS** | `data/tokens/<email>.json`（OAuth 原始值） | 磁盘（临时） | 无 | 上传成功后立即删除，失败进 upload queue 重试 |
| **L1 → L2 传输** | HTTPS POST body | 无（HTTPS 加密传输） | TLS 1.3 | < 1s |
| **L2 PostgreSQL** | `accounts.credentials` (JSONB) | 无 | AES-256-GCM（`TOTP_ENCRYPTION_KEY`） | 直到账号被 expire / delete |
| **L2 内存** | Go struct 临时持有 | 有（请求处理期） | 无 | 单次请求 |
| **L2 → 上游** | Authorization header | 无（HTTPS 加密传输） | TLS 1.3 | 单次请求 |
| **L2 → L4 鉴权** | `cw_*` key（**不是** Codex token！） | 仅上层 JWT | sub2api hash | 订阅期 |
| **L3 trade-service 响应** | `cw_*` key in JSON body | 有（单次响应） | HTTPS 加密 | 单次响应 |
| **L4 claudewiki OS keychain** | `cw_*` key | 无 | OS 级加密 | 直到订阅到期 |
| **L4 Rust 内存** | `CodexBroker.cached_key` | 有（进程期） | 无 | 进程生命周期 |
| **L4 前端** | 从头到尾不见 `cw_*` / token | 无 | — | — |

### 5.2 泄漏面分析

| 泄漏场景 | 影响 | 缓解 |
|---|---|---|
| macOS 机器被盗 | 最近一次上传前的 token 可能在磁盘 | 上传成功立即删；本机加密 `data/` 目录（FileVault） |
| L1 → L2 网络被抓包 | 新 token 暴露 | TLS 1.3 + certificate pinning（sub2api_uploader.py 里加） |
| sub2api 数据库被脱裤 | **所有** Codex token 暴露（最严重）| AES-256-GCM + `TOTP_ENCRYPTION_KEY` 存 HSM / secrets manager |
| sub2api admin 账号被破解 | 可以 `ImportData` 注入 token + 改配额 | admin JWT 短期 + mTLS + IP 白名单 |
| `cw_*` key 泄漏 | 该用户订阅期内被盗用额度 | 订阅到期自动 revoke；用户可主动 rotate |
| claudewiki 桌面被盗 | OS keychain 里的 `cw_*` 暴露 | keychain 要求密码解锁；用户 revoke remote |
| trade-service 被 pwn | 可以代签发 `cw_*` key | trade-service → sub2api 的 admin JWT 放 KMS，不落盘 |

### 5.3 为什么 sub2api 的 `AES-256-GCM` 比 CRS 的 `AES-256-CBC` 好

- **GCM 是 AEAD**（Authenticated Encryption with Associated Data）：密文自带完整性校验
- **CBC 没有自带 MAC**：CRS 如果没手工加 HMAC，存在理论上的 padding oracle 攻击面
- GCM 的 nonce 只要是 unique 就安全，sub2api 在 `aes_encryptor.go` 里把 nonce 拼进密文

---

## 6. 兼容性：sub2api 原生 `DataAccount` 能装下 Codex token 吗？

### 6.1 需要 team 实测 / 确认的 3 件事

| 问题 | 如何确认 |
|---|---|
| **Q1** sub2api 的 `Platform` 枚举里是否有 "openai" 对应 Codex OAuth？ | 读 `backend/internal/domain/account_type.go` / `ent/schema/account.go` 看枚举值；实在没有，fork 加一个 `chatgpt_oauth` |
| **Q2** `OpenAIOAuthClient.RefreshTokenWithClientID` 调的 refresh endpoint 是否是 ChatGPT 的那个（不是 OpenAI API platform 的那个）？ | 读 `pkg/openai/` 下实现，对比 gpt-register 的 `token_extractor.py` 里 refresh 逻辑是否一致 |
| **Q3** sub2api 的 gateway handler 把 `/v1/messages` 转发到上游时，是否能正确生成 ChatGPT Codex `/backend-api/codex/responses` 的请求格式？ | 实测一次：手工从 gpt-register 抽一个 token → 手工 import 到 sub2api → 用 curl 打 `/v1/messages` → 看是否能拿到 SSE 响应 |

**Sprint 0 的第一件事就是这个 smoke test**——跑通了才继续写 gpt-register uploader。

### 6.2 如果 sub2api 原生不支持 Codex → 最小化 fork 方案

如果 Q1-Q3 其中一个 fail，fork 改动如下：

```go
// 1. 加一个 "chatgpt_oauth" platform enum 值
// backend/internal/domain/account_type.go
const (
    PlatformOpenAI        = "openai"
    PlatformChatGPTOAuth  = "chatgpt_oauth"    // 新增
)

// 2. 在 oauth_service.go 加 ChatGPT 专用 refresh 路径
func (s *OAuthService) RefreshChatGPTToken(ctx context.Context, acct *Account) error {
    client := NewChatGPTOAuthClient("https://auth.openai.com/oauth/token")
    cred := acct.DecryptedCredentials()
    resp, err := client.RefreshTokenWithClientID(
        ctx,
        cred["refresh_token"].(string),
        "",
        cred["client_id"].(string),    // "app_EMoamEEZ73f0CkXaXp7hrann"
    )
    // ... 存回 AES-256-GCM 加密
}

// 3. gateway handler 里为 chatgpt_oauth 类账号走自定义 upstream
// handler/openai_gateway_handler.go
if account.Platform == domain.PlatformChatGPTOAuth {
    upstream := "https://chatgpt.com/backend-api/codex/responses"
    // ... 构造 request
}
```

改动量：~300-500 行 Go 代码 + 3-5 天。

---

## 7. 和 canonical [`product-design.md` D3](./product-design.md) 的 reconciliation

### 7.1 表面上的冲突

Canonical D3 原文：

> **刃一 · 定位刃 · Token 100% 内部消化**
> - `CodexBroker` 是一个 Rust struct，**不是**一个 HTTP 服务
> - 外部应用（Cursor / CLI / CCD / 第三方）**无法**从 127.0.0.1:4357 拿到任何 token

本文档的方案把 Broker 从"本机 Rust 内聚"变成了"云端 sub2api + `cw_*` key"。乍看之下违反 D3。

### 7.2 实际上没有冲突

关键在于**D3 的不变量是"只服务 ClawWiki"**，不是"必须在 127.0.0.1"。只要下面三条还成立，D3 的精神就是保留的：

1. **只有 ClawWiki 用户能拿到 `cw_*` key**（trade-service 订阅校验）
2. **`cw_*` key 不是一个通用 API key**，不对外发文档，不 document 成 "pointing Cursor at it"
3. **外部应用从 127.0.0.1:4357 仍然拿不到任何 token**——因为 desktop-server 这层依然没有 `/v1/*` 路由，`CodexBroker` 仍然是 Rust struct

### 7.3 修订 canonical D3 的建议文案

```diff
- ### 刃一 · 定位刃 · Token 100% 内部消化
+ ### 刃一 · 定位刃 · 只服务 ClawWiki

- `CodexBroker` 是一个 Rust struct，**不是**一个 HTTP 服务
- 只有两个消费者：`AskSession` 和 `WikiMaintainer`
+ `CodexBroker` 是一个 Rust struct 调云端 `sub2api` 中转，对外界来说是一个黑盒
+ 只有三个消费者：`AskSession`、`WikiMaintainer`、`WikiIngest`
+ 前端从头到尾拿不到 Codex access_token，只能看到一个长期 `cw_*` key 存 OS keychain
- 外部应用（Cursor / CLI / CCD / 第三方）**无法**从 127.0.0.1:4357 拿到任何 token
+ 外部应用无法从 127.0.0.1:4357 拿到任何 token——desktop-server 不暴露 /v1/* 路由
+ 云端 sub2api 的 `cw_*` key 只发给 active 订阅用户，不对外开放
```

这个改动是 canonical 文档的小补丁，不需要重写产品设计。**D1-D4 战略级投票不变**。

---

## 8. 成本 / 容量模型

### 8.1 单 Codex 账号的产能假设

（需要实测校正）

| 指标 | 估计值 |
|---|---|
| 每账号每天可用请求数（ChatGPT Free tier） | ~50 requests（常被 throttle） |
| 每账号每天可用请求数（ChatGPT Plus tier） | ~1,000 requests |
| 平均单请求 token 用量 | 4k in + 2k out = 6k |
| 每账号每天 token 产能（Free）| ~300k tokens |
| 每账号每天 token 产能（Plus）| ~6M tokens |

### 8.2 ClawWiki 单用户的 token 消耗假设

| 场景 | 请求数/天 | token/req | 日 token 消耗 |
|---|---|---|---|
| 微信日进账 10 条素材 · 每条触发 1 次 maintainer | 10 | 12k | 120k |
| Ask 会话 · 日 5 次 · 每次 5 轮 | 25 | 6k | 150k |
| 陈旧度 lint · 日 1 次全扫 | 1 | 50k | 50k |
| **合计** | ~36 | — | **~320k tokens/day/user** |

### 8.3 账号池容量规划

| 订阅用户数 | 日 token 需求 | 需要的 Plus 账号数（按 6M/天）| 需要的 Free 账号数（按 300k/天）|
|---|---|---|---|
| 50 | 16M | 3 | 54 |
| 200 | 64M | 11 | 213 |
| 1000 | 320M | 54 | **1066（不现实）** |

**结论**：
- 若 ChatGPT Plus 订阅允许 Codex OAuth 使用，**3-15 个 Plus 账号**能覆盖 MVP 用户规模（50-200）
- Free 账号数量要求飞涨到不现实——只作 fallback 或 Plus 账号不够用时的保险
- **最佳方案**：订阅用户 ≤ 50 时纯 Free 跑（50 个账号），≥ 200 后引入 Plus（10+ 个）

### 8.4 fleet 机器数与账号产能

gpt-register 每台 Mac 的注册速率（估计）：

- 单次注册（Selenium + OTP + PKCE）：60-120 秒
- 可持续速率：25-50 账号/小时（考虑 OpenAI 的速率限制和 ban 风险）
- 每天可跑 16 小时（rotate 3-4 IP 段）：400-800 账号/天

**注意**：新注册账号的存活率不是 100%。OpenAI 会在 6 小时-1 周内审查并 ban 一部分"明显批量"的账号。保守假设 40% 存活 > 48 小时。

**净产能**：每台 Mac 每天 ~160-320 存活账号。**3 台 Mac 的 fleet** 足够维持 200-用户规模。

### 8.5 月度成本估算

| 项 | 单价 | 数量 | 月费 |
|---|---|---|---|
| Mac mini 机器折旧 | ¥300/月 | 3 台 | ¥900 |
| 住宅 IP 代理（OpenAI 反 VPN 敏感）| ¥100/IP/月 | 3 | ¥300 |
| Cloudflare Workers（临时邮箱） | 免费额度内 | — | ¥0 |
| 云端 sub2api 服务器（4 vCPU / 8 GB / 100 GB SSD） | ¥350/月 | 1 | ¥350 |
| 带宽（估 200 GB/月） | ¥0.5/GB | 200 | ¥100 |
| **合计** | | | **≈ ¥1,650/月** |

对应的订阅收入（假设 ¥99/月 × 200 用户 = ¥19,800/月）：基础设施成本占 ~8%。远低于毛利红线。

---

## 9. 风险登记册

| ID | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| **R1** | OpenAI 封杀 `app_EMoamEEZ73f0CkXaXp7hrann` client_id | 中 | 致命（全部 token 失效） | 备份：记录多个已知 Codex/ChatGPT 客户端的 client_id；改造 gpt-register 支持多 client |
| **R2** | 新注册账号大规模 ban（48h 内 > 60%） | 中 | 高（产能崩盘） | IP 池轮换 + 降低注册速率 + 可选付费 Plus 账号 |
| **R3** | 临时邮箱域名（`yongshengxingda.com`）被 OpenAI 拉黑 | 高 | 中（换域名即可） | 准备 3-5 个备用域名 + 自动 fallback |
| **R4** | sub2api 数据库被脱裤 | 低 | 致命 | `TOTP_ENCRYPTION_KEY` 存 AWS KMS / secrets manager；daily offsite backup |
| **R5** | 云端 sub2api 单机宕机 | 中 | 高（claudewiki 所有 AI 功能中断） | 主备部署或冷备恢复 SOP（< 1h RTO） |
| **R6** | `trade-service → sub2api admin API` 凭据泄漏 | 低 | 高（可批量发 key 盗用额度）| 双向 mTLS + 短期 JWT + 审计日志 |
| **R7** | 某用户的 `cw_*` key 泄漏 | 中 | 低（只影响该用户额度）| per-key 日 cap + 主动 rotate |
| **R8** | canonical D3 和本方案的不一致被市场营销误读 | 低 | 中（舆论风险）| §7 的文档补丁 + 对外话术统一："ClawWiki 的 Codex 池只服务 ClawWiki 自己的用户" |
| **R9** | OpenAI ToS 条款被强制执行 | 中 | 致命（项目下线）| 准备合法 API 替代（OpenAI platform API key，按用量付费）+ 告知用户 |
| **R10** | Codex 协议变更 (CLIENT_ID 弃用, PKCE flow 变化) | 中 | 高 | 订阅 gpt-register 上游，快速跟进 |
| **R11** | gpt-register 和 sub2api 的 `DataAccount.Credentials` shape 不完全兼容 | 低 | 低 | Sprint 0 smoke test 验证 |
| **R12** | 单台 Mac 的 `gpt-register` 占用内存过高（Selenium + Chrome） | 低 | 低 | 定期 restart daemon + 监控 |

---

## 10. Sprint 路线图（基础设施侧）

这些 sprint 和 [`product-design.md §12`](./product-design.md) 的产品 sprint **并行进行**，不冲突（产品 sprint 负责桌面端，本 sprint 负责云+采集）。

| Sprint | 周 | 交付 | 成功判据 |
|---|---|---|---|
| **I0 · smoke test** | W1 前半 | 手工跑一遍全链路：1 台 Mac gpt-register 跑一次 → 手工 import 一个 token 到 sub2api → 手工 curl `/v1/messages` → 验证 SSE 响应 | 拿到一个从 ClawWiki Rust 层能成功调用的 `cw_*` key + SSE 正常流回 |
| **I1 · sub2api 部署** | W1 后半 | 云端部署 sub2api + PG + Redis + Caddy · 创建 "codex-clawwiki-pool" group · 创建 fleet ingest JWT · 创建 trade-service admin JWT | relay.clawwiki.dev 可访问 · `/health` 通过 · admin UI 可登录 |
| **I2 · gpt-register uploader** | W2 | 写 `sub2api_uploader.py` + 改 `register.py` + 改 `daemon.py` + config · 跑一台 Mac 24h 验证 | 单机 24h 产出 50-100 tokens，sub2api account 数对应增加 |
| **I3 · trade-service 改造** | W3 | 加 subscription ACTIVE/EXPIRED webhook → sub2api admin API · 改造 `/api/v1/codex-accounts/me` · 给 user 表加 `sub2api_key_id` 字段 | 下单 → 付款 → 拿到 cw_* key |
| **I4 · claudewiki CloudManaged** | W4 | `managed_auth.rs` 加 `CloudManaged` 变体 · `codex_broker.rs` 新 crate · `desktop-server` 加 `/api/desktop/cloud/key/*` 路由 · 前端 `cloud-accounts-sync.ts` 重写 | Rust 侧能从 Ask/Maintainer 调 CodexBroker.chat_completion，流式响应能回到 React 组件 |
| **I5 · fleet 扩容** | W5 | 加到 3 台 Mac · 搭监控（prometheus + grafana）· 日报 upload 成功率 / 账号存活率 | 日产 100-300 新 tokens，sub2api 池 > 500 accounts |
| **I6 · 健康度 + alerting** | W6 | 加 canary 账号 · 加 key revocation 实测 · 加 `/health` 深度检查 · 冷备恢复演练 | 模拟 sub2api 宕机 → trade-service 降级返回 503 → claudewiki 显示友好错误，而不是崩溃 |

**基础设施 MVP 完成的时间跟产品 MVP S0-S6 完成的时间基本一致**，这样产品发布时，供血链路也到位了。

---

## 11. 团队评审 · 决策投票表

### I1-I6 战略级（一票否决）

| ID | 决策 | 建议 | 投票 |
|---|---|---|---|
| **I1** | 云端中转用 **sub2api**，**不**用 claude-relay-service | 是 | ⬜ +1  ⬜ -1  ⬜ ? |
| **I2** | **不 fork** sub2api，只在 config 和 admin API 层面定制 | 是 | ⬜ +1  ⬜ -1  ⬜ ? |
| **I3** | gpt-register **只加一个 `sub2api_uploader.py`** 模块，不做大改 | 是 | ⬜ +1  ⬜ -1  ⬜ ? |
| **I4** | claudewiki **新增** `managed_auth::CloudManaged` variant + `codex_broker.rs` crate | 是 | ⬜ +1  ⬜ -1  ⬜ ? |
| **I5** | 补丁 canonical `product-design.md` §4 D3 的文案（"只服务 ClawWiki"而不是"只在 127.0.0.1"）| 是 | ⬜ +1  ⬜ -1  ⬜ ? |
| **I6** | `cw_*` key **只存 OS keychain**，前端 JS 从头到尾不拿 key material | 是 | ⬜ +1  ⬜ -1  ⬜ ? |

### I7-I15 战术级（产品边界 + 技术）

| ID | 决策 | 建议 | 投票 |
|---|---|---|---|
| **I7** | sub2api 开 `RUN_MODE=simple`，禁用公开注册 | 是 | ⬜ +1  ⬜ -1 |
| **I8** | Caddy 反代，Admin API 用 IP 白名单 + JWT 双层 | 是 | ⬜ +1  ⬜ -1 |
| **I9** | `TOTP_ENCRYPTION_KEY` 存 AWS KMS / GCP Secret Manager，**不** 落盘 | 是 | ⬜ +1  ⬜ -1 |
| **I10** | `trade-service → sub2api admin` 用双向 mTLS | 是 | ⬜ +1  ⬜ -1 |
| **I11** | gpt-register 的 `data/tokens/` 在上传成功后**立即**删除，不留多副本 | 是 | ⬜ +1  ⬜ -1 |
| **I12** | 一台 Mac 一个 daemon 实例，**不**跑多实例避免 race | 是 | ⬜ +1  ⬜ -1 |
| **I13** | Free-tier 账号池作 MVP 主力，若订阅 > 50 用户再引入 Plus 账号 | 是 | ⬜ +1  ⬜ -1 |
| **I14** | 准备 OpenAI platform API key 作 **合法 fallback**，R9 触发时切换 | 是 | ⬜ +1  ⬜ -1 |
| **I15** | Sprint 0 先做 smoke test（手工跑一遍全链路），再写 gpt-register uploader | 是 | ⬜ +1  ⬜ -1 |

### I16-I20 法务 / 叙事

| ID | 决策 | 建议 | 投票 |
|---|---|---|---|
| **I16** | 对外话术：**"ClawWiki 的 Codex 池只服务 ClawWiki 自己的用户"**，避免"token broker"术语 | 是 | ⬜ +1  ⬜ -1 |
| **I17** | **不** 在用户 UI 里提及 "gpt-register" 或任何采集方式 | 是 | ⬜ +1  ⬜ -1 |
| **I18** | 用户服务条款要说明 "LLM 额度由 ClawWiki 维护的 Codex 池提供" | 是 | ⬜ +1  ⬜ -1 |
| **I19** | R9（OpenAI ToS 强制执行）的 contingency：准备 30 天内切换到合法 API 的预案 | 是 | ⬜ +1  ⬜ -1 |
| **I20** | fleet Mac 的运维归口：专人负责还是外包？ | 待定 | ⬜ 内部 ⬜ 外包 |

---

## 12. 开放问题（需要团队会上讨论）

1. **sub2api 的 `Platform` / `Type` 枚举具体字符串是什么？** 需要在 Sprint I0 smoke test 中确认（读 `ent/schema/account.go`）
2. **Codex 后端 API 的真实 endpoint 和协议是什么？** 是 `https://chatgpt.com/backend-api/codex/responses` 吗？sub2api 的 gateway 默认指向的是 OpenAI platform API，可能需要定制 `upstream_url`
3. **`cw_*` key 的 prefix 和长度规范**（目前 sub2api 默认是 `sk-*`，我们需不需要自定义成 `cw_*`？）
4. **订阅层级定价**：Free tier 用户用多少额度的 ClawWiki？Pro 多少？价格梯度？
5. **gpt-register 的 phone verification 成功率**：新注册账号多少比例会被要求 phone？这个数字决定产能公式
6. **sub2api → 上游 ChatGPT 的国家/地区限制**：服务器放哪里？直连 chatgpt.com 需要解决网络问题
7. **备份 / 灾备**：sub2api 的 PostgreSQL 每天 offsite 备份吗？RPO / RTO 目标？
8. **canary 账号**：在 sub2api 里留 1-2 个"不会被用户池调度"的账号，专门跑 /health 深度检查？
9. **Prometheus 指标 export**：sub2api 默认没有 `/metrics`，我们要不要加？加了给谁用？
10. **多 region**：如果未来 claudewiki 的海外用户多了，是否单点 sub2api 能扛住？

---

## 13. 附录

### A. 命名对齐表

| 概念 | 本文档的叫法 | product-design.md 的叫法 | 代码里的叫法 |
|---|---|---|---|
| 云端中转 | sub2api cloud relay | "内聚 Broker 的云端版" | `sub2api` |
| macOS 采集器 | fleet node | — | `gpt-register` daemon |
| 订阅服务 | trade-service | 产品文档没细说 | Java 微服务 |
| 桌面应用 | ClawWiki | ClawWiki | `apps/desktop-shell` |
| 桌面 Rust 层 | L4 | Rust desktop-core | `rust/crates/desktop-core` |
| 云端 API key（发给用户） | `cw_*` key | "Codex Pool" 订阅 | 要新定义 |
| Codex OAuth token | Codex token / ChatGPT OAuth | "Codex 海量 token" | `access_token` / `refresh_token` / `id_token` |

### B. 关键源码路径速查

#### sub2api
- Account 模型：`backend/ent/schema/account.go`
- DataImportRequest：`backend/internal/handler/admin/account_data.go:60`
- OpenAI OAuth refresh：`backend/internal/service/oauth_service.go:14-17, 25`
- Gateway handler：`backend/internal/handler/gateway_handler.go`
- OpenAI 格式转换：`backend/internal/handler/openai_gateway_handler.go`
- AES-256-GCM：`backend/internal/repository/aes_encryptor.go:30-50`
- Admin 路由注册：`backend/internal/server/routes/admin.go`

#### gpt-register
- CLIENT_ID：`gpt_register/token_extractor.py:29`
- PKCE 生成：`gpt_register/token_extractor.py:58-65`
- 注册主流程：`gpt_register/register.py`
- Daemon 循环：`gpt_register/daemon.py`
- Token pool：`gpt_register/token_pool.py`
- Codex export：`gpt_register/codex_export.py`

#### claudewiki
- managed_auth enum：`rust/crates/desktop-core/src/managed_auth.rs:54`
- secure storage（AES-256-GCM）：`rust/crates/desktop-core/src/secure_storage.rs`
- 前端 cloud sync（待废弃）：`apps/desktop-shell/src/features/billing/cloud-accounts-sync.ts`
- Settings → Billing 页面：`apps/desktop-shell/src/features/settings/sections/MultiProviderSettings.tsx`

### C. 一句话总结

> **`gpt-register` 的 macOS fleet 产 Codex OAuth token，上传到 `sub2api` 云端池子，`sub2api` 通过 `cw_*` 长期 key 只对 ClawWiki 订阅用户开放，claudewiki 的 Rust `CodexBroker` 通过 `cw_*` key 调 `/v1/messages`——前端永远见不到底层 token。**

> 这条供血链路让 ClawWiki 的用户完全不用操心 Codex token 的事，对 ClawWiki 的 Rust 层来说就是一个 async 函数调用。
