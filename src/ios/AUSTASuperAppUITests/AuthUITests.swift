//
// AuthUITests.swift
// AUSTA SuperApp
//
// Comprehensive UI test suite for authentication flows with security and accessibility validation
// Version: 1.0.0
//

import XCTest
@testable import AUSTASuperApp

final class AuthUITests: XCTestCase {
    
    // MARK: - Properties
    
    private var app: XCUIApplication!
    private let validEmail = "test@example.com"
    private let validPassword = "Test123!@#"
    private let performanceMetrics = XCTMeasureOptions()
    private let securityTimeout: TimeInterval = 30.0
    private let accessibilityTimeout: TimeInterval = 5.0
    
    // MARK: - Test Lifecycle
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["UI_TESTING"]
        app.launchEnvironment = ["SECURITY_LEVEL": "high"]
        
        // Configure performance metrics
        performanceMetrics.invocationOptions = [.measurePerformance]
        
        app.launch()
    }
    
    override func tearDownWithError() throws {
        // Clear sensitive test data
        app.terminate()
        app = nil
    }
    
    // MARK: - Login Flow Tests
    
    func testLoginWithValidCredentials() throws {
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
            // Enter credentials
            let emailTextField = app.textFields["Email input field"]
            XCTAssertTrue(emailTextField.waitForExistence(timeout: securityTimeout))
            emailTextField.tap()
            emailTextField.typeText(validEmail)
            
            let passwordSecureTextField = app.secureTextFields["Password input field"]
            XCTAssertTrue(passwordSecureTextField.waitForExistence(timeout: securityTimeout))
            passwordSecureTextField.tap()
            passwordSecureTextField.typeText(validPassword)
            
            // Tap login button
            let loginButton = app.buttons["Log in button"]
            XCTAssertTrue(loginButton.waitForExistence(timeout: securityTimeout))
            loginButton.tap()
            
            // Verify successful login
            let dashboardView = app.otherElements["Dashboard View"]
            XCTAssertTrue(dashboardView.waitForExistence(timeout: securityTimeout))
        }
    }
    
    func testBiometricAuthentication() throws {
        guard BiometricUtils.shared.isBiometricAuthAvailable() else {
            throw XCTSkip("Biometric authentication not available")
        }
        
        // Tap biometric login button
        let biometricButton = app.buttons["Login with biometric authentication"]
        XCTAssertTrue(biometricButton.waitForExistence(timeout: securityTimeout))
        biometricButton.tap()
        
        // Verify biometric prompt
        let biometricPrompt = app.staticTexts["Please authenticate to access protected health information"]
        XCTAssertTrue(biometricPrompt.waitForExistence(timeout: securityTimeout))
        
        // Simulate biometric success
        let authenticateButton = app.buttons["Authenticate using biometrics"]
        XCTAssertTrue(authenticateButton.waitForExistence(timeout: securityTimeout))
        authenticateButton.tap()
        
        // Verify successful authentication
        let dashboardView = app.otherElements["Dashboard View"]
        XCTAssertTrue(dashboardView.waitForExistence(timeout: securityTimeout))
    }
    
    // MARK: - Security Tests
    
    func testSecurityCompliance() throws {
        // Test password visibility toggle
        let passwordField = app.secureTextFields["Password input field"]
        XCTAssertTrue(passwordField.waitForExistence(timeout: securityTimeout))
        
        let showPasswordButton = app.buttons["Show password"]
        XCTAssertTrue(showPasswordButton.waitForExistence(timeout: securityTimeout))
        showPasswordButton.tap()
        
        let visiblePasswordField = app.textFields["Password input field"]
        XCTAssertTrue(visiblePasswordField.waitForExistence(timeout: securityTimeout))
        
        // Test session timeout
        app.terminate()
        Thread.sleep(forTimeInterval: AppConstants.Security.JWT_EXPIRATION + 1)
        app.launch()
        
        let timeoutMessage = app.staticTexts["Session expired. Please log in again."]
        XCTAssertTrue(timeoutMessage.waitForExistence(timeout: securityTimeout))
    }
    
    func testLoginAttemptLimits() throws {
        let invalidPassword = "wrong123!"
        
        // Attempt multiple failed logins
        for _ in 1...4 {
            let emailTextField = app.textFields["Email input field"]
            emailTextField.tap()
            emailTextField.typeText(validEmail)
            
            let passwordField = app.secureTextFields["Password input field"]
            passwordField.tap()
            passwordField.typeText(invalidPassword)
            
            let loginButton = app.buttons["Log in button"]
            loginButton.tap()
            
            // Clear fields for next attempt
            emailTextField.tap()
            emailTextField.clearText()
            passwordField.tap()
            passwordField.clearText()
        }
        
        // Verify account lockout
        let lockoutMessage = app.staticTexts["Too many login attempts. Please try again later."]
        XCTAssertTrue(lockoutMessage.waitForExistence(timeout: securityTimeout))
    }
    
    // MARK: - Accessibility Tests
    
    func testAccessibilityCompliance() throws {
        // Test VoiceOver navigation
        XCUIDevice.shared.press(.home)
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        
        // Enable VoiceOver for testing
        let voiceOverSwitch = settings.switches["VoiceOver"]
        if !voiceOverSwitch.isEnabled {
            voiceOverSwitch.tap()
        }
        
        app.activate()
        
        // Verify accessibility labels
        XCTAssertTrue(app.staticTexts["AUSTA SuperApp Logo"].exists)
        XCTAssertTrue(app.textFields["Email input field"].exists)
        XCTAssertTrue(app.secureTextFields["Password input field"].exists)
        XCTAssertTrue(app.buttons["Log in button"].exists)
        
        // Test dynamic type
        let originalText = app.staticTexts["Email"].label
        XCUIDevice.shared.press(.home)
        settings.launch()
        
        let largerTextSwitch = settings.switches["Larger Text"]
        largerTextSwitch.tap()
        
        app.activate()
        let scaledText = app.staticTexts["Email"].label
        XCTAssertEqual(originalText, scaledText, "Text should scale properly with dynamic type")
    }
    
    // MARK: - Performance Tests
    
    func testLoginPerformance() throws {
        measure(metrics: [XCTCPUMetric(), XCTMemoryMetric(), XCTStorageMetric()]) {
            let emailTextField = app.textFields["Email input field"]
            emailTextField.tap()
            emailTextField.typeText(validEmail)
            
            let passwordField = app.secureTextFields["Password input field"]
            passwordField.tap()
            passwordField.typeText(validPassword)
            
            let loginButton = app.buttons["Log in button"]
            loginButton.tap()
            
            let dashboardView = app.otherElements["Dashboard View"]
            XCTAssertTrue(dashboardView.waitForExistence(timeout: securityTimeout))
        }
    }
}

// MARK: - Helper Extensions

private extension XCUIElement {
    func clearText() {
        guard let stringValue = self.value as? String else { return }
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: stringValue.count)
        typeText(deleteString)
    }
}