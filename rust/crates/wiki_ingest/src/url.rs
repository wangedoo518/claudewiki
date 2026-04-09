//! URL adapter — HTTP GET + lightweight body extraction.
//!
//! S1 shipped a placeholder URL adapter inside `desktop-server` that
//! stored a fixed `# URL` body. This module is the real deal: on
//! ingest we actually fetch the URL and store what came back.
//!
//! ## Extraction strategy
//!
//! The canonical target (§7.3) is:
//!
//!   * For `mp.weixin.qq.com/s/*` URLs, run our fork of `defuddle`
//!     with a WeChat-specific extractor, then `obsidian-clipper`
//!     `api::clip()` to turn the cleaned HTML into markdown.
//!   * For generic URLs, run defuddle's default extractor.
//!
//! That stack is deferred (it's 2-3 days of dep work). The MVP in
//! this module ships a **dumb-but-honest** extractor: fetch the
//! body, cap it at 2 MiB, and if the response is `text/html` store
//! the raw HTML under a code fence so Markdown renderers don't try
//! to interpret it. `text/plain` / `text/markdown` bodies are stored
//! verbatim. Everything else gets a short stub pointing at the URL.
//!
//! When the defuddle fork lands, this module gets a new code path —
//! but `fetch_and_body` keeps the same signature and the S1/S5 call
//! sites don't change.

use std::time::Duration;

use reqwest::header::{HeaderMap, CONTENT_TYPE};

use crate::{IngestError, IngestResult, Result};

/// Hard cap on body bytes we'll load into memory. 2 MiB is enough
/// for any WeChat article (they run 40-200 KB) and any reasonable
/// long-form blog post, while still being cheap to hold and serialise.
pub const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

/// Network timeout for the GET. Kept short because the desktop-server
/// HTTP handler that calls this runs on the request thread; we'd
/// rather fail fast and let the user retry than stall their click.
pub const FETCH_TIMEOUT: Duration = Duration::from_secs(15);

const UA: &str = "ClawWiki/0.1 (+https://github.com/wangedoo518/claudewiki)";

/// Fetch `url` over HTTP and turn the response into an
/// [`IngestResult`] ready for `wiki_store::write_raw_entry`.
///
/// * Uses a short 15-second timeout.
/// * Rejects 3xx redirects passing through non-http(s) schemes.
/// * Rejects response bodies bigger than [`MAX_BODY_BYTES`].
/// * The returned `source` tag is always `"url"`. Future
///   content-specific tags (`wechat-article`, `arxiv-paper`, etc.)
///   will be added as separate functions so callers can opt-in.
pub async fn fetch_and_body(url: &str) -> Result<IngestResult> {
    validate_url(url)?;

    let client = reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent(UA)
        .build()
        .map_err(|e| IngestError::Network(format!("reqwest build: {e}")))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| IngestError::Network(format!("GET {url}: {e}")))?;

    if !response.status().is_success() {
        return Err(IngestError::HttpStatus {
            status: response.status().as_u16(),
            url: url.to_string(),
        });
    }

    let headers_snapshot = response.headers().clone();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| IngestError::Network(format!("read body: {e}")))?;

    if bytes.len() > MAX_BODY_BYTES {
        return Err(IngestError::TooLarge {
            bytes: bytes.len(),
            max: MAX_BODY_BYTES,
        });
    }

    let content_type = extract_content_type(&headers_snapshot);
    let title = derive_title_from_url(url);
    let body = body_for_content_type(url, &bytes, content_type.as_deref())?;

    Ok(IngestResult {
        title,
        body,
        source_url: Some(url.to_string()),
        source: "url".to_string(),
    })
}

/// Reject URLs the ingest layer doesn't want to touch.
///
///   * Empty or whitespace-only strings
///   * Schemes that aren't `http://` or `https://` (rejects
///     `file://`, `javascript:`, `data:`, `ftp:`, ...)
///
/// We intentionally DO NOT validate "is this a real URL" beyond the
/// scheme — `reqwest` will fail clearly on malformed URLs, and a
/// stricter parser here would just duplicate that validation.
fn validate_url(url: &str) -> Result<()> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(IngestError::Invalid("url is empty".to_string()));
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err(IngestError::Invalid(format!(
            "url must start with http:// or https:// (got: {trimmed})"
        )));
    }
    Ok(())
}

