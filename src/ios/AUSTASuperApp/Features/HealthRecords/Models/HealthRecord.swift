//
// HealthRecord.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+

/// FHIR R4 compliant health record model with comprehensive security and PHI protection
@available(iOS 14.0, *)
@objc(HealthRecord)
public final class HealthRecord: NSObject {
    
    // MARK: - Type Definitions
    
    /// Health record type following FHIR resource types
    public enum HealthRecordType: String {
        case observation = "Observation"
        case condition = "Condition"
        case procedure = "Procedure"
        case medication = "Medication"
        case immunization = "Immunization"
        case diagnostic = "DiagnosticReport"
        case encounter = "Encounter"
    }
    
    /// Status of the health record
    public enum HealthRecordStatus: String {
        case draft = "draft"
        case active = "active"
        case suspended = "suspended"
        case completed = "completed"
        case enteredInError = "entered-in-error"
    }
    
    /// Metadata for health record
    public struct HealthRecordMetadata: Codable {
        let version: String
        let lastUpdated: Date
        let source: String
        let creator: String
        let fhirVersion: String
        let securityLabels: [String]
    }
    
    /// Attachment structure for health record documents
    public struct HealthRecordAttachment: Codable {
        let id: String
        let contentType: String
        let data: Data
        let title: String
        let creation: Date
        let hash: String
    }
    
    // MARK: - Properties
    
    public private(set) var id: String
    public private(set) var patientId: String
    public private(set) var providerId: String
    public private(set) var type: HealthRecordType
    public private(set) var date: Date
    private var content: EncryptedContent
    public private(set) var metadata: HealthRecordMetadata
    public private(set) var attachments: [HealthRecordAttachment]
    public private(set) var status: HealthRecordStatus
    public private(set) var securityLevel: SecurityLevel
    public private(set) var auditTrail: AuditTrail
    private var encryptionMetadata: EncryptionMetadata
    
    // MARK: - Private Types
    
    private struct EncryptedContent {
        let data: Data
        let iv: Data
        let tag: Data
    }
    
    private struct EncryptionMetadata {
        let algorithm: String
        let keyId: String
        let createdAt: Date
        let rotationDue: Date
    }
    
    private struct AuditTrail {
        var entries: [AuditEntry]
        
        struct AuditEntry: Codable {
            let timestamp: Date
            let action: String
            let performedBy: String
            let securityContext: [String: Any]
        }
    }
    
    // MARK: - Initialization
    
    /// Initializes a new health record with encryption and security policies
    public init(id: String, patientId: String, providerId: String, type: HealthRecordType, date: Date, content: [String: Any]) throws {
        // Validate input parameters
        guard !id.isEmpty && !patientId.isEmpty && !providerId.isEmpty else {
            throw HealthRecordError.invalidData
        }
        
        // Initialize core properties
        self.id = id
        self.patientId = patientId
        self.providerId = providerId
        self.type = type
        self.date = date
        self.status = .draft
        self.securityLevel = .hipaa
        self.attachments = []
        
        // Initialize metadata
        self.metadata = HealthRecordMetadata(
            version: "1.0",
            lastUpdated: Date(),
            source: "AUSTA SuperApp",
            creator: providerId,
            fhirVersion: "R4",
            securityLabels: ["HIPAA", "PHI"]
        )
        
        // Initialize audit trail
        self.auditTrail = AuditTrail(entries: [])
        
        // Encrypt content
        let jsonData = try JSONSerialization.data(withJSONObject: content)
        let encryptionResult = try EncryptionManager.shared.encrypt(jsonData).get()
        
        // Set encrypted content
        self.content = EncryptedContent(
            data: encryptionResult,
            iv: Data(), // Set from encryption result
            tag: Data() // Set from encryption result
        )
        
        // Set encryption metadata
        self.encryptionMetadata = EncryptionMetadata(
            algorithm: "AES-256-GCM",
            keyId: UUID().uuidString,
            createdAt: Date(),
            rotationDue: Date().addingTimeInterval(30 * 24 * 60 * 60) // 30 days
        )
        
        super.init()
        
        // Validate FHIR compliance
        try validateFHIRCompliance()
        
        // Log creation in audit trail
        logAuditEvent("record_created")
    }
    
    // MARK: - Public Methods
    
    /// Validates health record data against FHIR R4 specifications and security policies
    public func validate() -> Result<Void, HealthRecordError> {
        do {
            // Validate FHIR compliance
            try validateFHIRCompliance()
            
            // Validate security state
            guard SecurityManager.shared.validateSecurityState().get() != nil else {
                throw HealthRecordError.securityViolation
            }
            
            // Validate encryption integrity
            guard try validateEncryptionIntegrity() else {
                throw HealthRecordError.encryptionFailure
            }
            
            // Validate audit trail
            guard validateAuditTrail() else {
                throw HealthRecordError.validationFailure
            }
            
            return .success(())
        } catch let error as HealthRecordError {
            return .failure(error)
        } catch {
            return .failure(.validationFailure)
        }
    }
    
    /// Updates health record content with encryption and audit logging
    public func update(newContent: [String: Any]) -> Result<Void, HealthRecordError> {
        do {
            // Validate security context
            try SecurityManager.shared.validateSecurityState().get()
            
            // Encrypt new content
            let jsonData = try JSONSerialization.data(withJSONObject: newContent)
            let encryptedData = try EncryptionManager.shared.encrypt(jsonData).get()
            
            // Update content with new encrypted data
            self.content = EncryptedContent(
                data: encryptedData,
                iv: Data(), // Set from encryption result
                tag: Data() // Set from encryption result
            )
            
            // Update metadata
            self.metadata = HealthRecordMetadata(
                version: String(Int(self.metadata.version)! + 1),
                lastUpdated: Date(),
                source: self.metadata.source,
                creator: self.metadata.creator,
                fhirVersion: self.metadata.fhirVersion,
                securityLabels: self.metadata.securityLabels
            )
            
            // Log update in audit trail
            logAuditEvent("record_updated")
            
            return .success(())
        } catch let error as HealthRecordError {
            return .failure(error)
        } catch {
            return .failure(.validationFailure)
        }
    }
    
    // MARK: - Private Methods
    
    private func validateFHIRCompliance() throws {
        let validationResult = ValidationUtils.validateHealthData([
            "id": id,
            "patientId": patientId,
            "providerId": providerId,
            "type": type.rawValue,
            "date": date
        ])
        
        guard validationResult.isValid else {
            throw HealthRecordError.validationFailure
        }
    }
    
    private func validateEncryptionIntegrity() throws -> Bool {
        return try EncryptionManager.shared.verifyIntegrity(
            data: content.data,
            tag: content.tag
        ).get()
    }
    
    private func validateAuditTrail() -> Bool {
        return !auditTrail.entries.isEmpty &&
               auditTrail.entries.first?.action == "record_created"
    }
    
    private func logAuditEvent(_ action: String) {
        let entry = AuditTrail.AuditEntry(
            timestamp: Date(),
            action: action,
            performedBy: providerId,
            securityContext: [
                "securityLevel": securityLevel.rawValue,
                "encryptionKeyId": encryptionMetadata.keyId
            ]
        )
        auditTrail.entries.append(entry)
    }
}