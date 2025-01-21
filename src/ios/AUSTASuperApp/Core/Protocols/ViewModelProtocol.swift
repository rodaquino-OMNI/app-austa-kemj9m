//
// ViewModelProtocol.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import os.log // Version: iOS 14.0+

/// Represents the possible states of a view model
public enum ViewModelState: Equatable {
    case idle
    case loading
    case error(ServiceError)
    case success
}

/// Represents the lifecycle states of a view model
public enum ViewModelLifecycle: Equatable {
    case active
    case inactive
    case deallocated
}

/// Core protocol that defines the base contract for all view model components
/// with comprehensive state management and HIPAA compliance features
public protocol ViewModelProtocol: AnyObject {
    // MARK: - Published Properties
    
    /// Current state of the view model
    var state: ViewModelState { get set }
    
    /// Current error message if any
    var errorMessage: String? { get set }
    
    /// Loading state indicator
    var isLoading: Bool { get set }
    
    /// Current lifecycle state
    var lifecycleState: ViewModelLifecycle { get set }
    
    // MARK: - Internal Properties
    
    /// Set of cancellables for managing subscriptions
    var cancellables: Set<AnyCancellable> { get set }
    
    // MARK: - Required Methods
    
    /// Handles errors in a HIPAA-compliant manner
    /// - Parameter error: The service error to handle
    func handleError(_ error: ServiceError)
    
    /// Processes successful operations with state updates
    /// - Parameter result: The successful result to process
    func handleSuccess<T>(_ result: T)
    
    /// Resets the view model state
    func resetState()
    
    /// Performs cleanup operations
    func cleanup()
}

// MARK: - Default Implementation

public extension ViewModelProtocol {
    /// Logger instance for secure logging
    private var logger: OSLog {
        OSLog(subsystem: AppConstants.Security.KEYCHAIN_SERVICE, category: "ViewModel")
    }
    
    /// Handles errors with secure logging and state management
    func handleError(_ error: ServiceError) {
        os_log("Error occurred: %{public}@", log: logger, type: .error, error.localizedDescription)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.state = .error(error)
            self.isLoading = false
            self.errorMessage = error.localizedDescription
            
            // Log error for HIPAA compliance
            if case .hipaaViolation = error {
                self.logHIPAAViolation(error)
            }
        }
    }
    
    /// Processes successful operations with state updates
    func handleSuccess<T>(_ result: T) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.state = .success
            self.isLoading = false
            self.errorMessage = nil
            
            // Log success for audit trail
            os_log("Operation completed successfully", log: self.logger, type: .info)
        }
    }
    
    /// Resets view model to initial state
    func resetState() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.state = .idle
            self.isLoading = false
            self.errorMessage = nil
        }
    }
    
    /// Performs cleanup operations when view model is deallocated
    func cleanup() {
        cancellables.removeAll()
        lifecycleState = .deallocated
        
        // Log cleanup for audit trail
        os_log("ViewModel cleanup completed", log: logger, type: .info)
    }
    
    /// Logs HIPAA compliance violations
    private func logHIPAAViolation(_ error: ServiceError) {
        os_log(
            "HIPAA Violation: %{public}@",
            log: logger,
            type: .fault,
            error.localizedDescription
        )
        
        // Additional HIPAA compliance logging
        if AppConstants.Features.ENABLE_ANALYTICS {
            let metadata: [String: Any] = [
                "error_type": "hipaa_violation",
                "timestamp": Date().timeIntervalSince1970,
                "severity": "high"
            ]
            
            // Log to analytics system
            let eventType = AppConstants.Analytics.EVENT_TYPES.SECURITY
            // Implementation of analytics logging would go here
        }
    }
}

// MARK: - Lifecycle Management

public extension ViewModelProtocol {
    /// Activates the view model
    func activate() {
        lifecycleState = .active
        os_log("ViewModel activated", log: logger, type: .info)
    }
    
    /// Deactivates the view model
    func deactivate() {
        lifecycleState = .inactive
        os_log("ViewModel deactivated", log: logger, type: .info)
    }
}

// MARK: - State Management Helpers

public extension ViewModelProtocol {
    /// Updates loading state with proper state management
    func setLoading(_ isLoading: Bool) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.isLoading = isLoading
            self.state = isLoading ? .loading : .idle
        }
    }
    
    /// Creates a publisher for state changes
    func statePublisher() -> AnyPublisher<ViewModelState, Never> {
        Just(state)
            .eraseToAnyPublisher()
    }
}