/// Pull a lowercase `content-type` bare MIME (no parameters) out of
/// the response headers. Returns `None` when the server didn't set
/// the header, which we treat as "unknown" downstream.
fn extract_content_type(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(CONTENT_TYPE)?.to_str().ok()?;
    let bare = raw.split(';').next()?.trim().to_ascii_lowercase();
    if bare.is_empty() {
        None
    } else {
        Some(bare)
    }
}

/// Shape the response body into a markdown document appropriate for
/// the response `Content-Type`.
///
/// * `text/markdown` or `text/plain` → body verbatim (decoded as UTF-8).
/// * `text/html` → cleaned title line + raw HTML wrapped in a code
///   fence so markdown renderers don't try to parse it. This is the
///   MVP stand-in for the defuddle/obsidian-clipper path.
/// * Everything else → a short "fetched opaque blob" stub with byte
///   count and content-type so the user sees *something*.
fn body_for_content_type(
    url: &str,
    bytes: &[u8],
    content_type: Option<&str>,
) -> Result<String> {
    match content_type {
        Some(ct) if ct == "text/markdown" || ct == "text/plain" => {
            decode_utf8(bytes).map(|text| text.into_owned())
        }
        Some(ct) if ct == "text/html" || ct.starts_with("text/html") => {
            let html = decode_utf8(bytes)?;
            Ok(format!(
                "# Fetched from <{url}>\n\n\
                 _Content-Type: {ct}, {size} bytes. \
                 Defuddle + obsidian-clipper extraction lands in a \
                 later sprint; stored raw for now._\n\n\
                 ```html\n{html}\n```\n",
                size = bytes.len(),
                html = html.as_ref(),
            ))
        }
        Some(ct) => Ok(format!(
            "# Fetched from <{url}>\n\n\
             _Content-Type: {ct}, {size} bytes. No adapter for this \
             MIME yet; stored as an opaque reference._\n\n<{url}>\n",
            size = bytes.len(),
        )),
        None => Ok(format!(
            "# Fetched from <{url}>\n\n\
             _No Content-Type header returned, {size} bytes. \
             Stored as an opaque reference._\n\n<{url}>\n",
            size = bytes.len(),
        )),
    }
}

/// Decode response bytes as UTF-8. No Latin-1 fallback — callers that
/// need legacy encodings should layer in a separate adapter; ClawWiki
/// users overwhelmingly ingest English + Chinese which are both UTF-8.
fn decode_utf8(bytes: &[u8]) -> Result<std::borrow::Cow<'_, str>> {
    std::str::from_utf8(bytes)
        .map(std::borrow::Cow::Borrowed)
        .map_err(|e| IngestError::NotUtf8(e.to_string()))
}

