/**
 * @fileoverview User management interfaces for AUSTA SuperApp platform
 * @version 1.0.0
 * @license HIPAA-compliant
 */

/**
 * Enum defining comprehensive user roles for granular access control
 * Based on RBAC matrix specifications
 */
export enum UserRole {
    PATIENT = 'PATIENT',
    PROVIDER = 'PROVIDER',
    ADMIN = 'ADMIN',
    INSURANCE = 'INSURANCE',
    SYSTEM = 'SYSTEM'
}

/**
 * Enum defining all possible user account statuses with security states
 */
export enum UserStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    PENDING = 'PENDING',
    SUSPENDED = 'SUSPENDED',
    LOCKED = 'LOCKED',
    DELETED = 'DELETED'
}

/**
 * Interface for structured address information with geolocation support
 */
export interface IUserAddress {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    coordinates?: {
        latitude: number;
        longitude: number;
    };
}

/**
 * Comprehensive interface for user profile information with HIPAA-compliant fields
 */
export interface IUserProfile {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    phoneNumber: string;
    address: IUserAddress;
    emergencyContact: {
        name: string;
        relationship: string;
        phoneNumber: string;
    };
    preferredLanguage: string;
    profileImage?: string;
}

/**
 * Enhanced interface for user security settings with comprehensive authentication features
 */
export interface IUserSecuritySettings {
    mfaEnabled: boolean;
    mfaMethod: string;
    mfaSecret: string;
    lastPasswordChange: Date;
    passwordResetRequired: boolean;
    loginAttempts: number;
    lastLoginAt: Date;
    lastLoginIP: string;
    securityQuestions: Array<{
        question: string;
        answer: string;
    }>;
    deviceFingerprints: Array<string>;
}

/**
 * Interface for comprehensive audit trail information
 * Implements security monitoring requirements
 */
export interface IUserAudit {
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
    version: number;
    changeHistory: Array<{
        field: string;
        oldValue: any;
        newValue: any;
        timestamp: Date;
        changedBy: string;
    }>;
}

/**
 * Comprehensive interface for complete user data structure
 * Implements HIPAA compliance and security requirements
 */
export interface IUser {
    readonly id: string;
    email: string;
    password: string;  // Hashed password only
    role: UserRole;
    status: UserStatus;
    profile: IUserProfile;
    securitySettings: IUserSecuritySettings;
    audit: IUserAudit;
    permissions: Array<string>;
    metadata: Record<string, any>;
}