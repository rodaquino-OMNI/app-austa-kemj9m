import React, { useMemo } from 'react';
import styled from '@emotion/styled';
import { ClaimStatus, IClaim } from '../../lib/types/claim';
import Loader from '../common/Loader';
import theme from '../../styles/theme';

// Status step order and labels for consistent progression tracking
const STATUS_STEPS = [
  { status: ClaimStatus.SUBMITTED, label: 'Submitted', order: 1 },
  { status: ClaimStatus.UNDER_REVIEW, label: 'Under Review', order: 2 },
  { status: ClaimStatus.PENDING_INFO, label: 'Additional Info Required', order: 3 },
  { status: ClaimStatus.APPROVED, label: 'Approved', order: 4 },
  { status: ClaimStatus.REJECTED, label: 'Rejected', order: 4 }
] as const;

interface StatusTrackerProps {
  claim: IClaim;
  loading?: boolean;
  className?: string;
  ariaLabel?: string;
  showLabels?: boolean;
}

// Styled container with responsive grid layout
const TrackerContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: ${theme.spacing.md}px;
  padding: ${theme.spacing.md}px;
  background: ${theme.palette.background.paper};
  border-radius: ${theme.shape.clinicalCard}px;
  box-shadow: ${theme.shadows.clinical};
  position: relative;

  @media (max-width: ${theme.breakpoints.values.sm}px) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm}px;
  }
`;

// Styled step component with accessibility and animations
const StatusStep = styled.div<{
  active: boolean;
  completed: boolean;
  color: string;
}>`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: ${theme.spacing.sm}px;
  
  &::before {
    content: '';
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${({ active, completed, color }) =>
      active || completed ? color : theme.palette.background.default};
    border: 2px solid ${({ color }) => color};
    transition: all 0.3s ease;
    
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &::after {
    content: '';
    position: absolute;
    top: 12px;
    left: 50%;
    width: 100%;
    height: 2px;
    background-color: ${({ completed, color }) =>
      completed ? color : theme.palette.text.disabled};
    transition: background-color 0.3s ease;
    
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &:last-child::after {
    display: none;
  }
`;

// Styled status label with accessibility considerations
const StatusLabel = styled.span<{ active: boolean }>`
  margin-top: ${theme.spacing.sm}px;
  color: ${({ active }) =>
    active ? theme.palette.text.primary : theme.palette.text.secondary};
  font-size: ${theme.typography.body2.fontSize};
  font-weight: ${({ active }) =>
    active ? theme.typography.fontWeightMedium : theme.typography.fontWeightRegular};
  text-align: center;
  transition: color 0.3s ease;
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StatusTracker: React.FC<StatusTrackerProps> = ({
  claim,
  loading = false,
  className,
  ariaLabel = 'Claim Status Progress',
  showLabels = true
}) => {
  // Get status color based on current status
  const getStatusColor = (status: ClaimStatus): string => {
    switch (status) {
      case ClaimStatus.APPROVED:
        return theme.palette.success.main;
      case ClaimStatus.REJECTED:
        return theme.palette.error.main;
      default:
        return theme.palette.primary.main;
    }
  };

  // Determine if a step is completed based on status order
  const isStepComplete = (stepStatus: ClaimStatus, currentStatus: ClaimStatus): boolean => {
    const currentStep = STATUS_STEPS.find(s => s.status === currentStatus);
    const step = STATUS_STEPS.find(s => s.status === stepStatus);
    
    if (!currentStep || !step) return false;
    
    // Special handling for rejected status
    if (currentStatus === ClaimStatus.REJECTED) {
      return step.order < currentStep.order;
    }
    
    return step.order <= currentStep.order;
  };

  // Memoize status steps to prevent unnecessary recalculations
  const statusSteps = useMemo(() => {
    return STATUS_STEPS.filter(step => 
      // Don't show rejected step if approved, and vice versa
      !(claim.status === ClaimStatus.APPROVED && step.status === ClaimStatus.REJECTED) &&
      !(claim.status === ClaimStatus.REJECTED && step.status === ClaimStatus.APPROVED)
    );
  }, [claim.status]);

  if (loading) {
    return (
      <TrackerContainer className={className}>
        <Loader size="medium" color="primary" />
      </TrackerContainer>
    );
  }

  return (
    <TrackerContainer
      className={className}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={1}
      aria-valuemax={statusSteps.length}
      aria-valuenow={statusSteps.findIndex(step => step.status === claim.status) + 1}
    >
      {statusSteps.map((step, index) => {
        const isActive = step.status === claim.status;
        const isCompleted = isStepComplete(step.status, claim.status);
        const statusColor = getStatusColor(claim.status);

        return (
          <StatusStep
            key={step.status}
            active={isActive}
            completed={isCompleted}
            color={statusColor}
            aria-current={isActive ? 'step' : undefined}
          >
            {showLabels && (
              <StatusLabel
                active={isActive}
                aria-hidden={!isActive}
              >
                {step.label}
              </StatusLabel>
            )}
          </StatusStep>
        );
      })}
    </TrackerContainer>
  );
};

export default React.memo(StatusTracker);