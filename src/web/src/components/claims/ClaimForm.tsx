/**
 * @fileoverview HIPAA-compliant insurance claim form component
 * Implements secure document upload and real-time validation
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import * as yup from 'yup'; // v1.2.0
import CryptoJS from 'crypto-js'; // v4.1.1
import { ErrorTracker } from '../../lib/constants/errorCodes';
import { submitClaim } from '../../lib/api/claims';
import { IClaim, IClaimSubmission, ClaimType } from '../../lib/types/claim';

// HIPAA-compliant validation schema
const claimValidationSchema = yup.object().shape({
  type: yup.string().oneOf(Object.values(ClaimType)).required('Claim type is required'),
  serviceDate: yup.date()
    .max(new Date(), 'Service date cannot be in the future')
    .required('Service date is required'),
  providerId: yup.string()
    .matches(/^[A-Z0-9]{10}$/, 'Invalid provider ID format')
    .required('Provider ID is required'),
  amount: yup.number()
    .positive('Amount must be greater than 0')
    .required('Amount is required'),
  documents: yup.array()
    .of(yup.mixed())
    .min(1, 'At least one supporting document is required'),
  healthRecordId: yup.string()
    .uuid('Invalid health record ID')
    .required('Health record reference is required'),
  hipaaAuthorization: yup.boolean()
    .oneOf([true], 'HIPAA authorization is required'),
  consentAcknowledgment: yup.boolean()
    .oneOf([true], 'Consent acknowledgment is required')
});

// Props interface with security requirements
interface ClaimFormProps {
  onSubmitSuccess: (claim: IClaim) => void;
  onSubmitError: (error: Error) => void;
  initialData?: Partial<IClaimSubmission>;
  encryptionKey: string;
  validationRules?: typeof claimValidationSchema;
}

// Secure file upload configuration
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

/**
 * HIPAA-compliant claim form component with security features
 */
