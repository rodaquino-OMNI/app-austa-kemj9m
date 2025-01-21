/**
 * @fileoverview Enhanced FHIR configuration with security and compliance features
 * Implements HL7 FHIR R4 standards with comprehensive security controls
 * @version 1.0.0
 */

import { 
  HealthRecordType, 
  IHealthRecordMetadata,
  EncryptionStatus,
  FHIRResource
} from '../../../shared/interfaces/health-record.interface';
import { ErrorCode } from '../../../shared/constants/error-codes';
// @ts-ignore - FHIR library types
import * as fhir from 'fhir'; // v4.11.2

// Global configuration constants
export const FHIR_VERSION = '4.0.1';
export const FHIR_BASE_URL = process.env.FHIR_BASE_URL;
export const FHIR_SECURITY_ENABLED = process.env.FHIR_SECURITY_ENABLED === 'true';
export const FHIR_AUDIT_ENABLED = process.env.FHIR_AUDIT_ENABLED === 'true';

/**
 * Security classification levels for PHI data
 */
enum SecurityLevel {
  RESTRICTED = 'R',
  CONFIDENTIAL = 'C',
  SENSITIVE = 'S',
  PUBLIC = 'P'
}

/**
 * HIPAA-compliant security labels
 */
const SECURITY_LABELS = {
  PHI: 'http://hl7.org/fhir/v3/Confidentiality',
  RESTRICTED: 'R',
  NORMAL: 'N',
  SENSITIVE: 'S'
};

/**
 * Enhanced FHIR resource mappings with security metadata
 */
const resourceMappings = {
  [HealthRecordType.CONSULTATION]: {
    resourceType: 'Encounter',
    profile: 'http://hl7.org/fhir/StructureDefinition/Encounter',
    securityLabel: SECURITY_LABELS.PHI,
    requiredFields: ['status', 'class', 'subject', 'participant'],
    validation: 'strict'
  },
  [HealthRecordType.LAB_RESULT]: {
    resourceType: 'DiagnosticReport',
    profile: 'http://hl7.org/fhir/StructureDefinition/DiagnosticReport',
    securityLabel: SECURITY_LABELS.RESTRICTED,
    requiredFields: ['status', 'code', 'subject', 'result'],
    validation: 'strict'
  },
  // Additional resource mappings...
};

/**
 * Enhanced validation rules with security constraints
 */
const validationRules = {
  Encounter: {
    security: {
      required: true,
      labels: [SECURITY_LABELS.PHI],
      minClassification: SecurityLevel.CONFIDENTIAL
    },
    audit: {
      required: true,
      events: ['create', 'update', 'read', 'delete']
    }
  },
  // Additional validation rules...
};

/**
 * FHIR server configuration with security settings
 */
const serverConfig = {
  version: FHIR_VERSION,
  baseUrl: FHIR_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/fhir+json',
    'Accept': 'application/fhir+json'
  },
  security: {
    tls: {
      enabled: true,
      minVersion: 'TLSv1.2'
    },
    authentication: {
      type: 'bearer',
      required: true
    }
  }
};

/**
 * Enhanced security configuration
 */
const securityConfig = {
  encryption: {
    algorithm: 'AES-256-GCM',
    keyRotationInterval: '30d',
    enabled: true
  },
  audit: {
    enabled: FHIR_AUDIT_ENABLED,
    detailedLogging: true,
    retentionPeriod: '7y'
  },
  access: {
    maxAttempts: 3,
    lockoutPeriod: '15m',
    requireMFA: true
  }
};

/**
 * Audit configuration for HIPAA compliance
 */
const auditConfig = {
  enabled: FHIR_AUDIT_ENABLED,
  events: ['create', 'read', 'update', 'delete', 'search'],
  metadata: {
    includeUserAgent: true,
    includeIPAddress: true,
    includeTimestamp: true
  },
  storage: {
    type: 'persistent',
    retention: '7y'
  }
};

/**
 * Retrieves FHIR resource mapping with security metadata
 */
export function getResourceMapping(recordType: HealthRecordType): any {
  const mapping = resourceMappings[recordType];
  if (!mapping) {
    throw new Error(ErrorCode.INVALID_INPUT);
  }
  return {
    ...mapping,
    security: {
      labels: [mapping.securityLabel],
      classification: SecurityLevel.CONFIDENTIAL
    }
  };
}

/**
 * Validates security labels and classifications for PHI data
 */
export function validateSecurityLabels(resource: FHIRResource): boolean {
  if (!resource.meta?.security) {
    return false;
  }

  const hasValidLabel = resource.meta.security.some(
    label => label.system === SECURITY_LABELS.PHI
  );

  return hasValidLabel && validateSecurityClassification(resource);
}

/**
 * Validates security classification level
 */
function validateSecurityClassification(resource: FHIRResource): boolean {
  const classification = resource.meta?.security?.find(
    s => s.system === SECURITY_LABELS.PHI
  )?.code;

  return classification && 
         Object.values(SecurityLevel).includes(classification as SecurityLevel);
}

/**
 * Main FHIR configuration object with enhanced security features
 */
export const fhirConfig = {
  version: FHIR_VERSION,
  serverConfig,
  resourceMappings,
  validationRules,
  securityConfig,
  auditConfig,
  
  // Helper methods
  getResourceMapping,
  validateSecurityLabels,
  
  // Validation methods
  validateConfig(): boolean {
    return !!(
      this.version &&
      this.serverConfig.baseUrl &&
      this.securityConfig.encryption.enabled &&
      this.auditConfig.enabled
    );
  }
};

export default fhirConfig;