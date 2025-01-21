/**
 * @fileoverview Integration tests for AUSTA SuperApp API Gateway
 * Validates security, rate limiting, CORS, routing, monitoring and HIPAA compliance
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import supertest from 'supertest';
import nock from 'nock';
import RedisMock from 'ioredis-mock';
import app from '../../src/index';
import { kongConfig } from '../../src/config/kong.config';
import { HttpStatus } from '../../../shared/constants/http-status';
import { ErrorCode } from '../../../shared/constants/error-codes';

// Test constants
const TEST_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const TEST_USER_ID = '123456';
const TEST_PREMIUM_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...premium';
const MOCK_REDIS = new RedisMock();

// Mock services
const mockAuthService = nock('http://auth-service:3000');
const mockHealthRecordsService = nock('http://health-records-service:3000');

describe('API Gateway Integration Tests', () => {
  beforeAll(async () => {
    // Setup mock Redis for rate limiting
    jest.mock('ioredis', () => RedisMock);
    
    // Configure mock services
    mockAuthService
      .persist()
      .post('/validate')
      .reply(200, { valid: true, userId: TEST_USER_ID });

    mockHealthRecordsService
      .persist()
      .get('/health-check')
      .reply(200, { status: 'healthy' });
  });

  afterAll(async () => {
    nock.cleanAll();
    await MOCK_REDIS.quit();
  });

  describe('Security Tests', () => {
    test('should enforce JWT validation', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(response.status).toBe(HttpStatus.OK);
    });

    test('should reject invalid JWT tokens', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body.error).toBe(ErrorCode.UNAUTHORIZED);
    });

    test('should enforce HIPAA-compliant headers', async () => {
      const response = await supertest(app)
        .post('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .set('X-HIPAA-Audit-ID', '12345')
        .send({ data: 'encrypted-health-data' });

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should enforce CORS policies', async () => {
      const response = await supertest(app)
        .options('/api/v1/health-records')
        .set('Origin', 'https://admin.austa-health.com');

      expect(response.status).toBe(HttpStatus.NO_CONTENT);
      expect(response.headers['access-control-allow-origin']).toBe('https://admin.austa-health.com');
    });

    test('should reject unauthorized CORS origins', async () => {
      const response = await supertest(app)
        .options('/api/v1/health-records')
        .set('Origin', 'https://malicious-site.com');

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should enforce standard user rate limits', async () => {
      const requests = Array(kongConfig.plugins.rate_limiting.config.minute.patient + 1)
        .fill(null)
        .map(() => 
          supertest(app)
            .get('/api/v1/health-records')
            .set('Authorization', `Bearer ${TEST_JWT}`)
        );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(lastResponse.headers['retry-after']).toBeDefined();
    });

    test('should enforce premium user rate limits', async () => {
      const requests = Array(kongConfig.plugins.rate_limiting.config.minute.provider + 1)
        .fill(null)
        .map(() => 
          supertest(app)
            .get('/api/v1/health-records')
            .set('Authorization', `Bearer ${TEST_PREMIUM_JWT}`)
        );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    test('should include rate limit headers', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    test('should maintain sub-500ms response times', async () => {
      const startTime = Date.now();
      
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(HttpStatus.OK);
      expect(duration).toBeLessThan(500);
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => 
          supertest(app)
            .get('/api/v1/health-records')
            .set('Authorization', `Bearer ${TEST_JWT}`)
        );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successfulResponses = responses.filter(r => r.status === HttpStatus.OK);
      expect(successfulResponses.length).toBe(concurrentRequests);
      expect(duration / concurrentRequests).toBeLessThan(500);
    });

    test('should validate circuit breaker functionality', async () => {
      // Simulate service failure
      mockHealthRecordsService
        .get('/health-records')
        .times(5)
        .reply(HttpStatus.SERVICE_UNAVAILABLE);

      const requests = Array(6)
        .fill(null)
        .map(() => 
          supertest(app)
            .get('/api/v1/health-records')
            .set('Authorization', `Bearer ${TEST_JWT}`)
        );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(lastResponse.body.error).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    });
  });

  describe('Monitoring Tests', () => {
    test('should expose metrics endpoint', async () => {
      const response = await supertest(app)
        .get('/metrics')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.type).toBe('text/plain');
      expect(response.text).toContain('http_request_duration_seconds');
    });

    test('should track request durations', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(response.headers['x-response-time']).toBeDefined();
    });

    test('should include correlation IDs', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('HIPAA Compliance Tests', () => {
    test('should enforce encryption for sensitive data', async () => {
      const response = await supertest(app)
        .post('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .send({ data: 'unencrypted-data' });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error).toBe(ErrorCode.HIPAA_VIOLATION);
    });

    test('should validate audit logging', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .set('X-HIPAA-Audit-ID', '12345');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.headers['x-hipaa-audit-id']).toBeDefined();
    });

    test('should enforce TLS requirements', async () => {
      const response = await supertest(app)
        .get('/api/v1/health-records')
        .set('Authorization', `Bearer ${TEST_JWT}`)
        .set('X-Forwarded-Proto', 'http');

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error).toBe(ErrorCode.HIPAA_VIOLATION);
    });
  });
});