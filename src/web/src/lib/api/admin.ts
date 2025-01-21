/**
 * @fileoverview Admin API module for AUSTA SuperApp web client
 * @version 1.0.0
 * @license HIPAA-compliant
 */

import axios from 'axios'; // ^1.4.0
import { IUser, UserRole, UserStatus } from '../types/user';
import { buildUrl } from '../constants/endpoints';
import { Analytics, AnalyticsCategory, PrivacyLevel } from '../utils/analytics';

// Rate limiting configuration for admin endpoints
const RATE_LIMIT_CONFIG = {
  DEFAULT: 100,
  BATCH_OPERATIONS: 20,
  ANALYTICS: 30,
  WINDOW_MS: 60000 // 1 minute
};

// Admin endpoint paths with versioning
const ADMIN_ENDPOINTS = {
  GET_USERS: '/admin/users',
  GET_USER: '/admin/users/:id',
  UPDATE_USER: '/admin/users/:id',
  DELETE_USER: '/admin/users/:id',
  GET_ANALYTICS: '/admin/analytics',
  GET_AUDIT_LOGS: '/admin/audit-logs',
  GET_SYSTEM_HEALTH: '/admin/health',
  UPDATE_SYSTEM_CONFIG: '/admin/config',
  BATCH_UPDATE_USERS: '/admin/users/batch',
  GET_SECURITY_METRICS: '/admin/security/metrics'
} as const;

/**
 * Interface for enhanced user filtering options
 */
export interface IUserFilter {
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  permissions?: string[];
}

/**
 * Interface for analytics query parameters
 */
export interface IAnalyticsParams {
  startDate: Date;
  endDate: Date;
  metrics: string[];
  granularity: 'hour' | 'day' | 'week' | 'month';
  filters: Record<string, any>;
}

/**
 * Admin API namespace providing secure administrative operations
 */
export namespace AdminAPI {
  /**
   * Validates admin permissions for the current user
   * @throws {Error} If user lacks admin privileges
   */
  const validateAdminAccess = (): void => {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser || JSON.parse(currentUser).role !== UserRole.ADMIN) {
      throw new Error('Unauthorized: Admin access required');
    }
  };

  /**
   * Retrieves paginated list of users with enhanced filtering
   * @param filters - User filtering and pagination options
   * @returns Promise with paginated user list and metadata
   */
  export const getUsers = async (
    filters: IUserFilter
  ): Promise<{ users: IUser[]; total: number; metadata: Record<string, any> }> => {
    try {
      validateAdminAccess();

      // Track admin action with audit logging
      await Analytics.trackEvent({
        name: 'admin_get_users',
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
          actionType: 'USER_LIST_ACCESS'
        }
      });

      const queryParams = new URLSearchParams({
        page: filters.page.toString(),
        limit: filters.limit.toString(),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        ...(filters.role && { role: filters.role }),
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search }),
        ...(filters.permissions && { permissions: filters.permissions.join(',') })
      });

      const response = await axios.get(
        `${buildUrl(ADMIN_ENDPOINTS.GET_USERS)}?${queryParams}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          },
          timeout: 10000
        }
      );

      return {
        users: response.data.users,
        total: response.data.total,
        metadata: response.data.metadata
      };
    } catch (error) {
      await Analytics.trackError(error as Error, {
        operation: 'getUsers',
        filters
      });
      throw error;
    }
  };

  /**
   * Retrieves system analytics data with security validation
   * @param params - Analytics query parameters
   * @returns Promise with analytics data
   */
  export const getAnalytics = async (
    params: IAnalyticsParams
  ): Promise<Record<string, any>> => {
    try {
      validateAdminAccess();

      await Analytics.trackEvent({
        name: 'admin_get_analytics',
        category: AnalyticsCategory.BUSINESS_METRICS,
        properties: {
          params,
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
          actionType: 'ANALYTICS_ACCESS'
        }
      });

      const response = await axios.post(
        buildUrl(ADMIN_ENDPOINTS.GET_ANALYTICS),
        params,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error) {
      await Analytics.trackError(error as Error, {
        operation: 'getAnalytics',
        params
      });
      throw error;
    }
  };

  /**
   * Retrieves system audit logs with enhanced filtering
   * @param startDate - Start date for audit log retrieval
   * @param endDate - End date for audit log retrieval
   * @param filters - Additional filtering options
   * @returns Promise with audit log entries
   */
  export const getAuditLogs = async (
    startDate: Date,
    endDate: Date,
    filters?: Record<string, any>
  ): Promise<Array<Record<string, any>>> => {
    try {
      validateAdminAccess();

      await Analytics.trackEvent({
        name: 'admin_get_audit_logs',
        category: AnalyticsCategory.SECURITY,
        properties: {
          startDate,
          endDate,
          filters,
          adminId: JSON.parse(localStorage.getItem('currentUser') || '{}').id
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: PrivacyLevel.SENSITIVE,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: JSON.parse(localStorage.getItem('currentUser') || '{}').id,
          ipAddress: window.location.hostname,
          actionType: 'AUDIT_LOG_ACCESS'
        }
      });

      const response = await axios.post(
        buildUrl(ADMIN_ENDPOINTS.GET_AUDIT_LOGS),
        {
          startDate,
          endDate,
          filters
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          },
          timeout: 20000
        }
      );

      return response.data;
    } catch (error) {
      await Analytics.trackError(error as Error, {
        operation: 'getAuditLogs',
        startDate,
        endDate,
        filters
      });
      throw error;
    }
  };
}

export default AdminAPI;