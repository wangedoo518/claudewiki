/**
 * Conversation scroll container — wraps message content in use-stick-to-bottom
 * for automatic scroll-to-bottom during streaming with user-override support.
 *
 * Replaces the previous manual overflow-y-auto + @tanstack/react-virtual approach.
 */

import type { ReactNode } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";

// Re-export for sibling components (ScrollToBottomButton, ToolActionsGroup)
export { useStickToBottomContext } from "use-stick-to-bottom";

interface ConversationScrollerProps {
  children: ReactNode;
  className?: string;
}

export function ConversationScroller({
  children,
  className,
}: ConversationScrollerProps) {
  return (
    <StickToBottom
      className={cn("relative flex-1 overflow-y-hidden", className)}
      initial="smooth"
      resize="instant"
      role="log"
    >
      <StickToBottom.Content className="flex flex-col gap-1 px-4 py-4">
        {children}
      </StickToBottom.Content>
    </StickToBottom>
  );
}
