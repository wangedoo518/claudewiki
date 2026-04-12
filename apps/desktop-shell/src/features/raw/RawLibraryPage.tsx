/**
 * Raw Library · 不可变事实层 (wireframes.html §03 + canonical §10)
 *
 * S1 implementation: a single split-pane page with three regions:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ── PAGE HEAD ── (icon + h1 + sub)                           │
 *   ├────────────────────┬─────────────────────────────────────────┤
 *   │  LEFT (320px)      │  RIGHT (flex)                           │
 *   │   ┌──────────────┐ │  ┌──────────────────────────────────┐   │
 *   │   │  PASTE FORM  │ │  │   Selected entry detail OR       │   │
 *   │   │  ───────────  │ │  │   "Select an entry" placeholder  │   │
 *   │   │  · Title      │ │  │                                   │   │
 *   │   │  · Body       │ │  │   Frontmatter strip + raw body    │   │
 *   │   │  · [Ingest]   │ │  │   (renders as monospace)          │   │
 *   │   │ ───────────   │ │  │                                   │   │
 *   │   │  Or paste URL │ │  │                                   │   │
 *   │   └──────────────┘ │  └──────────────────────────────────┘   │
 *   │   ┌──────────────┐ │                                         │
 *   │   │ ENTRY LIST   │ │                                         │
 *   │   │ #00001 …     │ │                                         │
 *   │   │ #00002 …     │ │                                         │
 *   │   └──────────────┘ │                                         │
 *   └────────────────────┴─────────────────────────────────────────┘
 *
 * Wires:
 *   - GET  /api/wiki/raw           → entry list (React Query, 30s stale)
 *   - GET  /api/wiki/raw/:id       → selected detail (RQ, lazy)
 *   - POST /api/wiki/raw           → ingest text or URL
 *
 * Per canonical:
 *   - The list is read-only ("immutable facts layer")
 *   - Schema CLAUDE.md §Layer contract: never mutate raw/ files
 *   - The two adapters here (text + url) are the S1 minimum.
 *     Voice / image / PDF / PPT / video adapters land in S6.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Link2, Copy, Check } from "lucide-react";
import { listRawEntries, getRawEntry } from "@/features/ingest/persist";
import { ingestText } from "@/features/ingest/adapters/text";
import { ingestUrl } from "@/features/ingest/adapters/url";
import type { RawEntry } from "@/features/ingest/types";

const rawKeys = {
  list: () => ["wiki", "raw", "list"] as const,
  detail: (id: number) => ["wiki", "raw", "detail", id] as const,
};

/** Translate known source labels to Chinese */
function translateSource(source: string): string {
  const map: Record<string, string> = {
    "wechat-url": "微信链接",
    "wechat-text": "微信消息",
    "paste-text": "粘贴文本",
    "paste-url": "粘贴链接",
  };
  return map[source] ?? source;
}

