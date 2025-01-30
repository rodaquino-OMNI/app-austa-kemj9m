/**
 * @fileoverview Health metrics dashboard component with FHIR R4 compliance and accessibility
 * Displays real-time vital signs and wearable data with secure PHI handling
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Skeleton, 
  Alert 
} from '@mui/material'; // v5.0.0
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts'; // v2.0.0
import { debounce } from 'lodash'; // v4.17.21
import { FHIRValidator } from '@fhir/validator'; // v2.0.0
import { useSecureData } from '@health/secure-data'; // v1.0.0

import { useHealthRecords } from '../../hooks/useHealthRecords';
import { HealthRecordType, SecurityClassification } from '../../lib/types/healthRecord';

// Constants for metrics display and validation
const REFRESH_INTERVAL = 5000; // 5 seconds
const CHART_HEIGHT = 200;
const DEBOUNCE_DELAY = 300;

interface HealthMetricsProps {
  patientId: string;
  refreshInterval?: number;
  showHistory?: boolean;
  encryptionKey: string;
  accessLevel: AccessLevel;
  theme: ThemePreference;
}

interface MetricCardProps {
  title: string;
  value: number;
  unit: string;
  history: Array<{ timestamp: Date; value: number }>;
  isNormal: boolean;
  ariaLabel: string;
  thresholds: MetricThresholds;
  trend: TrendDirection;
  showHistory?: boolean;
}

interface MetricThresholds {
  low: number;
  high: number;
  critical: number;
}

enum TrendDirection {
  UP = 'up',
  DOWN = 'down',
  STABLE = 'stable'
}

enum AccessLevel {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin'
}

enum ThemePreference {
  LIGHT = 'light',
  DARK = 'dark',
  HIGH_CONTRAST = 'high-contrast'
}

/**
 * Health metrics dashboard component with real-time updates and FHIR compliance
 */
const HealthMetrics: React.FC<HealthMetricsProps> = ({
  patientId,
  refreshInterval = REFRESH_INTERVAL,
  showHistory = true,
  encryptionKey,
  accessLevel,
  theme
}) => {
  // Initialize hooks for health records and secure data handling
  const { 
    records, 
    loading, 
    error,
    fetchRecords 
  } = useHealthRecords(patientId, {
    autoFetch: true,
    enableRealTimeSync: true,
    recordTypes: [HealthRecordType.VITAL_SIGNS, HealthRecordType.WEARABLE_DATA]
  });

  const { decryptData, validateAccess } = useSecureData({
    encryptionKey,
    securityLevel: SecurityClassification.HIGHLY_CONFIDENTIAL
  });

  // Memoized metrics processing with FHIR validation
  const processedMetrics = useMemo(() => {
    if (!records?.length) return null;

    const validator = new FHIRValidator();
    return records
      .filter(record => validator.validateResource(record))
      .map(record => ({
        ...decryptData(record.content),
        timestamp: new Date(record.date)
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [records, decryptData]);

  // Debounced refresh function
  const debouncedRefresh = useCallback(
    debounce(() => {
      if (validateAccess(accessLevel)) {
        fetchRecords();
      }
    }, DEBOUNCE_DELAY),
    [fetchRecords, validateAccess, accessLevel]
  );

  // Setup refresh interval
  useEffect(() => {
    const intervalId = setInterval(debouncedRefresh, refreshInterval);
    return () => {
      clearInterval(intervalId);
      debouncedRefresh.cancel();
    };
  }, [debouncedRefresh, refreshInterval]);

  // Render loading state
  if (loading) {
    return (
      <Grid container spacing={2} role="region" aria-label="Loading health metrics">
        {[1, 2, 3, 4].map(index => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="rectangular" height={CHART_HEIGHT} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert 
        severity="error" 
        role="alert"
        aria-live="assertive"
      >
        {error.message}
      </Alert>
    );
  }

  // Render metrics dashboard
  return (
    <Grid 
      container 
      spacing={2} 
      role="region" 
      aria-label="Health metrics dashboard"
    >
      <MetricCard
        title="Heart Rate"
        value={processedMetrics?.[0]?.heartRate ?? 0}
        unit="bpm"
        history={processedMetrics?.map(m => ({
          timestamp: m.timestamp,
          value: m.heartRate
        })) ?? []}
        isNormal={true}
        ariaLabel="Current heart rate measurement"
        thresholds={{ low: 60, high: 100, critical: 120 }}
        trend={TrendDirection.STABLE}
        showHistory={showHistory}
      />

      <MetricCard
        title="Blood Pressure"
        value={processedMetrics?.[0]?.bloodPressure?.systolic ?? 0}
        unit="mmHg"
        history={processedMetrics?.map(m => ({
          timestamp: m.timestamp,
          value: m.bloodPressure?.systolic
        })) ?? []}
        isNormal={true}
        ariaLabel="Current blood pressure measurement"
        thresholds={{ low: 90, high: 140, critical: 180 }}
        trend={TrendDirection.UP}
        showHistory={showHistory}
      />

      {/* Additional metric cards... */}
    </Grid>
  );
};

/**
 * Individual metric card component with accessibility support
 */
const MetricCard: React.FC<MetricCardProps> = React.memo(({
  title,
  value,
  unit,
  history,
  isNormal,
  ariaLabel,
  thresholds,
  trend,
  showHistory
}) => {
  const chartData = useMemo(() => 
    history.map(point => ({
      time: point.timestamp.toLocaleTimeString(),
      value: point.value
    })),
    [history]
  );

  return (
    <Grid item xs={12} sm={6} md={3}>
      <Card 
        role="article"
        aria-label={ariaLabel}
        sx={{ height: '100%' }}
      >
        <CardContent>
          <Typography 
            variant="h6" 
            component="h3"
            gutterBottom
          >
            {title}
          </Typography>
          
          <Typography 
            variant="h4" 
            component="div"
            color={isNormal ? 'textPrimary' : 'error'}
            aria-live="polite"
          >
            {value} {unit}
          </Typography>

          {showHistory && (
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={chartData}>
                <XAxis 
                  dataKey="time" 
                  hide 
                  aria-hidden="true"
                />
                <YAxis 
                  domain={[thresholds.low, thresholds.critical]}
                  hide 
                  aria-hidden="true"
                />
                <Tooltip 
                  formatter={(value: number) => [`${value} ${unit}`, title]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2196f3"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Grid>
  );
});

MetricCard.displayName = 'MetricCard';

export default HealthMetrics;