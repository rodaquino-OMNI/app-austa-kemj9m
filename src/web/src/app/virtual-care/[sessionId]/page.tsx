'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';

import VideoConsultation from '../../../components/virtual-care/VideoConsultation';
import { virtualCareApi } from '../../../lib/api/virtualCare';
import { 
  IConsultation, 
  ConsultationStatus, 
  ConnectionQuality,
  isActiveConsultation 
} from '../../../lib/types/consultation';

// Security monitoring package version 2.0.0
import { SecurityMonitor } from '@healthcare/security-monitor';

// Interface for page props
interface IPageProps {
  params: {
    sessionId: string;
  };
}

// Interface for security context
interface ISecurityContext {
  encryptionStatus: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  connectionQuality: ConnectionQuality;
  securityViolations: string[];
  hipaaCompliance: 'COMPLIANT' | 'NON_COMPLIANT';
}

// Initial security context
const initialSecurityContext: ISecurityContext = {
  encryptionStatus: 'UNVERIFIED',
  connectionQuality: ConnectionQuality.GOOD,
  securityViolations: [],
  hipaaCompliance: 'COMPLIANT'
};

/**
 * Virtual Care Session Page Component
 * Implements HIPAA-compliant video consultation with enhanced security monitoring
 */
const VirtualCarePage: React.FC<IPageProps> = ({ params }) => {
  const router = useRouter();
  const securityMonitor = new SecurityMonitor();

  // State management
  const [consultation, setConsultation] = useState<IConsultation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [securityContext, setSecurityContext] = useState<ISecurityContext>(initialSecurityContext);

  /**
   * Handles security violations during consultation
   */
  const handleSecurityViolation = useCallback((violation: string) => {
    setSecurityContext(prev => ({
      ...prev,
      securityViolations: [...prev.securityViolations, violation],
      hipaaCompliance: 'NON_COMPLIANT'
    }));

    // Log security violation
    securityMonitor.logViolation({
      sessionId: params.sessionId,
      violation,
      timestamp: new Date().toISOString()
    });
  }, [params.sessionId, securityMonitor]);

  /**
   * Handles connection quality changes
   */
  const handleQualityChange = useCallback((quality: ConnectionQuality) => {
    setSecurityContext(prev => ({
      ...prev,
      connectionQuality: quality
    }));

    if (quality === ConnectionQuality.POOR) {
      handleSecurityViolation('QUALITY_DEGRADED');
    }
  }, [handleSecurityViolation]);

  /**
   * Handles consultation end
   */
  const handleConsultationEnd = useCallback(async () => {
    try {
      await virtualCareApi.endConsultation(params.sessionId);
      router.push('/virtual-care/sessions');
    } catch (err) {
      setError('Failed to end consultation properly');
    }
  }, [params.sessionId, router]);

  /**
   * Verifies encryption status
   */
  const verifyEncryption = useCallback(async () => {
    try {
      const status = await virtualCareApi.verifyEncryption(params.sessionId);
      setSecurityContext(prev => ({
        ...prev,
        encryptionStatus: status ? 'VERIFIED' : 'FAILED'
      }));

      if (!status) {
        handleSecurityViolation('ENCRYPTION_FAILED');
      }
    } catch (err) {
      handleSecurityViolation('ENCRYPTION_VERIFICATION_ERROR');
    }
  }, [params.sessionId, handleSecurityViolation]);

  /**
   * Initializes consultation session
   */
  useEffect(() => {
    const initializeConsultation = async () => {
      try {
        setLoading(true);
        const consultationData = await virtualCareApi.joinConsultation(
          params.sessionId,
          {
            securityLevel: 'HIPAA',
            encryptionRequired: true
          }
        );

        if (!isActiveConsultation(consultationData)) {
          throw new Error('Consultation is not active');
        }

        setConsultation(consultationData);
        await verifyEncryption();
      } catch (err: any) {
        setError(err.message || 'Failed to initialize consultation');
        handleSecurityViolation('INITIALIZATION_FAILED');
      } finally {
        setLoading(false);
      }
    };

    initializeConsultation();

    // Cleanup on unmount
    return () => {
      handleConsultationEnd();
    };
  }, [params.sessionId, verifyEncryption, handleConsultationEnd, handleSecurityViolation]);

  // Loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
        <Typography variant="h6" ml={2}>
          Establishing Secure Connection...
        </Typography>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" variant="filled">
          {error}
        </Alert>
      </Box>
    );
  }

  // Security violation warning
  if (securityContext.securityViolations.length > 0) {
    return (
      <Box p={3}>
        <Alert severity="warning" variant="filled">
          Security violations detected. Session terminated for safety.
        </Alert>
      </Box>
    );
  }

  // Main consultation interface
  return (
    <Box height="100vh" p={3}>
      {/* Security Status Banner */}
      <Alert 
        severity={securityContext.encryptionStatus === 'VERIFIED' ? 'success' : 'warning'}
        sx={{ mb: 2 }}
      >
        {securityContext.encryptionStatus === 'VERIFIED' 
          ? 'Secure HIPAA-compliant connection established'
          : 'Verifying connection security...'}
      </Alert>

      {/* Main Video Consultation Component */}
      {consultation && (
        <VideoConsultation
          consultation={consultation}
          onEnd={handleConsultationEnd}
          onSecurityViolation={handleSecurityViolation}
          onQualityChange={handleQualityChange}
        />
      )}
    </Box>
  );
};

export default VirtualCarePage;