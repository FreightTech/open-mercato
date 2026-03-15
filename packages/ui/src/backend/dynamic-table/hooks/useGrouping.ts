import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef } from '../types/index';
import type { GroupRule, VisualRow, GroupHeaderVisualRow } from '../types/grouping';

export interface UseGroupingResult {
  visualRows: VisualRow[] | null;
  collapsedGroups: Set<string>;
  toggleGroup: (groupKey: string) => void;
  toggleAllGroups: (collapsed: boolean) => void;
  dataIndexToVisualIndex: (dataIndex: number) => number;
}

function getGroupValue(row: any, field: string): string {
  const value = row[field];
  if (value === null || value === undefined || value === '') {
    return '(Empty)';
  }
  return String(value);
}

function buildGroupKey(depth: number, field: string, value: string, parentKey: string): string {
  return parentKey ? `${parentKey}|${field}:${value}` : `${field}:${value}`;
}

export function useGrouping(
  data: any[],
  groupRules: GroupRule[],
  columns: ColumnDef[],
): UseGroupingResult {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const toggleAllGroups = useCallback((collapsed: boolean) => {
    if (!collapsed) {
      setCollapsedGroups(new Set());
    } else {
      // Collapse all — we'll compute the keys in the visualRows memo
      setCollapsedGroups(prev => {
        const allKeys = new Set(prev);
        // Mark a sentinel so the memo knows to collect all group keys
        allKeys.add('__collapse_all__');
        return allKeys;
      });
    }
  }, []);

  const visualRows = useMemo(() => {
    if (groupRules.length === 0) return null;

    const result: VisualRow[] = [];
    const allGroupKeys: string[] = [];

    // Build groups recursively
    function buildGroups(
      indices: number[],
      rules: GroupRule[],
      depth: number,
      parentKey: string,
    ) {
      if (rules.length === 0) {
        // Leaf level — emit data rows
        for (const idx of indices) {
          result.push({ type: 'dataRow', dataIndex: idx });
        }
        return;
      }

      const [currentRule, ...remainingRules] = rules;
      const field = currentRule.field;

      // Group by field value
      const groups = new Map<string, number[]>();
      for (const idx of indices) {
        const value = getGroupValue(data[idx], field);
        if (!groups.has(value)) {
          groups.set(value, []);
        }
        groups.get(value)!.push(idx);
      }

      // Sort group keys
      const sortedKeys = [...groups.keys()].sort((a, b) => {
        // "(Empty)" always last
        if (a === '(Empty)') return 1;
        if (b === '(Empty)') return -1;
        const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        return currentRule.direction === 'desc' ? -cmp : cmp;
      });

      for (const value of sortedKeys) {
        const groupIndices = groups.get(value)!;
        const groupKey = buildGroupKey(depth, field, value, parentKey);
        allGroupKeys.push(groupKey);

        const isCollapsed = collapsedGroups.has(groupKey);

        result.push({
          type: 'groupHeader',
          groupKey,
          field,
          value,
          count: groupIndices.length,
          depth,
          collapsed: isCollapsed,
        });

        if (!isCollapsed) {
          buildGroups(groupIndices, remainingRules, depth + 1, groupKey);
        }
      }
    }

    // Create array of all data indices
    const allIndices = Array.from({ length: data.length }, (_, i) => i);
    buildGroups(allIndices, groupRules, 0, '');

    // Handle "collapse all" sentinel
    if (collapsedGroups.has('__collapse_all__')) {
      setCollapsedGroups(new Set(allGroupKeys));
    }

    return result;
  }, [data, groupRules, collapsedGroups]);

  const dataIndexToVisualIndex = useCallback((dataIndex: number): number => {
    if (!visualRows) return dataIndex;
    for (let i = 0; i < visualRows.length; i++) {
      const vr = visualRows[i];
      if (vr.type === 'dataRow' && vr.dataIndex === dataIndex) {
        return i;
      }
    }
    return dataIndex;
  }, [visualRows]);

  return {
    visualRows,
    collapsedGroups,
    toggleGroup,
    toggleAllGroups,
    dataIndexToVisualIndex,
  };
}
