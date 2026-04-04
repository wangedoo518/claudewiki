use std::env;
use std::net::SocketAddr;

use desktop_core::DesktopState;
use desktop_server::{serve, AppState};

const DEFAULT_ADDRESS: &str = "127.0.0.1:4357";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = env::var("OPEN_CLAUDE_CODE_DESKTOP_ADDR")
        .unwrap_or_else(|_| DEFAULT_ADDRESS.to_string())
        .parse::<SocketAddr>()?;
    serve(AppState::new(DesktopState::live()), address).await?;
    Ok(())
}
