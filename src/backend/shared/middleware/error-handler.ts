/**
 * @fileoverview Global error handling middleware with HIPAA compliance and security features
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import { ErrorCode, ErrorCategory, ErrorMessage, ErrorSeverity } from '../constants/error-codes';
import { HttpStatus, isClientErrorStatus, isServerErrorStatus } from '../constants/http-status';
import { globalLogger as Logger } from './logger';

// PII/PHI detection patterns for error message sanitization
const SENSITIVE_DATA_PATTERNS = {
  SSN: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  MRN: /\b\d{8}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  DOB: /\b\d{2}[-/]\d{2}[-/]\d{4}\b/g
};

/**
 * Enhanced custom error class with security context and compliance features
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: any;
  public readonly securityContext: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    timestamp: number;
    source: string;
  };
  public readonly complianceMetadata: {
    hipaaRelevant: boolean;
    lgpdRelevant: boolean;
    containsPHI: boolean;
    containsPII: boolean;
    auditRequired: boolean;
  };
  public readonly auditTrail: {
    errorId: string;
    timestamp: number;
    severity: ErrorSeverity;
    category: ErrorCategory;
  };

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: any,
    securityContext?: any,
    complianceMetadata?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Initialize security context
    this.securityContext = {
      userId: securityContext?.userId,
      sessionId: securityContext?.sessionId,
      requestId: securityContext?.requestId,
      timestamp: Date.now(),
      source: securityContext?.source || 'system'
    };

    // Initialize compliance metadata
    this.complianceMetadata = {
      hipaaRelevant: complianceMetadata?.hipaaRelevant || false,
      lgpdRelevant: complianceMetadata?.lgpdRelevant || false,
      containsPHI: complianceMetadata?.containsPHI || false,
      containsPII: complianceMetadata?.containsPII || false,
      auditRequired: ErrorMessage[code]?.auditRequired || false
    };

    // Initialize audit trail
    this.auditTrail = {
      errorId: crypto.randomUUID(),
      timestamp: Date.now(),
      severity: ErrorMessage[code]?.severity || ErrorSeverity.HIGH,
      category: ErrorMessage[code]?.category || ErrorCategory.SYSTEM
    };

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Sanitizes error details to prevent sensitive data exposure
 */
function sanitizeErrorDetails(details: any): any {
  if (!details) return details;

  const sanitized = JSON.parse(JSON.stringify(details));
  
  Object.values(SENSITIVE_DATA_PATTERNS).forEach(pattern => {
    const sanitizeValue = (obj: any) => {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(pattern, '***REDACTED***');
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeValue(obj[key]);
        }
      });
    };
    sanitizeValue(sanitized);
  });

  return sanitized;
}

/**
 * Formats error response according to HIPAA compliance requirements
 */
function formatErrorResponse(error: AppError): any {
  return {
    error: {
      code: error.code,
      message: ErrorMessage[error.code]?.message || error.message,
      correlationId: error.securityContext.requestId,
      timestamp: error.securityContext.timestamp,
      details: error.complianceMetadata.containsPHI ? undefined : sanitizeErrorDetails(error.details)
    }
  };
}

/**
 * Global error handling middleware with enhanced security and monitoring
 */
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Initialize error tracking context
  const securityContext = {
    userId: req.user?.id,
    sessionId: req.session?.id,
    requestId: req.id || crypto.randomUUID(),
    source: 'http'
  };

  // Convert to AppError if needed
  const appError = error instanceof AppError
    ? error
    : new AppError(
        error.message,
        ErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        { originalError: error.stack },
        securityContext
      );

  // Enhanced error logging with security context
  Logger.log('error', appError.message, {
    errorId: appError.auditTrail.errorId,
    code: appError.code,
    stack: appError.stack,
    securityContext: appError.securityContext,
    complianceMetadata: appError.complianceMetadata,
    category: appError.auditTrail.category,
    severity: appError.auditTrail.severity
  });

  // Compliance audit logging if required
  if (appError.complianceMetadata.auditRequired) {
    Logger.log('audit', 'Security relevant error occurred', {
      errorId: appError.auditTrail.errorId,
      code: appError.code,
      securityContext: appError.securityContext,
      complianceMetadata: appError.complianceMetadata
    });
  }

  // Format and send secure error response
  res.status(appError.statusCode).json(formatErrorResponse(appError));
};

/**
 * Utility function to create standardized application errors
 */
export function createAppError(
  code: ErrorCode,
  details?: any,
  securityContext?: any,
  complianceMetadata?: any
): AppError {
  const errorDef = ErrorMessage[code];
  const statusCode = isClientErrorStatus(HttpStatus.BAD_REQUEST) ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;

  return new AppError(
    errorDef.message,
    code,
    statusCode,
    details,
    securityContext,
    complianceMetadata
  );
}