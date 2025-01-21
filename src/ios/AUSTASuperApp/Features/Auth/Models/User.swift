import Foundation // iOS 14.0+
import CryptoKit // iOS 14.0+

// MARK: - Enums

@available(iOS 14.0, *)
public enum UserRole: String, Codable, CaseIterable {
    case patient = "PATIENT"
    case provider = "PROVIDER"
    case admin = "ADMIN"
    case insurance = "INSURANCE"
}

@available(iOS 14.0, *)
public enum UserStatus: String, Codable {
    case active = "ACTIVE"
    case inactive = "INACTIVE"
    case pending = "PENDING"
    case suspended = "SUSPENDED"
    case locked = "LOCKED"
}

@available(iOS 14.0, *)
public enum SecurityLevel: Int, Codable {
    case standard = 1
    case elevated = 2
    case high = 3
}

// MARK: - Supporting Types

@available(iOS 14.0, *)
public enum MFAMethod: String, Codable {
    case authenticator
    case sms
    case email
    case biometric
}

@available(iOS 14.0, *)
public enum BiometricStatus: String, Codable {
    case enabled
    case disabled
    case unavailable
    case pending
}

// MARK: - UserProfile

@available(iOS 14.0, *)
@objc dynamic public class UserProfile: NSObject, Codable {
    private(set) var firstName: EncryptedString
    private(set) var lastName: EncryptedString
    private(set) var dateOfBirth: SecureDate
    private(set) var gender: EncryptedString
    private(set) var phoneNumber: EncryptedString
    private(set) var address: SecureAddress
    private(set) var emergencyContact: EmergencyContact
    private(set) var healthInfo: HealthMetadata
    private(set) var lastUpdated: Date
    
    public func fullName() throws -> String {
        do {
            let decryptedFirst = try firstName.decryptedValue()
            let decryptedLast = try lastName.decryptedValue()
            AuditLogger.shared.log(event: .dataAccess, detail: "Full name accessed")
            return "\(decryptedFirst) \(decryptedLast)"
        } catch {
            AuditLogger.shared.log(event: .error, detail: "Failed to decrypt name")
            throw UserError.decryptionFailed
        }
    }
    
    public func validateProfile() -> ValidationResult {
        let validator = HIPAACompliantValidator()
        return validator.validate(profile: self)
    }
}

// MARK: - UserSecuritySettings

@available(iOS 14.0, *)
@objc dynamic public class UserSecuritySettings: NSObject, Codable {
    public private(set) var mfaEnabled: Bool
    public private(set) var mfaMethod: MFAMethod
    public private(set) var lastPasswordChange: SecureDate
    public private(set) var passwordResetRequired: Bool
    public private(set) var loginAttempts: Int
    public private(set) var lastLoginAt: SecureDate?
    public private(set) var securityLevel: SecurityLevel
    public private(set) var securityEvents: [SecurityEvent]
    public private(set) var biometricState: BiometricStatus
    
    public func validateSecurityStatus() -> SecurityValidationResult {
        let validator = SecurityValidator()
        return validator.validate(settings: self)
    }
}

// MARK: - User

@available(iOS 14.0, *)
@objc dynamic public class User: NSObject, Codable {
    public let id: UUID
    private let email: EncryptedString
    public private(set) var role: UserRole
    public private(set) var status: UserStatus
    public private(set) var profile: UserProfile
    public private(set) var securitySettings: UserSecuritySettings
    private let createdAt: SecureDate
    private let updatedAt: SecureDate
    private var accessLogs: AuditTrail
    
    public init(id: UUID,
               email: String,
               role: UserRole,
               status: UserStatus,
               profile: UserProfile,
               securitySettings: UserSecuritySettings) throws {
        self.id = id
        self.email = try EncryptedString(value: email)
        self.role = role
        self.status = status
        self.profile = profile
        self.securitySettings = securitySettings
        self.createdAt = SecureDate()
        self.updatedAt = SecureDate()
        self.accessLogs = AuditTrail()
        
        super.init()
        
        try validateInitialization()
        configureSecurityMonitoring()
    }
    
    public func isActive() -> Bool {
        let isAccountActive = status == .active
        let isSecurityValid = securitySettings.validateSecurityStatus().isValid
        
        AuditLogger.shared.log(
            event: .statusCheck,
            detail: "Account status checked: \(isAccountActive)"
        )
        
        return isAccountActive && isSecurityValid
    }
    
    private func validateInitialization() throws {
        guard email.isValid else {
            throw UserError.invalidEmail
        }
        
        guard profile.validateProfile().isValid else {
            throw UserError.invalidProfile
        }
        
        accessLogs.log(event: .userCreated)
    }
    
    private func configureSecurityMonitoring() {
        SecurityMonitor.shared.monitor(user: self)
    }
}

// MARK: - Error Handling

@available(iOS 14.0, *)
public enum UserError: Error {
    case invalidEmail
    case invalidProfile
    case decryptionFailed
    case securityValidationFailed
}

// MARK: - Secure Property Wrappers

@available(iOS 14.0, *)
@propertyWrapper
public struct EncryptedString: Codable {
    private var encryptedValue: Data
    
    public init(value: String) throws {
        self.encryptedValue = try EncryptionService.shared.encrypt(value)
    }
    
    public func decryptedValue() throws -> String {
        return try EncryptionService.shared.decrypt(encryptedValue)
    }
    
    public var isValid: Bool {
        return !encryptedValue.isEmpty
    }
}

@available(iOS 14.0, *)
@propertyWrapper
public struct SecureDate: Codable {
    private var timestamp: TimeInterval
    
    public init() {
        self.timestamp = Date().timeIntervalSince1970
    }
    
    public var wrappedValue: Date {
        return Date(timeIntervalSince1970: timestamp)
    }
}