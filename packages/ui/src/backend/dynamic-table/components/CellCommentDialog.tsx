import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { apiCall } from '../../utils/apiCall';

const ANNOTATION_COLORS = [
  { value: null, label: 'None', bg: 'transparent' },
  { value: 'gray', label: 'Gray', bg: '#e5e7eb' },
  { value: 'pink', label: 'Pink', bg: '#fce7f3' },
  { value: 'orange', label: 'Orange', bg: '#ffedd5' },
  { value: 'yellow', label: 'Yellow', bg: '#fef9c3' },
  { value: 'green', label: 'Green', bg: '#dcfce7' },
  { value: 'blue', label: 'Blue', bg: '#dbeafe' },
  { value: 'purple', label: 'Purple', bg: '#f3e8ff' },
] as const;

interface Comment {
  id: string;
  userId: string;
  userName?: string;
  content: string;
  createdAt: string;
}

interface CellCommentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  rowId: string;
  columnKey: string;
  columnTitle: string;
  rowLabel?: string;
  annotationId?: string | null;
  currentColor?: string | null;
  onAnnotationChange?: () => void;
  /** Position the popover near this rect (from the clicked cell) */
  anchorRect?: DOMRect | null;
}

const CellCommentDialog: React.FC<CellCommentDialogProps> = ({
  isOpen,
  onClose,
  tableId,
  rowId,
  columnKey,
  columnTitle,
  rowLabel,
  annotationId: initialAnnotationId,
  currentColor: initialColor,
  onAnnotationChange,
  anchorRect,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(initialColor || null);
  const [annotationId, setAnnotationId] = useState<string | null>(initialAnnotationId || null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid catching the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch comments when dialog opens
  useEffect(() => {
    if (!isOpen || !annotationId) {
      setComments([]);
      return;
    }

    const fetchComments = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ tableId, rowIds: rowId });
        const { ok, result } = await apiCall<any>(`/api/annotations/annotations?${params}`);
        if (ok && result) {
          const items: any[] = result.items || result.data || result || [];
          const annotation = items.find((a: any) =>
            (a.columnKey || a.column_key) === columnKey
          );
          if (annotation?.comments) {
            setComments(annotation.comments.map((c: any) => ({
              id: c.id,
              userId: c.userId || c.user_id,
              userName: c.userName || c.user_name || 'User',
              content: c.content,
              createdAt: c.createdAt || c.created_at,
            })));
          }
        }
      } catch (error) {
        console.error('Failed to fetch comments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [isOpen, annotationId, tableId, rowId, columnKey]);

  // Ensure annotation exists, then add comment
  const handleSubmitComment = useCallback(async () => {
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      let currentAnnotationId = annotationId;

      // Create annotation if it doesn't exist
      if (!currentAnnotationId) {
        const { ok, result: created } = await apiCall<any>('/api/annotations/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId,
            rowId,
            columnKey,
            color: selectedColor,
          }),
        });
        if (ok && created) {
          currentAnnotationId = created.id || created.data?.id;
          setAnnotationId(currentAnnotationId);
        } else {
          return;
        }
      }

      // Add comment
      const { ok: commentOk, result: commentResult } = await apiCall<any>(
        `/api/annotations/annotations/${currentAnnotationId}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newComment.trim() }),
        },
      );

      if (commentOk && commentResult) {
        const newCommentObj: Comment = {
          id: commentResult.id || commentResult.data?.id,
          userId: commentResult.userId || commentResult.user_id || '',
          userName: commentResult.userName || commentResult.user_name || 'You',
          content: newComment.trim(),
          createdAt: new Date().toISOString(),
        };
        setComments(prev => [...prev, newCommentObj]);
        setNewComment('');
        onAnnotationChange?.();
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setSubmitting(false);
    }
  }, [newComment, submitting, annotationId, tableId, rowId, columnKey, selectedColor, onAnnotationChange]);

  // Update color
  const handleColorChange = useCallback(async (color: string | null) => {
    setSelectedColor(color);

    try {
      if (annotationId) {
        await apiCall(`/api/annotations/annotations?id=${annotationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color }),
        });
      } else if (color) {
        // Create annotation when picking a color on a cell that has none yet
        const { ok, result: created } = await apiCall<any>('/api/annotations/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId, rowId, columnKey, color }),
        });
        if (ok && created) {
          setAnnotationId(created.id || created.data?.id);
        }
      }
      onAnnotationChange?.();
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  }, [annotationId, tableId, rowId, columnKey, onAnnotationChange]);

  // Delete comment
  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!annotationId) return;

    try {
      const { ok } = await apiCall(`/api/annotations/annotations/${annotationId}/comments?commentId=${commentId}`, {
        method: 'DELETE',
      });
      if (ok) {
        setComments(prev => prev.filter(c => c.id !== commentId));
        onAnnotationChange?.();
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  }, [annotationId, onAnnotationChange]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  };

  if (!isOpen) return null;

  const title = rowLabel
    ? `${rowLabel} - ${columnTitle}`
    : columnTitle;

  // Position: below the cell, or above if not enough space
  const panelWidth = 420;
  let top = 0;
  let left = 0;
  if (anchorRect) {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceRight = window.innerWidth - anchorRect.left;
    top = spaceBelow > 300 ? anchorRect.bottom + 4 : anchorRect.top - 4;
    left = spaceRight > panelWidth ? anchorRect.left : window.innerWidth - panelWidth - 12;
  }

  const panel = (
    <div
      ref={panelRef}
      className="hot-comment-popover"
      style={{
        position: 'fixed',
        top: anchorRect ? (top > anchorRect.bottom ? top : undefined) : '50%',
        bottom: anchorRect && top <= anchorRect.bottom ? `${window.innerHeight - anchorRect.top + 4}px` : undefined,
        left: anchorRect ? left : '50%',
        transform: anchorRect ? undefined : 'translate(-50%, -50%)',
        width: panelWidth,
        zIndex: 10000,
      }}
    >
      <div className="hot-comment-popover-header">
        <div className="hot-comment-popover-title-group">
          <span className="hot-comment-popover-subtitle">Comments on</span>
          <span className="hot-comment-popover-title">{title}</span>
        </div>
        <button className="hot-comment-popover-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Comments Thread */}
      {(loading || comments.length > 0) && (
      <div className="hot-comment-thread">
        {loading ? (
          <div className="hot-comment-loading">Loading comments...</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="hot-comment-item">
              <div className="hot-comment-item-row">
                <span className="hot-comment-avatar">
                  {(comment.userName || 'U')[0].toUpperCase()}
                </span>
                <div className="hot-comment-item-body">
                  <div className="hot-comment-item-header">
                    <span className="hot-comment-author">{comment.userName || 'You'}</span>
                    <span className="hot-comment-action">commented</span>
                    <span className="hot-comment-time">{formatTimeAgo(comment.createdAt)}</span>
                  </div>
                  <div className="hot-comment-content">{comment.content}</div>
                </div>
                <button
                  className="hot-comment-delete"
                  onClick={() => handleDeleteComment(comment.id)}
                  title="Delete comment"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 4h11M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M6.5 7v4M9.5 7v4M3.5 4l.5 9a1.5 1.5 0 001.5 1.5h5a1.5 1.5 0 001.5-1.5l.5-9" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* New Comment Input */}
      <div className="hot-comment-input-area">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Leave a comment"
          className="hot-comment-textarea"
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmitComment();
            }
            if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        {/* Color Picker */}
        <div className="hot-comment-colors">
          {ANNOTATION_COLORS.map((item) => (
            <button
              key={item.value ?? 'none'}
              onClick={() => handleColorChange(item.value)}
              className={`hot-comment-color-btn ${selectedColor === item.value ? 'selected' : ''}`}
              style={{
                background: item.bg,
                border: item.value === null ? '1px dashed var(--hot-border)' : undefined,
              }}
              title={item.label}
            >
              {item.value === null && selectedColor === null ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
        <div className="hot-comment-input-footer">
          <span className="hot-comment-hint">Press <kbd>⌘+Enter</kbd> to send</span>
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || submitting}
            className="hot-comment-send-btn"
          >
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
};

export default CellCommentDialog;
