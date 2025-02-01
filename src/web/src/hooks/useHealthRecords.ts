/**
 * @fileoverview React hook for managing health records with FHIR R4 compliance and HIPAA security
 * Provides comprehensive CRUD operations, real-time sync, and audit logging
 * @version 1.0.0
 */

// External imports
import { useState, useCallback, useEffect } from 'react'; // v18.0.0
import { useDebounce } from 'use-debounce'; // v9.0.0
import { HealthRecordError } from '@austa/health-records'; // v1.0.0
import { AuditLogger } from '@austa/audit-logger'; // v1.0.0

// Internal imports
import { 
  IHealthRecord, 
  HealthRecordType, 
  SecurityClassification,
  HealthRecordStatus 
} from '../lib/types/healthRecord';
import { validateHealthRecord } from '../lib/utils/validation';
import { ErrorCode } from '../lib/constants/errorCodes';

// Constants
const DEBOUNCE_MS = 300;
const SYNC_INTERVAL_MS = 5000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_RETRY_ATTEMPTS = 3;
const CACHE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Interface for health records hook state
 */
interface UseHealthRecordsState {
  records: IHealthRecord[];
  loading: boolean;
  operationLoading: Record<string, boolean>;
  error: HealthRecordError | null;
  operationErrors: Record<string, HealthRecordError>;
  totalRecords: number;
  hasMore: boolean;
  currentPage: number;
  searchQuery: string;
  activeFilters: HealthRecordType[];
  isSyncing: boolean;
  uploadProgress: number;
}

/**
 * Interface for hook configuration options
 */
interface UseHealthRecordsOptions {
  pageSize?: number;
  autoFetch?: boolean;
  recordTypes?: HealthRecordType[];
  enableRealTimeSync?: boolean;
  retryAttempts?: number;
  cacheTimeout?: number;
}

/**
 * Custom hook for secure and efficient health records management
 */
