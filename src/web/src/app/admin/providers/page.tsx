'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuditLog } from '@hipaa-tools/audit';
import Table from '../../../components/common/Table';
import Button from '../../../components/common/Button';
import ErrorBoundary from '../../../components/common/ErrorBoundary';
import { AdminAPI } from '../../../lib/api/admin';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../../../lib/utils/analytics';
import { UserRole, UserStatus } from '../../../lib/types/user';

// Provider management interfaces
interface IProvider {
  id: string;
  name: string;
  specialty: string[];
  status: ProviderStatus;
  credentials: string[];
  verificationStatus: string;
  lastVerifiedAt: Date;
  availabilityStatus: string;
}

interface IProviderFilter {
  specialty: string[];
  status: ProviderStatus;
  credentials: string[];
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

enum ProviderStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  SUSPENDED = 'SUSPENDED'
}

// Column definitions for provider table
const providerColumns = [
  {
    id: 'name',
    header: 'Provider Name',
    accessor: 'name',
    sortable: true,
    width: 200,
  },
  {
    id: 'specialty',
    header: 'Specialties',
    accessor: 'specialty',
    render: (value: string[]) => value.join(', '),
    width: 200,
  },
  {
    id: 'credentials',
    header: 'Credentials',
    accessor: 'credentials',
    render: (value: string[]) => value.join(', '),
    width: 150,
  },
  {
    id: 'verificationStatus',
    header: 'Verification',
    accessor: 'verificationStatus',
    render: (value: string) => (
      <span style={{ color: value === 'VERIFIED' ? '#2E7D32' : '#ED6C02' }}>
        {value}
      </span>
    ),
    width: 120,
  },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    render: (value: ProviderStatus) => (
      <span style={{ 
        color: value === ProviderStatus.ACTIVE ? '#2E7D32' : 
               value === ProviderStatus.SUSPENDED ? '#D32F2F' : '#ED6C02' 
      }}>
        {value}
      </span>
    ),
    width: 100,
  },
  {
    id: 'availabilityStatus',
    header: 'Availability',
    accessor: 'availabilityStatus',
    width: 120,
  },
  {
    id: 'lastVerifiedAt',
    header: 'Last Verified',
    accessor: 'lastVerifiedAt',
    render: (value: Date) => new Date(value).toLocaleDateString(),
    sortable: true,
    width: 120,
  }
];

const ProvidersPage: React.FC = () => {
  // State management
  const [filters, setFilters] = useState<IProviderFilter>({
    specialty: [],
    status: ProviderStatus.ACTIVE,
    credentials: [],
    page: 0,
    limit: 10,
    sortBy: 'name',
    sortOrder: 'asc'
  });

  // Audit logging setup
  const { logAudit } = useAuditLog({
    component: 'ProvidersPage',
    level: 'HIPAA'
  });

  // Data fetching with React Query
  const { data, isLoading, error, refetch } = useQuery(
    ['providers', filters],
    () => AdminAPI.getUsers({
      role: UserRole.PROVIDER,
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      permissions: ['PROVIDER_ACCESS']
    }),
    {
      onSuccess: (data) => {
        logAudit('PROVIDER_LIST_ACCESS', {
          action: 'VIEW',
          resourceType: 'PROVIDER_LIST',
          totalRecords: data.total
        });
      },
      onError: (error) => {
        Analytics.trackError(error as Error, {
          component: 'ProvidersPage',
          action: 'FETCH_PROVIDERS',
          filters
        });
      }
    }
  );

  // Handle page changes with audit logging
  const handlePageChange = useCallback((newPage: number) => {
    logAudit('PROVIDER_PAGE_CHANGE', {
      action: 'NAVIGATE',
      fromPage: filters.page,
      toPage: newPage
    });

    setFilters(prev => ({
      ...prev,
      page: newPage
    }));
  }, [filters.page, logAudit]);

  // Handle sort changes with audit logging
  const handleSort = useCallback(({ column, direction }) => {
    logAudit('PROVIDER_SORT_CHANGE', {
      action: 'SORT',
      column,
      direction
    });

    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: direction
    }));
  }, [logAudit]);

  // Track page view
  useEffect(() => {
    Analytics.trackEvent({
      name: 'admin_providers_view',
      category: AnalyticsCategory.USER_INTERACTION,
      properties: {
        filters,
        adminId: JSON.parse(localStorage.getItem('currentUser') || '{}').id
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        userId: JSON.parse(localStorage.getItem('currentUser') || '{}').id,
        ipAddress: window.location.hostname,
        actionType: 'PAGE_VIEW'
      }
    });
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo, context) => {
        Analytics.trackError(error, {
          ...context,
          component: 'ProvidersPage',
          errorInfo
        });
      }}
    >
      <div className="providers-page">
        <div className="providers-header">
          <h1>Healthcare Providers</h1>
          <Button
            variant="primary"
            size="medium"
            onClick={() => {
              logAudit('ADD_PROVIDER_CLICK', {
                action: 'NAVIGATE',
                destination: 'ADD_PROVIDER_FORM'
              });
              // Navigation logic here
            }}
          >
            Add Provider
          </Button>
        </div>

        <Table
          data={data?.users || []}
          columns={providerColumns}
          sortable
          pagination
          loading={isLoading}
          stickyHeader
          ariaLabel="Healthcare Providers Table"
          pageSize={filters.limit}
          onSelectionChange={(selectedRows) => {
            logAudit('PROVIDER_SELECTION_CHANGE', {
              action: 'SELECT',
              selectedCount: selectedRows.length
            });
          }}
          onSort={handleSort}
        />
      </div>
    </ErrorBoundary>
  );
};

export default ProvidersPage;