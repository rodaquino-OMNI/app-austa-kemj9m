/**
 * @fileoverview Entry point for Health Records microservice with HIPAA compliance
 * Implements comprehensive security, performance optimization, and error handling
 * @version 1.0.0
 */

// External imports with versions
import express from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v6.0.0
import compression from 'compression'; // v1.7.4
import mongoose from 'mongoose'; // v7.0.0
import rateLimit from 'express-rate-limit'; // v6.7.0
import newrelic from 'newrelic'; // v9.0.0

// Internal imports
import { fhirConfig } from './config/fhir.config';
import { HealthRecordsController } from './controllers/records.controller';
import { errorHandler } from '../../shared/middleware/error-handler';
import { logger, requestLogger } from '../../shared/middleware/logger';
import { ErrorCode } from '../../shared/constants/error-codes';

// Environment variables with defaults
const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV;
const MAX_POOL_SIZE = parseInt(process.env.MAX_POOL_SIZE || '10', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10); // 15 minutes
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

/**
 * Initializes Express application with enhanced security and performance configurations
 */
async function initializeApp(): Promise<express.Application> {
  // Initialize New Relic monitoring
  if (NODE_ENV === 'production') {
    newrelic.instrumentLoadedModule('express', express);
  }

  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  // CORS configuration with strict options
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 600 // 10 minutes
  }));

  // Performance optimizations
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Rate limiting
  app.use(rateLimit({
    windowMs: RATE_LIMIT_WINDOW,
    max: RATE_LIMIT_MAX,
    message: { 
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests, please try again later'
    }
  }));

  // Request logging and correlation
  app.use(requestLogger);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  });

  // Initialize FHIR routes
  if (!fhirConfig.validateConfig()) {
    throw new Error('Invalid FHIR configuration');
  }

  // Register routes
  const healthRecordsController = new HealthRecordsController();
  app.use('/api/v1/health-records', healthRecordsController.router);

  // Error handling
  app.use(errorHandler);

  return app;
}

/**
 * Establishes MongoDB connection with optimized settings
 */
async function connectDatabase(): Promise<void> {
  try {
    if (!MONGODB_URI) {
      throw new Error('MongoDB URI is not defined');
    }

    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: MAX_POOL_SIZE,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      ssl: NODE_ENV === 'production',
      sslValidate: true,
      retryWrites: true,
      retryReads: true,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000
    });

    logger.info('Connected to MongoDB', {
      service: 'health-records',
      poolSize: MAX_POOL_SIZE
    });
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
      service: 'health-records'
    });
    throw error;
  }
}

/**
 * Starts the HTTP server with comprehensive error handling
 */
async function startServer(app: express.Application): Promise<void> {
  try {
    await connectDatabase();

    const server = app.listen(PORT, () => {
      logger.info('Health Records service started', {
        port: PORT,
        environment: NODE_ENV,
        timestamp: new Date().toISOString()
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(async () => {
        await mongoose.connection.close();
        logger.info('Server shut down complete');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Server startup failed', {
      error: error.message,
      service: 'health-records'
    });
    process.exit(1);
  }
}

// Bootstrap application
(async () => {
  try {
    const app = await initializeApp();
    await startServer(app);
  } catch (error) {
    logger.error('Application bootstrap failed', {
      error: error.message,
      service: 'health-records'
    });
    process.exit(1);
  }
})();

// Export app for testing
export const app = initializeApp();