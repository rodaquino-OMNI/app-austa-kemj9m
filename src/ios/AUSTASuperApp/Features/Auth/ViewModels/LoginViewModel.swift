//
// LoginViewModel.swift
// AUSTA SuperApp
//
// HIPAA-compliant login view model implementing secure authentication
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import Combine // iOS 14.0+
import SwiftUI // iOS 14.0+
import CryptoKit // iOS 14.0+
import os.log // iOS 14.0+
import LocalAuthentication // iOS 14.0+

// MARK: - View Model State

@available(iOS 14.0, *)
public enum ViewModelState: Equatable {
    case idle
    case validating
    case authenticating
    case success
    case failure(LoginValidationError)
}

// MARK: - Validation Error

@available(iOS 14.0, *)
public enum LoginValidationError: LocalizedError {
    case emptyEmail
    case invalidEmail
    case emptyPassword
    case invalidPasswordFormat
    case deviceSecurityCompromised
    case biometricTimeout
    case rateLimitExceeded
    case networkError
    case serverError
    case sessionExpired
    
    public var errorDescription: String? {
        switch self {
        case .emptyEmail:
            return NSLocalizedString("Email address is required.", comment: "")
        case .invalidEmail:
            return NSLocalizedString("Please enter a valid email address.", comment: "")
        case .emptyPassword:
            return NSLocalizedString("Password is required.", comment: "")
        case .invalidPasswordFormat:
            return NSLocalizedString("Password must meet security requirements.", comment: "")
        case .deviceSecurityCompromised:
            return NSLocalizedString("Device security requirements not met.", comment: "")
        case .biometricTimeout:
            return NSLocalizedString("Biometric authentication timed out.", comment: "")
        case .rateLimitExceeded:
            return NSLocalizedString("Too many login attempts. Please try again later.", comment: "")
        case .networkError:
            return NSLocalizedString("Network connection error. Please try again.", comment: "")
        case .serverError:
            return NSLocalizedString("Server error occurred. Please try again.", comment: "")
        case .sessionExpired:
            return NSLocalizedString("Session expired. Please log in again.", comment: "")
        }
    }
}

// MARK: - Authentication Metrics

@available(iOS 14.0, *)
private struct AuthenticationMetrics {
    var attempts: Int = 0
    var lastAttemptDate: Date?
    var successRate: Double = 1.0
    
    mutating func recordAttempt(success: Bool) {
        attempts += 1
        lastAttemptDate = Date()
        let successWeight = success ? 1.0 : 0.0
        successRate = (successRate * Double(attempts - 1) + successWeight) / Double(attempts)
    }
    
    func shouldAllowAttempt() -> Bool {
        guard let lastAttempt = lastAttemptDate else { return true }
        let cooldownPeriod: TimeInterval = 300 // 5 minutes
        return Date().timeIntervalSince(lastAttempt) >= cooldownPeriod
    }
}

// MARK: - Login View Model

