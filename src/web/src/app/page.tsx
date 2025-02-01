'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Grid, Container, Typography, ThemeProvider } from '@mui/material';
import { Analytics } from '@vercel/analytics';

// Internal imports
import Header from '../components/layout/Header';
import HealthMetrics from '../components/dashboard/HealthMetrics';
import QuickActions from '../components/dashboard/QuickActions';
import ErrorBoundary from '../components/common/ErrorBoundary';
import useAuth from '../hooks/useAuth';
import theme from '../styles/theme';
import { UserRole } from '../lib/types/user';
import { SecurityClassification } from '../lib/types/healthRecord';

// Constants
const REFRESH_INTERVAL = 30000; // 30 seconds
const MOBILE_BREAKPOINT = 768;
const ANALYTICS_KEY = process.env.NEXT_PUBLIC_ANALYTICS_KEY;
const ERROR_BOUNDARY_CONFIG = { maxRetries: 3, fallbackUI: true };

/**
 * Enhanced security check for authentication and role validation
 */
const checkAuth = () => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.state || auth.state === 'UNAUTHENTICATED') {
      router.push('/auth/login');
      return;
    }

    // Track secure page view
    Analytics.track('page_view', {
      page: 'dashboard',
      userRole: auth.user?.role,
      timestamp: Date.now(),
      isAuthenticated: true
    });
  }, [auth.state, auth.user?.role, router]);

  return { user: auth.user, userRole: auth.user?.role };
};

/**
 * Main landing page component with role-based content and security features
 */
const HomePage = () => {
  const { user, userRole } = checkAuth();
  const router = useRouter();

  // Security context for components
  const securityContext = {
    sessionId: user?.id || '',
    authToken: user?.securitySettings?.lastLoginAt.toString() || '',
    ipAddress: 'masked',
    deviceId: user?.securitySettings?.deviceTrust?.[0]?.deviceId || ''
  };

  // Handle component errors with audit logging
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    Analytics.track('error_boundary_triggered', {
      error: error.message,
      component: 'HomePage',
      userRole,
      timestamp: Date.now()
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <ErrorBoundary
        onError={handleError}
        retryAttempts={ERROR_BOUNDARY_CONFIG.maxRetries}
      >
        <Container maxWidth="xl" role="main">
          <Header 
            transparent={false}
            clinicalEnvironment="STANDARD"
          />

          <Grid 
            container 
            spacing={3} 
            sx={{ mt: 3 }}
            role="region"
            aria-label="Dashboard content"
          >
            {/* Welcome Section */}
            <Grid item xs={12}>
              <Typography 
                variant="h1" 
                component="h1"
                gutterBottom
                aria-label="Welcome message"
              >
                Welcome, {user?.profile.firstName}
              </Typography>
            </Grid>

            {/* Quick Actions Section */}
            <Grid item xs={12}>
              <Suspense fallback={<div>Loading actions...</div>}>
                <QuickActions
                  userRole={userRole as UserRole}
                  securityContext={securityContext}
                />
              </Suspense>
            </Grid>

            {/* Health Metrics Section - Only for patients and providers */}
            {(userRole === UserRole.PATIENT || userRole === UserRole.PROVIDER) && (
              <Grid item xs={12}>
                <Suspense fallback={<div>Loading health metrics...</div>}>
                  <HealthMetrics
                    patientId={user?.id || ''}
                    refreshInterval={REFRESH_INTERVAL}
                    showHistory={true}
                    encryptionKey={user?.securitySettings?.lastLoginAt.toString() || ''}
                    accessLevel="read"
                    theme="light"
                  />
                </Suspense>
              </Grid>
            )}

            {/* Role-specific Content */}
            <Grid item xs={12}>
              {userRole === UserRole.ADMIN && (
                <Typography variant="h2" component="h2">
                  System Overview
                </Typography>
              )}
              {userRole === UserRole.INSURANCE && (
                <Typography variant="h2" component="h2">
                  Claims Dashboard
                </Typography>
              )}
            </Grid>
          </Grid>
        </Container>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default HomePage;