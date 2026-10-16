'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface MobileDataTableProps {
  data: any[];
  columns: Column[];
  primaryKey: string;
  title?: string;
  onEdit?: (item: any) => void;
  onDelete?: (item: any) => void;
  onView?: (item: any) => void;
  searchable?: boolean;
  filterable?: boolean;
  selectable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
}

export default function MobileDataTable({
  data,
  columns,
  primaryKey,
  title,
  onEdit,
  onDelete,
  onView,
  searchable = true,
  filterable = true,
  selectable = false,
  pagination = true,
  itemsPerPage = 10,
}: MobileDataTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [swipedRow, setSwipedRow] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);

  // Filter and search data
  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    return Object.values(item).some((value) =>
      String(value).toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = pagination
    ? filteredData.slice(startIndex, startIndex + itemsPerPage)
    : filteredData;

  // Toggle row expansion
  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
    hapticFeedback();
  };

  // Handle long press for selection mode
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    if (!selectable) return;
    touchStartTime.current = Date.now();
    setTimeout(() => {
      if (Date.now() - touchStartTime.current >= 500) {
        setIsSelectionMode(true);
        toggleSelection(id);
        hapticFeedback(20);
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    touchStartTime.current = 0;
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
    if (newSelected.size === 0) {
      setIsSelectionMode(false);
    }
  };

  // Swipe actions
  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleSwipeMove = (e: React.TouchEvent, id: string) => {
    const currentX = e.touches[0].clientX;
    const diff = touchStartX.current - currentX;

    if (Math.abs(diff) > 50) {
      setSwipedRow(id);
    }
  };

  const handleSwipeEnd = () => {
    setTimeout(() => setSwipedRow(null), 3000);
  };

  // Haptic feedback
  const hapticFeedback = (duration = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  };

  // Get primary column for card header
  const primaryColumn = columns[0];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="sticky top-14 z-20 bg-white border-b border-gray-200">
        {/* Title and Actions */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <div className="flex items-center space-x-2">
              {isSelectionMode && (
                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedRows(new Set());
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg active:bg-gray-200 transition-colors touch-manipulation"
                >
                  Cancel ({selectedRows.size})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search Bar */}
        {searchable && (
          <div className="px-4 pb-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-10 pr-10 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {filterable && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                >
                  <FunnelIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter Chips */}
        {showFilters && (
          <div className="px-4 pb-3">
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
              <button className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-full active:bg-blue-100 transition-colors touch-manipulation">
                All
              </button>
              <button className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full active:bg-gray-50 transition-colors touch-manipulation">
                Active
              </button>
              <button className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full active:bg-gray-50 transition-colors touch-manipulation">
                Pending
              </button>
              <button className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full active:bg-gray-50 transition-colors touch-manipulation">
                Completed
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Data List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {paginatedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No results found</p>
          </div>
        ) : (
          paginatedData.map((item) => {
            const id = item[primaryKey];
            const isExpanded = expandedRows.has(id);
            const isSelected = selectedRows.has(id);
            const isSwiped = swipedRow === id;

            return (
              <div
                key={id}
                className="relative bg-white rounded-lg shadow-sm overflow-hidden"
              >
                {/* Swipe Actions Background */}
                <div className="absolute inset-y-0 right-0 flex items-center">
                  <button
                    onClick={() => {
                      hapticFeedback();
                      onEdit?.(item);
                      setSwipedRow(null);
                    }}
                    className="h-full px-4 bg-blue-500 text-white flex items-center touch-manipulation"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      hapticFeedback();
                      onDelete?.(item);
                      setSwipedRow(null);
                    }}
                    className="h-full px-4 bg-red-500 text-white flex items-center touch-manipulation"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Card Content */}
                <div
                  className={`relative bg-white transition-transform duration-200 ${
                    isSwiped ? '-translate-x-32' : 'translate-x-0'
                  }`}
                  onTouchStart={(e) => {
                    handleTouchStart(e, id);
                    handleSwipeStart(e);
                  }}
                  onTouchMove={(e) => handleSwipeMove(e, id)}
                  onTouchEnd={() => {
                    handleTouchEnd();
                    handleSwipeEnd();
                  }}
                >
                  {/* Card Header */}
                  <div
                    onClick={() => toggleRowExpansion(id)}
                    className={`flex items-start justify-between p-4 cursor-pointer active:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      {/* Selection Checkbox */}
                      {(isSelectionMode || isSelected) && selectable && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(id);
                          }}
                          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <CheckIcon className="w-4 h-4 text-white" />}
                        </div>
                      )}

                      {/* Primary Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">
                          {primaryColumn.render
                            ? primaryColumn.render(item[primaryColumn.key], item)
                            : item[primaryColumn.key]}
                        </h3>
                        {/* Secondary Info */}
                        <div className="flex flex-wrap gap-2">
                          {columns.slice(1, 3).map((col) => (
                            <span
                              key={col.key}
                              className="text-xs text-gray-600"
                            >
                              {col.render
                                ? col.render(item[col.key], item)
                                : item[col.key]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Expand Icon */}
                    <ChevronDownIcon
                      className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {columns.slice(1).map((col) => (
                          <div key={col.key}>
                            <p className="text-xs text-gray-500 mb-1">
                              {col.label}
                            </p>
                            <p className="text-sm font-medium text-gray-900">
                              {col.render
                                ? col.render(item[col.key], item)
                                : item[col.key] || '-'}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        {onView && (
                          <button
                            onClick={() => {
                              hapticFeedback();
                              onView(item);
                            }}
                            className="flex items-center justify-center space-x-1 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg active:bg-blue-100 transition-colors touch-manipulation"
                          >
                            <EyeIcon className="w-4 h-4" />
                            <span>View</span>
                          </button>
                        )}
                        {onEdit && (
                          <button
                            onClick={() => {
                              hapticFeedback();
                              onEdit(item);
                            }}
                            className="flex items-center justify-center space-x-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg active:bg-gray-100 transition-colors touch-manipulation"
                          >
                            <PencilIcon className="w-4 h-4" />
                            <span>Edit</span>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => {
                              hapticFeedback();
                              onDelete(item);
                            }}
                            className="flex items-center justify-center space-x-1 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg active:bg-red-100 transition-colors touch-manipulation"
                          >
                            <TrashIcon className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-gray-50 transition-colors touch-manipulation"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:bg-gray-50 transition-colors touch-manipulation"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
