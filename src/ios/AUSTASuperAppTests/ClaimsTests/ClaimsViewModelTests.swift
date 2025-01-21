//
// ClaimsViewModelTests.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import XCTest // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
@testable import AUSTASuperApp

/// Comprehensive test suite for ClaimsViewModel functionality including security and performance validation
@available(iOS 14.0, *)
@MainActor
final class ClaimsViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var viewModel: ClaimsViewModel!
    private var mockClaimsService: MockClaimsService!
    private var mockSecurityUtils: MockSecurityUtils!
    private var mockPerformanceMonitor: MockPerformanceMonitor!
    private var mockAuditLogger: MockAuditLogger!
    private var cancellables: Set<AnyCancellable>!
    private var performanceMetrics: XCTMeasureOptions!
    
    // MARK: - Setup & Teardown
    
    override func setUpWithError() throws {
        try super.setUpWithError()
        
        // Initialize mocks
        mockClaimsService = MockClaimsService()
        mockSecurityUtils = MockSecurityUtils()
        mockPerformanceMonitor = MockPerformanceMonitor()
        mockAuditLogger = MockAuditLogger()
        
        // Initialize view model with mocks
        viewModel = ClaimsViewModel(
            claimsService: mockClaimsService,
            securityUtils: mockSecurityUtils,
            performanceMonitor: mockPerformanceMonitor,
            auditLogger: mockAuditLogger
        )
        
        // Initialize cancellables set
        cancellables = Set<AnyCancellable>()
        
        // Configure performance measurement
        performanceMetrics = XCTMeasureOptions()
        performanceMetrics.iterationCount = 10
    }
    
    override func tearDownWithError() throws {
        viewModel = nil
        mockClaimsService = nil
        mockSecurityUtils = nil
        mockPerformanceMonitor = nil
        mockAuditLogger = nil
        cancellables = nil
        performanceMetrics = nil
        try super.tearDownWithError()
    }
    
    // MARK: - Initialization Tests
    
    func testInitialState() {
        XCTAssertEqual(viewModel.state, .idle)
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
        XCTAssertTrue(viewModel.claims.isEmpty)
    }
    
    // MARK: - Security Tests
    
    func testHIPAAComplianceValidation() async throws {
        // Configure security validation expectation
        mockSecurityUtils.validateHIPAAComplianceResult = true
        
        // Create test claim
        let claim = createTestClaim()
        
        // Attempt to submit claim
        try await viewModel.submitClaim(claim, documents: [])
        
        // Verify HIPAA compliance was checked
        XCTAssertTrue(mockSecurityUtils.validateHIPAAComplianceWasCalled)
        XCTAssertEqual(mockAuditLogger.loggedEvents.count, 1)
        XCTAssertEqual(mockAuditLogger.loggedEvents.first?.type, "claim_submission")
    }
    
    func testSecurityViolationHandling() async {
        // Configure security validation to fail
        mockSecurityUtils.validateHIPAAComplianceResult = false
        
        // Create test claim
        let claim = createTestClaim()
        
        // Attempt to submit claim and expect failure
        do {
            try await viewModel.submitClaim(claim, documents: [])
            XCTFail("Expected security violation error")
        } catch {
            XCTAssertEqual(viewModel.state, .error(.hipaaViolation))
            XCTAssertNotNil(viewModel.errorMessage)
            XCTAssertTrue(mockAuditLogger.loggedErrors.contains { $0.type == "security_violation" })
        }
    }
    
    // MARK: - Performance Tests
    
    func testSubmitClaimPerformance() throws {
        // Configure performance measurement
        measure(options: performanceMetrics) {
            let expectation = expectation(description: "Claim submission")
            
            // Create test claim
            let claim = createTestClaim()
            
            // Configure mock service for success
            mockClaimsService.submitClaimResult = .success(createEncryptedClaim())
            
            // Measure submission performance
            Task {
                do {
                    try await viewModel.submitClaim(claim, documents: [])
                    expectation.fulfill()
                } catch {
                    XCTFail("Claim submission failed: \(error)")
                }
            }
            
            wait(for: [expectation], timeout: 1.0)
            
            // Verify performance metrics
            XCTAssertLessThanOrEqual(
                mockPerformanceMonitor.lastOperationDuration,
                0.5, // 500ms requirement
                "Claim submission exceeded performance requirement"
            )
        }
    }
    
    func testClaimsFetchPerformance() throws {
        measure(options: performanceMetrics) {
            let expectation = expectation(description: "Claims fetch")
            
            // Configure mock service with test data
            mockClaimsService.getClaimsResult = .success([createEncryptedClaim()])
            
            // Measure fetch performance
            Task {
                do {
                    try await viewModel.fetchClaims()
                    expectation.fulfill()
                } catch {
                    XCTFail("Claims fetch failed: \(error)")
                }
            }
            
            wait(for: [expectation], timeout: 1.0)
            
            // Verify performance metrics
            XCTAssertLessThanOrEqual(
                mockPerformanceMonitor.lastOperationDuration,
                0.5,
                "Claims fetch exceeded performance requirement"
            )
        }
    }
    
    // MARK: - Error Handling Tests
    
    func testNetworkErrorHandling() async {
        // Configure mock service to simulate network error
        mockClaimsService.getClaimsResult = .failure(.networkError)
        
        // Attempt to fetch claims
        do {
            try await viewModel.fetchClaims()
            XCTFail("Expected network error")
        } catch {
            XCTAssertEqual(viewModel.state, .error(.networkError))
            XCTAssertNotNil(viewModel.errorMessage)
            XCTAssertTrue(mockAuditLogger.loggedErrors.contains { $0.type == "network_error" })
        }
    }
    
    // MARK: - Helper Methods
    
    private func createTestClaim() -> Claim {
        return Claim(
            id: UUID().uuidString,
            patientId: "TEST_PATIENT",
            providerId: "TEST_PROVIDER",
            serviceDate: Date(),
            amount: 150.00,
            description: "Test medical service",
            status: .pending
        )
    }
    
    private func createEncryptedClaim() -> EncryptedClaim {
        return EncryptedClaim(
            id: UUID().uuidString,
            encryptedData: Data(),
            signature: "TEST_SIGNATURE"
        )
    }
}

