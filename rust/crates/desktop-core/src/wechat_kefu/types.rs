//! Types for the official WeChat Customer Service API integration.

use serde::{Deserialize, Serialize};

/// Persistent configuration for the WeChat Customer Service channel.
/// Stored at `~/.warwolf/wechat-kefu/config.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KefuConfig {
    /// Enterprise ID from WeCom admin (starts with "ww").
    pub corpid: String,
    /// Secret for the "WeChat Customer Service" application.
    pub secret: String,
    /// Token for callback signature verification.
    pub token: String,
    /// EncodingAESKey for callback message decryption (43 chars).
    pub encoding_aes_key: String,
    /// Customer service account ID, obtained after `account/add`.
    #[serde(default)]
    pub open_kfid: Option<String>,
    /// Customer service contact URL, obtained from `add_contact_way`.
    #[serde(default)]
    pub contact_url: Option<String>,
    /// Display name of the customer service account.
    #[serde(default)]
    pub account_name: Option<String>,
    /// ISO 8601 timestamp of last save.
    #[serde(default)]
    pub saved_at: Option<String>,

    // --- Relay deployment (Phase 1-2 of pipeline) ---
    /// Cloudflare API token.
    #[serde(default)]
    pub cf_api_token: Option<String>,
    /// Worker base URL (e.g., "https://claudewiki-kefu-relay.xxx.workers.dev").
    #[serde(default)]
    pub worker_url: Option<String>,
    /// WebSocket URL for relay client.
    #[serde(default)]
    pub relay_ws_url: Option<String>,
    /// Auth token for WebSocket connection.
    #[serde(default)]
    pub relay_auth_token: Option<String>,
    /// Callback URL configured on kf.weixin.qq.com.
    #[serde(default)]
    pub callback_url: Option<String>,
    /// Callback token (auto-generated for signature verification).
    #[serde(default)]
    pub callback_token_generated: Option<String>,
}

/// Desensitized view of KefuConfig for frontend display.
#[derive(Debug, Clone, Serialize)]
pub struct KefuConfigSummary {
    pub corpid: String,
    pub secret_preview: String,
    pub token_preview: String,
    pub open_kfid: Option<String>,
    pub contact_url: Option<String>,
    pub account_name: Option<String>,
    pub saved_at: Option<String>,
    pub has_aes_key: bool,
}

impl KefuConfig {
    /// Create a desensitized summary for frontend display.
    pub fn to_summary(&self) -> KefuConfigSummary {
        KefuConfigSummary {
            corpid: self.corpid.clone(),
            secret_preview: mask_secret(&self.secret),
            token_preview: mask_secret(&self.token),
            open_kfid: self.open_kfid.clone(),
            contact_url: self.contact_url.clone(),
            account_name: self.account_name.clone(),
            saved_at: self.saved_at.clone(),
            has_aes_key: !self.encoding_aes_key.is_empty(),
        }
    }
}

/// Show first 4 + "..." + last 4 characters, or "(empty)".
fn mask_secret(s: &str) -> String {
    if s.len() <= 8 {
        return "(too short)".to_string();
    }
    format!("{}...{} ({} chars)", &s[..4], &s[s.len() - 4..], s.len())
}

/// Frontend status summary for the kefu channel.
#[derive(Debug, Clone, Serialize)]
pub struct KefuStatus {
    pub configured: bool,
    pub account_created: bool,
    pub monitor_running: bool,
    pub last_poll_unix_ms: Option<i64>,
    pub last_inbound_unix_ms: Option<i64>,
    pub consecutive_failures: u32,
    pub last_error: Option<String>,
    pub capabilities: KefuCapabilities,
}

pub const KEFU_COMMAND_RECENT: &str = "/recent";
pub const KEFU_COMMAND_STATS: &str = "/stats";
pub const KEFU_TEXT_MIN_CHARS: usize = 20;

/// Explicit capability surface for the currently implemented Kefu handler.
#[derive(Debug, Clone, Serialize)]
pub struct KefuCapabilities {
    pub text: bool,
    pub url: bool,
    pub query: bool,
    pub commands: Vec<String>,
    pub file: bool,
    pub image: bool,
    pub card: bool,
    pub share: bool,
}

impl KefuCapabilities {
    /// Current Kefu handler capabilities. Keep this in lockstep with
    /// `desktop_handler::classify_message` and `handle_command`.
    pub fn current() -> Self {
        Self {
            text: true,
            url: true,
            query: true,
            commands: vec![
                KEFU_COMMAND_RECENT.to_string(),
                KEFU_COMMAND_STATS.to_string(),
            ],
            file: false,
            image: false,
            card: false,
            share: false,
        }
    }
}

impl Default for KefuCapabilities {
    fn default() -> Self {
        Self::current()
    }
}

#[cfg(test)]
mod tests {
    use super::{KefuCapabilities, KEFU_COMMAND_RECENT, KEFU_COMMAND_STATS, KEFU_TEXT_MIN_CHARS};

    #[test]
    fn current_capabilities_match_kefu_handler_surface() {
        let caps = KefuCapabilities::current();
        assert!(caps.text);
        assert!(caps.url);
        assert!(caps.query);
        assert_eq!(caps.commands, vec![KEFU_COMMAND_RECENT, KEFU_COMMAND_STATS]);
        assert!(!caps.file);
        assert!(!caps.image);
        assert!(!caps.card);
        assert!(!caps.share);
    }

    #[test]
    fn text_min_chars_matches_short_text_reply() {
        assert_eq!(KEFU_TEXT_MIN_CHARS, 20);
    }
}
