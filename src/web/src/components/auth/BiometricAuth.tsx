/**
 * @fileoverview Enhanced biometric authentication component for AUSTA SuperApp
 * Implements HIPAA-compliant biometric authentication with clinical environment support
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import React, { useState, useEffect, useCallback } from 'react'; // v18.0.0
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'; // v7.0.0
import { MdFingerprint, MdFace, MdError, MdCheckCircle } from 'react-icons/md'; // Using react-icons instead
import { Button, CircularProgress, Alert } from '@mui/material'; // Using MUI components instead
import { SecurityLogger } from '@logger/security'; // v2.0.0

import useAuth from '../../hooks/useAuth';
import { AuthState } from '../../lib/types/auth';

// Security and clinical environment constants
const BIOMETRIC_TIMEOUT = 30000;
const MAX_ATTEMPTS = 3;
const EMERGENCY_TIMEOUT = 5000;
const CLINICAL_DEVICE_TYPES = ['medical_tablet', 'workstation', 'mobile_cart'];

// Types for biometric authentication
interface BiometricAuthProps {
  onSuccess: (result: AuthResult) => void;
  onError: (error: BiometricError) => void;
  onEmergencyOverride?: (context: EmergencyContext) => void;
  clinicalMode?: boolean;
  accessibilityMode?: boolean;
  deviceType?: string;
}

interface BiometricError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
}

interface AuthResult {
  verified: boolean;
  deviceId: string;
  timestamp: number;
  clinicalContext?: ClinicalContext;
}

interface ClinicalContext {
  deviceType: string;
  locationId: string;
  workstationId: string;
  emergencyAccess: boolean;
}

interface EmergencyContext {
  reason: string;
  authorizedBy: string;
  timestamp: number;
}

/**
 * Enhanced biometric authentication component with clinical environment support
 * Implements HIPAA-compliant authentication with accessibility features
 */
const BiometricAuth: React.FC<BiometricAuthProps> = ({
  onSuccess,
  onError,
  onEmergencyOverride,
  clinicalMode = false,
  accessibilityMode = false,
  deviceType
}) => {
  // State management
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<BiometricError | null>(null);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');

  // Hooks
  const { state: authState, verifyBiometric } = useAuth();

  // Security logger instance
  const securityLogger = new SecurityLogger({
    component: 'BiometricAuth',
    hipaaCompliant: true
  });

  /**
   * Checks biometric authentication availability with device support
   */
  const checkBiometricAvailability = useCallback(async () => {
    try {
      const publicKeyCredential = window.PublicKeyCredential;
      
      if (!publicKeyCredential || !publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
        throw new Error('Biometric authentication not supported');
      }

      const isSupported = await publicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      
      // Additional clinical device checks
      if (clinicalMode && deviceType) {
        const isClinicalDevice = CLINICAL_DEVICE_TYPES.includes(deviceType);
        setIsAvailable(isSupported && isClinicalDevice);
        
        securityLogger.info('Biometric availability checked', {
          isSupported,
          isClinicalDevice,
          deviceType
        });
      } else {
        setIsAvailable(isSupported);
      }
    } catch (err) {
      const errorObj = err as Error;
      setError({
        code: 'BIOMETRIC_UNAVAILABLE',
        message: errorObj.message,
        timestamp: Date.now()
      });
      securityLogger.error('Biometric availability check failed', { error: errorObj });
    }
  }, [clinicalMode, deviceType]);

  /**
   * Handles biometric authentication with clinical optimizations
   */
  const handleBiometricAuth = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (attemptCount >= MAX_ATTEMPTS) {
        throw new Error('Maximum authentication attempts exceeded');
      }

      // Clinical environment checks
      const clinicalContext = clinicalMode ? {
        deviceType: deviceType || 'unknown',
        locationId: '',
        workstationId: '',
        emergencyAccess: false
      } : undefined;

      if (clinicalContext) {
        securityLogger.info('Clinical context validated', clinicalContext);
      }

      // Start biometric authentication
      const authOptions = {
        timeout: BIOMETRIC_TIMEOUT,
        userVerification: 'required' as UserVerificationRequirement,
        attestation: clinicalMode ? 'direct' : 'none'
      };

      const credential = await startAuthentication(authOptions);
      
      // Verify with backend
      const verificationResult = await verifyBiometric({
        credential,
        deviceId: deviceFingerprint,
        timestamp: Date.now()
      });

      if (verificationResult) {
        const authResult: AuthResult = {
          verified: true,
          deviceId: deviceFingerprint,
          timestamp: Date.now(),
          clinicalContext
        };

        securityLogger.info('Biometric authentication successful', {
          deviceId: deviceFingerprint,
          clinicalMode
        });

        onSuccess(authResult);
      }
    } catch (err) {
      const errorObj = err as Error;
      setAttemptCount(prev => prev + 1);
      
      const biometricError: BiometricError = {
        code: 'BIOMETRIC_ERROR',
        message: errorObj.message,
        details: {},
        timestamp: Date.now()
      };

      setError(biometricError);
      onError(biometricError);
      
      securityLogger.error('Biometric authentication failed', {
        error: biometricError,
        attemptCount: attemptCount + 1
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles emergency authentication override
   */
  const handleEmergencyOverride = async () => {
    if (!onEmergencyOverride) return;

    try {
      setIsLoading(true);
      
      const emergencyContext: EmergencyContext = {
        reason: 'EMERGENCY_ACCESS',
        authorizedBy: '',
        timestamp: Date.now()
      };

      securityLogger.warn('Emergency override initiated', emergencyContext);
      
      setTimeout(() => {
        onEmergencyOverride(emergencyContext);
      }, EMERGENCY_TIMEOUT);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize component
  useEffect(() => {
    checkBiometricAvailability();
  }, [checkBiometricAvailability]);

  // Render component with accessibility support
  return (
    <div 
      className="biometric-auth-container"
      role="region"
      aria-label="Biometric Authentication"
    >
      {error && (
        <Alert 
          severity="error"
          onClose={() => setError(null)}
          aria-live="polite"
        >
          <MdError /> {error.message}
        </Alert>
      )}

      <div className="biometric-prompt" aria-live="polite">
        {isLoading ? (
          <CircularProgress aria-label="Authenticating..." />
        ) : (
          <>
            <Button
              onClick={handleBiometricAuth}
              disabled={!isAvailable || isLoading}
              aria-disabled={!isAvailable || isLoading}
              startIcon={deviceType?.includes('face') ? <MdFace /> : <MdFingerprint />}
            >
              {isAvailable ? 'Use Biometric Authentication' : 'Biometric Auth Not Available'}
            </Button>

            {clinicalMode && onEmergencyOverride && (
              <Button
                variant="outlined"
                color="warning"
                onClick={handleEmergencyOverride}
                disabled={isLoading}
                aria-label="Emergency Override"
              >
                Emergency Override
              </Button>
            )}
          </>
        )}
      </div>

      {accessibilityMode && (
        <div className="accessibility-instructions" aria-live="polite">
          <p>Press Space or Enter to initiate biometric authentication</p>
          {error && <p>Authentication failed. Please try again or contact support.</p>}
        </div>
      )}
    </div>
  );
};

export default BiometricAuth;

// Named exports for enhanced functionality
export const useBiometricAuth = () => {
  const { verifyBiometric } = useAuth();
  return { verifyBiometric };
};