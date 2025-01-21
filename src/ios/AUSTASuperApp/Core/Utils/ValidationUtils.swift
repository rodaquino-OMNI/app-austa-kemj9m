//
// ValidationUtils.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import RegexBuilder // Version: iOS 14.0+

/// Validation result type containing validation status and detailed error information
public typealias ValidationResult = (isValid: Bool, errors: [String]?, hipaaCompliant: Bool?)

/// Type alias for health record data dictionary
public typealias HealthRecordData = [String: Any]

/// Configuration structure for validation rules
public struct ValidationConfig {
    let minPasswordLength: Int
    let requireSpecialChars: Bool
    let hipaaRules: [String: Any]
    
    static let `default` = ValidationConfig(
        minPasswordLength: 12,
        requireSpecialChars: true,
        hipaaRules: [
            "requiredFields": ["patientId", "providerId", "timestamp"],
            "sensitiveFields": ["ssn", "medicalRecordNumber"],
            "dateFormat": "yyyy-MM-dd'T'HH:mm:ssZ"
        ]
    )
}

/// Comprehensive validation utility class implementing HIPAA-compliant validation rules
public final class ValidationUtils {
    
    // MARK: - Private Properties
    
    private static let emailPattern = try! Regex(#"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#, options: [.caseInsensitive])
    
    private static let passwordPattern = try! Regex(
        #"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$"#
    )
    
    private static let phonePattern = try! Regex(#"^\+?[1-9]\d{1,14}$"#)
    
    private static let hipaaPatterns: [String: Regex<AnyRegexOutput>] = [
        "ssn": try! Regex(#"^\d{3}-\d{2}-\d{4}$"#),
        "medicalRecordNumber": try! Regex(#"^[A-Z0-9-]{10,}$"#),
        "npi": try! Regex(#"^\d{10}$"#)
    ]
    
    private static let config = ValidationConfig.default
    
    // MARK: - Public Methods
    
    /// Validates email address format with enhanced security checks
    /// - Parameter email: Email address to validate
    /// - Returns: Validation result with detailed error messages
    public static func validateEmail(_ email: String) -> ValidationResult {
        var errors = [String]()
        
        // Sanitize input
        let sanitizedEmail = sanitizeInput(email)
        
        // Check for empty input
        guard !sanitizedEmail.isEmpty else {
            errors.append("Email address cannot be empty")
            return (false, errors, nil)
        }
        
        // Validate format
        guard sanitizedEmail.matches(emailPattern) else {
            errors.append("Invalid email format")
            return (false, errors, nil)
        }
        
        // Check domain
        let components = sanitizedEmail.split(separator: "@")
        guard components.count == 2,
              let domain = components.last,
              domain.contains(".") else {
            errors.append("Invalid email domain")
            return (false, errors, nil)
        }
        
        // Check for disposable email services
        if isDisposableEmailDomain(String(domain)) {
            errors.append("Disposable email addresses are not allowed")
            return (false, errors, nil)
        }
        
        return (true, nil, nil)
    }
    
    /// Validates password strength with enhanced security requirements
    /// - Parameter password: Password to validate
    /// - Returns: Validation result with specific failure reasons
    public static func validatePassword(_ password: String) -> ValidationResult {
        var errors = [String]()
        
        // Check minimum length
        guard password.count >= config.minPasswordLength else {
            errors.append("Password must be at least \(config.minPasswordLength) characters long")
            return (false, errors, nil)
        }
        
        // Validate pattern
        guard password.matches(passwordPattern) else {
            errors.append("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
            return (false, errors, nil)
        }
        
        // Check entropy
        let entropy = calculatePasswordEntropy(password)
        guard entropy >= 60 else {
            errors.append("Password is not strong enough")
            return (false, errors, nil)
        }
        
        // Check against common patterns
        if containsCommonPatterns(password) {
            errors.append("Password contains common patterns")
            return (false, errors, nil)
        }
        
        return (true, nil, nil)
    }
    
    /// Validates health record data against HIPAA requirements
    /// - Parameter data: Health record data to validate
    /// - Returns: Validation result with HIPAA compliance status
    public static func validateHealthData(_ data: HealthRecordData) -> ValidationResult {
        var errors = [String]()
        var isHipaaCompliant = true
        
        // Validate required fields
        let requiredFields = config.hipaaRules["requiredFields"] as! [String]
        for field in requiredFields {
            if data[field] == nil {
                errors.append("Missing required field: \(field)")
                isHipaaCompliant = false
            }
        }
        
        // Validate sensitive fields
        let sensitiveFields = config.hipaaRules["sensitiveFields"] as! [String]
        for field in sensitiveFields {
            if let value = data[field] as? String {
                if let pattern = hipaaPatterns[field] {
                    if !value.matches(pattern) {
                        errors.append("Invalid format for sensitive field: \(field)")
                        isHipaaCompliant = false
                    }
                }
            }
        }
        
        // Validate dates
        if let dateFormat = config.hipaaRules["dateFormat"] as? String {
            let formatter = DateFormatter()
            formatter.dateFormat = dateFormat
            
            if let timestamp = data["timestamp"] as? String {
                if formatter.date(from: timestamp) == nil {
                    errors.append("Invalid timestamp format")
                    isHipaaCompliant = false
                }
            }
        }
        
        return (errors.isEmpty, errors.isEmpty ? nil : errors, isHipaaCompliant)
    }
    
    /// Validates phone number format with international support
    /// - Parameters:
    ///   - phoneNumber: Phone number to validate
    ///   - countryCode: Optional country code for region-specific validation
    /// - Returns: Validation result with detailed error information
    public static func validatePhoneNumber(_ phoneNumber: String, countryCode: String? = nil) -> ValidationResult {
        var errors = [String]()
        
        // Sanitize input
        let sanitizedNumber = sanitizeInput(phoneNumber)
        
        // Check for empty input
        guard !sanitizedNumber.isEmpty else {
            errors.append("Phone number cannot be empty")
            return (false, errors, nil)
        }
        
        // Validate basic format
        guard sanitizedNumber.matches(phonePattern) else {
            errors.append("Invalid phone number format")
            return (false, errors, nil)
        }
        
        // Validate country-specific format if provided
        if let code = countryCode {
            let isValidForRegion = validatePhoneNumberForRegion(sanitizedNumber, code)
            if !isValidForRegion {
                errors.append("Invalid phone number format for region: \(code)")
                return (false, errors, nil)
            }
        }
        
        return (true, nil, nil)
    }
    
    /// Sanitizes user input with enhanced security measures
    /// - Parameter input: Raw input string to sanitize
    /// - Returns: Sanitized string
    public static func sanitizeInput(_ input: String) -> String {
        var sanitized = input.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Remove HTML tags
        sanitized = sanitized.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
        
        // Remove potential SQL injection patterns
        sanitized = sanitized.replacingOccurrences(of: #"[\\\";']"#, with: "", options: .regularExpression)
        
        // Remove potential XSS patterns
        sanitized = sanitized.replacingOccurrences(of: #"[<>]"#, with: "", options: .regularExpression)
        
        // Normalize Unicode characters
        sanitized = sanitized.applyingTransform(.toNFKC, reverse: false) ?? sanitized
        
        return sanitized
    }
    
    // MARK: - Private Methods
    
    private static func isDisposableEmailDomain(_ domain: String) -> Bool {
        // Implementation of disposable email domain check
        let disposableDomains = ["tempmail.com", "throwaway.com"]
        return disposableDomains.contains(domain.lowercased())
    }
    
    private static func calculatePasswordEntropy(_ password: String) -> Double {
        // Implementation of password entropy calculation
        let charset = Set(password)
        let charsetSize = Double(charset.count)
        return Double(password.count) * log2(charsetSize)
    }
    
    private static func containsCommonPatterns(_ password: String) -> Bool {
        // Implementation of common pattern detection
        let commonPatterns = ["123456", "password", "qwerty"]
        return commonPatterns.contains { password.lowercased().contains($0) }
    }
    
    private static func validatePhoneNumberForRegion(_ phone: String, _ region: String) -> Bool {
        // Implementation of region-specific phone validation
        let regionPatterns = [
            "US": #"^\+1[2-9]\d{9}$"#,
            "UK": #"^\+44[1-9]\d{9}$"#
        ]
        
        guard let pattern = regionPatterns[region],
              let regex = try? Regex(pattern) else {
            return false
        }
        
        return phone.matches(regex)
    }
}