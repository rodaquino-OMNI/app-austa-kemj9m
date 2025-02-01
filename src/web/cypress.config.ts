import { defineConfig } from 'cypress'; // v13.0.0
import '@cypress/code-coverage'; // v3.12.0
import '@cypress/audit'; // v1.0.0

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    experimentalStudio: false,
    chromeWebSecurity: true,

    // Enhanced environment configuration with security and compliance settings
    env: {
      apiUrl: 'http://localhost:4000',
      coverage: true,
      codeCoverage: {
        url: '/api/__coverage__',
        exclude: [
          'cypress/**/*.*',
          'public/**/*.*',
          '**/node_modules/**/*.*'
        ]
      },
      // Security validation settings
      securityValidation: true,
      securityHeaders: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Content-Security-Policy': "default-src 'self'"
      },
      // HIPAA compliance settings
      hipaaCompliance: true,
      dataEncryption: true,
      auditLogging: true,
      // Performance monitoring
      performanceMonitoring: true,
      performanceThresholds: {
        maxResponseTime: 500,
        maxLoadTime: 3000
      },
      // Accessibility testing
      accessibilityTesting: true,
      a11y: {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'section508']
        }
      },
      // Network resilience
      retryOnNetworkFailure: true,
      networkFailureThreshold: 3
    },

    // Enhanced timeout configurations
    responseTimeout: 30000,
    pageLoadTimeout: 60000,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,

    // Memory management
    numTestsKeptInMemory: 50,

    // Security-enhanced network configuration
    blockHosts: [
      '*google-analytics.com',
      '*hotjar.com',
      '*.doubleclick.net',
      '*.facebook.com'
    ],

    // Enhanced reporting configuration
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
      configFile: 'reporter-config.json',
      reportDir: 'cypress/reports',
      overwrite: true,
      html: true,
      json: true
    },

    // Retry configuration for test stability
    retries: {
      runMode: 2,
      openMode: 0
    },

    // Video recording configuration
    video: false,
    videoCompression: 32,
    videoUploadOnPasses: false,

    // Screenshot configuration
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/screenshots',
    trashAssetsBeforeRuns: true,

    // Enhanced viewport configuration
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Component testing configuration
    component: {
      specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
      supportFile: 'cypress/support/component.ts',
      indexHtmlFile: 'cypress/support/component-index.html'
    }
  },

  // Enhanced security and compliance plugins
  env: {
    codeCoverage: {
      exclude: [
        'cypress/**/*.*',
        'public/**/*.*',
        '**/node_modules/**/*.*'
      ]
    }
  },

  // Security headers validation
  headers: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'"
  }
});