import React, { memo, useRef, useEffect, useCallback } from 'react';
import { useCellStore, useCellState } from '../hooks/index';
import { getCellRenderer } from './renderers';
import { getCellEditor } from './editors';
import { ColumnDef } from '../types/index';

export interface CellProps {
  row: number;
  col: number;
  colConfig: ColumnDef;
  stickyLeft?: number;
  stickyRight?: number;
  stretchColumns?: boolean;
  onCellSave: (row: number, col: number, newValue: any, clearEditing?: boolean) => void;
  annotationColor?: string | null;
  commentCount?: number;
}

const Cell: React.FC<CellProps> = memo(({ row, col, colConfig, stickyLeft, stickyRight, stretchColumns = false, onCellSave, annotationColor, commentCount }) => {
  const store = useCellStore();
  const state = useCellState(row, col);
  const inputRef = useRef<any>(null);
  const rowData = store.getRowData(row);

  // Get value from rowData using the column's data key (not numeric index)
  // This ensures correct values are displayed when columns are reordered
  const cellValue = rowData?.[colConfig.data];

  const handleSave = useCallback(
    (value?: any, clearEditing: boolean = true) => {
      const newValue = value !== undefined ? value : cellValue;
      onCellSave(row, col, newValue, clearEditing);
    },
    [cellValue, row, col, onCellSave]
  );

  const handleCancel = useCallback(() => {
    store.clearEditing();
    store.focusTable();
  }, [store]);

  const handleChange = useCallback(
    (value: any) => {
      // For intermediate changes during editing, we don't update the store
      // The editor holds its own local state
    },
    []
  );

  // Focus input when editing starts
  useEffect(() => {
    if (state.isEditing && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Only set selection for input types that support it (not checkbox, radio, etc.)
          const supportsSelection =
            inputRef.current.type === undefined || // textarea
            ['text', 'password', 'search', 'tel', 'url', 'number'].includes(inputRef.current.type);
          if (supportsSelection && inputRef.current.setSelectionRange) {
            const length = inputRef.current.value?.length || 0;
            try {
              inputRef.current.setSelectionRange(length, length);
            } catch {
              // Some input types may still throw, ignore silently
            }
          }
        }
      }, 0);
    }
  }, [state.isEditing]);

  const minColWidth = colConfig.width || 100;
  const style: React.CSSProperties = {
    width: colConfig.width || 100,
    flexBasis: colConfig.width || 100,
    minWidth: minColWidth,
    flexShrink: stretchColumns ? 1 : 0,
    flexGrow: stretchColumns ? 1 : 0,
    position: 'relative',
  };

  if (stickyLeft !== undefined) {
    style.position = 'sticky';
    style.left = stickyLeft;
    style.zIndex = 2;
  } else if (stickyRight !== undefined) {
    style.position = 'sticky';
    style.right = stickyRight;
    style.zIndex = 2;
  }

  const renderer = getCellRenderer(colConfig);
  const renderedValue = renderer(cellValue, rowData, colConfig, row, col);
  const hasCustomRenderer = typeof colConfig.renderer === 'function';
  const conditionalClassName = colConfig.cellClassName?.(cellValue, rowData, row, col) || '';

  return (
    <td
      className={`hot-cell ${colConfig.readOnly ? 'read-only' : ''} ${conditionalClassName} ${annotationColor ? `cell-color-${annotationColor}` : ''}`.trim()}
      style={style}
      data-row={row}
      data-col={col}
      data-cell-selected={state.isSelected}
      data-in-range={state.isInRange}
      data-range-top={state.rangeEdges.top}
      data-range-bottom={state.rangeEdges.bottom}
      data-range-left={state.rangeEdges.left}
      data-range-right={state.rangeEdges.right}
      data-save-state={state.saveState}
      data-sticky-left={stickyLeft !== undefined}
      data-sticky-right={stickyRight !== undefined}
      data-custom-renderer={hasCustomRenderer || undefined}
      data-has-comment={commentCount && commentCount > 0 ? 'true' : undefined}
    >
      {state.isEditing
        ? getCellEditor(
          colConfig,
          cellValue,
          handleChange,
          handleSave,
          handleCancel,
          rowData,
          row,
          col,
          inputRef
        )
        : hasCustomRenderer
          ? renderedValue
          : <span className="cell-content" title={typeof cellValue === 'string' ? cellValue : undefined}>{renderedValue}</span>}
      {commentCount != null && commentCount > 0 && (
        <span className="cell-comment-indicator" title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`} />
      )}
    </td>
  );
});

Cell.displayName = 'Cell';

export default Cell;
