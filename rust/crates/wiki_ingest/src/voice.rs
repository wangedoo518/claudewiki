//! Voice adapter — transcribe audio files to markdown.
//!
//! Delegates to the MarkItDown Python sidecar which uses SpeechRecognition
//! for audio transcription. Falls back to a clear error message when
//! transcription fails (e.g., no internet for Google Speech API).

use crate::{IngestResult, Result};
use std::path::Path;

/// Transcribe an audio file at `path` and return the transcript as
/// an `IngestResult`. Delegates to MarkItDown which uses SpeechRecognition.
pub async fn transcribe_voice(path: &Path) -> Result<IngestResult> {
    crate::markitdown::extract_via_markitdown(path)
        .await
        .map(|mut r| {
            r.source = "voice".to_string();
            r
        })
}
