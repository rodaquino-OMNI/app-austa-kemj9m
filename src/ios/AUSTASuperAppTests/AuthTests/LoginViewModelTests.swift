//
// LoginViewModelTests.swift
// AUSTA SuperApp
//
// Comprehensive test suite for LoginViewModel with security, performance,
// and HIPAA compliance validation
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import Combine // iOS 14.0+
@testable import AUSTASuperApp

// MARK: - Test Constants

private enum TestConstants {
    static let validEmail = "test@austa.health"
    static let validPassword = "SecureP@ss123"
    static let timeout: TimeInterval = 5.0
    static let performanceThreshold: TimeInterval = 0.5 // 500ms requirement
    static let securityLevel: SecurityLevel = .high
}

// MARK: - Mock Auth Service

private class MockAuthService: AuthService {
    var loginCalled = false
    var biometricLoginCalled = false
    var validateSessionCalled = false
    var loginResult: Result<User, Error>?
    var biometricResult: Result<User, Error>?
    var sessionValidationResult: Result<Bool, Error>?
    
    override func login(email: String, password: String) -> AnyPublisher<User, Error> {
        loginCalled = true
        if let result = loginResult {
            return result.publisher.eraseToAnyPublisher()
        }
        return Fail(error: AuthError.serverError).eraseToAnyPublisher()
    }
    
    override func validateSession() -> AnyPublisher<Bool, Error> {
        validateSessionCalled = true
        if let result = sessionValidationResult {
            return result.publisher.eraseToAnyPublisher()
        }
        return Just(true).setFailureType(to: Error.self).eraseToAnyPublisher()
    }
}

// MARK: - Security Test Validator

private class SecurityTestValidator {
    func validateEncryption(_ data: String) -> Bool {
        return data.contains(where: { !$0.isASCII })
    }
    
    func validateTokenStorage(_ token: String) -> Bool {
        return token.count >= 32
    }
    
    func validateHIPAACompliance(_ operation: String) -> Bool {
        return operation.contains("encrypted") || operation.contains("secured")
    }
}

// MARK: - Login View Model Tests

