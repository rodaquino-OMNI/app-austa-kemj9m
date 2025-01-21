/**
 * @fileoverview Enhanced claim data model with HIPAA-compliant security features
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document } from 'mongoose'; // v7.0.0
import { IHealthRecord, HealthRecordType } from '../../../shared/interfaces/health-record.interface';
import { IUser, UserRole } from '../../../shared/interfaces/user.interface';

/**
 * Comprehensive enum for claim types with enhanced categorization
 */
export enum ClaimType {
  MEDICAL = 'MEDICAL',
  DENTAL = 'DENTAL',
  VISION = 'VISION',
  PHARMACY = 'PHARMACY',
  MENTAL_HEALTH = 'MENTAL_HEALTH',
  PREVENTIVE = 'PREVENTIVE',
  EMERGENCY = 'EMERGENCY',
  SPECIALIST = 'SPECIALIST'
}

/**
 * Enhanced enum for claim status with comprehensive tracking states
 */
export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PENDING_INFO = 'PENDING_INFO',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

/**
 * Interface for claim document with enhanced security features
 */
export interface IClaimDocument {
  id: string;
  type: string;
  title: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
  encryptionKey: string;
  checksum: string;
  auditTrail: IDocumentAudit[];
}

/**
 * Interface for document audit trail
 */
interface IDocumentAudit {
  timestamp: Date;
  action: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Interface for claim metadata with enhanced tracking
 */
interface IClaimMetadata {
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  processingTime?: number;
  priority: number;
  source: string;
  complianceFlags: string[];
}

/**
 * Interface for claim audit entries with comprehensive tracking
 */
export interface IClaimAudit {
  timestamp: Date;
  action: string;
  userId: string;
  userRole: string;
  ipAddress: string;
  changes: any;
}

/**
 * Interface for claim security metadata with enhanced protection
 */
export interface IClaimSecurity {
  encryptionVersion: string;
  accessHistory: string[];
  lastAccessedBy: string;
  lastAccessedAt: Date;
  authorizedRoles: string[];
}

/**
 * Enhanced interface for claim data structure
 */
export interface IClaim extends Document {
  id: string;
  patientId: string;
  providerId: string;
  type: ClaimType;
  status: ClaimStatus;
  amount: number;
  serviceDate: Date;
  submissionDate: Date;
  healthRecordId: string;
  documents: IClaimDocument[];
  metadata: IClaimMetadata;
  auditTrail: IClaimAudit[];
  securityMetadata: IClaimSecurity;
  policyNumber: string;
  diagnosis: string[];
  procedureCodes: string[];
  notes: string;
  adjudicationDetails?: {
    adjudicatedBy: string;
    adjudicatedAt: Date;
    decision: string;
    reason: string;
  };
}

/**
 * Schema definition for claim documents with security features
 */
const ClaimDocumentSchema = new Schema<IClaimDocument>({
  id: { type: String, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, required: true },
  uploadedBy: { type: String, required: true },
  encryptionKey: { type: String, required: true },
  checksum: { type: String, required: true },
  auditTrail: [{
    timestamp: { type: Date, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true }
  }]
});

/**
 * Enhanced schema for claims with comprehensive security features
 */
const ClaimSchema = new Schema<IClaim>({
  patientId: { type: String, required: true, index: true },
  providerId: { type: String, required: true, index: true },
  type: { 
    type: String, 
    enum: Object.values(ClaimType),
    required: true,
    index: true 
  },
  status: { 
    type: String, 
    enum: Object.values(ClaimStatus),
    required: true,
    index: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0 
  },
  serviceDate: { 
    type: Date, 
    required: true,
    index: true 
  },
  submissionDate: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  healthRecordId: { 
    type: String, 
    required: true,
    index: true 
  },
  documents: [ClaimDocumentSchema],
  metadata: {
    version: { type: Number, required: true, default: 1 },
    createdAt: { type: Date, required: true },
    createdBy: { type: String, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
    processingTime: Number,
    priority: { type: Number, required: true, default: 1 },
    source: { type: String, required: true },
    complianceFlags: [String]
  },
  auditTrail: [{
    timestamp: { type: Date, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    userRole: { type: String, required: true },
    ipAddress: { type: String, required: true },
    changes: Schema.Types.Mixed
  }],
  securityMetadata: {
    encryptionVersion: { type: String, required: true },
    accessHistory: [String],
    lastAccessedBy: String,
    lastAccessedAt: Date,
    authorizedRoles: [String]
  },
  policyNumber: { type: String, required: true },
  diagnosis: [String],
  procedureCodes: [String],
  notes: String,
  adjudicationDetails: {
    adjudicatedBy: String,
    adjudicatedAt: Date,
    decision: String,
    reason: String
  }
}, {
  timestamps: true,
  collection: 'claims'
});

// Indexes for optimized querying
ClaimSchema.index({ 'metadata.createdAt': 1 });
ClaimSchema.index({ 'securityMetadata.lastAccessedAt': 1 });
ClaimSchema.index({ policyNumber: 1, serviceDate: 1 });
ClaimSchema.index({ status: 1, 'metadata.priority': -1 });

/**
 * Pre-save middleware for security validation
 */
ClaimSchema.pre('save', async function(next) {
  if (this.isNew) {
    this.metadata.createdAt = new Date();
    this.metadata.updatedAt = new Date();
  } else {
    this.metadata.updatedAt = new Date();
  }
  
  // Validate health record reference
  const healthRecord = await model('HealthRecord').findById(this.healthRecordId);
  if (!healthRecord) {
    throw new Error('Invalid health record reference');
  }

  next();
});

/**
 * Method to validate claim data with enhanced security checks
 */
ClaimSchema.methods.validateClaim = async function(): Promise<boolean> {
  // Validate required relationships
  const patient = await model('User').findById(this.patientId);
  const provider = await model('User').findById(this.providerId);
  
  if (!patient || !provider) {
    return false;
  }

  // Validate dates
  if (this.serviceDate > new Date() || this.submissionDate > new Date()) {
    return false;
  }

  // Validate amount
  if (this.amount <= 0) {
    return false;
  }

  // Validate documents
  for (const doc of this.documents) {
    if (!doc.checksum || !doc.encryptionKey) {
      return false;
    }
  }

  return true;
};

/**
 * Method to encrypt sensitive claim data
 */
ClaimSchema.methods.encryptSensitiveData = async function(): Promise<void> {
  // Implementation of field-level encryption
  // Note: Actual encryption implementation would be environment-specific
};

// Export the model with enhanced security features
export const ClaimModel = model<IClaim>('Claim', ClaimSchema);