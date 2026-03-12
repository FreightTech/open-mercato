import React, { memo, useState, useCallback } from 'react';
import { useCellStore, useSelection } from '../hooks/index';
import { ColumnDef, SortState, ContextMenuAction } from '../types/index';
import ColumnHeaderMenu from './ColumnHeaderMenu';

export interface ColumnHeadersProps {
  columns: ColumnDef[];
  rowHeaders: boolean;
  leftOffsets: (number | undefined)[];
  rightOffsets: (number | undefined)[];
  totalWidth: number;
  sortState: SortState;
  actionsColumnWidth: number;
  showActionsColumn?: boolean;
  stretchColumns?: boolean;
  onSort: (colIndex: number) => void;
  onResizeStart: (e: React.MouseEvent, colIndex: number) => void;
  onDoubleClick: (e: React.MouseEvent, colIndex: number) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  /** Modern layout: enable built-in column header click menu */
  modernLayout?: boolean;
  /** Modern layout: callback for sort ascending */
  onSortAsc?: (colIndex: number) => void;
  /** Modern layout: callback for sort descending */
  onSortDesc?: (colIndex: number) => void;
  /** Modern layout: callback for "filter by this field" */
  onFilterByField?: (colIndex: number) => void;
  /** Modern layout: callback for freeze/unfreeze column */
  onFreezeToggle?: (colIndex: number) => void;
  /** Modern layout: callback for hiding a column */
  onHideField?: (colIndex: number) => void;
  /** Set of frozen column data keys */
  frozenColumns?: Set<string>;
  /** Column actions provider for extra menu items */
  columnActions?: (column: ColumnDef, colIndex: number) => ContextMenuAction[];
  /** Callback when an extra column action is clicked */
  onColumnAction?: (actionId: string, colIndex: number) => void;
}

interface HeaderMenuState {
  colIndex: number;
  anchorRect: DOMRect;
}

