'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { format, parseISO } from 'date-fns';
import useWebSocket from 'react-use-websocket';

import AdminLayout from '../../../components/layout/AdminLayout';
import Table from '../../../components/common/Table';
import Modal from '../../../components/common/Modal';
import ErrorBoundary from '../../../components/common/ErrorBoundary';
import { Analytics } from '../../../lib/utils/analytics';

// Constants
const COMPLIANCE_TYPES = ['HIPAA', 'LGPD', 'SOC2', 'PCI', 'ISO27001'] as const;
const STATUS_FILTERS = ['All', 'Compliant', 'Non-Compliant', 'In-Progress', 'Review-Required'] as const;
const WEBSOCKET_ENDPOINT = '/api/ws/compliance';

// Interfaces
interface ComplianceRecord {
  id: string;
  type: typeof COMPLIANCE_TYPES[number];
  status: 'Compliant' | 'Non-Compliant' | 'In-Progress' | 'Review-Required';
  lastChecked: string;
  nextReview: string;
  findings: Array<{
    id: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    description: string;
    remediation: string;
  }>;
  auditTrail: Array<{
    timestamp: string;
    action: string;
    user: string;
    details: string;
  }>;
  assignedTo: string;
  metrics: {
    complianceScore: number;
    criticalFindings: number;
    resolvedFindings: number;
  };
}

// Styled Components
const StyledCompliancePage = styled.div`
  padding: ${({ theme }) => theme.spacing.lg}px;
  max-width: 1600px;
  margin: 0 auto;
  background-color: ${({ theme }) => theme.palette.background.default};
  min-height: calc(100vh - 64px);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const CompliancePage: React.FC = () => {
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ComplianceRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('All');

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket(WEBSOCKET_ENDPOINT, {
    onOpen: () => {
      Analytics.trackEvent({
        name: 'compliance_websocket_connected',
        category: Analytics.AnalyticsCategory.SYSTEM_PERFORMANCE,
        properties: { endpoint: WEBSOCKET_ENDPOINT },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: Analytics.PrivacyLevel.INTERNAL,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: 'system',
          ipAddress: 'internal',
          actionType: 'websocket_connection'
        }
      });
    },
    onError: (error) => {
      Analytics.trackError(error, {
        context: 'compliance_websocket',
        endpoint: WEBSOCKET_ENDPOINT
      });
    }
  });

  // Table columns configuration
  const columns = useMemo(() => [
    {
      id: 'type',
      header: 'Compliance Type',
      accessor: 'type',
      sortable: true
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      render: (value: string) => (
        <div style={{ 
          color: value === 'Compliant' ? 'green' : 
                 value === 'Non-Compliant' ? 'red' : 
                 value === 'In-Progress' ? 'orange' : 'gray' 
        }}>
          {value}
        </div>
      )
    },
    {
      id: 'lastChecked',
      header: 'Last Checked',
      accessor: 'lastChecked',
      sortable: true,
      render: (value: string) => format(parseISO(value), 'PPp')
    },
    {
      id: 'nextReview',
      header: 'Next Review',
      accessor: 'nextReview',
      sortable: true,
      render: (value: string) => format(parseISO(value), 'PPp')
    },
    {
      id: 'metrics',
      header: 'Compliance Score',
      accessor: 'metrics',
      sortable: true,
      render: (value: ComplianceRecord['metrics']) => (
        <div>{value.complianceScore}% ({value.resolvedFindings}/{value.criticalFindings} findings resolved)</div>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: 'id',
      render: (value: string, row: Record<string, any>) => (
        <button onClick={() => handleRecordSelect(row as ComplianceRecord)}>View Details</button>
      )
    }
  ], []);

  // Fetch compliance records
  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      // API call would go here
      const mockData: ComplianceRecord[] = []; // Replace with actual API call
      setRecords(mockData);
    } catch (error) {
      Analytics.trackError(error as Error, {
        context: 'compliance_fetch_records'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle real-time updates
  useEffect(() => {
    if (lastMessage) {
      const update = JSON.parse(lastMessage.data);
      setRecords(prev => prev.map(record => 
        record.id === update.id ? { ...record, ...update } : record
      ));
    }
  }, [lastMessage]);

  // Initial data fetch
  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Record selection handler
  const handleRecordSelect = useCallback((record: ComplianceRecord) => {
    setSelectedRecord(record);
    setIsModalOpen(true);
    
    Analytics.trackEvent({
      name: 'compliance_record_viewed',
      category: Analytics.AnalyticsCategory.USER_INTERACTION,
      properties: {
        recordId: record.id,
        complianceType: record.type
      },
      timestamp: Date.now(),
      userConsent: true,
      privacyLevel: Analytics.PrivacyLevel.INTERNAL,
      auditInfo: {
        eventId: crypto.randomUUID(),
        timestamp: Date.now(),
        userId: 'admin',
        ipAddress: 'masked',
        actionType: 'record_view'
      }
    });
  }, []);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return filter === 'All' 
      ? records 
      : records.filter(record => record.status === filter);
  }, [records, filter]);

  return (
    <ErrorBoundary>
      <AdminLayout>
        <StyledCompliancePage>
          <Header>
            <h1>Compliance Monitoring</h1>
          </Header>

          <Controls>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value as typeof STATUS_FILTERS[number])}
            >
              {STATUS_FILTERS.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </Controls>

          <Table
            data={filteredRecords}
            columns={columns}
            loading={loading}
            sortable
            pagination
            pageSize={10}
            ariaLabel="Compliance records table"
          />

          {selectedRecord && (
            <Modal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              title={`${selectedRecord.type} Compliance Details`}
              size="large"
              clinicalContext="standard"
              actions={[
                {
                  label: 'Generate Report',
                  onClick: () => {/* Report generation logic */},
                  variant: 'secondary'
                },
                {
                  label: 'Close',
                  onClick: () => setIsModalOpen(false),
                  variant: 'primary'
                }
              ]}
            >
              <div>
                <h3>Findings</h3>
                <Table
                  data={selectedRecord.findings}
                  columns={[
                    { id: 'severity', header: 'Severity', accessor: 'severity' },
                    { id: 'description', header: 'Description', accessor: 'description' },
                    { id: 'remediation', header: 'Remediation', accessor: 'remediation' }
                  ]}
                  ariaLabel="Compliance findings table"
                />

                <h3>Audit Trail</h3>
                <Table
                  data={selectedRecord.auditTrail}
                  columns={[
                    { 
                      id: 'timestamp', 
                      header: 'Timestamp', 
                      accessor: 'timestamp',
                      render: (value: string) => format(parseISO(value), 'PPp')
                    },
                    { id: 'action', header: 'Action', accessor: 'action' },
                    { id: 'user', header: 'User', accessor: 'user' },
                    { id: 'details', header: 'Details', accessor: 'details' }
                  ]}
                  ariaLabel="Audit trail table"
                />
              </div>
            </Modal>
          )}
        </StyledCompliancePage>
      </AdminLayout>
    </ErrorBoundary>
  );
};

export default CompliancePage;