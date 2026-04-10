//! PPTX adapter — extract slide text from PowerPoint files.
//!
//! Canonical §7.2 row 7: `.pptx` files → per-slide section markdown.
//!
//! ## Strategy
//!
//! PPTX is a ZIP of XML files. Two approaches:
//!
//! 1. **Pure Rust**: use `zip` crate to open the archive, parse
//!    `ppt/slides/slide{N}.xml` with `quick-xml`, extract text runs
//!    from `<a:t>` elements. No external deps. ~200 lines.
//!
//! 2. **Python spawn**: `python-pptx` gives richer extraction
//!    (shapes, tables, notes). Requires Python runtime.
//!
//! MVP will likely start with (1) for zero-dep simplicity.
//!
//! ## External dependencies
//!
//! None for pure Rust path. Python path needs `python3 + python-pptx`.

use crate::{IngestError, IngestResult, Result};

/// Extract text from each slide of a PPTX file at `path`.
pub async fn extract_pptx(_path: &std::path::Path) -> Result<IngestResult> {
    Err(IngestError::Invalid(
        "PPTX adapter not yet implemented — two paths planned: \
         (1) pure Rust via zip + quick-xml (zero deps), or \
         (2) python-pptx spawn (richer extraction, needs Python). \
         Add `zip` + `quick-xml` to Cargo.toml for path (1)."
            .to_string(),
    ))
}
