/**
 * @fileoverview HIPAA-compliant REST API controller for claims management
 * Implements secure endpoints with comprehensive audit logging and PHI protection
 * @version 2.0.0
 * @license HIPAA-compliant
 */

import { Controller, Post, Get, Put, Body, Param, Req, UseGuards, UseInterceptors } from '@nestjs/common'; // v9.0.0
import { Request } from 'express'; // v4.18.2
import { validate } from 'class-validator'; // v0.14.0
import { Logger } from 'winston'; // v3.8.0
import { Counter, Histogram } from 'prom-client'; // v14.0.1
import { PHIValidator } from '@hipaa/phi-validator'; // v1.2.0

import { ClaimsService } from '../services/claims.service';
import { IClaim, ClaimStatus } from '../models/claim.model';
import { ErrorCode } from '../../../shared/constants/error-codes';
import { HttpStatus } from '../../../shared/constants/http-status';
import { validateClaim } from '../utils/validation.utils';

/**
 * Enhanced claims controller with HIPAA compliance and security features
 */
@Controller('claims')
@UseGuards(AuthGuard, RBACGuard)
@UseInterceptors(AuditLogInterceptor, PerformanceInterceptor)
@RateLimit({ windowMs: 60000, max: 100 })
export class ClaimsController {
  // Performance metrics
  private readonly claimProcessingDuration: Histogram;
  private readonly claimSubmissionCounter: Counter;
  private readonly claimErrorCounter: Counter;

  constructor(
    private readonly claimsService: ClaimsService,
    private readonly logger: Logger,
    private readonly phiValidator: PHIValidator,
    private readonly metrics: MetricsService
  ) {
    // Initialize performance metrics
    this.claimProcessingDuration = new Histogram({
      name: 'claim_processing_duration_seconds',
      help: 'Duration of claim processing in seconds',
      labelNames: ['type', 'status']
    });

    this.claimSubmissionCounter = new Counter({
      name: 'claim_submissions_total',
      help: 'Total number of claim submissions',
      labelNames: ['type']
    });

    this.claimErrorCounter = new Counter({
      name: 'claim_errors_total',
      help: 'Total number of claim processing errors',
      labelNames: ['type', 'error_code']
    });
  }

  /**
   * Submits a new insurance claim with enhanced security and PHI protection
   */
  @Post()
  @UseGuards(ClaimSubmissionGuard)
  @ValidateRequest()
  @AuditLog('CLAIM_SUBMISSION')
  @MonitorPerformance()
  async submitClaim(
    @Req() req: Request,
    @Body() claimData: IClaim
  ): Promise<IClaim> {
    const timer = this.claimProcessingDuration.startTimer();

    try {
      // Validate user permissions
      if (!req.user?.permissions?.includes('SUBMIT_CLAIM')) {
        throw new Error(ErrorCode.FORBIDDEN);
      }

      // Validate and sanitize claim data
      const validationResult = await validateClaim(claimData, {
        validateDocuments: true,
        validateHealthRecords: true,
        strictMode: true,
        enforceHIPAA: true,
        securityOptions: {
          validateSignatures: true,
          checkEncryption: true,
          verifyIntegrity: true
        }
      });

      if (!validationResult.isValid) {
        this.claimErrorCounter.inc({ type: claimData.type, error_code: 'VALIDATION_ERROR' });
        throw new Error(ErrorCode.INVALID_INPUT);
      }

      // Detect and protect PHI/PII
      const sanitizedClaim = await this.phiValidator.sanitize(claimData, {
        maskPHI: true,
        encryptSensitiveData: true
      });

      // Submit claim through service
      const submittedClaim = await this.claimsService.submitClaim(sanitizedClaim);

      // Record metrics
      this.claimSubmissionCounter.inc({ type: submittedClaim.type });
      timer({ type: submittedClaim.type, status: 'success' });

      return submittedClaim;
    } catch (error) {
      this.claimErrorCounter.inc({ 
        type: claimData?.type || 'unknown', 
        error_code: error.code || 'UNKNOWN_ERROR' 
      });
      timer({ type: claimData?.type || 'unknown', status: 'error' });

      this.logger.error('Claim submission failed', {
        error: error.message,
        claimType: claimData?.type,
        userId: req.user?.id
      });

      throw error;
    }
  }

  /**
   * Retrieves claim details with security checks and audit logging
   */
  @Get(':id')
  @UseGuards(ClaimAccessGuard)
  @AuditLog('CLAIM_ACCESS')
  @MonitorPerformance()
  async getClaim(
    @Req() req: Request,
    @Param('id') claimId: string
  ): Promise<IClaim> {
    try {
      // Validate access permissions
      if (!req.user?.permissions?.includes('VIEW_CLAIM')) {
        throw new Error(ErrorCode.FORBIDDEN);
      }

      const claim = await this.claimsService.getClaim(claimId);

      // Mask sensitive data based on user role
      const maskedClaim = await this.phiValidator.maskSensitiveData(claim, {
        userRole: req.user.role,
        accessLevel: req.user.accessLevel
      });

      return maskedClaim;
    } catch (error) {
      this.logger.error('Claim retrieval failed', {
        error: error.message,
        claimId,
        userId: req.user?.id
      });
      throw error;
    }
  }

  /**
   * Updates claim status with security validation and audit logging
   */
  @Put(':id/status')
  @UseGuards(ClaimUpdateGuard)
  @ValidateRequest()
  @AuditLog('CLAIM_STATUS_UPDATE')
  @MonitorPerformance()
  async updateClaimStatus(
    @Req() req: Request,
    @Param('id') claimId: string,
    @Body('status') status: ClaimStatus
  ): Promise<IClaim> {
    try {
      // Validate update permissions
      if (!req.user?.permissions?.includes('UPDATE_CLAIM_STATUS')) {
        throw new Error(ErrorCode.FORBIDDEN);
      }

      // Validate status transition
      const claim = await this.claimsService.getClaim(claimId);
      if (!this.isValidStatusTransition(claim.status, status)) {
        throw new Error(ErrorCode.INVALID_OPERATION);
      }

      return await this.claimsService.updateClaimStatus(claimId, status);
    } catch (error) {
      this.logger.error('Claim status update failed', {
        error: error.message,
        claimId,
        status,
        userId: req.user?.id
      });
      throw error;
    }
  }

  /**
   * Validates claim status transitions
   */
  private isValidStatusTransition(currentStatus: ClaimStatus, newStatus: ClaimStatus): boolean {
    const validTransitions = {
      [ClaimStatus.SUBMITTED]: [
        ClaimStatus.IN_REVIEW,
        ClaimStatus.CANCELLED
      ],
      [ClaimStatus.IN_REVIEW]: [
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.PENDING_INFO
      ],
      [ClaimStatus.PENDING_INFO]: [
        ClaimStatus.IN_REVIEW,
        ClaimStatus.CANCELLED
      ]
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }
}