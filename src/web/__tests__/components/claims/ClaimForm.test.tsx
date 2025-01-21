/**
 * @fileoverview Test suite for ClaimForm component with HIPAA compliance validation
 * @version 1.0.0
 */

import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react'; // v14.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals'; // v29.0.0
import ClaimForm from '../../../src/components/claims/ClaimForm';
import { ClaimType, ClaimStatus } from '../../../src/lib/types/claim';
import { ErrorCode } from '../../../src/lib/constants/errorCodes';
import { submitClaim } from '../../../src/lib/api/claims';

// Mock API dependencies
jest.mock('../../../src/lib/api/claims');
jest.mock('@company/claim-validation');

// Test data with HIPAA compliance
const validClaimData = {
  type: ClaimType.MEDICAL,
  serviceDate: new Date('2023-12-01'),
  providerId: 'PROV123456',
  amount: 150.00,
  healthRecordId: '550e8400-e29b-41d4-a716-446655440000',
  hipaaAuthorization: true,
  consentAcknowledgment: true
};

const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

describe('ClaimForm Component', () => {
  const mockOnSubmitSuccess = jest.fn();
  const mockOnSubmitError = jest.fn();
  const mockEncryptionKey = 'test-encryption-key';

  beforeEach(() => {
    jest.clearAllMocks();
    (submitClaim as jest.Mock).mockReset();
  });

  it('renders form with all required fields and HIPAA consent', () => {
    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    // Verify all required form fields are present
    expect(screen.getByLabelText(/Claim Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Service Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByText(/HIPAA authorization/i)).toBeInTheDocument();
    expect(screen.getByText(/consent acknowledgment/i)).toBeInTheDocument();
  });

  it('validates HIPAA compliance requirements', async () => {
    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    const submitButton = screen.getByRole('button', { name: /submit claim/i });

    // Try submitting without HIPAA consent
    await userEvent.click(submitButton);

    expect(screen.getByText(/HIPAA authorization is required/i)).toBeInTheDocument();
    expect(submitClaim).not.toHaveBeenCalled();
  });

  it('handles secure file upload with validation', async () => {
    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    const fileInput = screen.getByLabelText(/Upload Documents/i);

    // Test valid file upload
    await userEvent.upload(fileInput, mockFile);
    expect(screen.getByText('test.pdf')).toBeInTheDocument();

    // Test invalid file type
    const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
    await userEvent.upload(fileInput, invalidFile);
    expect(screen.getByText(/File type .* not allowed/i)).toBeInTheDocument();
  });

  it('submits claim with encrypted data and handles success', async () => {
    (submitClaim as jest.Mock).mockResolvedValueOnce({
      id: '123',
      status: ClaimStatus.SUBMITTED,
      ...validClaimData
    });

    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    // Fill form with valid data
    await userEvent.selectOptions(screen.getByLabelText(/Claim Type/i), ClaimType.MEDICAL);
    await userEvent.type(screen.getByLabelText(/Service Date/i), '2023-12-01');
    await userEvent.type(screen.getByLabelText(/Amount/i), '150.00');
    await userEvent.upload(screen.getByLabelText(/Upload Documents/i), mockFile);
    await userEvent.click(screen.getByText(/HIPAA authorization/i));
    await userEvent.click(screen.getByText(/consent acknowledgment/i));

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => {
      expect(submitClaim).toHaveBeenCalledWith(expect.objectContaining({
        ...validClaimData,
        documents: [mockFile]
      }));
      expect(mockOnSubmitSuccess).toHaveBeenCalled();
    });
  });

  it('handles submission errors with proper error tracking', async () => {
    const mockError = new Error('Submission failed');
    mockError.name = ErrorCode.HIPAA_VIOLATION;
    (submitClaim as jest.Mock).mockRejectedValueOnce(mockError);

    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    // Fill and submit form
    await userEvent.selectOptions(screen.getByLabelText(/Claim Type/i), ClaimType.MEDICAL);
    await userEvent.type(screen.getByLabelText(/Service Date/i), '2023-12-01');
    await userEvent.type(screen.getByLabelText(/Amount/i), '150.00');
    await userEvent.click(screen.getByText(/HIPAA authorization/i));
    await userEvent.click(screen.getByText(/consent acknowledgment/i));
    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));

    await waitFor(() => {
      expect(mockOnSubmitError).toHaveBeenCalledWith(mockError);
    });
  });

  it('validates file size limits for document upload', async () => {
    const largeMockFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });
    
    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    const fileInput = screen.getByLabelText(/Upload Documents/i);
    await userEvent.upload(fileInput, largeMockFile);

    expect(screen.getByText(/File size exceeds limit/i)).toBeInTheDocument();
  });

  it('clears sensitive data on unmount', async () => {
    const { unmount } = render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    // Fill form with sensitive data
    await userEvent.type(screen.getByLabelText(/Amount/i), '150.00');
    
    unmount();

    // Verify form is cleared when remounted
    render(
      <ClaimForm
        onSubmitSuccess={mockOnSubmitSuccess}
        onSubmitError={mockOnSubmitError}
        encryptionKey={mockEncryptionKey}
      />
    );

    expect(screen.getByLabelText(/Amount/i)).toHaveValue(null);
  });
});