/*
 * Page location trail above each view. Opens with a home link to the Overview then names each path
 * segment, the leading one by its view label and any trailing id by its own value, so a focused proof or
 * node reads as the last crumb. Every crumb but the last links to its path carrying the active run, and
 * the trail is derived from the path alone so it needs no per-page wiring.
 */

import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRunSearch } from '@/hooks/useRunSearch';
import { cx } from '@/utils/cx';
import { FOCUS_RING } from '@/utils/styles';
import { IconHome } from '@/components/common/icons';
import { Truncated } from '@/components/common/Truncated';

// Display label for the leading path segment, the view name, falling back to a capitalized segment.
const VIEW_LABELS: Record<string, string> = {
  overview: 'Overview',
  proofs: 'Proofs',
  metrics: 'Metrics',
};

interface Crumb {
  label: string;
  // The path the crumb links to, or null for a crumb that names context rather than a page.
  to: string | null;
}

// Crumbs for a path, each carrying the cumulative path it links to. The leading segment reads as its
// view label, the second segment of a detail path is the run index and reads as the run it names, and
// any deeper segment (proof slug or node id) reads as its own decoded value.
function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const runSection = segments[0] === 'proofs' || segments[0] === 'metrics';
  return segments.map((segment, i) => {
    if (i === 0) return { label: VIEW_LABELS[segment] ?? capitalize(segment), to: `/${segment}` };
    // The run-index segment reads as the run it names and is left unlinked, the benchmark having no
    // per-run page to navigate to.
    if (i === 1 && runSection) return { label: `Run ${segment}`, to: null };
    return { label: safeDecode(segment), to: `/${segments.slice(0, i + 1).join('/')}` };
  });
}

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// Decodes a path segment, returning it verbatim on a malformed percent escape rather than throwing, so
// a hand-edited address degrades to the raw token instead of crashing.
const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function Breadcrumb() {
  const { pathname } = useLocation();
  const search = useRunSearch();
  const crumbs = crumbsFor(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm text-muted">
      <Link
        to={{ pathname: '/overview', search }}
        aria-label="Home"
        className={cx('shrink-0 rounded-sm text-muted transition-colors hover:text-foreground', FOCUS_RING)}
      >
        <IconHome className="h-4 w-4" />
      </Link>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        // The trailing crumb is the open item and the run crumb names context, so neither links. Both
        // read on one line, the trailing one truncating with an ellipsis rather than wrapping.
        const asText = last || crumb.to == null;
        return (
          <Fragment key={i}>
            <span aria-hidden="true" className="shrink-0 text-faint">
              /
            </span>
            {asText ? (
              <span
                aria-current={last ? 'page' : undefined}
                className={cx('whitespace-nowrap', last ? 'min-w-0 font-medium text-foreground' : 'shrink-0')}
              >
                {last ? <Truncated text={crumb.label} className="max-w-[24rem]" /> : crumb.label}
              </span>
            ) : (
              <Link
                to={{ pathname: crumb.to!, search }}
                className={cx('shrink-0 whitespace-nowrap rounded-sm transition-colors hover:text-foreground', FOCUS_RING)}
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
