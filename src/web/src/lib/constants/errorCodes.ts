/**
 * @fileoverview Frontend error codes and handling for AUSTA SuperApp
 * Implements HIPAA-compliant error messages with internationalization and tracking
 * @version 1.0.0
 */

// External imports
import * as Sentry from '@sentry/browser'; // v7.0.0
import i18next from 'i18next'; // v23.0.0

// Internal imports
import { ErrorCategory, ErrorCode } from '../../../backend/shared/constants/error-codes';

/**
 * HTTP status codes used in API responses
 */
export enum HTTP_STATUS {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504
}

/**
 * Re-export error categories and codes for frontend use
 */
export { ErrorCategory, ErrorCode };

/**
 * HIPAA-compliant error messages with tracking metadata
 * Messages are designed to be user-friendly while maintaining security
 */
export const ErrorMessage: Record<ErrorCode, {
  message: string;
  category: ErrorCategory;
  httpStatus: HTTP_STATUS;
  tracking: {
    severity: 'low' | 'medium' | 'high';
    shouldReport: boolean;
  };
}> = {
  [ErrorCode.UNAUTHORIZED]: {
    message: i18next.t('errors.unauthorized'),
    category: ErrorCategory.AUTHENTICATION,
    httpStatus: HTTP_STATUS.UNAUTHORIZED,
    tracking: { severity: 'medium', shouldReport: true }
  },
  [ErrorCode.FORBIDDEN]: {
    message: i18next.t('errors.forbidden'),
    category: ErrorCategory.AUTHORIZATION,
    httpStatus: HTTP_STATUS.FORBIDDEN,
    tracking: { severity: 'medium', shouldReport: true }
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    message: i18next.t('errors.invalidCredentials'),
    category: ErrorCategory.AUTHENTICATION,
    httpStatus: HTTP_STATUS.UNAUTHORIZED,
    tracking: { severity: 'medium', shouldReport: true }
  },
  [ErrorCode.TOKEN_EXPIRED]: {
    message: i18next.t('errors.sessionExpired'),
    category: ErrorCategory.AUTHENTICATION,
    httpStatus: HTTP_STATUS.UNAUTHORIZED,
    tracking: { severity: 'low', shouldReport: false }
  },
  [ErrorCode.INVALID_INPUT]: {
    message: i18next.t('errors.invalidInput'),
    category: ErrorCategory.VALIDATION,
    httpStatus: HTTP_STATUS.BAD_REQUEST,
    tracking: { severity: 'low', shouldReport: false }
  },
  [ErrorCode.RESOURCE_NOT_FOUND]: {
    message: i18next.t('errors.resourceNotFound'),
    category: ErrorCategory.BUSINESS_LOGIC,
    httpStatus: HTTP_STATUS.NOT_FOUND,
    tracking: { severity: 'low', shouldReport: false }
  },
  [ErrorCode.DUPLICATE_RECORD]: {
    message: i18next.t('errors.duplicateRecord'),
    category: ErrorCategory.BUSINESS_LOGIC,
    httpStatus: HTTP_STATUS.CONFLICT,
    tracking: { severity: 'low', shouldReport: false }
  },
  [ErrorCode.DATABASE_ERROR]: {
    message: i18next.t('errors.systemError'),
    category: ErrorCategory.DATABASE,
    httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.EXTERNAL_API_ERROR]: {
    message: i18next.t('errors.serviceError'),
    category: ErrorCategory.EXTERNAL_SERVICE,
    httpStatus: HTTP_STATUS.BAD_GATEWAY,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.NETWORK_ERROR]: {
    message: i18next.t('errors.networkError'),
    category: ErrorCategory.NETWORK,
    httpStatus: HTTP_STATUS.SERVICE_UNAVAILABLE,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    message: i18next.t('errors.systemError'),
    category: ErrorCategory.SYSTEM,
    httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.SERVICE_UNAVAILABLE]: {
    message: i18next.t('errors.serviceUnavailable'),
    category: ErrorCategory.SYSTEM,
    httpStatus: HTTP_STATUS.SERVICE_UNAVAILABLE,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.HIPAA_VIOLATION]: {
    message: i18next.t('errors.securityViolation'),
    category: ErrorCategory.SYSTEM,
    httpStatus: HTTP_STATUS.FORBIDDEN,
    tracking: { severity: 'high', shouldReport: true }
  },
  [ErrorCode.RATE_LIMIT_EXCEEDED]: {
    message: i18next.t('errors.tooManyRequests'),
    category: ErrorCategory.SYSTEM,
    httpStatus: HTTP_STATUS.TOO_MANY_REQUESTS,
    tracking: { severity: 'medium', shouldReport: true }
  }
};

/**
 * Error tracking utility for monitoring and analytics
 */
export const ErrorTracker = {
  /**
   * Captures and reports errors to monitoring service
   * @param error - Error object to track
   * @param context - Additional context for the error
   */
  captureError: (error: Error, context?: Record<string, any>): void => {
    const errorCode = (error as any).code as ErrorCode;
    const errorInfo = errorCode ? ErrorMessage[errorCode] : null;

    if (errorInfo?.tracking.shouldReport) {
      Sentry.captureException(error, {
        level: errorInfo.tracking.severity as Sentry.SeverityLevel,
        tags: {
          category: errorInfo.category,
          httpStatus: errorInfo.httpStatus
        },
        contexts: {
          error: context
        }
      });
    }
  }
};