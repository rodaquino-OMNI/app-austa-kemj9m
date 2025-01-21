/**
 * @fileoverview Enhanced logging middleware with HIPAA compliance, security features, and performance monitoring
 * @version 1.0.0
 */

import winston from 'winston'; // v3.10.0
import { Request, Response, NextFunction } from 'express'; // v4.18.2
import morgan from 'morgan'; // v1.10.0
import { AsyncLocalStorage } from 'async_hooks';
import { ErrorCode, ErrorCategory } from '../constants/error-codes';
import { v4 as uuidv4 } from 'uuid';

// Security patterns for PHI/PII detection
const PHI_PATTERNS = {
  SSN: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  MRN: /\b\d{8}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  DOB: /\b\d{2}[-/]\d{2}[-/]\d{4}\b/g
};

// Logger configuration interface
interface LoggerOptions {
  level: string;
  format?: winston.Logform.Format;
  transports?: winston.transport[];
  securityOptions?: {
    enablePHIMasking: boolean;
    enableAuditLog: boolean;
    encryptionKey?: string;
  };
}

// Context metadata interface
interface LogContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  source: string;
}

/**
 * Enhanced Logger class with security and monitoring features
 */
export class Logger {
  private logger: winston.Logger;
  private context: AsyncLocalStorage<LogContext>;
  private securityPatterns: typeof PHI_PATTERNS;
  private metrics: Map<string, any>;

  constructor(options: LoggerOptions) {
    // Initialize Winston logger with custom format
    this.logger = winston.createLogger({
      level: options.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.errors({ stack: true })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.colorize({ all: true })
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/audit.log',
          level: 'info'
        })
      ]
    });

    this.context = new AsyncLocalStorage<LogContext>();
    this.securityPatterns = PHI_PATTERNS;
    this.metrics = new Map();
  }

  /**
   * Creates a new logging context
   */
  public createContext(metadata: Partial<LogContext>): LogContext {
    const context: LogContext = {
      correlationId: metadata.correlationId || uuidv4(),
      timestamp: Date.now(),
      source: metadata.source || 'system',
      ...metadata
    };
    return context;
  }

  /**
   * Enhanced logging with security and context awareness
   */
  public log(level: string, message: string, meta: any = {}): void {
    const context = this.context.getStore();
    const sanitizedMeta = this.maskSensitiveData(meta);

    const logEntry = {
      message,
      level,
      ...sanitizedMeta,
      context: context || {},
      timestamp: new Date().toISOString()
    };

    this.logger.log(level, logEntry);

    // Track metrics for monitoring
    this.trackMetrics(level, logEntry);
  }

  /**
   * Masks sensitive PHI/PII data
   */
  private maskSensitiveData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const masked = { ...data };

    Object.entries(this.securityPatterns).forEach(([type, pattern]) => {
      const maskData = (obj: any) => {
        Object.keys(obj).forEach(key => {
          if (typeof obj[key] === 'string') {
            obj[key] = obj[key].replace(pattern, '***MASKED***');
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            maskData(obj[key]);
          }
        });
      };

      maskData(masked);
    });

    return masked;
  }

  /**
   * Tracks logging metrics for monitoring
   */
  private trackMetrics(level: string, entry: any): void {
    const timestamp = new Date().getTime();
    const metrics = {
      timestamp,
      level,
      source: entry.context?.source,
      correlationId: entry.context?.correlationId
    };

    this.metrics.set(timestamp.toString(), metrics);
  }

  /**
   * Retrieves logging metrics
   */
  public getMetrics(): Map<string, any> {
    return this.metrics;
  }
}

/**
 * Enhanced request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = uuidv4();
  const startTime = process.hrtime();

  // Create request context
  const logger = new Logger({ level: 'info' });
  const context = logger.createContext({
    correlationId,
    requestId: req.id,
    userId: req.user?.id,
    sessionId: req.session?.id,
    source: 'http'
  });

  // Log sanitized request
  logger.log('info', 'Incoming request', {
    method: req.method,
    url: req.url,
    headers: logger.maskSensitiveData(req.headers),
    query: logger.maskSensitiveData(req.query),
    body: logger.maskSensitiveData(req.body)
  });

  // Track response
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;

    logger.log('info', 'Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      correlationId
    });
  });

  next();
};

// Export singleton instance
export const globalLogger = new Logger({ level: 'info' });