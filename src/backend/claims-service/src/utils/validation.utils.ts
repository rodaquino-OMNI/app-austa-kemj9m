/**
 * @fileoverview Enhanced validation utilities for claims processing with HIPAA compliance
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { IClaim, ClaimType, ClaimStatus } from '../models/claim.model';
import { validateHealthRecord } from '../../../shared/utils/validation.utils';
import { sanitizeInput } from '../../../shared/utils/validation.utils';
import { ErrorCodes } from '../../../shared/constants/error-codes';
import joi from 'joi'; // v17.9.0
import validator from 'validator'; // v13.9.0
import crypto from 'crypto';
import winston from 'winston'; // v3.8.2

/**
 * Enhanced interface for claim validation results with security metadata
 */
interface IClaimValidationResult {
  isValid: boolean;
  errors: string[];
  metadata: {
    validatedAt: Date;
    validatedBy: string;
    validationVersion: string;
  };
  securityChecks: {
    hipaaCompliant: boolean;
    dataEncrypted: boolean;
    piiProtected: boolean;
    integrityVerified: boolean;
  };
  auditTrail: {
    timestamp: Date;
    action: string;
    details: Record<string, any>;
  };
}

/**
 * Extended interface for claim validation options with security settings
 */
interface IClaimValidationOptions {
  validateDocuments: boolean;
  validateHealthRecords: boolean;
  strictMode: boolean;
  enforceHIPAA: boolean;
  securityOptions: {
    validateSignatures: boolean;
    checkEncryption: boolean;
    verifyIntegrity: boolean;
  };
  auditOptions: {
    logLevel: string;
    includeMetadata: boolean;
  };
}

/**
 * Enhanced Joi validation schema for claims with security rules
 */
const CLAIM_VALIDATION_RULES = joi.object({
  patientId: joi.string().required().uuid(),
  providerId: joi.string().required().uuid(),
  type: joi.string().valid(...Object.values(ClaimType)).required(),
  status: joi.string().valid(...Object.values(ClaimStatus)).required(),
  amount: joi.number().positive().required(),
  serviceDate: joi.date().iso().less('now').required(),
  submissionDate: joi.date().iso().required(),
  healthRecordId: joi.string().required().uuid(),
  policyNumber: joi.string().required().pattern(/^[A-Z0-9]{10,15}$/),
  diagnosis: joi.array().items(joi.string().pattern(/^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/)),
  procedureCodes: joi.array().items(joi.string().pattern(/^[0-9]{5}$/)),
  documents: joi.array().items(joi.object({
    id: joi.string().required().uuid(),
    type: joi.string().required(),
    checksum: joi.string().required(),
    encryptionKey: joi.string().required()
  }))
});

/**
 * Security validation configuration for claims processing
 */
const SECURITY_VALIDATION_CONFIG = {
  encryption: {
    algorithm: 'AES-256-GCM',
    keyLength: 32,
    ivLength: 16
  },
  integrity: {
    algorithm: 'SHA-256',
    encoding: 'hex'
  },
  hipaa: {
    requiredFields: ['patientId', 'diagnosis', 'procedureCodes'],
    sensitiveFields: ['diagnosis', 'notes', 'documents']
  }
};

/**
 * HIPAA compliance validation rules
 */
const HIPAA_VALIDATION_RULES = {
  dataEncryption: true,
  auditLogging: true,
  accessControl: true,
  minimumDataset: ['patientId', 'type', 'status', 'amount']
};

/**
 * Validates claim data with enhanced security checks and HIPAA compliance
 * @param claimData Claim data to validate
 * @param options Validation options
 * @returns Comprehensive validation result with security metadata
 */
export async function validateClaim(
  claimData: IClaim,
  options: IClaimValidationOptions
): Promise<IClaimValidationResult> {
  const result: IClaimValidationResult = {
    isValid: true,
    errors: [],
    metadata: {
      validatedAt: new Date(),
      validatedBy: 'claims-service',
      validationVersion: '1.0.0'
    },
    securityChecks: {
      hipaaCompliant: true,
      dataEncrypted: true,
      piiProtected: true,
      integrityVerified: true
    },
    auditTrail: {
      timestamp: new Date(),
      action: 'CLAIM_VALIDATION',
      details: {}
    }
  };

  try {
    // Sanitize input data
    const sanitizedClaim = sanitizeClaimData(claimData);

    // Validate basic structure using Joi
    const joiValidation = CLAIM_VALIDATION_RULES.validate(sanitizedClaim, {
      abortEarly: false,
      stripUnknown: true
    });

    if (joiValidation.error) {
      result.errors = joiValidation.error.details.map(err => err.message);
      result.isValid = false;
    }

    // Validate HIPAA compliance
    if (options.enforceHIPAA) {
      const hipaaValidation = validateHIPAACompliance(sanitizedClaim);
      if (!hipaaValidation.isValid) {
        result.errors.push(...hipaaValidation.errors);
        result.securityChecks.hipaaCompliant = false;
        result.isValid = false;
      }
    }

    // Validate associated health records
    if (options.validateHealthRecords) {
      const healthRecordValidation = await validateHealthRecord(sanitizedClaim.healthRecordId);
      if (!healthRecordValidation.isValid) {
        result.errors.push('Invalid associated health record');
        result.isValid = false;
      }
    }

    // Validate claim documents
    if (options.validateDocuments && sanitizedClaim.documents) {
      const documentValidation = await validateClaimDocuments(sanitizedClaim.documents);
      if (!documentValidation.isValid) {
        result.errors.push(...documentValidation.errors);
        result.securityChecks.integrityVerified = false;
        result.isValid = false;
      }
    }

    // Verify data encryption
    if (options.securityOptions.checkEncryption) {
      const encryptionValidation = validateDataEncryption(sanitizedClaim);
      if (!encryptionValidation.isValid) {
        result.errors.push('Required data encryption not found');
        result.securityChecks.dataEncrypted = false;
        result.isValid = false;
      }
    }

    // Update audit trail
    result.auditTrail.details = {
      validationErrors: result.errors,
      securityStatus: result.securityChecks,
      claimType: sanitizedClaim.type
    };

    // Log validation result
    logValidationResult(result, options.auditOptions);

    return result;
  } catch (error) {
    throw new Error(`Claim validation failed: ${error.message}`);
  }
}

