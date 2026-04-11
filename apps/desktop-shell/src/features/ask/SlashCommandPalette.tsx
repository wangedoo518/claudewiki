/**
 * SlashCommandPalette — minimal command palette triggered by typing "/"
 * at the start of the Composer input.
 *
 * Follows the CodePilot slash-command pattern with a simplified built-in
 * command set (no SDK skill discovery yet).
 */

import { memo, useCallback, useState, useEffect, useMemo } from "react";
import {
  Trash2,
  Plus,
  Download,
  Minimize2,
  FileSearch,
  type LucideIcon,
} from "lucide-react";

export interface SlashCommand {
  name: string;
  description: string;
  icon: LucideIcon;
  action: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/clear",   description: "清空对话历史",       icon: Trash2,     action: "clear" },
  { name: "/new",     description: "新建对话",           icon: Plus,       action: "new" },
  { name: "/export",  description: "导出为 Markdown",    icon: Download,   action: "export" },
  { name: "/compact", description: "总结并压缩历史",     icon: Minimize2,  action: "compact" },
  { name: "/plan",    description: "切换计划模式",       icon: FileSearch, action: "plan" },
];

interface SlashCommandPaletteProps {
  query: string;
  visible: boolean;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export const SlashCommandPalette = memo(function SlashCommandPalette({
  query,
  visible,
  onSelect,
  onClose,
}: SlashCommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
    );
  }, [query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) =>
          (prev - 1 + filtered.length) % filtered.length
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    if (visible) {
      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [visible, handleKeyDown]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[280px] animate-slide-up rounded-lg border border-border bg-popover py-1 shadow-[var(--deeptutor-shadow-md,0_4px_12px_-2px_rgba(0,0,0,0.1))]">
      <div className="px-2.5 py-1 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
        命令
      </div>
      {filtered.map((cmd, idx) => {
        const Icon = cmd.icon;
        const isActive = idx === selectedIndex;
        return (
          <button
            key={cmd.action}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors ${
              isActive
                ? "bg-[color:var(--deeptutor-primary-soft,var(--color-accent))] text-foreground"
                : "text-foreground hover:bg-accent/50"
            }`}
            onClick={() => onSelect(cmd)}
            onMouseEnter={() => setSelectedIndex(idx)}
          >
            <Icon
              className="size-3.5 shrink-0"
              style={{ color: isActive ? "var(--deeptutor-primary, var(--claude-orange))" : undefined }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium">{cmd.name}</div>
              <div className="text-caption text-muted-foreground">
                {cmd.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});
