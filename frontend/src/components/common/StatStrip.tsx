/* A card holding a horizontal, wrapping row of label-and-value statistics. */

import { ChartCard } from '@/components/common/ChartCard';
import { OVERLINE } from '@/utils/styles';

export interface StatItem {
  label: string;
  value: string;
}

export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <ChartCard>
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        {items.map(item => (
          <div key={item.label} className="flex flex-col">
            <span className={OVERLINE}>{item.label}</span>
            <span className="text-lg font-semibold text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
