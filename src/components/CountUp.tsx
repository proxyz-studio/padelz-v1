'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * CountUp — IntersectionObserver-driven count from 0 to target on first view.
 * SSR-safe (renders "00" on server, client takes over).
 * Honors prefers-reduced-motion by snapping to target immediately.
 */
export function CountUp({
  target,
  duration = 1200,
  pad = 2,
}: {
  target: number;
  duration?: number;
  pad?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (prefersReduce) {
      setValue(target);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        let raf = 0;
        const tick = (t: number) => {
          const elapsed = t - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setValue(Math.round(eased * target));
          if (progress < 1) {
            raf = requestAnimationFrame(tick);
          }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      },
      { threshold: 0.6 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {String(value).padStart(pad, '0')}
    </span>
  );
}
