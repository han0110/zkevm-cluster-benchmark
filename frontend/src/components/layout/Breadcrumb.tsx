/*
 * Page location trail above each view. Opens with a home link to the Overview then names each path
 * segment, the leading one by its view label and any trailing id by its own value, so a focused block or
 * node reads as the last crumb. Every crumb but the last links to its path carrying the active run, and
 * the trail is derived from the path alone so it needs no per-page wiring.
 */

import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useRunSearch } from '@/hooks/useRunSearch';
import { cx } from '@/utils/cx';
import { FOCUS_RING, ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_MD } from '@/utils/styles';
import { IconHome } from '@/components/common/icons';
import { Truncated } from '@/components/common/Truncated';
import { CopyButton } from '@/components/common/CopyButton';

// Display label for the leading path segment, the view name, falling back to a capitalized segment.
const VIEW_LABELS: Record<string, string> = {
  overview: 'Overview',
  blocks: 'Blocks',
  metrics: 'Metrics',
};

interface Crumb {
  label: string;
  // The path the crumb links to, or null for a crumb that names context rather than a page.
  to: string | null;
  // Whether the crumb's value is offered for copy, set for a block name so a long test id lifts out of
  // the trail in one click.
  copy?: boolean;
}

// Crumbs for a path, each carrying the cumulative path it links to. The leading segment reads as its
// view label, the second segment of a detail path is the run index and reads as the run it names, and
// any deeper segment (block id or node id) reads as its own decoded value.
function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const runSection = segments[0] === 'blocks' || segments[0] === 'metrics';
  return segments.map((segment, i) => {
    if (i === 0) return { label: VIEW_LABELS[segment] ?? capitalize(segment), to: `/${segment}` };
    // The run-index segment reads as the run it names and is left unlinked, the benchmark having no
    // per-run page to navigate to.
    if (i === 1 && runSection) return { label: `Run ${segment}`, to: null };
    // The block name, the third segment of a /blocks/ path, is offered for copy.
    const copy = i === 2 && segments[0] === 'blocks';
    return { label: safeDecode(segment), to: `/${segments.slice(0, i + 1).join('/')}`, copy };
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
        title="Overview"
        className={cx(ICON_BUTTON, ICON_BUTTON_COLOR, ICON_BUTTON_MD, FOCUS_RING)}
      >
        <IconHome />
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
              last ? (
                // The open item, truncating with an ellipsis. A block name trails a copy control that
                // stays fixed-size so it shows even when the name shrinks to its ellipsis.
                <span aria-current="page" className="flex min-w-0 items-center gap-1 font-medium text-foreground">
                  <Truncated text={crumb.label} className="max-w-[24rem]" />
                  {crumb.copy && <CopyButton text={crumb.label} label="Copy block name" />}
                </span>
              ) : (
                // A context crumb that names the run, reading on one line.
                <span className="shrink-0 whitespace-nowrap">{crumb.label}</span>
              )
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
