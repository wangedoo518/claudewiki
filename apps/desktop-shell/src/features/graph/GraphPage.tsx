/**
 * Graph · 你的认知网络 (wireframes.html §08)
 *
 * S6 MVP implementation. The canonical surface eventually shows a
 * force-directed node+edge render of ALL wiki pages colored by
 * fresh/stale/conflict status. That requires:
 *   1. Real wiki/ pages produced by wiki_maintainer (still on hold
 *      until codex_broker::chat_completion is wired), and
 *   2. A layout algorithm (force-directed + collision detection).
 *
 * S6 MVP ships a DIFFERENT shape that's actually useful today:
 *
 *   - Nodes = raw entries (the only layer currently populated)
 *   - Layout = concentric rings grouped by `source` (paste / url /
 *     wechat-text / ...), deterministic polar coordinates so it
 *     doesn't jitter between refreshes
 *   - Colors tint by source (paste = orange, url = blue,
 *     wechat-text = green, others = muted)
 *   - Click a node → jump to /raw (the real navigation target
 *     lands in S4+ once entries are deep-linkable)
 *
 * Everything is plain SVG with CSS-variable fills; no d3 or
 * react-force-graph dep. Works at any canvas size via viewBox and
 * scales text with the zoom.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Brain, Loader2, Network } from "lucide-react";
import { getWikiGraph, listRawEntries } from "@/features/ingest/persist";
import type { RawEntry } from "@/features/ingest/types";

// SVG layout constants — all coordinates are relative to the
// `viewBox="0 0 1000 600"` on the <svg> element. Changing GRAPH_CENTER
// or RING_* will NOT automatically update that viewBox, so keep them
// in sync if you ever want a bigger canvas.
const GRAPH_CENTER = { x: 500, y: 300 } as const;
const HUB_RADIUS = 32;
const RING_MIN_RADIUS = 80;
const RING_STEP = 90;
const NODE_RADIUS = 18;

// Width used by padStart when rendering numeric ids. Matches the
// 5-digit zero-padded convention in the Raw Library + Inbox pages
// so users see consistent `#00001` labels across surfaces.
const ID_PAD_WIDTH = 5;

const SOURCE_COLORS: Record<string, string> = {
  paste: "var(--claude-orange)",
  url: "var(--claude-blue)",
  "wechat-text": "var(--color-success)",
  "wechat-article": "var(--color-success)",
  voice: "var(--color-warning)",
  image: "var(--agent-purple)",
  pdf: "var(--color-terminal-tool)",
  pptx: "var(--agent-pink)",
  docx: "var(--claude-blue)",
  video: "var(--color-error)",
  card: "var(--agent-cyan)",
  chat: "var(--agent-yellow)",
};

const DEFAULT_COLOR = "var(--muted-foreground)";

interface LayoutNode {
  entry: RawEntry;
  x: number;
  y: number;
  color: string;
}

export function GraphPage() {
  const navigate = useNavigate();

  const rawQuery = useQuery({
    queryKey: ["wiki", "raw", "list"] as const,
    queryFn: () => listRawEntries(),
    staleTime: 30_000,
  });

  // feat T: pull the wiki graph data so we can render the
  // concept connections sidebar without rewriting the SVG layout.
  const graphQuery = useQuery({
    queryKey: ["wiki", "graph"] as const,
    queryFn: () => getWikiGraph(),
    staleTime: 30_000,
  });

  const entries = rawQuery.data?.entries ?? [];
  const layout = useMemo(() => computeLayout(entries), [entries]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hero */}
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xl">🕸</span>
          <h1
            className="text-head font-semibold text-foreground"
            style={{ fontFamily: "var(--font-serif, Lora, serif)" }}
          >
            Graph · 你的认知网络
          </h1>
        </div>
        <p className="mt-1 text-label text-muted-foreground">
          我的脑子里都连起来没 — feat(T) 后接入真实的 wiki/graph 端点 · 右侧 Concept Connections 显示概念页与 raw 之间的派生边
        </p>
      </div>

      {/* Body: SVG canvas + concept connections sidebar */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {rawQuery.isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-caption text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Loading graph…
            </div>
          ) : rawQuery.error ? (
            <GraphError message={(rawQuery.error as Error).message} />
          ) : entries.length === 0 ? (
            <GraphEmpty />
          ) : (
            <GraphCanvas
              layout={layout}
              total={entries.length}
              onNodeClick={() => navigate("/raw")}
            />
          )}
        </div>
        <ConceptConnectionsSidebar
          isLoading={graphQuery.isLoading}
          error={(graphQuery.error as Error | null)?.message ?? null}
          data={graphQuery.data ?? null}
          onNavigateRaw={() => navigate("/raw")}
          onNavigateWiki={() => navigate("/wiki")}
        />
      </div>
    </div>
  );
}

