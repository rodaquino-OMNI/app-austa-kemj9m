//
// BiometricUtils.swift
// AUSTA SuperApp
//
// Thread-safe utility class providing comprehensive biometric authentication
// functionality with enhanced security measures and robust error handling.
//
// LocalAuthentication v1.0 - iOS 14.0+
// Foundation v1.0 - iOS 14.0+

import LocalAuthentication
import Foundation

/// Represents the available types of biometric authentication
@available(iOS 14.0, *)
public enum BiometricType {
    case faceID
    case touchID
    case none
}

/// Detailed result of biometric authentication including security context
@available(iOS 14.0, *)
public struct BiometricAuthResult {
    public let success: Bool
    public let authenticationType: BiometricType
    public let securityLevel: BiometricSecurityLevel
    
    fileprivate init(success: Bool, type: BiometricType, level: BiometricSecurityLevel) {
        self.success = success
        self.authenticationType = type
        self.securityLevel = level
    }
}

/// Comprehensive error cases for biometric authentication
@available(iOS 14.0, *)
public enum BiometricAuthError: Error {
    case notAvailable
    case notEnrolled
    case authFailed
    case systemCancel
    case userCancel
    case securityViolation
    case tooManyAttempts
    case timeout
    
    var localizedDescription: String {
        switch self {
        case .notAvailable:
            return NSLocalizedString("Biometric authentication is not available on this device.", comment: "")
        case .notEnrolled:
            return NSLocalizedString("No biometric authentication method is enrolled.", comment: "")
        case .authFailed:
            return NSLocalizedString("Biometric authentication failed.", comment: "")
        case .systemCancel:
            return NSLocalizedString("System canceled authentication.", comment: "")
        case .userCancel:
            return NSLocalizedString("User canceled authentication.", comment: "")
        case .securityViolation:
            return NSLocalizedString("Security requirements are not met.", comment: "")
        case .tooManyAttempts:
            return NSLocalizedString("Too many failed authentication attempts.", comment: "")
        case .timeout:
            return NSLocalizedString("Authentication timed out.", comment: "")
        }
    }
}

/// Security level of biometric authentication
@available(iOS 14.0, *)
fileprivate enum BiometricSecurityLevel {
    case high
    case medium
    case low
    case compromised
}

/// Thread-safe utility class for managing biometric authentication
@available(iOS 14.0, *)
public final class BiometricUtils {
    
    // MARK: - Singleton
    
    public static let shared = BiometricUtils()
    
    // MARK: - Private Properties
    
    private let context = LAContext()
    private static let biometricQueue = DispatchQueue(label: "com.austa.superapp.biometric", qos: .userInitiated)
    private let maxAuthAttempts = 3
    private let authTimeout: TimeInterval = 30.0
    private var authenticationAttempts = 0
    
    // MARK: - Initialization
    
    private init() {
        context.localizedCancelTitle = NSLocalizedString("Cancel", comment: "")
        context.localizedFallbackTitle = NSLocalizedString("Use Passcode", comment: "")
    }
    
    // MARK: - Public Methods
    
    /// Checks if biometric authentication is available and meets security requirements
    @discardableResult
    public func isBiometricAuthAvailable() -> Bool {
        var isAvailable = false
        BiometricUtils.biometricQueue.sync {
            var error: NSError?
            isAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) &&
                         !isDeviceCompromised()
        }
        return isAvailable
    }
    
    /// Determines the available type of biometric authentication
    public func getBiometricType() -> BiometricType {
        var biometricType = BiometricType.none
        BiometricUtils.biometricQueue.sync {
            if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
                switch context.biometryType {
                case .faceID:
                    biometricType = .faceID
                case .touchID:
                    biometricType = .touchID
                default:
                    biometricType = .none
                }
            }
        }
        return biometricType
    }
    
    /// Authenticates user using available biometric method
    public func authenticateUser(reason: String, completion: @escaping (Result<BiometricAuthResult, BiometricAuthError>) -> Void) {
        BiometricUtils.biometricQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Validate availability and security
            guard self.isBiometricAuthAvailable() else {
                completion(.failure(.notAvailable))
                return
            }
            
            // Check attempt limits
            guard self.authenticationAttempts < self.maxAuthAttempts else {
                completion(.failure(.tooManyAttempts))
                return
            }
            
            // Configure authentication
            let context = LAContext()
            context.localizedReason = reason
            
            // Set timeout
            let timeoutTimer = DispatchWorkItem { [weak self] in
                self?.handleAuthTimeout(completion: completion)
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + self.authTimeout, execute: timeoutTimer)
            
            // Perform authentication
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { [weak self] success, error in
                timeoutTimer.cancel()
                self?.handleAuthResult(success: success, error: error as NSError?, completion: completion)
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func handleAuthResult(success: Bool, error: NSError?, completion: @escaping (Result<BiometricAuthResult, BiometricAuthError>) -> Void) {
        if success {
            authenticationAttempts = 0
            let result = BiometricAuthResult(
                success: true,
                type: getBiometricType(),
                level: getSecurityLevel()
            )
            completion(.success(result))
        } else {
            authenticationAttempts += 1
            let authError = mapLAError(error)
            completion(.failure(authError))
        }
    }
    
    private func handleAuthTimeout(completion: @escaping (Result<BiometricAuthResult, BiometricAuthError>) -> Void) {
        completion(.failure(.timeout))
    }
    
    private func mapLAError(_ error: NSError?) -> BiometricAuthError {
        guard let error = error else { return .authFailed }
        
        switch error.code {
        case LAError.authenticationFailed.rawValue:
            return .authFailed
        case LAError.userCancel.rawValue:
            return .userCancel
        case LAError.systemCancel.rawValue:
            return .systemCancel
        case LAError.biometryNotAvailable.rawValue:
            return .notAvailable
        case LAError.biometryNotEnrolled.rawValue:
            return .notEnrolled
        default:
            return .authFailed
        }
    }
    
    private func getSecurityLevel() -> BiometricSecurityLevel {
        if isDeviceCompromised() {
            return .compromised
        }
        
        switch context.biometryType {
        case .faceID:
            return .high
        case .touchID:
            return .medium
        default:
            return .low
        }
    }
    
    private func isDeviceCompromised() -> Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        // Check for jailbreak indicators
        let paths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt/"
        ]
        
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
        #endif
    }
}