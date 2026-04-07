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
 *
 * ── Performance note ─────────────────────────────────────────────
 * `appendStreamingContent` batches writes via `requestAnimationFrame`
 * to avoid triggering a Zustand subscriber re-render on every SSE
 * `text_delta` event. At high token rates (100+/s), per-event updates
 * caused noticeable jank. The RAF batch coalesces all chunks received
 * within a single frame (~16.67ms) into one `set` call, capping UI
 * updates at ~60Hz regardless of token arrival rate.
 */
export interface StreamingState {
  /** Accumulated text content from TextDelta SSE events. */
  streamingContent: string;
  /** Whether the session is in Plan Mode (read-only exploration). */
  isPlanMode: boolean;
  /** Append a text chunk to the streaming buffer (batched via RAF). */
  appendStreamingContent: (chunk: string) => void;
  /** Clear the streaming buffer without changing other state. */
  clearStreamingContent: () => void;
  /** Toggle plan mode state. */
  setPlanMode: (value: boolean) => void;
}

// ── RAF batching ────────────────────────────────────────────────────
// Chunks received within a single animation frame are accumulated in
// this buffer and flushed once per frame. This is module-level state
// because RAF scheduling is global to the browser.
let pendingBuffer = "";
let rafHandle: number | null = null;

/** Test-only: synchronously flush pending chunks. */
function flushPendingChunks() {
  if (pendingBuffer.length === 0) return;
  const chunk = pendingBuffer;
  pendingBuffer = "";
  useStreamingStore.setState((state) => ({
    streamingContent: state.streamingContent + chunk,
  }));
  rafHandle = null;
}

/**
 * Schedule a flush on the next animation frame. Safe to call from any
 * context — if RAF isn't available (SSR / test), falls back to setTimeout.
 */
function scheduleFlush() {
  if (rafHandle !== null) return;
  if (typeof requestAnimationFrame === "function") {
    rafHandle = requestAnimationFrame(() => flushPendingChunks());
  } else {
    // Fallback for non-browser environments (tests, SSR).
    rafHandle = setTimeout(flushPendingChunks, 16) as unknown as number;
  }
}

export const useStreamingStore = create<StreamingState>((set) => ({
  streamingContent: "",
  isPlanMode: false,
  appendStreamingContent: (chunk) => {
    pendingBuffer += chunk;
    scheduleFlush();
  },
  clearStreamingContent: () => {
    // Clearing must be synchronous so an incoming message arrival
    // immediately blanks the streaming buffer (prevents the last
    // chunk from appearing as a ghost after the complete message).
    pendingBuffer = "";
    if (rafHandle !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafHandle);
      } else {
        clearTimeout(rafHandle as unknown as ReturnType<typeof setTimeout>);
      }
      rafHandle = null;
    }
    set({ streamingContent: "" });
  },
  setPlanMode: (value) => set({ isPlanMode: value }),
}));
