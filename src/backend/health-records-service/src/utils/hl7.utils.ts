/**
 * @fileoverview Secure HL7 message processing utilities with FHIR R4 compliance
 * Implements comprehensive healthcare data interoperability with PHI protection
 * @version 1.0.0
 */

import { fhirConfig } from '../config/fhir.config';
import { 
  HealthRecordType,
  FHIRResource,
  EncryptionStatus,
  IHealthRecordValidationError
} from '../../../shared/interfaces/health-record.interface';
import { ErrorCode, ErrorMessage } from '../../../shared/constants/error-codes';
import * as hl7 from 'node-hl7-parser'; // v1.4.0
import * as fhir from 'fhir'; // v4.11.2
import * as winston from 'winston'; // v3.10.0
import { 
  validateEncryption, 
  encryptSensitiveData,
  validateSecurityContext 
} from '@austa/security-utils'; // v1.0.0

// Configure secure audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'hl7-utils' },
  transports: [
    new winston.transports.File({ filename: 'audit/hl7-operations.log' })
  ]
});

/**
 * Security context interface for operations
 */
interface SecurityContext {
  userId: string;
  permissions: string[];
  encryptionKey?: string;
  auditMetadata: {
    ipAddress: string;
    userAgent: string;
    timestamp: Date;
  };
}

/**
 * Secure HL7 message interface with PHI protection
 */
interface SecureHL7Message {
  segments: any[];
  encryptionStatus: EncryptionStatus;
  securityLabels: string[];
  validationStatus: boolean;
  metadata: {
    version: string;
    timestamp: Date;
    source: string;
  };
}

/**
 * Decorator for audit logging of operations
 */
function AuditLog() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        auditLogger.info(`Operation ${propertyKey} completed`, {
          method: propertyKey,
          args: args.map(arg => typeof arg === 'object' ? '[Object]' : arg),
          success: true
        });
        return result;
      } catch (error) {
        auditLogger.error(`Operation ${propertyKey} failed`, {
          method: propertyKey,
          error: error.message,
          success: false
        });
        throw error;
      }
    };
    return descriptor;
  };
}

/**
 * Securely parses and validates raw HL7 message with PHI detection
 */
@AuditLog()
export async function parseHL7Message(
  message: string,
  securityContext: SecurityContext
): Promise<SecureHL7Message> {
  // Validate security context
  if (!validateSecurityContext(securityContext)) {
    throw new Error(ErrorMessage[ErrorCode.UNAUTHORIZED].message);
  }

  try {
    // Parse raw message
    const parsedMessage = hl7.parse(message);

    // Detect and classify PHI content
    const segments = await Promise.all(
      parsedMessage.segments.map(async segment => {
        const encryptedSegment = await encryptSensitiveData(segment);
        return {
          ...encryptedSegment,
          securityLabels: fhirConfig.securityLabels
        };
      })
    );

    // Validate message structure
    const validationResult = hl7.validate(segments);
    if (!validationResult.isValid) {
      throw new Error(ErrorMessage[ErrorCode.INVALID_INPUT].message);
    }

    return {
      segments,
      encryptionStatus: EncryptionStatus.ENCRYPTED,
      securityLabels: fhirConfig.securityLabels,
      validationStatus: true,
      metadata: {
        version: parsedMessage.version,
        timestamp: new Date(),
        source: parsedMessage.source
      }
    };
  } catch (error) {
    auditLogger.error('HL7 parsing failed', { error: error.message });
    throw error;
  }
}

/**
 * Converts HL7 v2.x message to FHIR R4 format with security measures
 */
@AuditLog()
export async function convertHL7ToFHIR(
  parsedHL7Message: SecureHL7Message,
  recordType: HealthRecordType,
  securityContext: SecurityContext
): Promise<FHIRResource> {
  // Validate encryption status
  if (!validateEncryption(parsedHL7Message.encryptionStatus)) {
    throw new Error(ErrorMessage[ErrorCode.DATA_ENCRYPTION_ERROR].message);
  }

  try {
    // Get resource mapping
    const mapping = fhirConfig.getResourceMapping(recordType);

    // Transform to FHIR
    const fhirResource = new fhir.Resource();
    fhirResource.resourceType = mapping.resourceType;

    // Apply security labels
    fhirResource.meta = {
      security: parsedHL7Message.securityLabels.map(label => ({
        system: fhirConfig.securityConfig.encryption.algorithm,
        code: label
      }))
    };

    // Map segments to FHIR attributes
    parsedHL7Message.segments.forEach(segment => {
      const mappedData = mapping.transform(segment);
      Object.assign(fhirResource, mappedData);
    });

    // Validate FHIR resource
    const validationResult = fhir.validate(fhirResource);
    if (!validationResult.valid) {
      throw new Error(ErrorMessage[ErrorCode.INVALID_INPUT].message);
    }

    return fhirResource;
  } catch (error) {
    auditLogger.error('FHIR conversion failed', { error: error.message });
    throw error;
  }
}

/**
 * Handles secure HL7 message transformations with comprehensive security
 */
@AuditLog()
export class SecureHL7Transformer {
  private securityConfig: any;
  private validationRules: any;
  private auditLogger: any;
  private encryptionService: any;

  constructor(config: any, auditConfig: any) {
    this.securityConfig = config;
    this.validationRules = fhirConfig.validationRules;
    this.auditLogger = auditLogger;
    this.encryptionService = new encryptSensitiveData.EncryptionService(config);
  }

  /**
   * Securely transforms HL7 message with PHI protection
   */
  @AuditLog()
  async transformMessage(
    message: SecureHL7Message,
    targetFormat: string,
    context: SecurityContext
  ): Promise<any> {
    // Validate security context
    if (!validateSecurityContext(context)) {
      throw new Error(ErrorMessage[ErrorCode.UNAUTHORIZED].message);
    }

    try {
      // Apply transformation rules
      const transformed = await this.applyTransformationRules(
        message,
        targetFormat
      );

      // Validate security compliance
      if (!this.validateSecurityCompliance(transformed)) {
        throw new Error(ErrorMessage[ErrorCode.HIPAA_VIOLATION].message);
      }

      // Encrypt sensitive data
      const secured = await this.encryptionService.encrypt(transformed);

      return secured;
    } catch (error) {
      this.auditLogger.error('Message transformation failed', {
        error: error.message
      });
      throw error;
    }
  }

  private async applyTransformationRules(
    message: SecureHL7Message,
    targetFormat: string
  ): Promise<any> {
    const rules = this.validationRules[targetFormat];
    if (!rules) {
      throw new Error(ErrorMessage[ErrorCode.INVALID_INPUT].message);
    }
    return rules.transform(message);
  }

  private validateSecurityCompliance(data: any): boolean {
    return this.validationRules.security.validate(data);
  }
}