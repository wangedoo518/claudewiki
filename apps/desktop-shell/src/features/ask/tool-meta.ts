/**
 * Tool metadata registry — maps tool names to icons, labels, and colors.
 *
 * Extracted from Message.tsx so it can be shared by Message, ToolActionsGroup,
 * and StreamingMessage without circular imports.
 */

import {
  Terminal as TerminalIcon,
  Search,
  Globe,
  CheckCircle2,
  Eye,
  FileText,
  FolderSearch,
  Brain,
  Pencil,
  FileCode,
  BookOpen,
} from "lucide-react";

export function getToolMeta(toolName: string): {
  icon: typeof TerminalIcon;
  label: string;
  color: string;
} {
  const lower = toolName.toLowerCase();

  if (lower === "bash" || lower.includes("shell") || lower === "powershell")
    return { icon: TerminalIcon, label: "Bash", color: "var(--color-terminal-tool)" };
  if (lower === "read" || lower === "readfile" || lower === "read_file")
    return { icon: Eye, label: "Read", color: "var(--claude-blue, var(--deeptutor-purple))" };
  if (lower === "edit" || lower === "editfile" || lower === "edit_file")
    return { icon: Pencil, label: "Edit", color: "var(--deeptutor-primary, var(--claude-orange))" };
  if (lower === "write" || lower === "writefile" || lower === "write_file")
    return { icon: FileCode, label: "Write", color: "var(--deeptutor-primary, var(--claude-orange))" };
  if (lower === "glob" || lower === "glob_search")
    return { icon: FolderSearch, label: "Glob", color: "var(--color-terminal-tool)" };
  if (lower === "grep" || lower === "grep_search")
    return { icon: Search, label: "Grep", color: "var(--color-terminal-tool)" };
  if (lower.includes("webfetch") || lower.includes("web_fetch"))
    return { icon: Globe, label: "WebFetch", color: "var(--claude-blue, var(--deeptutor-purple))" };
  if (lower.includes("websearch") || lower.includes("web_search"))
    return { icon: Globe, label: "WebSearch", color: "var(--claude-blue, var(--deeptutor-purple))" };
  if (lower === "agent")
    return { icon: Brain, label: "Agent", color: "var(--deeptutor-purple, var(--agent-purple))" };
  if (lower.includes("notebook"))
    return { icon: BookOpen, label: "Notebook", color: "var(--claude-blue, var(--deeptutor-purple))" };
  if (lower.includes("todowrite") || lower.includes("todo"))
    return { icon: CheckCircle2, label: "TodoWrite", color: "var(--color-terminal-tool)" };
  if (lower.includes("skill"))
    return { icon: FileText, label: "Skill", color: "var(--deeptutor-primary, var(--agent-cyan))" };

  return { icon: TerminalIcon, label: toolName, color: "var(--color-terminal-tool)" };
}

/** Returns true when the tool is a "context-gathering" type (Read, Grep, Glob). */
export function isContextTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return (
    lower === "read" || lower === "readfile" || lower === "read_file" ||
    lower === "grep" || lower === "grep_search" ||
    lower === "glob" || lower === "glob_search"
  );
}