export function useHealthRecords(
  patientId: string,
  options: UseHealthRecordsOptions = {}
) {
  // Initialize state
  const [state, setState] = useState<UseHealthRecordsState>({
    records: [],
    loading: false,
    operationLoading: {},
    error: null,
    operationErrors: {},
    totalRecords: 0,
    hasMore: true,
    currentPage: 1,
    searchQuery: '',
    activeFilters: options.recordTypes || [],
    isSyncing: false,
    uploadProgress: 0
  });

  // Initialize audit logger
  const auditLogger = new AuditLogger({
    context: 'health-records',
    patientId,
    enableEncryption: true
  });

  // Debounced search query
  const [debouncedSearch] = useDebounce(state.searchQuery, DEBOUNCE_MS);

  /**
   * Fetches health records with pagination and filtering
   */
  const fetchRecords = useCallback(async (page: number = 1) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const queryParams = new URLSearchParams({
        page: page.toString(),
        pageSize: (options.pageSize || DEFAULT_PAGE_SIZE).toString(),
        types: state.activeFilters.join(','),
        search: debouncedSearch
      });

      const response = await fetch(`/api/health-records/${patientId}?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Security-Classification': SecurityClassification.HIGHLY_CONFIDENTIAL
        }
      });

      const data = await response.json();
      
      setState(prev => ({
        ...prev,
        records: page === 1 ? data.records : [...prev.records, ...data.records],
        totalRecords: data.total,
        hasMore: data.hasMore,
        currentPage: page,
        loading: false
      }));

      // Audit log for records access
      await auditLogger.log({
        action: 'RECORDS_ACCESS',
        details: { page, filters: state.activeFilters }
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: new HealthRecordError(ErrorCode.NETWORK_ERROR)
      }));
    }
  }, [patientId, debouncedSearch, state.activeFilters, options.pageSize]);

  /**
   * Creates a new health record with FHIR validation
   */
  const createRecord = useCallback(async (record: Partial<IHealthRecord>) => {
    const operationId = `create_${Date.now()}`;

    try {
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: true }
      }));

      // Validate record against FHIR R4 schema
      const validationResult = await validateHealthRecord(record as IHealthRecord);
      if (!validationResult.isValid) {
        throw new HealthRecordError(ErrorCode.INVALID_INPUT);
      }

      const response = await fetch(`/api/health-records/${patientId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Security-Classification': SecurityClassification.HIGHLY_CONFIDENTIAL
        },
        body: JSON.stringify(record)
      });

      const newRecord = await response.json();

      setState(prev => ({
        ...prev,
        records: [newRecord, ...prev.records],
        operationLoading: { ...prev.operationLoading, [operationId]: false }
      }));

      // Audit log for record creation
      await auditLogger.log({
        action: 'RECORD_CREATE',
        details: { recordId: newRecord.id, type: record.type }
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: false },
        operationErrors: { 
          ...prev.operationErrors, 
          [operationId]: new HealthRecordError(ErrorCode.INVALID_INPUT)
        }
      }));
    }
  }, [patientId]);

  /**
   * Updates an existing health record with optimistic updates
   */
  const updateRecord = useCallback(async (
    recordId: string, 
    updates: Partial<IHealthRecord>
  ) => {
    const operationId = `update_${recordId}`;

    try {
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: true }
      }));

      // Optimistic update
      setState(prev => ({
        ...prev,
        records: prev.records.map(record => 
          record.id === recordId ? { ...record, ...updates } : record
        )
      }));

      const response = await fetch(`/api/health-records/${patientId}/${recordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Security-Classification': SecurityClassification.HIGHLY_CONFIDENTIAL
        },
        body: JSON.stringify(updates)
      });

      const updatedRecord = await response.json();

      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: false },
        records: prev.records.map(record => 
          record.id === recordId ? updatedRecord : record
        )
      }));

      // Audit log for record update
      await auditLogger.log({
        action: 'RECORD_UPDATE',
        details: { recordId, updates }
      });

    } catch (error) {
      // Revert optimistic update
      await fetchRecords(state.currentPage);
      
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: false },
        operationErrors: { 
          ...prev.operationErrors, 
          [operationId]: new HealthRecordError(ErrorCode.NETWORK_ERROR)
        }
      }));
    }
  }, [patientId, state.currentPage]);

  /**
   * Deletes a health record with soft delete
   */
  const deleteRecord = useCallback(async (recordId: string) => {
    const operationId = `delete_${recordId}`;

    try {
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: true }
      }));

      // Soft delete - update status
      await updateRecord(recordId, { 
        status: HealthRecordStatus.DELETED 
      });

      setState(prev => ({
        ...prev,
        records: prev.records.filter(record => record.id !== recordId),
        operationLoading: { ...prev.operationLoading, [operationId]: false }
      }));

      // Audit log for record deletion
      await auditLogger.log({
        action: 'RECORD_DELETE',
        details: { recordId }
      });

    } catch (error) {
      setState(prev => ({
        ...prev,
        operationLoading: { ...prev.operationLoading, [operationId]: false },
        operationErrors: { 
          ...prev.operationErrors, 
          [operationId]: new HealthRecordError(ErrorCode.NETWORK_ERROR)
        }
      }));
    }
  }, [updateRecord]);

  // Setup real-time sync if enabled
  useEffect(() => {
    if (!options.enableRealTimeSync) return;

    const ws = new WebSocket(`wss://api.austa.health/health-records/${patientId}`);
    
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setState(prev => ({
        ...prev,
        records: prev.records.map(record =>
          record.id === update.id ? { ...record, ...update } : record
        )
      }));
    };

    return () => ws.close();
  }, [patientId, options.enableRealTimeSync]);

  // Initial fetch
  useEffect(() => {
    if (options.autoFetch !== false) {
      fetchRecords(1);
    }
  }, [debouncedSearch, state.activeFilters]);

  return {
    // State
    records: state.records,
    loading: state.loading,
    error: state.error,
    operationLoading: state.operationLoading,
    operationErrors: state.operationErrors,
    
    // Pagination
    totalRecords: state.totalRecords,
    hasMore: state.hasMore,
    currentPage: state.currentPage,
    
    // Filters
    searchQuery: state.searchQuery,
    activeFilters: state.activeFilters,
    
    // Sync status
    isSyncing: state.isSyncing,
    uploadProgress: state.uploadProgress,
    
    // Operations
    fetchRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    
    // Filter operations
    setSearchQuery: (query: string) => 
      setState(prev => ({ ...prev, searchQuery: query })),
    setActiveFilters: (filters: HealthRecordType[]) => 
      setState(prev => ({ ...prev, activeFilters: filters })),
    
    // Error handling
    clearError: () => setState(prev => ({ ...prev, error: null })),
    clearOperationError: (operationId: string) => 
      setState(prev => ({
        ...prev,
        operationErrors: {
          ...prev.operationErrors,
          [operationId]: undefined
        }
      }))
  };
}