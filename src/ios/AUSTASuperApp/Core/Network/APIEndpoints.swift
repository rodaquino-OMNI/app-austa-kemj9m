//
// APIEndpoints.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+

/// Comprehensive API endpoint definitions for the AUSTA SuperApp
/// Implements REST and WebSocket protocols with full security compliance
public enum APIEndpoints {
    
    // MARK: - Authentication Endpoints
    public enum auth {
        /// OAuth2 login with support for multiple authentication methods
        case login(method: String)
        /// New user registration with validation
        case register
        /// JWT token refresh
        case refreshToken
        /// Biometric authentication verification
        case biometricAuth
        /// Multi-factor authentication verification
        case mfaVerify(method: String)
        /// Session management operations
        case sessionManagement(action: String)
        
        var path: String {
            let base = AppConstants.API.ENDPOINTS.AUTH
            switch self {
            case .login(let method):
                return "\(base)/login/\(method)"
            case .register:
                return "\(base)/register"
            case .refreshToken:
                return "\(base)/token/refresh"
            case .biometricAuth:
                return "\(base)/biometric"
            case .mfaVerify(let method):
                return "\(base)/mfa/verify/\(method)"
            case .sessionManagement(let action):
                return "\(base)/session/\(action)"
            }
        }
    }
    
    // MARK: - Virtual Care Endpoints
    public enum virtualCare {
        /// Create new telemedicine session
        case createSession(providerId: String)
        /// Join existing telemedicine session
        case joinSession(sessionId: String)
        /// End active telemedicine session
        case endSession(sessionId: String)
        /// WebSocket connection for real-time communication
        case webSocketConnect(sessionId: String)
        /// Secure file sharing during session
        case fileShare(sessionId: String)
        /// Real-time status updates
        case realTimeStatus(sessionId: String)
        
        var path: String {
            let base = AppConstants.API.ENDPOINTS.VIRTUAL_CARE
            switch self {
            case .createSession(let providerId):
                return "\(base)/sessions/create/\(providerId)"
            case .joinSession(let sessionId):
                return "\(base)/sessions/join/\(sessionId)"
            case .endSession(let sessionId):
                return "\(base)/sessions/end/\(sessionId)"
            case .webSocketConnect(let sessionId):
                return "\(AppConstants.API.WEBSOCKET_URL)/sessions/\(sessionId)"
            case .fileShare(let sessionId):
                return "\(base)/sessions/\(sessionId)/files"
            case .realTimeStatus(let sessionId):
                return "\(base)/sessions/\(sessionId)/status"
            }
        }
    }
    
    // MARK: - Health Records Endpoints
    public enum healthRecords {
        /// Retrieve health records with HIPAA compliance
        case getRecords(patientId: String)
        /// Secure document upload
        case uploadDocument(type: String)
        /// Share records with authorized providers
        case shareRecord(recordId: String, recipientId: String)
        /// Wearable device data synchronization
        case syncWearableData(deviceId: String)
        /// Access audit trail
        case auditTrail(recordId: String)
        /// Encrypted data transfer
        case encryptedTransfer(recordId: String)
        
        var path: String {
            let base = AppConstants.API.ENDPOINTS.HEALTH_RECORDS
            switch self {
            case .getRecords(let patientId):
                return "\(base)/\(patientId)"
            case .uploadDocument(let type):
                return "\(base)/documents/upload/\(type)"
            case .shareRecord(let recordId, let recipientId):
                return "\(base)/\(recordId)/share/\(recipientId)"
            case .syncWearableData(let deviceId):
                return "\(base)/wearables/sync/\(deviceId)"
            case .auditTrail(let recordId):
                return "\(base)/\(recordId)/audit"
            case .encryptedTransfer(let recordId):
                return "\(base)/\(recordId)/transfer"
            }
        }
    }
    
    // MARK: - Insurance Claims Endpoints
    public enum claims {
        /// Submit new insurance claim
        case submitClaim
        /// Retrieve claims history
        case getClaims(status: String?)
        /// Check claim status
        case getClaimStatus(claimId: String)
        /// Upload claim supporting documents
        case uploadClaimDocument(claimId: String)
        /// Batch claims processing
        case batchProcess(batchId: String)
        /// Document verification
        case verifyDocuments(claimId: String)
        
        var path: String {
            let base = AppConstants.API.ENDPOINTS.CLAIMS
            switch self {
            case .submitClaim:
                return "\(base)/submit"
            case .getClaims(let status):
                return status != nil ? "\(base)?status=\(status!)" : base
            case .getClaimStatus(let claimId):
                return "\(base)/\(claimId)/status"
            case .uploadClaimDocument(let claimId):
                return "\(base)/\(claimId)/documents"
            case .batchProcess(let batchId):
                return "\(base)/batch/\(batchId)"
            case .verifyDocuments(let claimId):
                return "\(base)/\(claimId)/verify"
            }
        }
    }
    
    // MARK: - Marketplace Endpoints
    public enum marketplace {
        /// Get available products/services
        case getProducts(category: String?)
        /// Get detailed product information
        case getProductDetails(productId: String)
        /// Process product purchase
        case purchaseProduct(productId: String)
        /// Retrieve order history
        case getOrders(status: String?)
        /// Check product inventory
        case checkInventory(productId: String)
        /// Process payment
        case processPayment(orderId: String)
        
        var path: String {
            let base = AppConstants.API.ENDPOINTS.MARKETPLACE
            switch self {
            case .getProducts(let category):
                return category != nil ? "\(base)/products?category=\(category!)" : "\(base)/products"
            case .getProductDetails(let productId):
                return "\(base)/products/\(productId)"
            case .purchaseProduct(let productId):
                return "\(base)/products/\(productId)/purchase"
            case .getOrders(let status):
                return status != nil ? "\(base)/orders?status=\(status!)" : "\(base)/orders"
            case .checkInventory(let productId):
                return "\(base)/products/\(productId)/inventory"
            case .processPayment(let orderId):
                return "\(base)/orders/\(orderId)/payment"
            }
        }
    }
    
    // MARK: - Helper Methods
    
    /// Constructs full URL for REST endpoints
    public static func getFullURL(for endpoint: String) -> URL? {
        let baseURL = AppConstants.API.BASE_URL
        let version = AppConstants.API.API_VERSION
        let urlString = "\(baseURL)/\(version)\(endpoint)"
        return URL(string: urlString)
    }
    
    /// Constructs WebSocket URL for real-time endpoints
    public static func getWebSocketURL(for endpoint: String) -> URL? {
        let wsURL = AppConstants.API.WEBSOCKET_URL
        let version = AppConstants.API.API_VERSION
        let urlString = "\(wsURL)/\(version)\(endpoint)"
        return URL(string: urlString)
    }
}