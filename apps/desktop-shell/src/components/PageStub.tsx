import type { ReactNode } from "react";

/**
 * Generic stub page for ClawWiki S0.2.
 *
 * Every canonical surface that doesn't have an implementation yet
 * (Dashboard, Ask, Inbox, Raw, Wiki, Graph, Schema, WeChat Bridge)
 * renders this component with different copy. Keeping one wrapper
 * lets us iterate the blank-page aesthetic in exactly one place and
 * lets reviewers verify the DeepTutor palette end-to-end without
 * having to fill in every feature.
 *
 * The component is intentionally dependency-free — no icon library,
 * no Radix primitives, no zustand access. If it fails to render
 * we know the shell itself is broken, not a downstream provider.
 */
export interface PageStubProps {
  /** Single-character emoji or short glyph mirroring the Sidebar item. */
  icon: string;
  /** User-facing page title (Chinese per product MVP constraint). */
  title: string;
  /** One-line subtitle describing what this surface will ultimately show. */
  tagline: string;
  /** Planned sprint tag, e.g. "S3" or "S5 (iLink)". */
  sprint: string;
  /** Optional extra children rendered below the tagline — used by pages
   *  that want to show a preview snippet (e.g. Raw Library can show
   *  "0 items" once wiki_store is wired in S1). */
  children?: ReactNode;
}

export function PageStub({
  icon,
  title,
  tagline,
  sprint,
  children,
}: PageStubProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background text-foreground">
      {/* 56px page head — matches canonical §5 layout */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">
            {icon}
          </span>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            title="Planned sprint for this surface"
          >
            {sprint}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 items-center justify-center px-8 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-3xl shadow-sm"
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="font-serif-dt text-xl leading-tight text-foreground">
            {title}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {tagline}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1 font-mono">
              status: stub
            </span>
            <span className="rounded-md bg-muted px-2 py-1 font-mono">
              sprint: {sprint}
            </span>
            <span className="rounded-md bg-muted px-2 py-1 font-mono">
              theme: DeepTutor
            </span>
          </div>
          {children ? <div className="mt-4 w-full">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
