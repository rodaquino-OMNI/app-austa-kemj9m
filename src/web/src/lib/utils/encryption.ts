/**
 * @fileoverview Client-side cryptographic utilities for AUSTA SuperApp
 * Implements HIPAA and LGPD compliant encryption standards for PHI/PII protection
 * @version 1.0.0
 */

// External imports
import CryptoJS from 'crypto-js'; // v4.1.1
import { Buffer } from 'buffer'; // v6.0.3

// Interfaces
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  algorithm: string;
  timestamp: number;
}

export interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  ivSize: number;
  tagLength: number;
  iterations: number;
  saltLength: number;
}

export interface SensitiveFieldPattern {
  type: string;
  pattern: RegExp;
  encryptionRequired: boolean;
}

// Default encryption configuration
const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'AES-GCM',
  keySize: 256,
  ivSize: 96,
  tagLength: 128,
  iterations: 100000,
  saltLength: 32
};

// PHI/PII detection patterns
const SENSITIVE_PATTERNS: Map<string, SensitiveFieldPattern> = new Map([
  ['ssn', {
    type: 'SSN',
    pattern: /^\d{3}-?\d{2}-?\d{4}$/,
    encryptionRequired: true
  }],
  ['mrn', {
    type: 'Medical Record Number',
    pattern: /^[A-Z0-9]{6,10}$/,
    encryptionRequired: true
  }],
  ['email', {
    type: 'Email',
    pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    encryptionRequired: true
  }]
]);

/**
 * Encrypts sensitive data using AES-256-GCM with Web Crypto API
 * @param data Data to encrypt
 * @param key CryptoKey for encryption
 * @param config Encryption configuration
 * @returns Promise resolving to encrypted data object
 */
export async function encryptData(
  data: string | ArrayBuffer,
  key: CryptoKey,
  config: EncryptionConfig = DEFAULT_CONFIG
): Promise<EncryptedData> {
  try {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(config.ivSize / 8));
    
    // Convert input data to ArrayBuffer if string
    const dataBuffer = typeof data === 'string' 
      ? new TextEncoder().encode(data)
      : data;

    // Perform encryption
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: config.algorithm,
        iv: iv,
        tagLength: config.tagLength
      },
      key,
      dataBuffer
    );

    // Extract auth tag (last 16 bytes for GCM)
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const authTag = encryptedArray.slice(-16);
    const ciphertext = encryptedArray.slice(0, -16);

    return {
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      authTag: Buffer.from(authTag).toString('base64'),
      keyId: await getKeyIdentifier(key),
      algorithm: config.algorithm,
      timestamp: Date.now()
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts AES-256-GCM encrypted data using Web Crypto API
 * @param encryptedData Encrypted data object
 * @param key CryptoKey for decryption
 * @returns Promise resolving to decrypted data
 */
export async function decryptData(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<ArrayBuffer> {
  try {
    // Reconstruct complete ciphertext with auth tag
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');

    const completeBuffer = new Uint8Array(ciphertext.length + authTag.length);
    completeBuffer.set(new Uint8Array(ciphertext));
    completeBuffer.set(new Uint8Array(authTag), ciphertext.length);

    // Perform decryption
    return await crypto.subtle.decrypt(
      {
        name: encryptedData.algorithm,
        iv: iv,
        tagLength: 128
      },
      key,
      completeBuffer
    );
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generates a cryptographically secure key using Web Crypto API
 * @param config Encryption configuration
 * @returns Promise resolving to generated CryptoKey
 */
export async function generateKey(
  config: EncryptionConfig = DEFAULT_CONFIG
): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: config.algorithm,
      length: config.keySize
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Service class for managing browser-based encryption operations
 */
export class WebEncryptionService {
  private config: EncryptionConfig;
  private currentKey: CryptoKey | null = null;
  private sensitivePatterns: Map<string, SensitiveFieldPattern>;
  private readonly worker: Worker;

  constructor(config: EncryptionConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.sensitivePatterns = SENSITIVE_PATTERNS;
    
    // Initialize Web Worker for CPU-intensive operations
    this.worker = new Worker(
      new URL('./encryption.worker.ts', import.meta.url)
    );

    // Initialize encryption key
    this.initializeKey();
  }

  /**
   * Initializes or imports encryption key
   */
  private async initializeKey(): Promise<void> {
    try {
      this.currentKey = await generateKey(this.config);
    } catch (error) {
      throw new Error(`Key initialization failed: ${error.message}`);
    }
  }

  /**
   * Encrypts field values with automatic PHI/PII detection
   * @param fieldValue Value to potentially encrypt
   * @param fieldType Type of field for pattern matching
   * @returns Promise resolving to processed value
   */
  public async encryptField(
    fieldValue: string,
    fieldType: string
  ): Promise<string> {
    try {
      const pattern = this.sensitivePatterns.get(fieldType);
      
      if (pattern && pattern.encryptionRequired && pattern.pattern.test(fieldValue)) {
        if (!this.currentKey) {
          throw new Error('Encryption key not initialized');
        }

        const encrypted = await encryptData(fieldValue, this.currentKey, this.config);
        return JSON.stringify(encrypted);
      }

      return fieldValue;
    } catch (error) {
      throw new Error(`Field encryption failed: ${error.message}`);
    }
  }

  /**
   * Performs secure key rotation
   */
  public async rotateKey(): Promise<void> {
    try {
      const newKey = await generateKey(this.config);
      this.currentKey = newKey;
    } catch (error) {
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }
}

/**
 * Generates a unique identifier for a CryptoKey
 * @param key CryptoKey to identify
 * @returns Promise resolving to key identifier
 */
async function getKeyIdentifier(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  const hash = await crypto.subtle.digest('SHA-256', exported);
  return Buffer.from(hash).toString('hex').slice(0, 8);
}