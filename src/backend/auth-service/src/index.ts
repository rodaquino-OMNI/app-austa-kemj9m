/**
 * @fileoverview HIPAA-compliant authentication service entry point
 * Implements secure OAuth 2.0 + OIDC authentication with comprehensive security features
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // v4.18.2
import helmet from 'helmet'; // v7.0.0
import cors from 'cors'; // v2.8.5
import session from 'express-session'; // v1.17.3
import { createClient } from 'redis'; // v4.6.7
import RedisStore from 'connect-redis'; // v7.1.0
import rateLimit from 'express-rate-limit'; // v6.9.0
import winston from 'winston'; // v3.10.0
import { AUTH_CONFIG } from './config/auth.config';
import AuthController from './controllers/auth.controller';
import { ErrorCode, ErrorMessage } from '../../shared/constants/error-codes';
import { HttpStatus } from '../../shared/constants/http-status';

// Initialize Express application
const app: Express = express();
const PORT = process.env.PORT || 3001;

// Configure Winston logger with security considerations
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

/**
 * Configures comprehensive security middleware stack
 * @param app Express application instance
 */
const setupSecurityMiddleware = async (app: Express): Promise<void> => {
  // Configure Helmet with strict security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  }));

  // Configure CORS with strict options
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true,
    maxAge: 600
  }));

  // Initialize Redis client for session store
  const redisClient = createClient({
    url: process.env.REDIS_URL,
    password: AUTH_CONFIG.redis.auth.password,
    socket: {
      tls: AUTH_CONFIG.redis.tls.enabled,
      rejectUnauthorized: true
    }
  });

  await redisClient.connect();

  // Configure secure session management
  app.use(session({
    store: new RedisStore({ client: redisClient }),
    name: AUTH_CONFIG.session.name,
    secret: AUTH_CONFIG.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: AUTH_CONFIG.session.secure,
      httpOnly: AUTH_CONFIG.session.httpOnly,
      domain: AUTH_CONFIG.session.domain || undefined,
      path: AUTH_CONFIG.session.path,
      maxAge: AUTH_CONFIG.session.maxAge,
      sameSite: 'strict'
    }
  }));

  // Configure global rate limiting
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: ErrorMessage[ErrorCode.RATE_LIMIT_EXCEEDED].message,
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Body parsing with size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
};

/**
 * Configures authentication routes with security middleware
 * @param app Express application instance
 */
const setupAuthRoutes = (app: Express): void => {
  const authController = new AuthController();
  const apiVersion = '/api/v1';

  // Health check endpoint
  app.get(`${apiVersion}/health`, (req: Request, res: Response) => {
    res.status(HttpStatus.OK).json({ status: 'healthy' });
  });

  // Authentication routes
  app.post(`${apiVersion}/auth/login`, authController.login);
  app.post(`${apiVersion}/auth/register`, authController.register);
  app.post(`${apiVersion}/auth/refresh-token`, authController.refreshToken);
  app.post(`${apiVersion}/auth/logout`, authController.logout);

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Error:', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message
    });
  });
};

/**
 * Initializes and starts the secure Express server
 */
const startSecureServer = async (): Promise<void> => {
  try {
    // Setup security middleware
    await setupSecurityMiddleware(app);

    // Setup authentication routes
    setupAuthRoutes(app);

    // Start server with HTTPS
    const server = app.listen(PORT, () => {
      logger.info(`Auth service running securely on port ${PORT}`);
    });

    // Graceful shutdown handler
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Starting graceful shutdown...');
      server.close(() => {
        logger.info('Server closed. Process terminating...');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

// Start server
startSecureServer().catch(error => {
  logger.error('Fatal error during server startup:', error);
  process.exit(1);
});

export default app;