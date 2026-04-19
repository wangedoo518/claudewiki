//! P1 End-to-End Provenance + Lineage Explorer — type definitions.
//!
//! `LineageEvent` is the append-only unit of provenance we persist to
//! `.clawwiki/lineage.jsonl`. Each write path (raw ingest, inbox
//! append, proposal generation, wiki page apply, WeChat message,
//! URL ingest, …) fires exactly one event at the success guard, so
//! the jsonl tail is a faithful chronological record of every
//! pipeline step.
//!
//! The three read APIs (`read_lineage_for_wiki` /
//! `read_lineage_for_inbox` / `read_lineage_for_raw`) scan the full
//! file linearly and filter by `LineageRef`. MVP-scale (<10k events)
//! is comfortable for a linear scan; an index file is a P1.1 concern.
//!
//! **Struct stability**: the existing `RawEntry` / `InboxEntry` /
//! `WikiPageSummary` types are *not* extended by this module — the
//! P1 contract pins them closed. Provenance lives alongside rather
//! than inside those records.

use serde::{Deserialize, Serialize};

/// One provenance event. Kept intentionally small and append-only:
/// a producer writes exactly one event per successful write path
/// (so the jsonl tail mirrors the pipeline timeline), a consumer
/// filters by `LineageRef` without mutating the file.
///
/// The `metadata` field is a free-form `serde_json::Value` for
/// path-specific extras (applied vs partial_applied outcome, failed
/// inbox ids, rejection reason, etc.). Readers are tolerant — unknown
/// keys are ignored.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LineageEvent {
    /// UUID v4 assigned at fire time. Used as a stable handle when
    /// the frontend wants to drill into one specific event (e.g.
    /// correlate a UI click back to a log line).
    pub event_id: String,
    /// Discriminator — see [`LineageEventType`] for the full set.
    pub event_type: LineageEventType,
    /// Epoch milliseconds. Primary sort key for the read APIs
    /// (descending, newest first).
    pub timestamp_ms: i64,
    /// Upstream pointers — what produced / contributed to this event.
    /// E.g. for `WikiPageApplied`: the inbox + raw ids that drove
    /// the apply.
    pub upstream: Vec<LineageRef>,
    /// Downstream pointers — what this event produced.
    /// E.g. for `RawWritten`: the raw id that was just persisted.
    pub downstream: Vec<LineageRef>,
    /// Short Chinese sentence rendered in the UI timeline. Capped
    /// at ~40 chars by the producer templates (see `display_title_*`
    /// helpers in `mod.rs`). Never i18n-transformed at read time —
    /// the string is stored verbatim so the UI renders one locale.
    pub display_title: String,
    /// Free-form JSON for path-specific extras. Readers are tolerant
    /// of missing keys — always check before indexing.
    pub metadata: serde_json::Value,
}

/// Discriminator for [`LineageEvent`]. Serialized with
/// `#[serde(rename_all = "snake_case")]` so the wire format uses
/// `raw_written` / `inbox_appended` / … matching the TS side.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LineageEventType {
    /// A raw entry was written to `raw/`. Upstream: optional
    /// `UrlSource` / `WeChatMessage`. Downstream: `Raw{id}`.
    RawWritten,
    /// An inbox task was appended (typically after a raw write).
    /// Upstream: `Raw{id}`. Downstream: `Inbox{id}`.
    InboxAppended,
    /// The maintainer generated an update proposal against a target
    /// wiki page. Upstream: `Inbox{id}` + `Raw{id}`. Downstream: the
    /// `WikiPage{slug}` that would be updated (not yet applied).
    ProposalGenerated,
    /// A wiki page was written (create_new / update_existing / apply).
    /// Upstream: `Inbox{id}` + `Raw{id}`. Downstream: `WikiPage{slug}`.
    WikiPageApplied,
    /// The combined apply path wrote N inbox proposals into one wiki
    /// page. Upstream: N × (`Inbox{id}` + `Raw{id}`).
    /// Downstream: `WikiPage{slug}`.
    CombinedWikiPageApplied,
    /// The user rejected an inbox task.
    /// Upstream: `Inbox{id}`. Downstream: empty.
    InboxRejected,
    /// A WeChat message passed M5 dedupe and entered the pipeline.
    /// Upstream: empty. Downstream: `WeChatMessage{event_key}`.
    WeChatMessageReceived,
    /// A URL was ingested via `url_ingest::ingest_url`, producing
    /// a raw entry. Upstream: `UrlSource{canonical}`.
    /// Downstream: `Raw{id}` (emitted separately by `RawWritten`).
    UrlIngested,
}

/// Pointer into one of the canonical pipeline surfaces. Serialized
/// with `#[serde(tag = "kind", rename_all = "snake_case")]` so the
/// wire shape is e.g. `{"kind":"raw","id":42}`.
///
/// Readers use `LineageRef` equality to filter a lineage scan: e.g.
/// "give me every event whose upstream or downstream mentions
/// `WikiPage { slug: "attention" }`".
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LineageRef {
    Raw {
        id: u32,
    },
    Inbox {
        id: u32,
    },
    WikiPage {
        slug: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
    },
    WeChatMessage {
        event_key: String,
    },
    UrlSource {
        canonical: String,
    },
}

impl LineageRef {
    /// True when this ref points at the given raw id. Used by the
    /// `read_lineage_for_raw` scanner.
    #[must_use]
    pub fn matches_raw(&self, target: u32) -> bool {
        matches!(self, LineageRef::Raw { id } if *id == target)
    }

    /// True when this ref points at the given inbox id.
    #[must_use]
    pub fn matches_inbox(&self, target: u32) -> bool {
        matches!(self, LineageRef::Inbox { id } if *id == target)
    }

    /// True when this ref points at the given wiki slug. The optional
    /// `title` field is ignored for matching — it's a cosmetic cache.
    #[must_use]
    pub fn matches_wiki_slug(&self, target: &str) -> bool {
        matches!(self, LineageRef::WikiPage { slug, .. } if slug == target)
    }
}
