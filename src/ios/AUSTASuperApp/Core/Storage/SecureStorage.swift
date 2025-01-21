//
// SecureStorage.swift
// AUSTA SuperApp
//
// Core secure storage service providing HIPAA and LGPD compliant storage
// for sensitive healthcare data with comprehensive security measures.
//

import Foundation // iOS 14.0+

/// Comprehensive error handling for storage operations
@available(iOS 14.0, *)
public enum StorageError: LocalizedError {
    case securityValidationFailed
    case encryptionFailed
    case storageOperationFailed
    case itemNotFound
    case invalidData
    case integrityCheckFailed
    case jailbreakDetected
    case securityStateCompromised
    case memoryProtectionFailed
    
    public var errorDescription: String? {
        switch self {
        case .securityValidationFailed:
            return "Security validation failed"
        case .encryptionFailed:
            return "Data encryption failed"
        case .storageOperationFailed:
            return "Storage operation failed"
        case .itemNotFound:
            return "Requested item not found"
        case .invalidData:
            return "Invalid data format"
        case .integrityCheckFailed:
            return "Data integrity check failed"
        case .jailbreakDetected:
            return "Device integrity compromised"
        case .securityStateCompromised:
            return "Security state validation failed"
        case .memoryProtectionFailed:
            return "Memory protection check failed"
        }
    }
}

/// Storage policy levels for data classification
@available(iOS 14.0, *)
public enum StoragePolicy {
    case standard    // Regular app data
    case sensitive   // PII data
    case critical    // PHI/Healthcare data
}

/// Security state of the storage system
@available(iOS 14.0, *)
private enum SecurityState {
    case secure
    case compromised
    case unknown
}

/// Thread-safe secure storage service for healthcare data
@available(iOS 14.0, *)
public final class SecureStorage {
    
    // MARK: - Properties
    
    public static let shared = SecureStorage()
    
    private let keychainManager: KeychainManager
    private let encryptionManager: EncryptionManager
    private let securityManager: SecurityManager
    private let operationQueue: DispatchQueue
    private var securityState: SecurityState
    private let logger: OSLog
    
    // MARK: - Initialization
    
    private init() {
        // Initialize core components
        keychainManager = KeychainManager.shared
        encryptionManager = EncryptionManager.shared
        securityManager = SecurityManager.shared
        
        // Create dedicated serial queue for storage operations
        operationQueue = DispatchQueue(
            label: "com.austa.superapp.storage",
            qos: .userInitiated
        )
        
        // Initialize security state
        securityState = .unknown
        
        // Configure secure logging
        logger = OSLog(subsystem: Bundle.main.bundleIdentifier ?? "com.austa.superapp",
                      category: "SecureStorage")
        
        // Perform initial security validation
        validateSecurityState()
        
        // Setup continuous security monitoring
        setupSecurityMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Securely stores data with policy enforcement and audit logging
    public func store(data: Data, key: String, policy: StoragePolicy) -> Result<Void, StorageError> {
        return operationQueue.sync {
            do {
                // Validate runtime integrity
                try validateRuntimeIntegrity()
                
                // Verify security state
                guard securityState == .secure else {
                    throw StorageError.securityStateCompromised
                }
                
                // Encrypt data based on policy
                let encryptedData = try encryptionManager.encrypt(data).get()
                
                // Store in keychain with appropriate access level
                let accessLevel: AccessLevel = policy == .critical ? .whenUnlocked : .afterFirstUnlock
                try keychainManager.saveItem(encryptedData, key: key, accessLevel: accessLevel).get()
                
                // Log storage event
                os_log("Data stored successfully for key: %{public}@", log: logger, type: .debug, key)
                
                return .success(())
            } catch let error as StorageError {
                return .failure(error)
            } catch {
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    /// Securely retrieves data with integrity verification
    public func retrieve(key: String) -> Result<Data, StorageError> {
        return operationQueue.sync {
            do {
                // Validate security state
                guard securityState == .secure else {
                    throw StorageError.securityStateCompromised
                }
                
                // Retrieve encrypted data
                let encryptedData = try keychainManager.retrieveItem(key).get()
                
                // Decrypt and verify integrity
                let decryptedData = try encryptionManager.decrypt(encryptedData).get()
                
                // Log retrieval event
                os_log("Data retrieved successfully for key: %{public}@", log: logger, type: .debug, key)
                
                return .success(decryptedData)
            } catch let error as StorageError {
                return .failure(error)
            } catch {
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    /// Securely removes data with verification
    public func remove(key: String) -> Result<Void, StorageError> {
        return operationQueue.sync {
            do {
                // Validate security state
                guard securityState == .secure else {
                    throw StorageError.securityStateCompromised
                }
                
                // Remove from keychain
                try keychainManager.removeItem(key).get()
                
                // Log removal event
                os_log("Data removed successfully for key: %{public}@", log: logger, type: .debug, key)
                
                return .success(())
            } catch let error as StorageError {
                return .failure(error)
            } catch {
                return .failure(.storageOperationFailed)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func validateSecurityState() {
        let result = securityManager.validateSecurityState()
        switch result {
        case .success:
            securityState = .secure
        case .failure:
            securityState = .compromised
            handleSecurityViolation()
        }
    }
    
    private func validateRuntimeIntegrity() throws {
        guard securityManager.enforceSecurityPolicy(requiredLevel: .critical).isSuccess else {
            throw StorageError.securityValidationFailed
        }
    }
    
    private func setupSecurityMonitoring() {
        // Monitor security state changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSecurityStateChange(_:)),
            name: NSNotification.Name("SecurityStateChanged"),
            object: nil
        )
        
        // Setup periodic validation
        Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.validateSecurityState()
        }
    }
    
    @objc private func handleSecurityStateChange(_ notification: Notification) {
        validateSecurityState()
    }
    
    private func handleSecurityViolation() {
        // Log security violation
        os_log("Security violation detected", log: logger, type: .error)
        
        // Notify observers
        NotificationCenter.default.post(
            name: NSNotification.Name("SecureStorageViolation"),
            object: nil
        )
    }
}