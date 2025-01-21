package com.austa.superapp.features.claims.domain.models

import com.austa.superapp.core.constants.AppConstants
import kotlinx.serialization.Serializable // v1.5.1
import java.util.Date
import java.util.UUID

/**
 * Enhanced enum class defining possible claim statuses with validation logic
 */
@Serializable
enum class ClaimStatus {
    SUBMITTED,
    IN_REVIEW,
    APPROVED,
    REJECTED,
    PENDING_INFO;

    /**
     * Validates if status transition is allowed based on HIPAA compliance rules
     * @param newStatus The target status to transition to
     * @return Boolean indicating if transition is valid
     */
    fun isValidTransition(newStatus: ClaimStatus): Boolean {
        return when (this) {
            SUBMITTED -> setOf(IN_REVIEW, PENDING_INFO).contains(newStatus)
            IN_REVIEW -> setOf(APPROVED, REJECTED, PENDING_INFO).contains(newStatus)
            PENDING_INFO -> setOf(IN_REVIEW).contains(newStatus)
            APPROVED, REJECTED -> false
        }
    }
}

/**
 * Enhanced enum class defining types of insurance claims with metadata
 */
@Serializable
enum class ClaimType {
    MEDICAL,
    PHARMACY,
    DENTAL,
    VISION;

    /**
     * Determines if claim type requires pre-authorization based on policy rules
     * @return Boolean indicating pre-authorization requirement
     */
    fun requiresPreAuth(): Boolean {
        return when (this) {
            MEDICAL -> true
            PHARMACY -> false
            DENTAL -> true
            VISION -> false
        }
    }
}

/**
 * Enhanced data class for secure claim supporting documents with HIPAA compliance
 */
@Serializable
data class ClaimDocument(
    val id: String = UUID.randomUUID().toString(),
    val type: String,
    val title: String,
    val encryptedUrl: String,
    val uploadedAt: Date = Date(),
    val uploadedBy: String,
    val hashValue: String,
    val containsPHI: Boolean = false,
    val retentionDate: Date
)

/**
 * Enhanced data class for comprehensive claim metadata with security context
 */
@Serializable
data class ClaimMetadata(
    val policyNumber: String,
    val insuranceProvider: String,
    val facility: String,
    val diagnosisCodes: List<String>,
    val procedureCodes: List<String>,
    val coveragePercentage: Double,
    val deductibleApplied: Double,
    val preAuthNumber: String? = null,
    val securityLabels: Map<String, String> = mapOf(),
    val notes: String? = null
)

/**
 * Enhanced data class for secure audit trail entries
 */
@Serializable
data class AuditEntry(
    val timestamp: Date = Date(),
    val userId: String,
    val action: String,
    val details: String,
    val ipAddress: String,
    val deviceInfo: String
)

/**
 * Enhanced main data class representing a HIPAA-compliant insurance claim
 * with comprehensive security features and audit trails
 */
@Serializable
data class Claim(
    val id: String = UUID.randomUUID().toString(),
    val patientId: String,
    val providerId: String,
    val type: ClaimType,
    val status: ClaimStatus = ClaimStatus.SUBMITTED,
    val amount: Double,
    val serviceDate: Date,
    val submissionDate: Date = Date(),
    val healthRecordId: String,
    val documents: List<ClaimDocument> = listOf(),
    val metadata: ClaimMetadata,
    val auditTrail: List<AuditEntry> = listOf(),
    val securityContext: Map<String, String> = mapOf()
) {
    init {
        require(amount > 0 && amount <= AppConstants.CLAIMS.MAX_CLAIM_AMOUNT) {
            "Claim amount must be between 0 and ${AppConstants.CLAIMS.MAX_CLAIM_AMOUNT}"
        }
        require(documents.size <= AppConstants.CLAIMS.MAX_ATTACHMENTS) {
            "Maximum ${AppConstants.CLAIMS.MAX_ATTACHMENTS} attachments allowed"
        }
        require(serviceDate <= Date()) {
            "Service date cannot be in the future"
        }
    }

    /**
     * Enhanced check if claim can be edited based on status and security context
     * @param userId ID of user attempting to edit
     * @return Boolean indicating if claim is editable
     */
    fun isEditable(userId: String): Boolean {
        return when {
            status in setOf(ClaimStatus.APPROVED, ClaimStatus.REJECTED) -> false
            securityContext["locked_by"]?.let { it != userId } == true -> false
            else -> true
        }
    }

    /**
     * Enhanced calculation of expected reimbursement with policy rules
     * @return Double representing expected reimbursement amount
     */
    fun calculateReimbursement(): Double {
        val baseAmount = amount * (metadata.coveragePercentage / 100)
        return maxOf(0.0, baseAmount - metadata.deductibleApplied)
    }

    /**
     * Adds secure audit trail entry for claim modifications
     * @param userId ID of user performing action
     * @param action Description of action performed
     * @param reason Reason for modification
     */
    fun addAuditEntry(userId: String, action: String, reason: String) {
        val entry = AuditEntry(
            userId = userId,
            action = action,
            details = reason,
            ipAddress = "INTERNAL", // Would be populated from actual request
            deviceInfo = "SYSTEM"   // Would be populated from actual request
        )
        auditTrail + entry
    }

    companion object {
        /**
         * Retention period in years for claim records per HIPAA requirements
         */
        const val RETENTION_PERIOD_YEARS = AppConstants.CLAIMS.RETENTION_PERIOD_YEARS
    }
}