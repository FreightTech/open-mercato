// types/grouping.ts

export interface GroupRule {
  id: string;
  field: string;
  direction: 'asc' | 'desc';
}

export interface GroupHeaderVisualRow {
  type: 'groupHeader';
  groupKey: string;
  field: string;
  value: string;
  count: number;
  depth: number;
  collapsed: boolean;
}

export interface DataVisualRow {
  type: 'dataRow';
  dataIndex: number;
}

export type VisualRow = GroupHeaderVisualRow | DataVisualRow;

export function generateGroupRuleId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
