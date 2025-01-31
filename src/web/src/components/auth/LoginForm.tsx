/**
 * @fileoverview HIPAA-compliant login form component for AUSTA SuperApp
 * Implements secure authentication with OAuth 2.0, MFA, and biometric support
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled from '@emotion/styled';
import { Button, TextField, CircularProgress, Alert, FormControlLabel, Checkbox } from '@mui/material';
import { useAuditLog } from '@healthcare/audit-logger';

import useAuth from '../../hooks/useAuth';
import { ILoginCredentials, AuthState, MFAMethod } from '../../lib/types/auth';

// Styled components with enhanced accessibility
const SecureForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  background: var(--surface-background);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (forced-colors: active) {
    border: 2px solid ButtonText;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
`;

// Interface definitions
interface LoginFormProps {
  onSuccess: (tokens: any) => void;
  onError?: (error: any) => void;
  securityLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  emergencyAccess?: boolean;
}

interface FormErrors {
  email?: string;
  password?: string;
  mfa?: string;
  general?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onError,
  securityLevel = 'HIGH',
  emergencyAccess = false
}) => {
  // Hooks
  const { handleLogin, isLoading, handleBiometricAuth, handleMFAVerification } = useAuth();
  const auditLog = useAuditLog();

  // State management
  const [formData, setFormData] = useState<ILoginCredentials>({
    email: '',
    password: '',
    rememberMe: false,
    deviceId: '',
    clientMetadata: {}
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [authState, setAuthState] = useState<AuthState>(AuthState.UNAUTHENTICATED);
  const [mfaCode, setMfaCode] = useState<string>('');

  // Security enhancements
  useEffect(() => {
    // Generate device fingerprint
    const generateDeviceId = async () => {
      const userAgent = navigator.userAgent;
      const timestamp = Date.now().toString();
      const deviceId = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${userAgent}${timestamp}`)
      );
      return Array.from(new Uint8Array(deviceId))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    };

    generateDeviceId().then(id => {
      setFormData(prev => ({
        ...prev,
        deviceId: id,
        clientMetadata: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          securityLevel: securityLevel.toString(),
          emergencyAccess: emergencyAccess.toString()
        }
      }));
    });
  }, [securityLevel, emergencyAccess]);

  // Form validation
  const validateForm = useCallback(() => {
    const newErrors: FormErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 12) {
      newErrors.password = 'Password must be at least 12 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Event handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSecureSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      if (!validateForm()) return;

      // Attempt biometric authentication if available
      if (securityLevel === 'HIGH' && window.PublicKeyCredential) {
        const biometricResult = await handleBiometricAuth();
        if (!biometricResult) {
          throw new Error('Biometric authentication failed');
        }
      }

      const response = await handleLogin(formData);

      // Handle MFA if required
      if (response.requiresMFA) {
        setAuthState(AuthState.PENDING_MFA);
        return;
      }

      auditLog.info('Login successful', {
        userId: formData.email,
        deviceId: formData.deviceId,
        securityLevel,
        emergencyAccess
      });

      onSuccess(response);
    } catch (error) {
      auditLog.error('Login failed', {
        userId: formData.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        securityLevel
      });

      setErrors(prev => ({
        ...prev,
        general: error instanceof Error ? error.message : 'An unknown error occurred'
      }));

      onError?.(error);
    }
  };

  const handleMFASubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      const mfaResult = await handleMFAVerification({
        code: mfaCode,
        method: MFAMethod.AUTHENTICATOR,
        verificationId: formData.email,
        timestamp: Date.now()
      });

      if (mfaResult.success) {
        setAuthState(AuthState.AUTHENTICATED);
        onSuccess(mfaResult.tokens);
      }
    } catch (error) {
      setErrors(prev => ({
        ...prev,
        mfa: error instanceof Error ? error.message : 'MFA verification failed'
      }));
    }
  };

  return (
    <SecureForm
      onSubmit={authState === AuthState.PENDING_MFA ? handleMFASubmit : handleSecureSubmit}
      aria-label="Login form"
      aria-describedby="login-instructions"
      noValidate
    >
      {errors.general && (
        <Alert severity="error" aria-live="polite">
          {errors.general}
        </Alert>
      )}

      {authState === AuthState.UNAUTHENTICATED && (
        <>
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email"
            value={formData.email}
            onChange={handleChange}
            error={!!errors.email}
            helperText={errors.email}
            autoComplete="email"
            required
            fullWidth
            aria-required="true"
            inputProps={{
              'aria-invalid': !!errors.email,
              'aria-describedby': errors.email ? 'email-error' : undefined
            }}
          />

          <TextField
            id="password"
            name="password"
            type="password"
            label="Password"
            value={formData.password}
            onChange={handleChange}
            error={!!errors.password}
            helperText={errors.password}
            autoComplete="current-password"
            required
            fullWidth
            aria-required="true"
            inputProps={{
              'aria-invalid': !!errors.password,
              'aria-describedby': errors.password ? 'password-error' : undefined
            }}
          />

          <FormControlLabel
            control={
              <Checkbox
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                color="primary"
              />
            }
            label="Remember me on this device"
          />
        </>
      )}

      {authState === AuthState.PENDING_MFA && (
        <TextField
          id="mfaCode"
          name="mfaCode"
          type="text"
          label="Enter MFA Code"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          error={!!errors.mfa}
          helperText={errors.mfa}
          autoComplete="one-time-code"
          required
          fullWidth
          inputProps={{
            'aria-invalid': !!errors.mfa,
            'aria-describedby': errors.mfa ? 'mfa-error' : undefined,
            inputMode: 'numeric',
            pattern: '[0-9]*'
          }}
        />
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        fullWidth
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {authState === AuthState.PENDING_MFA ? 'Verify MFA Code' : 'Log In'}
      </Button>

      {isLoading && (
        <LoadingOverlay>
          <CircularProgress aria-label="Loading" />
        </LoadingOverlay>
      )}

      <div id="login-instructions" className="sr-only">
        Please enter your email and password to log in. For enhanced security,
        you may be required to provide additional verification.
      </div>
    </SecureForm>
  );
};

export default LoginForm;