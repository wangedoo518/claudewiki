# 04 - WeChat Kefu 模块规格书

> **模块**: WeChat Kefu (微信客服闭环)
> **版本**: v2.0-draft
> **最后更新**: 2026-04-14
> **状态**: 设计完成, 待实现
> **前置依赖**: `technical-design.md` 第一至五章, `01-skill-engine.md`

WeChat Kefu 是 ClawWiki 的微信消息入口闭环模块。它将微信客服消息 (URL/文本/文件/?问题) 自动路由到知识管道: URL/文本/文件消息经过 ingest 适配器转为 raw entry 后自动触发 `/absorb`; `?` 前缀问题消息直接路由到 `/query` 返回知识库答案。整个流程从消息接收到回复完全自动化, 无需用户在桌面端手动干预。

**设计哲学**:

- **WeChat 是唯一漏斗**: 微信转发 = 知识投喂, 这是 ClawWiki 的核心入口, 不是辅助通道
- **零触碰自动化**: 用户在微信端发一条消息, 后端自动完成: 接收 → 分类 → 摄入 → 吸收 → 回复确认
- **双向闭环**: 不仅接收消息, 还要给出有意义的回复: 入库确认 / 知识问答 / 错误提示
- **失败可恢复**: 任何环节失败都不丢消息, raw entry 写入后即使 absorb 失败也能手动重试

---

## 1. 职责边界

### 1.1 WeChat Kefu 拥有的职责

| 职责 | 说明 | 代码位置 |
|------|------|----------|
| 消息接收 | 通过 callback endpoint 接收微信客服推送的消息事件 | `desktop-server` callback handler |
| 消息分类 | 将收到的消息按类型分类: URL / 文本 / 文件 / 图片 / ?问题 | `wechat_kefu::desktop_handler` (新增路由逻辑) |
| URL 消息摄入 | URL 消息 → `wiki_ingest::url::fetch_and_body()` → `wiki_store::write_raw_entry()` | `wechat_kefu::desktop_handler` |
| 文本消息摄入 | 纯文本消息 → `wiki_store::write_raw_entry(source="wechat-text")` | `wechat_kefu::desktop_handler` |
| 文件/图片摄入 | 文件消息 → `wiki_ingest` 对应适配器 → `wiki_store::write_raw_entry()` | `wechat_kefu::desktop_handler` |
| 自动触发吸收 | 摄入完成后自动 POST `/api/wiki/absorb` 触发 SKILL Engine 吸收 | `wechat_kefu::desktop_handler` (新增) |
| ?问题路由 | `?` 前缀消息 → `wiki_maintainer::query_wiki()` → 格式化答案 | `wechat_kefu::desktop_handler` (新增) |
| 回复发送 | 通过 kefu client 向用户发送处理结果确认消息 | `wechat_kefu::client::KefuClient` |
| 连接管理 | CF Worker 部署、callback 验证、monitor 启停 | `wechat_kefu::pipeline` + `monitor` |
| 配置管理 | 保存/加载 corpid、secret、token 等配置 | `wechat_kefu::account` |

### 1.2 WeChat Kefu 不拥有的职责

| 职责 | 归属模块 | 说明 |
|------|----------|------|
| SKILL 执行 (absorb 具体逻辑) | SKILL Engine / `wiki_maintainer` | Kefu 只触发 absorb, 不执行吸收算法 |
| 磁盘写入 (raw/wiki 数据) | `wiki_store` | Kefu 调用 `write_raw_entry`, 不直接操作文件系统 |
| 格式转换 (HTML/PDF/DOCX -> markdown) | `wiki_ingest` | Kefu 调用 ingest 适配器, 不实现转换逻辑 |
| LLM API 调用 | `codex_broker` | 通过 SKILL Engine 间接使用 |
| 前端对话渲染 | Chat Tab | 微信消息不在 Chat Tab 中展示 (未来可能通过 Inbox 可见) |
| UI 渲染 | Settings Modal (WeChat Hub 面板) | Kefu 提供数据, 不控制 UI |

### 1.3 消息处理合约 (不可违反)

```
URL 消息:   必须先 fetch_and_body 抓取内容, 再 write_raw_entry 持久化, 最后触发 absorb
文本消息:   必须先 write_raw_entry(source="wechat-text") 持久化, 再触发 absorb
文件消息:   必须先下载到临时目录, 经 wiki_ingest 适配器提取内容, 再 write_raw_entry 持久化
?问题消息:  直接路由到 query_wiki; 问题本身不写入 raw/, 但实质性回答 (>200 字符) 由 query_wiki 自动结晶到 raw/ (source="query")
所有消息:   write_raw_entry 成功后消息即视为"已接收", 后续 absorb 失败不影响数据安全
```

---

## 2. 依赖关系

### 2.1 Crate 依赖图

