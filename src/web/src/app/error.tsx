'use client';

import React, { useEffect } from 'react';
import styled from '@emotion/styled';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import Button from '../../components/common/Button';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../../lib/utils/analytics';
import { theme } from '../../styles/theme';

// Styled components with Material Design 3.0 and WCAG compliance
const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${theme.spacing(4)}px;
  background-color: ${theme.palette.background.default};
  text-align: center;
`;

const ErrorContent = styled.div`
  max-width: 600px;
  padding: ${theme.spacing(4)}px;
  background-color: ${theme.palette.background.paper};
  border-radius: ${theme.shape.borderRadius}px;
  box-shadow: ${theme.shadows[0]};
`;

const ErrorTitle = styled.h1`
  color: ${theme.palette.error.main};
  font-size: ${theme.typography.h3.fontSize};
  font-weight: ${theme.typography.fontWeightBold};
  margin-bottom: ${theme.spacing(2)}px;
`;

const ErrorMessage = styled.p`
  color: ${theme.palette.text.primary};
  font-size: ${theme.typography.body1.fontSize};
  line-height: ${theme.typography.body1.lineHeight};
  margin-bottom: ${theme.spacing(4)}px;
`;

const ErrorActions = styled.div`
  display: flex;
  gap: ${theme.spacing(2)}px;
  justify-content: center;
`;

// Interface for error page props
interface ErrorPageProps {
  error: Error;
  reset: () => void;
  isEmergencyMode?: boolean;
  isOffline?: boolean;
}

// Sanitize error message for HIPAA compliance
const sanitizeErrorMessage = (error: Error): string => {
  // Default user-friendly message
  const defaultMessage = 'An unexpected error occurred. Please try again.';

  // Return default message in production to avoid exposing sensitive info
  if (process.env.NODE_ENV === 'production') {
    return defaultMessage;
  }

  // In development, show actual error but sanitize potential PHI/PII
  return error.message.replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\d{3}-?\d{2}-?\d{4})/gi, '[REDACTED]');
};

// Handle retry action with analytics
const handleRetry = async (reset: () => void, error: Error): Promise<void> => {
  try {
    await Analytics.trackEvent({
      name: 'error_retry_attempt',
      category: AnalyticsCategory.SYSTEM_PERFORMANCE,
      properties: {
        error_type: error.name,
        error_sanitized: true,
        environment: process.env.NODE_ENV
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: `error_retry_${Date.now()}`,
        timestamp: Date.now(),
        userId: 'system',
        ipAddress: 'internal',
        actionType: 'error_recovery'
      }
    });

    reset();
  } catch (trackingError) {
    console.error('Failed to track retry attempt:', trackingError);
    reset(); // Still attempt reset even if tracking fails
  }
};

// Main error component
const Error: React.FC<ErrorPageProps> = ({
  error,
  reset,
  isEmergencyMode = false,
  isOffline = false
}) => {
  // Track error occurrence
  useEffect(() => {
    Analytics.trackError(error, {
      page: 'error_boundary',
      isEmergencyMode,
      isOffline,
      timestamp: Date.now()
    }).catch(console.error);
  }, [error, isEmergencyMode, isOffline]);

  return (
    <ErrorBoundary>
      <ErrorContainer role="alert" aria-live="polite">
        <ErrorContent>
          <ErrorTitle aria-label="Error occurred">
            {isEmergencyMode ? 'Emergency Mode Active' : 'Something went wrong'}
          </ErrorTitle>
          
          <ErrorMessage>
            {sanitizeErrorMessage(error)}
            {isOffline && ' Please check your internet connection.'}
          </ErrorMessage>

          <ErrorActions>
            <Button
              variant="primary"
              onClick={() => handleRetry(reset, error)}
              aria-label="Try again"
              size="large"
              highContrast={true}
            >
              Try Again
            </Button>
            
            <Button
              variant="secondary"
              onClick={() => window.location.href = '/'}
              aria-label="Return to home page"
              size="large"
            >
              Return Home
            </Button>
          </ErrorActions>
        </ErrorContent>
      </ErrorContainer>
    </ErrorBoundary>
  );
};

export default Error;