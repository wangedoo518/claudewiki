/**
 * StreamingMessage — dedicated component for rendering the in-flight
 * (streaming) assistant response.  Separated from persisted messages
 * per the CodePilot StreamingMessage pattern.
 *
 * States:
 *   1. No content yet → three-dot shimmer with "Thinking..." label
 *   2. Content arriving → markdown with blinking cursor + left-border pulse
 */

import { memo } from "react";
import ReactMarkdown from "react-markdown";

interface StreamingMessageProps {
  content: string;
}

export const StreamingMessage = memo(function StreamingMessage({
  content,
}: StreamingMessageProps) {
  if (!content) {
    return <ThinkingIndicator />;
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/50 bg-[color:var(--color-msg-assistant-bg,var(--color-card))] shadow-[var(--deeptutor-shadow-sm,none)]">
      {/* Pulsing left border */}
      <div className="ask-streaming-border absolute left-0 top-0 h-full w-[3px] border-l-[3px] border-l-[color:var(--deeptutor-primary,var(--claude-orange))]" />

      <div className="py-2.5 pl-5 pr-4">
        <div
          className="ask-serif mb-1 text-caption font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-label-claude)" }}
        >
          Assistant
        </div>
        <div className="text-body leading-relaxed text-foreground">
          <ReactMarkdown
            components={{
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>;
              },
              code({ className, children, ...props }) {
                return (
                  <code
                    className={className ?? "rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-body-sm text-foreground"}
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
          {/* Blinking cursor */}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60" />
        </div>
      </div>
    </div>
  );
});

/* ─── Thinking indicator (shimmer dots) ──────────────────────────── */

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/50 px-4 py-3 shadow-[var(--deeptutor-shadow-sm,none)]">
      <div className="flex items-center gap-1">
        <ShimmerDot delay={0} />
        <ShimmerDot delay={150} />
        <ShimmerDot delay={300} />
      </div>
      <span className="text-body text-muted-foreground">Thinking...</span>
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
