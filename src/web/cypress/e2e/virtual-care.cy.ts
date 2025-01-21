// External imports
import '@testing-library/cypress'; // v10.0.0
import 'cypress'; // v13.0.0

// Internal imports
import { login } from '../support/commands';

describe('Virtual Care Module', () => {
  beforeEach(() => {
    // Mock WebRTC APIs
    cy.window().then((win) => {
      win.MediaStream = class MockMediaStream {
        getTracks() { return []; }
        getVideoTracks() { return []; }
        getAudioTracks() { return []; }
      };
      win.RTCPeerConnection = class MockRTCPeerConnection {
        createOffer() { return Promise.resolve({}); }
        setLocalDescription() { return Promise.resolve(); }
        setRemoteDescription() { return Promise.resolve(); }
        addTrack() {}
      };
    });

    // Mock media devices
    cy.stub(navigator.mediaDevices, 'getUserMedia').resolves(new MediaStream());
    cy.stub(navigator.mediaDevices, 'enumerateDevices').resolves([
      { kind: 'videoinput', deviceId: 'video1', label: 'Camera 1' },
      { kind: 'audioinput', deviceId: 'audio1', label: 'Microphone 1' }
    ]);

    // Set up network interceptors
    cy.intercept('POST', '/api/virtual-care/session/start', {
      statusCode: 200,
      body: { sessionId: 'test-session-123', token: 'mock-token' }
    }).as('startSession');

    cy.intercept('POST', '/api/virtual-care/session/end', {
      statusCode: 200
    }).as('endSession');

    // Login with test provider account
    cy.login({ 
      email: 'test.provider@austa.health',
      role: 'PROVIDER',
      status: 'ACTIVE'
    });
  });

  it('should load video consultation interface', () => {
    // Visit consultation page with security validation
    cy.visit('/virtual-care/consultation', {
      onBeforeLoad: (win) => {
        cy.stub(win.console, 'error').as('consoleError');
      }
    });

    // Verify security headers
    cy.request('/virtual-care/consultation').then((response) => {
      expect(response.headers).to.include({
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY'
      });
    });

    // Verify main video containers
    cy.findByTestId('provider-video').should('exist');
    cy.findByTestId('patient-video').should('exist');

    // Verify control buttons
    cy.findByRole('button', { name: /mute/i }).should('exist');
    cy.findByRole('button', { name: /camera/i }).should('exist');
    cy.findByRole('button', { name: /share/i }).should('exist');
    cy.findByRole('button', { name: /chat/i }).should('exist');
    cy.findByRole('button', { name: /end/i }).should('exist');

    // Verify HIPAA compliance elements
    cy.findByText(/encrypted session/i).should('exist');
    cy.findByText(/hipaa compliant/i).should('exist');
  });

  it('should handle WebRTC connection', () => {
    cy.visit('/virtual-care/consultation');

    // Wait for session initialization
    cy.wait('@startSession').then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
      expect(interception.response?.body).to.have.property('sessionId');
    });

    // Verify media permissions
    cy.window().then((win) => {
      expect(win.navigator.mediaDevices.getUserMedia).to.be.called;
    });

    // Verify video streams
    cy.findByTestId('provider-video')
      .should('have.prop', 'readyState')
      .should('not.equal', 0);

    // Test connection status indicators
    cy.findByTestId('connection-status')
      .should('contain.text', 'Connected');
  });

  it('should toggle audio/video controls', () => {
    cy.visit('/virtual-care/consultation');

    // Test audio mute/unmute
    cy.findByRole('button', { name: /mute/i }).as('muteButton').click();
    cy.get('@muteButton')
      .should('have.attr', 'aria-pressed', 'true')
      .and('have.attr', 'aria-label', /unmute/i);

    // Test video toggle
    cy.findByRole('button', { name: /camera/i }).as('cameraButton').click();
    cy.get('@cameraButton')
      .should('have.attr', 'aria-pressed', 'true')
      .and('have.attr', 'aria-label', /start video/i);

    // Verify device selection
    cy.findByRole('button', { name: /device settings/i }).click();
    cy.findByRole('combobox', { name: /camera/i })
      .should('contain.text', 'Camera 1');
    cy.findByRole('combobox', { name: /microphone/i })
      .should('contain.text', 'Microphone 1');
  });

  it('should handle chat messages', () => {
    cy.visit('/virtual-care/consultation');

    // Open chat panel
    cy.findByRole('button', { name: /chat/i }).click();
    cy.findByTestId('chat-panel').should('be.visible');

    // Test message input
    const testMessage = 'Test message for secure chat';
    cy.findByRole('textbox', { name: /message/i })
      .type(testMessage)
      .type('{enter}');

    // Verify message display
    cy.findByTestId('chat-messages')
      .should('contain.text', testMessage);

    // Test file sharing
    cy.findByTestId('file-upload')
      .attachFile('test-document.pdf');
    cy.findByText(/document shared/i).should('exist');
  });

  it('should end consultation properly', () => {
    cy.visit('/virtual-care/consultation');

    // End consultation
    cy.findByRole('button', { name: /end/i }).click();
    cy.findByRole('dialog', { name: /end consultation/i })
      .findByRole('button', { name: /confirm/i })
      .click();

    // Verify cleanup
    cy.wait('@endSession').then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
    });

    // Verify navigation
    cy.url().should('include', '/virtual-care/summary');

    // Verify consultation summary
    cy.findByTestId('consultation-summary')
      .should('contain.text', 'Consultation ended')
      .and('contain.text', new Date().toLocaleDateString());
  });
});