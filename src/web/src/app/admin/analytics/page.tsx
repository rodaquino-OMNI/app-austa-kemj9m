'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import DatePicker from 'react-datepicker';
import { AdminAPI } from '../../../lib/api/admin';
import { Analytics } from '../../../lib/utils/analytics';
import Table from '../../../components/common/Table';
import { theme } from '../../../styles/theme';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// Styled Components
const DashboardContainer = styled.div`
  padding: ${theme.spacing(4)}px;
  background: ${theme.palette.background.default};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing(4)}px;
`;

const Title = styled.h1`
  ${theme.typography.h1};
  color: ${theme.palette.text.primary};
`;

const Controls = styled.div`
  display: flex;
  gap: ${theme.spacing(2)}px;
  align-items: center;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: ${theme.spacing(3)}px;
  margin-bottom: ${theme.spacing(4)}px;
`;

const MetricCard = styled.div`
  background: ${theme.palette.background.paper};
  padding: ${theme.spacing(3)}px;
  border-radius: ${theme.shape.borderRadius}px;
  box-shadow: ${theme.shadows[0]};
`;

// Rest of the file remains exactly the same from here onwards
interface AnalyticsPageProps {
  params: Record<string, string>;
  searchParams: Record<string, string>;
}

interface MetricConfig {
  id: string;
  name: string;
  category: string;
  type: 'line' | 'bar' | 'table';
  dataKey: string;
}

const DEFAULT_METRICS: MetricConfig[] = [
  { id: 'activeUsers', name: 'Monthly Active Users', category: 'user_adoption', type: 'line', dataKey: 'mau' },
  { id: 'retention', name: 'User Retention Rate', category: 'user_adoption', type: 'line', dataKey: 'retention' },
  { id: 'nps', name: 'NPS Score', category: 'user_adoption', type: 'bar', dataKey: 'nps' },
  { id: 'availability', name: 'Platform Availability', category: 'technical_performance', type: 'line', dataKey: 'uptime' },
  { id: 'responseTime', name: 'Response Time', category: 'technical_performance', type: 'line', dataKey: 'latency' },
  { id: 'claims', name: 'Claims Processing Time', category: 'business_impact', type: 'bar', dataKey: 'claims_time' }
];

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ searchParams }) => {
  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await AdminAPI.getAnalytics({
        startDate,
        endDate,
        metrics: DEFAULT_METRICS.map(m => m.dataKey),
        granularity: 'day',
        filters: {}
      });

      await Analytics.trackEvent({
        name: 'admin_view_analytics',
        category: Analytics.AnalyticsCategory.USER_INTERACTION,
        properties: {
          dateRange: { startDate, endDate },
          metrics: DEFAULT_METRICS.map(m => m.id)
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: Analytics.PrivacyLevel.PUBLIC,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: JSON.parse(localStorage.getItem('currentUser') || '{}').id,
          ipAddress: window.location.hostname,
          actionType: 'VIEW_ANALYTICS'
        }
      });

      setMetrics(response);
    } catch (err) {
      setError(err as Error);
      await Analytics.trackError(err as Error, {
        operation: 'fetchAnalytics',
        dateRange: { startDate, endDate }
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleDateChange = useCallback(async (dates: [Date, Date]) => {
    const [start, end] = dates;
    setStartDate(start);
    setEndDate(end);
  }, []);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            family: theme.typography.fontFamily,
            size: 14
          }
        }
      },
      tooltip: {
        backgroundColor: theme.palette.background.paper,
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.secondary,
        borderColor: theme.palette.divider,
        borderWidth: 1
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: theme.palette.divider
        }
      },
      x: {
        grid: {
          color: theme.palette.divider
        }
      }
    }
  }), []);

  return (
    <DashboardContainer>
      <Header>
        <Title>Analytics Dashboard</Title>
        <Controls>
          <DatePicker
            selected={startDate}
            onChange={handleDateChange}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            dateFormat="MMM d, yyyy"
            maxDate={new Date()}
            aria-label="Select date range"
          />
        </Controls>
      </Header>

      {error && (
        <MetricCard>
          <p style={{ color: theme.palette.error.main }}>
            Error loading analytics: {error.message}
          </p>
        </MetricCard>
      )}

      <MetricsGrid>
        {DEFAULT_METRICS.map(metric => (
          <MetricCard key={metric.id}>
            <h3>{metric.name}</h3>
            {loading ? (
              <p>Loading...</p>
            ) : (
              metric.type === 'line' ? (
                <Line
                  data={{
                    labels: metrics[metric.dataKey]?.labels || [],
                    datasets: [{
                      label: metric.name,
                      data: metrics[metric.dataKey]?.values || [],
                      borderColor: theme.palette.primary.main,
                      tension: 0.4
                    }]
                  }}
                  options={chartOptions}
                  aria-label={`${metric.name} trend chart`}
                />
              ) : (
                <Bar
                  data={{
                    labels: metrics[metric.dataKey]?.labels || [],
                    datasets: [{
                      label: metric.name,
                      data: metrics[metric.dataKey]?.values || [],
                      backgroundColor: theme.palette.primary.main
                    }]
                  }}
                  options={chartOptions}
                  aria-label={`${metric.name} bar chart`}
                />
              )
            )}
          </MetricCard>
        ))}
      </MetricsGrid>

      <MetricCard>
        <h3>Audit Logs</h3>
        <Table
          data={metrics.auditLogs || []}
          columns={[
            { id: 'timestamp', header: 'Timestamp', accessor: 'timestamp' },
            { id: 'action', header: 'Action', accessor: 'actionType' },
            { id: 'user', header: 'User', accessor: 'userId' },
            { id: 'details', header: 'Details', accessor: 'details' }
          ]}
          sortable
          pagination
          pageSize={10}
          ariaLabel="Audit logs table"
        />
      </MetricCard>
    </DashboardContainer>
  );
};

export default AnalyticsPage;