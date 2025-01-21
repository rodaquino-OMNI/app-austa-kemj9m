//
// HealthRecordsViewModelTests.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import XCTest
import Combine
@testable import AUSTASuperApp

@available(iOS 14.0, *)
@MainActor
final class MockHealthRecordsService: HealthRecordsService {
    var mockRecords: [HealthRecord] = []
    var mockError: Error?
    var fetchCalled = false
    var deleteCalled = false
    var lastDeletedId: String?
    var auditLogs: [String: Any] = [:]
    var securityPolicy: SecurityPolicy
    var isOfflineMode = false
    var encryptedData: [String: Data] = [:]
    
    init(securityPolicy: SecurityPolicy) {
        self.securityPolicy = securityPolicy
        super.init()
    }
    
    override func fetchHealthRecords(
        patientId: String,
        type: HealthRecordType? = nil,
        forceRefresh: Bool = false
    ) -> AnyPublisher<[HealthRecord], Error> {
        fetchCalled = true
        
        // Validate security state
        guard securityPolicy.validateSecurityState().get() != nil else {
            return Fail(error: ServiceError.securityViolation).eraseToAnyPublisher()
        }
        
        // Log access attempt
        auditLogs["fetch_\(UUID().uuidString)"] = [
            "timestamp": Date(),
            "patientId": patientId,
            "type": type?.rawValue ?? "all"
        ]
        
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        // Apply FHIR validation
        let validRecords = mockRecords.filter { record in
            do {
                try record.validate().get()
                return true
            } catch {
                return false
            }
        }
        
        // Handle offline mode
        if isOfflineMode {
            if let cachedData = encryptedData[patientId] {
                do {
                    let decryptedData = try EncryptionManager.shared.decrypt(cachedData).get()
                    let records = try JSONDecoder().decode([HealthRecord].self, from: decryptedData)
                    return Just(records)
                        .setFailureType(to: Error.self)
                        .eraseToAnyPublisher()
                } catch {
                    return Fail(error: error).eraseToAnyPublisher()
                }
            }
        }
        
        return Just(validRecords)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
    
    override func deleteRecord(_ recordId: String) -> AnyPublisher<Void, Error> {
        deleteCalled = true
        lastDeletedId = recordId
        
        // Verify deletion authorization
        guard securityPolicy.validateSecurityState().get() != nil else {
            return Fail(error: ServiceError.securityViolation).eraseToAnyPublisher()
        }
        
        // Create audit trail
        auditLogs["delete_\(UUID().uuidString)"] = [
            "timestamp": Date(),
            "recordId": recordId,
            "action": "delete"
        ]
        
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        // Remove from encrypted storage
        encryptedData.removeValue(forKey: recordId)
        
        return Just(())
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}

@available(iOS 14.0, *)
@MainActor
final class HealthRecordsViewModelTests: XCTestCase {
    
    private var viewModel: HealthRecordsViewModel!
    private var mockService: MockHealthRecordsService!
    private var cancellables = Set<AnyCancellable>()
    private var testSecurityPolicy: SecurityPolicy!
    private var auditTrail: [String: Any] = [:]
    
    override func setUp() async throws {
        // Initialize security policy
        testSecurityPolicy = SecurityManager.shared
        
        // Set up mock service with security
        mockService = MockHealthRecordsService(securityPolicy: testSecurityPolicy)
        
        // Initialize view model with secure configuration
        viewModel = HealthRecordsViewModel(
            service: mockService,
            patientId: "test_patient_123",
            logger: SecurityEventLogger()
        )
        
        // Set up audit logging
        auditTrail = [:]
        
        // Initialize test encryption
        let testData = try JSONEncoder().encode([HealthRecord]())
        mockService.encryptedData = ["test_patient_123": try EncryptionManager.shared.encrypt(testData).get()]
    }
    
    override func tearDown() async throws {
        // Verify audit trail completeness
        XCTAssertFalse(mockService.auditLogs.isEmpty, "Audit trail should not be empty")
        
        // Clear sensitive test data
        mockService.mockRecords = []
        mockService.encryptedData = [:]
        
        // Reset security context
        mockService.securityPolicy = testSecurityPolicy
        
        // Clear encrypted data
        mockService.encryptedData.removeAll()
        
        // Reset mock services
        mockService = nil
        viewModel = nil
        cancellables.removeAll()
    }
    
    func testSecureHealthRecordsFetch() async throws {
        // Set up encrypted test records
        let testRecord = try HealthRecord(
            id: "test_123",
            patientId: "test_patient_123",
            providerId: "provider_456",
            type: .observation,
            date: Date(),
            content: ["test": "data"]
        )
        mockService.mockRecords = [testRecord]
        
        // Verify security policy enforcement
        let expectation = XCTestExpectation(description: "Fetch records")
        var fetchedRecords: [HealthRecord] = []
        
        viewModel.loadHealthRecords()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Fetch failed with error: \(error)")
                    }
                    expectation.fulfill()
                },
                receiveValue: { records in
                    fetchedRecords = records
                }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: 5.0)
        
