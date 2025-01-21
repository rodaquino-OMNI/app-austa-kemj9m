/**
 * @fileoverview FHIR R4 compliant health record interfaces with enhanced security
 * Implements comprehensive data structures for medical records management
 * @version 1.0.0
 */

import { ErrorCode } from '../constants/error-codes';

/**
 * Comprehensive types of health records supported by the system
 */
export enum HealthRecordType {
  CONSULTATION = 'CONSULTATION',
  LAB_RESULT = 'LAB_RESULT',
  PRESCRIPTION = 'PRESCRIPTION',
  IMAGING = 'IMAGING',
  VITAL_SIGNS = 'VITAL_SIGNS',
  WEARABLE_DATA = 'WEARABLE_DATA'
}

/**
 * Status indicators for health records with encryption state
 */
export enum HealthRecordStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  AMENDED = 'AMENDED',
  DELETED = 'DELETED',
  ENCRYPTED = 'ENCRYPTED'
}

/**
 * Encryption status for attachments and content
 */
export enum EncryptionStatus {
  UNENCRYPTED = 'UNENCRYPTED',
  ENCRYPTED = 'ENCRYPTED',
  PENDING = 'PENDING',
  FAILED = 'FAILED'
}

/**
 * FHIR Resource type definition
 */
export type FHIRResource = {
  resourceType: string;
  id: string;
  meta: {
    versionId: string;
    lastUpdated: string;
    security: Array<{
      system: string;
      code: string;
    }>;
  };
  [key: string]: any;
};

/**
 * Interface for encryption metadata
 */
export interface IEncryptionMetadata {
  algorithm: string;
  keyId: string;
  encryptedAt: Date;
  encryptedBy: string;
  version: string;
  checksum: string;
}

/**
 * Interface for access logging
 */
export interface IAccessLog {
  timestamp: Date;
  userId: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
}

/**
 * Enhanced interface for health record metadata
 */
export interface IHealthRecordMetadata {
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  facility: string;
  department: string;
  accessHistory: IAccessLog[];
  complianceFlags: string[];
}

/**
 * Enhanced interface for health record attachments
 */
export interface IHealthRecordAttachment {
  id: string;
  type: string;
  title: string;
  contentType: string;
  size: number;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
  checksum: string;
  encryptionStatus: EncryptionStatus;
}

/**
 * Main interface for health record with enhanced security features
 */
export interface IHealthRecord {
  id: string;
  patientId: string;
  providerId: string;
  type: HealthRecordType;
  date: Date;
  content: FHIRResource;
  metadata: IHealthRecordMetadata;
  attachments: IHealthRecordAttachment[];
  status: HealthRecordStatus;
  securityLabels: string[];
  encryptionMetadata?: IEncryptionMetadata;
}

/**
 * Interface for health record validation errors
 */
export interface IHealthRecordValidationError {
  code: ErrorCode;
  field?: string;
  message: string;
  details?: any;
}

/**
 * Type for health record access permissions
 */
export type HealthRecordPermission = {
  read: boolean;
  write: boolean;
  delete: boolean;
  share: boolean;
  encrypt: boolean;
  decrypt: boolean;
};

/**
 * Interface for health record audit events
 */
export interface IHealthRecordAuditEvent {
  eventId: string;
  recordId: string;
  timestamp: Date;
  actorId: string;
  action: string;
  outcome: string;
  details: {
    resourceType: string;
    securityLabels: string[];
    accessType: string;
    systemId: string;
  };
}