/* ─── Concept Connections sidebar (feat T) ──────────────────────── */

function ConceptConnectionsSidebar({
  isLoading,
  error,
  data,
  onNavigateRaw,
  onNavigateWiki,
}: {
  isLoading: boolean;
  error: string | null;
  data: import("@/features/ingest/types").WikiGraphResponse | null;
  onNavigateRaw: () => void;
  onNavigateWiki: () => void;
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-border/50 bg-muted/5">
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-caption uppercase tracking-wide text-muted-foreground">
          <Network className="size-3" />
          Concept Connections
        </div>
        {data ? (
          <div className="text-caption text-muted-foreground">
            {data.concept_count} concept{data.concept_count === 1 ? "" : "s"} ·{" "}
            {data.edge_count} edge{data.edge_count === 1 ? "" : "s"} ·{" "}
            {data.raw_count} raw
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-caption text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div
            className="rounded-md border px-3 py-2 text-caption"
            style={{
              borderColor:
                "color-mix(in srgb, var(--color-error) 30%, transparent)",
              backgroundColor:
                "color-mix(in srgb, var(--color-error) 5%, transparent)",
              color: "var(--color-error)",
            }}
          >
            {error}
          </div>
        ) : !data || data.edges.length === 0 ? (
          <div className="px-2 py-3 text-caption text-muted-foreground">
            No concept→raw edges yet. Approve a maintainer proposal in
            the{" "}
            <a
              href="#/inbox"
              className="text-primary hover:underline"
            >
              Inbox
            </a>{" "}
            to grow the graph.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {data.edges.map((edge, idx) => {
              const fromLabel =
                data.nodes.find((n) => n.id === edge.from)?.label ??
                edge.from;
              const toLabel =
                data.nodes.find((n) => n.id === edge.to)?.label ?? edge.to;
              return (
                <li
                  key={`${edge.from}->${edge.to}-${idx}`}
                  className="rounded-md border border-border/40 bg-background px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={onNavigateWiki}
                    className="block w-full truncate text-left text-body-sm font-medium text-foreground hover:underline"
                    style={{
                      fontFamily: "var(--font-serif, Lora, serif)",
                    }}
                  >
                    <Brain
                      className="mr-1 inline size-3"
                      style={{ color: "var(--claude-orange)" }}
                    />
                    {fromLabel}
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateRaw}
                    className="mt-0.5 flex w-full items-center gap-1 text-left text-caption text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight className="size-3 shrink-0" />
                    <span className="truncate">{toLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ─── Layout algorithm ─────────────────────────────────────────── */

/**
 * Concentric-rings layout: one ring per distinct `source`, nodes
 * evenly distributed along each ring. Deterministic (no
 * randomness), stable across refetches.
 */
function computeLayout(entries: RawEntry[]): LayoutNode[] {
  if (entries.length === 0) return [];

  const groups = new Map<string, RawEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.source) ?? [];
    list.push(entry);
    groups.set(entry.source, list);
  }

  // Sort groups by size descending so the biggest ring sits outermost.
  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const nodes: LayoutNode[] = [];

  sorted.forEach(([source, list], ringIdx) => {
    const r = RING_MIN_RADIUS + ringIdx * RING_STEP;
    const count = list.length;
    const color = SOURCE_COLORS[source] ?? DEFAULT_COLOR;
    list.forEach((entry, i) => {
      const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        entry,
        x: GRAPH_CENTER.x + r * Math.cos(angle),
        y: GRAPH_CENTER.y + r * Math.sin(angle),
        color,
      });
    });
  });

  return nodes;
}

/* ─── Canvas ───────────────────────────────────────────────────── */

function GraphCanvas({
  layout,
  total,
  onNodeClick,
}: {
  layout: LayoutNode[];
  total: number;
  onNodeClick: (entry: RawEntry) => void;
}) {
  // Compute the unique sources + counts for the legend.
  const legend = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of layout) {
      m.set(n.entry.source, (m.get(n.entry.source) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [layout]);

  return (
    <div className="h-full">
      <svg
        viewBox="0 0 1000 600"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Central label */}
        <g>
          <circle
            cx={GRAPH_CENTER.x}
            cy={GRAPH_CENTER.y}
            r={HUB_RADIUS}
            fill="var(--color-muted)"
          />
          <text
            x={GRAPH_CENTER.x}
            y={GRAPH_CENTER.y - 2}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="var(--color-foreground)"
          >
            raw
          </text>
          <text
            x={GRAPH_CENTER.x}
            y={GRAPH_CENTER.y + 13}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {total}
          </text>
        </g>

        {/* Spokes: link every node to the center so the cluster reads
            as a star rather than a loose cloud. */}
        {layout.map((n) => (
          <line
            key={`spoke-${n.entry.id}`}
            x1={GRAPH_CENTER.x}
            y1={GRAPH_CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke="var(--color-border)"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}

        {/* Nodes */}
        {layout.map((n) => {
          // Use the full 5-digit id pad for the node label so the
          // visible text stays consistent with the <title> tooltip
          // and with Raw Library / Inbox (review nit #12). 5 digits
          // is cramped inside an 18 px circle; we compensate with
          // a smaller font for the node text.
          const label = `#${String(n.entry.id).padStart(ID_PAD_WIDTH, "0")}`;
          return (
            <g
              key={n.entry.id}
              className="cursor-pointer"
              onClick={() => onNodeClick(n.entry)}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={NODE_RADIUS}
                fill={n.color}
                opacity={0.85}
              />
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                fontSize="8"
                fontFamily="monospace"
                fill="white"
                pointerEvents="none"
              >
                {label}
              </text>
              <title>
                {`${label} ${n.entry.source} / ${n.entry.slug}`}
              </title>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="pointer-events-none absolute right-4 top-4 rounded-md border border-border bg-background/90 p-3 backdrop-blur">
        <div className="mb-1.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          <Network className="size-3" />
          Sources
        </div>
        <ul className="space-y-1">
          {legend.map(([source, count]) => (
            <li
              key={source}
              className="flex items-center gap-2 text-caption text-foreground/90"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: SOURCE_COLORS[source] ?? DEFAULT_COLOR }}
              />
              <span className="font-mono">{source}</span>
              <span className="text-muted-foreground">·</span>
              <span>{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GraphEmpty() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <Network className="mx-auto mb-2 size-8 opacity-30" />
        <p className="text-body text-muted-foreground">
          Your cognitive network is empty. Ingest a raw entry to see the
          first node appear.
        </p>
      </div>
    </div>
  );
}

function GraphError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div
        className="max-w-md rounded-md border px-4 py-3 text-caption"
        style={{
          borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
          backgroundColor:
            "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        Failed to load graph data: {message}
      </div>
    </div>
  );
}