```
                     ┌─────────────────┐
                     │ desktop-server  │  (callback endpoint, HTTP handlers)
                     └────────┬────────┘
                              │ callback event
                              ▼
                     ┌─────────────────┐
                     │  wechat_kefu    │  (消息接收 + 分类 + 路由)
                     │  desktop_handler│
                     │  callback       │
                     │  client         │
                     └──┬──────┬──┬───┘
                        │      │  │
           ┌────────────┘      │  └──────────────┐
           ▼                   ▼                  ▼
    ┌──────────────┐  ┌──────────────┐   ┌──────────────┐
    │ wiki_ingest  │  │  wiki_store  │   │wiki_maintainer│
    │ url/html/pdf │  │write_raw_entry│  │ query_wiki   │
    │ docx/image   │  │              │   │ (SKILL Engine)│
    └──────────────┘  └──────────────┘   └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │ codex_broker │  (LLM 调用)
                                         └──────────────┘
```

### 2.2 上游依赖 (Kefu 读取/调用)

| 依赖 | Crate | 接口 | 用途 |
|------|-------|------|------|
| URL 抓取 | `wiki_ingest` | `url::fetch_and_body(url) -> IngestResult` | 抓取微信文章/URL 内容 |
| 微信文章抓取 | `wiki_ingest` | `wechat_fetch::fetch_wechat_article(url) -> IngestResult` | 微信公众号文章专用抓取 (Playwright) |
| HTML 提取 | `wiki_ingest` | `extractor::extract_from_html(html, url) -> ExtractedArticle` | HTML → 结构化文章 |
| PDF 提取 | `wiki_ingest` | `pdf::extract_pdf(path) -> IngestResult` | PDF 内容提取 |
| DOCX 提取 | `wiki_ingest` | `docx::extract_docx(path) -> IngestResult` | Word 文档提取 |
| 图片准备 | `wiki_ingest` | `image::prepare_image(path) -> IngestResult` | 图片 → data URI + OCR (未来) |
| Raw 写入 | `wiki_store` | `write_raw_entry(paths, meta, body) -> RawEntry` | 写入 raw/ 目录 |
| 知识问答 | `wiki_maintainer` (通过 SKILL Engine) | `query_wiki(question, wiki_paths, broker) -> QueryResult` | ?问题 grounded Q&A |
| Absorb 触发 | `desktop-server` (HTTP 自调用) | `POST /api/wiki/absorb { entry_ids: [id] }` | 自动触发吸收 |
| 消息回复 | `wechat_kefu::client` | `KefuClient::send_text(open_kfid, user_id, text)` | 向微信用户发送回复 |

### 2.3 下游消费者

| 消费者 | 层 | 接口 | 用途 |
|--------|-----|------|------|
| 前端 WeChat Hub | Settings Modal | `GET /api/desktop/wechat-kefu/status` | 展示连接状态和消息日志 |
| Inbox | `features/inbox/*` | `wiki_store::append_inbox_pending` | 新 raw entry 触发 Inbox 条目 |
| Dashboard | `features/dashboard/*` | `GET /api/wiki/raw` (统计最近摄入) | 统计微信来源的摄入数量 |

---

## 3. API 接口

### 3.1 已有端点清单

| 端点 | 方法 | 用途 | Handler |
|------|------|------|---------|
| `/api/desktop/wechat-kefu/config` | POST | 保存 Kefu 配置 (corpid, secret, token...) | `save_kefu_config_handler` |
| `/api/desktop/wechat-kefu/config` | GET | 加载 Kefu 配置 (脱敏) | `load_kefu_config_handler` |
| `/api/desktop/wechat-kefu/account/create` | POST | 创建客服账号 | `create_kefu_account_handler` |
| `/api/desktop/wechat-kefu/contact-url` | GET | 获取客服接入链接 | `get_kefu_contact_url_handler` |
| `/api/desktop/wechat-kefu/status` | GET | 获取整体状态 (连接/监控/账号) | `kefu_status_handler` |
| `/api/desktop/wechat-kefu/monitor/start` | POST | 启动消息监控 | `start_kefu_monitor_handler` |
| `/api/desktop/wechat-kefu/monitor/stop` | POST | 停止消息监控 | `stop_kefu_monitor_handler` |
| `/api/desktop/wechat-kefu/callback` | GET | 微信 callback URL 验证 (echostr) | `kefu_callback_verify_handler` |
| `/api/desktop/wechat-kefu/callback` | POST | 微信 callback 事件接收 (MsgReceive) | `kefu_callback_event_handler` |
| `/api/desktop/wechat-kefu/pipeline/start` | POST | 启动一键部署流水线 | `start_kefu_pipeline_handler` |
| `/api/desktop/wechat-kefu/pipeline/status` | GET | 获取部署流水线状态 | `kefu_pipeline_status_handler` |
| `/api/desktop/wechat-kefu/pipeline/cancel` | POST | 取消部署流水线 | `cancel_kefu_pipeline_handler` |

