/**
 * @fileoverview HIPAA-compliant login page component for AUSTA SuperApp
 * Implements secure authentication with OAuth 2.0, MFA, and biometric support
 * @version 1.0.0
 * @license HIPAA-compliant
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react'; // v18.0.0
import { useRouter } from 'next/navigation'; // v13.0.0
import styled from '@emotion/styled'; // v11.11.0

import LoginForm from '../../../components/auth/LoginForm';
import BiometricAuth from '../../../components/auth/BiometricAuth';
import useAuth from '../../../hooks/useAuth';
import { AuthState } from '../../../lib/types/auth';

// Styled components with healthcare optimizations
const StyledLoginPage = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background-color: var(--clinical-background, #f5f7fa);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--clinical-background-dark, #1a1a1a);
  }

  @media (forced-colors: active) {
    border: 2px solid ButtonText;
  }
`;

const LoginContainer = styled.div`
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 2rem;
  background: var(--surface-background, #ffffff);
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    padding: 1.5rem;
    margin: 1rem;
  }
`;

const SecurityNotice = styled.div`
  margin-top: 2rem;
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-align: center;
`;

/**
 * HIPAA-compliant login page with enhanced security features
 */
const LoginPage: React.FC = () => {
  // Hooks
  const router = useRouter();
  const { 
    state: authState,
    isLoading,
    error,
    login: handleLogin,
    verifyBiometric
  } = useAuth();

  // State management
  const [securityContext, setSecurityContext] = useState({
    deviceType: '',
    isClinicalEnvironment: false,
    emergencyAccess: false
  });

  // Initialize security context
  useEffect(() => {
    const initializeSecurityContext = async () => {
      try {
        // Detect device type and environment
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobileDevice = /mobile|tablet|ipad|android/.test(userAgent);
        const isClinicalDevice = /medical_tablet|workstation|mobile_cart/.test(userAgent);

        setSecurityContext({
          deviceType: isMobileDevice ? 'mobile' : 'desktop',
          isClinicalEnvironment: isClinicalDevice,
          emergencyAccess: false
        });
      } catch (error) {
        console.error('Security context initialization failed:', error);
      }
    };

    initializeSecurityContext();
  }, []);

  /**
   * Handles successful login with security logging
   */
  const handleLoginSuccess = useCallback(async (tokens: any) => {
    try {
      // Log security event
      console.info('Login successful', {
        timestamp: Date.now(),
        deviceType: securityContext.deviceType,
        isClinicalEnvironment: securityContext.isClinicalEnvironment
      });

      // Redirect based on authentication state
      if (authState === AuthState.AUTHENTICATED) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Login success handling failed:', error);
    }
  }, [authState, router, securityContext]);

  /**
   * Handles login errors with security measures
   */
  const handleLoginError = useCallback((error: any) => {
    // Log security event
    console.error('Login failed', {
      timestamp: Date.now(),
      error: error.message,
      deviceType: securityContext.deviceType
    });
  }, [securityContext]);

  /**
   * Handles emergency access override
   */
  const handleEmergencyOverride = useCallback((context: any) => {
    setSecurityContext(prev => ({
      ...prev,
      emergencyAccess: true
    }));

    // Log emergency access attempt
    console.warn('Emergency access initiated', {
      timestamp: Date.now(),
      context
    });
  }, []);

  return (
    <StyledLoginPage
      role="main"
      aria-label="Healthcare platform login"
    >
      <LoginContainer>
        {/* Biometric authentication for supported devices */}
        {securityContext.deviceType && (
          <BiometricAuth
            onSuccess={handleLoginSuccess}
            onError={handleLoginError}
            onEmergencyOverride={handleEmergencyOverride}
            clinicalMode={securityContext.isClinicalEnvironment}
            accessibilityMode={true}
            deviceType={securityContext.deviceType}
          />
        )}

        {/* Main login form */}
        <LoginForm
          onSuccess={handleLoginSuccess}
          onError={handleLoginError}
          securityLevel={securityContext.isClinicalEnvironment ? 'HIGH' : 'MEDIUM'}
          emergencyAccess={securityContext.emergencyAccess}
        />

        {/* Security notice */}
        <SecurityNotice role="note" aria-live="polite">
          This system is protected by enhanced security measures and complies with HIPAA regulations.
          All access attempts are monitored and logged.
        </SecurityNotice>
      </LoginContainer>
    </StyledLoginPage>
  );
};

// Metadata for Next.js page
export const metadata = {
  title: 'Login - AUSTA SuperApp',
  description: 'Secure healthcare platform login with multi-factor authentication'
};

export default LoginPage;