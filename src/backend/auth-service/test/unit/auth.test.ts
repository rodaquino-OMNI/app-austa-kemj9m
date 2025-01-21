/**
 * @fileoverview Comprehensive unit test suite for authentication service
 * Validates HIPAA compliance, security measures, and authentication flows
 * @version 1.0.0
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { createClient } from 'redis-mock'; // v0.56.3
import { Auth0Client } from '@auth0/auth0-spa-js'; // v2.1.0
import { createLogger } from 'winston'; // v3.8.0
import { Model } from 'mongoose';

import AuthService from '../../src/services/auth.service';
import { UserRole, UserStatus } from '../../../shared/interfaces/user.interface';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { AUTH_CONFIG } from '../../src/config/auth.config';

// Mock implementations
const mockRedisClient = createClient();
const mockAuth0Client = new Auth0Client({
  domain: 'test.auth0.com',
  client_id: 'test-client-id'
});

const mockUserModel = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn()
} as unknown as Model<any>;

const mockSecurityMetrics = {
  trackEvent: jest.fn()
};

const mockLogger = createLogger({
  transports: []
});

describe('AuthService Security Tests', () => {
  let authService: AuthService;
  const validCredentials = {
    email: 'test@example.com',
    password: 'SecureP@ssw0rd123!',
    mfaCode: '123456',
    deviceFingerprint: 'device123',
    ipAddress: '192.168.1.1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService(
      mockUserModel,
      mockRedisClient,
      mockAuth0Client,
      mockSecurityMetrics
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Login Security', () => {
    it('should enforce MFA when enabled', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: true,
          loginAttempts: 0
        },
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      await expect(authService.login({
        ...validCredentials,
        mfaCode: undefined
      })).rejects.toThrow(ErrorCode.UNAUTHORIZED);

      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'FAILED_LOGIN',
          userId: 'unknown'
        })
      );
    });

    it('should validate device fingerprint', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: 0
        },
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      const result = await authService.login(validCredentials);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('fingerprint');
      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'SUCCESSFUL_LOGIN',
          userId: 'user123'
        })
      );
    });

    it('should enforce rate limiting', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: AUTH_CONFIG.security.maxLoginAttempts
        },
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      await expect(authService.login(validCredentials))
        .rejects.toThrow(ErrorCode.RATE_LIMIT_EXCEEDED);
    });
  });

  describe('Token Management', () => {
    it('should generate secure tokens with fingerprints', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        role: UserRole.PATIENT,
        permissions: ['read:profile'],
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: 0
        },
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      const result = await authService.login(validCredentials);

      expect(result.token).toBeDefined();
      expect(result.fingerprint).toBeDefined();
      expect(result.fingerprint.length).toBeGreaterThan(32);
    });

    it('should validate token fingerprints on refresh', async () => {
      const mockUser = {
        id: 'user123',
        status: UserStatus.ACTIVE
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      const { token } = await authService.login(validCredentials);
      const refreshResult = await authService.refreshToken(token);

      expect(refreshResult.token).toBeDefined();
      expect(refreshResult.fingerprint).toBeDefined();
      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'TOKEN_REFRESHED'
        })
      );
    });
  });

  describe('Session Management', () => {
    it('should securely handle logout', async () => {
      const mockUser = {
        id: 'user123',
        status: UserStatus.ACTIVE
      };

      const { token } = await authService.login(validCredentials);
      await authService.logout(token);

      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'USER_LOGOUT'
        })
      );
    });

    it('should track failed login attempts', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: 0
        },
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      await expect(authService.login(validCredentials))
        .rejects.toThrow(ErrorCode.INVALID_CREDENTIALS);

      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'FAILED_LOGIN'
        })
      );
    });
  });

  describe('HIPAA Compliance', () => {
    it('should maintain comprehensive audit logs', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: 0
        },
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      await authService.login(validCredentials);

      expect(mockSecurityMetrics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          metadata: expect.objectContaining({
            service: 'auth-service',
            environment: expect.any(String)
          })
        })
      );
    });

    it('should enforce secure session timeouts', async () => {
      const mockUser = {
        id: 'user123',
        email: validCredentials.email,
        status: UserStatus.ACTIVE,
        securitySettings: {
          mfaEnabled: false,
          loginAttempts: 0,
          lastLoginAt: new Date(Date.now() - AUTH_CONFIG.security.hipaa.inactivityTimeout * 1000)
        },
        comparePassword: jest.fn().mockResolvedValue(true)
      };

      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser)
        })
      });

      const { token } = await authService.login(validCredentials);
      await expect(authService.refreshToken(token))
        .rejects.toThrow(ErrorCode.SESSION_EXPIRED);
    });
  });
});