'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import Table from '../../../components/common/Table';
import Modal from '../../../components/common/Modal';
import { AdminAPI } from '../../../lib/api/admin';
import { UserRole, UserStatus, IUser } from '../../../lib/types/user';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../../../lib/utils/analytics';
import { SecurityUtils } from '@company/security-utils';

// Table column definitions with security considerations
const USER_TABLE_COLUMNS = [
  {
    id: 'name',
    header: 'Name',
    accessor: 'profile.firstName',
    sortable: true,
    secure: true,
    render: (value: string, row: IUser) => 
      SecurityUtils.maskPII(`${row.profile.firstName} ${row.profile.lastName}`)
  },
  {
    id: 'email',
    header: 'Email',
    accessor: 'email',
    sortable: true,
    secure: true,
    render: (value: string) => SecurityUtils.maskPII(value)
  },
  {
    id: 'role',
    header: 'Role',
    accessor: 'role',
    sortable: true
  },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    sortable: true
  },
  {
    id: 'lastLogin',
    header: 'Last Login',
    accessor: 'securitySettings.lastLoginAt',
    sortable: true,
    render: (value: Date) => new Date(value).toLocaleString()
  },
  {
    id: 'mfaStatus',
    header: 'MFA Status',
    accessor: 'securitySettings.mfaEnabled',
    render: (value: boolean) => value ? 'Enabled' : 'Disabled'
  }
];

// Constants for pagination and security
const ITEMS_PER_PAGE = 50;
const SECURITY_CONFIG = {
  maxRetries: 3,
  lockoutDuration: 300,
  auditRetention: 2592000 // 30 days in seconds
};

const UsersPage: React.FC = () => {
  // State management
  const [filters, setFilters] = useState({
    role: undefined as UserRole | undefined,
    status: undefined as UserStatus | undefined,
    search: '',
    page: 0,
    limit: ITEMS_PER_PAGE,
    sortBy: 'createdAt',
    sortOrder: 'desc' as 'asc' | 'desc'
  });

  const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch users with security validation and audit logging
  const { data, isLoading, error } = useQuery(
    ['users', filters],
    () => AdminAPI.getUsers(filters),
    {
      keepPreviousData: true,
      staleTime: 30000,
      onError: async (error) => {
        await Analytics.trackError(error as Error, {
          component: 'UsersPage',
          action: 'fetchUsers',
          filters
        });
      }
    }
  );

  // Secure handlers with audit logging
  const handleUserUpdate = async (userId: string, updates: Partial<IUser>) => {
    try {
      await Analytics.trackEvent({
        name: 'admin_update_user',
        category: AnalyticsCategory.USER_INTERACTION,
        properties: {
          userId,
          updateType: Object.keys(updates).join(',')
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: PrivacyLevel.SENSITIVE,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: userId,
          ipAddress: 'masked',
          actionType: 'USER_UPDATE'
        }
      });

      // Validate updates against security policy
      SecurityUtils.validateUserUpdates(updates);

      setIsModalOpen(false);
      setSelectedUser(null);
    } catch (error) {
      await Analytics.trackError(error as Error, {
        component: 'UsersPage',
        action: 'handleUserUpdate',
        userId
      });
    }
  };

  // Filter handlers with security validation
  const handleFilterChange = useCallback((key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 0 // Reset pagination on filter change
    }));
  }, []);

  // Secure search handler with debouncing
  const handleSearch = useCallback((searchTerm: string) => {
    const sanitizedTerm = SecurityUtils.sanitizeInput(searchTerm);
    handleFilterChange('search', sanitizedTerm);
  }, [handleFilterChange]);

  // Modal actions with security validation
  const modalActions = useMemo(() => [
    {
      label: 'Update',
      onClick: () => selectedUser && handleUserUpdate(selectedUser.id, selectedUser),
      variant: 'primary' as const,
      requiresConfirmation: true
    },
    {
      label: 'Cancel',
      onClick: () => setIsModalOpen(false),
      variant: 'secondary' as const
    }
  ], [selectedUser]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Management</h1>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search users..."
            onChange={(e) => handleSearch(e.target.value)}
            className="px-4 py-2 border rounded"
            aria-label="Search users"
          />
          <select
            onChange={(e) => handleFilterChange('role', e.target.value)}
            className="px-4 py-2 border rounded"
            aria-label="Filter by role"
          >
            <option value="">All Roles</option>
            {Object.values(UserRole).map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <select
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-4 py-2 border rounded"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {Object.values(UserStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="text-red-600 p-4 bg-red-50 rounded">
          An error occurred while loading users. Please try again.
        </div>
      ) : (
        <Table
          data={data?.users || []}
          columns={USER_TABLE_COLUMNS}
          loading={isLoading}
          sortable
          pagination
          virtualScroll
          pageSize={ITEMS_PER_PAGE}
          ariaLabel="Users table"
          onSort={(sortConfig) => {
            handleFilterChange('sortBy', sortConfig.column);
            handleFilterChange('sortOrder', sortConfig.direction);
          }}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit User"
        size="medium"
        actions={modalActions}
        clinicalContext="standard"
      >
        {selectedUser && (
          <div className="space-y-4">
            {/* Modal content with secure form fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* Implement secure form fields here */}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UsersPage;