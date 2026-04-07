import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, FileText, X } from "lucide-react";
import { listWorkspaceSkills } from "./api/client";

interface WorkspaceSkillsPanelProps {
  projectPath?: string;
}

/**
 * Compact display showing workspace skills loaded for the current project.
 *
 * Skills are markdown files under `.claude/skills/` that the user writes
 * to teach the agent specialized behaviors. The agentic loop includes
 * just the name + first paragraph in the system prompt; the actual
 * content is loaded on demand by the Skill tool.
 *
 * Renders a small badge with the count, expanding to a full list on click.
 */
export function WorkspaceSkillsPanel({ projectPath }: WorkspaceSkillsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const skillsQuery = useQuery({
    queryKey: ["workspace-skills", projectPath ?? ""],
    queryFn: () => {
      if (!projectPath) return { count: 0, skills: [] };
      return listWorkspaceSkills(projectPath);
    },
    enabled: !!projectPath,
    staleTime: 30_000, // skills change rarely; cache for 30 seconds
  });

  const count = skillsQuery.data?.count ?? 0;

  if (!projectPath) return null;
  if (count === 0 && !skillsQuery.isLoading) return null;

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 rounded-full px-2 py-0.5 text-caption transition-colors hover:bg-muted/50"
        style={{ color: "var(--claude-blue)" }}
        onClick={() => setExpanded(true)}
        title={`${count} workspace skill${count === 1 ? "" : "s"} loaded`}
      >
        <Sparkles className="size-2.5" />
        <span className="font-medium">{count} skill{count === 1 ? "" : "s"}</span>
      </button>

      {/* Expanded popover */}
      {expanded && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 pt-20"
          onClick={() => setExpanded(false)}
        >
          <div
            className="max-h-[70vh] w-[480px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles
                  className="size-4"
                  style={{ color: "var(--claude-blue)" }}
                />
                <span className="text-subhead font-semibold">
                  Workspace Skills
                </span>
                <span className="text-caption text-muted-foreground">
                  ({count})
                </span>
              </div>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setExpanded(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
              <p className="mb-3 text-caption text-muted-foreground">
                Loaded from <code className="font-mono">{projectPath}/.claude/skills/</code>.
                The agent sees these skill names + descriptions in its
                system prompt and can invoke them via the Skill tool.
              </p>
              {skillsQuery.isLoading && (
                <div className="text-label text-muted-foreground">Loading…</div>
              )}
              {skillsQuery.error && (
                <div className="text-label" style={{ color: "var(--color-error)" }}>
                  Failed to load skills.
                </div>
              )}
              <div className="space-y-2">
                {skillsQuery.data?.skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="rounded-md border border-border/50 bg-muted/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-3 text-muted-foreground" />
                      <span className="text-body-sm font-semibold">
                        {skill.name}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="mt-1 ml-5 text-caption text-foreground/70">
                        {skill.description}
                      </p>
                    )}
                    <p className="mt-1 ml-5 truncate font-mono text-nano text-muted-foreground/60">
                      {skill.source}
                    </p>
                  </div>
                ))}
              </div>
              {skillsQuery.data && skillsQuery.data.count === 0 && (
                <div className="py-6 text-center text-label text-muted-foreground">
                  No skills found. Create files at
                  <br />
                  <code className="font-mono">.claude/skills/*.md</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