const ColumnHeaders: React.FC<ColumnHeadersProps> = memo(
  ({
    columns,
    rowHeaders,
    leftOffsets,
    rightOffsets,
    totalWidth,
    sortState,
    actionsColumnWidth,
    showActionsColumn = true,
    stretchColumns = false,
    onSort,
    onResizeStart,
    onDoubleClick,
    onMouseDown,
    onMouseMove,
    modernLayout = false,
    onSortAsc,
    onSortDesc,
    onFilterByField,
    onFreezeToggle,
    onHideField,
    frozenColumns,
    columnActions,
    onColumnAction,
  }) => {
    const store = useCellStore();
    const selection = useSelection();
    const [headerMenu, setHeaderMenu] = useState<HeaderMenuState | null>(null);

    const handleHeaderClick = useCallback((e: React.MouseEvent, colIndex: number) => {
      if (!modernLayout) return;
      // Don't open menu if clicking on resize handle
      if ((e.target as HTMLElement).classList.contains('hot-col-resize-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      const th = (e.currentTarget as HTMLElement);
      setHeaderMenu({ colIndex, anchorRect: th.getBoundingClientRect() });
    }, [modernLayout]);

    return (
      <div
        className="hot-headers-sticky"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        <table className="hot-table" style={{ width: stretchColumns ? undefined : `${totalWidth}px`, minWidth: stretchColumns ? '100%' : undefined }}>
          <thead>
            <tr style={{ display: 'flex', width: stretchColumns ? undefined : `${totalWidth}px`, minWidth: stretchColumns ? '100%' : undefined }}>
              {rowHeaders && (
                <th
                  className="hot-row-header"
                  style={{
                    width: 50,
                    flexBasis: 50,
                    flexShrink: 0,
                    flexGrow: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 4,
                  }}
                />
              )}

              {columns.map((col, colIndex) => {
                const isInColRange =
                  selection.type === 'colRange' &&
                  selection.anchor &&
                  selection.focus &&
                  colIndex >= Math.min(selection.anchor.col, selection.focus.col) &&
                  colIndex <= Math.max(selection.anchor.col, selection.focus.col);

                const colWidth = store.getColumnWidth(colIndex);

                const headerStyle: React.CSSProperties = {
                  width: colWidth,
                  flexBasis: colWidth,
                  minWidth: colWidth,
                  flexShrink: stretchColumns ? 1 : 0,
                  flexGrow: stretchColumns ? 1 : 0,
                  position: 'relative',
                };

                if (leftOffsets[colIndex] !== undefined) {
                  headerStyle.position = 'sticky';
                  headerStyle.left = leftOffsets[colIndex];
                  headerStyle.zIndex = 3;
                } else if (rightOffsets[colIndex] !== undefined) {
                  headerStyle.position = 'sticky';
                  headerStyle.right = rightOffsets[colIndex];
                  headerStyle.zIndex = 3;
                }

                return (
                  <th
                    key={col.data}
                    className={`hot-col-header ${modernLayout ? 'hot-col-header-modern' : ''}`}
                    onDoubleClick={modernLayout ? (e) => handleHeaderClick(e, colIndex) : (e) => onDoubleClick(e, colIndex)}
                    style={headerStyle}
                    data-col={colIndex}
                    data-in-col-range={isInColRange}
                    data-sticky-left={leftOffsets[colIndex] !== undefined}
                    data-sticky-right={rightOffsets[colIndex] !== undefined}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        minWidth: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                          flex: 1,
                        }}
                        title={col.headerTooltip || col.title || col.data}
                      >
                        {col.title || col.data}
                      </span>
                      {/* Classic layout: sort button. Modern layout: sort indicator only (no button) */}
                      {!modernLayout ? (
                        <button
                          className="hot-col-sort-btn"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSort(colIndex);
                          }}
                          title={
                            sortState.columnIndex === colIndex && sortState.direction
                              ? `Sorted ${sortState.direction === 'asc' ? 'ascending' : 'descending'}`
                              : 'Click to sort'
                          }
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '12px',
                            color: sortState.columnIndex === colIndex ? '#3b82f6' : '#9ca3af',
                            transition: 'color 0.2s',
                          }}
                        >
                          {sortState.columnIndex === colIndex && sortState.direction === 'asc' && '↑'}
                          {sortState.columnIndex === colIndex && sortState.direction === 'desc' && '↓'}
                          {(sortState.columnIndex !== colIndex || sortState.direction === null) && '⇅'}
                        </button>
                      ) : (
                        sortState.columnIndex === colIndex && sortState.direction && (
                          <span className="hot-col-sort-indicator">
                            {sortState.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )
                      )}
                    </div>
                    <div
                      className="hot-col-resize-handle"
                      onMouseDown={(e) => onResizeStart(e, colIndex)}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        zIndex: 10,
                      }}
                    />
                  </th>
                );
              })}

              {/* Actions header */}
              {showActionsColumn && (
                <th
                  className="hot-col-header"
                  style={{
                    width: actionsColumnWidth,
                    flexBasis: actionsColumnWidth,
                    flexShrink: 0,
                    flexGrow: 0,
                    position: 'sticky',
                    right: 0,
                    zIndex: 3,
                  }}
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
        </table>

        {/* Modern layout: Column Header Menu */}
        {headerMenu && modernLayout && (
          <ColumnHeaderMenu
            column={columns[headerMenu.colIndex]}
            colIndex={headerMenu.colIndex}
            anchorRect={headerMenu.anchorRect}
            isFrozen={frozenColumns?.has(columns[headerMenu.colIndex].data) ?? false}
            onSortAsc={() => onSortAsc?.(headerMenu.colIndex)}
            onSortDesc={() => onSortDesc?.(headerMenu.colIndex)}
            onFilterByField={() => onFilterByField?.(headerMenu.colIndex)}
            onFreezeToggle={() => onFreezeToggle?.(headerMenu.colIndex)}
            onHideField={() => onHideField?.(headerMenu.colIndex)}
            onClose={() => setHeaderMenu(null)}
            extraActions={columnActions?.(columns[headerMenu.colIndex], headerMenu.colIndex)}
            onExtraAction={(actionId) => onColumnAction?.(actionId, headerMenu.colIndex)}
          />
        )}
      </div>
    );
  }
);

ColumnHeaders.displayName = 'ColumnHeaders';

export default ColumnHeaders;
