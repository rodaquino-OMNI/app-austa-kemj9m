/**
 * @fileoverview TypeScript types and interfaces for insurance claims
 * Implements HIPAA-compliant data structures for claims processing
 * @version 1.0.0
 */

// Internal imports
import { IUser } from '../types/user';
import { IHealthRecord } from '../types/healthRecord';

/**
 * Enum defining possible claim statuses with extended states
 */
export enum ClaimStatus {
    DRAFT = 'DRAFT',
    SUBMITTED = 'SUBMITTED',
    UNDER_REVIEW = 'UNDER_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    PENDING_INFO = 'PENDING_INFO',
    APPEALED = 'APPEALED'
}

/**
 * Enum defining comprehensive types of insurance claims
 */
export enum ClaimType {
    MEDICAL = 'MEDICAL',
    PHARMACY = 'PHARMACY',
    DENTAL = 'DENTAL',
    VISION = 'VISION',
    MENTAL_HEALTH = 'MENTAL_HEALTH',
    PREVENTIVE = 'PREVENTIVE'
}

/**
 * Interface for encryption metadata tracking
 */
interface IEncryptionMetadata {
    algorithm: string;
    keyId: string;
    initVector: string;
    lastEncryptedAt: Date;
}

/**
 * Interface for access logging
 */
interface IAccessLog {
    userId: string;
    accessedAt: Date;
    action: string;
    ipAddress: string;
}

/**
 * Interface for security metadata
 */
interface ISecurityMetadata {
    encryptionLevel: string;
    dataClassification: string;
    lastSecurityReview: Date;
    accessControlList: string[];
}

/**
 * Interface for compliance checks
 */
interface IComplianceCheck {
    type: string;
    status: boolean;
    checkedAt: Date;
    checkedBy: string;
    findings: string[];
}

/**
 * Interface for audit trail entries
 */
interface IAuditEntry {
    timestamp: Date;
    action: string;
    performedBy: string;
    details: string;
    systemMetadata: {
        ipAddress: string;
        userAgent: string;
    };
}

/**
 * Enhanced interface for claim supporting documents with security metadata
 */
export interface IClaimDocument {
    id: string;
    type: string;
    title: string;
    url: string;
    uploadedAt: Date;
    encryptionMetadata: IEncryptionMetadata;
    accessLog: IAccessLog[];
    hipaaCompliant: boolean;
}

/**
 * Enhanced main interface for insurance claim data structure
 * with security and compliance features
 */
export interface IClaim {
    id: string;
    version: number;
    claimNumber: string;
    patientId: string;
    providerId: string;
    type: ClaimType;
    serviceDate: Date;
    submissionDate: Date;
    status: ClaimStatus;
    amount: number;
    documents: IClaimDocument[];
    healthRecordId: string;
    auditTrail: IAuditEntry[];
    securityMetadata: ISecurityMetadata;
    complianceChecks: IComplianceCheck[];
}

/**
 * Enhanced interface for claim submission data with compliance requirements
 */
export interface IClaimSubmission {
    type: ClaimType;
    serviceDate: Date;
    providerId: string;
    amount: number;
    documents: File[];
    healthRecordId: string;
    consentAcknowledgment: boolean;
    hipaaAuthorization: boolean;
}