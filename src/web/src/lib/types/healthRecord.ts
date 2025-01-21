/**
 * @fileoverview TypeScript types and interfaces for health record data structures
 * Implements FHIR R4 compliant data models with enhanced PHI protection
 * @version 1.0.0
 */

// External imports - v5.0.0
import { ErrorCode } from '../constants/errorCodes';

/**
 * Comprehensive enum defining all supported types of health records
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
 * Enum defining possible health record statuses for lifecycle management
 */
export enum HealthRecordStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  AMENDED = 'AMENDED',
  DELETED = 'DELETED'
}

/**
 * HIPAA compliance tracking interface
 */
interface IHIPAACompliance {
  isProtectedHealth: boolean;
  dataMinimizationApplied: boolean;
  encryptionVerified: boolean;
  accessRestrictions: string[];
  lastComplianceCheck: Date;
  complianceOfficer: string;
}

/**
 * Audit trail entry interface
 */
interface IAuditEntry {
  timestamp: Date;
  action: string;
  performedBy: string;
  ipAddress: string;
  changes?: Record<string, any>;
}

/**
 * Enhanced metadata interface with HIPAA compliance tracking and audit capabilities
 */
export interface IHealthRecordMetadata {
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  facility: string;
  department: string;
  hipaaCompliance: IHIPAACompliance;
  auditTrail: IAuditEntry[];
}

/**
 * Interface for secure health record attachments with encryption and integrity verification
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
  encryptionDetails: {
    algorithm: string;
    keyId: string;
    initVector: string;
  };
  securityHash: string;
}

/**
 * Comprehensive interface for health record data structure with enhanced security features
 */
export interface IHealthRecord {
  id: string;
  patientId: string;
  providerId: string;
  type: HealthRecordType;
  date: Date;
  content: Record<string, any>;
  metadata: IHealthRecordMetadata;
  attachments: IHealthRecordAttachment[];
  status: HealthRecordStatus;
  securityClassification: string;
  encryptionLevel: string;
}

/**
 * FHIR R4 Resource Types supported by the system
 */
export enum FHIRResourceType {
  PATIENT = 'Patient',
  OBSERVATION = 'Observation',
  DIAGNOSTIC_REPORT = 'DiagnosticReport',
  MEDICATION_REQUEST = 'MedicationRequest',
  IMAGING_STUDY = 'ImagingStudy',
  DEVICE_METRIC = 'DeviceMetric'
}

/**
 * Interface for wearable device data integration
 */
export interface IWearableData {
  deviceId: string;
  deviceType: string;
  timestamp: Date;
  metrics: {
    heartRate?: number;
    bloodPressure?: {
      systolic: number;
      diastolic: number;
    };
    bloodOxygen?: number;
    steps?: number;
    temperature?: number;
    sleep?: {
      startTime: Date;
      endTime: Date;
      quality: string;
    };
  };
  calibrationStatus: string;
  accuracy: number;
}

/**
 * Error types specific to health record operations
 */
export enum HealthRecordErrorType {
  INVALID_RECORD = ErrorCode.INVALID_INPUT,
  UNAUTHORIZED_ACCESS = ErrorCode.FORBIDDEN,
  PHI_VALIDATION_ERROR = ErrorCode.HIPAA_VIOLATION
}

/**
 * Security classification levels for health records
 */
export enum SecurityClassification {
  PUBLIC = 'PUBLIC',
  RESTRICTED = 'RESTRICTED',
  CONFIDENTIAL = 'CONFIDENTIAL',
  HIGHLY_CONFIDENTIAL = 'HIGHLY_CONFIDENTIAL'
}

/**
 * Encryption levels for different types of health data
 */
export enum EncryptionLevel {
  STANDARD = 'AES-128',
  ENHANCED = 'AES-256',
  MAXIMUM = 'AES-256-GCM'
}