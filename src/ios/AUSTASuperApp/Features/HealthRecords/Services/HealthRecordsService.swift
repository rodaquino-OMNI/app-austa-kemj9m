//
// HealthRecordsService.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// Service class that handles health records management with FHIR compliance and enhanced security
@available(iOS 14.0, *)
public final class HealthRecordsService: ServiceProtocol {
    
    // MARK: - Properties
    
    public let apiClient: APIClient
    public let timeoutInterval: TimeInterval = AppConstants.API.TIMEOUT_INTERVAL
    public let retryCount: Int = AppConstants.API.MAX_RETRY_ATTEMPTS
    public let securityLevel: SecurityLevel = .hipaa
    
    private let encryptionManager: EncryptionManager
    private let securityManager: SecurityManager
    private let cache: NSCache<NSString, HealthRecord>
    private let offlineStorage: FileManager
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    public static let shared = HealthRecordsService()
    
    private init() {
        self.apiClient = APIClient.shared
        self.encryptionManager = EncryptionManager.shared
        self.securityManager = SecurityManager.shared
        
        // Initialize cache with size limits
        self.cache = NSCache<NSString, HealthRecord>()
        self.cache.countLimit = 1000
        self.cache.totalCostLimit = AppConstants.Storage.MAX_CACHE_SIZE
        
        self.offlineStorage = FileManager.default
        
        setupOfflineStorage()
    }
    
    // MARK: - Public Methods
    
    /// Fetches health records with offline support and security validation
    public func fetchHealthRecords(
        patientId: String,
        type: HealthRecordType? = nil,
        forceRefresh: Bool = false
    ) -> AnyPublisher<[HealthRecord], Error> {
        
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(ServiceError.invalidInput("Service not available")))
                return
            }
            
            Task {
                do {
                    // Validate security state
                    try self.securityManager.validateSecurityState().get()
                    
                    // Validate HIPAA compliance
                    try self.validateHIPAACompliance("fetch_records")
                    
                    // Check cache if not forcing refresh
                    if !forceRefresh {
                        if let cachedRecords = self.getCachedRecords(patientId: patientId, type: type) {
                            promise(.success(cachedRecords))
                            return
                        }
                    }
                    
                    // Build request
                    let endpoint = APIEndpoints.healthRecords.getRecords(patientId: patientId)
                    var parameters: [String: Any] = ["patientId": patientId]
                    if let type = type {
                        parameters["type"] = type.rawValue
                    }
                    
                    // Execute request with retry logic
                    try await self.apiClient.request(
                        endpoint: endpoint,
                        method: .get,
                        body: try JSONSerialization.data(withJSONObject: parameters)
                    )
                    .retry(self.retryCount)
                    .tryMap { (data: Data) -> [HealthRecord] in
                        // Decrypt response data
                        let decryptedData = try self.encryptionManager.decrypt(data).get()
                        
                        // Parse and validate FHIR compliance
                        let records = try JSONDecoder().decode([HealthRecord].self, from: decryptedData)
                        try records.forEach { try $0.validate().get() }
                        
                        // Cache valid records
                        self.cacheRecords(records, patientId: patientId)
                        
                        // Store for offline access
                        try self.storeOfflineRecords(records, patientId: patientId)
                        
                        return records
                    }
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                promise(.failure(error))
                            }
                        },
                        receiveValue: { records in
                            promise(.success(records))
                        }
                    )
                    .store(in: &self.cancellables)
                    
                } catch {
                    promise(.failure(error))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    /// Creates a new health record with encryption and validation
    public func createHealthRecord(_ record: HealthRecord) -> AnyPublisher<HealthRecord, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(ServiceError.invalidInput("Service not available")))
                return
            }
            
            Task {
                do {
                    // Validate security and HIPAA compliance
                    try self.securityManager.validateSecurityState().get()
                    try self.validateHIPAACompliance("create_record")
                    
                    // Validate record
                    try record.validate().get()
                    
                    // Encrypt record data
                    let recordData = try JSONEncoder().encode(record)
                    let encryptedData = try self.encryptionManager.encrypt(recordData).get()
                    
                    // Create request
                    let endpoint = APIEndpoints.healthRecords.uploadDocument(type: record.type.rawValue)
                    
                    try await self.apiClient.request(
                        endpoint: endpoint,
                        method: .post,
                        body: encryptedData
                    )
                    .retry(self.retryCount)
                    .tryMap { (data: Data) -> HealthRecord in
                        let decryptedData = try self.encryptionManager.decrypt(data).get()
                        let createdRecord = try JSONDecoder().decode(HealthRecord.self, from: decryptedData)
                        try createdRecord.validate().get()
                        
                        // Cache new record
                        self.cache.setObject(createdRecord, forKey: createdRecord.id as NSString)
                        
                        // Store for offline access
                        try self.storeOfflineRecords([createdRecord], patientId: createdRecord.patientId)
                        
                        return createdRecord
                    }
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                promise(.failure(error))
                            }
                        },
                        receiveValue: { record in
                            promise(.success(record))
                        }
                    )
                    .store(in: &self.cancellables)
                    
                } catch {
                    promise(.failure(error))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupOfflineStorage() {
        let offlineURL = try? offlineStorage.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent(AppConstants.Storage.DIRECTORIES.HEALTH_RECORDS)
        
        try? offlineStorage.createDirectory(
            at: offlineURL!,
            withIntermediateDirectories: true,
            attributes: nil
        )
    }
    
    private func getCachedRecords(patientId: String, type: HealthRecordType?) -> [HealthRecord]? {
        let key = "\(patientId)_\(type?.rawValue ?? "all")" as NSString
        return cache.object(forKey: key) as? [HealthRecord]
    }
    
    private func cacheRecords(_ records: [HealthRecord], patientId: String) {
        let key = "\(patientId)_all" as NSString
        cache.setObject(records as NSArray as! HealthRecord, forKey: key)
        
        // Cache by type
        Dictionary(grouping: records, by: { $0.type }).forEach { type, records in
            let typeKey = "\(patientId)_\(type.rawValue)" as NSString
            cache.setObject(records as NSArray as! HealthRecord, forKey: typeKey)
        }
    }
    
    private func storeOfflineRecords(_ records: [HealthRecord], patientId: String) throws {
        let offlineURL = try offlineStorage.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent(AppConstants.Storage.DIRECTORIES.HEALTH_RECORDS)
            .appendingPathComponent("\(patientId).encrypted")
        
        let recordsData = try JSONEncoder().encode(records)
        let encryptedData = try encryptionManager.encrypt(recordsData).get()
        try encryptedData.write(to: offlineURL, options: .atomicWrite)
    }
}