package com.austa.superapp.core.constants

import kotlin.jvm.JvmField // v1.9.0

/**
 * Global application constants for the AUSTA SuperApp Android client.
 * Provides centralized configuration for all app components with type-safe access.
 * Implements HIPAA compliance and security standards.
 */
object AppConstants {

    /**
     * Core application configuration constants
     */
    object APP {
        @JvmField val VERSION = "1.0.0"
        @JvmField val DEBUG_MODE = false
        @JvmField val MIN_SDK_VERSION = 24
        @JvmField val TARGET_SDK_VERSION = 34
        @JvmField val DATABASE_VERSION = 1
        @JvmField val DATABASE_NAME = "austa_superapp.db"
        @JvmField val BUILD_TYPE = "release"
        @JvmField val FLAVOR = "production"
        @JvmField val APPLICATION_ID = "com.austa.superapp"
        @JvmField val CACHE_DIR_NAME = "austa_cache"
        @JvmField val MAX_CACHE_SIZE_MB = 500
        @JvmField val LOG_LEVEL = "INFO"
    }

    /**
     * Network configuration constants optimized for healthcare data transmission
     */
    object NETWORK {
        @JvmField val CONNECT_TIMEOUT = 30L // seconds
        @JvmField val READ_TIMEOUT = 30L // seconds
        @JvmField val WRITE_TIMEOUT = 30L // seconds
        @JvmField val MAX_RETRIES = 3
        @JvmField val RETRY_DELAY_MS = 1000L
        @JvmField val BASE_URL = "https://api.austa.health"
        @JvmField val API_VERSION = "v1"
        @JvmField val SOCKET_TIMEOUT = 45L // seconds
        @JvmField val KEEP_ALIVE_DURATION = 300L // seconds
        @JvmField val MAX_IDLE_CONNECTIONS = 5
        @JvmField val COMPRESSION_ENABLED = true
        @JvmField val CACHE_SIZE_MB = 10
        @JvmField val SSL_PROTOCOL = "TLSv1.3"
    }

    /**
     * Security configuration constants compliant with HIPAA standards
     */
    object SECURITY {
        @JvmField val TOKEN_EXPIRY_HOURS = 24
        @JvmField val REFRESH_TOKEN_EXPIRY_DAYS = 30
        @JvmField val BIOMETRIC_TIMEOUT_SECONDS = 30
        @JvmField val KEY_ALIAS = "AUSTA_KEY"
        @JvmField val SHARED_PREFS_NAME = "AUSTA_SECURE_PREFS"
        @JvmField val ENCRYPTION_ALGORITHM = "AES/GCM/NoPadding"
        @JvmField val KEY_SIZE = 256
        @JvmField val IV_LENGTH = 12
        @JvmField val AUTH_TAG_LENGTH = 128
        @JvmField val SALT_LENGTH_BYTES = 32
        @JvmField val PASSWORD_MIN_LENGTH = 12
        @JvmField val PASSWORD_MAX_LENGTH = 64
        @JvmField val MAX_LOGIN_ATTEMPTS = 5
        @JvmField val LOCKOUT_DURATION_MINUTES = 30
        @JvmField val PIN_LENGTH = 6
        @JvmField val SESSION_TIMEOUT_MINUTES = 15
    }

    /**
     * Virtual care and telemedicine configuration constants
     */
    object VIRTUAL_CARE {
        @JvmField val MAX_VIDEO_QUALITY = "720p"
        @JvmField val MAX_AUDIO_BITRATE = 32000 // bps
        @JvmField val MAX_VIDEO_BITRATE = 1500000 // bps
        @JvmField val SESSION_TIMEOUT_MINUTES = 60
        @JvmField val FRAME_RATE = 30
        @JvmField val AUDIO_SAMPLE_RATE = 44100
        @JvmField val ECHO_CANCELLATION = true
        @JvmField val NOISE_SUPPRESSION = true
        @JvmField val AUTO_GAIN_CONTROL = true
        @JvmField val VIDEO_CODEC = "VP8"
        @JvmField val AUDIO_CODEC = "OPUS"
        @JvmField val MAX_PARTICIPANTS = 2
        @JvmField val RECONNECT_ATTEMPTS = 3
    }