const ClaimForm: React.FC<ClaimFormProps> = ({
  onSubmitSuccess,
  onSubmitError,
  initialData,
  encryptionKey,
  validationRules = claimValidationSchema
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<IClaimSubmission>({
    defaultValues: initialData,
    resolver: yupResolver(validationRules)
  });

  // Secure file upload handler with validation
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(event.target.files || []);

      // Validate file count
      if (files.length + uploadedFiles.length > MAX_FILES) {
        throw new Error(`Maximum ${MAX_FILES} files allowed`);
      }

      // Validate each file
      const validatedFiles = await Promise.all(files.map(async (file) => {
        // Check file type
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
          throw new Error(`File type ${file.type} not allowed`);
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          throw new Error('File size exceeds limit');
        }

        // Generate file checksum
        const reader = new FileReader();
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
          reader.readAsArrayBuffer(file);
        });
        const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
        const checksum = CryptoJS.SHA256(wordArray).toString();

        return { file, checksum };
      }));

      setUploadedFiles((prev) => [...prev, ...validatedFiles.map(({ file }) => file)]);
    } catch (error) {
      ErrorTracker.captureError(error as Error, { context: 'File upload validation' });
      onSubmitError(error as Error);
    }
  }, [uploadedFiles, onSubmitError]);

  // Secure form submission handler
  const onSubmit = async (formData: IClaimSubmission) => {
    try {
      setIsSubmitting(true);

      // Encrypt sensitive data
      const encryptedData = {
        ...formData,
        documents: uploadedFiles,
        encryptedFields: CryptoJS.AES.encrypt(
          JSON.stringify({
            providerId: formData.providerId,
            healthRecordId: formData.healthRecordId
          }),
          encryptionKey
        ).toString()
      };

      const claim = await submitClaim(encryptedData);
      onSubmitSuccess(claim);
      reset();
      setUploadedFiles([]);
    } catch (error) {
      onSubmitError(error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear sensitive data on unmount
  useEffect(() => {
    return () => {
      reset();
      setUploadedFiles([]);
    };
  }, [reset]);

  return (
    <form 
      onSubmit={handleSubmit(onSubmit)}
      className="claim-form"
      aria-label="Insurance Claim Form"
    >
      <div role="group" aria-labelledby="claim-details">
        <h2 id="claim-details">Claim Details</h2>

        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <div className="form-field">
              <label htmlFor="claim-type">Claim Type</label>
              <select
                {...field}
                id="claim-type"
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? "type-error" : undefined}
              >
                {Object.values(ClaimType).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {errors.type && (
                <span id="type-error" className="error" role="alert">
                  {errors.type.message}
                </span>
              )}
            </div>
          )}
        />

        <Controller
          name="serviceDate"
          control={control}
          render={({ field: { value, ...field } }) => (
            <div className="form-field">
              <label htmlFor="service-date">Service Date</label>
              <input
                {...field}
                type="date"
                id="service-date"
                value={value instanceof Date ? value.toISOString().split('T')[0] : ''}
                max={new Date().toISOString().split('T')[0]}
                aria-invalid={!!errors.serviceDate}
                aria-describedby={errors.serviceDate ? "date-error" : undefined}
              />
              {errors.serviceDate && (
                <span id="date-error" className="error" role="alert">
                  {errors.serviceDate.message}
                </span>
              )}
            </div>
          )}
        />

        <Controller
          name="amount"
          control={control}
          render={({ field }) => (
            <div className="form-field">
              <label htmlFor="claim-amount">Amount</label>
              <input
                {...field}
                type="number"
                id="claim-amount"
                min="0"
                step="0.01"
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? "amount-error" : undefined}
              />
              {errors.amount && (
                <span id="amount-error" className="error" role="alert">
                  {errors.amount.message}
                </span>
              )}
            </div>
          )}
        />
      </div>

      <div role="group" aria-labelledby="documents-section">
        <h2 id="documents-section">Supporting Documents</h2>
        <div className="form-field">
          <label htmlFor="file-upload">Upload Documents</label>
          <input
            type="file"
            id="file-upload"
            multiple
            accept={ALLOWED_FILE_TYPES.join(',')}
            onChange={handleFileUpload}
            aria-describedby="file-requirements"
          />
          <p id="file-requirements" className="help-text">
            Accepted formats: PDF, JPEG, PNG. Maximum size: 10MB per file.
          </p>
          {uploadedFiles.length > 0 && (
            <ul aria-label="Uploaded documents">
              {uploadedFiles.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div role="group" aria-labelledby="consent-section">
        <h2 id="consent-section">Consent & Authorization</h2>
        
        <Controller
          name="hipaaAuthorization"
          control={control}
          render={({ field: { value, ...field } }) => (
            <div className="form-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  {...field}
                  checked={value || false}
                  aria-invalid={!!errors.hipaaAuthorization}
                  aria-describedby={errors.hipaaAuthorization ? "hipaa-error" : undefined}
                />
                I authorize the release of medical information under HIPAA guidelines
              </label>
              {errors.hipaaAuthorization && (
                <span id="hipaa-error" className="error" role="alert">
                  {errors.hipaaAuthorization.message}
                </span>
              )}
            </div>
          )}
        />

        <Controller
          name="consentAcknowledgment"
          control={control}
          render={({ field: { value, ...field } }) => (
            <div className="form-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  {...field}
                  checked={value || false}
                  aria-invalid={!!errors.consentAcknowledgment}
                  aria-describedby={errors.consentAcknowledgment ? "consent-error" : undefined}
                />
                I acknowledge and consent to the claim submission terms
              </label>
              {errors.consentAcknowledgment && (
                <span id="consent-error" className="error" role="alert">
                  {errors.consentAcknowledgment.message}
                </span>
              )}
            </div>
          )}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="submit-button"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Claim'}
      </button>
    </form>
  );
};

export default ClaimForm;