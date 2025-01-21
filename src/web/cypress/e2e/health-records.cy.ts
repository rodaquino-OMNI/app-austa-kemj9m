/**
 * @fileoverview End-to-end test suite for health records functionality
 * Implements comprehensive testing for FHIR-compliant health record management
 * with security and performance validation
 * @version 1.0.0
 */

import { HealthRecordType, HealthRecordStatus, FHIRResourceType } from '../../src/lib/types/healthRecord';
import '@testing-library/cypress/add-commands';
import '@cypress/code-coverage';

// Test constants
const TEST_TIMEOUT = 10000;
const PERFORMANCE_THRESHOLD = 500; // 500ms response time threshold
const TEST_FILES_PATH = 'cypress/fixtures/health-records';

describe('Health Records Management', () => {
  beforeEach(() => {
    // Clear previous state and setup secure environment
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    cy.clearCookies();

    // Verify secure connection
    cy.location('protocol').should('eq', 'https:');

    // Login with test credentials having PHI access
    cy.login(Cypress.env('TEST_PHI_USER'), Cypress.env('TEST_PHI_PASSWORD'));

    // Navigate to health records page
    cy.visit('/health-records');

    // Wait for initial data load with timeout
    cy.get('[data-testid="health-records-list"]', { timeout: TEST_TIMEOUT })
      .should('be.visible');

    // Verify HIPAA compliance headers
    cy.request('/health-records')
      .its('headers')
      .then((headers) => {
        expect(headers).to.include({
          'x-hipaa-audit-logged': 'true',
          'strict-transport-security': 'max-age=31536000; includeSubDomains'
        });
      });
  });

  describe('Record Listing', () => {
    it('should load health records with proper pagination', () => {
      cy.intercept('GET', '/api/health-records*').as('getRecords');

      // Verify initial page load performance
      cy.wait('@getRecords').its('duration').should('be.lessThan', PERFORMANCE_THRESHOLD);

      // Test pagination
      cy.get('[data-testid="records-table"]').should('be.visible');
      cy.get('[data-testid="pagination"]').should('exist');
      cy.get('[data-testid="next-page"]').click();
      cy.wait('@getRecords');
      cy.get('[data-testid="records-table"]').should('be.visible');
    });

    it('should properly filter records by type', () => {
      // Test type filter
      cy.get('[data-testid="type-filter"]').click();
      cy.get(`[data-value="${HealthRecordType.LAB_RESULT}"]`).click();
      cy.get('[data-testid="records-table"]')
        .find('tr')
        .each(($row) => {
          cy.wrap($row).should('contain', 'Lab Result');
        });
    });

    it('should enforce PHI data masking', () => {
      // Verify PHI masking on unauthorized access
      cy.login(Cypress.env('TEST_LIMITED_USER'));
      cy.visit('/health-records');
      cy.get('[data-testid="records-table"]')
        .find('[data-testid="phi-field"]')
        .each(($field) => {
          cy.wrap($field).should('contain', '********');
        });
    });
  });

  describe('Record Creation', () => {
    it('should create new health record with FHIR validation', () => {
      cy.intercept('POST', '/api/health-records').as('createRecord');

      // Open create form
      cy.get('[data-testid="create-record-btn"]').click();

      // Fill form with test data
      cy.get('[data-testid="record-type"]').select(HealthRecordType.CONSULTATION);
      cy.get('[data-testid="record-date"]').type('2023-12-01');
      cy.get('[data-testid="record-provider"]').type('Dr. Smith');
      cy.get('[data-testid="record-notes"]').type('Regular checkup');

      // Submit form
      cy.get('[data-testid="submit-record"]').click();

      // Verify FHIR compliance
      cy.wait('@createRecord').then((interception) => {
        expect(interception.request.body.fhirResource.resourceType)
          .to.equal(FHIRResourceType.OBSERVATION);
        expect(interception.response.statusCode).to.equal(201);
      });
    });

    it('should handle document upload with security scanning', () => {
      cy.intercept('POST', '/api/health-records/documents').as('uploadDocument');

      // Upload test document
      cy.get('[data-testid="upload-document"]')
        .attachFile(`${TEST_FILES_PATH}/test-report.pdf`);

      // Verify virus scan and encryption
      cy.wait('@uploadDocument').then((interception) => {
        expect(interception.response.headers['x-virus-scanned']).to.equal('true');
        expect(interception.response.headers['x-encryption-applied']).to.equal('true');
      });
    });
  });

  describe('Document Viewer', () => {
    it('should securely display health record documents', () => {
      // Open document viewer
      cy.get('[data-testid="view-document"]').first().click();

      // Verify secure viewer loaded
      cy.get('[data-testid="document-viewer"]').should('be.visible');
      cy.get('[data-testid="security-watermark"]').should('exist');

      // Test viewer controls
      cy.get('[data-testid="zoom-in"]').click();
      cy.get('[data-testid="zoom-out"]').click();
      cy.get('[data-testid="rotate"]').click();

      // Verify download encryption
      cy.intercept('GET', '/api/health-records/documents/*').as('downloadDocument');
      cy.get('[data-testid="download-document"]').click();
      cy.wait('@downloadDocument').its('response.headers')
        .should('include', { 'content-encryption-applied': 'true' });
    });

    it('should maintain performance with large documents', () => {
      cy.intercept('GET', '/api/health-records/documents/large-*').as('getLargeDoc');

      // Load large document
      cy.get('[data-testid="view-large-document"]').click();
      cy.wait('@getLargeDoc').its('duration')
        .should('be.lessThan', PERFORMANCE_THRESHOLD);

      // Verify smooth scrolling
      cy.get('[data-testid="document-viewer"]')
        .scrollTo('bottom', { duration: 1000 })
        .should('have.prop', 'scrollTop').and('be.gt', 0);
    });
  });

  describe('FHIR Compliance', () => {
    it('should validate FHIR R4 resources', () => {
      cy.intercept('GET', '/api/health-records/fhir/*').as('getFHIRResource');

      // Request FHIR resource
      cy.get('[data-testid="export-fhir"]').first().click();

      // Verify FHIR compliance
      cy.wait('@getFHIRResource').then((interception) => {
        const resource = interception.response.body;
        expect(resource.resourceType).to.be.oneOf(Object.values(FHIRResourceType));
        expect(resource.meta.profile).to.include('http://hl7.org/fhir/R4/');
      });
    });

    it('should support bulk FHIR operations', () => {
      cy.intercept('GET', '/api/health-records/fhir/$export').as('bulkExport');

      // Initiate bulk export
      cy.get('[data-testid="bulk-export"]').click();

      // Verify bulk operation headers
      cy.wait('@bulkExport').its('response.headers').should('include', {
        'content-type': 'application/fhir+ndjson'
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should meet response time requirements', () => {
      // Test list performance
      cy.intercept('GET', '/api/health-records*').as('getRecords');
      cy.reload();
      cy.wait('@getRecords').its('duration')
        .should('be.lessThan', PERFORMANCE_THRESHOLD);

      // Test search performance
      cy.get('[data-testid="search-records"]').type('test');
      cy.wait('@getRecords').its('duration')
        .should('be.lessThan', PERFORMANCE_THRESHOLD);

      // Test filter performance
      cy.get('[data-testid="date-filter"]').click();
      cy.wait('@getRecords').its('duration')
        .should('be.lessThan', PERFORMANCE_THRESHOLD);
    });
  });
});