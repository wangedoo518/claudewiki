/**
 * BrowserDrawer -- a reusable right-side drawer panel that embeds a web page.
 *
 * Any component in the app can trigger it via the zustand settings store:
 *   openBrowser(url, title?, icon?)  -- open the drawer
 *   closeBrowser()                   -- close and clear
 *   toggleBrowser()                  -- toggle open/closed
 *
 * Renders at Shell level inside the SidebarInset flex row.
 * Uses CSS width transition (never position:fixed) so it participates
 * in the normal flex layout.
 */

import { useSettingsStore } from "@/state/settings-store";

export function BrowserDrawer() {
  const url = useSettingsStore((s) => s.browserUrl);
  const title = useSettingsStore((s) => s.browserTitle);
  const icon = useSettingsStore((s) => s.browserIcon);
  const open = useSettingsStore((s) => s.browserDrawerOpen);
  const toggle = useSettingsStore((s) => s.toggleBrowser);
  const close = useSettingsStore((s) => s.closeBrowser);

  const handleOpenExternal = () => {
    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="relative flex-shrink-0">
      {/* Toggle button -- always visible at drawer edge */}
      <button
        type="button"
        onClick={toggle}
        className="absolute left-[-28px] top-1/2 z-10 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[var(--color-border)] bg-[var(--color-background)] text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
        title={open ? "收起面板" : "展开面板"}
      >
        {open ? "\u25C0" : "\u25B6"}
      </button>

      <div
        className="flex h-full flex-col border-l border-[var(--color-border)] bg-[var(--color-background)] overflow-hidden"
        style={{
          width: open ? "55vw" : 0,
          minWidth: open ? 400 : 0,
          transition: "width 300ms ease, min-width 300ms ease",
        }}
      >
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
          <button
            type="button"
            onClick={close}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title="关闭面板"
          >
            {"\u25C0"}
          </button>
          <button
            type="button"
            onClick={() => {
              /* reload -- no-op placeholder for future webview */
            }}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title="刷新"
          >
            {"\uD83D\uDD04"}
          </button>
          <div className="flex-1 truncate px-2 text-xs text-[var(--color-muted-foreground)]">
            {url ?? ""}
          </div>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title="在浏览器中打开"
          >
            {"\uD83D\uDD17"}
          </button>
        </div>

        {/* Content area -- placeholder until real webview */}
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-5xl">{icon}</span>
            <h3 className="text-base font-semibold text-[var(--color-foreground)]">
              {title || "浏览器面板"}
            </h3>
            <p className="max-w-xs text-sm text-[var(--color-muted-foreground)]">
              此处将加载网页内容
            </p>
            {url && (
              <p className="max-w-xs truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                {url}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
