/**
 * @fileoverview HIPAA-compliant user model with comprehensive security features
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { Schema, model, Document, Model } from 'mongoose'; // v7.0.0
import * as bcrypt from 'bcrypt'; // v5.1.0
import * as crypto from 'crypto';
import { IUser, UserRole, UserStatus } from '../../../shared/interfaces/user.interface';
import { validateUserData } from '../../../shared/utils/validation.utils';
import { ErrorCode } from '../../../shared/constants/error-codes';

/**
 * Interface for audit event tracking
 */
interface AuditEvent {
  action: string;
  timestamp: Date;
  actor: string;
  details: Record<string, any>;
}

/**
 * Interface for user model instance methods
 */
interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  updateLoginAttempts(reset: boolean): Promise<void>;
  updateAuditTrail(event: AuditEvent): Promise<void>;
  validatePermissions(requiredPermissions: string[]): Promise<boolean>;
  encryptSensitiveData(): Promise<void>;
}

/**
 * Extended interface combining IUser with Document and methods
 */
interface IUserDocument extends IUser, Document, IUserMethods {}

/**
 * Schema definition for sensitive PII data encryption
 */
const encryptedFields = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16
};

/**
 * HIPAA-compliant user schema with comprehensive security features
 */
const UserSchema = new Schema<IUserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 12,
    select: false
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING
  },
  profile: {
    firstName: { type: String, required: true, encrypted: true },
    lastName: { type: String, required: true, encrypted: true },
    dateOfBirth: { type: Date, required: true, encrypted: true },
    gender: { type: String, required: true },
    phoneNumber: { type: String, required: true, encrypted: true },
    address: {
      street: { type: String, required: true, encrypted: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true, encrypted: true },
      country: { type: String, required: true },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    emergencyContact: {
      name: { type: String, required: true, encrypted: true },
      relationship: { type: String, required: true },
      phoneNumber: { type: String, required: true, encrypted: true }
    },
    preferredLanguage: { type: String, default: 'en' },
    profileImage: String
  },
  securitySettings: {
    mfaEnabled: { type: Boolean, default: false },
    mfaMethod: String,
    mfaSecret: { type: String, encrypted: true },
    lastPasswordChange: { type: Date, default: Date.now },
    passwordResetRequired: { type: Boolean, default: true },
    loginAttempts: { type: Number, default: 0 },
    lastLoginAt: Date,
    lastLoginIP: String,
    securityQuestions: [{
      question: String,
      answer: { type: String, encrypted: true }
    }],
    deviceFingerprints: [String]
  },
  audit: {
    createdAt: { type: Date, default: Date.now },
    createdBy: String,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String,
    version: { type: Number, default: 1 },
    changeHistory: [{
      field: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      timestamp: Date,
      changedBy: String
    }]
  },
  permissions: [String],
  metadata: Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'users'
});

/**
 * Index definitions for performance optimization
 */
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'profile.firstName': 1, 'profile.lastName': 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });

/**
 * Password hashing middleware
 */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.securitySettings.lastPasswordChange = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Instance method to compare passwords
 */
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    await this.updateLoginAttempts(!isMatch);
    return isMatch;
  } catch (error) {
    throw new Error(`Password comparison failed: ${error.message}`);
  }
};

/**
 * Instance method to manage login attempts
 */
UserSchema.methods.updateLoginAttempts = async function(failed: boolean): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

  if (failed) {
    this.securitySettings.loginAttempts += 1;
    if (this.securitySettings.loginAttempts >= MAX_ATTEMPTS) {
      this.status = UserStatus.LOCKED;
      this.securitySettings.lockUntil = new Date(Date.now() + LOCK_TIME);
    }
  } else {
    this.securitySettings.loginAttempts = 0;
    this.securitySettings.lastLoginAt = new Date();
  }

  await this.save();
};

/**
 * Instance method to update audit trail
 */
UserSchema.methods.updateAuditTrail = async function(event: AuditEvent): Promise<void> {
  this.audit.version += 1;
  this.audit.updatedAt = new Date();
  this.audit.updatedBy = event.actor;
  this.audit.changeHistory.push({
    ...event,
    timestamp: new Date()
  });
  await this.save();
};

/**
 * Instance method to validate permissions
 */
UserSchema.methods.validatePermissions = async function(requiredPermissions: string[]): Promise<boolean> {
  return requiredPermissions.every(permission => this.permissions.includes(permission));
};

/**
 * Instance method to encrypt sensitive data
 */
UserSchema.methods.encryptSensitiveData = async function(): Promise<void> {
  const key = crypto.randomBytes(encryptedFields.keyLength);
  const iv = crypto.randomBytes(encryptedFields.ivLength);

  const encrypt = (text: string): string => {
    const cipher = crypto.createCipheriv(encryptedFields.algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${encrypted}:${tag.toString('hex')}:${iv.toString('hex')}`;
  };

  // Encrypt sensitive fields
  for (const field of Object.keys(this.profile)) {
    if (this.schema.path(`profile.${field}`).options.encrypted) {
      this.profile[field] = encrypt(this.profile[field]);
    }
  }

  await this.save();
};

// Create and export the model
const User: Model<IUserDocument> = model<IUserDocument>('User', UserSchema);
export default User;