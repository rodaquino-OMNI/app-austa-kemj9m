/**
 * @fileoverview Centralized API endpoint configuration for AUSTA SuperApp web application
 * Provides type-safe endpoint constants with versioned URIs and standardized path construction
 */

// Global constants for API configuration
export const API_VERSION = 'v1';
export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.austa.health';

/**
 * Constructs a complete API URL with proper versioning and path segments
 * @param path - The API endpoint path to append
 * @returns Fully constructed API endpoint URL
 */
export const buildUrl = (path: string): string => {
  // Remove leading/trailing slashes and sanitize path
  const sanitizedPath = path.replace(/^\/+|\/+$/g, '');
  return `${BASE_URL}/${API_VERSION}/${sanitizedPath}`;
};

/**
 * Authentication service endpoint constants
 * Provides comprehensive authentication flow endpoints
 */
export enum AuthEndpoints {
  LOGIN = '/auth/login',
  REGISTER = '/auth/register',
  REFRESH_TOKEN = '/auth/refresh',
  VERIFY_TOKEN = '/auth/verify',
  VERIFY_BIOMETRIC = '/auth/verify-biometric',
  LOGOUT = '/auth/logout',
  RESET_PASSWORD = '/auth/reset-password',
  VERIFY_EMAIL = '/auth/verify-email'
}

/**
 * Health Records service endpoint constants
 * Supports FHIR-compliant health record management and sharing
 */
export enum HealthRecordEndpoints {
  GET_RECORDS = '/health-records',
  GET_RECORD = '/health-records/:id',
  CREATE_RECORD = '/health-records',
  UPDATE_RECORD = '/health-records/:id',
  DELETE_RECORD = '/health-records/:id',
  UPLOAD_ATTACHMENT = '/health-records/:id/attachments',
  EXPORT_FHIR = '/health-records/:id/fhir',
  SHARE_RECORD = '/health-records/:id/share',
  REVOKE_ACCESS = '/health-records/:id/access/:userId'
}

/**
 * Virtual Care service endpoint constants
 * Manages telemedicine session endpoints and real-time features
 */
export enum VirtualCareEndpoints {
  CREATE_SESSION = '/virtual-care/sessions',
  JOIN_SESSION = '/virtual-care/sessions/:id/join',
  END_SESSION = '/virtual-care/sessions/:id/end',
  GET_SESSION_TOKEN = '/virtual-care/sessions/:id/token',
  UPDATE_SESSION_STATUS = '/virtual-care/sessions/:id/status',
  SHARE_SCREEN = '/virtual-care/sessions/:id/screen-share',
  SEND_CHAT_MESSAGE = '/virtual-care/sessions/:id/chat'
}

/**
 * Insurance Claims service endpoint constants
 * Handles claim submission and document management
 */
export enum ClaimsEndpoints {
  SUBMIT_CLAIM = '/claims',
  GET_CLAIMS = '/claims',
  GET_CLAIM = '/claims/:id',
  UPDATE_CLAIM = '/claims/:id',
  UPLOAD_DOCUMENTS = '/claims/:id/documents',
  CHECK_STATUS = '/claims/:id/status',
  CANCEL_CLAIM = '/claims/:id/cancel'
}

/**
 * Marketplace service endpoint constants
 * Manages digital health product catalog and recommendations
 */
export enum MarketplaceEndpoints {
  GET_PRODUCTS = '/marketplace/products',
  GET_PRODUCT = '/marketplace/products/:id',
  PURCHASE_PRODUCT = '/marketplace/products/:id/purchase',
  GET_CATEGORIES = '/marketplace/categories',
  SEARCH_PRODUCTS = '/marketplace/products/search',
  GET_RECOMMENDATIONS = '/marketplace/recommendations'
}

// Type definitions for endpoint parameters
export type EndpointParams = {
  id?: string;
  userId?: string;
};

/**
 * Replaces URL parameters in endpoint paths with actual values
 * @param endpoint - The endpoint template with parameters
 * @param params - Object containing parameter values
 * @returns Processed endpoint URL with replaced parameters
 */
export const processEndpointParams = (endpoint: string, params?: EndpointParams): string => {
  let processedEndpoint = endpoint;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      processedEndpoint = processedEndpoint.replace(`:${key}`, value);
    });
  }
  return processedEndpoint;
};

// Export all endpoint types for type-safety across the application
export type AuthEndpoint = AuthEndpoints;
export type HealthRecordEndpoint = HealthRecordEndpoints;
export type VirtualCareEndpoint = VirtualCareEndpoints;
export type ClaimsEndpoint = ClaimsEndpoints;
export type MarketplaceEndpoint = MarketplaceEndpoints;