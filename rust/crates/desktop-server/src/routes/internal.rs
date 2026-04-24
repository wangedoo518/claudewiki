use super::super::*;

pub(crate) fn install(router: Router<AppState>) -> Router<AppState> {
    router.route("/internal/shutdown", post(shutdown_handler))
}
