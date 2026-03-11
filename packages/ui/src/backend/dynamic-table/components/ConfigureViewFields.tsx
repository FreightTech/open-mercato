import React, { useCallback, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { ColumnDef } from '../types/index';

interface ConfigureViewFieldsProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  hiddenColumns: string[];
  onColumnVisibilityChange: (visible: string[], hidden: string[]) => void;
}

const ConfigureViewFields: React.FC<ConfigureViewFieldsProps> = ({
  columns,
  visibleColumns,
  hiddenColumns,
  onColumnVisibilityChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const allColumnKeys = [...visibleColumns, ...hiddenColumns];

  const filteredKeys = allColumnKeys.filter(key => {
    const col = columns.find(c => c.data === key);
    const title = (col?.title || key).toLowerCase();
    return title.includes(searchQuery.toLowerCase());
  });

  const toggleColumn = useCallback((key: string) => {
    const isVisible = visibleColumns.includes(key);
    if (isVisible) {
      const newVisible = visibleColumns.filter(k => k !== key);
      const newHidden = [...hiddenColumns, key];
      onColumnVisibilityChange(newVisible, newHidden);
    } else {
      const newHidden = hiddenColumns.filter(k => k !== key);
      const newVisible = [...visibleColumns, key];
      onColumnVisibilityChange(newVisible, newHidden);
    }
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  const showAll = useCallback(() => {
    onColumnVisibilityChange([...visibleColumns, ...hiddenColumns], []);
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  const hideAll = useCallback(() => {
    onColumnVisibilityChange([], [...visibleColumns, ...hiddenColumns]);
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  const getColumnTitle = (key: string) => {
    const col = columns.find(c => c.data === key);
    return col?.title || key;
  };

  return (
    <div className="hot-config-fields">
      <div className="hot-config-fields-toolbar">
        <span className="hot-config-fields-toolbar-spacer" />
        <button onClick={showAll} className="hot-config-fields-bulk-btn">Show all</button>
        <button onClick={hideAll} className="hot-config-fields-bulk-btn">Hide all</button>
      </div>
      <div className="hot-config-fields-list">
        {filteredKeys.map(key => {
          const isVisible = visibleColumns.includes(key);
          return (
            <label key={key} className="hot-config-fields-item">
              <GripVertical className="w-3.5 h-3.5 hot-config-fields-grip" />
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => toggleColumn(key)}
                className="hot-config-fields-checkbox"
              />
              <span className={`hot-config-fields-label ${!isVisible ? 'is-hidden' : ''}`}>
                {getColumnTitle(key)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default ConfigureViewFields;