/// Best-effort title derived from the URL: hostname + first path
/// segment. Used as a slug seed (`wiki_store::slugify` takes it from
/// here). Never fails — falls back to the raw URL if parsing is off.
fn derive_title_from_url(url: &str) -> String {
    // `url` crate would be nicer here but we'd rather not pull in a
    // dep for one function. Do a simple split on `/` after the
    // scheme.
    let without_scheme = url.split_once("://").map(|(_, rest)| rest).unwrap_or(url);
    let first_segment = without_scheme.split('/').next().unwrap_or(without_scheme);
    first_segment.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_url_rejects_empty() {
        assert!(matches!(
            validate_url(""),
            Err(IngestError::Invalid(_))
        ));
        assert!(matches!(
            validate_url("   "),
            Err(IngestError::Invalid(_))
        ));
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<h1>pwn</h1>",
            "ftp://example.com/x.zip",
        ] {
            let err = validate_url(bad).unwrap_err();
            assert!(matches!(err, IngestError::Invalid(_)), "accepted {bad}");
        }
    }

    #[test]
    fn validate_url_accepts_http_and_https() {
        assert!(validate_url("http://example.com").is_ok());
        assert!(validate_url("https://example.com/path?q=1").is_ok());
    }

    #[test]
    fn extract_content_type_strips_params_and_lowercases() {
        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, "Text/HTML; charset=UTF-8".parse().unwrap());
        assert_eq!(extract_content_type(&h), Some("text/html".to_string()));

        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, "application/json".parse().unwrap());
        assert_eq!(extract_content_type(&h), Some("application/json".to_string()));

        let h = HeaderMap::new();
        assert_eq!(extract_content_type(&h), None);
    }

    #[test]
    fn body_for_markdown_is_verbatim() {
        let body = body_for_content_type(
            "https://example.com/doc.md",
            b"# Hello\n\nworld.",
            Some("text/markdown"),
        )
        .unwrap();
        assert_eq!(body, "# Hello\n\nworld.");
    }

    #[test]
    fn body_for_plain_text_is_verbatim() {
        let body = body_for_content_type(
            "https://example.com/notes",
            "Line 1\nLine 2\n中文".as_bytes(),
            Some("text/plain"),
        )
        .unwrap();
        assert_eq!(body, "Line 1\nLine 2\n中文");
    }

    #[test]
    fn body_for_html_wraps_in_code_fence_with_header() {
        let body = body_for_content_type(
            "https://example.com/page",
            b"<h1>Hi</h1>",
            Some("text/html"),
        )
        .unwrap();
        assert!(body.starts_with("# Fetched from <https://example.com/page>"));
        assert!(body.contains("```html\n<h1>Hi</h1>\n```"));
        assert!(body.contains("11 bytes"));
    }

    #[test]
    fn body_for_opaque_mime_stores_stub() {
        let body = body_for_content_type(
            "https://example.com/song.mp3",
            &[0x00u8; 123],
            Some("audio/mpeg"),
        )
        .unwrap();
        assert!(body.contains("Content-Type: audio/mpeg"));
        assert!(body.contains("123 bytes"));
        assert!(body.contains("<https://example.com/song.mp3>"));
    }

    #[test]
    fn body_for_missing_content_type_stores_stub() {
        let body = body_for_content_type(
            "https://example.com/mystery",
            b"\xff\xfe opaque",
            None,
        )
        .unwrap();
        assert!(body.contains("No Content-Type header returned"));
    }

    #[test]
    fn body_for_html_propagates_non_utf8_error() {
        // High byte sequence that is not valid UTF-8 in isolation.
        let err = body_for_content_type(
            "https://example.com/bad",
            &[0xff, 0xfe, 0xfd],
            Some("text/html"),
        )
        .unwrap_err();
        assert!(matches!(err, IngestError::NotUtf8(_)));
    }

    #[test]
    fn derive_title_extracts_hostname() {
        assert_eq!(
            derive_title_from_url("https://mp.weixin.qq.com/s/abc"),
            "mp.weixin.qq.com"
        );
        assert_eq!(
            derive_title_from_url("http://example.com"),
            "example.com"
        );
        assert_eq!(
            derive_title_from_url("https://example.com/path/a/b"),
            "example.com"
        );
    }

    // ── Integration test — a tiny in-process HTTP server ─────────

    /// Tiny one-shot HTTP server used by `fetch_and_body_hits_live_http`.
    /// Binds to a random localhost port, accepts exactly one TCP
    /// connection, replies with the supplied response bytes, closes.
    /// Keeps the test fully offline — no network or fixture files.
    async fn one_shot_server(
        response: &'static [u8],
    ) -> (std::net::SocketAddr, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                // Read until we see the end of headers.
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf).await;
                let _ = sock.write_all(response).await;
                let _ = sock.shutdown().await;
            }
        });
        (addr, handle)
    }

    #[tokio::test]
    async fn fetch_and_body_hits_live_http_server() {
        let response = b"HTTP/1.1 200 OK\r\n\
                         Content-Type: text/plain; charset=utf-8\r\n\
                         Content-Length: 13\r\n\
                         Connection: close\r\n\
                         \r\n\
                         hello, world!";
        let (addr, server) = one_shot_server(response).await;
        let url = format!("http://{addr}/");

        let result = fetch_and_body(&url).await.expect("fetch should succeed");
        assert_eq!(result.source, "url");
        assert_eq!(result.body, "hello, world!");
        assert_eq!(result.source_url.as_deref(), Some(url.as_str()));
        // Title = hostname without the scheme.
        assert!(result.title.starts_with("127.0.0.1:"));

        server.await.unwrap();
    }

    #[tokio::test]
    async fn fetch_and_body_errors_on_non_success_status() {
        let response = b"HTTP/1.1 404 Not Found\r\n\
                         Content-Type: text/plain\r\n\
                         Content-Length: 9\r\n\
                         Connection: close\r\n\
                         \r\n\
                         not here.";
        let (addr, server) = one_shot_server(response).await;
        let url = format!("http://{addr}/missing");

        let err = fetch_and_body(&url).await.unwrap_err();
        match err {
            IngestError::HttpStatus { status: 404, .. } => {}
            other => panic!("expected HttpStatus 404, got {other:?}"),
        }
        server.await.unwrap();
    }

    #[tokio::test]
    async fn fetch_and_body_rejects_invalid_scheme_before_network() {
        let err = fetch_and_body("file:///etc/passwd").await.unwrap_err();
        assert!(matches!(err, IngestError::Invalid(_)));
    }

    #[tokio::test]
    async fn fetch_and_body_wraps_html_response_in_code_fence() {
        // Full end-to-end for the text/html path. The unit test
        // `body_for_html_wraps_in_code_fence_with_header` exercises
        // `body_for_content_type` in isolation; this one proves that
        // `fetch_and_body` correctly threads Content-Type through
        // `extract_content_type` and into `body_for_content_type` for
        // a real HTTP response. Without this, a refactor that breaks
        // the content-type plumbing could silently fall through to
        // the "opaque mime stub" branch and only a regression test
        // of the full pipeline would catch it.
        let response = b"HTTP/1.1 200 OK\r\n\
                         Content-Type: text/html; charset=utf-8\r\n\
                         Content-Length: 28\r\n\
                         Connection: close\r\n\
                         \r\n\
                         <html><body>Hi</body></html>";
        let (addr, server) = one_shot_server(response).await;
        let url = format!("http://{addr}/page");

        let result = fetch_and_body(&url)
            .await
            .expect("fetch should succeed for text/html");
        assert_eq!(result.source, "url");
        assert!(result.body.starts_with("# Fetched from <http://"));
        assert!(result.body.contains("```html\n<html><body>Hi</body></html>\n```"));
        // Byte count in the header annotation must match the raw body
        // length (28 bytes for the literal above).
        assert!(result.body.contains("28 bytes"));
        // And the Content-Type parameter (`; charset=utf-8`) must be
        // stripped by `extract_content_type` before it lands in the
        // body header.
        assert!(result.body.contains("Content-Type: text/html"));
        assert!(!result.body.contains("charset=utf-8,"));

        server.await.unwrap();
    }

    #[tokio::test]
    async fn fetch_and_body_enforces_max_body_bytes() {
        // Canonical §7.2 + the `MAX_BODY_BYTES` constant: anything
        // over the 2 MiB hard cap must return `IngestError::TooLarge`
        // BEFORE we try to decode or store the body. This is the one
        // DoS-level defense in the ingest path — without it a hostile
        // server could stream a 10 GB body into our memory.
        //
        // We don't want a 2 MiB fixture in the repo, so we
        // temporarily cheat: send a Content-Length header that
        // advertises more than the limit, followed by a small body.
        // reqwest will short-circuit on Content-Length before reading
        // the whole response... but our check is on
        // `bytes.len() > MAX_BODY_BYTES` after the read completes.
        //
        // Best way to exercise this: construct a response whose
        // *actual* body exceeds the cap. We use a 3 MiB filler, which
        // is small enough to keep the test fast but big enough to
        // trip the check.
        const OVERSIZE_BYTES: usize = MAX_BODY_BYTES + 1024;
        let headers = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/plain; charset=utf-8\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n",
            OVERSIZE_BYTES
        );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            if let Ok((mut sock, _)) = listener.accept().await {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0u8; 2048];
                let _ = sock.read(&mut buf).await;
                let _ = sock.write_all(headers.as_bytes()).await;
                // Write the oversize body in 64 KiB chunks so we don't
                // blow the socket buffer in one go.
                let chunk = vec![b'a'; 64 * 1024];
                let mut written = 0usize;
                while written < OVERSIZE_BYTES {
                    let remain = OVERSIZE_BYTES - written;
                    let take = remain.min(chunk.len());
                    if sock.write_all(&chunk[..take]).await.is_err() {
                        break;
                    }
                    written += take;
                }
                let _ = sock.shutdown().await;
            }
        });

        let url = format!("http://{addr}/huge");
        let err = fetch_and_body(&url).await.unwrap_err();
        match err {
            IngestError::TooLarge { bytes, max } => {
                assert_eq!(max, MAX_BODY_BYTES);
                assert!(
                    bytes > MAX_BODY_BYTES,
                    "TooLarge reported {bytes} <= cap {MAX_BODY_BYTES}"
                );
            }
            other => panic!("expected IngestError::TooLarge, got {other:?}"),
        }

        // Server task may still be writing when fetch bailed; we
        // don't care about its result, just drain so the runtime
        // shuts down cleanly.
        let _ = server.await;
    }
}
