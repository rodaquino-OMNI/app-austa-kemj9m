/**
 * @fileoverview Comprehensive test suite for LoginForm component
 * Tests enhanced authentication flows, security measures, and accessibility
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { axe, toHaveNoViolations } from 'jest-axe';

import LoginForm from '../../../src/components/auth/LoginForm';
import { useAuth } from '../../../src/hooks/useAuth';
import { AuthState, MFAMethod } from '../../../lib/types/auth';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock useAuth hook
jest.mock('../../../src/hooks/useAuth');
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Test data
const validHealthcareCredentials = {
  email: 'doctor@hospital.com',
  password: 'ComplexPass123!@#',
  rememberMe: true,
  deviceId: 'mock-device-id',
  clientMetadata: {
    userAgent: navigator.userAgent,
    timestamp: expect.any(String),
    securityLevel: 'HIGH',
    emergencyAccess: false
  }
};

const mockMFACredentials = {
  code: '123456',
  method: MFAMethod.AUTHENTICATOR,
  verificationId: validHealthcareCredentials.email,
  timestamp: expect.any(Number)
};

describe('LoginForm Component - Healthcare Authentication', () => {
  // Setup handlers
  const mockHandleLogin = jest.fn();
  const mockHandleMFA = jest.fn();
  const mockHandleBiometric = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock auth hook implementation
    mockUseAuth.mockImplementation(() => ({
      handleLogin: mockHandleLogin,
      handleMFAVerification: mockHandleMFA,
      handleBiometricAuth: mockHandleBiometric,
      isLoading: false,
      state: AuthState.UNAUTHENTICATED,
      user: null,
      tokens: null,
      error: null,
      lastActivity: Date.now(),
      sessionTimeout: 1800000
    }));
  });

  it('should render login form with enhanced security elements', () => {
    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        securityLevel="HIGH"
      />
    );

    // Verify critical form elements
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    expect(screen.getByRole('form')).toHaveAttribute('aria-describedby', 'login-instructions');
  });

  it('should handle successful healthcare provider login', async () => {
    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    // Fill form with healthcare provider credentials
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: validHealthcareCredentials.email }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: validHealthcareCredentials.password }
    });
    fireEvent.click(screen.getByLabelText(/remember me/i));

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(mockHandleLogin).toHaveBeenCalledWith(expect.objectContaining({
        email: validHealthcareCredentials.email,
        password: validHealthcareCredentials.password,
        rememberMe: true,
        deviceId: expect.any(String),
        clientMetadata: expect.any(Object)
      }));
    });
  });

  it('should handle MFA verification flow', async () => {
    // Mock initial auth state
    mockUseAuth.mockImplementation(() => ({
      ...mockUseAuth(),
      state: AuthState.PENDING_MFA
    }));

    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    // Verify MFA input is displayed
    const mfaInput = screen.getByLabelText(/enter mfa code/i);
    expect(mfaInput).toBeInTheDocument();

    // Enter and submit MFA code
    fireEvent.change(mfaInput, { target: { value: mockMFACredentials.code } });
    fireEvent.click(screen.getByRole('button', { name: /verify mfa code/i }));

    await waitFor(() => {
      expect(mockHandleMFA).toHaveBeenCalledWith(expect.objectContaining({
        code: mockMFACredentials.code,
        method: MFAMethod.AUTHENTICATOR,
        verificationId: expect.any(String)
      }));
    });
  });

  it('should handle biometric authentication when available', async () => {
    // Mock PublicKeyCredential availability
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: class MockPublicKeyCredential {}
    });

    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    // Fill and submit form
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: validHealthcareCredentials.email }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: validHealthcareCredentials.password }
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(mockHandleBiometric).toHaveBeenCalled();
    });
  });

  it('should validate form inputs with healthcare security requirements', async () => {
    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    // Submit empty form
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    // Check for validation messages
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();

    // Test invalid email format
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'invalid-email' }
    });
    expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();

    // Test password length requirement
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'short' }
    });
    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument();
  });

  it('should handle authentication errors securely', async () => {
    const mockError = new Error('Invalid credentials');
    mockHandleLogin.mockRejectedValue(mockError);

    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        securityLevel="HIGH"
      />
    );

    // Submit form with credentials
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: validHealthcareCredentials.email }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: validHealthcareCredentials.password }
    });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(mockError);
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  it('should meet WCAG 2.1 Level AA accessibility requirements', async () => {
    const { container } = render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify specific accessibility features
    expect(screen.getByRole('form')).toHaveAttribute('novalidate');
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false');
  });

  it('should handle emergency access mode', () => {
    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
        emergencyAccess={true}
      />
    );

    // Verify emergency access indicators
    expect(screen.getByRole('form')).toHaveAttribute('aria-describedby', 'login-instructions');
    expect(screen.getByText(/emergency access/i)).toBeInTheDocument();
  });

  it('should show loading state during authentication', async () => {
    mockUseAuth.mockImplementation(() => ({
      ...mockUseAuth(),
      isLoading: true
    }));

    render(
      <LoginForm 
        onSuccess={mockOnSuccess}
        securityLevel="HIGH"
      />
    );

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });
});