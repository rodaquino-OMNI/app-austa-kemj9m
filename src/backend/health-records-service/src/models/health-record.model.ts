/**
 * @fileoverview HIPAA-compliant health record model with FHIR R4 support
 * Implements comprehensive security features and audit trails
 * @version 1.0.0
 */

import { Schema, model, Document, plugin } from 'mongoose';
import { AES, enc } from 'crypto-js'; // v4.1.1 - Field-level encryption
import { 
  IHealthRecord, 
  HealthRecordType, 
  HealthRecordStatus, 
  IHealthRecordMetadata,
  IHealthRecordAttachment,
  IEncryptionMetadata,
  IHealthRecordAuditEvent,
  FHIRResource
} from '../../../shared/interfaces/health-record.interface';
import { validateHealthRecord } from '../../../shared/utils/validation.utils';
import { ErrorCode } from '../../../shared/constants/error-codes';

/**
 * Schema for encryption metadata with versioning support
 */
const encryptionMetadataSchema = new Schema<IEncryptionMetadata>({
  algorithm: { type: String, required: true },
  keyId: { type: String, required: true },
  encryptedAt: { type: Date, required: true },
  encryptedBy: { type: String, required: true },
  version: { type: String, required: true },
  checksum: { type: String, required: true }
}, { _id: false });

/**
 * Schema for health record attachments with security features
 */
const attachmentSchema = new Schema<IHealthRecordAttachment>({
  id: { type: String, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, required: true },
  uploadedBy: { type: String, required: true },
  checksum: { type: String, required: true },
  encryptionStatus: { type: String, required: true }
}, { _id: false });

/**
 * Schema for audit events with comprehensive tracking
 */
const auditEventSchema = new Schema<IHealthRecordAuditEvent>({
  eventId: { type: String, required: true },
  recordId: { type: String, required: true },
  timestamp: { type: Date, required: true },
  actorId: { type: String, required: true },
  action: { type: String, required: true },
  outcome: { type: String, required: true },
  details: {
    resourceType: { type: String, required: true },
    securityLabels: [String],
    accessType: { type: String, required: true },
    systemId: { type: String, required: true }
  }
}, { _id: false });

/**
 * Main health record schema with HIPAA compliance and FHIR R4 support
 */
const healthRecordSchema = new Schema<IHealthRecord & Document>({
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
      validator: (content: FHIRResource) => {
        return content.resourceType && content.id && content.meta;
      },
      message: 'Content must be FHIR R4 compliant'
    }
  },
  metadata: {
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    createdBy: { type: String, required: true },
    updatedAt: { type: Date, required: true },
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
    }],
    complianceFlags: [String]
  },
  attachments: [attachmentSchema],
  status: { 
    type: String, 
    enum: Object.values(HealthRecordStatus),
    required: true 
  },
  securityLabels: {
    type: [String],
    required: true,
    validate: {
      validator: (labels: string[]) => labels.length > 0,
      message: 'At least one security label is required'
    }
  },
  encryptionMetadata: encryptionMetadataSchema,
  auditTrail: [auditEventSchema]
}, {
  timestamps: true,
  collection: 'health_records',
  strict: true
});

// Indexes for performance and security
healthRecordSchema.index({ patientId: 1, type: 1 });
healthRecordSchema.index({ 'metadata.createdAt': 1 });
healthRecordSchema.index({ 'securityLabels': 1 });

/**
 * Pre-save middleware for validation and encryption
 */
healthRecordSchema.pre('save', async function(next) {
  try {
    // Validate record against FHIR R4 and HIPAA requirements
    const validationResult = await validateHealthRecord(this);
    if (!validationResult.isValid) {
      throw new Error(`Validation failed: ${validationResult.errors[0].message}`);
    }

    // Encrypt sensitive fields if required
    if (this.type === HealthRecordType.LAB_RESULT || 
        this.securityLabels.includes('SENSITIVE')) {
      await this.encryptSensitiveData();
    }

    // Update metadata
    this.metadata.version += 1;
    this.metadata.updatedAt = new Date();

    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Method to encrypt sensitive data fields
 */
healthRecordSchema.methods.encryptSensitiveData = async function(): Promise<void> {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(ErrorCode.DATA_ENCRYPTION_ERROR);
  }

  try {
    // Encrypt content
    const encryptedContent = AES.encrypt(
      JSON.stringify(this.content),
      encryptionKey
    ).toString();

    this.content = encryptedContent;
    this.status = HealthRecordStatus.ENCRYPTED;
    
    // Update encryption metadata
    this.encryptionMetadata = {
      algorithm: 'AES-256-GCM',
      keyId: process.env.KEY_ID,
      encryptedAt: new Date(),
      encryptedBy: 'SYSTEM',
      version: '1.0',
      checksum: AES.encrypt(encryptedContent, encryptionKey).toString()
    };

    // Add audit event
    this.auditTrail.push({
      eventId: `ENCRYPT_${Date.now()}`,
      recordId: this.id,
      timestamp: new Date(),
      actorId: 'SYSTEM',
      action: 'ENCRYPT',
      outcome: 'SUCCESS',
      details: {
        resourceType: this.type,
        securityLabels: this.securityLabels,
        accessType: 'SYSTEM',
        systemId: process.env.SYSTEM_ID
      }
    });
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Method to convert record to FHIR R4 format
 */
healthRecordSchema.methods.toFHIR = function(): FHIRResource {
  return {
    resourceType: this.type,
    id: this.id,
    meta: {
      versionId: this.metadata.version.toString(),
      lastUpdated: this.metadata.updatedAt.toISOString(),
      security: this.securityLabels.map(label => ({
        system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
        code: label
      }))
    },
    status: this.status,
    subject: {
      reference: `Patient/${this.patientId}`
    },
    performer: {
      reference: `Practitioner/${this.providerId}`
    },
    content: this.content,
    date: this.date.toISOString()
  };
};

// Create and export the model
const HealthRecord = model<IHealthRecord & Document>('HealthRecord', healthRecordSchema);
export default HealthRecord;