/**
 * @fileoverview Entry point for HIPAA-compliant virtual care microservice
 * @version 1.0.0
 * @license HIPAA-compliant
 */

// External dependencies
import express, { Application, Request, Response, NextFunction } from 'express'; // @version 4.18.2
import mongoose from 'mongoose'; // @version 7.5.0
import cors from 'cors'; // @version 2.8.5
import helmet from 'helmet'; // @version 7.0.0
import dotenv from 'dotenv'; // @version 16.3.1
import winston from 'winston'; // @version 3.10.0
import { Server } from 'http';
import { Container } from 'inversify';

// Internal imports
import { webRTCConfig } from './config/webrtc.config';
import { ConsultationController } from './controllers/consultation.controller';
import { VideoService } from './services/video.service';
import { ErrorCode, ErrorMessage } from '../../shared/constants/error-codes';

// Load environment variables
dotenv.config();

// Global constants
const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI as string;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const AUDIT_ENABLED = process.env.AUDIT_ENABLED === 'true';

// Enhanced CORS configuration for secure cross-origin requests
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false
};

// Advanced security headers configuration for WebRTC
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss://*.twilio.com'],
      mediaSrc: ["'self'", 'blob:'],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      workerSrc: ["'self'", 'blob:']
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
};

// Configure Winston logger with HIPAA compliance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'virtual-care-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

/**
 * Initializes the Express application with enhanced security middleware
 */
async function initializeApp(): Promise<Application> {
  const app = express();

  // Security middleware
  app.use(helmet(helmetOptions));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  });

  // Initialize dependency injection container
  const container = new Container();
  container.bind<VideoService>('VideoService').to(VideoService);
  container.bind<ConsultationController>('ConsultationController').to(ConsultationController);

  // Register routes
  const consultationController = container.get<ConsultationController>('ConsultationController');
  app.use('/api/v1/consultations', consultationController.router);

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Error occurred', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });

    const errorResponse = {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message
    };

    res.status(500).json(errorResponse);
  });

  return app;
}

/**
 * Starts the HTTP server with enhanced monitoring
 */
async function startServer(app: Application): Promise<void> {
  try {
    // Connect to MongoDB with enhanced security
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      ssl: NODE_ENV === 'production',
      sslValidate: true
    });
    logger.info('Connected to MongoDB');

    // Start HTTP server
    const server = new Server(app);
    server.listen(PORT, () => {
      logger.info(`Virtual care service listening on port ${PORT}`);
    });

    // Initialize WebRTC service
    const videoService = new VideoService(webRTCConfig);
    await videoService.initialize();
    logger.info('WebRTC service initialized');

    // Graceful shutdown handler
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await mongoose.connection.close();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Bootstrap application
(async () => {
  try {
    const app = await initializeApp();
    await startServer(app);
  } catch (error) {
    logger.error('Failed to initialize application', { error });
    process.exit(1);
  }
})();

export { initializeApp, startServer };