### 3.2 新增内部调用

v2.0 不新增 HTTP 端点。新逻辑全部在 Rust 内部函数中实现, 由现有 callback handler 触发。

| 内部调用 | 触发时机 | 说明 |
|----------|----------|------|
| `ingest_and_absorb(msg)` | callback 收到 MsgReceive → sync_msg 取到消息 | 新增: 消息 → 摄入 → 自动 absorb |
| `handle_query(question)` | callback 收到 `?` 前缀文本消息 | 新增: 问题 → query_wiki → 回复答案 |
| `POST /api/wiki/absorb` | `ingest_and_absorb` 内部 HTTP 自调用 | 复用已有端点, 通过 reqwest localhost 调用 |

### 3.3 回复消息格式

| 场景 | 回复内容 |
|------|----------|
| URL 摄入成功 | `"已入库: {title}\n正在维护 {N} 个相关页面..."` |
| 文本摄入成功 | `"已入库 ({byte_size} 字)\n正在维护相关页面..."` |
| 文件摄入成功 | `"已入库: {filename} ({type})\n正在维护相关页面..."` |
| ?问题回答成功 | `"[引用 {N} 个知识页面]\n\n{answer_text}\n\n来源: {slug1}, {slug2}"` |
| ?问题结晶成功 | `"💎 回答已结晶入知识库"` (追加在问答回复之后, 仅当回答 > 200 字符时触发) |
| 冲突解决: 采纳新观点 | `"✅ 判断已更新：{old_claim} → {new_claim}"` (当用户在 Inbox 中批准 supersession 后推送) |
| 摄入失败 | `"入库失败: {error_message}\n请稍后重试或检查链接"` |
| 问答失败 (wiki 为空) | `"知识库暂无内容, 请先发送一些素材"` |
| 问答失败 (无匹配) | `"未找到相关知识, 试试更换关键词"` |
| 未知消息类型 | `"暂不支持此类消息, 请发送文字、链接或文件"` |

---

## 4. 数据模型

### 4.1 已有类型 (Rust)

| 类型 | 位置 | 说明 |
|------|------|------|
| `KefuConfig` | `wechat_kefu/types.rs` | 持久化配置: corpid, secret, token, encoding_aes_key, open_kfid, contact_url, worker_url, relay_ws_url 等 |
| `KefuConfigSummary` | `wechat_kefu/types.rs` | 脱敏配置视图 (前端展示用) |
| `KefuStatus` | `wechat_kefu/types.rs` | 整体状态: 连接状态, 监控状态, 账号信息 |
| `CallbackEvent` | `wechat_kefu/callback.rs` | 解析后的 callback 事件: MsgReceive / EnterSession / Other |
| `KefuCallback` | `wechat_kefu/callback.rs` | callback 处理器: 签名验证 + AES-256-CBC 解密 |
| `KefuClient` | `wechat_kefu/client.rs` | 微信客服 API 客户端: send_text, sync_msg, upload_media |
| `PipelineState` | `wechat_kefu/pipeline_types.rs` | 部署流水线状态: phase, error, timestamps |
| `PipelinePhase` | `wechat_kefu/pipeline_types.rs` | 流水线阶段枚举 |

### 4.2 新增类型

```rust
/// 微信消息分类结果
#[derive(Debug, Clone)]
pub enum WeChatMessageKind {
    /// URL 链接 (微信文章或普通网页)
    Url(String),
    /// 纯文本消息
    Text(String),
    /// 文件消息 (media_id + filename)
    File { media_id: String, filename: String },
    /// 图片消息 (media_id)
    Image { media_id: String },
    /// ?前缀问题
    Query(String),
    /// 不支持的消息类型
    Unsupported(String),
}

/// Kefu 摄入处理结果
#[derive(Debug, Clone, Serialize)]
pub struct KefuIngestResult {
    /// 创建的 raw entry ID (摄入成功时)
    pub raw_entry_id: Option<u32>,
    /// 是否触发了自动 absorb
    pub absorb_triggered: bool,
    /// absorb 任务 ID (触发成功时)
    pub absorb_task_id: Option<String>,
    /// 是否已发送回复
    pub reply_sent: bool,
    /// 回复内容
    pub reply_text: Option<String>,
    /// 处理耗时 (毫秒)
    pub duration_ms: u64,
    /// 错误信息 (部分失败时)
    pub error: Option<String>,
}

/// ?问题查询结果 (格式化后)
#[derive(Debug, Clone)]
pub struct KefuQueryResult {
    /// 格式化的回复文本 (含来源引用)
    pub reply_text: String,
    /// 引用的 wiki 页面 slugs
    pub source_slugs: Vec<String>,
    /// 总 token 消耗
    pub total_tokens: usize,
}
```

### 4.3 前端类型 (已有, 用于 WeChat Hub 面板)

