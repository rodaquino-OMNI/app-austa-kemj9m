/**
 * @fileoverview Enhanced security middleware for API Gateway implementing HIPAA and LGPD compliant measures
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import hpp from 'hpp'; // v0.2.3
import cors from 'cors'; // v2.8.5
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import { ErrorCode } from '../../shared/constants/error-codes';
import { HttpStatus } from '../../shared/constants/http-status';
import { Logger } from '../../shared/middleware/logger';
import { EncryptionService } from '../../shared/utils/encryption.utils';

// Constants for security configuration
const REQUIRED_TLS_VERSION = '1.3';

const SECURITY_HEADERS = {
  HSTS: 'strict-transport-security',
  CSP: 'content-security-policy',
  FRAME_OPTIONS: 'x-frame-options',
  XSS_PROTECTION: 'x-xss-protection',
  CONTENT_TYPE_OPTIONS: 'x-content-type-options',
  REFERRER_POLICY: 'referrer-policy',
  FEATURE_POLICY: 'feature-policy'
};

const RATE_LIMIT_CONFIG = {
  points: 100,
  duration: 60,
  blockDuration: 300
};

// Initialize logger and rate limiter
const logger = new Logger({ level: 'info' });
const rateLimiter = new RateLimiterMemory(RATE_LIMIT_CONFIG);

/**
 * Enhanced security middleware implementing HIPAA and LGPD compliant security measures
 */
export default function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Apply Helmet with strict CSP and security headers
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          upgradeInsecureRequests: []
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      frameguard: {
        action: 'deny'
      },
      xssFilter: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })(req, res, next);

    // Apply HTTP Parameter Pollution protection
    hpp()(req, res, next);

    // Configure strict CORS
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(','),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Request-ID'],
      credentials: true,
      maxAge: 600
    })(req, res, next);

    // Rate limiting check
    rateLimiter.consume(req.ip)
      .catch(() => {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          method: req.method
        });
        res.status(HttpStatus.FORBIDDEN)
          .json({ error: ErrorCode.RATE_LIMIT_EXCEEDED });
        return;
      });

    // Validate TLS version
    if (!validateTLS(req)) {
      logger.error('Invalid TLS version', {
        version: req.protocol,
        required: REQUIRED_TLS_VERSION
      });
      res.status(HttpStatus.FORBIDDEN)
        .json({ error: ErrorCode.HIPAA_VIOLATION });
      return;
    }

    // Validate security headers
    if (!validateSecurityHeaders(req)) {
      logger.error('Security headers validation failed', {
        headers: req.headers
      });
      res.status(HttpStatus.FORBIDDEN)
        .json({ error: ErrorCode.HIPAA_VIOLATION });
      return;
    }

    // Validate request encryption for sensitive routes
    if (req.path.includes('/api/health') || req.path.includes('/api/claims')) {
      const encryptionService = new EncryptionService();
      if (!encryptionService.validateEncryption(req.body)) {
        logger.error('Encryption validation failed', {
          path: req.path,
          method: req.method
        });
        res.status(HttpStatus.FORBIDDEN)
          .json({ error: ErrorCode.HIPAA_VIOLATION });
        return;
      }
    }

    next();
  } catch (error) {
    logger.error('Security middleware error', { error });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: ErrorCode.INTERNAL_SERVER_ERROR });
  }
}

/**
 * Validates TLS version and certificate
 */
function validateTLS(req: Request): boolean {
  const tlsSocket = req.socket as any;
  if (!tlsSocket?.encrypted || !tlsSocket?.getCipher) {
    return false;
  }

  const cipher = tlsSocket.getCipher();
  return cipher?.version === REQUIRED_TLS_VERSION;
}

/**
 * Validates required security headers
 */
function validateSecurityHeaders(req: Request): boolean {
  const requiredHeaders = [
    SECURITY_HEADERS.HSTS,
    SECURITY_HEADERS.CSP,
    SECURITY_HEADERS.FRAME_OPTIONS,
    SECURITY_HEADERS.XSS_PROTECTION,
    SECURITY_HEADERS.CONTENT_TYPE_OPTIONS,
    SECURITY_HEADERS.REFERRER_POLICY
  ];

  return requiredHeaders.every(header => req.headers[header]);
}