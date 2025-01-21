/**
 * @fileoverview MongoDB schema for FHIR R4 compliant health records with enhanced security
 * Implements comprehensive data structures for medical records management
 * @version 1.0.0
 */

import mongoose, { Schema, Document } from 'mongoose'; // v7.0.0
import { IHealthRecord, HealthRecordType, HealthRecordStatus, IHealthRecordValidationError } from '../../shared/interfaces/health-record.interface';
import { validateHealthRecord } from '../../shared/utils/validation.utils';
import * as CryptoJS from 'crypto-js'; // v4.1.1
import * as joi from 'joi'; // v17.9.0

// Data classification levels for PHI/PII
enum DataClassificationType {
  PHI = 'PHI',
  PII = 'PII',
  SENSITIVE = 'SENSITIVE',
  PUBLIC = 'PUBLIC'
}

// Interface for audit trail entries
interface IAuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  ipAddress: string;
  changes: Record<string, any>;
}

// Interface for compliance flags
interface IComplianceFlag {
  type: string;
  status: boolean;
  details: string;
  timestamp: Date;
}

// Schema definition with enhanced security features
const HealthRecordSchema = new Schema<IHealthRecord>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  patientId: {
    type: String,
    required: true,
    index: true
  },
  providerId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(HealthRecordType),
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  content: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(value: any) {
        return value.resourceType && value.id && value.meta;
      },
      message: 'Content must be FHIR R4 compliant'
    }
  },
  metadata: {
    version: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, required: true },
    facility: { type: String, required: true },
    department: { type: String, required: true },
    accessHistory: [{
      timestamp: Date,
      userId: String,
      action: String,
      ipAddress: String,
      userAgent: String,
      success: Boolean,
      failureReason: String
    }]
  },
  attachments: [{
    id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
    checksum: { type: String, required: true },
    encryptionStatus: {
      type: String,
      enum: ['UNENCRYPTED', 'ENCRYPTED', 'PENDING', 'FAILED'],
      default: 'UNENCRYPTED'
    }
  }],
  status: {
    type: String,
    enum: Object.values(HealthRecordStatus),
    default: HealthRecordStatus.DRAFT
  },
  encryptionMetadata: {
    algorithm: String,
    keyId: String,
    encryptedAt: Date,
    encryptedBy: String,
    version: String,
    checksum: String
  },
  securityLabels: {
    type: [String],
    required: true,
    validate: {
      validator: function(value: string[]) {
        return value.length > 0;
      },
      message: 'At least one security label is required'
    }
  },
  accessHistory: [{
    timestamp: { type: Date, default: Date.now },
    userId: { type: String, required: true },
    action: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
    success: { type: Boolean, required: true },
    failureReason: String
  }],
  complianceFlags: [{
    type: { type: String, required: true },
    status: { type: Boolean, required: true },
    details: String,
    timestamp: { type: Date, default: Date.now }
  }],
  dataClassification: {
    type: String,
    enum: Object.values(DataClassificationType),
    required: true,
    default: DataClassificationType.PHI
  },
  auditTrail: [{
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    ipAddress: { type: String, required: true },
    changes: Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  collection: 'health_records',
  strict: true,
  validateBeforeSave: true
});

// Indexes for performance and security
HealthRecordSchema.index({ patientId: 1, type: 1 });
HealthRecordSchema.index({ providerId: 1, date: -1 });
HealthRecordSchema.index({ 'metadata.createdAt': -1 });
HealthRecordSchema.index({ dataClassification: 1 });

// Pre-save middleware for validation and security
HealthRecordSchema.pre('save', async function(next) {
  try {
    // Validate FHIR compliance and security requirements
    const validationResult = await validateHealthRecord(this);
    if (!validationResult.isValid) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.errors)}`);
    }

    // Encrypt sensitive fields if required
    if (this.dataClassification === DataClassificationType.PHI) {
      this.content = CryptoJS.AES.encrypt(
        JSON.stringify(this.content),
        process.env.ENCRYPTION_KEY!
      ).toString();
      
      this.encryptionMetadata = {
        algorithm: 'AES',
        keyId: process.env.ENCRYPTION_KEY_ID,
        encryptedAt: new Date(),
        encryptedBy: this.metadata.updatedBy,
        version: '1.0',
        checksum: CryptoJS.SHA256(this.content).toString()
      };
    }

    // Update metadata
    this.metadata.updatedAt = new Date();
    
    // Add audit trail entry
    this.auditTrail.push({
      timestamp: new Date(),
      action: this.isNew ? 'CREATE' : 'UPDATE',
      userId: this.metadata.updatedBy,
      ipAddress: 'system',
      changes: this.modifiedPaths()
    });

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for security checks
HealthRecordSchema.pre('updateOne', async function(next) {
  try {
    const update = this.getUpdate() as any;
    
    // Validate update data
    const validationResult = await validateHealthRecord(update);
    if (!validationResult.isValid) {
      throw new Error(`Update validation failed: ${JSON.stringify(validationResult.errors)}`);
    }

    // Ensure security labels cannot be removed
    if (update.$unset?.securityLabels) {
      throw new Error('Security labels cannot be removed');
    }

    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model<IHealthRecord & Document>('HealthRecord', HealthRecordSchema);