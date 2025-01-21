/**
 * @fileoverview Enhanced encryption utilities for AUSTA SuperApp
 * Implements HIPAA and LGPD compliant encryption standards with comprehensive security features
 * @version 1.0.0
 */

import { ErrorCode } from '../constants/error-codes';
import * as crypto from 'crypto'; // v1.0.0
import * as AWS from 'aws-sdk'; // v2.1400.0
import NodeCache from 'node-cache'; // v5.1.2
import * as winston from 'winston'; // v3.8.0

// Interfaces
export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyId: string;
  algorithm: string;
  timestamp: Date;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface KMSConfig {
  region: string;
  keyId: string;
  endpoint: string;
  keyRotationInterval: number;
  cacheTimeout: number;
}

export interface FieldEncryptionConfig {
  fieldType: string;
  encryptionKeyId: string;
  algorithm: string;
  isPhiPii: boolean;
}

// Decorators
function throwsEncryptionError(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    try {
      return await originalMethod.apply(this, args);
    } catch (error) {
      throw new Error(`${ErrorCode.DATA_ENCRYPTION_ERROR}: ${error.message}`);
    }
  };
  return descriptor;
}

function auditLog(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = async function(...args: any[]) {
    const startTime = Date.now();
    const result = await originalMethod.apply(this, args);
    this.logger?.info('Encryption operation completed', {
      operation: propertyKey,
      keyId: args[1],
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
    return result;
  };
  return descriptor;
}

@injectable()
@singleton()
export class EncryptionService {
  private readonly kmsClient: AWS.KMS;
  private readonly keyCache: NodeCache;
  private readonly logger: winston.Logger;
  private readonly fieldConfigs: Map<string, FieldEncryptionConfig>;

  constructor(
    private readonly config: KMSConfig,
    logger: winston.Logger
  ) {
    this.kmsClient = new AWS.KMS({
      region: config.region,
      endpoint: config.endpoint
    });
    this.keyCache = new NodeCache({ stdTTL: config.cacheTimeout });
    this.logger = logger;
    this.fieldConfigs = new Map();
    this.initializeKeyRotation();
  }

  private initializeKeyRotation(): void {
    setInterval(() => {
      this.rotateKeys().catch(error => {
        this.logger.error('Key rotation failed', { error });
      });
    }, this.config.keyRotationInterval);
  }

  @throwsEncryptionError
  @auditLog
  public async encryptField(
    fieldValue: string,
    fieldType: string,
    options: { isPhiPii?: boolean } = {}
  ): Promise<string> {
    const config = this.fieldConfigs.get(fieldType);
    if (!config) {
      throw new Error(`No encryption configuration found for field type: ${fieldType}`);
    }

    const encryptedData = await this.encryptData(
      Buffer.from(fieldValue),
      config.encryptionKeyId,
      { ...config, isPhiPii: options.isPhiPii ?? config.isPhiPii }
    );

    return JSON.stringify(encryptedData);
  }

  private async rotateKeys(): Promise<void> {
    const keyIds = Array.from(this.fieldConfigs.values()).map(config => config.encryptionKeyId);
    for (const keyId of keyIds) {
      try {
        const newKey = await this.kmsClient.createKey({
          Description: `Rotated key for ${keyId}`,
          KeyUsage: 'ENCRYPT_DECRYPT',
          Origin: 'AWS_KMS'
        }).promise();

        await this.updateKeyReferences(keyId, newKey.KeyMetadata.KeyId);
        this.keyCache.del(keyId);
        
        this.logger.info('Key rotation completed', {
          oldKeyId: keyId,
          newKeyId: newKey.KeyMetadata.KeyId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Key rotation failed', { keyId, error });
        throw error;
      }
    }
  }

  private async updateKeyReferences(oldKeyId: string, newKeyId: string): Promise<void> {
    for (const [fieldType, config] of this.fieldConfigs.entries()) {
      if (config.encryptionKeyId === oldKeyId) {
        this.fieldConfigs.set(fieldType, { ...config, encryptionKeyId: newKeyId });
      }
    }
  }
}

@throwsEncryptionError
@auditLog
export async function encryptData(
  data: Buffer | string,
  keyId: string,
  config: FieldEncryptionConfig
): Promise<EncryptedData> {
  const iv = crypto.randomBytes(16);
  const key = await getEncryptionKey(keyId);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)),
    cipher.final()
  ]);

  return {
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
    keyId,
    algorithm: 'aes-256-gcm',
    timestamp: new Date()
  };
}

@throwsEncryptionError
@auditLog
export async function decryptData(
  encryptedData: EncryptedData,
  keyId: string,
  config: FieldEncryptionConfig
): Promise<Buffer> {
  const key = await getEncryptionKey(keyId);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, encryptedData.iv);
  decipher.setAuthTag(encryptedData.authTag);

  return Buffer.concat([
    decipher.update(encryptedData.ciphertext),
    decipher.final()
  ]);
}

async function getEncryptionKey(keyId: string): Promise<Buffer> {
  const kms = new AWS.KMS({ region: process.env.AWS_REGION });
  const { Plaintext } = await kms.generateDataKey({
    KeyId: keyId,
    KeySpec: 'AES_256'
  }).promise();

  return Buffer.from(Plaintext as Buffer);
}