'use client';

import React, { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { audit } from '@hipaa-audit/logging'; // v2.0.0

// Internal imports
import ClaimsList from '@/components/claims/ClaimsList';
import StatusTracker from '@/components/claims/StatusTracker';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { useClaims } from '@/hooks/useClaims';
import { IClaim } from '@/lib/types/claim';
import { theme } from '@/styles/theme';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '@/lib/utils/analytics';

// Styled components with accessibility enhancements
const ClaimsPageContainer = styled.main`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${theme.spacing(3)}px;
  padding: ${theme.spacing(3)}px;
  max-width: 1440px;
  margin: 0 auto;
  min-height: 100vh;

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    padding: ${theme.spacing(2)}px;
    gap: ${theme.spacing(2)}px;
  }
`;

const ClaimsHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing(2)}px;
`;

const ClaimsTitle = styled.h1`
  font-size: ${theme.typography.h1.fontSize};
  font-weight: ${theme.typography.fontWeightBold};
  color: ${theme.palette.text.primary};
  margin: 0;
`;

const ClaimsContent = styled.section`
  display: grid;
  gap: ${theme.spacing(4)}px;
`;

const StatusTrackerWrapper = styled.div`
  background: ${theme.palette.background.paper};
  border-radius: ${theme.shape.borderRadius}px;
  box-shadow: ${theme.shadows[1]};
  overflow: hidden;
`;

/**
 * Claims page component with HIPAA compliance and accessibility features
 */
const ClaimsPage: React.FC = () => {
  // Initialize claims management hook with strict compliance
  const { 
    claims, 
    loading, 
    error, 
    getClaims,
    validateCompliance,
    auditLog 
  } = useClaims({
    pageSize: 10,
    autoRefresh: true,
    complianceLevel: 'strict'
  });

  // Selected claim state management
  const [selectedClaim, setSelectedClaim] = useState<IClaim | null>(null);

  // Secure claim selection handler with audit logging
  const handleClaimSelect = useCallback(async (claim: IClaim) => {
    try {
      // Validate compliance before selection
      const complianceCheck = validateCompliance(claim);
      if (!complianceCheck.isCompliant) {
        throw new Error('Compliance validation failed');
      }

      // Audit log the selection
      await audit('CLAIM_SELECT', {
        claimId: claim.id,
        userId: claim.patientId,
        action: 'VIEW',
        timestamp: new Date().toISOString()
      });

      setSelectedClaim(claim);

      // Track analytics event
      await Analytics.trackEvent({
        name: 'claim_selected',
        category: AnalyticsCategory.USER_INTERACTION,
        properties: {
          claimId: claim.id,
          claimType: claim.type,
          claimStatus: claim.status
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: PrivacyLevel.INTERNAL,
        auditInfo: {
          eventId: `claim_select_${Date.now()}`,
          timestamp: Date.now(),
          userId: claim.patientId,
          ipAddress: 'internal',
          actionType: 'claim_view'
        }
      });
    } catch (error) {
      console.error('Error selecting claim:', error);
      Analytics.trackError(error as Error, {
        context: 'handleClaimSelect',
        claimId: claim.id
      });
    }
  }, [validateCompliance]);

  // Initial claims fetch with error handling
  useEffect(() => {
    const fetchClaims = async () => {
      try {
        await getClaims();
      } catch (error) {
        Analytics.trackError(error as Error, {
          context: 'claims_initial_fetch'
        });
      }
    };

    fetchClaims();
  }, [getClaims]);

  return (
    <ErrorBoundary
      onError={(error, errorInfo, context) => {
        Analytics.trackError(error, {
          ...context,
          component: 'ClaimsPage',
          errorInfo
        });
      }}
    >
      <ClaimsPageContainer role="main" aria-label="Claims Management">
        <ClaimsHeader>
          <ClaimsTitle>Insurance Claims</ClaimsTitle>
          {selectedClaim && (
            <StatusTrackerWrapper>
              <StatusTracker
                claim={selectedClaim}
                loading={loading}
                showLabels
                ariaLabel={`Status tracker for claim ${selectedClaim.claimNumber}`}
              />
            </StatusTrackerWrapper>
          )}
        </ClaimsHeader>

        <ClaimsContent>
          <ClaimsList
            pageSize={10}
            onClaimSelect={handleClaimSelect}
            filters={{}}
            accessLevel="patient"
          />
        </ClaimsContent>
      </ClaimsPageContainer>
    </ErrorBoundary>
  );
};

export default ClaimsPage;