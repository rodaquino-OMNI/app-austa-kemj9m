'use client';

/**
 * @fileoverview Health Records page component for AUSTA SuperApp
 * Implements FHIR R4 compliant health record management with enhanced security and accessibility
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react'; // v18.0.0
import { Suspense } from 'react'; // v18.0.0
import { AuditLogger } from '@austa/audit-logger'; // v1.0.0

// Internal imports
import RecordsList from '../../components/health-records/RecordsList';
import DocumentViewer from '../../components/health-records/DocumentViewer';
import Timeline from '../../components/health-records/Timeline';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useHealthRecords } from '../../hooks/useHealthRecords';

// Types and interfaces
import { 
  IHealthRecord, 
  HealthRecordType, 
  SecurityClassification,
  ViewerAccessLevel 
} from '../../lib/types/healthRecord';
import { Analytics } from '../../lib/utils/analytics';

// Constants
const DEFAULT_VIEW = 'list';
const AUDIT_CONTEXT = 'health-records-page';

/**
 * Health Records page component with enhanced security and accessibility features
 */
const HealthRecordsPage: React.FC<{
  params: { patientId: string };
  searchParams: { 
    view?: string;
    recordType?: string[];
    timeRange?: string;
  };
}> = ({ params, searchParams }) => {
  // State management
  const [selectedRecord, setSelectedRecord] = useState<IHealthRecord | null>(null);
  const [viewType, setViewType] = useState(searchParams.view || DEFAULT_VIEW);
  const [activeRecordTypes, setActiveRecordTypes] = useState<HealthRecordType[]>(
    searchParams.recordType?.map(type => type as HealthRecordType) || 
    Object.values(HealthRecordType)
  );

  // Initialize health records hook with FHIR validation
  const {
    records,
    loading,
    error,
    fetchRecords
  } = useHealthRecords(params.patientId, {
    autoFetch: true,
    recordTypes: activeRecordTypes,
    enableRealTimeSync: true
  });

  // Initialize audit logger
  const auditLogger = new AuditLogger({
    context: AUDIT_CONTEXT,
    patientId: params.patientId,
    enableEncryption: true
  });

  // Handle record selection with security checks
  const handleRecordSelect = useCallback(async (record: IHealthRecord) => {
    try {
      // Log PHI access attempt
      await auditLogger.log({
        action: 'RECORD_ACCESS',
        details: {
          recordId: record.id,
          recordType: record.type,
          accessType: 'VIEW'
        }
      });

      setSelectedRecord(record);

      // Track interaction
      Analytics.trackEvent({
        name: 'health_record_selected',
        category: 'USER_INTERACTION',
        properties: {
          recordType: record.type,
          viewType
        },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: 'SENSITIVE',
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: 'anonymous',
          ipAddress: 'masked',
          actionType: 'record_view'
        }
      });

    } catch (error) {
      console.error('Record selection failed:', error);
    }
  }, [auditLogger, viewType]);

  // Handle record type filter changes
  const handleRecordTypeChange = useCallback((types: HealthRecordType[]) => {
    setActiveRecordTypes(types);
    fetchRecords();
  }, [fetchRecords]);

  // Handle view type changes
  const handleViewChange = useCallback((newView: string) => {
    setViewType(newView);
    setSelectedRecord(null);
  }, []);

  // Error state
  if (error) {
    return (
      <ErrorBoundary>
        <div role="alert" className="error-container">
          <p>Failed to load health records. Please try again.</p>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <main 
        className="health-records-page"
        role="main"
        aria-label="Health Records"
      >
        {/* View type selector */}
        <div className="view-controls" role="toolbar">
          <button
            onClick={() => handleViewChange('list')}
            aria-pressed={viewType === 'list'}
            aria-label="List view"
          >
            List View
          </button>
          <button
            onClick={() => handleViewChange('timeline')}
            aria-pressed={viewType === 'timeline'}
            aria-label="Timeline view"
          >
            Timeline View
          </button>
        </div>

        {/* Main content area */}
        <div className="records-container">
          <Suspense fallback={<div>Loading records...</div>}>
            {viewType === 'list' ? (
              <RecordsList
                patientId={params.patientId}
                recordTypes={activeRecordTypes}
                onRecordSelect={handleRecordSelect}
                enableRealTimeSync={true}
                accessLevel={SecurityClassification.HIGHLY_CONFIDENTIAL}
                onError={(error) => console.error('Records list error:', error)}
              />
            ) : (
              <Timeline
                patientId={params.patientId}
                recordTypes={activeRecordTypes}
                startDate={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
                endDate={new Date()}
                onRecordClick={handleRecordSelect}
                securityContext={{
                  accessLevel: SecurityClassification.HIGHLY_CONFIDENTIAL,
                  userRole: 'provider'
                }}
                timezone="UTC"
              />
            )}
          </Suspense>
        </div>

        {/* Document viewer modal */}
        {selectedRecord && selectedRecord.attachments && selectedRecord.attachments.length > 0 && (
          <DocumentViewer
            recordId={selectedRecord.id}
            attachmentId={selectedRecord.attachments[0].id}
            contentType={selectedRecord.attachments[0].contentType}
            url={selectedRecord.attachments[0].url}
            onClose={() => setSelectedRecord(null)}
            accessLevel={ViewerAccessLevel.READ_ONLY}
            watermarkText="CONFIDENTIAL"
            highContrastMode={false}
            patientId={params.patientId}
          />
        )}
      </main>
    </ErrorBoundary>
  );
};

export default HealthRecordsPage;