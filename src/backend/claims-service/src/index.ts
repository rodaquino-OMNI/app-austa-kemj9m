/**
 * @fileoverview Entry point for Claims Service microservice
 * Implements HIPAA-compliant claims processing with enhanced security and monitoring
 * @version 2.0.0
 * @license HIPAA-compliant
 */

import express from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import rateLimit from 'express-rate-limit'; // v6.9.0
import { body, validationResult } from 'express-validator'; // v7.0.0

import { CLAIMS_CONFIG } from './config/claims.config';
import { ClaimsController } from './controllers/claims.controller';
import { Logger } from '../../shared/middleware/logger';
import { ErrorCode } from '../../shared/constants/error-codes';
import { HttpStatus } from '../../shared/constants/http-status';

// Initialize Express application
const app = express();
const logger = new Logger({ level: 'info' });
const PORT = process.env.PORT || 3000;

/**
 * Configures Express middleware with enhanced security and monitoring
 * @param app Express application instance
 */
function initializeMiddleware(app: express.Application): void {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  }));

  // CORS configuration with strict healthcare domain restrictions
  app.use(cors({
    origin: CLAIMS_CONFIG.service.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 600
  }));

  // Request parsing and compression
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression());

  // Rate limiting for DDoS protection
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: CLAIMS_CONFIG.security.maxRequestsPerWindow,
    message: { error: ErrorCode.RATE_LIMIT_EXCEEDED },
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Request logging with PHI/PII protection
  app.use((req, res, next) => {
    logger.log('info', 'Incoming request', {
      method: req.method,
      path: req.path,
      correlationId: req.headers['x-correlation-id']
    });
    next();
  });
}

/**
 * Configures API routes with security middleware and validation
 * @param app Express application instance
 */
function initializeRoutes(app: express.Application): void {
  const claimsController = new ClaimsController();

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(HttpStatus.OK).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: CLAIMS_CONFIG.version
    });
  });

  // Claims API routes with validation and security
  app.use('/api/v1/claims', 
    // Authentication middleware
    authenticateRequest,
    // Request validation
    validateRequest,
    // Route handlers
    claimsController
  );

  // Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.log('error', 'Request error', {
      error: err.message,
      stack: err.stack,
      correlationId: req.headers['x-correlation-id']
    });

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred'
    });
  });
}

/**
 * Starts the Express server with health checks and monitoring
 */
async function startServer(): Promise<void> {
  try {
    // Initialize middleware
    initializeMiddleware(app);

    // Initialize routes
    initializeRoutes(app);

    // Start server
    app.listen(PORT, () => {
      logger.log('info', `Claims Service started`, {
        port: PORT,
        environment: CLAIMS_CONFIG.service.environment,
        version: CLAIMS_CONFIG.version
      });
    });

    // Initialize health monitoring
    const healthCheck = setInterval(() => {
      const metrics = {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      logger.log('info', 'Health check', metrics);
    }, CLAIMS_CONFIG.monitoring.healthCheckInterval);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      clearInterval(healthCheck);
      logger.log('info', 'Server shutting down');
      process.exit(0);
    });

  } catch (error) {
    logger.log('error', 'Server startup failed', { error });
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  logger.log('error', 'Fatal server error', { error });
  process.exit(1);
});

// Export app instance for testing
export { app };