@available(iOS 14.0, *)
@MainActor
public final class LoginViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var email: String = ""
    @Published private(set) var password: String = ""
    @Published private(set) var isBiometricAvailable: Bool = false
    @Published private(set) var state: ViewModelState = .idle
    @Published private(set) var errorMessage: String? = nil
    
    // MARK: - Private Properties
    
    private let authService: AuthService
    private var cancellables = Set<AnyCancellable>()
    private var metrics = AuthenticationMetrics()
    private let secureLogger: OSLog
    private let rateLimiter: RateLimiter
    
    // MARK: - Initialization
    
    public init(authService: AuthService = .shared) {
        self.authService = authService
        self.secureLogger = OSLog(subsystem: "com.austa.superapp", category: "authentication")
        self.rateLimiter = RateLimiter(maxAttempts: 5, cooldownPeriod: 300)
        
        setupBiometricAvailability()
        setupInputValidation()
        setupSessionMonitoring()
    }
    
    // MARK: - Public Methods
    
    public func updateEmail(_ newEmail: String) {
        email = newEmail.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    public func updatePassword(_ newPassword: String) {
        password = newPassword
    }
    
    public func login() -> AnyPublisher<User, Error> {
        guard rateLimiter.shouldAllowAttempt() else {
            return Fail(error: LoginValidationError.rateLimitExceeded).eraseToAnyPublisher()
        }
        
        state = .validating
        
        // Validate inputs
        do {
            try validateCredentials()
        } catch let error as LoginValidationError {
            state = .failure(error)
            errorMessage = error.errorDescription
            return Fail(error: error).eraseToAnyPublisher()
        } catch {
            state = .failure(.serverError)
            errorMessage = LoginValidationError.serverError.errorDescription
            return Fail(error: LoginValidationError.serverError).eraseToAnyPublisher()
        }
        
        state = .authenticating
        
        return authService.login(email: email, password: password)
            .handleEvents(
                receiveSubscription: { [weak self] _ in
                    self?.logAuthenticationAttempt(type: "password")
                },
                receiveOutput: { [weak self] _ in
                    self?.handleSuccessfulAuth()
                },
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        self?.handleAuthError(error)
                    }
                }
            )
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    public func loginWithBiometrics() -> AnyPublisher<User, Error> {
        guard BiometricUtils.shared.isBiometricAuthAvailable() else {
            state = .failure(.deviceSecurityCompromised)
            errorMessage = LoginValidationError.deviceSecurityCompromised.errorDescription
            return Fail(error: LoginValidationError.deviceSecurityCompromised).eraseToAnyPublisher()
        }
        
        state = .authenticating
        
        return Future { [weak self] promise in
            BiometricUtils.shared.authenticateUser(reason: "Log in to AUSTA SuperApp") { result in
                switch result {
                case .success(let authResult):
                    if authResult.success {
                        self?.authService.validateSession()
                            .sink(
                                receiveCompletion: { completion in
                                    if case .failure(let error) = completion {
                                        promise(.failure(error))
                                    }
                                },
                                receiveValue: { isValid in
                                    if isValid {
                                        self?.handleSuccessfulAuth()
                                        promise(.success(User()))
                                    } else {
                                        promise(.failure(LoginValidationError.sessionExpired))
                                    }
                                }
                            )
                            .store(in: &self!.cancellables)
                    } else {
                        promise(.failure(LoginValidationError.biometricTimeout))
                    }
                case .failure(let error):
                    promise(.failure(error))
                }
            }
        }
        .handleEvents(receiveSubscription: { [weak self] _ in
            self?.logAuthenticationAttempt(type: "biometric")
        })
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func setupBiometricAvailability() {
        isBiometricAvailable = BiometricUtils.shared.isBiometricAuthAvailable()
    }
    
    private func setupInputValidation() {
        $email
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.validateEmail()
            }
            .store(in: &cancellables)
        
        $password
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.validatePassword()
            }
            .store(in: &cancellables)
    }
    
    private func setupSessionMonitoring() {
        NotificationCenter.default.publisher(for: .authSessionDidTimeout)
            .sink { [weak self] _ in
                self?.state = .failure(.sessionExpired)
                self?.errorMessage = LoginValidationError.sessionExpired.errorDescription
            }
            .store(in: &cancellables)
    }
    
    private func validateCredentials() throws {
        guard !email.isEmpty else { throw LoginValidationError.emptyEmail }
        guard isValidEmail(email) else { throw LoginValidationError.invalidEmail }
        guard !password.isEmpty else { throw LoginValidationError.emptyPassword }
        guard isValidPassword(password) else { throw LoginValidationError.invalidPasswordFormat }
    }
    
    private func validateEmail() {
        guard !email.isEmpty else { return }
        if !isValidEmail(email) {
            errorMessage = LoginValidationError.invalidEmail.errorDescription
        } else {
            errorMessage = nil
        }
    }
    
    private func validatePassword() {
        guard !password.isEmpty else { return }
        if !isValidPassword(password) {
            errorMessage = LoginValidationError.invalidPasswordFormat.errorDescription
        } else {
            errorMessage = nil
        }
    }
    
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }
    
    private func isValidPassword(_ password: String) -> Bool {
        let passwordRegex = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[@$!%*#?&])[A-Za-z\\d@$!%*#?&]{8,}$"
        let passwordPredicate = NSPredicate(format: "SELF MATCHES %@", passwordRegex)
        return passwordPredicate.evaluate(with: password)
    }
    
    private func handleSuccessfulAuth() {
        metrics.recordAttempt(success: true)
        state = .success
        errorMessage = nil
        clearSensitiveData()
    }
    
    private func handleAuthError(_ error: Error) {
        metrics.recordAttempt(success: false)
        state = .failure(.serverError)
        errorMessage = error.localizedDescription
        clearSensitiveData()
    }
    
    private func logAuthenticationAttempt(type: String) {
        os_log(
            "Authentication attempt - Type: %{public}s, Email: %{public}s",
            log: secureLogger,
            type: .debug,
            type,
            email.masked()
        )
    }
    
    private func clearSensitiveData() {
        password = ""
    }
}

// MARK: - String Extension

@available(iOS 14.0, *)
private extension String {
    func masked() -> String {
        guard !isEmpty else { return "" }
        let prefix = prefix(2)
        let suffix = suffix(2)
        return "\(prefix)***\(suffix)"
    }
}

// MARK: - Rate Limiter

@available(iOS 14.0, *)
private class RateLimiter {
    private let maxAttempts: Int
    private let cooldownPeriod: TimeInterval
    private var attempts: [(date: Date, count: Int)] = []
    
    init(maxAttempts: Int, cooldownPeriod: TimeInterval) {
        self.maxAttempts = maxAttempts
        self.cooldownPeriod = cooldownPeriod
    }
    
    func shouldAllowAttempt() -> Bool {
        let now = Date()
        attempts = attempts.filter { now.timeIntervalSince($0.date) < cooldownPeriod }
        let totalAttempts = attempts.reduce(0) { $0 + $1.count }
        
        guard totalAttempts < maxAttempts else { return false }
        attempts.append((date: now, count: 1))
        return true
    }
}