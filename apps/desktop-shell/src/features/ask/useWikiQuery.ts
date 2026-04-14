/**
 * useWikiQuery — hook for POST /api/wiki/query SSE consumption.
 * Per technical-design.md §2.2.
 *
 * SSE event sequence:
 *   event: skill  data: { type: "query_chunk", delta, source_refs }
 *   event: skill  data: { type: "query_done" }
 */

import { useCallback, useRef, useState } from "react";
import type { QuerySource } from "@/features/ingest/types";

interface WikiQueryState {
  isQuerying: boolean;
  question: string;
  answer: string;
  sources: QuerySource[];
  error: string | null;
}

const INITIAL_STATE: WikiQueryState = {
  isQuerying: false,
  question: "",
  answer: "",
  sources: [],
  error: null,
};

export function useWikiQuery() {
  const [state, setState] = useState<WikiQueryState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const queryWiki = useCallback(async (question: string) => {
    // Abort any previous in-flight query.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isQuerying: true,
      question,
      answer: "",
      sources: [],
      error: null,
    });

    try {
      const { getDesktopApiBase } = await import("@/lib/desktop/bootstrap");
      const base = await getDesktopApiBase();

      const response = await fetch(`${base}/api/wiki/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_sources: 5 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`/query failed (${response.status}): ${errBody}`);
      }

      if (!response.body) {
        throw new Error("/query response has no body");
      }

      // Parse SSE stream (same pattern as api/client.ts subscribeToSessionEvents).
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last incomplete line in the buffer.
        buffer = lines.pop() ?? "";

        let dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            dataLines.push(line.slice(6));
          } else if (line === "" && dataLines.length > 0) {
            // End of event block — parse accumulated data.
            const jsonStr = dataLines.join("\n");
            dataLines = [];
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === "query_chunk" && event.delta) {
                accumulatedAnswer += event.delta;
                setState((prev) => ({
                  ...prev,
                  answer: accumulatedAnswer,
                }));
              } else if (event.type === "query_done") {
                if (event.sources) {
                  setState((prev) => ({
                    ...prev,
                    sources: event.sources,
                  }));
                }
              }
            } catch {
              // Ignore malformed JSON lines.
            }
          }
        }
      }

      setState((prev) => ({ ...prev, isQuerying: false }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        isQuerying: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, queryWiki, reset };
}