// MARK: - Mock Classes

private class MockClaimsService: ClaimsService {
    var submitClaimResult: Result<EncryptedClaim, ServiceError>?
    var getClaimsResult: Result<[EncryptedClaim], ServiceError>?
    
    override func submitClaim(claim: Claim, supportingDocuments: [Document]) async throws -> EncryptedClaim {
        guard let result = submitClaimResult else {
            throw ServiceError.dataValidationError
        }
        return try result.get()
    }
    
    override func getClaims(status: ClaimStatus?) async throws -> [EncryptedClaim] {
        guard let result = getClaimsResult else {
            throw ServiceError.dataValidationError
        }
        return try result.get()
    }
}

private class MockSecurityUtils {
    var validateHIPAAComplianceResult: Bool = true
    var validateHIPAAComplianceWasCalled = false
    
    func validateHIPAACompliance() async throws -> Bool {
        validateHIPAAComplianceWasCalled = true
        return validateHIPAAComplianceResult
    }
}

private class MockPerformanceMonitor {
    var lastOperationDuration: TimeInterval = 0
    
    func startOperation(_ name: String) -> PerformanceTracker {
        return PerformanceTracker(name: name) { duration in
            self.lastOperationDuration = duration
        }
    }
}

private class MockAuditLogger {
    struct LoggedEvent {
        let type: String
        let metadata: [String: Any]
    }
    
    var loggedEvents: [LoggedEvent] = []
    var loggedErrors: [LoggedEvent] = []
    
    func logEvent(type: String, metadata: [String: Any]) {
        loggedEvents.append(LoggedEvent(type: type, metadata: metadata))
    }
    
    func logError(error: Error, metadata: [String: Any]) {
        loggedErrors.append(LoggedEvent(type: "error", metadata: metadata))
    }
}