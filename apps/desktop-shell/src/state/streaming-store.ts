import { create } from "zustand";

/**
 * Streaming state — holds only the accumulated text from TextDelta SSE
 * events. The "is the session running?" question is answered by
 * `session.turn_state === "running"` read from React Query cache, NOT
 * by a separate boolean in this store.
 *
 * Rationale: having both `isStreaming` and `session.turn_state` led to
 * drift (e.g., isStreaming flipped true/false per Message event while
 * turn_state stayed Running, causing UI flicker). See audit-lessons L-07.
 */
export interface StreamingState {
  /** Accumulated text content from TextDelta SSE events. */
  streamingContent: string;
  /** Whether the session is in Plan Mode (read-only exploration). */
  isPlanMode: boolean;
  /** Append a text chunk to the streaming buffer. */
  appendStreamingContent: (chunk: string) => void;
  /** Clear the streaming buffer without changing other state. */
  clearStreamingContent: () => void;
  /** Toggle plan mode state. */
  setPlanMode: (value: boolean) => void;
}

export const useStreamingStore = create<StreamingState>((set) => ({
  streamingContent: "",
  isPlanMode: false,
  appendStreamingContent: (chunk) =>
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    })),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setPlanMode: (value) => set({ isPlanMode: value }),
}));
