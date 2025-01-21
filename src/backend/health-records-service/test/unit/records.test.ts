/**
 * @fileoverview Comprehensive unit test suite for health records service
 * Tests FHIR R4 compliance, data encryption, access controls, and CRUD operations
 * @version 1.0.0
 */

import { MongoMemoryServer } from 'mongodb-memory-server'; // v8.12.0
import { faker } from '@faker-js/faker'; // v8.0.0
import { HealthRecordsService } from '../../src/services/records.service';
import HealthRecord from '../../src/models/health-record.model';
import { 
  IHealthRecord, 
  HealthRecordType, 
  HealthRecordStatus,
  FHIRResource
} from '../../../shared/interfaces/health-record.interface';
import { ErrorCode } from '../../../shared/constants/error-codes';

describe('HealthRecordsService', () => {
  let mongoServer: MongoMemoryServer;
  let service: HealthRecordsService;
  let mockEncryptionService: jest.Mocked<any>;
  let mockAuditLogger: jest.Mocked<any>;
  let mockCache: jest.Mocked<any>;

  beforeAll(async () => {
    // Initialize MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.ENCRYPTION_KEY = 'test-encryption-key';
    process.env.SYSTEM_ID = 'test-system';

    // Initialize mocks
    mockEncryptionService = {
      encryptField: jest.fn(),
      decryptField: jest.fn(),
      initializeFieldEncryption: jest.fn()
    };

    mockAuditLogger = {
      log: jest.fn()
    };

    mockCache = {
      get: jest.fn(),
      set: jest.fn()
    };
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database and reset mocks
    await HealthRecord.deleteMany({});
    jest.clearAllMocks();

    // Initialize service with mocks
    service = new HealthRecordsService(
      mockEncryptionService,
      mockAuditLogger,
      mockCache
    );
  });

  /**
   * Helper function to generate FHIR-compliant test records
   */
  const generateTestRecord = (overrides: Partial<IHealthRecord> = {}): IHealthRecord => {
    const patientId = faker.string.uuid();
    const providerId = faker.string.uuid();

    const fhirContent: FHIRResource = {
      resourceType: 'Observation',
      id: faker.string.uuid(),
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        security: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
            code: 'R'
          }
        ]
      },
      status: 'final',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8480-6',
          display: 'Systolic blood pressure'
        }]
      },
      subject: {
        reference: `Patient/${patientId}`
      },
      performer: [{
        reference: `Practitioner/${providerId}`
      }],
      valueQuantity: {
        value: 120,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    };

    return {
      id: faker.string.uuid(),
      patientId,
      providerId,
      type: HealthRecordType.LAB_RESULT,
      date: new Date(),
      content: fhirContent,
      metadata: {
        version: 1,
        createdAt: new Date(),
        createdBy: providerId,
        updatedAt: new Date(),
        updatedBy: providerId,
        facility: faker.company.name(),
        department: 'Laboratory',
        accessHistory: [],
        complianceFlags: ['HIPAA_COMPLIANT']
      },
      attachments: [],
      status: HealthRecordStatus.FINAL,
      securityLabels: ['SENSITIVE', 'PHI'],
      ...overrides
    };
  };

  describe('createRecord', () => {
    it('should create a valid health record with encryption', async () => {
      // Arrange
      const testRecord = generateTestRecord();
      const securityContext = {
        userId: testRecord.providerId,
        role: 'PROVIDER',
        permissions: ['CREATE_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      mockEncryptionService.encryptField.mockResolvedValue('encrypted-content');

      // Act
      const result = await service.createRecord(testRecord, securityContext);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(testRecord.id);
      expect(mockEncryptionService.encryptField).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'HEALTH_RECORD_CREATE',
          actorId: securityContext.userId
        })
      );
    });

    it('should reject creation with invalid FHIR data', async () => {
      // Arrange
      const invalidRecord = generateTestRecord({
        content: { invalidField: 'test' } as any
      });
      const securityContext = {
        userId: invalidRecord.providerId,
        role: 'PROVIDER',
        permissions: ['CREATE_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      // Act & Assert
      await expect(
        service.createRecord(invalidRecord, securityContext)
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('getRecord', () => {
    it('should retrieve and decrypt a health record', async () => {
      // Arrange
      const testRecord = generateTestRecord();
      const savedRecord = await new HealthRecord(testRecord).save();
      const securityContext = {
        userId: testRecord.providerId,
        role: 'PROVIDER',
        permissions: ['READ_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      mockEncryptionService.decryptField.mockResolvedValue(
        JSON.stringify(testRecord.content)
      );

      // Act
      const result = await service.getRecord(savedRecord.id, securityContext);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(testRecord.id);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'HEALTH_RECORD_ACCESS',
          actorId: securityContext.userId
        })
      );
    });

    it('should enforce access control restrictions', async () => {
      // Arrange
      const testRecord = generateTestRecord();
      await new HealthRecord(testRecord).save();
      const securityContext = {
        userId: 'unauthorized-user',
        role: 'PROVIDER',
        permissions: ['READ_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      // Act & Assert
      await expect(
        service.getRecord(testRecord.id, securityContext)
      ).rejects.toThrow(ErrorCode.FORBIDDEN);
    });
  });

  describe('updateRecord', () => {
    it('should update record while maintaining encryption', async () => {
      // Arrange
      const testRecord = generateTestRecord();
      const savedRecord = await new HealthRecord(testRecord).save();
      const securityContext = {
        userId: testRecord.providerId,
        role: 'PROVIDER',
        permissions: ['UPDATE_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const updates = {
        content: {
          ...testRecord.content,
          valueQuantity: {
            value: 130,
            unit: 'mmHg',
            system: 'http://unitsofmeasure.org',
            code: 'mm[Hg]'
          }
        }
      };

      mockEncryptionService.encryptField.mockResolvedValue('encrypted-content');

      // Act
      const result = await service.updateRecord(
        savedRecord.id,
        updates,
        securityContext
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.metadata.version).toBe(2);
      expect(mockEncryptionService.encryptField).toHaveBeenCalled();
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'HEALTH_RECORD_UPDATE',
          actorId: securityContext.userId
        })
      );
    });
  });

  describe('deleteRecord', () => {
    it('should perform soft delete with audit trail', async () => {
      // Arrange
      const testRecord = generateTestRecord();
      const savedRecord = await new HealthRecord(testRecord).save();
      const securityContext = {
        userId: testRecord.providerId,
        role: 'PROVIDER',
        permissions: ['DELETE_HEALTH_RECORDS'],
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      // Act
      await service.deleteRecord(savedRecord.id, securityContext);

      // Assert
      const deletedRecord = await HealthRecord.findById(savedRecord.id);
      expect(deletedRecord?.status).toBe(HealthRecordStatus.DELETED);
      expect(mockAuditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'HEALTH_RECORD_DELETE',
          actorId: securityContext.userId
        })
      );
    });
  });
});