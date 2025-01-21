/**
 * @fileoverview HIPAA-compliant authentication controller implementing OAuth2/OIDC
 * with comprehensive security features and audit logging
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // v4.18.2
import { Auth0Provider } from '@auth0/auth0-spa-js'; // v2.1.0
import rateLimit from 'express-rate-limit'; // v6.9.0
import { SecurityMetrics } from '@austa/security-metrics'; // v1.0.0
import { SessionManager } from '@austa/session-manager'; // v1.0.0

import AuthService from '../services/auth.service';
import { ErrorCode, ErrorMessage } from '../../../shared/constants/error-codes';
import { HttpStatus } from '../../../shared/constants/http-status';
import { validateUserData } from '../../../shared/utils/validation.utils';
import { IUser } from '../../../shared/interfaces/user.interface';

// Rate limiting configurations
const LOGIN_LIMITER = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: ErrorMessage[ErrorCode.RATE_LIMIT_EXCEEDED].message,
  standardHeaders: true,
  legacyHeaders: false
});

const REGISTRATION_LIMITER = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: ErrorMessage[ErrorCode.RATE_LIMIT_EXCEEDED].message,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * HIPAA-compliant authentication controller with comprehensive security features
 */
@controller('/auth')
@hipaaCompliant
@securityAudit
export class AuthController {
  private authService: AuthService;
  private sessionManager: SessionManager;
  private securityMetrics: SecurityMetrics;

  constructor(
    authService: AuthService,
    sessionManager: SessionManager,
    securityMetrics: SecurityMetrics
  ) {
    this.authService = authService;
    this.sessionManager = sessionManager;
    this.securityMetrics = securityMetrics;
  }

  /**
   * Handles secure user login with MFA support
   */
  @post('/login')
  @hipaaValidate
  @rateLimit(LOGIN_LIMITER)
  @auditLog
  public async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      // Extract and validate login credentials
      const { email, password, mfaCode, deviceFingerprint } = req.body;
      const ipAddress = req.ip;

      // Validate request data
      if (!email || !password || !deviceFingerprint) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: ErrorMessage[ErrorCode.INVALID_INPUT].message
        });
      }

      // Attempt authentication
      const loginResult = await this.authService.login({
        email,
        password,
        mfaCode,
        deviceFingerprint,
        ipAddress
      });

      // Create secure session
      await this.sessionManager.createSession({
        userId: loginResult.user.id,
        token: loginResult.token,
        fingerprint: loginResult.fingerprint,
        ipAddress
      });

      // Track security metrics
      await this.securityMetrics.trackEvent({
        type: 'LOGIN_SUCCESS',
        userId: loginResult.user.id,
        metadata: {
          ipAddress,
          deviceFingerprint
        }
      });

      // Set secure cookie with session token
      res.cookie('session', loginResult.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 900000 // 15 minutes
      });

      return res.status(HttpStatus.OK).json({
        token: loginResult.token,
        fingerprint: loginResult.fingerprint,
        user: {
          id: loginResult.user.id,
          email: loginResult.user.email,
          role: loginResult.user.role
        }
      });
    } catch (error) {
      await this.securityMetrics.trackEvent({
        type: 'LOGIN_FAILURE',
        metadata: {
          error: error.message,
          ipAddress: req.ip
        }
      });

      if (error.message === ErrorCode.INVALID_CREDENTIALS) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: ErrorMessage[ErrorCode.INVALID_CREDENTIALS].message
        });
      }

      next(error);
    }
  }

  /**
   * Handles secure user registration with enhanced validation
   */
  @post('/register')
  @hipaaValidate
  @rateLimit(REGISTRATION_LIMITER)
  @auditLog
  public async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const userData: IUser = req.body;

      // Validate user data
      const validationResult = await validateUserData(userData, {
        validatePassword: true,
        checkMFA: true
      });

      if (!validationResult.isValid) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: ErrorMessage[ErrorCode.INVALID_INPUT].message,
          details: validationResult.errors
        });
      }

      // Register user
      const registrationResult = await this.authService.register(userData);

      // Track registration metrics
      await this.securityMetrics.trackEvent({
        type: 'USER_REGISTERED',
        userId: registrationResult.user.id,
        metadata: {
          ipAddress: req.ip
        }
      });

      return res.status(HttpStatus.CREATED).json({
        token: registrationResult.token,
        fingerprint: registrationResult.fingerprint,
        user: {
          id: registrationResult.user.id,
          email: registrationResult.user.email,
          role: registrationResult.user.role
        }
      });
    } catch (error) {
      await this.securityMetrics.trackEvent({
        type: 'REGISTRATION_FAILURE',
        metadata: {
          error: error.message,
          ipAddress: req.ip
        }
      });
      next(error);
    }
  }

  /**
   * Handles secure token refresh with fingerprint validation
   */
  @post('/refresh-token')
  @hipaaValidate
  @auditLog
  public async refreshToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: ErrorMessage[ErrorCode.INVALID_INPUT].message
        });
      }

      const refreshResult = await this.authService.refreshToken(token);

      // Update session with new token
      await this.sessionManager.updateSession({
        token: refreshResult.token,
        fingerprint: refreshResult.fingerprint
      });

      return res.status(HttpStatus.OK).json({
        token: refreshResult.token,
        fingerprint: refreshResult.fingerprint
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handles secure logout with session termination
   */
  @post('/logout')
  @hipaaValidate
  @auditLog
  public async logout(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response> {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: ErrorMessage[ErrorCode.INVALID_INPUT].message
        });
      }

      // Logout and invalidate session
      await this.authService.logout(token);
      await this.sessionManager.terminateSession(token);

      // Clear session cookie
      res.clearCookie('session');

      return res.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  }
}

export default AuthController;