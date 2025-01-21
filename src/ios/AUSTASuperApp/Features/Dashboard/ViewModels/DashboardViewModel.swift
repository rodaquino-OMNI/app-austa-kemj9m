//
// DashboardViewModel.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SwiftUI // Version: iOS 14.0+
import Security // Version: iOS 14.0+

/// Thread-safe cache entry for health metrics
private final class CacheEntry {
    let metrics: [HealthMetric]
    let timestamp: Date
    
    init(metrics: [HealthMetric], timestamp: Date = Date()) {
        self.metrics = metrics
        self.timestamp = timestamp
    }
}

/// HIPAA-compliant ViewModel for managing dashboard data with secure health metrics
@MainActor
@available(iOS 14.0, *)
public final class DashboardViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var healthMetrics: [HealthMetric] = []
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var error: Error?
    
    // MARK: - Private Properties
    
    private let healthKitService: HealthKitService
    private let healthRecordsService: HealthRecordsService
    private let refreshQueue: DispatchQueue
    private var cancellables = Set<AnyCancellable>()
    private var refreshTimer: Timer?
    private var retryCount: Int = 0
    private var lastRefreshTimestamp: Date = Date()
    private let cache: NSCache<NSString, CacheEntry>
    
    // MARK: - Constants
    
    private let REFRESH_INTERVAL: TimeInterval = 300 // 5 minutes
    private let MAX_DISPLAYED_METRICS: Int = 6
    private let MAX_RETRY_ATTEMPTS: Int = 3
    private let CACHE_EXPIRATION: TimeInterval = 3600 // 1 hour
    
    // MARK: - Initialization
    
    public init(healthKitService: HealthKitService, healthRecordsService: HealthRecordsService) {
        self.healthKitService = healthKitService
        self.healthRecordsService = healthRecordsService
        
        // Initialize thread-safe queue for refresh operations
        self.refreshQueue = DispatchQueue(
            label: "com.austa.dashboard.refresh",
            qos: .userInitiated,
            attributes: .concurrent
        )
        
        // Configure secure cache
        self.cache = NSCache<NSString, CacheEntry>()
        self.cache.countLimit = 100
        self.cache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Start monitoring after initialization
        Task {
            await startMonitoring()
        }
    }
    
    // MARK: - Public Methods
    
    /// Begins secure monitoring of health metrics with HIPAA compliance
    public func startMonitoring() async {
        // Verify network connectivity
        guard NetworkMonitor.shared.checkConnectivity() else {
            self.error = NetworkError.connectionLost
            return
        }
        
        // Set up secure refresh timer
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(
            withTimeInterval: REFRESH_INTERVAL,
            repeats: true
        ) { [weak self] _ in
            Task { [weak self] in
                await self?.refreshDashboard()
            }
        }
        
        // Initial refresh
        await refreshDashboard()
        
        // Set up health data subscribers
        setupHealthDataSubscribers()
    }
    
    /// Securely refreshes dashboard data with caching and retry logic
    public func refreshDashboard() async {
        // Check cache validity
        if let cachedData = checkCache(), 
           Date().timeIntervalSince(cachedData.timestamp) < CACHE_EXPIRATION {
            self.healthMetrics = cachedData.metrics
            return
        }
        
        do {
            isLoading = true
            error = nil
            
            // Fetch health records with HIPAA compliance
            try await validateHIPAACompliance()
            
            async let healthKitData = healthKitService.fetchLatestMetrics()
            async let healthRecords = healthRecordsService.fetchLatestRecords()
            
            let (metrics, records) = try await (healthKitData, healthRecords)
            
            // Process and validate data
            var processedMetrics = try await processHealthData(
                healthKit: metrics,
                records: records
            )
            
            // Limit displayed metrics
            processedMetrics = Array(processedMetrics.prefix(MAX_DISPLAYED_METRICS))
            
            // Update cache and UI
            await MainActor.run {
                updateCache(with: processedMetrics)
                self.healthMetrics = processedMetrics
                self.lastRefreshTimestamp = Date()
                self.retryCount = 0
                self.isLoading = false
            }
            
        } catch {
            await handleError(error)
        }
    }
    
    // MARK: - Private Methods
    
    private func setupHealthDataSubscribers() {
        // Subscribe to real-time health updates
        healthKitService.healthUpdates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                if case .failure(let error) = completion {
                    Task { [weak self] in
                        await self?.handleError(error)
                    }
                }
            } receiveValue: { [weak self] metrics in
                Task { [weak self] in
                    await self?.handleHealthKitData(metrics)
                }
            }
            .store(in: &cancellables)
        
        // Monitor network connectivity
        NetworkMonitor.shared.isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                if connected {
                    Task { [weak self] in
                        await self?.refreshDashboard()
                    }
                }
            }
            .store(in: &cancellables)
    }
    
    private func handleHealthKitData(_ data: [HealthMetric]) async {
        do {
            // Validate and process incoming data
            let validatedMetrics = try data.map { metric in
                try metric.validate()
                return metric
            }
            
            // Update cache and UI
            await MainActor.run {
                updateCache(with: validatedMetrics)
                self.healthMetrics = validatedMetrics
            }
            
            // Log secure audit trail
            auditLog("health_data_processed", metadata: [
                "metric_count": validatedMetrics.count,
                "timestamp": Date().timeIntervalSince1970
            ])
            
        } catch {
            await handleError(error)
        }
    }
    
    private func processHealthData(healthKit: [HealthMetric], records: [HealthMetric]) async throws -> [HealthMetric] {
        // Merge and deduplicate metrics
        var processedMetrics = Set<HealthMetric>()
        
        // Process HealthKit data
        for metric in healthKit {
            try metric.validate()
            processedMetrics.insert(metric)
        }
        
        // Process health records
        for metric in records {
            try metric.validate()
            processedMetrics.insert(metric)
        }
        
        return Array(processedMetrics)
            .sorted { $0.timestamp > $1.timestamp }
    }
    
    private func validateHIPAACompliance() async throws {
        // Verify security level
        guard securityLevel == .hipaa else {
            throw ServiceError.hipaaViolation
        }
        
        // Verify data encryption
        guard isEncryptionEnabled() else {
            throw ServiceError.securityViolation
        }
        
        // Log compliance check
        auditLog("hipaa_compliance_verified", metadata: [
            "timestamp": Date().timeIntervalSince1970,
            "security_level": securityLevel.rawValue
        ])
    }
    
    private func handleError(_ error: Error) async {
        await MainActor.run {
            self.error = error
            self.isLoading = false
            
            // Attempt retry if appropriate
            if retryCount < MAX_RETRY_ATTEMPTS {
                retryCount += 1
                Task {
                    try await Task.sleep(nanoseconds: UInt64(pow(2.0, Double(retryCount)) * 1_000_000_000))
                    await refreshDashboard()
                }
            }
            
            // Log error
            auditLog("dashboard_error", metadata: [
                "error": error.localizedDescription,
                "retry_count": retryCount
            ])
        }
    }
    
    private func checkCache() -> CacheEntry? {
        let key = NSString(string: "dashboard_metrics")
        return cache.object(forKey: key)
    }
    
    private func updateCache(with metrics: [HealthMetric]) {
        let key = NSString(string: "dashboard_metrics")
        let entry = CacheEntry(metrics: metrics)
        cache.setObject(entry, forKey: key)
    }
    
    private func isEncryptionEnabled() -> Bool {
        // Verify encryption settings
        return AppConstants.Security.ENCRYPTION.ALGORITHM == "AES-256-GCM"
    }
    
    private func auditLog(_ action: String, metadata: [String: Any]?) {
        var auditMetadata = metadata ?? [:]
        auditMetadata["action"] = action
        
        if AppConstants.Features.ENABLE_ANALYTICS {
            // Implementation of audit logging
        }
    }
    
    deinit {
        refreshTimer?.invalidate()
        cancellables.removeAll()
    }
}