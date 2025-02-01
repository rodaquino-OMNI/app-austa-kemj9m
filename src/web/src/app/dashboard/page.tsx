'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Grid, Container, Typography, Skeleton } from '@mui/material'; // v5.0.0
import { useRBAC } from '@auth/rbac'; // v1.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0

// Internal components
import HealthMetrics from '../../components/dashboard/HealthMetrics';
import AppointmentCard from '../../components/dashboard/AppointmentCard';
import QuickActions from '../../components/dashboard/QuickActions';

// Hooks
import useAuth from '../../hooks/useAuth';
import useAnalytics from '../../hooks/useAnalytics';

// Types
import { HealthRecordType, SecurityClassification } from '../../lib/types/healthRecord';
import { IConsultation } from '../../lib/types/consultation';
import { UserRole } from '../../lib/types/user';
import { AnalyticsCategory, PrivacyLevel } from '../lib/utils/analytics';

// Constants for refresh intervals and security
const METRICS_REFRESH_INTERVAL = 30000; // 30 seconds
const APPOINTMENTS_REFRESH_INTERVAL = 60000; // 1 minute
const MAX_APPOINTMENTS_DISPLAY = 3;

/**
 * Error Fallback component for graceful error handling
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <Container>
    <Typography variant="h6" color="error" role="alert">
      An error occurred while loading the dashboard. Please try refreshing the page.
    </Typography>
  </Container>
);

/**
 * Main Dashboard Page Component
 * Implements HIPAA-compliant interface with role-based access control
 */
const DashboardPage: React.FC = () => {
  // Authentication and security hooks
  const { user, tokens } = useAuth();
  const { hasPermission } = useRBAC();
  const { logEvent, logError } = useAnalytics();

  // Component state
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<IConsultation[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Security context for analytics and audit logging
  const securityContext = {
    sessionId: tokens?.accessToken || '',
    authToken: tokens?.accessToken || '',
    ipAddress: '[REDACTED]',
    deviceId: window.navigator.userAgent
  };

  /**
   * Handles secure data refresh with error boundary
   */
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshKey(prev => prev + 1);
      
      await logEvent({
        name: 'dashboard_refresh',
        category: AnalyticsCategory.USER_INTERACTION,
        properties: {
          userId: user?.id,
          timestamp: Date.now()
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: PrivacyLevel.INTERNAL,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: user?.id || 'anonymous',
          ipAddress: '[REDACTED]',
          actionType: 'dashboard_refresh'
        }
      });
    } catch (error) {
      await logError(error as Error, {
        context: 'dashboard_refresh',
        userId: user?.id
      }, PrivacyLevel.INTERNAL);
    }
  }, [user, logEvent, logError]);

  // Setup automatic refresh intervals
  useEffect(() => {
    const metricsInterval = setInterval(handleRefresh, METRICS_REFRESH_INTERVAL);
    const appointmentsInterval = setInterval(handleRefresh, APPOINTMENTS_REFRESH_INTERVAL);

    return () => {
      clearInterval(metricsInterval);
      clearInterval(appointmentsInterval);
    };
  }, [handleRefresh]);

  // Track initial dashboard load
  useEffect(() => {
    const trackPageView = async () => {
      try {
        await logEvent({
          name: 'dashboard_view',
          category: AnalyticsCategory.BUSINESS_METRICS,
          properties: {
            userId: user?.id,
            userRole: user?.role,
            timestamp: Date.now()
          },
          timestamp: Date.now(),
          userConsent: true,
          privacyLevel: PrivacyLevel.INTERNAL,
          auditInfo: {
            eventId: crypto.randomUUID(),
            timestamp: Date.now(),
            userId: user?.id || 'anonymous',
            ipAddress: '[REDACTED]',
            actionType: 'page_view'
          }
        });
        setLoading(false);
      } catch (error) {
        await logError(error as Error, {
          context: 'dashboard_view',
          userId: user?.id
        }, PrivacyLevel.INTERNAL);
      }
    };

    trackPageView();
  }, [user, logEvent, logError]);

  if (!user) {
    return (
      <Container>
        <Typography variant="h6" color="error" role="alert">
          Authentication required to access dashboard
        </Typography>
      </Container>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Container maxWidth="xl" component="main">
        <Grid container spacing={3}>
          {/* Health Metrics Section */}
          {hasPermission('view_health_metrics') && (
            <Grid item xs={12}>
              {loading ? (
                <Skeleton variant="rectangular" height={200} />
              ) : (
                <HealthMetrics
                  patientId={user.id}
                  refreshInterval={METRICS_REFRESH_INTERVAL}
                  showHistory={true}
                  encryptionKey={tokens?.accessToken || ''}
                  accessLevel={AccessLevel.READ}
                  theme={ThemePreference.LIGHT}
                />
              )}
            </Grid>
          )}

          {/* Quick Actions Section */}
          <Grid item xs={12}>
            {loading ? (
              <Skeleton variant="rectangular" height={100} />
            ) : (
              <QuickActions
                userRole={user.role as UserRole}
                securityContext={securityContext}
              />
            )}
          </Grid>

          {/* Appointments Section */}
          {hasPermission('view_appointments') && (
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Upcoming Appointments
              </Typography>
              <Grid container spacing={2}>
                {loading ? (
                  Array.from(Array(3)).map((_, index) => (
                    <Grid item xs={12} md={4} key={index}>
                      <Skeleton variant="rectangular" height={200} />
                    </Grid>
                  ))
                ) : (
                  appointments
                    .slice(0, MAX_APPOINTMENTS_DISPLAY)
                    .map(appointment => (
                      <Grid item xs={12} md={4} key={appointment.id}>
                        <AppointmentCard
                          appointment={appointment}
                          providerId={appointment.providerId}
                          onJoin={async () => {/* Implement join handler */}}
                          onCancel={async () => {/* Implement cancel handler */}}
                          onReschedule={async () => {/* Implement reschedule handler */}}
                          connectionConfig={{
                            minQuality: ConnectionQuality.FAIR,
                            checkInterval: 10000
                          }}
                        />
                      </Grid>
                    ))
                )}
              </Grid>
            </Grid>
          )}
        </Grid>
      </Container>
    </ErrorBoundary>
  );
};

/**
 * Generate secure metadata for the dashboard page
 */
export async function generateMetadata() {
  return {
    title: 'Dashboard | AUSTA SuperApp',
    description: 'Secure healthcare dashboard with real-time monitoring',
    robots: 'noindex, nofollow',
    headers: {
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    }
  };
}

export default DashboardPage;