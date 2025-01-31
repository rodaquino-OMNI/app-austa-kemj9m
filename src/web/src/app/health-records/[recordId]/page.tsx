'use client';

import React, { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { withErrorBoundary } from '@sentry/react';
import { useContext } from 'react';

import { 
  IHealthRecord, 
  HealthRecordType,
  SecurityClassification 
} from '../../../lib/types/healthRecord';
import { useHealthRecords } from '../../../hooks/useHealthRecords';
import DocumentViewer, { ViewerAccessLevel } from '../../../components/health-records/DocumentViewer';
import Button from '../../../components/common/Button';
import Loader from '../../../components/common/Loader';
import { Analytics } from '../../../lib/utils/analytics';

// Page props interface
interface PageProps {
  params: {
    recordId: string;
  };
}

// Metadata generator for SEO and security
export async function generateMetadata({ params }: PageProps) {
  return {
    title: 'Health Record Details - AUSTA SuperApp',
    description: 'Secure health record viewer with HIPAA compliance',
    robots: 'noindex, nofollow', // Prevent indexing of PHI pages
    headers: {
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none';",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff'
    }
  };
}

// Main page component with security enhancements
const HealthRecordPage: React.FC<PageProps> = ({ params }) => {
  // State management
  const [record, setRecord] = useState<IHealthRecord | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize health records hook
  const { 
    fetchRecords, 
    updateRecord, 
    deleteRecord,
    loading,
    operationLoading 
  } = useHealthRecords('current-patient', {
    enableRealTimeSync: true,
    retryAttempts: 3
  });

  // Fetch record
  useEffect(() => {
    const loadRecord = async () => {
      try {
        // Fetch record
        const records = await fetchRecords();
        if (!records || records.length === 0) {
          notFound();
        }

        // Set record
        setRecord(records[0]);

        // Track secure analytics
        Analytics.trackEvent({
          name: 'health_record_view',
          category: Analytics.AnalyticsCategory.USER_INTERACTION,
          properties: {
            recordType: records[0].type,
            hasAttachments: records[0].attachments.length > 0
          },
          timestamp: Date.now(),
          userConsent: true,
          privacyLevel: Analytics.PrivacyLevel.SENSITIVE,
          auditInfo: {
            eventId: crypto.randomUUID(),
            timestamp: Date.now(),
            userId: 'anonymous',
            ipAddress: 'masked',
            actionType: 'record_access'
          }
        });

      } catch (err) {
        setError('Error loading health record');
        Analytics.trackError(err as Error, {
          context: 'HealthRecordPage',
          recordId: params.recordId
        });
      }
    };

    loadRecord();
  }, [params.recordId]);

  // Handle secure record deletion
  const handleDelete = async () => {
    if (!record) return;

    try {
      await deleteRecord(record.id);
      Analytics.trackEvent({
        name: 'health_record_delete',
        category: Analytics.AnalyticsCategory.USER_INTERACTION,
        properties: { recordType: record.type },
        timestamp: Date.now(),
        userConsent: true,
        privacyLevel: Analytics.PrivacyLevel.SENSITIVE,
        auditInfo: {
          eventId: crypto.randomUUID(),
          timestamp: Date.now(),
          userId: 'anonymous',
          ipAddress: 'masked',
          actionType: 'record_delete'
        }
      });
    } catch (err) {
      setError('Failed to delete record');
    }
  };

  // Loading state
  if (loading) {
    return <Loader size="large" overlay />;
  }

  // Error state
  if (error) {
    return (
      <div role="alert" className="error-container">
        <p>{error}</p>
        <Button variant="secondary" onClick={() => setError(null)}>
          Dismiss
        </Button>
      </div>
    );
  }

  // No record found
  if (!record) {
    return notFound();
  }

  return (
    <div className="health-record-container">
      {/* Record header */}
      <header className="record-header">
        <h1>Health Record Details</h1>
        <div className="security-badge" aria-label="Security classification">
          {record.securityClassification}
        </div>
      </header>

      {/* Record content */}
      <main className="record-content">
        <section className="record-details">
          <h2>Record Information</h2>
          <dl>
            <dt>Type</dt>
            <dd>{record.type}</dd>
            <dt>Date</dt>
            <dd>{new Date(record.date).toLocaleDateString()}</dd>
            <dt>Provider</dt>
            <dd>{record.providerId}</dd>
            <dt>Status</dt>
            <dd>{record.status}</dd>
          </dl>
        </section>

        {/* Attachments section */}
        {record.attachments.length > 0 && (
          <section className="record-attachments">
            <h2>Attachments</h2>
            <ul>
              {record.attachments.map(attachment => (
                <li key={attachment.id}>
                  <Button
                    variant="secondary"
                    onClick={() => setActiveAttachment(attachment.id)}
                    aria-label={`View ${attachment.title}`}
                  >
                    {attachment.title}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Document viewer */}
        {activeAttachment && (
          <DocumentViewer
            recordId={record.id}
            attachmentId={activeAttachment}
            contentType={record.attachments.find(a => a.id === activeAttachment)?.contentType || ''}
            url={record.attachments.find(a => a.id === activeAttachment)?.url || ''}
            onClose={() => setActiveAttachment(null)}
            accessLevel={ViewerAccessLevel.READ_ONLY}
            watermarkText="CONFIDENTIAL"
          />
        )}
      </main>

      {/* Action buttons */}
      <footer className="record-actions">
        <Button
          variant="secondary"
          onClick={() => window.history.back()}
          aria-label="Go back"
        >
          Back
        </Button>
        <Button
          variant="emergency"
          onClick={handleDelete}
          disabled={operationLoading['delete']}
          criticalAction
          aria-label="Delete record"
        >
          Delete Record
        </Button>
      </footer>
    </div>
  );
};

// Export with error boundary
export default withErrorBoundary(HealthRecordPage, {
  fallback: <div>Error loading health record</div>
});