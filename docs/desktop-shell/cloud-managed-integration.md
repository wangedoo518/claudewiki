# Cloud-managed Codex accounts — integration plan

Context: the trade service (`open-claude-code-trade`) maintains a pool of Codex
OAuth accounts and assigns N of them to each active subscription. The desktop
shell needs to use those accounts for Codex API calls, side-by-side with user
self-added Codex / Qwen accounts.

## Current MVP (this repo)

- Frontend (`apps/desktop-shell/src/features/billing/`):
  - `api.getMyCodexAccounts()` fetches plain-text access / refresh tokens
    after the user has an ACTIVE subscription.
  - `cloud-accounts-sync.ts` persists them via Tauri `plugin-store` at
    `~/.warwolf/cloud-accounts.json` (fallback: `localStorage`).
  - `CloudAccountsPanel.tsx` surfaces them inside `Settings → Billing` with a
    manual "re-sync" button.
- Nothing in Rust `desktop-core` has been touched. The MVP keeps cloud accounts
  as a frontend concept only.

## Upstream Rust integration (next)

The goal is for `rust/crates/desktop-core` to treat cloud-managed accounts as
first-class members of the Codex auth registry, so that:

1. They appear in `ProviderSettings` next to user-added accounts but are
   marked read-only (no edit / no delete).
2. The agentic loop prefers them for Codex calls when a cloud subscription is
   active.
3. Token refresh goes through the trade backend rather than the desktop hitting
   Codex's OAuth endpoints directly.

### Proposed upstream changes (claw-code-parity)

1. Extend the `DesktopCodexAuthSource` enum with a new variant:
   ```rust
   pub enum DesktopCodexAuthSource {
       LocalOAuth,        // existing
       ImportedFile,      // existing
       CloudManaged,      // new: provisioned by trade service
   }
   ```
2. `DesktopCodexInstallationRecord` gains two optional fields:
   ```rust
   pub cloud_subscription_id: Option<i64>,
   pub cloud_account_id: Option<i64>,
   ```
3. New API on `managed_auth::DesktopManagedAuthRuntimeClient`:
   ```rust
   async fn import_cloud_accounts(&self, accounts: Vec<CloudAccountInput>);
   async fn list_cloud_accounts(&self) -> Vec<DesktopCodexInstallationRecord>;
   async fn clear_cloud_accounts(&self);
   ```
4. `delete_codex_profile` / `remove_account` refuse to operate when
   `source == CloudManaged`.

### Proposed desktop-server endpoints

Add three routes in `rust/crates/desktop-server/src/lib.rs`:

```
POST /api/desktop/cloud/codex-accounts/sync
  body: { accounts: Array<{ codex_user_id, alias, access_token, refresh_token, token_expires_at }> }
  -> imports into runtime, returns summary

GET  /api/desktop/cloud/codex-accounts
  -> returns the current cloud-managed set

POST /api/desktop/cloud/codex-accounts/clear
  -> removes them (called on logout / subscription cancel)
```

### Frontend wiring once upstream ships

Replace `cloud-accounts-sync.ts` with calls into the local `desktop-server`:

```ts
await desktopTransport.post("/api/desktop/cloud/codex-accounts/sync", {
  accounts: cloudAccounts,
});
```

`ProviderSettings` automatically picks up the new accounts because they now
live in the same runtime registry. The `CloudAccountsPanel` becomes an
informational view, or we retire it entirely.

## Security notes

- Tokens are encrypted at rest in the trade service (AES-256-GCM,
  `occ.trade.secret-key`).
- They are delivered to the desktop over HTTPS under a JWT-protected endpoint.
- On the desktop they currently land in plain JSON (`plugin-store`). Once the
  Rust integration lands, token storage will move into the OS keychain on
  platforms that support it (macOS Keychain, Windows Credential Manager,
  Linux Secret Service), matching how existing Codex OAuth tokens are stored.
- On logout the frontend should call `clear_cloud_accounts` (or in the MVP,
  clear the Tauri store file) so tokens are not left on disk.