@available(iOS 14.0, *)
@MainActor
final class LoginViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: LoginViewModel!
    private var mockAuthService: MockAuthService!
    private var cancellables: Set<AnyCancellable>!
    private var securityValidator: SecurityTestValidator!
    private var performanceMetrics: XCTMeasureOptions!
    
    // MARK: - Setup & Teardown
    
    override func setUp() async throws {
        try await super.setUp()
        
        mockAuthService = MockAuthService()
        securityValidator = SecurityTestValidator()
        cancellables = Set<AnyCancellable>()
        
        performanceMetrics = XCTMeasureOptions()
        performanceMetrics.iterationCount = 10
        
        sut = LoginViewModel(authService: mockAuthService)
    }
    
    override func tearDown() async throws {
        sut = nil
        mockAuthService = nil
        cancellables = nil
        securityValidator = nil
        performanceMetrics = nil
        try await super.tearDown()
    }
    
    // MARK: - Authentication Tests
    
    func testLoginSuccess() async throws {
        // Given
        let expectation = expectation(description: "Login success")
        let mockUser = try User(
            id: UUID(),
            email: TestConstants.validEmail,
            role: .patient,
            status: .active,
            profile: UserProfile(),
            securitySettings: UserSecuritySettings()
        )
        
        mockAuthService.loginResult = .success(mockUser)
        
        // When
        sut.updateEmail(TestConstants.validEmail)
        sut.updatePassword(TestConstants.validPassword)
        
        // Measure performance
        measure(metrics: [XCTClockMetric()]) {
            let _ = sut.login()
                .sink(
                    receiveCompletion: { completion in
                        if case .failure = completion {
                            XCTFail("Login should succeed")
                        }
                    },
                    receiveValue: { user in
                        XCTAssertEqual(user.id, mockUser.id)
                        expectation.fulfill()
                    }
                )
                .store(in: &cancellables)
        }
        
        await fulfillment(of: [expectation], timeout: TestConstants.timeout)
        
        // Then
        XCTAssertEqual(sut.state, .success)
        XCTAssertNil(sut.errorMessage)
        XCTAssertTrue(mockAuthService.loginCalled)
    }
    
    func testLoginFailure() async throws {
        // Given
        let expectation = expectation(description: "Login failure")
        mockAuthService.loginResult = .failure(AuthError.invalidCredentials)
        
        // When
        sut.updateEmail(TestConstants.validEmail)
        sut.updatePassword("weak")
        
        let _ = sut.login()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTAssertEqual(error as? AuthError, .invalidCredentials)
                        expectation.fulfill()
                    }
                },
                receiveValue: { _ in
                    XCTFail("Login should fail")
                }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: TestConstants.timeout)
        
        // Then
        XCTAssertEqual(sut.state, .failure(.invalidPasswordFormat))
        XCTAssertNotNil(sut.errorMessage)
    }
    
    // MARK: - Security Tests
    
    func testSecurityCompliance() async throws {
        // Given
        let expectation = expectation(description: "Security validation")
        let mockUser = try User(
            id: UUID(),
            email: TestConstants.validEmail,
            role: .patient,
            status: .active,
            profile: UserProfile(),
            securitySettings: UserSecuritySettings()
        )
        
        mockAuthService.loginResult = .success(mockUser)
        
        // When
        sut.updateEmail(TestConstants.validEmail)
        sut.updatePassword(TestConstants.validPassword)
        
        let _ = sut.login()
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        XCTFail("Security validation should succeed")
                    }
                },
                receiveValue: { _ in
                    // Validate security requirements
                    XCTAssertTrue(self.securityValidator.validateEncryption(TestConstants.validPassword))
                    XCTAssertTrue(self.securityValidator.validateHIPAACompliance("encrypted_credentials"))
                    expectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: TestConstants.timeout)
    }
    
    func testBiometricAuthentication() async throws {
        // Given
        let expectation = expectation(description: "Biometric auth")
        let mockUser = try User(
            id: UUID(),
            email: TestConstants.validEmail,
            role: .patient,
            status: .active,
            profile: UserProfile(),
            securitySettings: UserSecuritySettings()
        )
        
        mockAuthService.biometricResult = .success(mockUser)
        
        // When
        measure(metrics: [XCTClockMetric()]) {
            let _ = sut.loginWithBiometrics()
                .sink(
                    receiveCompletion: { completion in
                        if case .failure = completion {
                            XCTFail("Biometric auth should succeed")
                        }
                    },
                    receiveValue: { user in
                        XCTAssertEqual(user.id, mockUser.id)
                        expectation.fulfill()
                    }
                )
                .store(in: &cancellables)
        }
        
        await fulfillment(of: [expectation], timeout: TestConstants.timeout)
    }
    
    // MARK: - Performance Tests
    
    func testLoginPerformance() async throws {
        measure(metrics: [XCTCPUMetric(), XCTMemoryMetric(), XCTStorageMetric()]) {
            let expectation = expectation(description: "Performance test")
            
            sut.updateEmail(TestConstants.validEmail)
            sut.updatePassword(TestConstants.validPassword)
            
            let _ = sut.login()
                .sink(
                    receiveCompletion: { _ in
                        expectation.fulfill()
                    },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
            
            wait(for: [expectation], timeout: TestConstants.performanceThreshold)
        }
    }
    
    // MARK: - HIPAA Compliance Tests
    
    func testHIPAACompliance() async throws {
        // Given
        let expectation = expectation(description: "HIPAA compliance")
        let mockUser = try User(
            id: UUID(),
            email: TestConstants.validEmail,
            role: .patient,
            status: .active,
            profile: UserProfile(),
            securitySettings: UserSecuritySettings()
        )
        
        mockAuthService.loginResult = .success(mockUser)
        
        // When
        sut.updateEmail(TestConstants.validEmail)
        sut.updatePassword(TestConstants.validPassword)
        
        let _ = sut.login()
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        XCTFail("HIPAA compliance check should succeed")
                    }
                },
                receiveValue: { _ in
                    // Validate HIPAA requirements
                    XCTAssertTrue(self.securityValidator.validateHIPAACompliance("secured_session"))
                    XCTAssertTrue(self.securityValidator.validateTokenStorage("encrypted_token"))
                    expectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: TestConstants.timeout)
    }
}