| 类型 | 来源 | 说明 |
|------|------|------|
| `WeChatAccountSummary` | `features/settings/api/client.ts` | 微信账号摘要 |
| `WeChatAccountStatus` | `features/settings/api/client.ts` | 账号状态 |
| `WeChatLoginStartResponse` | `features/settings/api/client.ts` | QR 登录启动响应 |
| `WeChatLoginStatusResponse` | `features/settings/api/client.ts` | 登录状态轮询响应 |

---

## 5. Rust 后端实现

### 5.1 消息处理链 (核心新增逻辑)

```rust
// wechat_kefu/desktop_handler.rs (重构)

/// 消息处理入口。由 callback handler 在收到 MsgReceive 事件后调用。
pub async fn handle_wechat_message(
    state: &DesktopState,
    msg: WeChatSyncMessage,
) -> Result<KefuIngestResult> {
    let start = std::time::Instant::now();

    // 1. 分类消息
    let kind = classify_message(&msg);

    // 2. 按类型路由
    let result = match kind {
        WeChatMessageKind::Url(url) => handle_url_message(state, &url).await,
        WeChatMessageKind::Text(text) => handle_text_message(state, &text).await,
        WeChatMessageKind::File { media_id, filename } =>
            handle_file_message(state, &media_id, &filename).await,
        WeChatMessageKind::Image { media_id } =>
            handle_image_message(state, &media_id).await,
        WeChatMessageKind::Query(question) =>
            handle_query_message(state, &question).await,
        WeChatMessageKind::Unsupported(kind) => {
            Ok(KefuIngestResult {
                reply_text: Some(format!("暂不支持 {} 类消息", kind)),
                reply_sent: false, // 由调用者发送
                ..Default::default()
            })
        }
    };

    // 3. 记录耗时
    if let Ok(mut r) = result {
        r.duration_ms = start.elapsed().as_millis() as u64;
        Ok(r)
    } else {
        result
    }
}
```

### 5.2 URL 消息处理

```rust
async fn handle_url_message(
    state: &DesktopState,
    url: &str,
) -> Result<KefuIngestResult> {
    let paths = state.wiki_paths();

    // 1. 抓取内容 (优先微信文章抓取器, 回退到通用 URL 抓取)
    let ingest_result = if url.contains("mp.weixin.qq.com") {
        wiki_ingest::wechat_fetch::fetch_wechat_article(url).await
    } else {
        wiki_ingest::url::fetch_and_body(url).await
    }?;

    // 2. 构建 raw entry metadata
    let meta = wiki_store::RawEntryMeta::for_paste(
        if url.contains("mp.weixin.qq.com") { "wechat-article" } else { "url" },
        Some(url.to_string()),
    );

    // 3. 写入 raw/
    let raw_entry = wiki_store::write_raw_entry(
        &paths,
        &meta,
        &ingest_result.body,
    )?;

    // 4. 触发自动 absorb (异步, 不等待完成)
    let absorb_task_id = trigger_auto_absorb(state, raw_entry.id).await.ok();

    // 5. 构建回复
    let reply = format!(
        "已入库: {}\n正在维护相关页面...",
        ingest_result.title.unwrap_or_else(|| url.to_string()),
    );

    Ok(KefuIngestResult {
        raw_entry_id: Some(raw_entry.id),
        absorb_triggered: absorb_task_id.is_some(),
        absorb_task_id,
        reply_sent: false,
        reply_text: Some(reply),
        duration_ms: 0,
        error: None,
    })
}
```

### 5.3 文本消息处理

```rust
async fn handle_text_message(
    state: &DesktopState,
    text: &str,
) -> Result<KefuIngestResult> {
    let paths = state.wiki_paths();

    // 短文本 (< 20 字) 可能是无意义消息, 跳过
    if text.chars().count() < 20 {
        return Ok(KefuIngestResult {
            reply_text: Some("消息太短, 未入库。请发送至少 20 字的内容或链接。".into()),
            ..Default::default()
        });
    }

    let meta = wiki_store::RawEntryMeta::for_paste("wechat-text", None);
    let raw_entry = wiki_store::write_raw_entry(&paths, &meta, text)?;

    let absorb_task_id = trigger_auto_absorb(state, raw_entry.id).await.ok();

    let reply = format!(
        "已入库 ({} 字)\n正在维护相关页面...",
        text.chars().count(),
    );

    Ok(KefuIngestResult {
        raw_entry_id: Some(raw_entry.id),
        absorb_triggered: absorb_task_id.is_some(),
        absorb_task_id,
        reply_text: Some(reply),
        ..Default::default()
    })
}
```

### 5.4 ?问题查询处理

