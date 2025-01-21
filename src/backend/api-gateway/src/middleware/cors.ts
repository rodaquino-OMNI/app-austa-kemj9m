/**
 * @fileoverview Healthcare-compliant CORS middleware implementation
 * Implements HIPAA-grade security controls for cross-origin resource sharing
 * with comprehensive audit logging and platform-specific security policies.
 * 
 * @version 1.0.0
 */

import express from 'express'; // v4.18.0
import cors from 'cors'; // v2.8.5
import winston from 'winston'; // v3.8.2
import { kongConfig } from '../config/kong.config';
import { HttpStatus } from '../../../shared/constants/http-status';

/**
 * Logger configuration for CORS audit trails
 */
const corsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'cors-middleware' },
  transports: [
    new winston.transports.File({ filename: 'cors-audit.log' }),
    new winston.transports.Console()
  ]
});

/**
 * Healthcare-compliant CORS configuration class
 */
export class CorsConfig {
  private readonly allowedOrigins: string[];
  private readonly allowedMethods: string[];
  private readonly allowedHeaders: string[];
  private readonly exposedHeaders: string[];
  private readonly maxAge: number;
  private readonly allowCredentials: boolean;
  private readonly mobileConfig: { protocols: string[] };
  private readonly securityHeaders: Record<string, string>;

  constructor(environment: string) {
    const corsPlugin = kongConfig.plugins.cors.config;
    
    this.allowedOrigins = corsPlugin.origins;
    this.allowedMethods = corsPlugin.methods;
    this.allowedHeaders = corsPlugin.headers;
    this.exposedHeaders = corsPlugin.exposed_headers;
    this.maxAge = corsPlugin.max_age;
    this.allowCredentials = corsPlugin.credentials;
    
    this.mobileConfig = {
      protocols: ['capacitor://', 'ionic://', 'https://', 'http://']
    };

    this.securityHeaders = {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'"
    };
  }

  /**
   * Returns CORS options with healthcare security settings
   */
  public getCorsOptions(): cors.CorsOptions {
    return {
      origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        const isAllowed = this.validateOrigin(origin);
        if (isAllowed) {
          callback(null, true);
        } else {
          corsLogger.warn('CORS violation attempt', { origin });
          callback(new Error('CORS policy violation'));
        }
      },
      methods: this.allowedMethods,
      allowedHeaders: this.allowedHeaders,
      exposedHeaders: this.exposedHeaders,
      credentials: this.allowCredentials,
      maxAge: this.maxAge,
      preflightContinue: false,
      optionsSuccessStatus: 204
    };
  }

  /**
   * Validates origin against allowed patterns with healthcare app support
   */
  private validateOrigin(origin: string): boolean {
    // Handle mobile app specific protocols
    const isMobileApp = this.mobileConfig.protocols.some(protocol => 
      origin.toLowerCase().startsWith(protocol));
    
    if (isMobileApp) {
      return true;
    }

    // Check against allowed origins
    return this.allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
        return pattern.test(origin);
      }
      return allowed === origin;
    });
  }
}

/**
 * Healthcare-compliant CORS middleware implementation
 */
export const corsMiddleware = (environment: string = process.env.NODE_ENV || 'development'): express.RequestHandler => {
  const config = new CorsConfig(environment);
  const corsOptions = config.getCorsOptions();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Add security headers
    Object.entries(config['securityHeaders']).forEach(([header, value]) => {
      res.setHeader(header, value);
    });

    // Add HIPAA audit headers
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-HIPAA-Audit-ID', requestId);

    // Log CORS request for audit
    corsLogger.info('CORS request', {
      requestId,
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent']
    });

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(HttpStatus.NO_CONTENT).end();
      return;
    }

    // Apply CORS middleware
    cors(corsOptions)(req, res, (err: any) => {
      if (err) {
        corsLogger.error('CORS error', {
          requestId,
          error: err.message,
          origin: req.headers.origin
        });

        res.status(HttpStatus.FORBIDDEN).json({
          error: 'CORS policy violation',
          message: 'Origin not allowed by HIPAA security policy'
        });
        return;
      }
      next();
    });
  };
};

export default corsMiddleware;