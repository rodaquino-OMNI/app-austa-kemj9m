//
// ClaimsViewModel.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SwiftUI // Version: iOS 14.0+

/// Thread-safe ViewModel managing claims-related business logic with HIPAA compliance
@MainActor
@available(iOS 14.0, *)
public final class ClaimsViewModel: ObservableObject, ViewModelProtocol {
    
    // MARK: - Published Properties
    
    @Published private(set) var claims: [Claim] = []
    @Published var selectedClaim: Claim?
    @Published var state: ViewModelState = .idle
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false
    @Published var lifecycleState: ViewModelLifecycle = .inactive
    
    // MARK: - Private Properties
    
    private let claimsService: ClaimsService
    private let securityUtils: SecurityUtils
    private var cancellables = Set<AnyCancellable>()
    private let claimsCache = NSCache<NSString, Claim>()
    private let performanceMonitor: PerformanceMonitor
    private let auditLogger: AuditLogger
    private let secureQueue = DispatchQueue(label: "com.austa.claims.viewmodel", qos: .userInitiated)
    
    // MARK: - Initialization
    
    /// Initializes the claims view model with required dependencies
    public init(
        claimsService: ClaimsService,
        securityUtils: SecurityUtils,
        performanceMonitor: PerformanceMonitor,
        auditLogger: AuditLogger
    ) {
        self.claimsService = claimsService
        self.securityUtils = securityUtils
        self.performanceMonitor = performanceMonitor
        self.auditLogger = auditLogger
        
        setupSecureCache()
        setupPerformanceMonitoring()
        setupAuditLogging()
    }
    
    // MARK: - Public Methods
    
    /// Fetches claims with HIPAA compliance and performance optimization
    public func fetchClaims() async throws {
        do {
            state = .loading
            isLoading = true
            
            // Start performance tracking
            let tracker = performanceMonitor.startOperation("fetch_claims")
            
            // Validate security context
            try await validateSecurityContext()
            
            // Attempt to fetch from cache first
            if let cachedClaims = fetchFromSecureCache() {
                self.claims = cachedClaims
                updateState(.success)
                return
            }
            
            // Fetch from service with retry mechanism
            try await claimsService.getClaims(status: nil)
                .retry(3)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        guard let self = self else { return }
                        switch completion {
                        case .finished:
                            self.updateState(.success)
                        case .failure(let error):
                            self.handleError(error)
                        }
                        tracker.stop()
                    },
                    receiveValue: { [weak self] claims in
                        guard let self = self else { return }
                        self.processClaims(claims)
                    }
                )
                .store(in: &cancellables)
            
        } catch {
            handleError(error)
        }
    }
    
    /// Submits a new claim with encryption and compliance validation
    public func submitClaim(_ claim: Claim, documents: [Document]) async throws {
        do {
            state = .loading
            isLoading = true
            
            // Start performance tracking
            let tracker = performanceMonitor.startOperation("submit_claim")
            
            // Validate security and HIPAA compliance
            try await validateSecurityContext()
            try await validateHIPAACompliance()
            
            // Encrypt sensitive data
            let encryptedClaim = try securityUtils.encryptSensitiveData(claim)
            let encryptedDocuments = try documents.map { try securityUtils.encryptSensitiveData($0) }
            
            // Submit claim with retry mechanism
            try await claimsService.submitClaim(claim: encryptedClaim, supportingDocuments: encryptedDocuments)
                .retry(3)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { [weak self] completion in
                        guard let self = self else { return }
                        switch completion {
                        case .finished:
                            self.updateState(.success)
                            self.auditClaimSubmission(claim)
                        case .failure(let error):
                            self.handleError(error)
                        }
                        tracker.stop()
                    },
                    receiveValue: { [weak self] submittedClaim in
                        guard let self = self else { return }
                        self.updateClaimsAfterSubmission(submittedClaim)
                    }
                )
                .store(in: &cancellables)
            
        } catch {
            handleError(error)
        }
    }
    
    // MARK: - Private Methods
    
    private func setupSecureCache() {
        claimsCache.countLimit = 100
        claimsCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }
    
    private func setupPerformanceMonitoring() {
        performanceMonitor.configure(
            thresholds: [
                "fetch_claims": 500, // 500ms
                "submit_claim": 1000 // 1s
            ]
        )
    }
    
    private func setupAuditLogging() {
        auditLogger.configure(
            options: [
                "module": "claims",
                "security_level": "hipaa",
                "retention_period": 7 * 365 // 7 years
            ]
        )
    }
    
    private func validateSecurityContext() async throws {
        guard try await securityUtils.validateHIPAACompliance() else {
            throw ServiceError.hipaaViolation
        }
    }
    
    private func validateHIPAACompliance() async throws {
        try await securityUtils.validateHIPAACompliance()
    }
    
    private func fetchFromSecureCache() -> [Claim]? {
        return secureQueue.sync {
            // Implementation of secure cache retrieval
            return nil
        }
    }
    
    private func processClaims(_ claims: [Claim]) {
        secureQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Process and cache claims securely
            claims.forEach { claim in
                let key = claim.id as NSString
                self.claimsCache.setObject(claim, forKey: key)
            }
            
            DispatchQueue.main.async {
                self.claims = claims
            }
        }
    }
    
    private func updateClaimsAfterSubmission(_ claim: Claim) {
        secureQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Update cache and state
            let key = claim.id as NSString
            self.claimsCache.setObject(claim, forKey: key)
            
            DispatchQueue.main.async {
                self.claims.append(claim)
            }
        }
    }
    
    private func auditClaimSubmission(_ claim: Claim) {
        auditLogger.logEvent(
            type: "claim_submission",
            metadata: [
                "claim_id": claim.id,
                "timestamp": Date().timeIntervalSince1970,
                "user_id": UserContext.shared.userId
            ]
        )
    }
    
    private func updateState(_ newState: ViewModelState) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.state = newState
            self.isLoading = false
        }
    }
    
    // MARK: - Cleanup
    
    deinit {
        cleanup()
    }
}

// MARK: - Error Handling Extension

extension ClaimsViewModel {
    private func handleError(_ error: Error) {
        let serviceError = error as? ServiceError ?? .dataValidationError
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.state = .error(serviceError)
            self.isLoading = false
            self.errorMessage = serviceError.localizedDescription
            
            // Log error for HIPAA compliance
            self.auditLogger.logError(
                error: serviceError,
                metadata: [
                    "module": "claims",
                    "timestamp": Date().timeIntervalSince1970
                ]
            )
        }
    }
}