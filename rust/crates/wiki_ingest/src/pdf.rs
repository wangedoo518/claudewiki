//! PDF adapter — extract text from PDF documents.
//!
//! Canonical §7.2 row 8: `.pdf` files → text extraction → markdown.
//!
//! ## Strategy
//!
//! MVP uses `pdfjs-dist` on the frontend (canonical §7.3 row 8) or
//! a Rust crate like `pdf-extract` / `lopdf` on the backend. The
//! backend path is preferred because it avoids shipping a 3 MB wasm
//! bundle to the frontend.
//!
//! ## External dependencies
//!
//! None for the Rust path — `pdf-extract` crate handles PDFs
//! natively. Can be enabled by adding `pdf-extract = "0.7"` to
//! wiki_ingest/Cargo.toml when ready.

use crate::{IngestError, IngestResult, Result};

/// Extract text content from a PDF file at `path`. Returns an
/// `IngestResult` with the extracted text as markdown body.
pub async fn extract_pdf(_path: &std::path::Path) -> Result<IngestResult> {
    Err(IngestError::Invalid(
        "PDF adapter not yet implemented — add `pdf-extract` crate to \
         wiki_ingest/Cargo.toml to enable native PDF text extraction. \
         No external binaries required."
            .to_string(),
    ))
}
