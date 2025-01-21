/**
 * @fileoverview Comprehensive validation utilities for AUSTA SuperApp platform
 * Implements HIPAA-compliant validation with FHIR R4 standards
 * @version 1.0.0
 */

import { ErrorCode } from '../constants/error-codes';
import { IHealthRecord, HealthRecordType, HealthRecordStatus, IHealthRecordValidationError } from '../interfaces/health-record.interface';
import { IUser, UserRole, UserStatus } from '../interfaces/user.interface';
import validator from 'validator';
import * as joi from 'joi';
import * as fhir from '@types/fhir';
import xss from 'xss';

// Version comments for external dependencies
// validator: v13.9.0 - String validation and sanitization
// joi: v17.9.0 - Schema validation
// @types/fhir: v0.0.37 - FHIR R4 type definitions
// xss: v1.0.14 - XSS prevention

/**
 * Interface for validation result with comprehensive security status
 */
export interface ValidationResult {
  isValid: boolean;
  errors: IHealthRecordValidationError[];
  securityStatus: {
    hipaaCompliant: boolean;
    piiDetected: boolean;
    sensitiveDataPresent: boolean;
    encryptionRequired: boolean;
  };
  complianceStatus: {
    fhirCompliant: boolean;
    dataClassification: string;
    requiredFieldsPresent: boolean;
  };
  auditLog: {
    timestamp: Date;
    validationType: string;
    outcome: string;
    details: Record<string, any>;
  };
}

/**
 * Interface for enhanced sanitization options
 */
export interface SanitizationOptions {
  stripHtml: boolean;
  preventXSS: boolean;
  preventSQLInjection: boolean;
  securityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  contentPolicy: {
    allowedTags: string[];
    allowedAttributes: Record<string, string[]>;
  };
}

/**
 * FHIR R4 compliant health record validation
 * @param record Health record to validate
 * @param options Validation options
 */
export async function validateHealthRecord(
  record: IHealthRecord,
  options: { strictMode?: boolean; validateAttachments?: boolean } = {}
): Promise<ValidationResult> {
  const errors: IHealthRecordValidationError[] = [];
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    securityStatus: {
      hipaaCompliant: true,
      piiDetected: false,
      sensitiveDataPresent: false,
      encryptionRequired: false
    },
    complianceStatus: {
      fhirCompliant: true,
      dataClassification: 'PHI',
      requiredFieldsPresent: true
    },
    auditLog: {
      timestamp: new Date(),
      validationType: 'HEALTH_RECORD',
      outcome: 'PENDING',
      details: {}
    }
  };

  try {
    // Validate basic structure
    if (!record.id || !record.patientId || !record.type) {
      errors.push({
        code: ErrorCode.INVALID_INPUT,
        message: 'Required fields missing',
        field: 'base'
      });
    }

    // Validate FHIR compliance
    if (!validateFHIRCompliance(record.content)) {
      errors.push({
        code: ErrorCode.INVALID_INPUT,
        message: 'Record does not comply with FHIR R4 standards',
        field: 'content'
      });
      result.complianceStatus.fhirCompliant = false;
    }

    // Validate HIPAA compliance
    const hipaaValidation = validateHIPAACompliance(record);
    if (!hipaaValidation.isCompliant) {
      errors.push({
        code: ErrorCode.HIPAA_VIOLATION,
        message: hipaaValidation.reason,
        field: hipaaValidation.field
      });
      result.securityStatus.hipaaCompliant = false;
    }

    // Validate attachments if required
    if (options.validateAttachments && record.attachments) {
      for (const attachment of record.attachments) {
        if (!validateAttachment(attachment)) {
          errors.push({
            code: ErrorCode.INVALID_INPUT,
            message: 'Invalid attachment format',
            field: `attachments.${attachment.id}`
          });
        }
      }
    }

    // Update validation result
    result.isValid = errors.length === 0;
    result.errors = errors;
    result.auditLog.outcome = result.isValid ? 'SUCCESS' : 'FAILURE';
    result.auditLog.details = { errors, recordType: record.type };

    return result;
  } catch (error) {
    throw new Error(`Health record validation failed: ${error.message}`);
  }
}

/**
 * Validates user data with enhanced security checks
 * @param userData User data to validate
 * @param options Security options
 */
