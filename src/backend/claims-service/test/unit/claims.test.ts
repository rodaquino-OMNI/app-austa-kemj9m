/**
 * @fileoverview Comprehensive unit tests for claims service with HIPAA compliance
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import { MongoMemoryServer } from 'mongodb-memory-server'; // v8.12.0
import { createLogger } from 'winston'; // v3.8.0
import now from 'performance-now'; // v2.1.0

import { ClaimsService } from '../../src/services/claims.service';
import { IClaim, ClaimType, ClaimStatus } from '../../src/models/claim.model';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { HttpStatus } from '../../../shared/constants/http-status';

// Mock implementations
class MockSecurityContext {
  validateAccess = jest.fn().mockResolvedValue(true);
  encryptData = jest.fn().mockImplementation((data) => `enc:${JSON.stringify(data)}`);
  decryptData = jest.fn().mockImplementation((data) => JSON.parse(data.slice(4)));
}

class MockEncryptionService {
  encryptClaimData = jest.fn().mockImplementation((data) => ({ ...data, encrypted: true }));
  decryptClaimData = jest.fn().mockImplementation((data) => ({ ...data, encrypted: false }));
}

class MockAuditLogger {
  logEvent = jest.fn().mockResolvedValue(true);
}

// Test data
const testClaimData: IClaim = {
  id: '12345',
  patientId: 'patient123',
  providerId: 'provider456',
  type: ClaimType.MEDICAL,
  status: ClaimStatus.SUBMITTED,
  amount: 1500.00,
  serviceDate: new Date('2023-12-01'),
  submissionDate: new Date(),
  healthRecordId: 'health789',
  documents: [{
    id: 'doc123',
    type: 'PRESCRIPTION',
    title: 'Medical Prescription',
    url: 'https://docs.example.com/doc123',
    uploadedAt: new Date(),
    uploadedBy: 'provider456',
    encryptionKey: 'key123',
    checksum: 'abc123',
    auditTrail: []
  }],
  metadata: {
    version: 1,
    createdAt: new Date(),
    createdBy: 'provider456',
    updatedAt: new Date(),
    updatedBy: 'provider456',
    processingTime: 0,
    priority: 1,
    source: 'PROVIDER_PORTAL',
    complianceFlags: ['HIPAA_COMPLIANT']
  },
  auditTrail: [],
  securityMetadata: {
    encryptionVersion: 'AES-256-GCM',
    accessHistory: [],
    lastAccessedBy: '',
    lastAccessedAt: new Date(),
    authorizedRoles: ['PROVIDER', 'ADMIN']
  },
  policyNumber: 'POL123456789',
  diagnosis: ['A10.1'],
  procedureCodes: ['12345'],
  notes: 'Regular checkup'
};

describe('ClaimsService', () => {
  let mongoServer: MongoMemoryServer;
  let claimsService: ClaimsService;
  let securityContext: MockSecurityContext;
  let encryptionService: MockEncryptionService;
  let auditLogger: MockAuditLogger;

  beforeAll(async () => {
    // Initialize test environment with security context
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'claims_test_db',
        auth: true
      }
    });

    securityContext = new MockSecurityContext();
    encryptionService = new MockEncryptionService();
    auditLogger = new MockAuditLogger();

    const logger = createLogger({
      level: 'info',
      transports: []
    });

    claimsService = new ClaimsService(
      null, // Model will be initialized in actual implementation
      logger,
      null, // Config will be initialized in actual implementation
      encryptionService as any,
      auditLogger as any,
      null // Cache manager will be initialized in actual implementation
    );
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  describe('submitClaim', () => {
    it('should encrypt and submit valid claim data', async () => {
      const startTime = now();
      const result = await claimsService.submitClaim(testClaimData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.securityMetadata.encryptionVersion).toBe('AES-256-GCM');
      expect(now() - startTime).toBeLessThan(1000); // Performance check
    });

    it('should validate HIPAA compliance before submission', async () => {
      const nonCompliantClaim = {
        ...testClaimData,
        securityMetadata: {
          ...testClaimData.securityMetadata,
          encryptionVersion: null
        }
      };

      await expect(claimsService.submitClaim(nonCompliantClaim))
        .rejects.toThrow(ErrorCode.HIPAA_VIOLATION);
    });

    it('should enforce data security policies', async () => {
      const unsecuredClaim = {
        ...testClaimData,
        documents: [{
          ...testClaimData.documents[0],
          encryptionKey: null
        }]
      };

      await expect(claimsService.submitClaim(unsecuredClaim))
        .rejects.toThrow(ErrorCode.SECURITY_VIOLATION);
    });

    it('should measure submission performance', async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = now();
        await claimsService.submitClaim({
          ...testClaimData,
          id: `perf-test-${i}`
        });
        times.push(now() - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      expect(avgTime).toBeLessThan(500); // 500ms threshold
    });
  });

  describe('processClaim', () => {
    it('should process claim within performance threshold', (done) => {
      const startTime = now();

      claimsService.processClaim(testClaimData.id).subscribe({
        next: (result) => {
          expect(result.processingMetadata.duration).toBeLessThan(1000);
          expect(now() - startTime).toBeLessThan(1500);
          done();
        },
        error: done
      });
    });

    it('should maintain data encryption during processing', (done) => {
      claimsService.processClaim(testClaimData.id).subscribe({
        next: (result) => {
          expect(result.securityMetadata.encryptionStatus).toBe(true);
          expect(encryptionService.encryptClaimData).toHaveBeenCalled();
          done();
        },
        error: done
      });
    });

    it('should validate processing audit trail', (done) => {
      claimsService.processClaim(testClaimData.id).subscribe({
        next: (result) => {
          expect(result.securityMetadata.auditId).toBeDefined();
          expect(auditLogger.logEvent).toHaveBeenCalled();
          done();
        },
        error: done
      });
    });
  });

  describe('updateClaimStatus', () => {
    it('should validate status transitions securely', async () => {
      const result = await claimsService.updateClaimStatus(
        testClaimData.id,
        ClaimStatus.IN_REVIEW
      );

      expect(result.status).toBe(ClaimStatus.IN_REVIEW);
      expect(result.auditTrail.length).toBeGreaterThan(0);
    });

    it('should prevent invalid status transitions', async () => {
      await expect(
        claimsService.updateClaimStatus(testClaimData.id, ClaimStatus.APPROVED)
      ).rejects.toThrow(ErrorCode.INVALID_OPERATION);
    });
  });

  describe('getClaim', () => {
    it('should enforce access controls', async () => {
      securityContext.validateAccess.mockResolvedValueOnce(false);

      await expect(claimsService.getClaim(testClaimData.id))
        .rejects.toThrow(ErrorCode.UNAUTHORIZED);
    });

    it('should return decrypted claim data for authorized access', async () => {
      const result = await claimsService.getClaim(testClaimData.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(testClaimData.id);
      expect(encryptionService.decryptClaimData).toHaveBeenCalled();
    });
  });

  describe('Security Compliance', () => {
    it('should validate document encryption', async () => {
      const result = await claimsService.submitClaim(testClaimData);
      expect(result.documents[0].encryptionKey).toBeDefined();
      expect(result.documents[0].checksum).toBeDefined();
    });

    it('should verify audit trail generation', async () => {
      const result = await claimsService.submitClaim(testClaimData);
      expect(result.auditTrail.length).toBeGreaterThan(0);
      expect(result.auditTrail[0].action).toBeDefined();
      expect(result.auditTrail[0].timestamp).toBeDefined();
    });

    it('should handle security violations correctly', async () => {
      securityContext.validateAccess.mockRejectedValueOnce(
        new Error(ErrorCode.SECURITY_VIOLATION)
      );

      await expect(claimsService.getClaim(testClaimData.id))
        .rejects.toThrow(ErrorCode.SECURITY_VIOLATION);
    });
  });
});