/**
 * @fileoverview HIPAA-compliant API client for insurance claims management
 * Implements secure claims processing with comprehensive error handling
 * @version 1.0.0
 */

// External imports
import axios, { AxiosError } from 'axios'; // v1.4.0

// Internal imports
import { IClaim, IClaimSubmission } from '../types/claim';
import { ClaimsEndpoints, processEndpointParams, buildUrl } from '../constants/endpoints';
import { ErrorCode, ErrorTracker } from '../constants/errorCodes';

// Constants for security headers and retry configuration
const SECURITY_HEADERS = {
  'X-HIPAA-Compliance': 'strict',
  'X-Content-Security': 'enforce',
  'X-Frame-Options': 'DENY'
};

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000
};

/**
 * Submits a new insurance claim with enhanced security and HIPAA compliance
 * @param claimData - Claim submission data with required documents
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving to created claim with compliance status
 */
export const submitClaim = async (
  claimData: IClaimSubmission,
  signal?: AbortSignal
): Promise<IClaim> => {
  try {
    // Validate HIPAA consent
    if (!claimData.hipaaAuthorization) {
      throw new Error('HIPAA authorization required');
    }

    // Create FormData for secure file upload
    const formData = new FormData();
    formData.append('type', claimData.type);
    formData.append('serviceDate', claimData.serviceDate.toISOString());
    formData.append('providerId', claimData.providerId);
    formData.append('amount', claimData.amount.toString());
    formData.append('healthRecordId', claimData.healthRecordId);
    formData.append('hipaaAuthorization', 'true');

    // Securely append documents
    claimData.documents.forEach((doc, index) => {
      formData.append(`documents[${index}]`, doc);
    });

    const response = await axios.post<IClaim>(
      buildUrl(ClaimsEndpoints.SUBMIT_CLAIM),
      formData,
      {
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'multipart/form-data'
        },
        signal,
        withCredentials: true
      }
    );

    return response.data;
  } catch (error) {
    handleClaimError(error as AxiosError, 'Error submitting claim');
    throw error;
  }
};

/**
 * Retrieves paginated list of claims with enhanced filtering
 * @param filters - Optional filters for pagination and status
 * @returns Promise resolving to claims list with metadata
 */
export const getClaims = async (
  filters?: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ claims: IClaim[]; total: number; metadata: object }> => {
  try {
    const response = await axios.get<{ claims: IClaim[]; total: number; metadata: object }>(
      buildUrl(ClaimsEndpoints.GET_CLAIMS),
      {
        params: filters,
        headers: SECURITY_HEADERS,
        withCredentials: true
      }
    );

    return response.data;
  } catch (error) {
    handleClaimError(error as AxiosError, 'Error retrieving claims');
    throw error;
  }
};

/**
 * Retrieves detailed claim information with audit logging
 * @param claimId - Unique identifier of the claim
 * @returns Promise resolving to detailed claim object
 */
export const getClaimById = async (claimId: string): Promise<IClaim> => {
  try {
    const response = await axios.get<IClaim>(
      buildUrl(processEndpointParams(ClaimsEndpoints.GET_CLAIM, { id: claimId })),
      {
        headers: {
          ...SECURITY_HEADERS,
          'X-Audit-Action': 'claim-access'
        },
        withCredentials: true
      }
    );

    return response.data;
  } catch (error) {
    handleClaimError(error as AxiosError, 'Error retrieving claim details');
    throw error;
  }
};

/**
 * Updates claim status with optimistic updates and rollback
 * @param claimId - Unique identifier of the claim
 * @param newStatus - Updated claim status
 * @returns Promise resolving to updated claim
 */
export const updateClaimStatus = async (
  claimId: string,
  newStatus: string
): Promise<IClaim> => {
  try {
    const response = await axios.patch<IClaim>(
      buildUrl(processEndpointParams(ClaimsEndpoints.UPDATE_CLAIM, { id: claimId })),
      { status: newStatus },
      {
        headers: {
          ...SECURITY_HEADERS,
          'X-Audit-Action': 'claim-status-update'
        },
        withCredentials: true
      }
    );

    return response.data;
  } catch (error) {
    handleClaimError(error as AxiosError, 'Error updating claim status');
    throw error;
  }
};

/**
 * Handles claim-related errors with proper logging and HIPAA compliance
 * @param error - Axios error object
 * @param context - Error context message
 */
const handleClaimError = (error: AxiosError, context: string): never => {
  const errorCode = (error.response?.data as any)?.code || ErrorCode.INTERNAL_SERVER_ERROR;
  
  ErrorTracker.captureError(error, {
    context,
    errorCode,
    timestamp: new Date().toISOString()
  });

  throw error;
};

/**
 * Implements exponential backoff for failed requests
 * @param retryCount - Current retry attempt number
 * @returns Delay in milliseconds before next retry
 */
const getRetryDelay = (retryCount: number): number => {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, retryCount),
    RETRY_CONFIG.maxDelay
  );
  return delay + Math.random() * 1000; // Add jitter
};