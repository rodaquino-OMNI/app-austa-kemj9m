// External imports
import '@testing-library/cypress/add-commands'; // v10.0.0
import '@cypress/code-coverage/support'; // v3.12.0
import 'cypress-file-upload'; // Add cypress-file-upload for attachFile command

// Internal imports
import { IUser } from '../../lib/types/user';
import { IHealthRecord } from '../../lib/types/healthRecord';
import { IClaim } from '../../lib/types/claim';

declare global {
  namespace Cypress {
    interface Chainable {
      login(credentials: IUser): Chainable<void>;
      uploadHealthRecord(recordData: IHealthRecord, documentFile: File): Chainable<void>;
      submitClaim(claimData: IClaim, supportingDocuments: File[]): Chainable<void>;
      verifyBiometricAuth(shouldSucceed: boolean): Chainable<void>;
    }
  }
}

/**
 * Enhanced login command with security validation and compliance checks
 */
Cypress.Commands.add('login', (credentials: IUser) => {
  cy.intercept('POST', '/api/auth/login').as('loginRequest');
  
  // Visit login page with security validation
  cy.visit('/login', {
    onBeforeLoad: (win) => {
      cy.stub(win.console, 'error').as('consoleError');
    },
  });

  // Verify security headers
  cy.request('/login').then((response) => {
    expect(response.headers).to.include({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-xss-protection': '1; mode=block'
    });
  });

  // Input validation and form submission
  cy.findByLabelText('Email').type(credentials.email);
  cy.findByLabelText('Password').type(credentials.password, { sensitive: true });
  cy.findByRole('button', { name: /sign in/i }).click();

  // Verify authentication and session
  cy.wait('@loginRequest').then((interception) => {
    expect(interception.response?.statusCode).to.equal(200);
    expect(interception.response?.body).to.have.property('token');
  });

  // Validate secure cookie settings
  cy.getCookie('session').should('exist').then((cookie) => {
    expect(cookie).to.have.property('secure', true);
    expect(cookie).to.have.property('httpOnly', true);
    expect(cookie).to.have.property('sameSite', 'Strict');
  });
});

/**
 * Enhanced health record upload command with FHIR compliance validation
 */
Cypress.Commands.add('uploadHealthRecord', (recordData: IHealthRecord, documentFile: File) => {
  cy.intercept('POST', '/api/health-records').as('uploadRequest');

  // Navigate to upload form
  cy.visit('/health-records/upload');

  // Validate form accessibility
  cy.injectAxe();
  cy.checkA11y();

  // Fill record metadata
  cy.findByLabelText('Record Type').select(recordData.type);
  cy.findByLabelText('Date').type(recordData.date.toISOString().split('T')[0]);

  // File upload with validation
  cy.get('input[type="file"]').attachFile(documentFile);

  // Submit form and verify
  cy.findByRole('button', { name: /upload/i }).click();

  // Verify FHIR compliance
  cy.wait('@uploadRequest').then((interception) => {
    expect(interception.response?.statusCode).to.equal(201);
    expect(interception.response?.body).to.have.property('fhirValidation', true);
  });

  // Verify audit logging
  cy.request('/api/audit-logs').then((response) => {
    expect(response.body).to.include({
      action: 'HEALTH_RECORD_UPLOAD',
      resourceType: recordData.type
    });
  });
});

/**
 * Enhanced claim submission command with comprehensive validation
 */
Cypress.Commands.add('submitClaim', (claimData: IClaim, supportingDocuments: File[]) => {
  cy.intercept('POST', '/api/claims').as('claimSubmission');

  // Navigate to claims form
  cy.visit('/claims/new');

  // Fill claim details
  cy.findByLabelText('Claim Type').select(claimData.type);
  cy.findByLabelText('Service Date').type(claimData.serviceDate.toISOString().split('T')[0]);
  cy.findByLabelText('Amount').type(claimData.amount.toString());

  // Upload supporting documents
  supportingDocuments.forEach((doc, index) => {
    cy.get('input[type="file"]').attachFile(doc);
    cy.findByText(`Document ${index + 1} uploaded`).should('exist');
  });

  // Submit claim
  cy.findByRole('button', { name: /submit claim/i }).click();

  // Verify submission and compliance
  cy.wait('@claimSubmission').then((interception) => {
    expect(interception.response?.statusCode).to.equal(201);
    expect(interception.response?.body).to.have.property('claimNumber');
    expect(interception.response?.body.complianceChecks).to.deep.include({
      hipaaCompliant: true,
      documentsVerified: true
    });
  });
});

/**
 * Enhanced biometric authentication testing command
 */
Cypress.Commands.add('verifyBiometricAuth', (shouldSucceed: boolean) => {
  cy.intercept('POST', '/api/auth/biometric').as('biometricAuth');

  // Mock biometric capability
  cy.window().then((win) => {
    Object.defineProperty(win.navigator, 'credentials', {
      value: {
        get: cy.stub().resolves(shouldSucceed ? { id: 'bio-credential-id' } : null)
      }
    });
  });

  // Trigger biometric auth
  cy.findByRole('button', { name: /use biometric/i }).click();

  // Verify authentication flow
  cy.wait('@biometricAuth').then((interception) => {
    if (shouldSucceed) {
      expect(interception.response?.statusCode).to.equal(200);
      expect(interception.response?.body).to.have.property('authenticated', true);
    } else {
      expect(interception.response?.statusCode).to.equal(401);
    }
  });

  // Verify security logging
  cy.request('/api/security-logs').then((response) => {
    expect(response.body).to.include({
      eventType: 'BIOMETRIC_AUTH_ATTEMPT',
      success: shouldSucceed
    });
  });
});