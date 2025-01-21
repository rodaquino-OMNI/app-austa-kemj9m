import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

import DocumentViewer from '../../../src/components/health-records/DocumentViewer';
import { useHealthRecords } from '../../../src/hooks/useHealthRecords';
import { IHealthRecordAttachment } from '../../../src/lib/types/healthRecord';
import { ErrorCode } from '../../../src/lib/constants/errorCodes';

// Mock external dependencies
jest.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div data-testid="pdf-document">{children}</div>,
  Page: () => <div data-testid="pdf-page" />,
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' },
    version: '2.6.347',
  },
}));

jest.mock('cornerstone-core', () => ({
  loadImage: jest.fn(),
  displayImage: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
}));

jest.mock('@medical-viewer/secure', () => ({
  useSecureViewer: () => ({
    initSecureViewer: jest.fn(),
    cleanupSecureViewer: jest.fn(),
  }),
}));

jest.mock('../../../src/hooks/useHealthRecords');

// Test data
const mockSecurePdfAttachment: IHealthRecordAttachment = {
  id: 'test-pdf-1',
  contentType: 'application/pdf',
  url: 'https://test-cdn.austa.health/documents/test-pdf-1.pdf',
  securityLevel: 'high',
  watermarkText: 'CONFIDENTIAL PHI',
  title: 'Test PDF Document',
  size: 1024,
  uploadedAt: new Date(),
  uploadedBy: 'test-provider',
  encryptionDetails: {
    algorithm: 'AES-256-GCM',
    keyId: 'test-key-1',
    initVector: 'test-iv-1'
  },
  securityHash: 'test-hash-1'
};

const mockSecureImageAttachment: IHealthRecordAttachment = {
  id: 'test-image-1',
  contentType: 'image/dicom',
  url: 'https://test-cdn.austa.health/images/test-image-1.dcm',
  securityLevel: 'high',
  watermarkText: 'CONFIDENTIAL PHI',
  title: 'Test DICOM Image',
  size: 2048,
  uploadedAt: new Date(),
  uploadedBy: 'test-provider',
  encryptionDetails: {
    algorithm: 'AES-256-GCM',
    keyId: 'test-key-2',
    initVector: 'test-iv-2'
  },
  securityHash: 'test-hash-2'
};

describe('DocumentViewer', () => {
  const mockLogDocumentAccess = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useHealthRecords as jest.Mock).mockReturnValue({
      logDocumentAccess: mockLogDocumentAccess,
    });
  });

  describe('Security and Compliance', () => {
    it('should initialize secure viewer with proper security settings', async () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
          watermarkText={mockSecurePdfAttachment.watermarkText}
        />
      );

      await waitFor(() => {
        expect(mockLogDocumentAccess).toHaveBeenCalledWith({
          recordId: 'test-record',
          attachmentId: mockSecurePdfAttachment.id,
          action: 'VIEW',
          timestamp: expect.any(String)
        });
      });

      expect(screen.getByText(mockSecurePdfAttachment.watermarkText)).toBeInTheDocument();
    });

    it('should handle unauthorized access attempts', async () => {
      mockLogDocumentAccess.mockRejectedValueOnce(new Error(ErrorCode.UNAUTHORIZED));

      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to initialize secure viewer');
      });
    });
  });

  describe('Accessibility', () => {
    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      const toolbar = screen.getByRole('toolbar');
      const buttons = within(toolbar).getAllByRole('button');

      await user.tab();
      expect(buttons[0]).toHaveFocus();

      await user.tab();
      expect(buttons[1]).toHaveFocus();
    });

    it('should handle high contrast mode', () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
          highContrastMode={true}
        />
      );

      const pdfPage = screen.getByTestId('pdf-page');
      expect(pdfPage).toHaveClass('high-contrast');
    });

    it('should provide proper ARIA labels', () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecureImageAttachment.id}
          contentType={mockSecureImageAttachment.contentType}
          url={mockSecureImageAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      expect(screen.getByRole('application')).toHaveAttribute('aria-label', 'Document viewer');
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Medical image viewer');
    });
  });

  describe('Document Controls', () => {
    it('should handle page navigation for PDF documents', async () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      const nextButton = screen.getByRole('button', { name: /next page/i });
      const prevButton = screen.getByRole('button', { name: /previous page/i });

      expect(prevButton).toBeDisabled();
      
      fireEvent.click(nextButton);
      await waitFor(() => {
        expect(prevButton).not.toBeDisabled();
      });
    });

    it('should handle zoom controls', async () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      const zoomInButton = screen.getByRole('button', { name: /zoom in/i });
      const zoomOutButton = screen.getByRole('button', { name: /zoom out/i });

      fireEvent.click(zoomInButton);
      await waitFor(() => {
        expect(screen.getByText('120%')).toBeInTheDocument();
      });

      fireEvent.click(zoomOutButton);
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message on document load failure', async () => {
      render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url="invalid-url"
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      const pdfDocument = screen.getByTestId('pdf-document');
      fireEvent.error(pdfDocument);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load document');
      });
    });

    it('should handle cleanup on unmount', () => {
      const { unmount } = render(
        <DocumentViewer
          recordId="test-record"
          attachmentId={mockSecurePdfAttachment.id}
          contentType={mockSecurePdfAttachment.contentType}
          url={mockSecurePdfAttachment.url}
          onClose={mockOnClose}
          accessLevel="readonly"
        />
      );

      unmount();
      // Verify cleanup was called (implementation specific)
    });
  });
});