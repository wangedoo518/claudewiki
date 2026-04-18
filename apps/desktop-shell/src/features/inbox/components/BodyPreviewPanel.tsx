/**
 * BodyPreviewPanel — collapsible markdown body preview for the
 * Maintainer Workbench Evidence section.
 *
 * Defaults to the first 8 lines shown inline, with a "展开全部" / "折叠"
 * toggle. When expanded, the body is constrained to a 400px scroll
 * viewport so the rest of the pane stays reachable. Whitespace is
 * preserved (`pre-wrap`) so the raw markdown looks the same as it
 * would in the Raw Library detail.
 *
 * If `body` is empty / whitespace-only, renders a muted "暂无正文"
 * placeholder instead of an empty scroll box.
 *
 * W1 P2-4: leading metadata-block detection. Many URL-ingested raws
 * start with a redundant header: a H1 title, then italic pseudo-fields
 * `_Source:_ _Extractor:_ _Size:_`, then the "real" content below.
 * The same metadata already appears in the Evidence Source card, so
 * the preview folds that leading block into a single muted meta-chip
 * row and only renders the remainder. If the heuristic doesn't match
 * (≥ 2 consecutive `_Key: value_` lines), the body renders unchanged.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

const DEFAULT_COLLAPSED_LINES = 8;
const EXPANDED_MAX_HEIGHT_PX = 400;

export interface BodyPreviewPanelProps {
  body: string | null | undefined;
  /** Small heading shown above the body (e.g. raw filename). */
  heading?: string;
  /** Override default collapsed line count (test hook; UI rarely needs this). */
  collapsedLines?: number;
}

/**
 * Detect a leading metadata block (H1? blank? then ≥2 `_Key: value_`
 * italic lines). When matched, returns the meta items as `meta` plus
 * the remaining body. When not matched, `meta` is null and `body` is
 * the original string.
 */
function extractLeadingMeta(raw: string): {
  meta: { key: string; value: string }[] | null;
  body: string;
} {
  const lines = raw.split(/\r?\n/);
  let scanStart = 0;

  // Optionally skip a leading H1 title (e.g. "# Example Domain") —
  // same title almost always shows up again below, so dropping it
  // keeps the preview focused on the actual delta.
  const hadLeadingH1 = /^#\s/.test(lines[0] ?? "");
  if (hadLeadingH1) scanStart = 1;
  // Skip blank line(s) between title and meta block.
  while (scanStart < lines.length && lines[scanStart].trim() === "") {
    scanStart++;
  }

  // Collect consecutive italic pseudo-field lines:
  //   _Source: https://example.com_
  //   _Extractor: generic_
  //   _Size: 528 bytes_
  const metaRe = /^_([A-Za-z][A-Za-z0-9 ]*?):\s*([^_]*?)_?$/;
  const meta: { key: string; value: string }[] = [];
  let metaEnd = scanStart;
  while (metaEnd < lines.length) {
    const line = lines[metaEnd].trim();
    if (line === "") break;
    const m = line.match(metaRe);
    if (!m) break;
    meta.push({ key: m[1].trim(), value: m[2].trim() });
    metaEnd++;
  }

  // Require at least 2 consecutive meta lines to treat this as a real
  // metadata block — a lone `_italic_` line elsewhere would otherwise
  // get false-positive classified.
  if (meta.length < 2) {
    return { meta: null, body: raw };
  }

  // Consume trailing blank lines after the meta block.
  while (metaEnd < lines.length && lines[metaEnd].trim() === "") {
    metaEnd++;
  }

  return { meta, body: lines.slice(metaEnd).join("\n") };
}

export function BodyPreviewPanel({
  body,
  heading,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
}: BodyPreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const trimmed = (body ?? "").trimEnd();
  const extracted = useMemo(() => extractLeadingMeta(trimmed), [trimmed]);
  const displayBody = extracted.body.trimStart();
  const lines = useMemo(() => displayBody.split(/\r?\n/), [displayBody]);
  const hasOverflow = lines.length > collapsedLines;

  // Empty-state short-circuit: keep the heading but show a placeholder.
  if (trimmed.length === 0) {
    return (
      <div className="rounded-md border border-border/40 px-3 py-4 text-center text-muted-foreground/60" style={{ fontSize: 12 }}>
        <FileText className="mx-auto mb-1 size-4 opacity-40" />
        {heading ?? "暂无正文"}
      </div>
    );
  }

  const visibleBody = expanded
    ? displayBody
    : lines.slice(0, collapsedLines).join("\n");

  return (
    <div className="rounded-md border border-border/40 overflow-hidden">
      {heading && (
        <div
          className="flex items-center gap-1.5 border-b border-border/30 bg-muted/10 px-3 py-1.5 font-mono text-muted-foreground/70"
          style={{ fontSize: 11 }}
        >
          <FileText className="size-3" />
          {heading}
          <span className="ml-auto text-muted-foreground/40">
            {lines.length} 行
          </span>
        </div>
      )}
      {extracted.meta && extracted.meta.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/30 bg-muted/5 px-3 py-1.5 text-muted-foreground/70"
          style={{ fontSize: 11 }}
          title="正文前导元数据（已在上方来源卡中展示，此处折叠）"
        >
          <span className="uppercase tracking-wider text-muted-foreground/50" style={{ fontSize: 10 }}>
            正文元数据
          </span>
          {extracted.meta.map((m) => (
            <span key={m.key} className="inline-flex items-baseline gap-1">
              <span className="text-muted-foreground/50">{m.key}</span>
              <span className="font-mono text-foreground/70 break-all">{m.value}</span>
            </span>
          ))}
        </div>
      )}
      <pre
        className="whitespace-pre-wrap px-3 py-2.5 font-mono text-foreground/90"
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: expanded ? EXPANDED_MAX_HEIGHT_PX : undefined,
          overflowY: expanded ? "auto" : "hidden",
        }}
      >
        {visibleBody}
        {!expanded && hasOverflow && (
          <span className="text-muted-foreground/40">
            {"\n…"}
          </span>
        )}
      </pre>
      {hasOverflow && (
        <div className="border-t border-border/30 bg-muted/5 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
            style={{ fontSize: 11 }}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" />
                折叠
              </>
            ) : (
              <>
                <ChevronDown className="size-3" />
                展开全部（共 {lines.length} 行）
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
