/**
 * @fileoverview Integration tests for HIPAA-compliant authentication service
 * Validates secure authentication flows, token management, and compliance
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import RedisMock from 'redis-mock';
import { Auth0Mock } from '@auth0/auth0-mock';
import AuthService from '../../src/services/auth.service';
import { UserRole, UserStatus } from '../../../shared/interfaces/user.interface';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { HttpStatus } from '../../../shared/constants/http-status';

// Mock implementations
let mongoServer: MongoMemoryServer;
let redisCluster: any;
let auth0Client: any;
let securityMetrics: any;
let authService: AuthService;

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'SecureP@ssw0rd123!',
  role: UserRole.PATIENT,
  status: UserStatus.ACTIVE,
  profile: {
    firstName: 'Test',
    lastName: 'User',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'F',
    phoneNumber: '+1234567890',
    address: {
      street: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postalCode: '12345',
      country: 'Test Country'
    },
    emergencyContact: {
      name: 'Emergency Contact',
      relationship: 'Spouse',
      phoneNumber: '+0987654321'
    },
    preferredLanguage: 'en'
  }
};

beforeAll(async () => {
  // Setup MongoDB memory server
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'auth-test',
      auth: true
    }
  });

  // Setup Redis mock
  redisCluster = RedisMock.createClient();

  // Setup Auth0 mock
  auth0Client = new Auth0Mock({
    domain: 'test.auth0.com',
    clientId: 'test-client-id'
  });

  // Setup security metrics mock
  securityMetrics = {
    trackEvent: jest.fn().mockResolvedValue(undefined)
  };

  // Initialize auth service with mocks
  authService = new AuthService(
    require('mongoose').model('User'),
    redisCluster,
    auth0Client,
    securityMetrics
  );
});

afterAll(async () => {
  await mongoServer.stop();
  await redisCluster.quit();
  jest.clearAllMocks();
});

describe('Enhanced Security Authentication', () => {
  test('Should enforce MFA for sensitive operations', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    const response = await authService.login(credentials);

    expect(response).toHaveProperty('token');
    expect(response).toHaveProperty('fingerprint');
    expect(response).toHaveProperty('user');
    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'SUCCESSFUL_LOGIN'
      })
    );
  });

  test('Should handle failed login attempts with rate limiting', async () => {
    const invalidCredentials = {
      email: testUser.email,
      password: 'wrong-password',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    for (let i = 0; i < 6; i++) {
      try {
        await authService.login(invalidCredentials);
      } catch (error) {
        if (i >= 4) {
          expect(error.message).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        } else {
          expect(error.message).toBe(ErrorCode.INVALID_CREDENTIALS);
        }
      }
    }

    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'FAILED_LOGIN'
      })
    );
  });

  test('Should validate device fingerprint', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'unknown-device-id',
      ipAddress: '127.0.0.1'
    };

    const response = await authService.login(credentials);
    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'UNKNOWN_DEVICE_LOGIN'
      })
    );
  });

  test('Should handle token refresh with security validation', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    const loginResponse = await authService.login(credentials);
    const refreshResponse = await authService.refreshToken(loginResponse.token);

    expect(refreshResponse).toHaveProperty('token');
    expect(refreshResponse).toHaveProperty('fingerprint');
    expect(refreshResponse.token).not.toBe(loginResponse.token);
  });
});

describe('HIPAA Compliance', () => {
  test('Should enforce secure session management', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    const response = await authService.login(credentials);
    expect(response.token).toBeTruthy();

    // Verify session in Redis
    const session = await redisCluster.get(`session:${response.user.id}`);
    expect(session).toBeTruthy();
  });

  test('Should handle secure logout with session invalidation', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    const loginResponse = await authService.login(credentials);
    await authService.logout(loginResponse.token);

    // Verify session removal
    const session = await redisCluster.get(`session:${loginResponse.user.id}`);
    expect(session).toBeNull();

    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'USER_LOGOUT'
      })
    );
  });

  test('Should track security metrics for audit compliance', async () => {
    const credentials = {
      email: testUser.email,
      password: testUser.password,
      mfaCode: '123456',
      deviceFingerprint: 'test-device-id',
      ipAddress: '127.0.0.1'
    };

    await authService.login(credentials);

    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.any(String),
        event: expect.any(String),
        timestamp: expect.any(Date),
        metadata: expect.objectContaining({
          service: 'auth-service',
          environment: expect.any(String)
        })
      })
    );
  });

  test('Should enforce password policy during registration', async () => {
    const weakPasswordUser = {
      ...testUser,
      password: 'weak'
    };

    try {
      await authService.register(weakPasswordUser);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  test('Should handle secure user registration with HIPAA compliance', async () => {
    const registrationResponse = await authService.register(testUser);

    expect(registrationResponse).toHaveProperty('token');
    expect(registrationResponse).toHaveProperty('fingerprint');
    expect(registrationResponse).toHaveProperty('user');
    expect(registrationResponse.user.securitySettings.mfaEnabled).toBe(true);
    expect(registrationResponse.user.securitySettings.passwordResetRequired).toBe(true);

    expect(securityMetrics.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'USER_REGISTERED'
      })
    );
  });
});