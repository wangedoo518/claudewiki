/**
 * Message list — renders conversation messages as flex children inside the
 * ConversationScroller.  Replaces the previous @tanstack/react-virtual
 * approach with simple DOM rendering + use-stick-to-bottom auto-scroll.
 *
 * Key behavior:
 *   - Groups consecutive tool_use/tool_result messages into a single
 *     <ToolActionsGroup> node for collapse/lazy-render.
 *   - Appends a <StreamingMessage> at the tail when the turn is active.
 */

import { memo, useMemo } from "react";
import { Message } from "./Message";
import { ToolActionsGroup } from "./ToolActionsGroup";
import { StreamingMessage } from "./StreamingMessage";
import type { ConversationMessage } from "@/features/common/message-types";

interface MessageListProps {
  messages: ConversationMessage[];
  streamingContent?: string;
  isStreaming?: boolean;
}

interface MessageGroup {
  kind: "single";
  message: ConversationMessage;
}

interface ToolGroup {
  kind: "tool-group";
  messages: ConversationMessage[];
  key: string;
}

type RenderGroup = MessageGroup | ToolGroup;

/** Group consecutive tool_use/tool_result messages together. */
function groupMessages(messages: ConversationMessage[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  let toolBuf: ConversationMessage[] = [];

  const flushToolBuf = () => {
    if (toolBuf.length > 0) {
      groups.push({
        kind: "tool-group",
        messages: [...toolBuf],
        key: toolBuf.map((m) => m.id).join("+"),
      });
      toolBuf = [];
    }
  };

  for (const msg of messages) {
    if (msg.type === "tool_use" || msg.type === "tool_result") {
      toolBuf.push(msg);
    } else {
      flushToolBuf();
      groups.push({ kind: "single", message: msg });
    }
  }
  flushToolBuf();

  return groups;
}

export const MessageList = memo(function MessageList({
  messages,
  streamingContent,
  isStreaming = false,
}: MessageListProps) {
  const groups = useMemo(() => groupMessages(messages), [messages]);

  return (
    <>
      {groups.map((group) => {
        if (group.kind === "tool-group") {
          return (
            <ToolActionsGroup
              key={group.key}
              messages={group.messages}
              isStreaming={isStreaming && group === groups[groups.length - 1]}
            />
          );
        }
        return <Message key={group.message.id} message={group.message} />;
      })}

      {isStreaming && (
        <StreamingMessage content={streamingContent ?? ""} />
      )}
    </>
  );
});