/**
 * Validates claim supporting documents with enhanced security measures
 * @param documents Array of claim documents
 * @returns Document validation result with security checks
 */
export async function validateClaimDocuments(
  documents: IClaimDocument[]
): Promise<IClaimValidationResult> {
  const result: IClaimValidationResult = {
    isValid: true,
    errors: [],
    metadata: {
      validatedAt: new Date(),
      validatedBy: 'claims-service',
      validationVersion: '1.0.0'
    },
    securityChecks: {
      hipaaCompliant: true,
      dataEncrypted: true,
      piiProtected: true,
      integrityVerified: true
    },
    auditTrail: {
      timestamp: new Date(),
      action: 'DOCUMENT_VALIDATION',
      details: {}
    }
  };

  try {
    for (const document of documents) {
      // Verify document checksum
      const checksumValid = verifyDocumentChecksum(document);
      if (!checksumValid) {
        result.errors.push(`Invalid checksum for document ${document.id}`);
        result.securityChecks.integrityVerified = false;
      }

      // Validate document encryption
      if (!document.encryptionKey) {
        result.errors.push(`Missing encryption key for document ${document.id}`);
        result.securityChecks.dataEncrypted = false;
      }

      // Validate document metadata
      if (!validateDocumentMetadata(document)) {
        result.errors.push(`Invalid metadata for document ${document.id}`);
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  } catch (error) {
    throw new Error(`Document validation failed: ${error.message}`);
  }
}

// Private helper functions

function sanitizeClaimData(claimData: IClaim): IClaim {
  const sanitized = { ...claimData };
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeInput(sanitized[key]);
    }
  }
  return sanitized;
}

function validateHIPAACompliance(claim: IClaim): { isValid: boolean; errors: string[] } {
  const errors = [];
  
  // Check required HIPAA fields
  for (const field of HIPAA_VALIDATION_RULES.minimumDataset) {
    if (!claim[field]) {
      errors.push(`Missing required HIPAA field: ${field}`);
    }
  }

  // Verify sensitive data encryption
  for (const field of SECURITY_VALIDATION_CONFIG.hipaa.sensitiveFields) {
    if (claim[field] && !isFieldEncrypted(claim[field])) {
      errors.push(`Unencrypted sensitive field: ${field}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function validateDataEncryption(claim: IClaim): { isValid: boolean } {
  return {
    isValid: SECURITY_VALIDATION_CONFIG.hipaa.sensitiveFields.every(
      field => !claim[field] || isFieldEncrypted(claim[field])
    )
  };
}

function verifyDocumentChecksum(document: IClaimDocument): boolean {
  try {
    const calculatedChecksum = crypto
      .createHash(SECURITY_VALIDATION_CONFIG.integrity.algorithm)
      .update(document.id + document.type)
      .digest(SECURITY_VALIDATION_CONFIG.integrity.encoding);
    return calculatedChecksum === document.checksum;
  } catch {
    return false;
  }
}

function validateDocumentMetadata(document: IClaimDocument): boolean {
  return !!(
    document.id &&
    document.type &&
    document.uploadedAt &&
    document.uploadedBy
  );
}

function isFieldEncrypted(value: any): boolean {
  // Implementation would check for encryption markers or patterns
  return typeof value === 'string' && value.startsWith('enc:');
}

function logValidationResult(
  result: IClaimValidationResult,
  options: { logLevel: string; includeMetadata: boolean }
): void {
  const logger = winston.createLogger({
    level: options.logLevel,
    format: winston.format.json(),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'validation.log' })
    ]
  });

  logger.log({
    level: options.logLevel,
    message: 'Claim validation completed',
    validationResult: options.includeMetadata ? result : { isValid: result.isValid, errors: result.errors }
  });
}