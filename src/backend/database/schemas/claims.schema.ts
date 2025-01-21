/**
 * @fileoverview HIPAA-compliant MongoDB schema for insurance claims processing
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document, Types } from 'mongoose'; // v7.0.0
import { AES, enc } from 'crypto-js'; // v4.1.1
import { IUser, UserRole } from '../../shared/interfaces/user.interface';
import { IHealthRecord, HealthRecordType } from '../../shared/interfaces/health-record.interface';
import { ErrorCode } from '../../shared/constants/error-codes';

/**
 * Enhanced enum for comprehensive claim status tracking
 */
export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  PENDING_DOCUMENTATION = 'PENDING_DOCUMENTATION',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  APPEALED = 'APPEALED',
  EXPIRED = 'EXPIRED'
}

/**
 * Interface for claim audit trail entries
 */
interface IAuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  userRole: UserRole;
  changes: Record<string, any>;
  ipAddress: string;
  userAgent: string;
}

/**
 * Interface for claim processing metadata
 */
interface IProcessingMetadata {
  assignedTo: string;
  priority: number;
  reviewLevel: number;
  automationFlags: string[];
  processingNotes: string[];
  deadlines: {
    submission: Date;
    review: Date;
    appeal: Date;
  };
}

/**
 * Generates a cryptographically secure claim number
 */
function generateClaimNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const checksum = (parseInt(timestamp, 36) % 97).toString().padStart(2, '0');
  return `CLM-${timestamp}-${random}-${checksum}`;
}

/**
 * Enhanced MongoDB schema for HIPAA-compliant insurance claims
 */
export const ClaimSchema = new Schema({
  claimNumber: {
    type: String,
    required: true,
    unique: true,
    default: generateClaimNumber,
    immutable: true
  },
  patientId: {
    type: Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  providerId: {
    type: Types.ObjectId,
    required: true,
    ref: 'User'
  },
  serviceDate: {
    type: Date,
    required: true,
    validate: {
      validator: (date: Date) => date <= new Date(),
      message: 'Service date cannot be in the future'
    }
  },
  submissionDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(ClaimStatus),
    default: ClaimStatus.SUBMITTED,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: (amount: number) => amount > 0 && amount <= 1000000,
      message: 'Claim amount must be between 0 and 1,000,000'
    }
  },
  documents: [{
    type: Types.ObjectId,
    ref: 'HealthRecord',
    validate: {
      validator: async function(docId: Types.ObjectId) {
        const doc = await model('HealthRecord').findById(docId);
        return doc && [HealthRecordType.CONSULTATION, HealthRecordType.LAB_RESULT].includes(doc.type);
      },
      message: 'Invalid document type for claim'
    }
  }],
  encryptedFields: {
    diagnosis: {
      type: String,
      required: true,
      set: (value: string) => AES.encrypt(value, process.env.ENCRYPTION_KEY!).toString()
    },
    treatment: {
      type: String,
      required: true,
      set: (value: string) => AES.encrypt(value, process.env.ENCRYPTION_KEY!).toString()
    },
    notes: {
      type: String,
      set: (value: string) => value ? AES.encrypt(value, process.env.ENCRYPTION_KEY!).toString() : null
    }
  },
  auditTrail: [{
    timestamp: { type: Date, default: Date.now, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    userRole: { type: String, enum: Object.values(UserRole), required: true },
    changes: { type: Map, of: Schema.Types.Mixed },
    ipAddress: String,
    userAgent: String
  }],
  securityLabels: [{
    type: String,
    enum: ['RESTRICTED', 'SENSITIVE', 'NORMAL'],
    default: ['NORMAL']
  }],
  processingMetadata: {
    assignedTo: { type: String, sparse: true },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    reviewLevel: { type: Number, min: 1, max: 3, default: 1 },
    automationFlags: [String],
    processingNotes: [String],
    deadlines: {
      submission: Date,
      review: Date,
      appeal: Date
    }
  }
}, {
  timestamps: true,
  collection: 'claims',
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// Indexes for optimized querying and HIPAA compliance
ClaimSchema.index({ claimNumber: 1 }, { unique: true });
ClaimSchema.index({ patientId: 1, status: 1 });
ClaimSchema.index({ submissionDate: 1, status: 1 });
ClaimSchema.index({ 'processingMetadata.assignedTo': 1, status: 1 });
ClaimSchema.index({ claimNumber: 'text', status: 'text' });

// Middleware for audit trail
ClaimSchema.pre('save', function(next) {
  if (this.isNew || this.isModified()) {
    const auditEntry: IAuditEntry = {
      timestamp: new Date(),
      action: this.isNew ? 'CREATED' : 'UPDATED',
      userId: this.get('_currentUser.id'),
      userRole: this.get('_currentUser.role'),
      changes: this.modifiedPaths().reduce((acc, path) => {
        acc[path] = this.get(path);
        return acc;
      }, {}),
      ipAddress: this.get('_currentUser.ip'),
      userAgent: this.get('_currentUser.userAgent')
    };
    this.auditTrail.push(auditEntry);
  }
  next();
});

// Methods for secure field access
ClaimSchema.methods.getDecryptedField = function(fieldName: string): string {
  const encryptedValue = this.encryptedFields[fieldName];
  if (!encryptedValue) return '';
  const bytes = AES.decrypt(encryptedValue, process.env.ENCRYPTION_KEY!);
  return bytes.toString(enc.Utf8);
};

// Static methods for claim processing
ClaimSchema.statics.findByPatient = async function(
  patientId: string,
  securityContext: { userId: string; role: UserRole }
): Promise<Document[]> {
  if (!securityContext || !securityContext.role) {
    throw new Error(ErrorCode.UNAUTHORIZED);
  }

  const query = { patientId };
  if (securityContext.role !== UserRole.ADMIN && 
      securityContext.role !== UserRole.INSURANCE) {
    query['securityLabels'] = { $ne: 'RESTRICTED' };
  }

  return this.find(query)
    .sort({ submissionDate: -1 })
    .populate('documents', 'type date')
    .exec();
};

export interface IClaim extends Document {
  claimNumber: string;
  patientId: Types.ObjectId;
  providerId: Types.ObjectId;
  serviceDate: Date;
  submissionDate: Date;
  status: ClaimStatus;
  amount: number;
  documents: Types.ObjectId[];
  encryptedFields: {
    diagnosis: string;
    treatment: string;
    notes?: string;
  };
  auditTrail: IAuditEntry[];
  securityLabels: string[];
  processingMetadata: IProcessingMetadata;
  getDecryptedField(fieldName: string): string;
}

export const Claim = model<IClaim>('Claim', ClaimSchema);