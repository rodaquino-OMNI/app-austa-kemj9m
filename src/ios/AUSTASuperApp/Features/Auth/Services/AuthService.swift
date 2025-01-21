//
// AuthService.swift
// AUSTA SuperApp
//
// Core authentication service with enhanced security features and HIPAA compliance
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import KeychainAccess // v4.2.2
import SecurityKit // v1.0.0

// MARK: - Error Types

@available(iOS 14.0, *)
public enum AuthError: LocalizedError {
    case invalidCredentials
    case accountLocked
    case biometricFailed
    case tokenExpired
    case networkError
    case serverError
    case deviceCompromised
    case securityValidationFailed
    case mfaRequired
    case mfaFailed
    case hipaaViolation
    case sessionTimeout
    
    public var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return NSLocalizedString("Invalid credentials provided.", comment: "")
        case .accountLocked:
            return NSLocalizedString("Account has been locked due to security concerns.", comment: "")
        case .biometricFailed:
            return NSLocalizedString("Biometric authentication failed.", comment: "")
        case .tokenExpired:
            return NSLocalizedString("Authentication session has expired.", comment: "")
        case .networkError:
            return NSLocalizedString("Network connection error occurred.", comment: "")
        case .serverError:
            return NSLocalizedString("Server error occurred.", comment: "")
        case .deviceCompromised:
            return NSLocalizedString("Device security is compromised.", comment: "")
        case .securityValidationFailed:
            return NSLocalizedString("Security validation failed.", comment: "")
        case .mfaRequired:
            return NSLocalizedString("Multi-factor authentication required.", comment: "")
        case .mfaFailed:
            return NSLocalizedString("Multi-factor authentication failed.", comment: "")
        case .hipaaViolation:
            return NSLocalizedString("HIPAA compliance violation detected.", comment: "")
        case .sessionTimeout:
            return NSLocalizedString("Session has timed out.", comment: "")
        }
    }
}

// MARK: - Supporting Types

@available(iOS 14.0, *)
private enum TokenType {
    case access
    case refresh
    case mfa
}

@available(iOS 14.0, *)
private enum SecurityLevel {
    case standard
    case elevated
    case hipaa
}

// MARK: - AuthService

@available(iOS 14.0, *)
public final class AuthService {
    
    // MARK: - Singleton
    
    public static let shared = AuthService()
    
    // MARK: - Private Properties
    
    private let apiClient: APIClient
    private let keychain: KeychainAccess
    private let sessionMonitor: SessionMonitor
    private var currentUser: User?
    private var securityLevel: SecurityLevel = .standard
    private let authQueue = DispatchQueue(label: "com.austa.superapp.auth", qos: .userInitiated)
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Constants
    
    private let tokenRefreshThreshold: TimeInterval = 300 // 5 minutes
    private let sessionTimeout: TimeInterval = 900 // 15 minutes
    private let maxLoginAttempts = 3
    private var loginAttempts = 0
    
    // MARK: - Initialization
    
