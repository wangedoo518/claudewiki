/**
 * Floating scroll-to-bottom button — appears when user scrolls up in the
 * conversation, disappears when at bottom.  Reads state from the
 * ConversationScroller's StickToBottom context.
 */

import { useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useStickToBottomContext } from "./ConversationScroller";

export function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleClick = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      className="absolute bottom-4 left-1/2 z-10 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--deeptutor-shadow-md,0_4px_12px_-2px_rgba(0,0,0,0.1))] transition-all hover:bg-accent hover:text-foreground"
      onClick={handleClick}
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="size-4" />
    </button>
  );
}
