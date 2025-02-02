/**
 * @fileoverview Enhanced claims list component with security and accessibility features
 * Implements Material Design 3.0 and WCAG 2.1 Level AA standards
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { useA11y } from '@accessibility/react-a11y'; // v2.0.0
import { useAuditLog } from '@hipaa/audit-logger'; // v1.2.0

// Internal imports
import Table from '../common/Table';
import { IClaim, ClaimType, ClaimStatus } from '../../lib/types/claim';
import { useClaims } from '../../hooks/useClaims';
import { theme } from '../../styles/theme';

// Styled components with accessibility enhancements
const ClaimsContainer = styled.section`
  padding: ${theme.spacing(2)}px;
  background: ${theme.palette.background.paper};
  border-radius: ${theme.shape.borderRadius}px;

  @media (prefers-reduced-motion: reduce) {
    * {
      animation: none;
      transition: none;
    }
  }
`;

const StatusBadge = styled.span<{ status: ClaimStatus }>`
  display: inline-flex;
  align-items: center;
  padding: ${theme.spacing(1)}px ${theme.spacing(2)}px;
  border-radius: ${theme.shape.borderRadius}px;
  font-size: ${theme.typography.caption.fontSize};
  font-weight: ${theme.typography.fontWeightMedium};
  color: ${theme.palette.background.paper};
  background: ${({ status }) => {
    switch (status) {
      case ClaimStatus.APPROVED:
        return theme.palette.success.main;
      case ClaimStatus.REJECTED:
        return theme.palette.error.main;
      case ClaimStatus.PENDING_INFO:
        return theme.palette.warning.main;
      default:
        return theme.palette.info.main;
    }
  }};
`;

// Interface for component props
interface ClaimsListProps {
  pageSize?: number;
  onClaimSelect: (claim: IClaim) => void;
  filters?: Record<string, any>;
  accessLevel: string;
}

/**
 * Enhanced claims list component with security and accessibility features
 */
export const ClaimsList: React.FC<ClaimsListProps> = ({
  pageSize = 10,
  onClaimSelect,
  filters,
  accessLevel
}) => {
  // Initialize hooks
  const { claims, loading, error, getClaims } = useClaims({ 
    pageSize,
    complianceLevel: 'strict'
  });
  const { a11yProps } = useA11y();
  const auditLog = useAuditLog('ClaimsList');

  // Format currency with proper accessibility
  const formatCurrency = useCallback((amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }, []);

  // Format date with proper accessibility
  const formatDate = useCallback((date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(date));
  }, []);

  // Define table columns with security and accessibility features
  const columns = useMemo(() => [
    {
      id: 'claimNumber',
      header: 'Claim #',
      accessor: 'claimNumber',
      sortable: true,
      'aria-label': 'Claim number column',
      render: (value: string) => (
        <span role="cell" {...a11yProps}>
          {value}
        </span>
      )
    },
    {
      id: 'type',
      header: 'Type',
      accessor: 'type',
      sortable: true,
      'aria-label': 'Claim type column',
      render: (value: ClaimType) => (
        <span role="cell" {...a11yProps}>
          {value.replace('_', ' ')}
        </span>
      )
    },
    {
      id: 'submissionDate',
      header: 'Submitted',
      accessor: 'submissionDate',
      sortable: true,
      'aria-label': 'Submission date column',
      render: (value: Date) => (
        <span role="cell" {...a11yProps}>
          {formatDate(value)}
        </span>
      )
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      'aria-label': 'Claim amount column',
      render: (value: number) => (
        <span role="cell" {...a11yProps}>
          {formatCurrency(value)}
        </span>
      )
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      'aria-label': 'Claim status column',
      render: (value: ClaimStatus) => (
        <StatusBadge 
          status={value}
          role="status"
          aria-label={`Claim status: ${value.replace('_', ' ').toLowerCase()}`}
        >
          {value.replace('_', ' ')}
        </StatusBadge>
      )
    }
  ], [a11yProps, formatCurrency, formatDate]);

  // Handle secure sorting with audit logging
  const handleSort = useCallback((sortConfig: { column: string; direction: 'asc' | 'desc' }) => {
    auditLog.log('CLAIMS_SORT', {
      columnId: sortConfig.column,
      direction: sortConfig.direction,
      accessLevel
    });
  }, [auditLog, accessLevel]);

  // Handle secure claim selection with audit logging
  const handleClaimSelect = useCallback((selectedRows: Record<string, any>[]) => {
    if (selectedRows.length > 0) {
      const selectedClaim = selectedRows[0] as IClaim;
      auditLog.log('CLAIM_SELECT', {
        claimId: selectedClaim.id,
        accessLevel
      });
      onClaimSelect(selectedClaim);
    }
  }, [onClaimSelect, auditLog, accessLevel]);

  // Fetch claims on mount and when filters change
  useEffect(() => {
    getClaims(filters);
  }, [getClaims, filters]);

  // Error handling with accessibility
  if (error) {
    return (
      <div role="alert" aria-live="assertive">
        <p>Error loading claims: {error.message}</p>
      </div>
    );
  }

  return (
    <ClaimsContainer
      role="region"
      aria-label="Insurance Claims List"
      {...a11yProps}
    >
      <Table
        data={claims}
        columns={columns}
        loading={loading}
        sortable={true}
        selectable={false}
        pagination={true}
        pageSize={pageSize}
        stickyHeader={true}
        ariaLabel="Claims table"
        onSort={handleSort}
        onSelectionChange={handleClaimSelect}
        virtualScroll={true}
      />
    </ClaimsContainer>
  );
};

export default ClaimsList;