'use client';

import React, { useEffect } from 'react';
import { notFound } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import styled from '@emotion/styled';
import { useAuditLogger } from '@austa/audit-logger';

// Internal imports
import StatusTracker from '../../../components/claims/StatusTracker';
import { getClaimById } from '../../../lib/api/claims';
import { IClaim, ClaimStatus } from '../../../lib/types/claim';
import { theme } from '../../../styles/theme';
import { ErrorCode, ErrorTracker } from '../../../lib/constants/errorCodes';

// Types for page props and metadata
interface PageProps {
  params: {
    claimId: string;
  };
}

// Styled components for enhanced UI
const ClaimContainer = styled.div`
  padding: ${theme.spacing.xl}px;
  background: ${theme.palette.background.paper};
  border-radius: ${theme.shape.clinicalCard}px;
  box-shadow: ${theme.shadows.clinical};

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    padding: ${theme.spacing.md}px;
  }
`;

const ClaimHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.xl}px;
`;

const ClaimTitle = styled.h1`
  ${theme.typography.h2};
  color: ${theme.palette.text.primary};
  margin: 0;
`;

const ClaimInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: ${theme.spacing.xl}px;
  margin: ${theme.spacing.xl}px 0;
`;

const InfoSection = styled.div`
  h3 {
    ${theme.typography.h3};
    color: ${theme.palette.text.secondary};
    margin-bottom: ${theme.spacing.md}px;
  }

  p {
    ${theme.typography.body1};
    color: ${theme.palette.text.primary};
    margin: ${theme.spacing.sm}px 0;
  }
`;

const DocumentList = styled.ul`
  list-style: none;
  padding: 0;
  margin: ${theme.spacing.md}px 0;
`;

const DocumentItem = styled.li`
  display: flex;
  align-items: center;
  padding: ${theme.spacing.sm}px;
  border-radius: ${theme.shape.borderRadius}px;
  background: ${theme.palette.background.default};
  margin-bottom: ${theme.spacing.sm}px;

  &:hover {
    background: ${theme.palette.background.clinical};
  }
`;

// Metadata generator for SEO and security headers
export async function generateMetadata({ params }: PageProps) {
  return {
    title: `Claim Details - ${params.claimId}`,
    description: 'Secure claim information view',
    headers: {
      'Content-Security-Policy': "default-src 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff'
    }
  };
}

// Main claim details page component
export default function ClaimPage({ params }: PageProps) {
  const { claimId } = params;
  const queryClient = useQueryClient();
  const auditLogger = useAuditLogger();
  const [claim, setClaim] = React.useState<IClaim | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Fetch claim data with security context
  useEffect(() => {
    const fetchClaim = async () => {
      try {
        setLoading(true);
        const claimData = await getClaimById(claimId);
        
        // Log successful access
        auditLogger.log({
          action: 'claim_view',
          resourceId: claimId,
          outcome: 'success'
        });

        setClaim(claimData);
      } catch (err) {
        const error = err as Error;
        setError(error);
        
        // Log failed access attempt
        auditLogger.log({
          action: 'claim_view',
          resourceId: claimId,
          outcome: 'failure',
          error: error.message
        });

        ErrorTracker.captureError(error, {
          context: 'Claim details page',
          claimId
        });
      } finally {
        setLoading(false);
      }
    };

    fetchClaim();
  }, [claimId, auditLogger]);

  // Handle loading state
  if (loading) {
    return (
      <ClaimContainer>
        <div role="status" aria-label="Loading claim details">
          Loading...
        </div>
      </ClaimContainer>
    );
  }

  // Handle error state
  if (error) {
    if (error.message.includes('not found')) {
      notFound();
    }
    return (
      <ClaimContainer>
        <div role="alert" aria-label="Error loading claim">
          An error occurred while loading the claim details.
        </div>
      </ClaimContainer>
    );
  }

  // Handle missing claim data
  if (!claim) {
    notFound();
  }

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long'
    }).format(new Date(date));
  };

  return (
    <ClaimContainer>
      <ClaimHeader>
        <ClaimTitle>
          Claim #{claim.claimNumber}
        </ClaimTitle>
      </ClaimHeader>

      <StatusTracker
        claim={claim}
        ariaLabel={`Claim status: ${claim.status}`}
        showLabels
      />

      <ClaimInfo>
        <InfoSection>
          <h3>Claim Details</h3>
          <p>Type: {claim.type}</p>
          <p>Amount: {formatCurrency(claim.amount)}</p>
          <p>Service Date: {formatDate(claim.serviceDate)}</p>
          <p>Submission Date: {formatDate(claim.submissionDate)}</p>
        </InfoSection>

        <InfoSection>
          <h3>Supporting Documents</h3>
          <DocumentList>
            {claim.documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                role="listitem"
                aria-label={`Document: ${doc.title}`}
              >
                {doc.title}
              </DocumentItem>
            ))}
          </DocumentList>
        </InfoSection>
      </ClaimInfo>
    </ClaimContainer>
  );
}