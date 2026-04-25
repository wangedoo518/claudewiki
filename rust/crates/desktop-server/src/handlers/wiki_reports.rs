use super::super::*;

/// POST /api/wiki/cleanup - run patrol-based cleanup audit.
/// Phase 4: delegates to wiki_patrol::run_full_patrol (local checks).
/// Full LLM-based quality audit deferred to a future sprint.
pub(crate) async fn cleanup_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let config = wiki_patrol::PatrolConfig {
        stale_threshold_days: 30,
        min_page_words: 50,
        max_page_words: 3000,
    };
    let report = wiki_patrol::run_full_patrol(&paths, &config);
    persist_patrol_outputs(&paths, &report)?;
    Ok(Json(
        serde_json::to_value(&report).unwrap_or(serde_json::Value::Null),
    ))
}

/// POST /api/wiki/patrol - run full patrol and return report.
pub(crate) async fn patrol_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let config = wiki_patrol::PatrolConfig::default();
    let report = wiki_patrol::run_full_patrol(&paths, &config);
    persist_patrol_outputs(&paths, &report)?;
    Ok(Json(
        serde_json::to_value(&report).unwrap_or(serde_json::Value::Null),
    ))
}

fn persist_patrol_outputs(
    paths: &wiki_store::WikiPaths,
    report: &wiki_store::PatrolReport,
) -> Result<(), ApiError> {
    wiki_store::save_patrol_report(paths, report).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("PATROL_REPORT_SAVE_FAILED: {e}"),
            }),
        )
    })?;
    wiki_store::append_patrol_issue_inbox_tasks(paths, &report.issues).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("PATROL_INBOX_TASK_CREATE_FAILED: {e}"),
            }),
        )
    })?;
    Ok(())
}

#[derive(Deserialize)]
pub(crate) struct AbsorbLogQuery {
    limit: Option<usize>,
    offset: Option<usize>,
}

/// GET /api/wiki/absorb-log - paginated absorb log.
pub(crate) async fn get_absorb_log_handler(
    Query(params): Query<AbsorbLogQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let all = wiki_store::list_absorb_log(&paths).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("LOG_READ_FAILED: {e}"),
            }),
        )
    })?;

    let total = all.len();
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(100).min(1000).max(1);
    let entries: Vec<_> = all.into_iter().skip(offset).take(limit).collect();

    Ok(Json(serde_json::json!({
        "entries": entries,
        "total": total,
    })))
}

#[derive(Deserialize)]
pub(crate) struct BacklinksQuery {
    slug: Option<String>,
    format: Option<String>,
}

/// GET /api/wiki/backlinks - full backlinks index or single slug.
pub(crate) async fn get_backlinks_index_handler(
    Query(params): Query<BacklinksQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;

    let mut index = wiki_store::load_backlinks_index(&paths).unwrap_or_default();
    if index.is_empty() {
        index = wiki_store::build_backlinks_index(&paths).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("INDEX_BUILD_FAILED: {e}"),
                }),
            )
        })?;
        let _ = wiki_store::save_backlinks_index(&paths, &index);
    }

    match params.slug {
        Some(slug) => {
            let backlinks = index.get(&slug).cloned().unwrap_or_default();
            let enriched: Vec<serde_json::Value> = backlinks
                .iter()
                .filter_map(|s| {
                    wiki_store::read_wiki_page(&paths, s)
                        .ok()
                        .map(|(summary, _)| {
                            serde_json::json!({
                                "slug": s,
                                "title": summary.title,
                                "category": summary.category,
                            })
                        })
                })
                .collect();
            Ok(Json(serde_json::json!({
                "slug": slug,
                "backlinks": enriched,
                "count": enriched.len(),
            })))
        }
        None => {
            if params.format.as_deref() == Some("raw") {
                return Ok(Json(
                    serde_json::to_value(&index).unwrap_or(serde_json::json!({})),
                ));
            }
            let total_pages = wiki_store::list_all_wiki_pages(&paths)
                .map(|p| p.len())
                .unwrap_or(0);
            let total_backlinks: usize = index.values().map(|v| v.len()).sum();
            Ok(Json(serde_json::json!({
                "index": index,
                "total_pages": total_pages,
                "total_backlinks": total_backlinks,
            })))
        }
    }
}

/// GET /api/wiki/stats - aggregated wiki statistics.
pub(crate) async fn get_stats_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let stats = wiki_store::wiki_stats(&paths).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("STATS_COMPUTE_FAILED: {e}"),
            }),
        )
    })?;
    Ok(Json(
        serde_json::to_value(&stats).unwrap_or(serde_json::Value::Null),
    ))
}

/// GET /api/wiki/patrol/report - latest persisted patrol report.
pub(crate) async fn get_patrol_report_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let report = wiki_store::load_patrol_report(&paths).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("load patrol report: {e}"),
            }),
        )
    })?;
    match report {
        Some(r) => Ok(Json(
            serde_json::to_value(&r).unwrap_or(serde_json::Value::Null),
        )),
        None => Ok(Json(serde_json::Value::Null)),
    }
}

/// GET /api/wiki/schema/templates - list all schema templates.
pub(crate) async fn get_schema_templates_handler() -> Result<Json<serde_json::Value>, ApiError> {
    let paths = resolve_wiki_root_for_handler()?;
    let infos = wiki_store::load_schema_template_infos(&paths).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("TEMPLATE_PARSE_FAILED: {e}"),
            }),
        )
    })?;
    Ok(Json(
        serde_json::to_value(&infos).unwrap_or(serde_json::json!([])),
    ))
}