```rust
async fn handle_query_message(
    state: &DesktopState,
    question: &str,
) -> Result<KefuIngestResult> {
    // 调用 SKILL Engine 的 query_wiki (通过内部函数, 非 HTTP)
    let query_result = wiki_maintainer::query_wiki(
        question,
        &state.wiki_paths(),
        state.broker_sender(),
        5, // max_sources
    ).await;

    match query_result {
        Ok(result) => {
            let sources_line = if !result.source_slugs.is_empty() {
                format!("[引用 {} 个知识页面]\n\n", result.source_slugs.len())
            } else {
                String::new()
            };

            let sources_footer = if !result.source_slugs.is_empty() {
                format!("\n\n来源: {}", result.source_slugs.join(", "))
            } else {
                String::new()
            };

            // Crystallization 结晶通知:
            // query_wiki 内部已将实质性回答 (>200 字符) 写入 raw/,
            // 此处追加通知告知用户回答已结晶。
            let crystal_notice = if result.answer_text.chars().count() > 200 {
                "\n\n💎 回答已结晶入知识库"
            } else {
                ""
            };

            let reply = format!(
                "{}{}{}{}",
                sources_line,
                result.answer_text,
                sources_footer,
                crystal_notice,
            );

            Ok(KefuIngestResult {
                raw_entry_id: None, // 问题本身不写入 raw/, 但回答已由 query_wiki 结晶
                absorb_triggered: false,
                reply_text: Some(reply),
                ..Default::default()
            })
        }
        Err(e) => {
            let reply = match e.kind() {
                ErrorKind::WikiEmpty => "知识库暂无内容, 请先发送一些素材".into(),
                ErrorKind::NoMatch => "未找到相关知识, 试试更换关键词".into(),
                _ => format!("查询失败: {}", e),
            };
            Ok(KefuIngestResult {
                reply_text: Some(reply),
                error: Some(e.to_string()),
                ..Default::default()
            })
        }
    }
}
```

### 5.5 消息分类器

```rust
/// 将微信消息分类为处理类型
fn classify_message(msg: &WeChatSyncMessage) -> WeChatMessageKind {
    match msg.msg_type.as_str() {
        "text" => {
            let text = msg.content.trim();
            // ?前缀 = 知识查询
            if text.starts_with('?') || text.starts_with('\u{ff1f}') {
                let question = text.trim_start_matches(|c| c == '?' || c == '\u{ff1f}').trim();
                WeChatMessageKind::Query(question.to_string())
            }
            // URL 检测
            else if text.starts_with("http://") || text.starts_with("https://") {
                WeChatMessageKind::Url(text.to_string())
            }
            // 普通文本
            else {
                WeChatMessageKind::Text(text.to_string())
            }
        }
        "link" => {
            // 微信 link 消息 (转发的文章)
            WeChatMessageKind::Url(msg.url.clone().unwrap_or_default())
        }
        "image" => {
            WeChatMessageKind::Image {
                media_id: msg.media_id.clone().unwrap_or_default(),
            }
        }
        "file" => {
            WeChatMessageKind::File {
                media_id: msg.media_id.clone().unwrap_or_default(),
                filename: msg.filename.clone().unwrap_or_else(|| "unknown".into()),
            }
        }
        other => WeChatMessageKind::Unsupported(other.to_string()),
    }
}
```

### 5.6 自动 Absorb 触发器

```rust
/// 通过内部 HTTP 调用触发 absorb。
/// 使用 reqwest 调用 localhost, 复用已有的 /api/wiki/absorb 端点。
async fn trigger_auto_absorb(
    state: &DesktopState,
    entry_id: u32,
) -> Result<String> {
    let port = state.server_port();
    let client = reqwest::Client::new();

    let resp = client
        .post(format!("http://127.0.0.1:{}/api/wiki/absorb", port))
        .json(&serde_json::json!({
            "entry_ids": [entry_id]
        }))
        .send()
        .await?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp.json().await?;
        Ok(body["task_id"].as_str().unwrap_or("unknown").to_string())
    } else {
        Err(anyhow::anyhow!("absorb trigger failed: {}", resp.status()))
    }
}
```

### 5.7 冲突解决通知 (Supersession)

当用户通过 Inbox 界面批准 "采纳新观点" 后, 系统需要通过微信回推通知用户判断已更新。

```rust
/// 当 Inbox conflict resolution 完成后调用。
/// 发送判断变迁通知到微信用户。
async fn notify_supersession(
    state: &DesktopState,
    old_claim: &str,
    new_claim: &str,
) -> Result<()> {
    let reply = format!("✅ 判断已更新：{} → {}", old_claim, new_claim);

    // 获取 kefu 客户端, 向最近活跃的用户推送
    if let Some(kefu_client) = state.kefu_client() {
        let config = wechat_kefu::account::load_config(&state.config_path())?;
        kefu_client.send_text(
            &config.open_kfid,
            &state.last_active_wechat_user(),
            &reply,
        ).await?;
    }
    Ok(())
}
```

**触发时机**: 此函数由 Inbox 的 conflict resolution handler 调用, 而非 absorb 主循环。当用户在前端点击 "采纳新观点" 按钮 → 后端执行 supersession 记录写入 (见 `01-skill-engine.md §5.1 步骤 3i-extra`) → 调用此函数推送微信通知。

