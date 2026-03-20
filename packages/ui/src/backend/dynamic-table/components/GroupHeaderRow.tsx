import React, { memo } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { GroupHeaderVisualRow } from '../types/grouping';
import type { ColumnDef } from '../types/index';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface GroupHeaderRowProps {
  visualRow: GroupHeaderVisualRow;
  virtualItem: VirtualItem;
  totalWidth: number;
  stretchColumns?: boolean;
  columns: ColumnDef[];
  onToggle: (groupKey: string) => void;
}

const GroupHeaderRow: React.FC<GroupHeaderRowProps> = memo(({
  visualRow,
  virtualItem,
  totalWidth,
  stretchColumns,
  columns,
  onToggle,
}) => {
  const fieldLabel = columns.find(c => c.data === visualRow.field)?.title || visualRow.field;

  return (
    <tr
      data-group-header
      data-group-key={visualRow.groupKey}
      className="hot-group-header-row"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${totalWidth}px`,
        minWidth: '100%',
        height: '40px',
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      <td
        className="hot-group-header-cell"
        style={{ width: '100%', border: 'none' }}
        onClick={() => onToggle(visualRow.groupKey)}
      >
        <div
          className="hot-group-header-content"
          style={{ paddingLeft: `${12 + visualRow.depth * 20}px` }}
        >
          {visualRow.collapsed ? (
            <ChevronRight className="hot-group-header-chevron" />
          ) : (
            <ChevronDown className="hot-group-header-chevron" />
          )}
          <span className="hot-group-header-field">{fieldLabel}</span>
          <span className="hot-group-header-value">{visualRow.value}</span>
          <span className="hot-group-header-count">{visualRow.count}</span>
        </div>
      </td>
    </tr>
  );
});

GroupHeaderRow.displayName = 'GroupHeaderRow';

export default GroupHeaderRow;
