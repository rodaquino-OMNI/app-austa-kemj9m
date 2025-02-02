/**
 * @fileoverview User type definitions for AUSTA SuperApp
 * @version 1.0.0
 * @license HIPAA-compliant
 */

/**
 * Enum defining user roles for role-based access control (RBAC)
 * Based on system security requirements and access control matrix
 */
export enum UserRole {
    PATIENT = 'PATIENT',
    PROVIDER = 'PROVIDER',
    ADMIN = 'ADMIN',
    INSURANCE = 'INSURANCE'
}

/**
 * Enum defining possible user account statuses
 * Includes security-related states for account management
 */
export enum UserStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    PENDING = 'PENDING',
    SUSPENDED = 'SUSPENDED',
    LOCKED = 'LOCKED'
}

/**
 * Interface for structured address information with verification
 * Implements enhanced address validation for healthcare communications
 */
export interface IAddress {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    addressType: string;
    isVerified: boolean;
}

/**
 * Interface for emergency contact information with verification tracking
 * Critical for healthcare emergency response coordination
 */
export interface IEmergencyContact {
    name: string;
    relationship: string;
    phoneNumber: string;
    email: string;
    isVerified: boolean;
    lastVerifiedAt: Date;
}

/**
 * Interface for comprehensive user security settings
 * Implements enhanced security measures for HIPAA compliance
 */
export interface IUserSecuritySettings {
    mfaEnabled: boolean;
    mfaMethod: string;
    lastPasswordChange: Date;
    passwordResetRequired: boolean;
    loginAttempts: number;
    lastLoginAt: Date;
    securityQuestions: Array<{
        question: string;
        answer: string;
    }>;
    deviceTrust: Array<{
        deviceId: string;
        trusted: boolean;
    }>;
    ipWhitelist: Array<string>;
}

/**
 * Interface for user profile information
 * Contains HIPAA-compliant PII fields with healthcare-specific attributes
 */
export interface IUserProfile {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    phoneNumber: string;
    address: IAddress;
    emergencyContact: IEmergencyContact;
    preferredLanguage: string;
    communicationPreferences: Array<string>;
    profileCompleteness: number;
}

/**
 * Main interface for user data structure
 * Implements comprehensive user management with security and compliance features
 */
export interface IUser {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    profile: IUserProfile;
    securitySettings: IUserSecuritySettings;
    specialization?: string;
    createdAt: Date;
    updatedAt: Date;
    lastAuditAt: Date;
    consentHistory: Array<{
        type: string;
        givenAt: Date;
    }>;
}