/**
 * @fileoverview HIPAA-compliant health records API client with FHIR R4 support
 * Implements secure health record management with comprehensive error handling
 * @version 1.0.0
 */

// External imports
import axios, { AxiosError, AxiosResponse } from 'axios'; // v1.4.0

// Internal imports
import { IHealthRecord, HealthRecordErrorType, SecurityClassification } from '../types/healthRecord';
import { HealthRecordEndpoints, buildUrl, processEndpointParams } from '../constants/endpoints';
import { ErrorCode, ErrorTracker } from '../constants/errorCodes';

/**
 * Interface for health record API response with audit information
 */
interface HealthRecordResponse<T> {
  data: T;
  audit: {
    timestamp: Date;
    requestId: string;
    accessedBy: string;
    hipaaCompliant: boolean;
  };
}

/**
 * Interface for pagination and filtering options
 */
interface QueryOptions {
  page?: number;
  limit?: number;
  filter?: Record<string, any>;
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

/**
 * Default request configuration with security headers
 */
const DEFAULT_CONFIG = {
  headers: {
    'Content-Type': 'application/json',
    'X-Security-Classification': SecurityClassification.HIGHLY_CONFIDENTIAL,
    'X-HIPAA-Compliance': 'true'
  },
  timeout: 30000 // 30 seconds
};

/**
 * Validates HIPAA compliance of health record data
 * @param record - Health record to validate
 * @throws {Error} If record violates HIPAA requirements
 */
const validateHIPAACompliance = (record: Partial<IHealthRecord>): void => {
  if (!record.patientId || !record.content) {
    throw new Error(HealthRecordErrorType.PHI_VALIDATION_ERROR);
  }

  // Additional HIPAA validation logic
  const requiredMetadata = [
    'hipaaCompliance.isProtectedHealth',
    'hipaaCompliance.dataMinimizationApplied',
    'hipaaCompliance.encryptionVerified'
  ];

  if (!record.metadata || !requiredMetadata.every(path => {
    const keys = path.split('.');
    let obj: any = record.metadata;
    return keys.every(key => (obj = obj?.[key]) !== undefined);
  })) {
    throw new Error(HealthRecordErrorType.PHI_VALIDATION_ERROR);
  }
};

/**
 * Retrieves a paginated list of health records with HIPAA-compliant filtering
 * @param patientId - ID of the patient whose records to retrieve
 * @param options - Query options for pagination and filtering
 * @returns Promise with health records and audit information
 */
export const getHealthRecords = async (
  patientId: string,
  options: QueryOptions = {}
): Promise<HealthRecordResponse<IHealthRecord[]>> => {
  try {
    const url = buildUrl(HealthRecordEndpoints.GET_RECORDS);
    const params = {
      patientId,
      page: options.page || 1,
      limit: options.limit || 10,
      ...options.filter,
      ...(options.sort && { sort: `${options.sort.field}:${options.sort.order}` })
    };

    const response = await axios.get<HealthRecordResponse<IHealthRecord[]>>(
      url,
      {
        ...DEFAULT_CONFIG,
        params
      }
    );

    // Validate HIPAA compliance for each record
    response.data.data.forEach(validateHIPAACompliance);

    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      patientId,
      operation: 'getHealthRecords'
    });
    throw error;
  }
};

/**
 * Retrieves a single health record by ID with HIPAA compliance checks
 * @param recordId - ID of the health record to retrieve
 * @param patientId - ID of the patient for validation
 * @returns Promise with health record and audit information
 */
export const getHealthRecord = async (
  recordId: string,
  patientId: string
): Promise<HealthRecordResponse<IHealthRecord>> => {
  try {
    const url = buildUrl(
      processEndpointParams(HealthRecordEndpoints.GET_RECORD, { id: recordId })
    );

    const response = await axios.get<HealthRecordResponse<IHealthRecord>>(
      url,
      {
        ...DEFAULT_CONFIG,
        params: { patientId }
      }
    );

    validateHIPAACompliance(response.data.data);
    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      recordId,
      patientId,
      operation: 'getHealthRecord'
    });
    throw error;
  }
};

/**
 * Creates a new health record with HIPAA compliance validation
 * @param record - Health record data to create
 * @returns Promise with created record and audit information
 */
export const createHealthRecord = async (
  record: Partial<IHealthRecord>
): Promise<HealthRecordResponse<IHealthRecord>> => {
  try {
    validateHIPAACompliance(record);

    const url = buildUrl(HealthRecordEndpoints.CREATE_RECORD);
    const response = await axios.post<HealthRecordResponse<IHealthRecord>>(
      url,
      record,
      DEFAULT_CONFIG
    );

    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      record,
      operation: 'createHealthRecord'
    });
    throw error;
  }
};

/**
 * Updates an existing health record with HIPAA compliance checks
 * @param recordId - ID of the record to update
 * @param updates - Partial record data to update
 * @returns Promise with updated record and audit information
 */
export const updateHealthRecord = async (
  recordId: string,
  updates: Partial<IHealthRecord>
): Promise<HealthRecordResponse<IHealthRecord>> => {
  try {
    validateHIPAACompliance(updates);

    const url = buildUrl(
      processEndpointParams(HealthRecordEndpoints.UPDATE_RECORD, { id: recordId })
    );

    const response = await axios.put<HealthRecordResponse<IHealthRecord>>(
      url,
      updates,
      DEFAULT_CONFIG
    );

    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      recordId,
      updates,
      operation: 'updateHealthRecord'
    });
    throw error;
  }
};

/**
 * Exports health record in FHIR R4 format
 * @param recordId - ID of the record to export
 * @returns Promise with FHIR R4 formatted data
 */
export const exportFHIRRecord = async (
  recordId: string
): Promise<HealthRecordResponse<any>> => {
  try {
    const url = buildUrl(
      processEndpointParams(HealthRecordEndpoints.EXPORT_FHIR, { id: recordId })
    );

    const response = await axios.get<HealthRecordResponse<any>>(
      url,
      {
        ...DEFAULT_CONFIG,
        headers: {
          ...DEFAULT_CONFIG.headers,
          'Accept': 'application/fhir+json'
        }
      }
    );

    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      recordId,
      operation: 'exportFHIRRecord'
    });
    throw error;
  }
};

/**
 * Uploads an attachment to a health record with encryption
 * @param recordId - ID of the record to attach to
 * @param file - File to upload
 * @returns Promise with upload status and audit information
 */
export const uploadAttachment = async (
  recordId: string,
  file: File
): Promise<HealthRecordResponse<{ attachmentId: string }>> => {
  try {
    const url = buildUrl(
      processEndpointParams(HealthRecordEndpoints.UPLOAD_ATTACHMENT, { id: recordId })
    );

    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post<HealthRecordResponse<{ attachmentId: string }>>(
      url,
      formData,
      {
        ...DEFAULT_CONFIG,
        headers: {
          ...DEFAULT_CONFIG.headers,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    return response.data;
  } catch (error) {
    ErrorTracker.captureError(error as Error, {
      recordId,
      fileName: file.name,
      operation: 'uploadAttachment'
    });
    throw error;
  }
};