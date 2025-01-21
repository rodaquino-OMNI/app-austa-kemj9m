/**
 * @fileoverview HIPAA-compliant authentication configuration with enhanced security
 * Implements OAuth 2.0 + OIDC, JWT management, and secure session handling
 * @version 1.0.0
 */

import { config as dotenvConfig } from 'dotenv';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { HttpStatus } from '../../../shared/constants/http-status';

/**
 * Interface defining comprehensive HIPAA-compliant authentication configuration
 */
export interface AuthConfiguration {
  jwt: {
    secret: string;
    publicKey: string;
    privateKey: string;
    expiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    algorithm: string;
    rotationSchedule: string;
  };
  oauth2: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope: string[];
    authorizeUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    logoutUrl: string;
  };
  session: {
    name: string;
    secret: string;
    maxAge: number;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    domain: string | null;
    path: string;
    encryptionKey: string;
    signatureKey: string;
  };
  security: {
    maxLoginAttempts: number;
    lockoutDuration: number;
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireNumbers: boolean;
      requireSpecialChars: boolean;
      maxAge: number;
      preventReuse: number;
    };
    mfa: {
      required: boolean;
      allowedTypes: string[];
      issuer: string;
      validityWindow: number;
      backupCodes: number;
    };
    hipaa: {
      enabled: boolean;
      auditLevel: string;
      inactivityTimeout: number;
      sessionMonitoring: boolean;
      encryptionStrength: string;
    };
  };
  redis: {
    cluster: {
      nodes: Array<{ host: string; port: number }>;
      options: {
        maxRedirections: number;
        retryDelayOnFailover: number;
        retryDelayOnClusterDown: number;
        enableReadyCheck: boolean;
        scaleReads: string;
      };
    };
    tls: {
      enabled: boolean;
      cert: string;
      key: string;
      ca: string;
    };
    auth: {
      password: string;
      username: string;
    };
    keyPrefix: string;
    db: number;
  };
}

/**
 * Default JWT configuration with security best practices
 */
const JWT_DEFAULTS = {
  expiresIn: '15m',
  refreshExpiresIn: '7d',
  algorithm: 'RS256',
  issuer: 'austa-auth-service',
  rotationSchedule: '7d'
} as const;

/**
 * Default security configuration aligned with HIPAA requirements
 */
const SECURITY_DEFAULTS = {
  maxLoginAttempts: 5,
  lockoutDuration: 900,
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAge: 90,
    preventReuse: 24
  },
  mfa: {
    required: true,
    allowedTypes: ['authenticator', 'sms', 'email'],
    validityWindow: 30,
    backupCodes: 10
  }
} as const;

/**
 * Default session configuration with security hardening
 */
const SESSION_DEFAULTS = {
  name: 'austa.sid',
  maxAge: 3600000,
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
  domain: null,
  path: '/'
} as const;

/**
 * Default HIPAA compliance settings
 */
const HIPAA_DEFAULTS = {
  enabled: true,
  auditLevel: 'detailed',
  inactivityTimeout: 900,
  sessionMonitoring: true,
  encryptionStrength: 'AES-256-GCM'
} as const;

/**
 * Loads and validates authentication configuration with enhanced security checks
 * @returns {AuthConfiguration} Validated authentication configuration
 * @throws {Error} If required configuration is missing or invalid
 */
