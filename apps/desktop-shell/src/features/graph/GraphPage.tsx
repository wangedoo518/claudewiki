/**
 * Graph · 知识图谱 — Rowboat 风格力导向可视化
 *
 * 点阵画布 + 毛玻璃节点 + 语义化配色 + 流光边线。
 * 图例和统计已内置于 ForceGraph 组件的浮动面板中，
 * 不再需要右侧 sidebar。
 */

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Network } from "lucide-react";
import { getWikiGraph, listRawEntries } from "@/features/ingest/persist";
import { ForceGraph } from "./ForceGraph";
import { useSettingsStore } from "@/state/settings-store";
import { useWikiTabStore } from "@/state/wiki-tab-store";

export function GraphPage() {
  const navigate = useNavigate();

  const rawQuery = useQuery({
    queryKey: ["wiki", "raw", "list"] as const,
    queryFn: () => listRawEntries(),
    staleTime: 30_000,
  });

  const graphQuery = useQuery({
    queryKey: ["wiki", "graph"] as const,
    queryFn: () => getWikiGraph(),
    staleTime: 30_000,
  });

  const entries = (rawQuery.data?.entries ?? []).filter(e => e.byte_size >= 200);
  const graphData = graphQuery.data;
  const isLoading = rawQuery.isLoading || graphQuery.isLoading;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Hero */}
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <h1
          className="text-foreground"
          style={{ fontSize: 18, fontWeight: 600 }}
        >
          知识图谱
        </h1>
        <p className="mt-1 text-muted-foreground/60" style={{ fontSize: 11 }}>
          力导向知识图谱 · 拖拽探索你的认知网络
        </p>
      </div>

      {/* Body: Full-bleed force graph */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-caption text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            加载中…
          </div>
        ) : rawQuery.error ? (
          <GraphError message={(rawQuery.error as Error).message} />
        ) : !graphData || (entries.length === 0 && graphData.nodes.length === 0) ? (
          <GraphEmpty />
        ) : (
          <ForceGraph
            graphData={graphData}
            rawEntries={entries}
            onClickConcept={(slug) => {
              // v2: open in Wiki Tab instead of navigating.
              useSettingsStore.getState().setAppMode("wiki");
              useWikiTabStore.getState().openTab({
                id: slug,
                kind: "article",
                slug,
                title: slug,
                closable: true,
              });
              navigate("/wiki");
            }}
            onClickRaw={() => navigate("/raw")}
          />
        )}
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
          你的认知网络还是空的。入库一条素材，第一个节点就会出现。
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
          backgroundColor: "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        加载图谱数据失败：{message}
      </div>
    </div>
  );
}