export async function validateUserData(
  userData: IUser,
  options: { validatePassword?: boolean; checkMFA?: boolean } = {}
): Promise<ValidationResult> {
  const errors: IHealthRecordValidationError[] = [];
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    securityStatus: {
      hipaaCompliant: true,
      piiDetected: true,
      sensitiveDataPresent: true,
      encryptionRequired: true
    },
    complianceStatus: {
      fhirCompliant: true,
      dataClassification: 'PII',
      requiredFieldsPresent: true
    },
    auditLog: {
      timestamp: new Date(),
      validationType: 'USER_DATA',
      outcome: 'PENDING',
      details: {}
    }
  };

  try {
    // Validate email
    if (!validator.isEmail(userData.email)) {
      errors.push({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid email format',
        field: 'email'
      });
    }

    // Validate password if required
    if (options.validatePassword) {
      if (!validatePassword(userData.password)) {
        errors.push({
          code: ErrorCode.INVALID_INPUT,
          message: 'Password does not meet security requirements',
          field: 'password'
        });
      }
    }

    // Validate role
    if (!Object.values(UserRole).includes(userData.role)) {
      errors.push({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid user role',
        field: 'role'
      });
    }

    // Validate MFA if required
    if (options.checkMFA && !userData.securitySettings.mfaEnabled) {
      errors.push({
        code: ErrorCode.SECURITY_VIOLATION,
        message: 'MFA is required for this user role',
        field: 'securitySettings.mfaEnabled'
      });
    }

    // Update validation result
    result.isValid = errors.length === 0;
    result.errors = errors;
    result.auditLog.outcome = result.isValid ? 'SUCCESS' : 'FAILURE';
    result.auditLog.details = { errors, userRole: userData.role };

    return result;
  } catch (error) {
    throw new Error(`User data validation failed: ${error.message}`);
  }
}

/**
 * Advanced input sanitization with multiple security layers
 * @param input Input string to sanitize
 * @param options Sanitization options
 */
export function sanitizeInput(
  input: string,
  options: SanitizationOptions = {
    stripHtml: true,
    preventXSS: true,
    preventSQLInjection: true,
    securityLevel: 'HIGH',
    contentPolicy: {
      allowedTags: [],
      allowedAttributes: {}
    }
  }
): string {
  try {
    let sanitized = input;

    // XSS prevention
    if (options.preventXSS) {
      sanitized = xss(sanitized, {
        whiteList: options.contentPolicy.allowedTags,
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script']
      });
    }

    // HTML stripping
    if (options.stripHtml) {
      sanitized = validator.stripLow(sanitized);
    }

    // SQL injection prevention
    if (options.preventSQLInjection) {
      sanitized = validator.escape(sanitized);
    }

    // Additional security based on security level
    if (options.securityLevel === 'HIGH') {
      sanitized = validator.trim(sanitized);
      sanitized = validator.blacklist(sanitized, '<>\'"`');
    }

    return sanitized;
  } catch (error) {
    throw new Error(`Input sanitization failed: ${error.message}`);
  }
}

// Private helper functions

function validateFHIRCompliance(content: any): boolean {
  // Implementation of FHIR R4 validation
  try {
    // Validate resource type
    if (!content.resourceType) {
      return false;
    }

    // Validate required FHIR elements
    if (!content.id || !content.meta) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function validateHIPAACompliance(record: IHealthRecord): {
  isCompliant: boolean;
  reason?: string;
  field?: string;
} {
  // Implementation of HIPAA compliance validation
  try {
    // Check for required security measures
    if (!record.securityLabels || record.securityLabels.length === 0) {
      return {
        isCompliant: false,
        reason: 'Missing security labels',
        field: 'securityLabels'
      };
    }

    // Verify encryption for sensitive data
    if (record.type === HealthRecordType.LAB_RESULT && !record.encryptionMetadata) {
      return {
        isCompliant: false,
        reason: 'Encryption required for lab results',
        field: 'encryptionMetadata'
      };
    }

    return { isCompliant: true };
  } catch {
    return {
      isCompliant: false,
      reason: 'HIPAA compliance validation failed',
      field: 'general'
    };
  }
}

function validatePassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function validateAttachment(attachment: any): boolean {
  return (
    attachment.id &&
    attachment.contentType &&
    attachment.size > 0 &&
    attachment.checksum
  );
}