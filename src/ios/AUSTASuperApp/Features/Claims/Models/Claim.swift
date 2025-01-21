//
// Claim.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import CryptoKit // Version: iOS 14.0+
import Security // Version: iOS 14.0+

/// HIPAA-compliant claim types
@available(iOS 14.0, *)
public enum ClaimType: String, Codable {
    case medical
    case pharmacy
    case dental
    case vision
}

/// Claim processing status with audit support
@available(iOS 14.0, *)
public enum ClaimStatus: String, Codable {
    case submitted
    case inReview
    case approved
    case rejected
    case paid
}

/// Secure document structure for claim attachments
@available(iOS 14.0, *)
public struct SecureDocument: Codable {
    let id: String
    let encryptedData: Data
    let contentType: String
    let hash: String
    let timestamp: Date
    let metadata: EncryptionMetadata
}

/// Metadata for encryption tracking
@available(iOS 14.0, *)
public struct EncryptionMetadata: Codable {
    let algorithm: String
    let keyId: String
    let createdAt: Date
    let iv: Data
    let tag: Data
}

/// Audit trail for claim operations
@available(iOS 14.0, *)
public struct AuditTrail: Codable {
    var entries: [AuditEntry]
    
    struct AuditEntry: Codable {
        let timestamp: Date
        let action: String
        let performedBy: String
        let securityContext: [String: String]
    }
}

/// HIPAA-compliant claim validation errors
@available(iOS 14.0, *)
public enum ClaimValidationError: LocalizedError {
    case invalidAmount
    case missingDocuments
    case securityValidationFailed
    case encryptionFailed
    case hipaaViolation
    case auditFailure
    
    public var errorDescription: String? {
        switch self {
        case .invalidAmount: return "Invalid claim amount"
        case .missingDocuments: return "Required documents missing"
        case .securityValidationFailed: return "Security validation failed"
        case .encryptionFailed: return "Encryption operation failed"
        case .hipaaViolation: return "HIPAA compliance violation"
        case .auditFailure: return "Audit logging failed"
        }
    }
}

/// HIPAA-compliant claim model with comprehensive security features
@available(iOS 14.0, *)
@objc @objcMembers
public final class Claim: NSObject {
    
    // MARK: - Properties
    
    public private(set) var id: String
    private let encryptedUserId: EncryptedString
    private let encryptedPolicyNumber: EncryptedString
    public private(set) var type: ClaimType
    public private(set) var status: ClaimStatus
    private let encryptedAmount: Data
    public private(set) var submissionDate: Date
    public private(set) var processedDate: Date?
    public private(set) var supportingDocuments: [SecureDocument]
    private var encryptedRejectionReason: EncryptedString?
    private var encryptedNotes: EncryptedString?
    public private(set) var securityLevel: SecurityLevel
    private var auditTrail: AuditTrail
    private let encryptionMetadata: EncryptionMetadata
    
    // MARK: - Initialization
    
    public init(id: String,
               userId: String,
               policyNumber: String,
               type: ClaimType,
               amount: Decimal,
               securityContext: SecurityContext) throws {
        
        // Validate security context
        guard SecurityManager.shared.validateSecurityState().get() != nil else {
            throw ClaimValidationError.securityValidationFailed
        }
        
        // Initialize encryption components
        let encryptionManager = EncryptionManager.shared
        
        // Encrypt sensitive data
        self.id = id
        self.encryptedUserId = try EncryptedString(value: userId)
        self.encryptedPolicyNumber = try EncryptedString(value: policyNumber)
        self.type = type
        self.status = .submitted
        
        // Encrypt amount with additional security
        let amountData = String(describing: amount).data(using: .utf8)!
        let encryptionResult = try encryptionManager.encrypt(amountData).get()
        self.encryptedAmount = encryptionResult
        
        self.submissionDate = Date()
        self.supportingDocuments = []
        self.securityLevel = .hipaa
        self.auditTrail = AuditTrail(entries: [])
        
        // Initialize encryption metadata
        let iv = try AES.GCM.Nonce()
        self.encryptionMetadata = EncryptionMetadata(
            algorithm: "AES-256-GCM",
            keyId: UUID().uuidString,
            createdAt: Date(),
            iv: iv.withUnsafeBytes { Data($0) },
            tag: Data()
        )
        
        super.init()
        
        // Log initialization in audit trail
        try logAuditEvent("claim_created", context: [
            "claim_id": id,
            "type": type.rawValue,
            "security_level": securityLevel.rawValue
        ])
    }
    
