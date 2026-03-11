import { useState, useEffect, useCallback, useRef } from 'react';
import { apiCall } from '../../utils/apiCall';

export interface CellAnnotationInfo {
  id: string;
  color: string | null;
  commentCount: number;
}

export type AnnotationMap = Map<string, CellAnnotationInfo>;

interface UseAnnotationsOptions {
  enabled: boolean;
  tableId: string;
  data: any[];
  idColumnName: string;
}

export function useAnnotations({ enabled, tableId, data, idColumnName }: UseAnnotationsOptions) {
  const [annotations, setAnnotations] = useState<AnnotationMap>(new Map());
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnnotations = useCallback(async () => {
    if (!enabled || !tableId || data.length === 0) {
      setAnnotations(new Map());
      return;
    }

    // Collect row IDs from visible data
    const rowIds = data
      .map(row => row[idColumnName])
      .filter(Boolean)
      .map(String);

    if (rowIds.length === 0) {
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
      const params = new URLSearchParams({
        tableId,
        rowIds: rowIds.join(','),
      });

      const { ok, result } = await apiCall<any>(`/api/annotations/annotations?${params}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!ok || !result) {
        setAnnotations(new Map());
        return;
      }

      const items: any[] = result.data || result || [];

      const map: AnnotationMap = new Map();
      for (const annotation of items) {
        const key = `${annotation.rowId || annotation.row_id}:${annotation.columnKey || annotation.column_key}`;
        map.set(key, {
          id: annotation.id,
          color: annotation.color || null,
          commentCount: annotation.comments?.length ?? annotation.commentCount ?? 0,
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
  }, [enabled, tableId, data, idColumnName]);

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