    /**
     * Health records management configuration constants
     */
    object HEALTH_RECORDS {
        @JvmField val MAX_FILE_SIZE_MB = 50
        @JvmField val SUPPORTED_MIME_TYPES = arrayOf("application/pdf", "image/jpeg", "image/png", "application/dicom")
        @JvmField val CACHE_DURATION_DAYS = 7
        @JvmField val THUMBNAIL_SIZE = 200
        @JvmField val COMPRESSION_QUALITY = 85
        @JvmField val MAX_RECORDS_PER_REQUEST = 100
        @JvmField val SYNC_INTERVAL_HOURS = 24
        @JvmField val RETENTION_PERIOD_YEARS = 7
        @JvmField val ENCRYPTION_ENABLED = true
        @JvmField val AUDIT_LOG_ENABLED = true
        @JvmField val MAX_SEARCH_RESULTS = 500
    }

    /**
     * Insurance claims processing configuration constants
     */
    object CLAIMS {
        @JvmField val MAX_ATTACHMENTS = 5
        @JvmField val MAX_ATTACHMENT_SIZE_MB = 10
        @JvmField val SUPPORTED_ATTACHMENT_TYPES = arrayOf("application/pdf", "image/jpeg", "image/png")
        @JvmField val PROCESSING_TIMEOUT_SECONDS = 180
        @JvmField val MAX_CLAIM_AMOUNT = 1000000
        @JvmField val CURRENCY = "USD"
        @JvmField val RETENTION_PERIOD_YEARS = 7
        @JvmField val AUTO_APPROVAL_THRESHOLD = 100
        @JvmField val REVIEW_REQUIRED_THRESHOLD = 1000
    }

    /**
     * UI/UX configuration constants for consistent user experience
     */
    object UI {
        @JvmField val ANIMATION_DURATION_MS = 300L
        @JvmField val DEBOUNCE_DELAY_MS = 300L
        @JvmField val MAX_SEARCH_RESULTS = 50
        @JvmField val PAGINATION_PAGE_SIZE = 20
        @JvmField val SPLASH_DURATION_MS = 2000L
        @JvmField val TOAST_DURATION_MS = 3000L
        @JvmField val SNACKBAR_DURATION_MS = 5000L
        @JvmField val REFRESH_INTERVAL_MS = 60000L
        @JvmField val MIN_TOUCH_TARGET_DP = 48
        @JvmField val RIPPLE_ALPHA = 0.25f
        @JvmField val TEXT_SIZE_SP = 16f
    }

    /**
     * Analytics and tracking configuration constants
     */
    object ANALYTICS {
        @JvmField val SESSION_TIMEOUT_MINUTES = 30
        @JvmField val BATCH_SIZE = 100
        @JvmField val FLUSH_INTERVAL_SECONDS = 300
        @JvmField val MAX_QUEUE_SIZE = 1000
        @JvmField val SAMPLING_RATE = 1.0f
        @JvmField val ERROR_SAMPLING_RATE = 1.0f
        @JvmField val PERFORMANCE_SAMPLING_RATE = 0.1f
        @JvmField val USER_PROPERTY_COUNT = 25
        @JvmField val EVENT_PROPERTY_COUNT = 50
        @JvmField val MAX_EVENT_NAME_LENGTH = 40
    }

    /**
     * Push notification configuration constants
     */
    object NOTIFICATIONS {
        @JvmField val CHANNEL_ID = "AUSTA_CHANNEL"
        @JvmField val CHANNEL_NAME = "AUSTA SuperApp Notifications"
        @JvmField val CHANNEL_DESCRIPTION = "Receive important updates about your healthcare"
        @JvmField val RETRY_INTERVAL_MINUTES = 15
        @JvmField val PRIORITY = "HIGH"
        @JvmField val VIBRATION_PATTERN = longArrayOf(0, 250, 250, 250)
        @JvmField val LED_COLOR = "#FF0000"
        @JvmField val SOUND_ENABLED = true
        @JvmField val GROUP_KEY = "AUSTA_GROUP"
        @JvmField val MAX_NOTIFICATIONS = 50
    }
}