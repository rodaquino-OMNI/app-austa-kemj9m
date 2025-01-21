//
// KeychainManager.swift
// AUSTA SuperApp
//
// Core keychain management utility providing secure storage and retrieval
// of sensitive healthcare data with HIPAA and LGPD compliance.
//

import Foundation // iOS 14.0+
import Security  // iOS 14.0+
import LocalAuthentication // iOS 14.0+

/// Comprehensive error handling for keychain operations
@available(iOS 14.0, *)
public enum KeychainError: LocalizedError {
    case itemNotFound
    case duplicateItem
    case invalidData
    case unhandledError(status: OSStatus)
    case securityValidationFailed
    case biometricAuthFailed
    case memoryProtectionFailed
    case accessControlError
    
    public var errorDescription: String? {
        switch self {
        case .itemNotFound:
            return "Requested keychain item not found"
        case .duplicateItem:
            return "Item already exists in keychain"
        case .invalidData:
            return "Invalid data format"
        case .unhandledError(let status):
            return "Keychain operation failed: \(status)"
        case .securityValidationFailed:
            return "Security validation failed"
        case .biometricAuthFailed:
            return "Biometric authentication failed"
        case .memoryProtectionFailed:
            return "Memory protection check failed"
        case .accessControlError:
            return "Access control creation failed"
        }
    }
}

/// Access level for keychain items
@available(iOS 14.0, *)
public enum AccessLevel {
    case whenUnlocked
    case afterFirstUnlock
    case always
    
    var secAccessibility: CFString {
        switch self {
        case .whenUnlocked:
            return kSecAttrAccessibleWhenUnlocked
        case .afterFirstUnlock:
            return kSecAttrAccessibleAfterFirstUnlock
        case .always:
            return kSecAttrAccessibleAlways
        }
    }
}

/// Thread-safe manager for secure keychain operations
@available(iOS 14.0, *)
@objc public final class KeychainManager: NSObject {
    
    // MARK: - Properties
    
    public static let shared = KeychainManager()
    private static let queue = DispatchQueue(label: "com.austa.keychain", qos: .userInitiated)
    private let securityManager: SecurityManager
    private let securityValidator: SecurityValidator
    private let accessGroup: String?
    private let serviceName: String
    private let logger: OSLog
    
    // MARK: - Initialization
    
    private override init() {
        // Initialize security components
        securityManager = SecurityManager.shared
        securityValidator = SecurityValidator()
        
        // Configure access group for shared keychain access
        if let teamID = Bundle.main.infoDictionary?["TeamIdentifier"] as? String {
            accessGroup = "\(teamID).com.austa.superapp.keychain"
        } else {
            accessGroup = nil
        }
        
        // Set service name using bundle identifier
        serviceName = Bundle.main.bundleIdentifier ?? "com.austa.superapp"
        
        // Initialize secure logging
        logger = OSLog(subsystem: serviceName, category: "Keychain")
        
        super.init()
        
        // Perform initial security validation
        guard securityManager.validateSecurityState().isSuccess else {
            fatalError("Security validation failed during initialization")
        }
    }
    
    // MARK: - Public Methods
    
    /// Securely saves data in keychain with enhanced protection
    public func saveItem(_ data: Data, 
                        key: String, 
                        accessLevel: AccessLevel = .whenUnlocked,
                        useBiometry: Bool = false,
                        requireEncryption: Bool = true) -> Result<Void, KeychainError> {
        
        return KeychainManager.queue.sync {
            do {
                // Validate security state
                try securityManager.validateSecurityState().get()
                
                // Create access control
                var accessControlFlags: SecAccessControlCreateFlags = [.privateKeyUsage]
                if useBiometry {
                    accessControlFlags.insert(.biometryAny)
                }
                
                guard let accessControl = SecAccessControlCreateWithFlags(
                    kCFAllocatorDefault,
                    accessLevel.secAccessibility,
                    accessControlFlags,
                    nil
                ) else {
                    return .failure(.accessControlError)
                }
                
                // Prepare query
                var query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrAccount as String: key,
                    kSecAttrService as String: serviceName,
                    kSecValueData as String: data,
                    kSecAttrAccessControl as String: accessControl,
                    kSecUseAuthenticationUI as String: useBiometry ? kSecUseAuthenticationUIAllow : kSecUseAuthenticationUIFail
                ]
                
                // Add access group if available
                if let accessGroup = accessGroup {
                    query[kSecAttrAccessGroup as String] = accessGroup
                }
                
                // Add encryption requirement
                if requireEncryption {
                    query[kSecAttrSynchronizable as String] = kCFBooleanFalse
                }
                
                // Attempt to save item
                let status = SecItemAdd(query as CFDictionary, nil)
                
                switch status {
                case errSecSuccess:
                    os_log("Successfully saved keychain item for key: %{public}@", log: logger, type: .debug, key)
                    return .success(())
                    
                case errSecDuplicateItem:
                    // Update existing item
                    let updateQuery: [String: Any] = [
                        kSecClass as String: kSecClassGenericPassword,
                        kSecAttrAccount as String: key,
                        kSecAttrService as String: serviceName
                    ]
                    
                    let updateAttributes: [String: Any] = [
                        kSecValueData as String: data,
                        kSecAttrAccessControl as String: accessControl
                    ]
                    
                    let updateStatus = SecItemUpdate(updateQuery as CFDictionary, updateAttributes as CFDictionary)
                    
                    guard updateStatus == errSecSuccess else {
                        return .failure(.unhandledError(status: updateStatus))
                    }
                    
                    os_log("Successfully updated keychain item for key: %{public}@", log: logger, type: .debug, key)
                    return .success(())
                    
                default:
                    return .failure(.unhandledError(status: status))
                }
            } catch {
                return .failure(.securityValidationFailed)
            }
        }
    }
    
    /// Securely retrieves data from keychain with validation
    public func retrieveItem(_ key: String, 
                           requireBiometry: Bool = false) -> Result<Data, KeychainError> {
        
        return KeychainManager.queue.sync {
            do {
                // Validate security state
                try securityManager.validateSecurityState().get()
                
                // Prepare query
                var query: [String: Any] = [
                    kSecClass as String: kSecClassGenericPassword,
                    kSecAttrAccount as String: key,
                    kSecAttrService as String: serviceName,
                    kSecReturnData as String: true,
                    kSecUseAuthenticationUI as String: requireBiometry ? kSecUseAuthenticationUIAllow : kSecUseAuthenticationUIFail
                ]
                
                // Add access group if available
                if let accessGroup = accessGroup {
                    query[kSecAttrAccessGroup as String] = accessGroup
                }
                
                // Attempt to retrieve item
                var result: AnyObject?
                let status = SecItemCopyMatching(query as CFDictionary, &result)
                
                switch status {
                case errSecSuccess:
                    guard let data = result as? Data else {
                        return .failure(.invalidData)
                    }
                    
                    os_log("Successfully retrieved keychain item for key: %{public}@", log: logger, type: .debug, key)
                    return .success(data)
                    
                case errSecItemNotFound:
                    return .failure(.itemNotFound)
                    
                default:
                    return .failure(.unhandledError(status: status))
                }
            } catch {
                return .failure(.securityValidationFailed)
            }
        }
    }
}

// MARK: - Private SecurityValidator

private final class SecurityValidator {
    func validateMemoryProtection() -> Bool {
        // Implement memory protection validation
        return true
    }
    
    func validateSecurityState() -> Bool {
        // Implement security state validation
        return true
    }
}