function loadConfig(): AuthConfiguration {
  dotenvConfig();

  // Validate required environment variables
  const requiredEnvVars = [
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'JWT_SECRET',
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET',
    'REDIS_PASSWORD',
    'SESSION_ENCRYPTION_KEY',
    'SESSION_SIGNATURE_KEY'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Parse Redis cluster nodes from environment
  const redisNodes = process.env.REDIS_CLUSTER_NODES?.split(',').map(node => {
    const [host, port] = node.split(':');
    return { host, port: parseInt(port, 10) };
  }) || [{ host: 'localhost', port: 6379 }];

  return {
    jwt: {
      secret: process.env.JWT_SECRET!,
      publicKey: process.env.JWT_PUBLIC_KEY!,
      privateKey: process.env.JWT_PRIVATE_KEY!,
      expiresIn: process.env.JWT_EXPIRES_IN || JWT_DEFAULTS.expiresIn,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || JWT_DEFAULTS.refreshExpiresIn,
      issuer: process.env.JWT_ISSUER || JWT_DEFAULTS.issuer,
      algorithm: process.env.JWT_ALGORITHM || JWT_DEFAULTS.algorithm,
      rotationSchedule: process.env.JWT_ROTATION_SCHEDULE || JWT_DEFAULTS.rotationSchedule
    },
    oauth2: {
      clientId: process.env.OAUTH_CLIENT_ID!,
      clientSecret: process.env.OAUTH_CLIENT_SECRET!,
      callbackUrl: process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000/auth/callback',
      scope: (process.env.OAUTH_SCOPE || 'openid profile email').split(' '),
      authorizeUrl: process.env.OAUTH_AUTHORIZE_URL || 'https://auth0.com/authorize',
      tokenUrl: process.env.OAUTH_TOKEN_URL || 'https://auth0.com/oauth/token',
      userInfoUrl: process.env.OAUTH_USER_INFO_URL || 'https://auth0.com/userinfo',
      logoutUrl: process.env.OAUTH_LOGOUT_URL || 'https://auth0.com/logout'
    },
    session: {
      name: process.env.SESSION_NAME || SESSION_DEFAULTS.name,
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      maxAge: parseInt(process.env.SESSION_MAX_AGE || SESSION_DEFAULTS.maxAge.toString(), 10),
      secure: process.env.SESSION_SECURE !== 'false',
      httpOnly: process.env.SESSION_HTTP_ONLY !== 'false',
      sameSite: process.env.SESSION_SAME_SITE || SESSION_DEFAULTS.sameSite,
      domain: process.env.SESSION_DOMAIN || SESSION_DEFAULTS.domain,
      path: process.env.SESSION_PATH || SESSION_DEFAULTS.path,
      encryptionKey: process.env.SESSION_ENCRYPTION_KEY!,
      signatureKey: process.env.SESSION_SIGNATURE_KEY!
    },
    security: {
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || SECURITY_DEFAULTS.maxLoginAttempts.toString(), 10),
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || SECURITY_DEFAULTS.lockoutDuration.toString(), 10),
      passwordPolicy: {
        minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || SECURITY_DEFAULTS.passwordPolicy.minLength.toString(), 10),
        requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
        requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
        requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
        requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
        maxAge: parseInt(process.env.PASSWORD_MAX_AGE || SECURITY_DEFAULTS.passwordPolicy.maxAge.toString(), 10),
        preventReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE || SECURITY_DEFAULTS.passwordPolicy.preventReuse.toString(), 10)
      },
      mfa: {
        required: process.env.MFA_REQUIRED !== 'false',
        allowedTypes: (process.env.MFA_ALLOWED_TYPES || SECURITY_DEFAULTS.mfa.allowedTypes.join(',')).split(','),
        issuer: process.env.MFA_ISSUER || 'AUSTA SuperApp',
        validityWindow: parseInt(process.env.MFA_VALIDITY_WINDOW || SECURITY_DEFAULTS.mfa.validityWindow.toString(), 10),
        backupCodes: parseInt(process.env.MFA_BACKUP_CODES || SECURITY_DEFAULTS.mfa.backupCodes.toString(), 10)
      },
      hipaa: {
        enabled: process.env.HIPAA_ENABLED !== 'false',
        auditLevel: process.env.HIPAA_AUDIT_LEVEL || HIPAA_DEFAULTS.auditLevel,
        inactivityTimeout: parseInt(process.env.HIPAA_INACTIVITY_TIMEOUT || HIPAA_DEFAULTS.inactivityTimeout.toString(), 10),
        sessionMonitoring: process.env.HIPAA_SESSION_MONITORING !== 'false',
        encryptionStrength: process.env.HIPAA_ENCRYPTION_STRENGTH || HIPAA_DEFAULTS.encryptionStrength
      }
    },
    redis: {
      cluster: {
        nodes: redisNodes,
        options: {
          maxRedirections: parseInt(process.env.REDIS_MAX_REDIRECTIONS || '16', 10),
          retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_FAILOVER || '3000', 10),
          retryDelayOnClusterDown: parseInt(process.env.REDIS_RETRY_DELAY_DOWN || '1000', 10),
          enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false',
          scaleReads: process.env.REDIS_SCALE_READS || 'master'
        }
      },
      tls: {
        enabled: process.env.REDIS_TLS_ENABLED === 'true',
        cert: process.env.REDIS_TLS_CERT || '',
        key: process.env.REDIS_TLS_KEY || '',
        ca: process.env.REDIS_TLS_CA || ''
      },
      auth: {
        password: process.env.REDIS_PASSWORD!,
        username: process.env.REDIS_USERNAME || 'default'
      },
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'austa:auth:',
      db: parseInt(process.env.REDIS_DB || '0', 10)
    }
  };
}

/**
 * Exported authentication configuration instance
 * @const {AuthConfiguration}
 */
export const AUTH_CONFIG: AuthConfiguration = loadConfig();

export default AUTH_CONFIG;