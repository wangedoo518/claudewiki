/**
 * URLTrackBadge — compares canonical_url vs original_url for a raw.
 *
 * Three rendering modes:
 *   - When both are present AND differ, shows a stacked "original →
 *     canonical" display plus a "已规范化" chip.
 *   - When only one is known (canonical === original OR one missing),
 *     shows a single URL row.
 *   - When neither is present, renders nothing (degrades gracefully
 *     for non-URL raws like wechat-text or paste).
 *
 * Consumed by the Workbench Evidence section (Section 1 - 来源卡).
 */

import { Link2 } from "lucide-react";

export interface URLTrackBadgeProps {
  canonicalUrl?: string | null;
  originalUrl?: string | null;
  /** Fallback (e.g. `source_url` from RawEntry) when the M3/M4 fields are absent. */
  sourceUrl?: string | null;
}

export function URLTrackBadge({
  canonicalUrl,
  originalUrl,
  sourceUrl,
}: URLTrackBadgeProps) {
  const canonical = canonicalUrl?.trim() || null;
  const original = originalUrl?.trim() || null;
  const fallback = sourceUrl?.trim() || null;

  // No URL info at all — hide the whole block.
  if (!canonical && !original && !fallback) return null;

  const showCompare =
    canonical !== null && original !== null && canonical !== original;

  // Both known and equal, or only one side present: single-line form.
  if (!showCompare) {
    const single = canonical ?? original ?? fallback;
    if (!single) return null;
    return (
      <div className="flex items-start gap-1.5 text-muted-foreground/80" style={{ fontSize: 11 }}>
        <Link2
          className="mt-0.5 size-3 shrink-0"
          style={{ color: "var(--color-primary)" }}
        />
        <a
          href={single}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline decoration-primary/40 hover:decoration-primary"
        >
          {single}
        </a>
      </div>
    );
  }

  // We know both sides and they differ — show stacked compare view.
  return (
    <div className="space-y-1" style={{ fontSize: 11 }}>
      <div className="flex items-center gap-1.5">
        <Link2
          className="size-3 shrink-0"
          style={{ color: "var(--color-primary)" }}
        />
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 font-medium"
          style={{
            fontSize: 10,
            borderColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
            color: "var(--color-primary)",
          }}
          title="URL 已被规范化（utm / 末尾斜杠 / 大小写统一）"
        >
          已规范化
        </span>
      </div>
      <div className="pl-[18px]">
        <div className="flex items-start gap-1 text-muted-foreground/70">
          <span className="shrink-0 font-medium">原始:</span>
          <a
            href={original as string}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-muted-foreground/90 underline decoration-muted-foreground/30 hover:text-foreground"
          >
            {original}
          </a>
        </div>
        <div className="mt-0.5 flex items-start gap-1">
          <span className="shrink-0 font-medium text-muted-foreground/70">规范:</span>
          <a
            href={canonical as string}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline decoration-primary/40 hover:decoration-primary"
          >
            {canonical}
          </a>
        </div>
      </div>
    </div>
  );
}
