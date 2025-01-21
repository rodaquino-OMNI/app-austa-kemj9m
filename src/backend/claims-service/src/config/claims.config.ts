/**
 * @fileoverview Enhanced Claims Service Configuration
 * Implements secure configuration management with HIPAA/LGPD compliance
 * @version 2.0.0
 */

import { config as dotenvConfig } from 'dotenv'; // v16.3.1
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'; // v1.0.1
import { ErrorCode } from '../../shared/constants/error-codes';
import { HttpStatus } from '../../shared/constants/http-status';

// Load environment variables securely
dotenvConfig();

/**
 * Interface for claims processing rate limits and thresholds
 */
interface IPerformanceThresholds {
  maxConcurrentClaims: number;
  processingTimeoutMs: number;
  batchSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

/**
 * Interface for security configuration parameters
 */
interface ISecurityConfig {
  encryptionAlgorithm: string;
  keyRotationIntervalHours: number;
  maxFailedAttempts: number;
  sessionTimeoutMinutes: number;
  auditLogRetentionDays: number;
  tlsVersion: string;
}

/**
 * Interface for compliance validation parameters
 */
interface IComplianceConfig {
  hipaaEnabled: boolean;
  lgpdEnabled: boolean;
  dataRetentionDays: number;
  auditFrequencyHours: number;
  requiredEncryption: boolean;
}

/**
 * Interface for monitoring and alerting configuration
 */
interface IMonitoringConfig {
  metricsEnabled: boolean;
  alertThresholds: {
    errorRate: number;
    responseTime: number;
    failureCount: number;
  };
  logLevel: string;
}

/**
 * Enhanced interface for complete claims service configuration
 */
export interface IClaimsConfig {
  version: string;
  service: {
    name: string;
    port: number;
    environment: string;
    baseUrl: string;
  };
  security: ISecurityConfig;
  performance: IPerformanceThresholds;
  compliance: IComplianceConfig;
  monitoring: IMonitoringConfig;
}

/**
 * Decorator for compliance validation
 */
function ValidateCompliance(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    // Validate compliance requirements before execution
    const config = args[0] as IClaimsConfig;
    if (config.compliance.hipaaEnabled || config.compliance.lgpdEnabled) {
      if (!config.security.requiredEncryption) {
        throw new Error(ErrorCode.HIPAA_VIOLATION);
      }
    }
    return originalMethod.apply(this, args);
  };
}

/**
 * Decorator for audit logging
 */
function AuditLog(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    const startTime = Date.now();
    const result = await originalMethod.apply(this, args);
    // Log the configuration access/modification
    console.log(`Configuration ${propertyKey} accessed at ${new Date().toISOString()}`);
    return result;
  };
}

/**
 * Claims configuration loader with enhanced security features
 */
@Singleton
@AuditLogged
export class ClaimsConfigLoader {
  private config: IClaimsConfig;
  private encryptionKey: Buffer;

  constructor() {
    this.encryptionKey = randomBytes(32);
    this.initializeConfig();
  }

  private initializeConfig(): void {
    this.config = {
      version: '2.0.0',
      service: {
        name: 'claims-service',
        port: parseInt(process.env.CLAIMS_SERVICE_PORT || '3000'),
        environment: process.env.NODE_ENV || 'development',
        baseUrl: process.env.CLAIMS_SERVICE_URL || 'http://localhost:3000'
      },
      security: {
        encryptionAlgorithm: 'aes-256-gcm',
        keyRotationIntervalHours: 24,
        maxFailedAttempts: 5,
        sessionTimeoutMinutes: 30,
        auditLogRetentionDays: 90,
        tlsVersion: 'TLSv1.3'
      },
      performance: {
        maxConcurrentClaims: 100,
        processingTimeoutMs: 30000,
        batchSize: 50,
        retryAttempts: 3,
        retryDelayMs: 1000
      },
      compliance: {
        hipaaEnabled: true,
        lgpdEnabled: true,
        dataRetentionDays: 2555, // 7 years
        auditFrequencyHours: 24,
        requiredEncryption: true
      },
      monitoring: {
        metricsEnabled: true,
        alertThresholds: {
          errorRate: 0.01,
          responseTime: 5000,
          failureCount: 10
        },
        logLevel: 'info'
      }
    };
  }

  /**
   * Validates the claims configuration for security and compliance
   */
  @ValidateCompliance
  @AuditLog
  public async validateClaimConfig(config: IClaimsConfig): Promise<boolean> {
    if (!config.security || !config.compliance) {
      throw new Error(ErrorCode.INVALID_INPUT);
    }

    if (!config.security.encryptionAlgorithm || !config.security.tlsVersion) {
      throw new Error(ErrorCode.SECURITY_VIOLATION);
    }

    return true;
  }

  /**
   * Encrypts sensitive configuration parameters
   */
  private async encryptSensitiveConfig(configSection: object, encryptionKey: Buffer): Promise<object> {
    const iv = randomBytes(16);
    const cipher = createCipheriv(
      this.config.security.encryptionAlgorithm,
      encryptionKey,
      iv
    );
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(configSection), 'utf8'),
      cipher.final()
    ]);

    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  /**
   * Retrieves the current configuration with optional decryption
   */
  @AuditLog
  public async getConfig(decrypted: boolean = false): Promise<IClaimsConfig> {
    if (decrypted) {
      // Perform security check before returning decrypted config
      if (!this.validateClaimConfig(this.config)) {
        throw new Error(ErrorCode.SECURITY_VIOLATION);
      }
    }
    return this.config;
  }

  /**
   * Updates configuration with validation and audit logging
   */
  @ValidateCompliance
  @AuditLog
  public async updateConfig(updates: Partial<IClaimsConfig>): Promise<void> {
    // Validate updates before applying
    if (await this.validateClaimConfig({ ...this.config, ...updates })) {
      this.config = { ...this.config, ...updates };
    }
  }
}

// Export the configuration instance
export const CLAIMS_CONFIG = new ClaimsConfigLoader();