'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import ReactDOM from 'react-dom';
import { apiFetch } from '../../utils/api';

interface MentionUser {
  id: string;
  name: string;
  email: string;
}

interface MentionPopupProps {
  query: string;
  anchorEl: HTMLElement;
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  visible: boolean;
}

export interface MentionPopupHandle {
  getElement: () => HTMLDivElement | null;
}

const AVATAR_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const MentionPopup = forwardRef<MentionPopupHandle, MentionPopupProps>(({ query, anchorEl, onSelect, onClose, visible }, ref) => {
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    getElement: () => popupRef.current,
  }));

  const fetchUsers = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pageSize: '10',
      });
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      const response = await apiFetch(`/api/auth/users?${params}`);
      if (!response.ok) {
        setUsers([]);
        return;
      }
      const data = await response.json();
      const results: MentionUser[] = (data.items || []).map((item: any) => ({
        id: item.id,
        name: item.name || '',
        email: item.email || '',
      }));
      setUsers(results);
      setHighlightedIndex(0);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, fetchUsers]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, users.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && users.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(users[highlightedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, users, highlightedIndex, onSelect, onClose]);

  if (!visible) return null;

  const rect = anchorEl.getBoundingClientRect();

  const popup = (
    <div
      ref={popupRef}
      className="hot-mention-popup"
      style={{
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        pointerEvents: 'auto',
      }}
    >
      {loading && users.length === 0 ? (
        <div className="hot-mention-popup-item" style={{ justifyContent: 'center', opacity: 0.6 }}>
          Searching...
        </div>
      ) : users.length === 0 ? (
        <div className="hot-mention-popup-item" style={{ justifyContent: 'center', opacity: 0.6 }}>
          No users found
        </div>
      ) : (
        users.map((user, index) => (
          <div
            key={user.id}
            className={`hot-mention-popup-item ${index === highlightedIndex ? 'highlighted' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(user);
            }}
            onMouseEnter={() => setHighlightedIndex(index)}
          >
            <div
              className="hot-mention-popup-avatar"
              style={{ background: getAvatarColor(user.name || user.email) }}
            >
              {(user.name || user.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name || user.email}
              </span>
              {user.name && user.email && (
                <span style={{ fontSize: '11px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return ReactDOM.createPortal(popup, document.body);
});

MentionPopup.displayName = 'MentionPopup';

export default MentionPopup;
