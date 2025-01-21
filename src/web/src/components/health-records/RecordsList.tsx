/**
 * @fileoverview Enhanced health records list component with FHIR R4 compliance and PHI protection
 * Implements comprehensive filtering, real-time sync, and accessibility features
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'; // ^18.0.0
import { format } from 'date-fns'; // ^2.30.0
import { useVirtual } from 'react-virtual'; // ^2.10.4
import { AuditLogger } from '@healthcare/audit-logger'; // ^1.2.0

// Internal imports
import Table from '../common/Table';
import { useHealthRecords } from '../../hooks/useHealthRecords';
import { 
  IHealthRecord, 
  HealthRecordType, 
  SecurityClassification 
} from '../../lib/types/healthRecord';
import { validateHealthRecord } from '../../lib/utils/validation';
import { ErrorCode } from '../../lib/constants/errorCodes';

// Types and interfaces
interface RecordsListProps {
  patientId: string;
  recordTypes: HealthRecordType[];
  onRecordSelect: (record: IHealthRecord) => void;
  enableRealTimeSync?: boolean;
  accessLevel: string;
  onError: (error: Error) => void;
}

// Constants
const PAGE_SIZE = 20;
const DEBOUNCE_DELAY = 300;
const PHI_MASK = '********';

/**
 * Enhanced health records list component with security and performance features
 */
const RecordsList: React.FC<RecordsListProps> = ({
  patientId,
  recordTypes,
  onRecordSelect,
  enableRealTimeSync = true,
  accessLevel,
  onError
}) => {
  // Initialize audit logger
  const auditLogger = new AuditLogger({
    context: 'health-records-list',
    patientId,
    enableEncryption: true
  });

  // State and hooks
  const {
    records,
    loading,
    error,
    fetchRecords,
    totalRecords,
    hasMore,
    currentPage,
    searchQuery,
    setSearchQuery,
    setActiveFilters
  } = useHealthRecords(patientId, {
    pageSize: PAGE_SIZE,
    autoFetch: true,
    recordTypes,
    enableRealTimeSync
  });

  const [sortConfig, setSortConfig] = useState<{
    column: string;
    direction: 'asc' | 'desc';
  }>();

  // Memoized table columns with PHI protection
  const columns = useMemo(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: 'date',
      sortable: true,
      render: (value: Date) => format(new Date(value), 'PPP'),
    },
    {
      id: 'type',
      header: 'Type',
      accessor: 'type',
      sortable: true,
    },
    {
      id: 'provider',
      header: 'Provider',
      accessor: 'providerId',
      sortable: true,
      render: (value: string) => maskPHIData(value, accessLevel),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: 'id',
      render: (_: any, record: IHealthRecord) => (
        <div role="group" aria-label="Record actions">
          <button
            onClick={() => handleRecordSelect(record)}
            aria-label={`View record from ${format(new Date(record.date), 'PPP')}`}
          >
            View
          </button>
        </div>
      ),
    },
  ], [accessLevel]);

  // Handlers
  const handleSort = useCallback(async (columnId: string, direction: 'asc' | 'desc') => {
    try {
      setSortConfig({ column: columnId, direction });
      
      // Audit log for sorting operation
      await auditLogger.log({
        action: 'RECORDS_SORT',
        details: { columnId, direction }
      });
    } catch (error) {
      onError(new Error(ErrorCode.INTERNAL_SERVER_ERROR));
    }
  }, [auditLogger, onError]);

  const handleRecordSelect = useCallback(async (record: IHealthRecord) => {
    try {
      // Validate record before selection
      const validationResult = await validateHealthRecord(record);
      if (!validationResult.isValid) {
        throw new Error(ErrorCode.INVALID_INPUT);
      }

      // Audit log for record access
      await auditLogger.log({
        action: 'RECORD_ACCESS',
        details: { recordId: record.id, type: record.type }
      });

      onRecordSelect(record);
    } catch (error) {
      onError(error as Error);
    }
  }, [auditLogger, onRecordSelect, onError]);

  const handleFilter = useCallback((type: HealthRecordType) => {
    setActiveFilters([type]);
  }, [setActiveFilters]);

  // PHI data masking based on access level
  const maskPHIData = useCallback((value: string, level: string): string => {
    if (level !== SecurityClassification.HIGHLY_CONFIDENTIAL) {
      return PHI_MASK;
    }
    return value;
  }, []);

  // Error handling
  useEffect(() => {
    if (error) {
      onError(error);
    }
  }, [error, onError]);

  // Render loading state
  if (loading && !records.length) {
    return (
      <div role="alert" aria-busy="true">
        Loading health records...
      </div>
    );
  }

  return (
    <div className="records-list" role="region" aria-label="Health Records List">
      {/* Search and filters */}
      <div className="records-list__controls">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search records..."
          aria-label="Search health records"
        />
        <div className="records-list__filters" role="group" aria-label="Record type filters">
          {Object.values(HealthRecordType).map((type) => (
            <button
              key={type}
              onClick={() => handleFilter(type)}
              aria-pressed={recordTypes.includes(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Records table */}
      <Table
        data={records}
        columns={columns}
        sortable={true}
        pagination={true}
        virtualScroll={true}
        loading={loading}
        stickyHeader={true}
        pageSize={PAGE_SIZE}
        ariaLabel="Health Records Table"
        onSort={handleSort}
      />

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => fetchRecords(currentPage + 1)}
          disabled={loading}
          aria-label="Load more records"
        >
          Load More
        </button>
      )}
    </div>
  );
};

export default RecordsList;