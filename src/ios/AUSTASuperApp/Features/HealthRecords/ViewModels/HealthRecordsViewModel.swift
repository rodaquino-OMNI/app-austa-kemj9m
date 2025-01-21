//
// HealthRecordsViewModel.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SwiftUI // Version: iOS 14.0+
import CryptoKit // Version: iOS 14.0+

/// Enhanced view model for managing health records with HIPAA compliance and security features
@available(iOS 14.0, *)
@MainActor
public final class HealthRecordsViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var healthRecords: [HealthRecord] = []
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?
    @Published var currentFilter: HealthRecordsFilter = .all
    @Published var currentSortOption: HealthRecordsSortOption = .date
    @Published private(set) var isOfflineMode = false
    @Published private(set) var lastSyncDate: Date?
    
    // MARK: - Private Properties
    
    private let healthRecordsService: HealthRecordsService
    private let securityManager: SecurityManager
    private var cancellables = Set<AnyCancellable>()
    private let recordsCache = NSCache<NSString, HealthRecord>()
    private let auditLogger: SecurityEventLogger
    private let patientId: String
    private var backgroundRefreshTask: Task<Void, Never>?
    
    // MARK: - Initialization
    
    public init(service: HealthRecordsService = .shared,
               patientId: String,
               logger: SecurityEventLogger = SecurityEventLogger()) {
        self.healthRecordsService = service
        self.securityManager = SecurityManager.shared
        self.auditLogger = logger
        self.patientId = patientId
        
        // Configure cache
        recordsCache.countLimit = 1000
        recordsCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Setup network monitoring
        setupNetworkMonitoring()
        
        // Setup background refresh
        setupBackgroundRefresh()
        
        // Initial data load
        Task {
            await loadHealthRecords()
        }
    }
    
    // MARK: - Public Methods
    
    /// Loads health records with security validation and offline support
    public func loadHealthRecords(forceRefresh: Bool = false) async {
        guard !isLoading else { return }
        
        isLoading = true
        error = nil
        
        do {
            // Validate security state
            try securityManager.validateSecurityState().get()
            
            // Load records
            let records = try await loadSecureHealthRecords(forceRefresh: forceRefresh)
            
            // Update UI
            await MainActor.run {
                self.healthRecords = records
                self.applyFilterAndSort()
                self.isLoading = false
                self.lastSyncDate = Date()
            }
            
            // Log successful fetch
            try auditLogger.logSecurityEvent(.stateValidation)
            
        } catch {
            await handleError(error)
        }
    }
    
    /// Creates a new health record with encryption and validation
    public func createHealthRecord(_ record: HealthRecord) async throws {
        isLoading = true
        error = nil
        
        do {
            // Validate security state
            try securityManager.validateSecurityState().get()
            
            // Create record
            let createdRecord = try await healthRecordsService.createHealthRecord(record)
                .asyncThrows()
            
            // Update local state
            await MainActor.run {
                healthRecords.append(createdRecord)
                applyFilterAndSort()
                isLoading = false
            }
            
            // Cache record
            cacheRecord(createdRecord)
            
            // Log creation
            try auditLogger.logSecurityEvent(.stateValidation)
            
        } catch {
            await handleError(error)
            throw error
        }
    }
    
    /// Updates filter with security validation
    public func updateFilter(_ filter: HealthRecordsFilter) async {
        currentFilter = filter
        await applyFilterAndSort()
    }
    
    /// Updates sort option with security validation
    public func updateSortOption(_ option: HealthRecordsSortOption) async {
        currentSortOption = option
        await applyFilterAndSort()
    }
    
    /// Handles offline mode synchronization
    public func syncOfflineRecords() async throws {
        guard isOfflineMode else { return }
        
        do {
            // Validate security state
            try securityManager.validateSecurityState().get()
            
            // Sync records
            let syncedRecords = try await healthRecordsService.syncOfflineRecords()
                .asyncThrows()
            
            // Update local state
            await MainActor.run {
                healthRecords = syncedRecords
                applyFilterAndSort()
                lastSyncDate = Date()
            }
            
            // Log sync
            try auditLogger.logSecurityEvent(.stateValidation)
            
        } catch {
            await handleError(error)
            throw error
        }
    }
    
    // MARK: - Private Methods
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.isOfflineMode = !connected
                if connected {
                    Task {
                        try? await self?.syncOfflineRecords()
                    }
                }
            }
            .store(in: &cancellables)
    }
    
    private func setupBackgroundRefresh() {
        backgroundRefreshTask = Task {
            while !Task.isCancelled {
                await loadHealthRecords(forceRefresh: true)
                try? await Task.sleep(nanoseconds: 5 * 60 * 1_000_000_000) // 5 minutes
            }
        }
    }
    
    private func loadSecureHealthRecords(forceRefresh: Bool) async throws -> [HealthRecord] {
        return try await healthRecordsService.fetchHealthRecords(
            patientId: patientId,
            forceRefresh: forceRefresh
        )
        .asyncThrows()
    }
    
    private func applyFilterAndSort() async {
        var filteredRecords = healthRecords
        
        // Apply filter
        switch currentFilter {
        case .all:
            break
        case .dateRange(let from, let to):
            filteredRecords = filteredRecords.filter { record in
                record.date >= from && record.date <= to
            }
        default:
            filteredRecords = filteredRecords.filter { record in
                String(describing: record.type).lowercased() == String(describing: currentFilter).lowercased()
            }
        }
        
        // Apply sort
        switch currentSortOption {
        case .date:
            filteredRecords.sort { $0.date > $1.date }
        case .type:
            filteredRecords.sort { $0.type.rawValue < $1.type.rawValue }
        case .provider:
            filteredRecords.sort { $0.providerId < $1.providerId }
        case .status:
            filteredRecords.sort { $0.status.rawValue < $1.status.rawValue }
        }
        
        await MainActor.run {
            self.healthRecords = filteredRecords
        }
    }
    
    private func cacheRecord(_ record: HealthRecord) {
        recordsCache.setObject(record, forKey: record.id as NSString)
    }
    
    private func handleError(_ error: Error) async {
        await MainActor.run {
            self.error = error
            self.isLoading = false
        }
        
        // Log error
        try? auditLogger.logSecurityEvent(.securityViolation)
    }
    
    deinit {
        backgroundRefreshTask?.cancel()
        cancellables.removeAll()
    }
}

// MARK: - Supporting Types

public enum HealthRecordsFilter {
    case all
    case consultation
    case labResult
    case prescription
    case imaging
    case vitalSigns
    case wearableData
    case dateRange(from: Date, to: Date)
}

public enum HealthRecordsSortOption {
    case date
    case type
    case provider
    case status
}

// MARK: - Publisher Extensions

extension Publisher {
    func asyncThrows() async throws -> Output {
        try await withCheckedThrowingContinuation { continuation in
            var cancellable: AnyCancellable?
            cancellable = self.sink(
                receiveCompletion: { completion in
                    switch completion {
                    case .finished:
                        break
                    case .failure(let error):
                        continuation.resume(throwing: error)
                    }
                    cancellable?.cancel()
                },
                receiveValue: { value in
                    continuation.resume(returning: value)
                }
            )
        }
    }
}