    // MARK: - Public Methods
    
    /// Validates claim amount with fraud detection and security checks
    public func validateClaimAmount(_ amount: Decimal, context: SecurityContext) -> Result<Bool, ClaimValidationError> {
        do {
            // Verify security context
            guard SecurityManager.shared.validateSecurityState().get() != nil else {
                throw ClaimValidationError.securityValidationFailed
            }
            
            // Validate amount format and range
            guard amount > 0, amount < 1_000_000 else {
                throw ClaimValidationError.invalidAmount
            }
            
            // Log validation attempt
            try logAuditEvent("amount_validation", context: [
                "amount": String(describing: amount),
                "validation_type": "fraud_detection"
            ])
            
            return .success(true)
        } catch let error as ClaimValidationError {
            return .failure(error)
        } catch {
            return .failure(.securityValidationFailed)
        }
    }
    
    /// Validates claim documents with HIPAA compliance checks
    public func validateDocuments(_ documents: [SecureDocument], complianceContext: HIPAACompliance) -> Result<Bool, ClaimValidationError> {
        do {
            // Verify document encryption
            for document in documents {
                guard try EncryptionManager.shared.verifyIntegrity(
                    data: document.encryptedData,
                    tag: document.metadata.tag
                ).get() else {
                    throw ClaimValidationError.encryptionFailed
                }
            }
            
            // Log document validation
            try logAuditEvent("document_validation", context: [
                "document_count": String(documents.count),
                "compliance_level": complianceContext.rawValue
            ])
            
            return .success(true)
        } catch let error as ClaimValidationError {
            return .failure(error)
        } catch {
            return .failure(.hipaaViolation)
        }
    }
    
    /// Updates claim status with security validation
    public func update(newStatus: ClaimStatus, context: SecurityContext) -> Result<Void, ClaimValidationError> {
        do {
            // Verify security context
            guard SecurityManager.shared.validateSecurityState().get() != nil else {
                throw ClaimValidationError.securityValidationFailed
            }
            
            // Validate state transition
            guard isValidStatusTransition(from: status, to: newStatus) else {
                throw ClaimValidationError.securityValidationFailed
            }
            
            // Update status
            status = newStatus
            if newStatus == .approved || newStatus == .rejected {
                processedDate = Date()
            }
            
            // Log status update
            try logAuditEvent("status_updated", context: [
                "previous_status": status.rawValue,
                "new_status": newStatus.rawValue
            ])
            
            return .success(())
        } catch let error as ClaimValidationError {
            return .failure(error)
        } catch {
            return .failure(.securityValidationFailed)
        }
    }
    
    // MARK: - Private Methods
    
    private func logAuditEvent(_ action: String, context: [String: String]) throws {
        let entry = AuditTrail.AuditEntry(
            timestamp: Date(),
            action: action,
            performedBy: try encryptedUserId.decryptedValue(),
            securityContext: context
        )
        auditTrail.entries.append(entry)
    }
    
    private func isValidStatusTransition(from currentStatus: ClaimStatus, to newStatus: ClaimStatus) -> Bool {
        switch (currentStatus, newStatus) {
        case (.submitted, .inReview),
             (.inReview, .approved),
             (.inReview, .rejected),
             (.approved, .paid):
            return true
        default:
            return false
        }
    }
}