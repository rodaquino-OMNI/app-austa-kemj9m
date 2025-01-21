/**
 * @fileoverview Enhanced health records service implementation with HIPAA compliance
 * Provides FHIR R4 compliant CRUD operations with comprehensive security features
 * @version 1.0.0
 */

import { injectable, inject } from 'inversify';
import { 
  IHealthRecord, 
  HealthRecordType, 
  HealthRecordStatus,
  IHealthRecordValidationError,
  FHIRResource
} from '../../../shared/interfaces/health-record.interface';
import HealthRecord from '../models/health-record.model';
import { EncryptionService } from '../../../shared/utils/encryption.utils';
import { validateHealthRecord, sanitizeInput } from '../../../shared/utils/validation.utils';
import { ErrorCode, ErrorMessage } from '../../../shared/constants/error-codes';
import * as mongoose from 'mongoose'; // v7.0.0
import * as fhir from 'fhir'; // v4.11.2
import { AuditLogger } from 'audit-logging'; // v2.1.0
import { Cache } from 'node-cache'; // v5.1.2

interface ISecurityContext {
  userId: string;
  role: string;
  permissions: string[];
  ipAddress: string;
  userAgent: string;
}

@injectable()
export class HealthRecordsService {
  private readonly healthRecordModel: typeof HealthRecord;
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @inject('EncryptionService') private encryptionService: EncryptionService,
    @inject('AuditLogger') private auditLogger: AuditLogger,
    @inject('Cache') private recordCache: Cache
  ) {
    this.healthRecordModel = HealthRecord;
    this.initializeService().catch(error => {
      throw new Error(`Service initialization failed: ${error.message}`);
    });
  }

  private async initializeService(): Promise<void> {
    // Ensure indexes for performance
    await this.healthRecordModel.ensureIndexes();
    
    // Initialize encryption for sensitive fields
    await this.encryptionService.initializeFieldEncryption([
      { field: 'content', algorithm: 'AES-256-GCM' },
      { field: 'metadata', algorithm: 'AES-256-GCM' }
    ]);
  }

  /**
   * Creates a new health record with enhanced security and FHIR compliance
   * @param recordData Health record data
   * @param securityContext Security context for access control
   */
  public async createRecord(
    recordData: IHealthRecord,
    securityContext: ISecurityContext
  ): Promise<IHealthRecord> {
    try {
      // Validate security context
      this.validateSecurityContext(securityContext);

      // Sanitize input data
      const sanitizedData = this.sanitizeRecordData(recordData);

      // Validate record data
      const validationResult = await validateHealthRecord(sanitizedData, {
        strictMode: true,
        validateAttachments: true
      });

      if (!validationResult.isValid) {
        throw new Error(
          `Validation failed: ${validationResult.errors[0].message}`
        );
      }

      // Encrypt sensitive data if required
      if (this.requiresEncryption(sanitizedData)) {
        sanitizedData.content = await this.encryptionService.encryptField(
          JSON.stringify(sanitizedData.content),
          'PHI',
          { isPhiPii: true }
        );
      }

      // Create record with audit trail
      const record = new this.healthRecordModel({
        ...sanitizedData,
        metadata: {
          ...sanitizedData.metadata,
          createdAt: new Date(),
          createdBy: securityContext.userId,
          version: 1
        },
        auditTrail: [{
          eventId: `CREATE_${Date.now()}`,
          recordId: sanitizedData.id,
          timestamp: new Date(),
          actorId: securityContext.userId,
          action: 'CREATE',
          outcome: 'SUCCESS',
          details: {
            resourceType: sanitizedData.type,
            securityLabels: sanitizedData.securityLabels,
            accessType: 'CREATE',
            systemId: process.env.SYSTEM_ID
          }
        }]
      });

      // Save record
      const savedRecord = await record.save();

      // Cache the record
      this.recordCache.set(
        `record_${savedRecord.id}`,
        savedRecord,
        this.CACHE_TTL
      );

      // Log audit event
      await this.auditLogger.log({
        eventType: 'HEALTH_RECORD_CREATE',
        actorId: securityContext.userId,
        resourceId: savedRecord.id,
        action: 'CREATE',
        outcome: 'SUCCESS',
        details: {
          recordType: savedRecord.type,
          ipAddress: securityContext.ipAddress,
          userAgent: securityContext.userAgent
        }
      });

      return savedRecord;
    } catch (error) {
      // Log error and throw
      await this.auditLogger.log({
        eventType: 'HEALTH_RECORD_CREATE',
        actorId: securityContext.userId,
        action: 'CREATE',
        outcome: 'FAILURE',
        details: {
          error: error.message,
          ipAddress: securityContext.ipAddress
        }
      });

      throw new Error(
        `Failed to create health record: ${error.message}`
      );
    }
  }

  /**
   * Retrieves a health record with security checks and decryption
   * @param recordId Record identifier
   * @param securityContext Security context for access control
   */
  public async getRecord(
    recordId: string,
    securityContext: ISecurityContext
  ): Promise<IHealthRecord> {
    try {
      // Check cache first
      const cachedRecord = this.recordCache.get<IHealthRecord>(
        `record_${recordId}`
      );
      if (cachedRecord) {
        await this.validateAccess(cachedRecord, securityContext);
        return cachedRecord;
      }

      // Fetch record from database
      const record = await this.healthRecordModel.findOne({ id: recordId });
      if (!record) {
        throw new Error(ErrorMessage[ErrorCode.RESOURCE_NOT_FOUND].message);
      }

      // Validate access permissions
      await this.validateAccess(record, securityContext);

      // Decrypt sensitive data if encrypted
      if (record.status === HealthRecordStatus.ENCRYPTED) {
        record.content = JSON.parse(
          await this.encryptionService.decryptField(
            record.content as string,
            'PHI'
          )
        );
      }

      // Cache the record
      this.recordCache.set(
        `record_${recordId}`,
        record,
        this.CACHE_TTL
      );

      // Log access
      await this.auditLogger.log({
        eventType: 'HEALTH_RECORD_ACCESS',
        actorId: securityContext.userId,
        resourceId: recordId,
        action: 'READ',
        outcome: 'SUCCESS',
        details: {
          ipAddress: securityContext.ipAddress,
          userAgent: securityContext.userAgent
        }
      });

      return record;
    } catch (error) {
      await this.auditLogger.log({
        eventType: 'HEALTH_RECORD_ACCESS',
        actorId: securityContext.userId,
        resourceId: recordId,
        action: 'READ',
        outcome: 'FAILURE',
        details: {
          error: error.message,
          ipAddress: securityContext.ipAddress
        }
      });

      throw new Error(
        `Failed to retrieve health record: ${error.message}`
      );
    }
  }

  // Private helper methods

  private validateSecurityContext(context: ISecurityContext): void {
    if (!context.userId || !context.role || !context.permissions) {
      throw new Error(ErrorMessage[ErrorCode.UNAUTHORIZED].message);
    }
  }

  private sanitizeRecordData(data: IHealthRecord): IHealthRecord {
    return {
      ...data,
      content: typeof data.content === 'string' 
        ? JSON.parse(sanitizeInput(data.content))
        : data.content,
      metadata: {
        ...data.metadata,
        facility: sanitizeInput(data.metadata.facility),
        department: sanitizeInput(data.metadata.department)
      }
    };
  }

  private requiresEncryption(record: IHealthRecord): boolean {
    return (
      record.type === HealthRecordType.LAB_RESULT ||
      record.securityLabels.includes('SENSITIVE') ||
      record.type === HealthRecordType.PRESCRIPTION
    );
  }

  private async validateAccess(
    record: IHealthRecord,
    context: ISecurityContext
  ): Promise<void> {
    const hasAccess = context.permissions.includes('READ_HEALTH_RECORDS') &&
      (context.role === 'ADMIN' ||
       record.patientId === context.userId ||
       record.providerId === context.userId);

    if (!hasAccess) {
      throw new Error(ErrorMessage[ErrorCode.FORBIDDEN].message);
    }
  }
}