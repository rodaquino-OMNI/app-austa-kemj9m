package com.austa.superapp.features.virtualcare.domain.models

import com.austa.superapp.features.auth.domain.models.User
import com.austa.superapp.core.utils.ValidationUtils
import com.austa.superapp.core.constants.AppConstants
import com.austa.security.SecurityUtils // v1.0.0
import kotlinx.serialization.Serializable // v1.5.1
import java.util.Date
import java.util.UUID

/**
 * HIPAA-compliant data class representing a virtual care consultation session.
 * Implements secure video consultation with comprehensive audit trails and role-based access control.
 */
@Serializable
data class Consultation(
    val id: String = UUID.randomUUID().toString(),
    val patientId: String,
    val providerId: String,
    val scheduledStartTime: Date,
    val actualStartTime: Date? = null,
    val endTime: Date? = null,
    val status: ConsultationStatus = ConsultationStatus.SCHEDULED,
    val participants: MutableList<ConsultationParticipant> = mutableListOf(),
    val healthRecordId: String? = null,
    val twilioRoomSid: String? = null,
    val metadata: ConsultationMetadata = ConsultationMetadata(),
    val auditTrail: MutableList<AuditEntry> = mutableListOf(),
    private val sensitiveInfo: EncryptedData? = null
) {
    init {
        require(ValidationUtils.validateHealthData(mapOf(
            "patientId" to patientId,
            "providerId" to providerId
        )).isValid) { "Invalid participant IDs" }

        // Add initial audit entry
        auditTrail.add(AuditEntry(
            action = "CONSULTATION_CREATED",
            timestamp = Date(),
            performedBy = "SYSTEM",
            details = "Consultation scheduled for $scheduledStartTime"
        ))
    }

    /**
     * Consultation status states with HIPAA compliance tracking
     */
    enum class ConsultationStatus {
        SCHEDULED,
        IN_PROGRESS,
        COMPLETED,
        CANCELLED,
        NO_SHOW,
        TECHNICAL_ISSUES
    }

    /**
     * HIPAA-compliant participant information
     */
    @Serializable
    data class ConsultationParticipant(
        val userId: String,
        val role: User.UserRole,
        val joinTime: Date? = null,
        val leaveTime: Date? = null,
        val connectionQuality: ConnectionQuality = ConnectionQuality.UNKNOWN,
        val deviceInfo: DeviceInfo
    )

    /**
     * Connection quality monitoring for performance optimization
     */
    enum class ConnectionQuality {
        EXCELLENT,
        GOOD,
        FAIR,
        POOR,
        DISCONNECTED,
        UNKNOWN
    }

    /**
     * Device information for audit and troubleshooting
     */
    @Serializable
    data class DeviceInfo(
        val deviceId: String,
        val platform: String,
        val osVersion: String,
        val appVersion: String,
        val networkType: String
    )

    /**
     * Metadata for consultation session
     */
    @Serializable
    data class ConsultationMetadata(
        val specialtyType: String? = null,
        val consultationType: String = "GENERAL",
        val priority: Priority = Priority.NORMAL,
        val notes: String? = null,
        val recordingEnabled: Boolean = false,
        val maxDuration: Int = AppConstants.VIRTUAL_CARE.SESSION_TIMEOUT_MINUTES,
        val technicalConfig: TechnicalConfig = TechnicalConfig()
    )

    /**
     * Technical configuration for video consultation
     */
    @Serializable
    data class TechnicalConfig(
        val videoQuality: String = AppConstants.VIRTUAL_CARE.MAX_VIDEO_QUALITY,
        val audioBitrate: Int = AppConstants.VIRTUAL_CARE.MAX_AUDIO_BITRATE,
        val videoBitrate: Int = AppConstants.VIRTUAL_CARE.MAX_VIDEO_BITRATE,
        val frameRate: Int = AppConstants.VIRTUAL_CARE.FRAME_RATE,
        val echoCancellation: Boolean = AppConstants.VIRTUAL_CARE.ECHO_CANCELLATION,
        val noiseSuppression: Boolean = AppConstants.VIRTUAL_CARE.NOISE_SUPPRESSION
    )

    /**
     * Priority levels for consultation scheduling
     */
    enum class Priority {
        URGENT,
        HIGH,
        NORMAL,
        LOW
    }

    /**
     * Audit trail entry for HIPAA compliance
     */
    @Serializable
    data class AuditEntry(
        val timestamp: Date,
        val action: String,
        val performedBy: String,
        val details: String,
        val ipAddress: String = "INTERNAL",
        val success: Boolean = true
    )

    /**
     * Encrypted sensitive data container
     */
    @Serializable
    data class EncryptedData(
        val encryptedContent: String,
        val iv: String,
        val algorithm: String = AppConstants.SECURITY.ENCRYPTION_ALGORITHM
    )

    /**
     * Checks if consultation is currently active
     * @return Boolean indicating if consultation is in progress
     */
    fun isActive(): Boolean {
        return status == ConsultationStatus.IN_PROGRESS &&
                actualStartTime != null &&
                endTime == null &&
                participants.any { it.leaveTime == null }
    }

    /**
     * Calculates consultation duration with caching optimization
     * @return Long duration in minutes, or null if consultation hasn't ended
     */
    fun getDuration(): Long? {
        if (actualStartTime == null || endTime == null) return null
        return (endTime.time - actualStartTime.time) / (60 * 1000)
    }

    /**
     * Validates if user has permission to access this consultation
     * @param userId String ID of user attempting access
     * @param role User.UserRole role of user attempting access
     * @return Boolean indicating if access is permitted
     */
    fun canAccess(userId: String, role: User.UserRole): Boolean {
        return when (role) {
            User.UserRole.PROVIDER -> userId == providerId
            User.UserRole.PATIENT -> userId == patientId
            User.UserRole.ADMIN -> true
            else -> false
        }
    }
}