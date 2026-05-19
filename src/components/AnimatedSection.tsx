import type { ReactNode } from 'react';

/**
 * AnimatedSection — pure-CSS entrance animation. Renders correctly on SSR + client,
 * auto-honors prefers-reduced-motion via the .anim-fade-up class media query in globals.css.
 *
 * The animation plays on page load; by the time the user scrolls past the fold,
 * the section is already settled. This is intentionally simple (no IntersectionObserver
 * dance), and it sidesteps SSR hydration issues that arise from Motion-library `initial`
 * props.
 */
export function AnimatedSection({
  children,
  delay = 0,
  className = '',
  as = 'section',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  const Tag = as;
  return (
    <Tag
      className={`anim-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
