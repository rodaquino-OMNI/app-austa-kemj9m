'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation'; // v13.0.0
import toast from 'react-hot-toast'; // v2.4.0
import { useErrorBoundary } from 'react-error-boundary'; // v4.0.0

// Internal imports
import ClaimForm from '../../../components/claims/ClaimForm';
import { useClaims } from '../../../hooks/useClaims';
import { IClaim } from '../../../lib/types/claim';
import { ErrorCode, ErrorTracker } from '../../../lib/constants/errorCodes';

/**
 * HIPAA-compliant claim submission page component
 * Implements secure form handling and document upload
 */
const ClaimsSubmitPage: React.FC = () => {
  const router = useRouter();
  const { showBoundary } = useErrorBoundary();

  // Initialize claims management hook with strict compliance
  const {
    submitClaim,
    validateCompliance,
    loading,
    error,
    complianceStatus
  } = useClaims({
    complianceLevel: 'strict',
    autoRefresh: false
  });

  /**
   * Handles successful claim submission with audit logging
   */
  const handleSubmitSuccess = useCallback(async (claim: IClaim) => {
    try {
      // Show success notification
      toast.success('Claim submitted successfully', {
        duration: 5000,
        ariaProps: {
          role: 'status',
          'aria-live': 'polite',
        }
      });

      // Navigate to claim details
      router.push(`/claims/${claim.id}`);
    } catch (error) {
      ErrorTracker.captureError(error as Error, {
        context: 'handleSubmitSuccess',
        claimId: claim.id
      });
      showBoundary(error);
    }
  }, [router, showBoundary]);

  /**
   * Handles claim submission errors with compliance logging
   */
  const handleSubmitError = useCallback(async (error: Error) => {
    // Log error with security context
    ErrorTracker.captureError(error, {
      context: 'claim_submission_error',
      timestamp: new Date().toISOString()
    });

    // Show user-friendly error message
    const errorMessage = error.message || 'An error occurred while submitting the claim';
    toast.error(errorMessage, {
      duration: 7000,
      ariaProps: {
        role: 'alert',
        'aria-live': 'assertive',
      }
    });

    // Handle HIPAA violations specially
    if ((error as any).code === ErrorCode.HIPAA_VIOLATION) {
      toast.error('Please ensure all HIPAA requirements are met', {
        duration: 10000,
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive',
        }
      });
    }
  }, []);

  return (
    <main className="claims-submit-page" role="main" aria-label="Submit Insurance Claim">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Submit Insurance Claim</h1>
          <p className="text-gray-600">
            Please provide accurate information and required documentation
          </p>
        </header>

        {/* HIPAA compliance alerts */}
        {!complianceStatus.isCompliant && (
          <div 
            role="alert" 
            className="bg-red-50 border-l-4 border-red-500 p-4 mb-6"
          >
            <h2 className="text-red-800 font-semibold">
              HIPAA Compliance Issues
            </h2>
            <ul className="mt-2 list-disc list-inside">
              {complianceStatus.violations.map((violation, index) => (
                <li key={index} className="text-red-700">{violation}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Loading state indicator */}
        {loading && (
          <div 
            role="status" 
            aria-live="polite" 
            className="flex items-center justify-center p-4"
          >
            <span className="sr-only">Processing claim submission...</span>
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
          </div>
        )}

        {/* Main claim form */}
        <ClaimForm
          onSubmitSuccess={handleSubmitSuccess}
          onSubmitError={handleSubmitError}
          encryptionKey={process.env.NEXT_PUBLIC_CLAIMS_ENCRYPTION_KEY!}
        />

        {/* Error display */}
        {error && (
          <div 
            role="alert" 
            className="bg-red-50 border border-red-200 rounded-md p-4 mt-6"
          >
            <h2 className="text-red-800 font-semibold">
              Error Submitting Claim
            </h2>
            <p className="text-red-700 mt-2">{error.message}</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default ClaimsSubmitPage;