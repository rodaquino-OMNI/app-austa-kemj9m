/**
 * @fileoverview HIPAA-compliant health records REST API controller
 * Implements FHIR R4 standards with comprehensive security and audit features
 * @version 1.0.0
 */

import { Request, Response } from 'express'; // v4.18.2
import { body, validationResult } from 'express-validator'; // v7.0.0
import { StatusCodes } from 'http-status'; // v1.6.2
import { injectable, inject } from 'inversify';
import { controller, httpPost, httpGet, httpPut, httpDelete } from 'inversify-express-utils';
import { HealthRecordsService } from '../services/records.service';
import { IHealthRecord, HealthRecordType, HealthRecordStatus } from '../../../shared/interfaces/health-record.interface';
import { ErrorCode, ErrorMessage } from '../../../shared/constants/error-codes';
import { validateHealthRecord, sanitizeInput } from '../../../shared/utils/validation.utils';
import { EncryptionService } from '../../../shared/utils/encryption.utils';

@controller('/api/v1/health-records')
@injectable()
export class HealthRecordsController {
    constructor(
        @inject('HealthRecordsService') private healthRecordsService: HealthRecordsService,
        @inject('EncryptionService') private encryptionService: EncryptionService,
        @inject('AuditLogger') private auditLogger: any
    ) {}

    /**
     * Creates a new health record with FHIR R4 compliance and field-level encryption
     */
    @httpPost('/')
    @authenticate()
    @authorize('create:health-records')
    @validate(createRecordValidation)
    @auditLog('create:health-record')
    async createHealthRecord(req: Request, res: Response): Promise<Response> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(StatusCodes.BAD_REQUEST).json({ 
                    errors: errors.array(),
                    code: ErrorCode.INVALID_INPUT
                });
            }

            const sanitizedData = this.sanitizeRecordData(req.body);
            const validationResult = await validateHealthRecord(sanitizedData, {
                strictMode: true,
                validateAttachments: true
            });

            if (!validationResult.isValid) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    errors: validationResult.errors,
                    code: ErrorCode.INVALID_INPUT
                });
            }

            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const record = await this.healthRecordsService.createRecord(
                sanitizedData,
                securityContext
            );

            return res.status(StatusCodes.CREATED).json(record);
        } catch (error) {
            await this.auditLogger.error('Health record creation failed', {
                error: error.message,
                userId: req.user.id,
                ipAddress: req.ip
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Retrieves a health record with security checks and decryption
     */
    @httpGet('/:id')
    @authenticate()
    @authorize('read:health-records')
    @auditLog('read:health-record')
    async getHealthRecord(req: Request, res: Response): Promise<Response> {
        try {
            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const record = await this.healthRecordsService.getRecord(
                req.params.id,
                securityContext
            );

            if (!record) {
                return res.status(StatusCodes.NOT_FOUND).json({
                    message: ErrorMessage[ErrorCode.RESOURCE_NOT_FOUND].message,
                    code: ErrorCode.RESOURCE_NOT_FOUND
                });
            }

            return res.status(StatusCodes.OK).json(record);
        } catch (error) {
            await this.auditLogger.error('Health record retrieval failed', {
                error: error.message,
                recordId: req.params.id,
                userId: req.user.id
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Updates a health record with HIPAA compliance validation
     */
    @httpPut('/:id')
    @authenticate()
    @authorize('update:health-records')
    @validate(updateRecordValidation)
    @auditLog('update:health-record')
    async updateHealthRecord(req: Request, res: Response): Promise<Response> {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    errors: errors.array(),
                    code: ErrorCode.INVALID_INPUT
                });
            }

            const sanitizedData = this.sanitizeRecordData(req.body);
            const validationResult = await validateHealthRecord(sanitizedData, {
                strictMode: true,
                validateAttachments: true
            });

            if (!validationResult.isValid) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    errors: validationResult.errors,
                    code: ErrorCode.INVALID_INPUT
                });
            }

            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const updatedRecord = await this.healthRecordsService.updateRecord(
                req.params.id,
                sanitizedData,
                securityContext
            );

            return res.status(StatusCodes.OK).json(updatedRecord);
        } catch (error) {
            await this.auditLogger.error('Health record update failed', {
                error: error.message,
                recordId: req.params.id,
                userId: req.user.id
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Deletes a health record with audit logging
     */
    @httpDelete('/:id')
    @authenticate()
    @authorize('delete:health-records')
    @auditLog('delete:health-record')
    async deleteHealthRecord(req: Request, res: Response): Promise<Response> {
        try {
            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            await this.healthRecordsService.deleteRecord(
                req.params.id,
                securityContext
            );

            return res.status(StatusCodes.NO_CONTENT).send();
        } catch (error) {
            await this.auditLogger.error('Health record deletion failed', {
                error: error.message,
                recordId: req.params.id,
                userId: req.user.id
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Imports HL7 data and converts to FHIR R4
     */
    @httpPost('/import/hl7')
    @authenticate()
    @authorize('import:health-records')
    @validate(importHL7Validation)
    @auditLog('import:hl7')
    async importHL7Record(req: Request, res: Response): Promise<Response> {
        try {
            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const importedRecord = await this.healthRecordsService.importHL7(
                req.body.hl7Data,
                securityContext
            );

            return res.status(StatusCodes.CREATED).json(importedRecord);
        } catch (error) {
            await this.auditLogger.error('HL7 import failed', {
                error: error.message,
                userId: req.user.id
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Exports health record in FHIR R4 format
     */
    @httpGet('/:id/fhir')
    @authenticate()
    @authorize('export:health-records')
    @auditLog('export:fhir')
    async exportFHIRRecord(req: Request, res: Response): Promise<Response> {
        try {
            const securityContext = {
                userId: req.user.id,
                role: req.user.role,
                permissions: req.user.permissions,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            };

            const fhirData = await this.healthRecordsService.exportFHIR(
                req.params.id,
                securityContext
            );

            return res.status(StatusCodes.OK).json(fhirData);
        } catch (error) {
            await this.auditLogger.error('FHIR export failed', {
                error: error.message,
                recordId: req.params.id,
                userId: req.user.id
            });

            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                message: ErrorMessage[ErrorCode.INTERNAL_SERVER_ERROR].message,
                code: ErrorCode.INTERNAL_SERVER_ERROR
            });
        }
    }

    private sanitizeRecordData(data: any): IHealthRecord {
        return {
            ...data,
            content: typeof data.content === 'string'
                ? JSON.parse(sanitizeInput(data.content))
                : data.content,
            metadata: {
                ...data.metadata,
                facility: sanitizeInput(data.metadata?.facility),
                department: sanitizeInput(data.metadata?.department)
            }
        };
    }
}

// Validation schemas
const createRecordValidation = [
    body('patientId').isString().notEmpty(),
    body('type').isIn(Object.values(HealthRecordType)),
    body('content').notEmpty(),
    body('securityLabels').isArray().notEmpty(),
    body('metadata').notEmpty()
];

const updateRecordValidation = [
    body('type').optional().isIn(Object.values(HealthRecordType)),
    body('content').optional().notEmpty(),
    body('securityLabels').optional().isArray(),
    body('metadata').optional()
];

const importHL7Validation = [
    body('hl7Data').isString().notEmpty()
];