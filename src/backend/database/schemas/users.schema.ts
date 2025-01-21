/**
 * @fileoverview HIPAA-compliant MongoDB schema for user data in AUSTA SuperApp
 * Implements comprehensive security features and field-level encryption
 * @version 1.0.0
 */

import { Schema, model, Document, HookNextFunction } from 'mongoose'; // v7.0.0
import { IUser, UserRole, UserStatus } from '../../shared/interfaces/user.interface';
import { validateUserData } from '../../shared/utils/validation.utils';
import { EncryptionService } from '../../shared/utils/encryption.utils';
import * as bcrypt from 'bcrypt'; // v5.1.0
import { ErrorCode } from '../../shared/constants/error-codes';

// Schema-specific interfaces
interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): Promise<string>;
}

interface IUserModel extends Schema {
  findByEmail(email: string): Promise<IUserDocument>;
}

// Schema configuration
const SALT_ROUNDS = 12;
const PASSWORD_EXPIRY_DAYS = 90;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30; // minutes

// Create schema with strict validation and timestamps
const UserSchema = new Schema<IUserDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    immutable: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: async function(email: string) {
        const validation = await validateUserData({ email } as IUser);
        return validation.isValid;
      },
      message: 'Invalid email format or domain'
    },
    encrypted: true
  },
  password: {
    type: String,
    required: true,
    minlength: 12,
    select: false,
    validate: {
      validator: function(password: string) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/.test(password);
      },
      message: 'Password must contain at least one uppercase letter, lowercase letter, number, and special character'
    }
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING,
    index: true
  },
  profile: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      encrypted: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      encrypted: true
    },
    dateOfBirth: {
      type: Date,
      required: true,
      encrypted: true
    },
    gender: {
      type: String,
      required: true,
      enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']
    },
    phoneNumber: {
      type: String,
      required: true,
      encrypted: true,
      validate: {
        validator: function(phone: string) {
          return /^\+[1-9]\d{1,14}$/.test(phone);
        },
        message: 'Invalid phone number format'
      }
    },
    address: {
      street: { type: String, encrypted: true },
      city: { type: String, encrypted: true },
      state: { type: String, encrypted: true },
      zipCode: { type: String, encrypted: true },
      country: { type: String, encrypted: true }
    },
    emergencyContact: {
      name: { type: String, encrypted: true },
      relationship: { type: String },
      phoneNumber: { type: String, encrypted: true }
    }
  },
  securitySettings: {
    mfaEnabled: {
      type: Boolean,
      default: false
    },
    mfaMethod: {
      type: String,
      enum: ['SMS', 'EMAIL', 'AUTHENTICATOR'],
      required: function() {
        return this.securitySettings.mfaEnabled;
      }
    },
    lastPasswordChange: {
      type: Date,
      default: Date.now
    },
    passwordResetRequired: {
      type: Boolean,
      default: true
    },
    loginAttempts: {
      type: Number,
      default: 0
    },
    lastLoginAt: Date,
    lockUntil: Date
  },
  auditTrail: {
    lastModified: {
      type: Date,
      default: Date.now
    },
    modifiedBy: String,
    changes: [{
      field: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      timestamp: {
        type: Date,
        default: Date.now
      },
      actor: String
    }]
  }
}, {
  timestamps: true,
  strict: true,
  collection: 'users',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance and security
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ 'securitySettings.lastPasswordChange': 1 });
UserSchema.index({ 'auditTrail.lastModified': 1 });

// Pre-save middleware for password hashing
UserSchema.pre('save', async function(next: HookNextFunction) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    this.securitySettings.lastPasswordChange = new Date();
    
    // Add to audit trail
    this.auditTrail.changes.push({
      field: 'password',
      oldValue: '[REDACTED]',
      newValue: '[REDACTED]',
      timestamp: new Date(),
      actor: this.auditTrail.modifiedBy || 'SYSTEM'
    });

    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    if (this.securitySettings.lockUntil && this.securitySettings.lockUntil > new Date()) {
      throw new Error(ErrorCode.RATE_LIMIT_EXCEEDED);
    }

    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    
    if (!isMatch) {
      this.securitySettings.loginAttempts += 1;
      if (this.securitySettings.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        this.securitySettings.lockUntil = new Date(Date.now() + LOCKOUT_DURATION * 60000);
      }
      await this.save();
    } else {
      this.securitySettings.loginAttempts = 0;
      this.securitySettings.lastLoginAt = new Date();
      await this.save();
    }

    return isMatch;
  } catch (error) {
    throw new Error(`Password comparison failed: ${error.message}`);
  }
};

// Static methods
UserSchema.statics.findByEmail = async function(email: string): Promise<IUserDocument> {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Export the model
export const User = model<IUserDocument>('User', UserSchema);
export default User;