        // Test FHIR validation
        XCTAssertTrue(mockService.fetchCalled, "Service fetch method should be called")
        XCTAssertEqual(fetchedRecords.count, 1, "Should fetch one valid record")
        XCTAssertEqual(fetchedRecords.first?.id, "test_123", "Should fetch correct record")
        
        // Verify audit logging
        XCTAssertTrue(mockService.auditLogs.contains { $0.key.starts(with: "fetch_") })
        
        // Validate data encryption
        XCTAssertFalse(mockService.encryptedData.isEmpty, "Encrypted data should exist")
    }
    
    func testOfflineMode() async throws {
        // Enable offline mode
        mockService.isOfflineMode = true
        
        // Set up test data
        let testRecord = try HealthRecord(
            id: "offline_123",
            patientId: "test_patient_123",
            providerId: "provider_456",
            type: .observation,
            date: Date(),
            content: ["test": "offline_data"]
        )
        
        let recordsData = try JSONEncoder().encode([testRecord])
        mockService.encryptedData["test_patient_123"] = try EncryptionManager.shared.encrypt(recordsData).get()
        
        // Test offline fetch
        let expectation = XCTestExpectation(description: "Offline fetch")
        var fetchedRecords: [HealthRecord] = []
        
        viewModel.loadHealthRecords()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Offline fetch failed with error: \(error)")
                    }
                    expectation.fulfill()
                },
                receiveValue: { records in
                    fetchedRecords = records
                }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: 5.0)
        
        // Verify cached data access
        XCTAssertEqual(fetchedRecords.count, 1, "Should fetch one cached record")
        XCTAssertEqual(fetchedRecords.first?.id, "offline_123", "Should fetch correct cached record")
        
        // Test sync mechanism
        mockService.isOfflineMode = false
        let syncExpectation = XCTestExpectation(description: "Sync records")
        
        viewModel.syncOfflineRecords()
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Sync failed with error: \(error)")
                    }
                    syncExpectation.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [syncExpectation], timeout: 5.0)
        
        // Validate offline security
        XCTAssertTrue(mockService.auditLogs.contains { $0.key.starts(with: "fetch_") })
        
        // Check audit consistency
        XCTAssertFalse(mockService.auditLogs.isEmpty, "Offline operations should be audited")
    }
    
    func testSecureDelete() async throws {
        // Set up test record
        let testRecord = try HealthRecord(
            id: "delete_123",
            patientId: "test_patient_123",
            providerId: "provider_456",
            type: .observation,
            date: Date(),
            content: ["test": "delete_data"]
        )
        mockService.mockRecords = [testRecord]
        
        // Test deletion
        let expectation = XCTestExpectation(description: "Delete record")
        
        viewModel.deleteRecord("delete_123")
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Delete failed with error: \(error)")
                    }
                    expectation.fulfill()
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        await fulfillment(of: [expectation], timeout: 5.0)
        
        // Verify deletion authorization
        XCTAssertTrue(mockService.deleteCalled, "Delete method should be called")
        XCTAssertEqual(mockService.lastDeletedId, "delete_123", "Correct record should be deleted")
        
        // Check audit trail creation
        XCTAssertTrue(mockService.auditLogs.contains { $0.key.starts(with: "delete_") })
        
        // Validate secure deletion
        XCTAssertNil(mockService.encryptedData["delete_123"], "Encrypted data should be removed")
        
        // Test compliance logging
        XCTAssertTrue(mockService.auditLogs.contains { log in
            guard let action = (log.value as? [String: Any])?["action"] as? String else { return false }
            return action == "delete"
        })
    }
}