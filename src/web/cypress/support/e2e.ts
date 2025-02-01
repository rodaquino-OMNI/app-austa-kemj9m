// External imports
import 'cypress';
import '@testing-library/cypress/add-commands'; // v10.0.0
import '@cypress/code-coverage/support'; // v3.12.0
import 'cypress-axe'; // v1.5.0
import 'cypress-audit'; // v1.1.0
import '@cypress/security-headers'; // v2.0.0

// Internal imports
import './commands';

// Configure enhanced Cypress behavior with security and performance monitoring
Cypress.on('window:before:load', (win) => {
  // Enable enhanced security checks
  win.localStorage.setItem('SECURITY_VALIDATION', 'enabled');
  
  // Configure performance monitoring
  win.performance.mark('test-start');
  
  // Setup error tracking
  const originalError = win.console.error;
  win.console.error = (...args) => {
    originalError.apply(win.console, args);
    Cypress.log({
      name: 'Console Error',
      message: args.join(' '),
      level: 'error'
    });
  };
});

// Enhanced global configuration
Cypress.config('defaultCommandTimeout', 10000);
Cypress.config('requestTimeout', 10000);
Cypress.config('responseTimeout', 30000);
Cypress.config('pageLoadTimeout', 30000);
Cypress.config('viewportWidth', 1280);
Cypress.config('viewportHeight', 720);

// Enhanced beforeEach hook with security and performance validation
beforeEach(() => {
  // Clear sensitive data
  cy.clearCookies();
  cy.clearLocalStorage();
  
  // Reset API interceptors with security headers
  cy.intercept('**/*', (req) => {
    req.headers['x-security-validation'] = 'enabled';
  });

  // Configure viewport for accessibility testing
  cy.viewport(1280, 720);

  // Initialize security validation framework
  cy.window().then((win) => {
    win.localStorage.setItem('SECURITY_MODE', 'strict');
  });

  // Setup performance monitoring
  cy.window().then((win) => {
    win.performance.mark('test-case-start');
  });

  // Configure HIPAA compliance validation
  cy.task('enableHIPAAValidation', true);

  // Initialize vulnerability scanning
  cy.task('securityScan', { enabled: true });

  // Setup error tracking
  cy.on('fail', (error) => {
    cy.task('logTestError', {
      error: error.message,
      testCase: Cypress.currentTest.title
    });
  });
});

// Enhanced afterEach hook with comprehensive validation
afterEach(() => {
  // Validate accessibility compliance
  cy.checkA11y(undefined, {
    includedImpacts: ['critical', 'serious'],
    rules: {
      'color-contrast': { enabled: true },
      'html-has-lang': { enabled: true },
      'valid-aria-roles': { enabled: true }
    }
  });

  // Verify security headers
  cy.verifySecurityHeaders({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'"
  });

  // Check performance metrics
  cy.window().then((win) => {
    win.performance.mark('test-case-end');
    win.performance.measure('test-duration', 'test-case-start', 'test-case-end');
    
    const perfEntries = win.performance.getEntriesByType('measure');
    const testDuration = perfEntries[0].duration;
    
    // Validate against SLA requirements
    expect(testDuration).to.be.lessThan(500, 'Test execution time exceeds SLA threshold');
  });

  // Validate HIPAA compliance
  cy.validateHIPAACompliance();

  // Generate security test report
  cy.task('generateSecurityReport');

  // Clean up test data securely
  cy.task('secureCleanup');

  // Reset authentication state
  cy.clearCookies();
  cy.window().then((win) => {
    win.localStorage.clear();
    win.sessionStorage.clear();
  });

  // Generate test coverage data
  cy.task('generateCoverageReport');
});

// Export enhanced Cypress configuration
export {};