/**
 * @fileoverview Authentication and Authorization type definitions for AUSTA SuperApp
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { IUser, UserRole, UserStatus } from './user';

/**
 * Enum defining all possible authentication states
 * Includes comprehensive security and verification states
 */
export enum AuthState {
    AUTHENTICATED = 'AUTHENTICATED',
    UNAUTHENTICATED = 'UNAUTHENTICATED',
    PENDING_MFA = 'PENDING_MFA',
    PENDING_BIOMETRIC = 'PENDING_BIOMETRIC',
    SESSION_EXPIRED = 'SESSION_EXPIRED',
    LOCKED = 'LOCKED'
}

/**
 * Interface for authentication tokens with enhanced security attributes
 * Implements OAuth 2.0 + OIDC compliant token structure
 */
export interface IAuthTokens {
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresAt: number;
    tokenType: string;
    scope: string[];
}

/**
 * Interface for login credentials with security metadata
 * Includes device and client information for enhanced security
 */
export interface ILoginCredentials {
    email: string;
    password: string;
    rememberMe: boolean;
    deviceId: string;
    clientMetadata: Record<string, string>;
}

/**
 * Enum defining supported MFA methods
 * Includes all secure verification channels
 */
export enum MFAMethod {
    SMS = 'SMS',
    EMAIL = 'EMAIL',
    AUTHENTICATOR = 'AUTHENTICATOR',
    BIOMETRIC = 'BIOMETRIC'
}

/**
 * Interface for MFA verification with security measures
 * Implements time-based verification tracking
 */
export interface IMFACredentials {
    code: string;
    method: MFAMethod;
    verificationId: string;
    timestamp: number;
}

/**
 * Interface for authentication errors with detailed tracking
 * Implements comprehensive error logging for security auditing
 */
export interface IAuthError {
    code: string;
    message: string;
    details: Record<string, any>;
    timestamp: number;
    requestId: string;
}

/**
 * Interface for authentication context with session management
 * Implements HIPAA-compliant security context
 */
export interface IAuthContext {
    state: AuthState;
    user: IUser | null;
    tokens: IAuthTokens | null;
    isLoading: boolean;
    error: IAuthError | null;
    lastActivity: number;
    sessionTimeout: number;
    isAuthenticated: boolean;
    checkAccess: (level: SecurityLevel) => Promise<boolean>;
}

/**
 * Type for permission levels in role-based access control
 * Defines granular access control levels
 */
export type PermissionLevel = 'READ' | 'WRITE' | 'ADMIN' | 'NONE';

/**
 * Type for security levels used in access control
 */
export type SecurityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Interface for resource permissions
 * Implements fine-grained access control
 */
export interface IResourcePermission {
    resourceType: string;
    level: PermissionLevel;
    conditions?: Record<string, any>;
}

/**
 * Interface for session security context
 * Implements enhanced session tracking for security
 */
export interface ISessionContext {
    sessionId: string;
    createdAt: number;
    lastRenewedAt: number;
    deviceInfo: {
        id: string;
        type: string;
        userAgent: string;
        ipAddress: string;
    };
    securityFlags: {
        isTrustedDevice: boolean;
        isKnownLocation: boolean;
        requiresMFA: boolean;
    };
}

/**
 * Type for authentication challenges
 * Defines possible security verification requirements
 */
export type AuthChallenge = {
    type: 'MFA' | 'CAPTCHA' | 'SECURITY_QUESTIONS' | 'DEVICE_VERIFICATION';
    metadata: Record<string, any>;
    expiresAt: number;
};

/**
 * Interface for OAuth provider configuration
 * Implements OAuth 2.0 + OIDC provider settings
 */
export interface IOAuthProviderConfig {
    providerId: string;
    clientId: string;
    scopes: string[];
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    logoutEndpoint: string;
}

/**
 * Type for security event logging
 * Implements comprehensive security audit tracking
 */
export type SecurityEvent = {
    eventType: string;
    timestamp: number;
    userId: string;
    sessionId: string;
    metadata: Record<string, any>;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    outcome: 'SUCCESS' | 'FAILURE' | 'ERROR';
};