```

2. Second error is about invalid AccessLevel value:
```
error TS2322: Type '"read"' is not assignable to type 'AccessLevel'.
```

3. Third error is about invalid ThemePreference value:
```
error TS2322: Type '"light"' is not assignable to type 'ThemePreference'.
```

Let me regenerate the file with these fixes:

# src/web/src/app/admin/dashboard/page.tsx
```typescript
'use client';

import React, { useEffect, useCallback, useState, memo } from 'react';
import { 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  Skeleton, 
  Alert,
  useTheme
} from '@mui/material';
import { 
  BarChart, 
  LineChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import AdminLayout from '../../../components/layout/AdminLayout';
import HealthMetrics from '../../../components/dashboard/HealthMetrics';
import { useAnalytics } from '../../../hooks/useAnalytics';
import { UserRole } from '../../../lib/types/user';
import { SecurityClassification } from '../../../lib/types/healthRecord';

// Constants
const REFRESH_INTERVAL = 30000; // 30 seconds
const METRIC_THRESHOLDS = {
  userGrowth: 50,
  retention: 80,
  nps: 50,
  availability: 99.99,
  responseTime: 500,
  securityEvents: 0
};

// Interfaces
interface MetricCardProps {
  title: string;
  value: number;
  trend: number[];
  target: number;
  loading: boolean;
  error: string | null;
  ariaLabel: string;
}

// MetricCard Component
const MetricCard = memo(({ 
  title, 
  value, 
  trend, 
  target, 
  loading, 
  error,
  ariaLabel 
}: MetricCardProps) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rectangular" height={200} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const isOnTarget = value >= target;

  return (
    <Card>
      <CardContent>
        <Typography 
          variant="h6" 
          gutterBottom
          aria-label={ariaLabel}
        >
          {title}
        </Typography>
        <Typography 
          variant="h4" 
          color={isOnTarget ? 'success.main' : 'error.main'}
          aria-live="polite"
        >
          {value}
          <Typography variant="caption" color="textSecondary">
            /{target} target
          </Typography>
        </Typography>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={trend.map((value, index) => ({ value, index }))}>
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={theme.palette.primary.main} 
              strokeWidth={2}
            />
            <XAxis hide />
            <YAxis hide />
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

MetricCard.displayName = 'MetricCard';

// Admin Dashboard Page Component
const AdminDashboardPage = () => {
  const [metrics, setMetrics] = useState<{
    userGrowth: { value: number; trend: number[]; loading: boolean; error: null | string };
    retention: { value: number; trend: number[]; loading: boolean; error: null | string };
    nps: { value: number; trend: number[]; loading: boolean; error: null | string };
    availability: { value: number; trend: number[]; loading: boolean; error: null | string };
    responseTime: { value: number; trend: number[]; loading: boolean; error: null | string };
    securityEvents: { value: number; trend: number[]; loading: boolean; error: null | string };
  }>({
    userGrowth: { value: 0, trend: [], loading: true, error: null },
    retention: { value: 0, trend: [], loading: true, error: null },
    nps: { value: 0, trend: [], loading: true, error: null },
    availability: { value: 0, trend: [], loading: true, error: null },
    responseTime: { value: 0, trend: [], loading: true, error: null },
    securityEvents: { value: 0, trend: [], loading: true, error: null }
  });

  const { logEvent, logPerformance, logError } = useAnalytics();

  // Fetch metrics with error handling
  const fetchMetrics = useCallback(async () => {
    try {
      // Log performance start
      const startTime = performance.now();

      // Simulate API calls (replace with actual API calls)
      const newMetrics = {
        userGrowth: { value: 55, trend: [40, 45, 50, 55], loading: false, error: null },
        retention: { value: 85, trend: [75, 78, 82, 85], loading: false, error: null },
        nps: { value: 52, trend: [45, 48, 50, 52], loading: false, error: null },
        availability: { value: 99.99, trend: [99.95, 99.97, 99.98, 99.99], loading: false, error: null },
        responseTime: { value: 450, trend: [480, 470, 460, 450], loading: false, error: null },
        securityEvents: { value: 0, trend: [2, 1, 0, 0], loading: false, error: null }
      };

      setMetrics(newMetrics);

      // Log performance completion
      logPerformance({
        name: 'metrics_refresh',
        value: performance.now() - startTime,
        tags: { component: 'AdminDashboard' },
        timestamp: Date.now(),
        context: { page: 'admin_dashboard' }
      });

      // Log successful metrics update
      logEvent({
        name: 'metrics_updated',
        category: 'SYSTEM_PERFORMANCE',
        properties: {
          metrics: Object.keys(newMetrics)
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'INTERNAL',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: 'admin',
          ipAddress: '[REDACTED]',
          actionType: 'METRICS_UPDATE'
        }
      });

    } catch (error) {
      logError(error as Error, {
        component: 'AdminDashboard',
        action: 'fetchMetrics'
      }, 'INTERNAL');

      setMetrics(prev => ({
        ...prev,
        ...Object.keys(prev).reduce((acc, key) => ({
          ...acc,
          [key]: {
            ...prev[key as keyof typeof prev],
            loading: false,
            error: 'Failed to fetch metrics'
          }
        }), {})
      }));
    }
  }, [logEvent, logPerformance, logError]);

  // Setup metrics refresh interval
  useEffect(() => {
    fetchMetrics();
    const intervalId = setInterval(fetchMetrics, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchMetrics]);

  return (
    <AdminLayout>
      <ErrorBoundary
        fallback={
          <Alert severity="error">
            An error occurred while loading the dashboard.
          </Alert>
        }
        onError={(error) => {
          logError(error, {
            component: 'AdminDashboard',
            severity: 'HIGH'
          }, 'INTERNAL');
        }}
      >
        <Grid container spacing={3}>
          {/* User Growth Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Monthly Active User Growth"
              value={metrics.userGrowth.value}
              trend={metrics.userGrowth.trend}
              target={METRIC_THRESHOLDS.userGrowth}
              loading={metrics.userGrowth.loading}
              error={metrics.userGrowth.error}
              ariaLabel="Monthly active user growth metric"
            />
          </Grid>

          {/* Retention Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="User Retention Rate"
              value={metrics.retention.value}
              trend={metrics.retention.trend}
              target={METRIC_THRESHOLDS.retention}
              loading={metrics.retention.loading}
              error={metrics.retention.error}
              ariaLabel="User retention rate metric"
            />
          </Grid>

          {/* NPS Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Net Promoter Score"
              value={metrics.nps.value}
              trend={metrics.nps.trend}
              target={METRIC_THRESHOLDS.nps}
              loading={metrics.nps.loading}
              error={metrics.nps.error}
              ariaLabel="Net promoter score metric"
            />
          </Grid>

          {/* System Health Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Platform Availability"
              value={metrics.availability.value}
              trend={metrics.availability.trend}
              target={METRIC_THRESHOLDS.availability}
              loading={metrics.availability.loading}
              error={metrics.availability.error}
              ariaLabel="Platform availability metric"
            />
          </Grid>

          {/* Response Time Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Average Response Time (ms)"
              value={metrics.responseTime.value}
              trend={metrics.responseTime.trend}
              target={METRIC_THRESHOLDS.responseTime}
              loading={metrics.responseTime.loading}
              error={metrics.responseTime.error}
              ariaLabel="Average response time metric"
            />
          </Grid>

          {/* Security Metrics */}
          <Grid item xs={12} md={4}>
            <MetricCard
              title="Security Incidents"
              value={metrics.securityEvents.value}
              trend={metrics.securityEvents.trend}
              target={METRIC_THRESHOLDS.securityEvents}
              loading={metrics.securityEvents.loading}
              error={metrics.securityEvents.error}
              ariaLabel="Security incidents metric"
            />
          </Grid>

          {/* Health Metrics Component */}
          <Grid item xs={12}>
            <HealthMetrics
              patientId="system"
              refreshInterval={REFRESH_INTERVAL}
              showHistory={true}
              encryptionKey={process.env.NEXT_PUBLIC_ENCRYPTION_KEY || ''}
              accessLevel={AccessLevel.ADMIN}
              theme={ThemePreference.LIGHT}
            />
          </Grid>
        </Grid>
      </ErrorBoundary>
    </AdminLayout>
  );
};

export default AdminDashboardPage;