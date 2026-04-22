/**
 * SkillCard — pastel action card used on the Dashboard home hero grid.
 *
 * v2 kit source: ui_kits/desktop-shell-v2/Home.jsx:4-12 (`SkillCard`)
 * DS class contract: `.ds-skill-card .ds-skill-c1..c5` (see
 * apps/desktop-shell/src/globals.css DS1.1 block).
 *
 * Props are either `href` (renders `<Link>`) OR `onClick` (renders
 * `<button>`). One of the two MUST be provided — the component
 * always behaves as an actionable element.
 *
 * Migrated from DashboardPage.tsx:367-392 inline definition (DS1.7-B-α).
 */

import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type SkillCardVariant = "c1" | "c2" | "c3" | "c4" | "c5";

export interface SkillCardProps {
  /** Pastel background variant — maps to `.ds-skill-c1..c5` in globals.css. */
  variant: SkillCardVariant;
  /** Serif-weight card title (1 line). */
  title: string;
  /** Muted sub-copy (1-2 lines). */
  sub: string;
  /** Lucide icon rendered at `size-5` in the upper-left corner. */
  icon: LucideIcon;
  /** Router destination. Uses react-router `<Link>`. Mutually exclusive with `onClick`. */
  href?: string;
  /** Click handler for button-style consumers. Mutually exclusive with `href`. */
  onClick?: () => void;
}

/**
 * Renders one of the Dashboard hero cards. Identical DOM to the pre-
 * DS1.7 inline SkillCard; only the definition location moved.
 */
export const SkillCard = forwardRef<HTMLElement, SkillCardProps>(function SkillCard(
  { variant, title, sub, icon: Icon, href, onClick },
  _ref,
) {
  const inner = (
    <>
      <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      <div className="ds-skill-title">{title}</div>
      <div className="ds-skill-sub">{sub}</div>
      <span className="ds-skill-ill">
        <ArrowRight className="size-5" strokeWidth={1.5} />
      </span>
    </>
  );

  const className = `ds-skill-card ds-skill-${variant} animate-fade-in`;

  if (href) {
    return (
      <Link to={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
});