---

## 6. 前端实现

### 6.1 WeChat Hub (Settings Modal 内嵌面板)

v2.0 将现有的 `WeChatBridgePage.tsx` (独立页面) 整合为 Settings Modal 内的 WeChat Hub 面板, 不再是顶级 Tab 页。

```
Settings Modal
└── WeChat Hub 面板
    ├── ConnectionStatus (连接状态卡片)
    │   ├── 状态指示灯 (绿色/黄色/红色)
    │   ├── 已连接: corpid + open_kfid + monitor 运行中
    │   └── 未连接: "点击设置" 引导
    │
    ├── QRSection (QR 扫码区, 仅未连接时)
    │   ├── QR Code 图片
    │   ├── 倒计时 (5 分钟)
    │   └── 重新获取按钮
    │
    ├── MessageLog (消息日志, 最近 50 条)
    │   ├── LogEntry: timestamp + type + 摘要 + 状态
    │   └── 展开: raw_entry_id, absorb_task_id, reply_text
    │
    └── AutoAbsorbToggle (自动吸收开关)
        ├── Switch: 开启/关闭自动 absorb 触发
        └── 说明: "关闭后仅入库, 不自动生成 wiki 页面"
```

### 6.2 组件规格

#### ConnectionStatus

```typescript
interface ConnectionStatusProps {
  status: KefuStatus;
  onStartMonitor: () => void;
  onStopMonitor: () => void;
}
```

- 状态灯: `CheckCircle2` (绿, 正常) / `AlertTriangle` (黄, 部分连接) / `XCircle` (红, 未连接)
- 信息行: corpid, open_kfid, account_name, monitor 运行状态
- 操作按钮: "启动监控" / "停止监控"

#### MessageLog

```typescript
interface MessageLogProps {
  /** 来自后端的最近消息日志 */
  entries: KefuMessageLogEntry[];
}

interface KefuMessageLogEntry {
  timestamp: string;
  message_type: "url" | "text" | "file" | "image" | "query" | "unsupported";
  summary: string;
  status: "success" | "failed" | "pending";
  raw_entry_id?: number;
  absorb_task_id?: string;
  reply_text?: string;
  error?: string;
}
```

- 列表: 时间倒序, 最多 50 条
- 每行: 时间 + 类型图标 + 摘要 (截断 60 字) + 状态 badge
- 展开: 点击展开详情 (raw_entry_id 可链接到 Raw Library)

#### AutoAbsorbToggle

```typescript
interface AutoAbsorbToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}
```

- 默认开启
- 关闭时: 消息仍然摄入到 raw/, 但不自动触发 absorb
- 状态持久化到 `KefuConfig` 中新增的 `auto_absorb_enabled` 字段

### 6.3 从 WeChatBridgePage 迁移

现有 `features/wechat/WeChatBridgePage.tsx` 的核心逻辑 (QR 扫码、账号管理、Pipeline 状态) 全部保留, 迁移到 Settings Modal 面板中:

| 现有功能 | 来源 API | 保留/迁移 |
|----------|----------|-----------|
| QR 扫码登录 | `startWeChatLogin` / `getWeChatLoginStatus` | 迁移到 QRSection |
| 账号列表管理 | `listWeChatAccounts` / `deleteWeChatAccount` | 迁移到 ConnectionStatus |
| Kefu 配置保存 | `saveKefuConfig` / `loadKefuConfig` | 迁移到 Settings 表单 |
| Pipeline 一键部署 | `startKefuPipeline` / `getKefuPipelineStatus` | 迁移到 "一键设置" 按钮 |
| Monitor 启停 | `startKefuMonitor` / `stopKefuMonitor` | 迁移到 ConnectionStatus |

---

## 7. 交互流程

### 7.1 用户在微信发送 URL

```
微信用户转发一篇公众号文章
  → WeChat 平台推送 callback 到 CF Worker
  → CF Worker 中继到 desktop-server callback endpoint
  → kefu_callback_event_handler 解密 + 解析
  → CallbackEvent::MsgReceive { token }
  → KefuClient::sync_msg(token) 获取完整消息
  → handle_wechat_message(state, msg)
  → classify_message → WeChatMessageKind::Url("https://mp.weixin.qq.com/...")
  → handle_url_message:
      1. wechat_fetch::fetch_wechat_article(url) — Playwright 抓取
      2. wiki_store::write_raw_entry(paths, meta, body) — 写入 raw/42.md
      3. trigger_auto_absorb(state, 42) — POST /api/wiki/absorb
      4. 构建回复: "已入库: {title}\n正在维护相关页面..."
  → KefuClient::send_text(reply) — 回复到微信
```

### 7.2 用户在微信发送 ?问题

