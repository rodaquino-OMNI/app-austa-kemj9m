/**
 * @fileoverview Cypress end-to-end tests for claims management functionality
 * Implements HIPAA-compliant testing with security and accessibility validation
 * @version 1.0.0
 */

import { IClaim, ClaimStatus } from '../../src/lib/types/claim';
import { mockClaims } from '../fixtures/claims.json';
import 'cypress-axe';

describe('Claims Management', () => {
  beforeEach(() => {
    // Initialize axe for accessibility testing
    cy.injectAxe();

    // Set up security headers and session context
    cy.intercept('/api/claims/**', (req) => {
      req.headers['x-security-context'] = 'test-context';
      req.headers['x-hipaa-audit'] = 'true';
    });

    // Mock API responses with security metadata
    cy.intercept('GET', '/api/claims', {
      statusCode: 200,
      body: mockClaims,
      headers: {
        'x-encryption-level': 'AES-256-GCM',
        'x-data-classification': 'PHI'
      }
    }).as('getClaims');

    cy.intercept('GET', '/api/claims/audit', {
      statusCode: 200,
      fixture: 'audit-logs.json'
    }).as('getAuditLogs');

    cy.intercept('GET', '/api/claims/security', {
      statusCode: 200,
      fixture: 'security-status.json'
    }).as('getSecurityStatus');

    // Visit claims page with security context
    cy.visit('/claims', {
      onBeforeLoad: (win) => {
        win.sessionStorage.setItem('securityContext', 'test-context');
      }
    });

    // Wait for initial data load and security checks
    cy.wait(['@getClaims', '@getSecurityStatus']);
  });

  describe('Claims List', () => {
    it('should handle sensitive data correctly', () => {
      // Verify PHI indicators and security badges
      cy.get('[data-cy=phi-indicator]').should('be.visible');
      cy.get('[data-cy=security-status]').should('contain', 'HIPAA Compliant');

      // Check data masking for sensitive information
      cy.get('[data-cy=claim-patient-id]').should('contain', '****');
      cy.get('[data-cy=claim-amount]').should('not.be.empty');

      // Verify audit logging
      cy.get('[data-cy=audit-trail]').should('exist');
    });

    it('should maintain HIPAA compliance', () => {
      // Run accessibility checks
      cy.checkA11y();

      // Verify security controls
      cy.get('[data-cy=compliance-info]')
        .should('contain', 'Encryption: AES-256-GCM')
        .and('contain', 'Classification: PHI');

      // Check access controls
      cy.get('[data-cy=claims-table]').within(() => {
        cy.get('tr').should('have.length.gt', 0);
        cy.get('[data-cy=security-badge]').should('be.visible');
      });
    });

    it('should support secure claim filtering', () => {
      // Test secure filtering with audit logging
      cy.get('[data-cy=filter-status]').select(ClaimStatus.SUBMITTED);
      cy.wait('@getClaims');
      cy.get('[data-cy=claims-table]').find('tr').should('have.length.gt', 0);
      cy.wait('@getAuditLogs');
    });

    it('should handle secure document uploads', () => {
      // Mock secure file upload endpoint
      cy.intercept('POST', '/api/claims/*/documents', {
        statusCode: 201,
        body: {
          id: 'doc-test',
          encryptionMetadata: {
            algorithm: 'AES-256-GCM',
            keyId: 'test-key'
          }
        }
      }).as('uploadDocument');

      // Perform secure document upload
      cy.get('[data-cy=upload-document]').attachFile('test.pdf');
      cy.wait('@uploadDocument');
      cy.get('[data-cy=upload-success]').should('be.visible');
    });
  });

  describe('Claim Details', () => {
    beforeEach(() => {
      // Mock single claim data with security context
      cy.intercept('GET', '/api/claims/*', {
        statusCode: 200,
        body: mockClaims.claims[0],
        headers: {
          'x-encryption-level': 'AES-256-GCM',
          'x-data-classification': 'PHI'
        }
      }).as('getClaimDetails');

      cy.get('[data-cy=claim-row]').first().click();
      cy.wait('@getClaimDetails');
    });

    it('should display secure claim details', () => {
      // Verify secure data display
      cy.get('[data-cy=claim-details]').within(() => {
        cy.get('[data-cy=claim-number]').should('not.be.empty');
        cy.get('[data-cy=phi-warning]').should('be.visible');
        cy.get('[data-cy=encryption-status]').should('contain', 'Encrypted');
      });

      // Check audit trail
      cy.get('[data-cy=audit-log]').should('exist');
    });

    it('should handle secure status updates', () => {
      // Mock secure status update endpoint
      cy.intercept('PATCH', '/api/claims/*', {
        statusCode: 200,
        body: {
          status: ClaimStatus.APPROVED,
          auditTrail: [{
            action: 'STATUS_UPDATE',
            timestamp: new Date().toISOString()
          }]
        }
      }).as('updateStatus');

      // Perform secure status update
      cy.get('[data-cy=status-update]').select(ClaimStatus.APPROVED);
      cy.wait('@updateStatus');
      cy.get('[data-cy=update-success]').should('be.visible');
    });
  });

  describe('Accessibility and Security', () => {
    it('should meet WCAG 2.1 Level AA standards', () => {
      // Run comprehensive accessibility checks
      cy.checkA11y(null, {
        includedImpacts: ['critical', 'serious', 'moderate'],
        rules: {
          'color-contrast': { enabled: true },
          'aria-required-parent': { enabled: true }
        }
      });
    });

    it('should maintain security during navigation', () => {
      // Verify security context persistence
      cy.get('[data-cy=claims-nav]').click();
      cy.wait('@getClaims');
      cy.get('[data-cy=security-context]').should('exist');
      cy.get('[data-cy=phi-indicator]').should('be.visible');
    });
  });
});