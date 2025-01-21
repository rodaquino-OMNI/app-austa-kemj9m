//
// AppConstants.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+

/// Global constants and configuration values for the AUSTA SuperApp iOS application
public struct AppConstants {
    
    // MARK: - Global App Configuration
    static let APP_VERSION = "1.0.0"
    static let BUILD_NUMBER = "1"
    static let MIN_IOS_VERSION = "14.0"
    
    #if DEBUG
    static let DEBUG_MODE = true
    #else
    static let DEBUG_MODE = false
    #endif
    
    // MARK: - API Configuration
    public struct API {
        /// Base URL for API endpoints
        static let BASE_URL = "https://api.austa-health.com"
        static let API_VERSION = "v1"
        static let WEBSOCKET_URL = "wss://realtime.austa-health.com"
        static let TIMEOUT_INTERVAL: TimeInterval = 30.0
        static let MAX_RETRY_ATTEMPTS = 3
        
        struct ENDPOINTS {
            static let AUTH = "/auth"
            static let HEALTH_RECORDS = "/health-records"
            static let VIRTUAL_CARE = "/virtual-care"
            static let INSURANCE = "/insurance"
            static let CLAIMS = "/claims"
            static let MARKETPLACE = "/marketplace"
        }
    }
    
    // MARK: - Security Configuration
    public struct Security {
        static let KEYCHAIN_SERVICE = "com.austa-health.superapp"
        static let KEYCHAIN_ACCESS_GROUP = "group.com.austa-health.superapp"
        static let ENCRYPTION_KEY_SIZE = 256 // AES-256-GCM
        static let SSL_CERTIFICATE_PINS = [
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        ]
        static let JWT_EXPIRATION: TimeInterval = 900 // 15 minutes
        static let BIOMETRIC_TIMEOUT: TimeInterval = 300 // 5 minutes
        
        struct ENCRYPTION {
            static let ALGORITHM = "AES-256-GCM"
            static let KEY_DERIVATION = "PBKDF2"
            static let ITERATIONS = 10000
            static let SALT_LENGTH = 32
        }
    }
    
    // MARK: - Storage Configuration
    public struct Storage {
        static let MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
        static let DOCUMENT_DIRECTORY = "AUSTADocuments"
        static let CACHE_DURATION: TimeInterval = 86400 // 24 hours
        static let MAX_OFFLINE_STORAGE = 500 * 1024 * 1024 // 500MB
        static let CLEANUP_THRESHOLD = 0.9 // 90% of max storage
        
        struct DIRECTORIES {
            static let HEALTH_RECORDS = "HealthRecords"
            static let PRESCRIPTIONS = "Prescriptions"
            static let INSURANCE_DOCS = "InsuranceDocs"
            static let TEMP = "Temporary"
        }
    }
    
    // MARK: - Feature Flags
    public struct Features {
        static let ENABLE_BIOMETRIC_AUTH = true
        static let ENABLE_OFFLINE_MODE = true
        static let ENABLE_ANALYTICS = true
        static let ENABLE_CRASH_REPORTING = true
        static let ENABLE_REMOTE_CONFIG = true
        static let ENABLE_PUSH_NOTIFICATIONS = true
        
        struct LIMITS {
            static let MAX_OFFLINE_DAYS = 30
            static let MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
            static let MAX_VIDEO_DURATION = 3600 // 1 hour
        }
    }
    
    // MARK: - Analytics Configuration
    public struct Analytics {
        static let TRACKING_ID = "UA-AUSTA-HEALTH"
        static let SESSION_TIMEOUT: TimeInterval = 1800 // 30 minutes
        static let BATCH_SIZE = 100
        
        struct EVENT_TYPES {
            static let USER_ACTION = "user_action"
            static let ERROR = "error"
            static let PERFORMANCE = "performance"
            static let SECURITY = "security"
            static let HEALTH_RECORD = "health_record"
            static let TELEMEDICINE = "telemedicine"
            static let INSURANCE = "insurance"
        }
        
        struct METRICS {
            static let API_LATENCY = "api_latency"
            static let APP_LAUNCH = "app_launch"
            static let SCREEN_LOAD = "screen_load"
            static let MEMORY_USAGE = "memory_usage"
        }
    }
}