```
微信用户发送: "?Transformer 和 RNN 的区别"
  → callback → sync_msg → handle_wechat_message
  → classify_message → WeChatMessageKind::Query("Transformer 和 RNN 的区别")
  → handle_query_message:
      1. wiki_maintainer::query_wiki(question, paths, broker, 5)
      2. 检索相关 wiki 页面, LLM 生成 grounded 回答
      3. 格式化: "[引用 3 个知识页面]\n\n{answer}\n\n来源: slug1, slug2, slug3"
  → KefuClient::send_text(reply) — 回复到微信
```

### 7.3 用户在微信发送纯文本

```
微信用户发送: "今天学到了 attention 机制的核心是 Q K V 矩阵运算..."
  → callback → sync_msg → handle_wechat_message
  → classify_message → WeChatMessageKind::Text("今天学到了...")
  → handle_text_message:
      1. 检查长度 >= 20 字 → 通过
      2. wiki_store::write_raw_entry(source="wechat-text")
      3. trigger_auto_absorb
      4. 回复: "已入库 (45 字)\n正在维护相关页面..."
  → KefuClient::send_text(reply)
```

### 7.4 一键部署流水线

```
用户在 Settings Modal WeChat Hub 点击 "一键设置"
  → POST /api/desktop/wechat-kefu/pipeline/start
  → Pipeline 自动执行:
      Phase 1: CF 注册 (子域名分配)
      Phase 2: Worker 部署 (中继脚本)
      Phase 3: WeCom 授权 (获取 access_token)
      Phase 4: Callback 配置 (URL + token + AESKey)
      Phase 5: 客服账号创建 (open_kfid)
      Phase 6: 客服接入链接获取 (contact_url)
  → 前端轮询 GET /api/desktop/wechat-kefu/pipeline/status
  → 每个 Phase 完成后更新进度条
  → 全部完成: 自动启动 monitor
```

---

## 8. 测试计划

### 8.1 单元测试

| 测试用例 | 预期 | 覆盖组件 |
|----------|------|----------|
| `classify_message` URL 检测 | `"https://example.com"` → `Url(...)` | 分类器 |
| `classify_message` ?问题检测 | `"?什么是RAG"` → `Query("什么是RAG")` | 分类器 |
| `classify_message` 全角问号 | `"\uff1f什么是RAG"` → `Query("什么是RAG")` | 分类器 |
| `classify_message` 纯文本 | `"今天学到了..."` → `Text(...)` | 分类器 |
| `classify_message` link 类型 | `msg_type="link"` → `Url(msg.url)` | 分类器 |
| `classify_message` 未知类型 | `msg_type="voice"` → `Unsupported("voice")` | 分类器 |
| `handle_text_message` 短文本拒绝 | 19 字文本 → reply "消息太短" | 文本处理 |
| 回复格式: URL 摄入 | 包含标题 + "正在维护" 文案 | 回复构建 |
| 回复格式: ?问题 | 包含引用数量 + 答案 + 来源 slugs | 回复构建 |

### 8.2 集成测试

| 测试用例 | 预期 | 覆盖范围 |
|----------|------|----------|
| Mock callback → URL 消息 → raw entry 创建 | raw/ 目录多一个文件, entry 可通过 GET /api/wiki/raw 获取 | callback → ingest → store |
| Mock callback → ?问题 → 回复答案 | query_wiki 被调用, 回复文本包含来源引用 | callback → query → reply |
| Mock callback → 文本消息 → absorb 触发 | raw entry 创建成功, /api/wiki/absorb 被调用 | callback → store → absorb |
| Pipeline 完整流程 (mock 外部 API) | 6 个 Phase 全部完成, config 持久化, monitor 启动 | pipeline → config → monitor |
| Callback 签名验证失败 | 返回 403, 不处理消息 | callback crypto |
| Monitor 启停 | start → status running → stop → status idle | monitor lifecycle |

### 8.3 端到端测试 (手动)

| 测试用例 | 步骤 | 预期 |
|----------|------|------|
| 微信转发文章 | 在微信中转发一篇公众号文章到客服 | 收到 "已入库: {title}" 回复, Raw Library 中出现新条目 |
| 微信发送问题 | 在微信中发送 "?xxx" | 收到知识库答案回复 |
| 微信发送短文本 | 在微信中发送 "ok" | 收到 "消息太短" 提示 |

---

## 9. 边界条件与风险

### 9.1 边界条件

