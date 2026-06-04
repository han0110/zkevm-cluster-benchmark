/*
 * Shared right-pane shell for the Blocks and Metrics detail views, a scrolling column led by an Overview
 * heading with an optional status badge and a close control, then the view's own sections. The bodies
 * differ per view so only this chrome is shared.
 */

import type { ReactNode } from 'react';
import { SectionHeading } from '@/components/common/SectionHeading';
import { IconButton } from '@/components/common/IconButton';
import { IconChevronRight } from '@/components/common/icons';

export function DetailPanel({
  onClose,
  closeLabel,
  aside,
  children,
}: {
  onClose: () => void;
  closeLabel: string;
  // Content beside the heading, such as a status badge. Pass it (even as null) to align the heading in a
  // baseline row with room for the badge, omit it entirely for a heading that stands alone.
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        {aside !== undefined ? (
          <div className="flex items-baseline gap-3">
            <SectionHeading>Overview</SectionHeading>
            {aside}
          </div>
        ) : (
          <SectionHeading>Overview</SectionHeading>
        )}
        <IconButton onClick={onClose} label={closeLabel}>
          <IconChevronRight className="h-5 w-5" />
        </IconButton>
      </div>
      {children}
    </div>
  );
}
