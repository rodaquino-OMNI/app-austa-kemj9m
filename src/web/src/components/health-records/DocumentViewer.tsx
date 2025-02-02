/**
 * @fileoverview Secure document viewer component for medical records with HIPAA compliance
 * Implements enhanced security, accessibility, and audit logging features
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useState } from 'react'; // v18.0.0
import { Document, Page, pdf } from '@react-pdf/renderer'; // v3.1.0
import * as cornerstone from 'cornerstone-core'; // v2.6.1
import { useFocusRing } from '@react-aria/focus'; // v3.14.0
import { useSecureViewer } from '@medical-viewer/secure'; // v1.0.0

import { IHealthRecordAttachment } from '../../lib/types/healthRecord';
import { useHealthRecords } from '../../hooks/useHealthRecords';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { Analytics } from '../../lib/utils/analytics';

// Configure PDF.js worker
pdf.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdf.version}/pdf.worker.min.js`;

// Viewer access level enum
export enum ViewerAccessLevel {
  READ_ONLY = 'readonly',
  ANNOTATE = 'annotate',
  FULL_ACCESS = 'full_access'
}

// Component props interface
interface DocumentViewerProps {
  recordId: string;
  attachmentId: string;
  contentType: string;
  url: string;
  onClose: () => void;
  accessLevel: ViewerAccessLevel;
  watermarkText?: string;
  highContrastMode?: boolean;
  patientId: string;
}

/**
 * Secure document viewer component with HIPAA compliance and accessibility features
 */
const DocumentViewer: React.FC<DocumentViewerProps> = ({
  recordId,
  attachmentId,
  contentType,
  url,
  onClose,
  accessLevel,
  watermarkText = 'CONFIDENTIAL',
  highContrastMode = false,
  patientId
}) => {
  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);

  // Custom hooks
  const { logDocumentAccess } = useHealthRecords(patientId);
  const { focusProps, isFocusVisible } = useFocusRing();
  const { initSecureViewer, cleanupSecureViewer } = useSecureViewer();

  // Security context initialization
  useEffect(() => {
    const initSecurity = async () => {
      try {
        await initSecureViewer({
          documentId: attachmentId,
          accessLevel,
          preventScreenCapture: true,
          watermarkText,
          auditLogging: true
        });

        // Log document access
        await logDocumentAccess({
          recordId,
          attachmentId,
          action: 'VIEW',
          timestamp: new Date().toISOString()
        });

        // Track analytics
        Analytics.trackEvent({
          name: 'document_view',
          category: Analytics.AnalyticsCategory.USER_INTERACTION,
          properties: {
            contentType,
            accessLevel,
            recordId: recordId // Sanitized in analytics module
          },
          timestamp: Date.now(),
          userConsent: true,
          privacyLevel: Analytics.PrivacyLevel.SENSITIVE,
          auditInfo: {
            eventId: crypto.randomUUID(),
            timestamp: Date.now(),
            userId: 'anonymous',
            ipAddress: 'masked',
            actionType: 'document_access'
          }
        });

      } catch (err) {
        setError('Failed to initialize secure viewer');
        console.error('Secure viewer initialization failed:', err);
      }
    };

    initSecurity();
    return () => cleanupSecureViewer();
  }, [attachmentId, accessLevel, recordId]);

  // Secure document loading handler
  const handleDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    setTotalPages(numPages);
    setIsLoading(false);
  }, []);

  // Page navigation handlers
  const handlePreviousPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  }, []);

  // Render PDF viewer with security features
  const renderSecurePDFViewer = () => (
    <div className="secure-pdf-container" role="document">
      <Document
        file={url}
        onLoadSuccess={handleDocumentLoad}
        onLoadError={(err: Error) => {
          setError('Failed to load document');
          console.error('PDF load error:', err);
        }}
        loading={<Loader size="large" />}
      >
        <Page
          pageNumber={currentPage}
          scale={scale}
          renderTextLayer={accessLevel !== ViewerAccessLevel.READ_ONLY}
          renderAnnotationLayer={accessLevel === ViewerAccessLevel.FULL_ACCESS}
          className={highContrastMode ? 'high-contrast' : ''}
        />
      </Document>
    </div>
  );

  // Render medical image viewer
  const renderSecureImageViewer = () => (
    <div 
      id="cornerstone-element"
      className="secure-image-container"
      role="img"
      aria-label="Medical image viewer"
    >
      {isLoading && <Loader size="large" />}
    </div>
  );

  // Error state
  if (error) {
    return (
      <div role="alert" className="error-container">
        <p>{error}</p>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div 
      className="document-viewer-container"
      role="application"
      aria-label="Document viewer"
      {...focusProps}
    >
      {/* Viewer toolbar */}
      <div className="viewer-toolbar" role="toolbar">
        <div className="navigation-controls">
          <Button
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <span aria-live="polite">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>

        <div className="zoom-controls">
          <Button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            aria-label="Zoom out"
          >
            -
          </Button>
          <span>{Math.round(scale * 100)}%</span>
          <Button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            aria-label="Zoom in"
          >
            +
          </Button>
        </div>

        <Button
          variant="secondary"
          onClick={onClose}
          aria-label="Close viewer"
        >
          Close
        </Button>
      </div>

      {/* Document content */}
      <div className="viewer-content">
        {contentType.includes('pdf') ? renderSecurePDFViewer() : renderSecureImageViewer()}
      </div>

      {/* Watermark overlay */}
      {watermarkText && (
        <div 
          className="watermark-overlay"
          aria-hidden="true"
        >
          {watermarkText}
        </div>
      )}
    </div>
  );
};

export default DocumentViewer;