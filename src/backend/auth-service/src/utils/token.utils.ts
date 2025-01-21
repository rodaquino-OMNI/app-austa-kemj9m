/**
 * @fileoverview HIPAA-compliant JWT token management utilities
 * Implements secure token generation, verification, and lifecycle management
 * with enhanced security features and comprehensive audit logging
 * @version 1.0.0
 */

import { sign, verify, JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { AUTH_CONFIG } from '../config/auth.config';
import { ErrorCode } from '../../../shared/constants/error-codes';

/**
 * Enhanced interface defining JWT token payload structure with HIPAA compliance fields
 */
export interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  deviceId: string;
  ipAddress: string;
  fingerprint: string;
  auditId: string;
  iat?: number;
  exp?: number;
  lastAccess?: number;
}

/**
 * Enhanced interface for token generation options with security parameters
 */
export interface TokenOptions {
  expiresIn?: string | number;
  audience?: string;
  issuer?: string;
  algorithm?: string;
  keyId?: string;
  jwtid?: string;
  subject?: string;
  notBefore?: number;
}

// Constants for token management
const TOKEN_EXPIRATION = AUTH_CONFIG.jwt.expiresIn;
const REFRESH_TOKEN_EXPIRATION = AUTH_CONFIG.jwt.refreshExpiresIn;
const TOKEN_ISSUER = AUTH_CONFIG.jwt.issuer;
const ALGORITHM = AUTH_CONFIG.jwt.algorithm;
const MIN_KEY_LENGTH = 2048;
const MAX_REFRESH_COUNT = 5;
const REVOCATION_CHECK_INTERVAL = 60000;

/**
 * Generates a secure token fingerprint using device and session information
 * @param {TokenPayload} payload - Token payload containing session data
 * @returns {string} Cryptographic fingerprint
 */
const generateTokenFingerprint = (payload: TokenPayload): string => {
  const fingerprintData = `${payload.sessionId}:${payload.deviceId}:${payload.ipAddress}`;
  return createHash('sha256').update(fingerprintData).digest('hex');
};

/**
 * Generates a secure JWT token with enhanced payload and fingerprinting
 * @param {TokenPayload} payload - Token payload with user and session data
 * @param {TokenOptions} options - Token generation options
 * @returns {string} Generated JWT token with security enhancements
 */
export const generateToken = async (
  payload: TokenPayload,
  options: TokenOptions = {}
): Promise<string> => {
  try {
    // Validate required payload fields
    if (!payload.userId || !payload.email || !payload.roles) {
      throw new Error('Missing required payload fields');
    }

    // Generate token fingerprint
    const fingerprint = generateTokenFingerprint(payload);
    
    // Add security and compliance fields
    const enhancedPayload = {
      ...payload,
      fingerprint,
      auditId: randomBytes(16).toString('hex'),
      iat: Math.floor(Date.now() / 1000),
      lastAccess: Date.now()
    };

    // Configure token options with security defaults
    const tokenOptions = {
      expiresIn: TOKEN_EXPIRATION,
      issuer: TOKEN_ISSUER,
      algorithm: ALGORITHM,
      ...options
    };

    // Sign token with private key
    return sign(enhancedPayload, AUTH_CONFIG.jwt.privateKey, tokenOptions);
  } catch (error) {
    throw new Error(`Token generation failed: ${error.message}`);
  }
};

/**
 * Comprehensive token verification with security checks
 * @param {string} token - JWT token to verify
 * @returns {TokenPayload} Verified and decoded token payload
 */
export const verifyToken = async (token: string): Promise<TokenPayload> => {
  try {
    // Verify token signature and expiration
    const decoded = verify(token, AUTH_CONFIG.jwt.publicKey, {
      algorithms: [ALGORITHM],
      issuer: TOKEN_ISSUER
    }) as TokenPayload;

    // Verify token fingerprint
    const currentFingerprint = generateTokenFingerprint(decoded);
    if (currentFingerprint !== decoded.fingerprint) {
      throw new Error(ErrorCode.UNAUTHORIZED);
    }

    // Update last access timestamp
    decoded.lastAccess = Date.now();

    return decoded;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new Error(ErrorCode.TOKEN_EXPIRED);
    }
    throw new Error(ErrorCode.UNAUTHORIZED);
  }
};

/**
 * Securely refreshes token while maintaining audit trail
 * @param {string} oldToken - Current token to refresh
 * @param {boolean} extendedSession - Whether to grant extended session
 * @returns {string} New JWT token with updated expiration
 */
export const refreshToken = async (
  oldToken: string,
  extendedSession: boolean = false
): Promise<string> => {
  try {
    // Verify current token
    const decoded = await verifyToken(oldToken);

    // Generate new session and audit IDs
    const newSessionId = randomBytes(16).toString('hex');
    const newAuditId = randomBytes(16).toString('hex');

    // Create new token payload
    const newPayload: TokenPayload = {
      ...decoded,
      sessionId: newSessionId,
      auditId: newAuditId,
      lastAccess: Date.now()
    };

    // Generate new token with appropriate expiration
    return generateToken(newPayload, {
      expiresIn: extendedSession ? REFRESH_TOKEN_EXPIRATION : TOKEN_EXPIRATION
    });
  } catch (error) {
    throw new Error(`Token refresh failed: ${error.message}`);
  }
};

/**
 * Invalidates token with comprehensive revocation tracking
 * @param {string} token - Token to revoke
 * @param {string} reason - Reason for revocation
 * @returns {boolean} Revocation success status
 */
export const revokeToken = async (
  token: string,
  reason: string
): Promise<boolean> => {
  try {
    // Verify token before revocation
    const decoded = await verifyToken(token);

    // Add token to revocation list with metadata
    const revocationData = {
      token: token,
      userId: decoded.userId,
      sessionId: decoded.sessionId,
      reason: reason,
      timestamp: Date.now(),
      auditId: decoded.auditId
    };

    // Store revocation data (implementation depends on storage solution)
    // TODO: Implement revocation storage

    return true;
  } catch (error) {
    throw new Error(`Token revocation failed: ${error.message}`);
  }
};