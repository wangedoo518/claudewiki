//! Video adapter — extract audio transcript + keyframe captions.
//!
//! Canonical §7.2 row 10: `.mp4` / `.mov` video files →
//! ffmpeg audio extraction + whisper transcript + 10s keyframe
//! sampling + Vision caption → markdown body.
//!
//! This is the most complex adapter in the pipeline. The output
//! combines:
//!   - Full audio transcript (same as voice adapter)
//!   - Keyframe images every 10 seconds → Vision caption per frame
//!   - Merged timeline: `[MM:SS] <transcript chunk> + <frame caption>`
//!
//! ## External dependencies
//!
//! - `ffmpeg` — audio extraction + keyframe sampling
//! - `whisper` — transcript (same as voice adapter)
//! - Vision-capable model in Codex pool — keyframe captions

use crate::{IngestError, IngestResult, Result};

/// Process a video file at `path`: extract audio transcript +
/// sample keyframes + caption them. Returns a combined timeline
/// as markdown.
pub async fn extract_video(_path: &std::path::Path) -> Result<IngestResult> {
    Err(IngestError::Invalid(
        "video adapter not yet implemented — requires ffmpeg (audio extraction + \
         keyframe sampling), whisper (transcription), and a Vision-capable Codex \
         model (keyframe captioning). This is the most complex adapter; ETA is \
         after voice + image adapters are stable."
            .to_string(),
    ))
}
