export type MessageRole = "user" | "assistant" | "system";
export type MessageType =
  | "text"
  | "tool_use"
  | "tool_result"
  | "todo"
  | "error";

export interface ToolUseData {
  /** Unique tool_use id for precise matching with results. */
  toolUseId?: string;
  toolName: string;
  toolInput: string;
}

export interface ToolResultData {
  /** References the ToolUseData.toolUseId. Used for accurate result matching. */
  toolUseId?: string;
  toolName: string;
  output: string;
  isError: boolean;
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  timestamp: number;
  toolUse?: ToolUseData;
  toolResult?: ToolResultData;
}
