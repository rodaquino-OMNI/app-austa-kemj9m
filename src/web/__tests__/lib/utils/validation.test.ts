import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as yup from 'yup';
import { validateHealthRecord, validateForm, sanitizeInput } from '../../../src/lib/utils/validation';
import { ErrorCode } from '../../../src/lib/constants/errorCodes';
import { 
  IHealthRecord, 
  HealthRecordType, 
  SecurityClassification, 
  EncryptionLevel 
} from '../../../src/lib/types/healthRecord';

describe('validateHealthRecord', () => {
  let validHealthRecord: IHealthRecord;
  let invalidHealthRecord: IHealthRecord;

  beforeEach(() => {
    validHealthRecord = {
      id: '123',
      patientId: 'P123',
      providerId: 'DR123',
      type: HealthRecordType.CONSULTATION,
      date: new Date(),
      content: { notes: 'Test consultation' },
      metadata: {
        version: 1,
        createdAt: new Date(),
        createdBy: 'DR123',
        updatedAt: new Date(),
        updatedBy: 'DR123',
        facility: 'Test Hospital',
        department: 'Cardiology',
        hipaaCompliance: {
          isProtectedHealth: true,
          dataMinimizationApplied: true,
          encryptionVerified: true,
          accessRestrictions: ['ROLE_DOCTOR'],
          lastComplianceCheck: new Date(),
          complianceOfficer: 'CO123'
        },
        auditTrail: []
      },
      attachments: [],
      status: 'FINAL',
      securityClassification: SecurityClassification.CONFIDENTIAL,
      encryptionLevel: EncryptionLevel.ENHANCED
    };

    invalidHealthRecord = { ...validHealthRecord };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('HIPAA Compliance Validation', () => {
    it('should validate compliant health records', async () => {
      const result = await validateHealthRecord(validHealthRecord);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject records without security classification', async () => {
      invalidHealthRecord.securityClassification = '';
      const result = await validateHealthRecord(invalidHealthRecord);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ErrorCode.HIPAA_VIOLATION);
    });

    it('should reject records without encryption level', async () => {
      invalidHealthRecord.encryptionLevel = '';
      const result = await validateHealthRecord(invalidHealthRecord);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ErrorCode.HIPAA_VIOLATION);
    });

    it('should validate PHI compliance metadata', async () => {
      invalidHealthRecord.metadata.hipaaCompliance.isProtectedHealth = false;
      const result = await validateHealthRecord(invalidHealthRecord);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ErrorCode.HIPAA_VIOLATION);
    });
  });

  describe('FHIR Schema Compliance', () => {
    it('should validate required fields', async () => {
      const result = await validateHealthRecord(validHealthRecord);
      expect(result.isValid).toBe(true);
    });

    it('should reject records with missing required fields', async () => {
      delete invalidHealthRecord.patientId;
      const result = await validateHealthRecord(invalidHealthRecord);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(ErrorCode.INVALID_INPUT);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Simulate multiple requests
      const results = await Promise.all(
        Array(101).fill(null).map(() => validateHealthRecord(validHealthRecord))
      );
      const lastResult = results[results.length - 1];
      expect(lastResult.isValid).toBe(false);
      expect(lastResult.errors).toContain(ErrorCode.RATE_LIMIT_EXCEEDED);
    });
  });
});

describe('validateForm', () => {
  const formSchema = yup.object().shape({
    name: yup.string().required('Name is required'),
    email: yup.string().email('Invalid email').required('Email is required'),
    age: yup.number().min(0, 'Age must be positive').required('Age is required')
  });

  describe('Accessibility Requirements', () => {
    it('should include ARIA attributes in validation result', async () => {
      const result = await validateForm({ name: '', email: '', age: -1 }, formSchema);
      expect(result.aria).toHaveProperty('aria-invalid', 'true');
      expect(result.aria).toHaveProperty('aria-errormessage');
    });

    it('should provide screen reader friendly error messages', async () => {
      const result = await validateForm({ name: '', email: 'invalid', age: -1 }, formSchema);
      expect(result.errors).toContain('Name is required');
      expect(result.errors).toContain('Invalid email');
      expect(result.errors).toContain('Age must be positive');
    });
  });

  describe('Form Validation Rules', () => {
    it('should validate valid form data', async () => {
      const validData = { name: 'Test User', email: 'test@example.com', age: 30 };
      const result = await validateForm(validData, formSchema);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid form data', async () => {
      const invalidData = { name: '', email: 'invalid', age: -1 };
      const result = await validateForm(invalidData, formSchema);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('sanitizeInput', () => {
  describe('Security Controls', () => {
    it('should prevent XSS attacks', () => {
      const maliciousInput = '<script>alert("XSS")</script>';
      const result = sanitizeInput(maliciousInput);
      expect(result).not.toContain('<script>');
    });

    it('should handle HTML injection attempts', () => {
      const maliciousInput = '<img src="x" onerror="alert(1)">';
      const result = sanitizeInput(maliciousInput);
      expect(result).not.toContain('<img');
    });

    it('should prevent SQL injection attempts', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      const result = sanitizeInput(maliciousInput);
      expect(result).not.toContain(';');
    });
  });

  describe('Data Cleaning', () => {
    it('should trim whitespace', () => {
      const input = '  test input  ';
      const result = sanitizeInput(input, { trimWhitespace: true });
      expect(result).toBe('test input');
    });

    it('should handle custom sanitization rules', () => {
      const input = 'test@123#input';
      const result = sanitizeInput(input, {
        customRules: ['@', '#'],
        trimWhitespace: true
      });
      expect(result).toBe('test123input');
    });

    it('should preserve valid content', () => {
      const validInput = 'Valid user input 123';
      const result = sanitizeInput(validInput);
      expect(result).toBe(validInput);
    });
  });
});