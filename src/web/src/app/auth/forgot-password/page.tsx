'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import winston from 'winston';
import { Button } from '@/components/common/Button';
import Input from '@/components/common/Input';
import { AuthAPI } from '@/lib/api/auth';
import { validateForm, sanitizeInput } from '@/lib/utils/validation';
import { ErrorTracker } from '@/lib/constants/errorCodes';
import { Analytics } from '@/lib/utils/analytics';

// Initialize secure logger for password reset events
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'forgot-password' },
  transports: [
    new winston.transports.File({ filename: 'security-events.log' })
  ]
});

// Form data interface with security metadata
interface ForgotPasswordFormData {
  email: string;
  deviceId: string;
  sessionId: string;
}

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 900000, // 15 minutes
  attempts: new Map<string, number>()
};

const ForgotPasswordPage: React.FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [deviceId] = useState(() => crypto.randomUUID());

  // Check rate limiting for the device
  const checkRateLimit = useCallback((deviceId: string): boolean => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.WINDOW_MS;

    // Clean up old attempts
    RATE_LIMIT.attempts.forEach((timestamp, key) => {
      if (timestamp < windowStart) {
        RATE_LIMIT.attempts.delete(key);
      }
    });

    const attempts = RATE_LIMIT.attempts.get(deviceId) || 0;
    return attempts < RATE_LIMIT.MAX_ATTEMPTS;
  }, []);

  // Log security event with audit trail
  const logSecurityEvent = useCallback((
    eventType: string,
    metadata: Record<string, any>
  ) => {
    securityLogger.info('Password Reset Security Event', {
      eventType,
      timestamp: Date.now(),
      deviceId,
      metadata,
      ipAddress: 'masked', // Actual IP should be obtained securely
      userAgent: window.navigator.userAgent
    });
  }, [deviceId]);

  // Handle form submission with security measures
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(undefined);

      // Check rate limiting
      if (!checkRateLimit(deviceId)) {
        setError('Too many attempts. Please try again later.');
        logSecurityEvent('RATE_LIMIT_EXCEEDED', { email });
        return;
      }

      // Sanitize and validate email
      const sanitizedEmail = sanitizeInput(email, {
        stripHtml: true,
        escapeChars: true,
        trimWhitespace: true,
        enableMetrics: true
      });

      const validationResult = await validateForm(
        { email: sanitizedEmail },
        {
          context: { isPHI: true }
        }
      );

      if (!validationResult.isValid) {
        setError(validationResult.errors[0]);
        return;
      }

      // Track attempt for rate limiting
      const currentAttempts = RATE_LIMIT.attempts.get(deviceId) || 0;
      RATE_LIMIT.attempts.set(deviceId, currentAttempts + 1);

      // Request password reset
      const authAPI = new AuthAPI(process.env.NEXT_PUBLIC_API_URL || '');
      await authAPI.login({
        email: sanitizedEmail,
        deviceId,
        sessionId: crypto.randomUUID(),
        password: '',
        rememberMe: false,
        clientMetadata: {}
      });

      // Log successful attempt
      logSecurityEvent('PASSWORD_RESET_REQUESTED', {
        email: sanitizedEmail,
        success: true
      });

      // Track analytics event
      Analytics.trackEvent({
        name: 'password_reset_requested',
        category: 'USER_INTERACTION',
        properties: {
          deviceId
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'INTERNAL',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: 'anonymous',
          ipAddress: 'masked',
          actionType: 'password_reset'
        }
      });

      // Redirect to confirmation page
      router.push('/auth/forgot-password/confirmation');

    } catch (err) {
      // Log failed attempt
      logSecurityEvent('PASSWORD_RESET_FAILED', {
        email,
        error: err instanceof Error ? err.message : 'Unknown error'
      });

      ErrorTracker.captureError(err instanceof Error ? err : new Error('Unknown error'), {
        component: 'ForgotPasswordPage',
        action: 'handleSubmit'
      });

      setError('Unable to process your request. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, deviceId, checkRateLimit, logSecurityEvent, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-default">
      <div className="w-full max-w-md p-8 bg-background-paper rounded-lg shadow-clinical">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Reset Your Password
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="email"
            name="email"
            type="email"
            label="Email Address"
            value={email}
            onChange={(e: string) => setEmail(e)}
            placeholder="Enter your registered email"
            error={error}
            disabled={isSubmitting}
            required
            fullWidth
            aria-label="Enter your registered email address"
            aria-describedby={error ? 'email-error' : undefined}
          />

          {error && (
            <div
              id="email-error"
              className="text-error-main text-sm"
              role="alert"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="large"
            disabled={isSubmitting}
            fullWidth
            aria-label="Request password reset"
          >
            {isSubmitting ? 'Processing...' : 'Reset Password'}
          </Button>

          <div className="text-center mt-4">
            <Button
              variant="tertiary"
              size="small"
              onClick={() => router.push('/auth/login')}
              aria-label="Return to login page"
            >
              Back to Login
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;