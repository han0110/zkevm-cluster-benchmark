/*
 * Defers mounting a heavy child until near the viewport so a long stack keeps only its visible members
 * live. A reserved-height placeholder holds the scroll position while a child is unmounted, and a
 * generous root margin mounts it shortly before it scrolls into view so the swap is unseen. A child can
 * be pinned to stay mounted regardless, for when something depends on it always existing.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazyMountProps {
  // Height reserved for the placeholder while the child is unmounted, so scrolling stays stable.
  height: number;
  // How far outside the viewport the child mounts and unmounts, as a CSS margin around the root.
  rootMargin?: string;
  // Keeps the child mounted at all times, bypassing the observer.
  pinned?: boolean;
  children: ReactNode;
}

export function LazyMount({ height, rootMargin = '600px 0px', pinned = false, children }: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(pinned);

  useEffect(() => {
    if (pinned) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (entry) setShown(entry.isIntersecting);
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pinned, rootMargin]);

  return (
    <div ref={ref} style={shown || pinned ? undefined : { minHeight: height }}>
      {shown || pinned ? children : null}
    </div>
  );
}
