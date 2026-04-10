//! Voice adapter — transcribe audio files to markdown.
//!
//! Canonical §7.2 row 5: `.silk` / `.amr` / `.mp3` voice clips from
//! WeChat → Whisper transcription → markdown body. The pipeline is:
//!
//!   1. Convert to WAV via ffmpeg (WeChat uses Silk/AMR codecs)
//!   2. Transcribe via whisper.cpp local OR Whisper API
//!   3. Return `IngestResult` with `source = "voice"`
//!
//! ## External dependencies
//!
//! - `ffmpeg` — on PATH for codec conversion
//! - `whisper` — either whisper.cpp binary or Whisper API endpoint
//!
//! Both are checked at call time; missing tools return a clear
//! `IngestError::NotAvailable` with install instructions.

use crate::{IngestError, IngestResult, Result};

/// Transcribe an audio file at `path` and return the transcript as
/// an `IngestResult`. Returns `NotAvailable` when ffmpeg or whisper
/// are not on PATH.
pub async fn transcribe_voice(_path: &std::path::Path) -> Result<IngestResult> {
    // S6+ stub: check for ffmpeg and whisper availability.
    // Real implementation will:
    //   1. ffmpeg -i input -ar 16000 -ac 1 -f wav pipe:1
    //   2. whisper --model base --language auto < pipe
    //   3. Collect transcript text → IngestResult
    Err(IngestError::Invalid(
        "voice adapter not yet implemented — requires ffmpeg + whisper on PATH. \
         Install ffmpeg (https://ffmpeg.org) and whisper.cpp \
         (https://github.com/ggerganov/whisper.cpp) to enable voice transcription."
            .to_string(),
    ))
}
