import React, { useMemo, useCallback, useState, useRef } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { css } from '@emotion/react'; // ^11.11.0
import { useVirtualizer } from '@tanstack/react-virtual'; // ^2.10.4
import { theme } from '../../styles/theme';

// Interfaces
interface ColumnDefinition {
  id: string;
  header: string;
  accessor: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
}

interface TableProps {
  data: Array<Record<string, any>>;
  columns: Array<ColumnDefinition>;
  sortable?: boolean;
  selectable?: boolean;
  pagination?: boolean;
  virtualScroll?: boolean;
  loading?: boolean;
  stickyHeader?: boolean;
  ariaLabel: string;
  pageSize?: number;
  onSelectionChange?: (selectedRows: Array<Record<string, any>>) => void;
  onSort?: (sortConfig: SortConfig) => void;
}

interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
}

interface VirtualItem {
  index: number;
  start: number;
  size: number;
  measureRef: (el: HTMLElement | null) => void;
}

// Styled Components with healthcare-specific design
const StyledTableContainer = styled.div`
  width: 100%;
  overflow: auto;
  border-radius: ${theme.shape.borderRadiusSmall}px;
  background: ${theme.palette.background.paper};
  box-shadow: ${theme.shadows[0]};

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    border-radius: 0;
  }
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-family: ${theme.typography.fontFamily};
`;

const StyledTableHeader = styled.thead<{ sticky?: boolean }>`
  ${({ sticky }) => sticky && css`
    position: sticky;
    top: 0;
    z-index: 2;
    background: ${theme.palette.background.paper};
  `}
`;

const StyledTableHeaderCell = styled.th<{ sortable?: boolean }>`
  padding: ${theme.spacing.md}px;
  text-align: left;
  font-weight: ${theme.typography.fontWeightMedium};
  color: ${theme.palette.text.primary};
  border-bottom: 2px solid ${theme.palette.primary.main};
  white-space: nowrap;
  
  ${({ sortable }) => sortable && css`
    cursor: pointer;
    user-select: none;
    
    &:hover {
      background: ${theme.palette.action?.hover};
    }
  `}
`;

const StyledTableRow = styled.tr<{ selected?: boolean }>`
  &:nth-of-type(odd) {
    background: ${theme.palette.background.default};
  }
  
  ${({ selected }) => selected && css`
    background: ${theme.palette.primary.light}15 !important;
  `}
  
  &:hover {
    background: ${theme.palette.action?.hover};
  }

  &:focus-within {
    outline: 2px solid ${theme.palette.primary.main};
    outline-offset: -2px;
  }
`;

const StyledTableCell = styled.td`
  padding: ${theme.spacing.md}px;
  color: ${theme.palette.text.primary};
  border-bottom: 1px solid ${theme.palette.divider};
`;

const StyledPagination = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: ${theme.spacing.md}px;
  gap: ${theme.spacing.sm}px;
`;

// Custom Hooks
const useTableSort = (data: Array<Record<string, any>>, initialSort?: SortConfig) => {
  const [sortConfig, setSortConfig] = useState<SortConfig | undefined>(initialSort);

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.column];
      const bValue = b[sortConfig.column];

      if (aValue === bValue) return 0;
      
      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortConfig]);

  return { sortedData, sortConfig, setSortConfig };
};

const useTableSelection = (data: Array<Record<string, any>>, onSelectionChange?: (selected: Array<Record<string, any>>) => void) => {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const toggleRowSelection = useCallback((rowId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedData = data.filter(row => selectedRows.has(row.id));
      onSelectionChange(selectedData);
    }
  }, [selectedRows, data, onSelectionChange]);

  return { selectedRows, toggleRowSelection };
};

// Main Table Component
export const Table: React.FC<TableProps> = React.memo(({
  data,
  columns,
  sortable = false,
  selectable = false,
  pagination = false,
  virtualScroll = false,
  loading = false,
  stickyHeader = false,
  ariaLabel,
  pageSize = 10,
  onSelectionChange,
  onSort
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { sortedData, sortConfig, setSortConfig } = useTableSort(data);
  const { selectedRows, toggleRowSelection } = useTableSelection(data, onSelectionChange);
  
  const [currentPage, setCurrentPage] = useState(0);
  
  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 48,
    overscan: 5
  });

  const handleSort = useCallback((columnId: string) => {
    if (!sortable) return;

    setSortConfig(prev => ({
      column: columnId,
      direction: prev?.column === columnId && prev.direction === 'asc' ? 'desc' : 'asc'
    }));

    if (onSort) {
      onSort({
        column: columnId,
        direction: sortConfig?.column === columnId && sortConfig.direction === 'asc' ? 'desc' : 'asc'
      });
    }
  }, [sortable, sortConfig, onSort]);

  const displayData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, currentPage, pageSize]);

  const renderTableHeader = () => (
    <StyledTableHeader sticky={stickyHeader}>
      <tr>
        {selectable && (
          <StyledTableHeaderCell>
            <input
              type="checkbox"
              onChange={() => {/* Implement select all */}}
              aria-label="Select all rows"
            />
          </StyledTableHeaderCell>
        )}
        {columns.map(column => (
          <StyledTableHeaderCell
            key={column.id}
            sortable={sortable && column.sortable}
            onClick={() => column.sortable && handleSort(column.id)}
            style={{ width: column.width }}
            aria-sort={sortConfig?.column === column.id ? sortConfig.direction : undefined}
          >
            {column.header}
            {sortable && column.sortable && sortConfig?.column === column.id && (
              <span aria-hidden="true">
                {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
              </span>
            )}
          </StyledTableHeaderCell>
        ))}
      </tr>
    </StyledTableHeader>
  );

  const renderTableBody = () => (
    <tbody>
      {virtualScroll ? (
        rowVirtualizer.getVirtualItems().map((virtualRow: VirtualItem) => {
          const row = displayData[virtualRow.index];
          return (
            <StyledTableRow
              key={row.id}
              selected={selectedRows.has(row.id)}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {renderRowCells(row)}
            </StyledTableRow>
          );
        })
      ) : (
        displayData.map(row => (
          <StyledTableRow
            key={row.id}
            selected={selectedRows.has(row.id)}
          >
            {renderRowCells(row)}
          </StyledTableRow>
        ))
      )}
    </tbody>
  );

  const renderRowCells = (row: Record<string, any>) => (
    <>
      {selectable && (
        <StyledTableCell>
          <input
            type="checkbox"
            checked={selectedRows.has(row.id)}
            onChange={() => toggleRowSelection(row.id)}
            aria-label={`Select row ${row.id}`}
          />
        </StyledTableCell>
      )}
      {columns.map(column => (
        <StyledTableCell key={`${row.id}-${column.id}`}>
          {column.render ? column.render(row[column.accessor], row) : row[column.accessor]}
        </StyledTableCell>
      ))}
    </>
  );

  return (
    <StyledTableContainer ref={containerRef} role="region" aria-label={ariaLabel}>
      <StyledTable role="table">
        {renderTableHeader()}
        {renderTableBody()}
      </StyledTable>
      {pagination && (
        <StyledPagination>
          <button
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {Math.ceil(sortedData.length / pageSize)}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(sortedData.length / pageSize) - 1, prev + 1))}
            disabled={currentPage >= Math.ceil(sortedData.length / pageSize) - 1}
            aria-label="Next page"
          >
            Next
          </button>
        </StyledPagination>
      )}
    </StyledTableContainer>
  );
});

Table.displayName = 'Table';

export default Table;