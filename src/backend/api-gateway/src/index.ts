/**
 * @fileoverview Main entry point for AUSTA SuperApp API Gateway
 * Implements enterprise-grade API Gateway with HIPAA compliance, enhanced security,
 * comprehensive monitoring, and intelligent routing for microservices.
 * 
 * @version 1.0.0
 */

import express from 'express'; // v4.18.2
import morgan from 'morgan'; // v1.10.0
import dotenv from 'dotenv'; // v16.3.1
import { register, collectDefaultMetrics } from 'prom-client'; // v14.2.0
import winston from 'winston'; // v3.10.0
import { HealthCheckService } from '@nestjs/terminus'; // v9.2.2

import { kongConfig } from './config/kong.config';
import corsMiddleware from './middleware/cors';
import createRateLimiter from './middleware/rate-limiter';
import securityMiddleware from './middleware/security';
import { HttpStatus } from '../../shared/constants/http-status';
import { ErrorCode, ErrorMessage } from '../../shared/constants/error-codes';
import { Logger, requestLogger, globalLogger } from '../../shared/middleware/logger';
import { EncryptionService } from '../../shared/utils/encryption.utils';

// Load environment variables
dotenv.config();

// Global constants
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_VERSION = process.env.API_VERSION || 'v1';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const AUDIT_ENABLED = process.env.AUDIT_ENABLED === 'true';

/**
 * Initializes Express server with enhanced security and monitoring
 */
async function initializeServer(): Promise<express.Express> {
  const app = express();
  const logger = new Logger({ level: LOG_LEVEL });

  // Initialize metrics collection
  collectDefaultMetrics();

  // Initialize encryption service
  const encryptionService = new EncryptionService({
    region: process.env.AWS_REGION!,
    keyId: process.env.KMS_KEY_ID!,
    endpoint: process.env.KMS_ENDPOINT!,
    keyRotationInterval: 86400000, // 24 hours
    cacheTimeout: 3600 // 1 hour
  }, globalLogger);

  await setupMiddleware(app);
  await setupRoutes(app);

  return app;
}

/**
 * Configures comprehensive middleware chain
 */
async function setupMiddleware(app: express.Express): Promise<void> {
  // Basic middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging with audit trail
  app.use(requestLogger);
  app.use(morgan('combined', {
    stream: { write: message => globalLogger.log('info', message) }
  }));

  // Security middleware chain
  app.use(securityMiddleware);
  app.use(corsMiddleware(NODE_ENV));
  app.use(createRateLimiter({
    redis: {
      nodes: kongConfig.plugins.rate_limiting.config.redis_cluster_addresses.map(addr => {
        const [host, port] = addr.split(':');
        return { host, port: parseInt(port) };
      }),
      options: {
        clusterRetryStrategy: times => Math.min(times * 100, 3000),
        enableReadyCheck: true,
        maxRedirections: 16
      }
    },
    limits: {
      standard: kongConfig.plugins.rate_limiting.config.minute.patient,
      premium: kongConfig.plugins.rate_limiting.config.minute.provider
    },
    windowMs: 60000,
    fallbackStrategy: 'STRICT',
    circuitBreaker: {
      timeout: 5000,
      resetTimeout: 30000,
      errorThreshold: 50
    }
  }));
}

/**
 * Configures API routes with security and validation
 */
async function setupRoutes(app: express.Express): Promise<void> {
  // Health check endpoint
  app.get('/health', async (req, res) => {
    const healthCheck = new HealthCheckService();
    const result = await healthCheck.check([]);
    res.status(HttpStatus.OK).json(result);
  });

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // API version prefix
  const apiRouter = express.Router();
  app.use(`/api/${API_VERSION}`, apiRouter);

  // Configure service routes
  Object.entries(kongConfig.routes).forEach(([service, config]) => {
    const serviceRouter = express.Router();
    
    // Apply service-specific middleware
    if (service === 'health-records' || service === 'claims') {
      serviceRouter.use(async (req, res, next) => {
        // Additional PHI/PII validation for sensitive routes
        const encryptionService = new EncryptionService({
          region: process.env.AWS_REGION!,
          keyId: process.env.KMS_KEY_ID!,
          endpoint: process.env.KMS_ENDPOINT!,
          keyRotationInterval: 86400000,
          cacheTimeout: 3600
        }, globalLogger);

        if (!encryptionService.validateEncryption(req.body)) {
          return res.status(HttpStatus.FORBIDDEN).json({
            error: ErrorCode.HIPAA_VIOLATION,
            message: ErrorMessage[ErrorCode.HIPAA_VIOLATION].message
          });
        }
        next();
      });
    }

    // Mount service routes
    apiRouter.use(config.paths[0], serviceRouter);
  });

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    globalLogger.log('error', 'Unhandled error', { error: err });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: ErrorCode.INTERNAL_SERVER_ERROR,
      message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message
    });
  });
}

/**
 * Starts the server with comprehensive monitoring
 */
async function startServer(app: express.Express): Promise<void> {
  try {
    const server = app.listen(PORT, () => {
      globalLogger.log('info', `API Gateway started`, {
        port: PORT,
        environment: NODE_ENV,
        apiVersion: API_VERSION
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      globalLogger.log('info', 'Received SIGTERM signal, initiating graceful shutdown');
      server.close(() => {
        globalLogger.log('info', 'Server shutdown completed');
        process.exit(0);
      });
    });

  } catch (error) {
    globalLogger.log('error', 'Failed to start server', { error });
    process.exit(1);
  }
}

// Initialize and start server
const app = await initializeServer();
await startServer(app);

export default app;