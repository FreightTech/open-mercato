import { useState, useEffect, useCallback, useRef } from 'react';
import { apiCall } from '../../utils/apiCall';

export interface CellAnnotationInfo {
  id: string;
  color: string | null;
  commentCount: number;
  assignees: Array<{ userId: string }>;
}

export type AnnotationMap = Map<string, CellAnnotationInfo>;

interface UseAnnotationsOptions {
  enabled: boolean;
  entityType: string | ((row: any) => string);
  data: any[];
  idColumnName: string;
}

export function useAnnotations({ enabled, entityType, data, idColumnName }: UseAnnotationsOptions) {
  const [annotations, setAnnotations] = useState<AnnotationMap>(new Map());
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnnotations = useCallback(async () => {
    if (!enabled || !entityType || data.length === 0) {
      setAnnotations(new Map());
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      let allItems: any[] = [];

      if (typeof entityType === 'string') {
        // Simple case: single entity type for all rows
        const rowIds = data
          .map(row => row[idColumnName])
          .filter(Boolean)
          .map(String);

        if (rowIds.length === 0) {
          setAnnotations(new Map());
          return;
        }

        const params = new URLSearchParams({
          entityType,
          rowIds: rowIds.join(','),
        });

        const { ok, result } = await apiCall<any>(`/api/annotations/annotations?${params}`, {
          signal: abortControllerRef.current.signal,
        });

        if (ok && result) {
          allItems = result.items || result.data || result || [];
        }
      } else {
        // Function case: group rows by resolved entity type, make parallel calls
        const groups = new Map<string, string[]>();
        for (const row of data) {
          const rowId = row[idColumnName];
          if (!rowId) continue;
          const type = entityType(row);
          if (!type) continue;
          const existing = groups.get(type);
          if (existing) {
            existing.push(String(rowId));
          } else {
            groups.set(type, [String(rowId)]);
          }
        }

        if (groups.size === 0) {
          setAnnotations(new Map());
          return;
        }

        const fetches = Array.from(groups.entries()).map(async ([type, rowIds]) => {
          const params = new URLSearchParams({
            entityType: type,
            rowIds: rowIds.join(','),
          });
          const { ok, result } = await apiCall<any>(`/api/annotations/annotations?${params}`, {
            signal: abortControllerRef.current!.signal,
          });
          if (ok && result) {
            return result.items || result.data || result || [];
          }
          return [];
        });

        const results = await Promise.all(fetches);
        for (const items of results) {
          allItems.push(...items);
        }
      }

      const map: AnnotationMap = new Map();
      for (const annotation of allItems) {
        const key = `${annotation.rowId || annotation.row_id}:${annotation.columnKey || annotation.column_key}`;
        map.set(key, {
          id: annotation.id,
          color: annotation.color || null,
          commentCount: annotation.comments?.length ?? annotation.commentCount ?? 0,
          assignees: (annotation.assignees || []).map((a: any) => ({ userId: a.userId || a.user_id })),
        });
      }
      setAnnotations(map);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to fetch annotations:', error);
      setAnnotations(new Map());
    } finally {
      setLoading(false);
    }
  }, [enabled, entityType, data, idColumnName]);

  // Fetch when data changes
  useEffect(() => {
    fetchAnnotations();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchAnnotations]);

  return {
    annotations,
    loading,
    refresh: fetchAnnotations,
  };
}