export function RawLibraryPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: rawKeys.list(),
    queryFn: () => listRawEntries(),
    staleTime: 30_000,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Page head ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h1
            className="text-foreground"
            style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-serif, Lora, serif)" }}
          >
            原始素材库
          </h1>
          <p className="mt-1 text-muted-foreground/60" style={{ fontSize: 11 }}>
            微信转发、粘贴文本、链接 -- 全部以 <code>~/.clawwiki/raw/</code> 下的 markdown 落盘
          </p>
        </div>
        <div className="text-muted-foreground/40" style={{ fontSize: 11 }}>
          {listQuery.data?.entries.length ?? 0} 条
        </div>
      </div>

      {/* ── Body: split pane ────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT — paste form + entry list */}
        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-border/50">
          <PasteForm
            onIngested={(entry) => {
              setSelectedId(entry.id);
            }}
          />
          <EntryList
            entries={listQuery.data?.entries ?? []}
            isLoading={listQuery.isLoading}
            error={listQuery.error}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </aside>

        {/* RIGHT — detail */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedId === null ? (
            <DetailPlaceholder />
          ) : (
            <DetailView id={selectedId} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Paste form ───────────────────────────────────────────────── */

interface PasteFormProps {
  onIngested: (entry: RawEntry) => void;
}

function PasteForm({ onIngested }: PasteFormProps) {
  const [mode, setMode] = useState<"text" | "url">("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const ingestMutation = useMutation({
    mutationFn: async () => {
      if (mode === "text") {
        if (!body.trim()) {
          throw new Error("内容不能为空");
        }
        return ingestText({ title, body });
      }
      if (!url.trim()) {
        throw new Error("链接不能为空");
      }
      return ingestUrl({ url, title });
    },
    onSuccess: (entry) => {
      void queryClient.invalidateQueries({ queryKey: rawKeys.list() });
      setTitle("");
      setBody("");
      setUrl("");
      setErrorMessage(null);
      onIngested(entry);
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <div className="border-b border-border/50 px-3 py-3">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className={
            "flex-1 rounded-md border px-2 py-1 text-caption font-medium transition-colors " +
            (mode === "text"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent")
          }
          onClick={() => setMode("text")}
        >
          <FileText className="mr-1 inline size-3" />
          文本
        </button>
        <button
          type="button"
          className={
            "flex-1 rounded-md border px-2 py-1 text-caption font-medium transition-colors " +
            (mode === "url"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent")
          }
          onClick={() => setMode("url")}
        >
          <Link2 className="mr-1 inline size-3" />
          链接
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题（可选）"
        className="mb-1.5 w-full rounded-md border border-input bg-background px-2 py-1 text-body-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
      />

      {mode === "text" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="粘贴 markdown 或文本..."
          rows={5}
          className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 font-mono text-label text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
      ) : (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-body-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
      )}

      {errorMessage && (
        <div
          className="mt-1.5 rounded-md border px-2 py-1 text-caption"
          style={{
            borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-error) 5%, transparent)",
            color: "var(--color-error)",
          }}
        >
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        onClick={() => ingestMutation.mutate()}
        disabled={ingestMutation.isPending}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {ingestMutation.isPending && <Loader2 className="size-3 animate-spin" />}
        {ingestMutation.isPending ? "入库中…" : "入库"}
      </button>
    </div>
  );
}

/* ─── Entry list ───────────────────────────────────────────────── */

interface EntryListProps {
  entries: RawEntry[];
  isLoading: boolean;
  error: Error | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function EntryList({
  entries,
  isLoading,
  error,
  selectedId,
  onSelect,
}: EntryListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 px-3 py-6 text-center text-caption text-muted-foreground">
        <Loader2 className="mx-auto mb-1.5 size-4 animate-spin" />
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="m-3 rounded-md border px-2 py-2 text-caption"
        style={{
          borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        加载失败：{error.message}
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 px-3 py-6 text-center text-caption text-muted-foreground">
        暂无条目。在上方粘贴内容，开始构建你的外脑。
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-border/30 overflow-y-auto">
      {entries.map((entry) => {
        const isActive = entry.id === selectedId;
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className={
                "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/30 " +
                (isActive
                  ? "border-l-[3px] border-l-primary"
                  : "border-l-[3px] border-l-transparent")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-muted-foreground/40" style={{ fontSize: 11 }}>
                  #{String(entry.id).padStart(5, "0")}
                </span>
                <span className="text-muted-foreground/50" style={{ fontSize: 11 }}>
                  {translateSource(entry.source)}
                </span>
              </div>
              <div
                className="mt-0.5 truncate text-foreground"
                style={{ fontSize: 13, fontWeight: isActive ? 500 : 400 }}
              >
                {entry.slug}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-muted-foreground/40" style={{ fontSize: 11 }}>
                <span>{entry.date}</span>
                <span>·</span>
                <span>{entry.byte_size} B</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Detail placeholder ───────────────────────────────────────── */

function DetailPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="mb-3 text-2xl opacity-20">📄</div>
        <p className="text-muted-foreground/60" style={{ fontSize: 13 }}>
          选择左侧条目查看，或粘贴新内容入库。
        </p>
        <p className="mt-1.5 text-muted-foreground/40" style={{ fontSize: 11 }}>
          文件保存在 <code>~/.clawwiki/raw/</code> 下，入库后不可修改。
        </p>
      </div>
    </div>
  );
}

/* ─── Detail view ──────────────────────────────────────────────── */

function DetailView({ id }: { id: number }) {
  const detailQuery = useQuery({
    queryKey: rawKeys.detail(id),
    queryFn: () => getRawEntry(id),
    staleTime: 60_000,
  });

  const [copied, setCopied] = useState(false);

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-caption text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        加载中…
      </div>
    );
  }
  if (detailQuery.error) {
    return (
      <div
        className="m-6 rounded-md border px-3 py-2 text-body-sm"
        style={{
          borderColor: "color-mix(in srgb, var(--color-error) 30%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--color-error) 5%, transparent)",
          color: "var(--color-error)",
        }}
      >
        加载条目 #{id} 失败：{detailQuery.error.message}
      </div>
    );
  }
  if (!detailQuery.data) return null;

  const { entry, body } = detailQuery.data;

  const handleCopy = () => {
    void navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Frontmatter strip */}
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-muted-foreground/40" style={{ fontSize: 11 }}>
              <span className="font-mono">
                #{String(entry.id).padStart(5, "0")}
              </span>
              <span>
                {translateSource(entry.source)}
              </span>
            </div>
            <h2
              className="mt-1.5 truncate text-foreground"
              style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-serif, Lora, serif)" }}
            >
              {entry.slug}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground/40" style={{ fontSize: 11 }}>
              <span>{entry.filename}</span>
              <span>{entry.ingested_at}</span>
              <span>{entry.byte_size} 字节</span>
            </div>
            {entry.source_url && (
              <a
                href={entry.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-caption text-primary underline decoration-primary/40 hover:decoration-primary"
              >
                {entry.source_url}
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-caption text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "已复制" : "复制内容"}
          </button>
        </div>
      </div>

      {/* Body */}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap px-6 py-5 font-mono text-foreground/90" style={{ fontSize: 14, lineHeight: 1.6 }}>
        {body}
      </pre>
    </div>
  );
}