    private init() {
        // Configure API client with certificate pinning
        let config = APIConfiguration(
            baseURL: URL(string: "https://api.austa.health")!,
            certificatePinning: true,
            timeoutInterval: 30
        )
        self.apiClient = APIClient(configuration: config)
        
        // Initialize secure keychain
        self.keychain = KeychainAccess(
            service: "com.austa.superapp.auth",
            accessGroup: "group.com.austa.superapp"
        )
        
        // Configure session monitoring
        self.sessionMonitor = SessionMonitor(timeout: sessionTimeout)
        
        setupSecurityMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Authenticates user with enhanced security validation
    public func login(
        email: String,
        password: String,
        securityLevel: SecurityLevel = .standard
    ) -> AnyPublisher<User, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.serverError))
                return
            }
            
            self.authQueue.async {
                // Validate device security
                guard self.validateDeviceSecurity() else {
                    promise(.failure(AuthError.deviceCompromised))
                    return
                }
                
                // Check login attempts
                guard self.loginAttempts < self.maxLoginAttempts else {
                    promise(.failure(AuthError.accountLocked))
                    return
                }
                
                // Perform OAuth authentication
                self.performOAuthAuthentication(email: email, password: password)
                    .flatMap { credentials -> AnyPublisher<User, Error> in
                        // Handle MFA if required
                        if credentials.requiresMFA {
                            return self.handleMFAChallenge(credentials: credentials)
                        } else {
                            return Just(credentials)
                                .setFailureType(to: Error.self)
                                .eraseToAnyPublisher()
                        }
                    }
                    .flatMap { credentials -> AnyPublisher<User, Error> in
                        // Initialize user session
                        return self.initializeUserSession(credentials: credentials)
                    }
                    .sink(
                        receiveCompletion: { completion in
                            if case .failure(let error) = completion {
                                self.loginAttempts += 1
                                promise(.failure(error))
                            }
                        },
                        receiveValue: { user in
                            self.loginAttempts = 0
                            self.currentUser = user
                            self.sessionMonitor.startMonitoring()
                            promise(.success(user))
                        }
                    )
                    .store(in: &self.cancellables)
            }
        }.eraseToAnyPublisher()
    }
    
    /// Validates current session security and compliance
    public func validateSession() -> AnyPublisher<Bool, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.serverError))
                return
            }
            
            self.authQueue.async {
                // Check session timeout
                guard !self.sessionMonitor.isSessionExpired else {
                    promise(.failure(AuthError.sessionTimeout))
                    return
                }
                
                // Validate token
                guard self.validateToken() else {
                    promise(.failure(AuthError.tokenExpired))
                    return
                }
                
                // Verify device security
                guard self.validateDeviceSecurity() else {
                    promise(.failure(AuthError.deviceCompromised))
                    return
                }
                
                // Validate HIPAA compliance if required
                if self.securityLevel == .hipaa {
                    guard self.validateHIPAACompliance() else {
                        promise(.failure(AuthError.hipaaViolation))
                        return
                    }
                }
                
                promise(.success(true))
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func validateDeviceSecurity() -> Bool {
        return BiometricUtils.shared.validateDeviceCapability()
    }
    
    private func performOAuthAuthentication(
        email: String,
        password: String
    ) -> AnyPublisher<AuthCredentials, Error> {
        return apiClient.request(
            endpoint: AuthEndpoint.login(email: email, password: password)
        )
        .mapError { _ in AuthError.invalidCredentials }
        .eraseToAnyPublisher()
    }
    
    private func handleMFAChallenge(
        credentials: AuthCredentials
    ) -> AnyPublisher<AuthCredentials, Error> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(AuthError.serverError))
                return
            }
            
            BiometricUtils.shared.authenticateUser(
                reason: "Verify your identity to continue"
            ) { result in
                switch result {
                case .success(let authResult):
                    if authResult.success {
                        promise(.success(credentials))
                    } else {
                        promise(.failure(AuthError.mfaFailed))
                    }
                case .failure:
                    promise(.failure(AuthError.biometricFailed))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    private func initializeUserSession(
        credentials: AuthCredentials
    ) -> AnyPublisher<User, Error> {
        // Store encrypted tokens
        do {
            try storeTokenSecurely(credentials.accessToken, type: .access)
            try storeTokenSecurely(credentials.refreshToken, type: .refresh)
        } catch {
            return Fail(error: AuthError.securityValidationFailed)
                .eraseToAnyPublisher()
        }
        
        // Fetch user profile
        return apiClient.request(endpoint: AuthEndpoint.profile)
            .mapError { _ in AuthError.serverError }
            .eraseToAnyPublisher()
    }
    
    private func storeTokenSecurely(_ token: String, type: TokenType) throws {
        let key = tokenKey(for: type)
        try keychain
            .accessibility(.whenUnlockedThisDeviceOnly, authenticationPolicy: .biometryAny)
            .set(token, key: key)
    }
    
    private func tokenKey(for type: TokenType) -> String {
        switch type {
        case .access:
            return "auth.token.access"
        case .refresh:
            return "auth.token.refresh"
        case .mfa:
            return "auth.token.mfa"
        }
    }
    
    private func validateToken() -> Bool {
        guard let token = try? keychain.get(tokenKey(for: .access)) else {
            return false
        }
        
        return !JWTValidator.isExpired(token, threshold: tokenRefreshThreshold)
    }
    
    private func validateHIPAACompliance() -> Bool {
        // Implement HIPAA compliance checks
        return true
    }
    
    private func setupSecurityMonitoring() {
        sessionMonitor.timeoutPublisher
            .sink { [weak self] in
                self?.handleSessionTimeout()
            }
            .store(in: &cancellables)
    }
    
    private func handleSessionTimeout() {
        currentUser = nil
        NotificationCenter.default.post(
            name: .authSessionDidTimeout,
            object: nil
        )
    }
}

// MARK: - Notification Names

@available(iOS 14.0, *)
public extension Notification.Name {
    static let authSessionDidTimeout = Notification.Name("AuthSessionDidTimeout")
}