| 场景 | 处理策略 |
|------|----------|
| 微信速率限制 (API 频率) | `KefuClient` 内置 rate limiter, 每秒最多 20 条回复, 超出排队 |
| 大文件 (> 10MB) | wiki_ingest 适配器有大小限制, 超出返回错误, 回复 "文件太大" |
| Playwright fetch 超时 (微信文章) | `wechat_fetch` 默认 30s 超时, 超出回退到 `url::fetch_and_body` (reqwest) |
| 并发消息 (多人同时发送) | 消息处理使用 tokio::spawn 并发, write_raw_entry 有文件锁保证原子性 |
| Callback 签名验证失败 | 返回 403 Forbidden, 记录日志但不处理消息, 不回复 |
| Worker 中继断开 | relay_client 自动重连, 指数退避 (1s/2s/4s/8s), 前端显示黄色警告 |
| absorb 触发失败 (SKILL Engine 繁忙) | raw entry 已安全写入, absorb 可通过 Inbox 手动触发, 回复中标注 "入库成功, 自动维护延迟" |
| query_wiki 在空知识库上调用 | 返回 "知识库暂无内容" 友好提示, 不报 500 |
| 微信消息体为空 | classify_message 返回 Unsupported, 回复 "收到空消息, 请重新发送" |
| 全角问号 (\uff1f) | classify_message 同时检测半角 `?` 和全角 `\uff1f`, 统一路由到 Query |

### 9.2 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Playwright 进程泄漏 | 高 | `wechat_fetch` 使用 RAII guard, drop 时强制 kill 浏览器进程 |
| CF Worker 配额用尽 (免费计划 100K 请求/天) | 中 | 监控请求计数, 接近限额时前端提示升级 |
| 微信 access_token 过期 (7200s) | 中 | `KefuClient` 内置 token 刷新逻辑, 过期前 300s 自动刷新 |
| 自动 absorb 风暴 (短时间大量消息) | 中 | absorb 有 `ABSORB_IN_PROGRESS` 互斥锁, 排队而非并发 |
| 消息去重 (微信可能重复推送) | 低 | 以 `msg_id` 去重, 30 分钟内相同 msg_id 跳过 |
| AES 解密密钥不匹配 | 低 | callback handler 返回 400 + 详细日志, 前端显示配置检查提示 |

---

## 10. 复用清单

### 10.1 直接复用 (Rust crate)

| 资源 | Crate/路径 | 用法 |
|------|------------|------|
| Callback 处理 | `wechat_kefu/callback.rs` | `KefuCallback::new()` + `parse_event()`, 签名验证 + 解密 |
| API 客户端 | `wechat_kefu/client.rs` | `KefuClient::sync_msg()` + `send_text()`, 消息同步和回复 |
| 配置管理 | `wechat_kefu/account.rs` | `load_config()` / `save_config()` |
| Monitor | `wechat_kefu/monitor.rs` | 长轮询消息监控 |
| Pipeline | `wechat_kefu/pipeline.rs` | 一键部署流水线 |
| Relay Client | `wechat_kefu/relay_client.rs` | CF Worker WebSocket 中继 |
| URL 抓取 | `wiki_ingest/url.rs` | `fetch_and_body(url) -> IngestResult` |
| 微信文章抓取 | `wiki_ingest/wechat_fetch.rs` | `fetch_wechat_article(url) -> IngestResult` |
| PDF 提取 | `wiki_ingest/pdf.rs` | `extract_pdf(path) -> IngestResult` |
| DOCX 提取 | `wiki_ingest/docx.rs` | `extract_docx(path) -> IngestResult` |
| 图片准备 | `wiki_ingest/image.rs` | `prepare_image(path) -> IngestResult` |
| Raw 写入 | `wiki_store/lib.rs` | `write_raw_entry(paths, meta, body) -> RawEntry` |
| 知识问答 | `wiki_maintainer/lib.rs` | `query_wiki()` (通过 SKILL Engine, 待 01 模块实现) |

### 10.2 直接复用 (前端)

| 资源 | 路径 | 用法 |
|------|------|------|
| WeChatBridgePage | `features/wechat/WeChatBridgePage.tsx` | 核心 UI 逻辑迁移到 Settings Modal |
| Kefu API 函数 | `features/settings/api/client.ts` | `loadKefuConfig`, `saveKefuConfig`, `createKefuAccount`, `getKefuContactUrl`, `getKefuStatus`, `startKefuMonitor`, `stopKefuMonitor`, `startKefuPipeline`, `getKefuPipelineStatus`, `cancelKefuPipeline` |
| 图标 | `lucide-react` | Wifi, WifiOff, QrCode, AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw |

### 10.3 新建文件清单

| 文件 | 说明 |
|------|------|
| `wechat_kefu/ingest_handler.rs` | 消息 → 摄入 → absorb 主逻辑 (从 desktop_handler.rs 拆分) |
| `wechat_kefu/message_classifier.rs` | 消息分类器 |
| `wechat_kefu/query_handler.rs` | ?问题 → query_wiki → 格式化回复 |
| `wechat_kefu/reply_formatter.rs` | 回复消息格式化工具 |
| `features/settings/WeChatHub.tsx` | Settings Modal 内嵌 WeChat Hub 面板 |
| `features/settings/WeChatMessageLog.tsx` | 消息日志组件 |
| `features/settings/WeChatAutoAbsorbToggle.tsx` | 自动吸收开关组件 |
