/**
 * StreamingMessage — dedicated component for rendering the in-flight
 * (streaming) assistant response.
 *
 * States:
 *   1. No content yet → three-dot shimmer with "Thinking..." label
 *   2. Content arriving → markdown with blinking cursor ▍ + left accent bar
 *   3. Thinking content → collapsible <details> block
 *
 * Matches the new assistant message layout: full-width transparent bg,
 * ASSISTANT label, bottom border.
 */

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, ChevronRight, ChevronDown } from "lucide-react";

interface StreamingMessageProps {
  content: string;
  thinkingContent?: string;
  isComplete?: boolean;
}

export const StreamingMessage = memo(function StreamingMessage({
  content,
  thinkingContent,
  isComplete = false,
}: StreamingMessageProps) {
  if (!content && !thinkingContent) {
    return <ThinkingIndicator />;
  }

  return (
    <div className={`w-full border-b border-border/30 pb-4 ${isComplete ? "" : "ask-streaming-active"}`}>
      {/* ASSISTANT label with pulsing dot */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <div
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-label-claude)" }}
        >
          Assistant
        </div>
        {!isComplete && (
          <span
            className="inline-block size-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: "var(--deeptutor-primary, var(--claude-orange))" }}
          />
        )}
      </div>

      {/* Thinking content (collapsible) */}
      {thinkingContent && (
        <ThinkingBlock content={thinkingContent} isStreaming={!isComplete} />
      )}

      {/* Streaming text */}
      {content && (
        <div className="text-sm leading-relaxed text-foreground">
          <ReactMarkdown
            components={{
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
              },
              code({ className, children, ...props }) {
                return (
                  <code
                    className={className ?? "rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[13px] text-foreground"}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {/* Blinking block cursor */}
          {!isComplete && (
            <span className="ask-blink-cursor ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] bg-foreground/70" />
          )}
        </div>
      )}
    </div>
  );
});

/* ─── Thinking block (collapsible) ──────────────────────────────── */

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Brain className="size-3" style={{ color: "var(--deeptutor-purple, var(--agent-purple))" }} />
        <span className="font-medium">
          {isStreaming ? "Thinking..." : "Thought process"}
        </span>
        {isStreaming && (
          <span
            className="inline-block size-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: "var(--deeptutor-purple, var(--agent-purple))" }}
          />
        )}
      </button>
      {expanded && (
        <div className="ml-5 mt-1 border-l-2 border-border/30 pl-3">
          <pre className="whitespace-pre-wrap text-xs italic leading-relaxed text-muted-foreground">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Thinking indicator (shimmer dots) ──────────────────────────── */

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex items-center gap-1">
        <ShimmerDot delay={0} />
        <ShimmerDot delay={150} />
        <ShimmerDot delay={300} />
      </div>
      <span className="text-sm text-muted-foreground">Thinking...</span>
    </div>
  );
}

function ShimmerDot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block size-1.5 rounded-full animate-pulse"
      style={{
        backgroundColor: "var(--deeptutor-primary, var(--claude-orange))",
        animationDelay: `${delay}ms`,
      }}
    />
  );
}
