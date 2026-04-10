//! DOCX adapter — extract text from Word documents.
//!
//! Canonical §7.2 row 9: `.docx` files → markdown body.
//!
//! ## Strategy
//!
//! DOCX is also a ZIP of XML (like PPTX). The main content lives in
//! `word/document.xml`. Two approaches:
//!
//! 1. **Pure Rust**: `zip` + `quick-xml`, parse `<w:t>` text runs
//!    and `<w:pPr>` paragraph styles → approximate markdown. ~150 lines.
//!
//! 2. **Python spawn**: `mammoth` gives clean HTML → pipe through our
//!    existing `html_to_md` module. Needs Python.
//!
//! MVP will likely start with (1).
//!
//! ## External dependencies
//!
//! None for pure Rust path. Python path needs `python3 + mammoth`.

use crate::{IngestError, IngestResult, Result};

/// Extract text from a DOCX file at `path`.
pub async fn extract_docx(_path: &std::path::Path) -> Result<IngestResult> {
    Err(IngestError::Invalid(
        "DOCX adapter not yet implemented — pure Rust path via zip + quick-xml \
         is planned (zero deps). Alternatively, mammoth (Python) can produce \
         clean HTML that feeds into our html_to_md module."
            .to_string(),
    ))
}
