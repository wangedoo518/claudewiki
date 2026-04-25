import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { triggerCleanup } from "@/api/wiki/repository";
import type { CleanupResponse } from "@/api/wiki/types";
import { Button } from "@/components/ui/button";

export function CleanupPage() {
  const queryClient = useQueryClient();
  const [latest, setLatest] = useState<CleanupResponse | null>(null);
  const cleanupMutation = useMutation({
    mutationFn: (apply: boolean) => triggerCleanup(apply),
    onSuccess: (data) => {
      setLatest(data);
      void queryClient.invalidateQueries({ queryKey: ["wiki", "patrol"] });
      void queryClient.invalidateQueries({ queryKey: ["wiki", "inbox"] });
    },
  });

  const isRunning = cleanupMutation.isPending;
  const proposals = latest?.cleanup_proposals ?? [];
  const summary = latest?.summary;

  return (
    <div className="ds-canvas min-h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="rounded-2xl border border-border/60 bg-background/75 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Phase 4 cleanup
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Cleanup proposals
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Run wiki patrol, inspect cleanup proposals, then apply them as
                idempotent Inbox review tasks. Preview never writes; apply only
                persists the patrol report and review queue.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                disabled={isRunning}
                onClick={() => cleanupMutation.mutate(false)}
              >
                {isRunning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                Preview
              </Button>
              <Button
                disabled={isRunning}
                onClick={() => cleanupMutation.mutate(true)}
              >
                {isRunning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
                Apply to Inbox
              </Button>
            </div>
          </div>
        </header>

        {cleanupMutation.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
            {cleanupMutation.error instanceof Error
              ? cleanupMutation.error.message
              : String(cleanupMutation.error)}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Orphans" value={summary?.orphans} />
          <Metric label="Stale" value={summary?.stale} />
          <Metric label="Oversized" value={summary?.oversized} />
          <Metric label="Inbox created" value={latest?.inbox_created} />
        </section>

        <section className="rounded-2xl border border-border/60 bg-background/75 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Proposed cleanup queue
              </h2>
              <p className="text-xs text-muted-foreground">
                {latest
                  ? `${proposals.length} proposal(s), checked at ${latest.checked_at}`
                  : "Run preview to generate proposals."}
              </p>
            </div>
            {latest && (
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                {latest.applied ? "Applied" : "Preview only"}
              </span>
            )}
          </div>

          {proposals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              {latest
                ? "No cleanup proposals found."
                : "No run yet. Preview is the safe first move."}
            </div>
          ) : (
            <div className="grid gap-2">
              {proposals.map((proposal) => (
                <article
                  key={`${proposal.issue_kind}-${proposal.page_slug}`}
                  className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
                      {proposal.issue_kind}
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">
                      {proposal.title}
                    </span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {proposal.page_slug}
                    </code>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {proposal.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Suggested: {proposal.suggested_action}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/75 px-4 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">
        {value ?? "-"}
      </div>
    </div>
  );
}
