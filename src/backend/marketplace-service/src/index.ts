/**
 * @fileoverview Entry point for AUSTA SuperApp marketplace microservice
 * Implements enhanced security, monitoring, and HIPAA compliance features
 * @version 1.0.0
 */

import express, { Express } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import { trace, context } from '@opentelemetry/api'; // v1.4.0
import * as prometheusClient from 'prom-client'; // v14.2.0
import healthCheck from 'express-health-check'; // v0.1.0
import { marketplaceConfig } from './config/marketplace.config';
import { errorHandler } from '../../shared/middleware/error-handler';
import { globalLogger as Logger } from '../../shared/middleware/logger';
import { HttpStatus } from '../../shared/constants/http-status';
import { ErrorCode } from '../../shared/constants/error-codes';

// Initialize tracer
const tracer = trace.getTracer('marketplace-service');

// Global constants
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORRELATION_ID_KEY = 'x-correlation-id';

/**
 * Initialize Express application with enhanced security and monitoring
 */
function initializeApp(): Express {
  const app = express();

  // Enhanced security middleware
  app.use(helmet({
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
  }));

  // CORS configuration with HIPAA compliance
  app.use(cors({
    origin: marketplaceConfig.security.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', CORRELATION_ID_KEY],
    credentials: true,
    maxAge: 600
  }));

  // Request parsing and validation
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Add correlation ID middleware
  app.use((req, res, next) => {
    req.id = req.headers[CORRELATION_ID_KEY] as string || crypto.randomUUID();
    res.setHeader(CORRELATION_ID_KEY, req.id);
    next();
  });

  // Initialize metrics
  setupMetrics(app);

  // Health check endpoint
  app.use('/health', healthCheck({
    test: () => Promise.resolve(),
    healthy: () => Promise.resolve(),
    state: () => ({ uptime: process.uptime() })
  }));

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

/**
 * Configure comprehensive metrics collection
 */
function setupMetrics(app: Express): void {
  // Initialize Prometheus registry
  const register = new prometheusClient.Registry();
  prometheusClient.collectDefaultMetrics({ register });

  // Custom metrics
  const httpRequestDuration = new prometheusClient.Histogram({
    name: 'marketplace_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
  });

  const activeConnections = new prometheusClient.Gauge({
    name: 'marketplace_active_connections',
    help: 'Number of active connections'
  });

  const errorRate = new prometheusClient.Counter({
    name: 'marketplace_error_total',
    help: 'Total number of errors',
    labelNames: ['error_code']
  });

  register.registerMetric(httpRequestDuration);
  register.registerMetric(activeConnections);
  register.registerMetric(errorRate);

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });
}

/**
 * Start server with enhanced error handling and monitoring
 */
async function startServer(app: Express): Promise<void> {
  try {
    // Validate configuration
    if (!marketplaceConfig.elasticsearch || !marketplaceConfig.redis) {
      throw new Error('Invalid service configuration');
    }

    // Start server
    const server = app.listen(PORT, () => {
      Logger.log('info', `Marketplace service started on port ${PORT}`, {
        environment: NODE_ENV,
        correlationId: crypto.randomUUID()
      });
    });

    // Graceful shutdown
    const shutdown = async () => {
      Logger.log('info', 'Shutting down marketplace service...');
      
      server.close(() => {
        Logger.log('info', 'Server closed successfully');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        Logger.log('error', 'Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    Logger.log('error', 'Failed to start marketplace service', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: crypto.randomUUID()
    });
    process.exit(1);
  }
}

// Initialize and start application
const app = initializeApp();
startServer(app);

// Export app instance for testing
export { app };