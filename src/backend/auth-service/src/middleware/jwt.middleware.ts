/**
 * @fileoverview HIPAA-compliant JWT middleware for authentication and authorization
 * Implements secure token validation with role-based access control and audit logging
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger, format, transports } from 'winston';
import { verifyToken, TokenPayload } from '../utils/token.utils';
import { AUTH_CONFIG } from '../config/auth.config';
import { ErrorCode } from '../../../shared/constants/error-codes';

// Security audit logger configuration
const auditLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'security-audit.log' })
  ]
});

// Constants
const BEARER_PREFIX = 'Bearer ';
const DEFAULT_OPTIONS: JWTMiddlewareOptions = {
  requireAuth: true,
  requiredRoles: [],
  requiredPermissions: [],
  validateDevice: true,
  enforceFingerprint: true,
  auditLevel: 'STANDARD',
  sessionTimeout: AUTH_CONFIG.security.hipaa.inactivityTimeout
};

// Enhanced request interface with security context
export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  deviceId?: string;
  sessionContext?: {
    lastAccess: number;
    activityCount: number;
  };
  securityContext?: {
    ipAddress: string;
    userAgent: string;
    geoLocation?: string;
  };
}

// Middleware configuration interface
export interface JWTMiddlewareOptions {
  requireAuth: boolean;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  validateDevice?: boolean;
  enforceFingerprint?: boolean;
  auditLevel?: 'BASIC' | 'STANDARD' | 'DETAILED';
  sessionTimeout?: number;
}

/**
 * Enhanced JWT middleware for secure token validation and RBAC
 * @param {JWTMiddlewareOptions} options - Configuration options
 * @returns {Function} Express middleware function
 */
export const jwtMiddleware = (options: Partial<JWTMiddlewareOptions> = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Extract authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith(BEARER_PREFIX)) {
        if (!config.requireAuth) return next();
        throw new Error(ErrorCode.UNAUTHORIZED);
      }

      // Extract and verify token
      const token = authHeader.substring(BEARER_PREFIX.length);
      const decoded = await verifyToken(token);

      // Validate session timeout
      if (decoded.lastAccess && 
          Date.now() - decoded.lastAccess > config.sessionTimeout! * 1000) {
        throw new Error(ErrorCode.SESSION_EXPIRED);
      }

      // Device validation if enabled
      if (config.validateDevice) {
        const deviceId = req.headers['x-device-id'] as string;
        if (!deviceId || deviceId !== decoded.deviceId) {
          throw new Error(ErrorCode.UNAUTHORIZED);
        }
      }

      // Role-based access control
      if (config.requiredRoles?.length) {
        const hasRequiredRole = decoded.roles.some(role => 
          config.requiredRoles!.includes(role)
        );
        if (!hasRequiredRole) {
          throw new Error(ErrorCode.FORBIDDEN);
        }
      }

      // Permission-based access control
      if (config.requiredPermissions?.length) {
        const hasRequiredPermissions = config.requiredPermissions.every(
          permission => decoded.permissions.includes(permission)
        );
        if (!hasRequiredPermissions) {
          throw new Error(ErrorCode.FORBIDDEN);
        }
      }

      // Enhance request with security context
      req.user = decoded;
      req.deviceId = req.headers['x-device-id'] as string;
      req.sessionContext = {
        lastAccess: Date.now(),
        activityCount: (req.sessionContext?.activityCount || 0) + 1
      };
      req.securityContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        geoLocation: req.headers['x-geo-location'] as string
      };

      // Security audit logging
      auditLogger.info('JWT Authentication', {
        userId: decoded.userId,
        sessionId: decoded.sessionId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      next();
    } catch (error) {
      // Enhanced error handling with security context
      auditLogger.error('JWT Authentication Failed', {
        error: error.message,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      // Map internal error codes to HTTP responses
      const errorResponse = {
        code: error.message,
        message: 'Authentication failed',
        timestamp: new Date().toISOString()
      };

      switch (error.message) {
        case ErrorCode.UNAUTHORIZED:
        case ErrorCode.TOKEN_EXPIRED:
          return res.status(401).json(errorResponse);
        case ErrorCode.FORBIDDEN:
          return res.status(403).json(errorResponse);
        default:
          return res.status(500).json(errorResponse);
      }
    }
  };
};

export default jwtMiddleware;