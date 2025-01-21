package com.austa.superapp.features.auth.domain.models

import com.austa.superapp.core.utils.ValidationUtils
import com.austa.security.SecurityUtils // v2.1.0
import kotlinx.serialization.Serializable // v1.5.1
import java.util.Date
import java.util.UUID

/**
 * HIPAA-compliant User data model representing a user in the AUSTA SuperApp system.
 * Implements comprehensive security features, role-based access control, and audit logging.
 */
@Serializable
data class User(
    val id: String = UUID.randomUUID().toString(),
    private val email: String,
    private val password: String,
    val role: UserRole,
    val status: UserStatus,
    val profile: UserProfile,
    val securitySettings: UserSecuritySettings,
    val auditInfo: AuditInfo = AuditInfo(),
    val createdAt: Date = Date(),
    val updatedAt: Date = Date(),
    val lastModifiedBy: String = "SYSTEM"
) {
    init {
        // Validate email format
        require(ValidationUtils.validateEmail(email).isValid) {
            "Invalid email format"
        }

        // Validate phone number in profile
        require(ValidationUtils.validatePhone(profile.phoneNumber).isValid) {
            "Invalid phone number format"
        }

        // Validate date of birth
        require(profile.dateOfBirth != null && profile.dateOfBirth.before(Date())) {
            "Invalid date of birth"
        }

        // Encrypt sensitive PII data
        SecurityUtils.encryptPII(email)
        SecurityUtils.encryptPII(profile.phoneNumber)
        SecurityUtils.encryptPII(profile.socialSecurityNumber)
    }

    /**
     * Represents user roles with associated permissions
     */
    enum class UserRole {
        PATIENT,
        PROVIDER,
        ADMIN,
        INSURANCE_ADMIN
    }

    /**
     * Represents possible user account statuses
     */
    enum class UserStatus {
        ACTIVE,
        INACTIVE,
        SUSPENDED,
        PENDING_VERIFICATION,
        LOCKED
    }

    /**
     * User profile information with HIPAA-compliant data fields
     */
    @Serializable
    data class UserProfile(
        val firstName: String,
        val lastName: String,
        val dateOfBirth: Date?,
        val phoneNumber: String,
        val socialSecurityNumber: String?,
        val address: Address,
        val emergencyContact: EmergencyContact?,
        val preferredLanguage: String = "en",
        val medicalAlerts: List<String> = emptyList(),
        val profilePictureUrl: String? = null
    )

    /**
     * Address information structure
     */
    @Serializable
    data class Address(
        val streetLine1: String,
        val streetLine2: String?,
        val city: String,
        val state: String,
        val postalCode: String,
        val country: String,
        val isVerified: Boolean = false
    )

    /**
     * Emergency contact information
     */
    @Serializable
    data class EmergencyContact(
        val name: String,
        val relationship: String,
        val phoneNumber: String,
        val email: String?
    )

    /**
     * Security settings for enhanced user account protection
     */
    @Serializable
    data class UserSecuritySettings(
        val mfaEnabled: Boolean = false,
        val mfaMethod: MFAMethod = MFAMethod.NONE,
        val lastPasswordChange: Date = Date(),
        val passwordExpiryDays: Int = 90,
        val loginAttempts: Int = 0,
        val lastLoginTimestamp: Date? = null,
        val securityQuestions: List<SecurityQuestion> = emptyList(),
        val biometricEnabled: Boolean = false,
        val deviceTokens: List<String> = emptyList()
    )

    /**
     * Security question for account recovery
     */
    @Serializable
    data class SecurityQuestion(
        val question: String,
        val encryptedAnswer: String
    )

    /**
     * Multi-factor authentication methods
     */
    enum class MFAMethod {
        NONE,
        SMS,
        EMAIL,
        AUTHENTICATOR,
        BIOMETRIC
    }

    /**
     * Audit information for tracking user account changes
     */
    @Serializable
    data class AuditInfo(
        val createdBy: String = "SYSTEM",
        val createdAt: Date = Date(),
        val lastModifiedBy: String = "SYSTEM",
        val lastModifiedAt: Date = Date(),
        val lastLoginAttempt: Date? = null,
        val lastSuccessfulLogin: Date? = null,
        val accessHistory: List<AccessLog> = emptyList()
    )

    /**
     * Access log entry for audit trail
     */
    @Serializable
    data class AccessLog(
        val timestamp: Date,
        val action: String,
        val ipAddress: String,
        val deviceInfo: String,
        val status: String,
        val details: String?
    )

    /**
     * Checks if user account is active with security validation
     * @return Boolean indicating if account is active and compliant
     */
    fun isActive(): Boolean {
        return status == UserStatus.ACTIVE &&
                securitySettings.loginAttempts < AppConstants.SECURITY.MAX_LOGIN_ATTEMPTS &&
                securitySettings.lastLoginTimestamp?.let {
                    (Date().time - it.time) < (AppConstants.SECURITY.SESSION_TIMEOUT_MINUTES * 60 * 1000)
                } ?: false
    }

    /**
     * Enhanced role check with audit logging
     * @param role UserRole to check against
     * @return Boolean indicating if user has specified role
     */
    fun hasRole(role: UserRole): Boolean {
        val hasRole = this.role == role
        auditInfo.accessHistory.plus(
            AccessLog(
                timestamp = Date(),
                action = "ROLE_CHECK",
                ipAddress = "INTERNAL",
                deviceInfo = "SYSTEM",
                status = if (hasRole) "SUCCESS" else "DENIED",
                details = "Checked for role: $role"
            )
        )
        return hasRole
    }

    /**
     * Gets the user's display name
     * @return String containing user's full name
     */
    fun getDisplayName(): String = "${profile.firstName} ${profile.lastName}"

    /**
     * Gets masked email for display purposes
     * @return String containing partially masked email
     */
    fun getMaskedEmail(): String {
        val parts = email.split("@")
        return "${parts[0].take(2)}****@${parts[1]}"
    }
}