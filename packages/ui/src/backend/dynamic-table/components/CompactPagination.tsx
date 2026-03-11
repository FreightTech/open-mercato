import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaginationProps } from '../types/index';

interface CompactPaginationProps {
  pagination: PaginationProps;
}

const CompactPagination: React.FC<CompactPaginationProps> = ({ pagination }) => {
  if (pagination.totalPages <= 1) return null;
  return (
    <div className="hot-compact-pagination">
      <button
        className="hot-compact-pagination-btn"
        onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
        disabled={pagination.currentPage <= 1}
        title="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="hot-compact-pagination-info">
        {pagination.currentPage} / {pagination.totalPages}
      </span>
      <button
        className="hot-compact-pagination-btn"
        onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
        disabled={pagination.currentPage >= pagination.totalPages}
        title="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export default CompactPagination;
