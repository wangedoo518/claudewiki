//! Image adapter — Vision caption + OCR for image files.
//!
//! Canonical §7.2 row 6: `.jpg` / `.png` / `.webp` images from
//! WeChat → Codex GPT-5.4 Vision caption + OCR → markdown body.
//!
//! ## Pipeline
//!
//!   1. Read image bytes from disk
//!   2. Encode as base64 (or pass URL if hosted)
//!   3. Send to codex_broker with a Vision-capable model
//!   4. LLM returns a structured caption + any OCR'd text
//!   5. Format as `IngestResult` with `source = "image"`
//!
//! ## External dependencies
//!
//! - Active Codex account with Vision capability in the broker pool

use crate::{IngestError, IngestResult, Result};

/// Caption an image file at `path` using a Vision-capable LLM via
/// the codex_broker pool. Returns `NotAvailable` when the broker
/// pool is empty or no Vision model is available.
pub async fn caption_image(_path: &std::path::Path) -> Result<IngestResult> {
    Err(IngestError::Invalid(
        "image adapter not yet implemented — requires a Vision-capable model \
         in the Codex pool (e.g. GPT-5.4 Vision). Add a Codex account with \
         Vision access in Settings > Subscription & Codex Pool."
            .to_string(),
    ))
}
