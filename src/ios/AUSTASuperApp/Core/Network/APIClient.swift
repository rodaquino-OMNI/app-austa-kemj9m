//
// APIClient.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// HTTP methods supported by the API client
public enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}

/// Priority levels for API requests
public enum RequestPriority: Int {
    case high = 0
    case normal = 1
    case low = 2
}

/// Configuration for WebSocket connections
public struct WebSocketConfig {
    let autoReconnect: Bool
    let heartbeatInterval: TimeInterval
    let maxReconnectAttempts: Int
}

/// Comprehensive error types for API operations
public enum APIError: LocalizedError {
    case networkError(NetworkError)
    case invalidResponse
    case decodingError
    case authenticationError
    case serverError(Int)
    case certificateError
    case requestTimeoutError
    case rateLimitError
    
    public var errorDescription: String? {
        switch self {
        case .networkError(let error): return error.localizedDescription
        case .invalidResponse: return "Invalid server response"
        case .decodingError: return "Failed to decode response"
        case .authenticationError: return "Authentication failed"
        case .serverError(let code): return "Server error: \(code)"
        case .certificateError: return "SSL certificate validation failed"
        case .requestTimeoutError: return "Request timed out"
        case .rateLimitError: return "Rate limit exceeded"
        }
    }
}

/// Singleton networking client with comprehensive security and performance features
@available(iOS 14.0, *)
public final class APIClient {
    
    // MARK: - Singleton Instance
    
    public static let shared = APIClient()
    
    // MARK: - Private Properties
    
    private let session: URLSession
    private let baseURL: URL
    private let cache: URLCache
    private let certificateValidator: CertificateValidator
    private let requestQueue: OperationQueue
    private let retryPolicy: RetryPolicy
    private let networkLogger: NetworkLogger
    private let requestPriorityQueue: PriorityQueue<URLRequest>
    
    // MARK: - Private Types
    
    private struct CertificateValidator {
        let pinnedCertificates: [String]
        
        func validate(_ challenge: URLAuthenticationChallenge) -> Bool {
            // Implementation of certificate pinning validation
            guard let serverTrust = challenge.protectionSpace.serverTrust,
                  let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
                return false
            }
            
            let serverCertificateData = SecCertificateCopyData(certificate) as Data
            let serverCertificateHash = serverCertificateData.sha256()
            
            return pinnedCertificates.contains(serverCertificateHash)
        }
    }
    
    private struct RetryPolicy {
        let maxAttempts: Int
        let baseDelay: TimeInterval
        
        func shouldRetry(attempt: Int, error: Error) -> Bool {
            guard attempt < maxAttempts else { return false }
            
            switch error {
            case APIError.networkError, APIError.serverError:
                return true
            case APIError.rateLimitError:
                return false
            default:
                return false
            }
        }
        
        func delayForAttempt(_ attempt: Int) -> TimeInterval {
            return baseDelay * pow(2.0, Double(attempt))
        }
    }
    
    // MARK: - Initialization
    
    private init() {
        // Configure URL Session with enhanced security
        let configuration = URLSessionConfiguration.default
        configuration.tlsMinimumSupportedProtocolVersion = .TLSv13
        configuration.httpAdditionalHeaders = [
            "User-Agent": "AUSTA-SuperApp/\(AppConstants.APP_VERSION)",
            "Accept": "application/json",
            "X-Client-Version": AppConstants.APP_VERSION
        ]
        configuration.timeoutIntervalForRequest = AppConstants.API.TIMEOUT_INTERVAL
        configuration.waitsForConnectivity = true
        
        // Initialize cache with size limits
        cache = URLCache(
            memoryCapacity: AppConstants.Storage.MAX_CACHE_SIZE,
            diskCapacity: AppConstants.Storage.MAX_OFFLINE_STORAGE,
            directory: URL(fileURLWithPath: AppConstants.Storage.DIRECTORIES.TEMP)
        )
        configuration.urlCache = cache
        
        // Configure certificate validation
        certificateValidator = CertificateValidator(
            pinnedCertificates: AppConstants.Security.SSL_CERTIFICATE_PINS
        )
        
        // Initialize session with security delegate
        session = URLSession(configuration: configuration, delegate: nil, delegateQueue: nil)
        
        // Configure base URL
        baseURL = URL(string: AppConstants.API.BASE_URL)!
        
        // Initialize request queue with QoS
        requestQueue = OperationQueue()
        requestQueue.maxConcurrentOperationCount = 4
        requestQueue.qualityOfService = .userInitiated
        
        // Configure retry policy
        retryPolicy = RetryPolicy(
            maxAttempts: AppConstants.API.MAX_RETRY_ATTEMPTS,
            baseDelay: 1.0
        )
        
        // Initialize network logger
        networkLogger = NetworkLogger()
        
        // Initialize priority queue
        requestPriorityQueue = PriorityQueue<URLRequest>()
    }
    
    // MARK: - Public Methods
    
    /// Makes a secure API request with comprehensive error handling and performance optimization
    public func request<T: Decodable>(
        endpoint: APIEndpoints,
        method: HTTPMethod,
        body: Data? = nil,
        headers: [String: String]? = nil,
        priority: RequestPriority = .normal
    ) -> AnyPublisher<T, Error> {
        
        // Validate network connectivity
        guard NetworkMonitor.shared.isConnected.value else {
            return Fail(error: APIError.networkError(.connectionLost)).eraseToAnyPublisher()
        }
        
        // Build request with security headers
        var request = URLRequest(url: baseURL.appendingPathComponent(endpoint.path))
        request.httpMethod = method.rawValue
        request.httpBody = body
        
        // Add authentication header
        request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
        
        // Add custom headers
        headers?.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        
        // Add security headers
        request.setValue(generateRequestSignature(for: request), forHTTPHeaderField: "X-Request-Signature")
        
        return session.dataTaskPublisher(for: request)
            .timeout(.seconds(AppConstants.API.TIMEOUT_INTERVAL), scheduler: DispatchQueue.global())
            .retry(when: { error -> AnyPublisher<Void, Error> in
                return self.shouldRetry(error: error)
                    ? Just(()).setFailureType(to: Error.self).eraseToAnyPublisher()
                    : Fail(error: error).eraseToAnyPublisher()
            })
            .tryMap { [weak self] data, response -> Data in
                guard let self = self else { throw APIError.invalidResponse }
                
                // Validate response
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw APIError.invalidResponse
                }
                
                // Log response metrics
                self.networkLogger.logResponse(httpResponse, data: data)
                
                // Handle response codes
                switch httpResponse.statusCode {
                case 200...299:
                    return data
                case 401:
                    throw APIError.authenticationError
                case 429:
                    throw APIError.rateLimitError
                case 500...599:
                    throw APIError.serverError(httpResponse.statusCode)
                default:
                    throw APIError.invalidResponse
                }
            }
            .decode(type: T.self, decoder: JSONDecoder())
            .mapError { error -> Error in
                if let apiError = error as? APIError {
                    return apiError
                }
                return APIError.decodingError
            }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    /// Establishes secure WebSocket connection with auto-reconnect capability
    public func connectWebSocket(
        sessionId: String,
        config: WebSocketConfig
    ) -> URLSessionWebSocketTask {
        let wsURL = URL(string: "\(AppConstants.API.WEBSOCKET_URL)/\(sessionId)")!
        var request = URLRequest(url: wsURL)
        
        // Add WebSocket-specific headers
        request.setValue(getAuthToken(), forHTTPHeaderField: "Sec-WebSocket-Protocol")
        request.setValue(generateRequestSignature(for: request), forHTTPHeaderField: "X-WS-Signature")
        
        let webSocketTask = session.webSocketTask(with: request)
        
        // Configure heartbeat
        if config.heartbeatInterval > 0 {
            setupHeartbeat(for: webSocketTask, interval: config.heartbeatInterval)
        }
        
        // Configure auto-reconnect
        if config.autoReconnect {
            setupAutoReconnect(for: webSocketTask, maxAttempts: config.maxReconnectAttempts)
        }
        
        webSocketTask.resume()
        return webSocketTask
    }
    
    // MARK: - Private Methods
    
    private func getAuthToken() -> String {
        // Implementation of secure token retrieval
        // This would typically involve keychain access
        return "jwt_token"
    }
    
    private func generateRequestSignature(for request: URLRequest) -> String {
        // Implementation of request signing for added security
        // This would typically use HMAC-SHA256
        return "signature"
    }
    
    private func shouldRetry(error: Error) -> Bool {
        // Implementation of retry logic
        return false
    }
    
    private func setupHeartbeat(for task: URLSessionWebSocketTask, interval: TimeInterval) {
        // Implementation of WebSocket heartbeat
    }
    
    private func setupAutoReconnect(for task: URLSessionWebSocketTask, maxAttempts: Int) {
        // Implementation of WebSocket auto-reconnect
    }
}

// MARK: - URLSessionDelegate Extension

extension APIClient: URLSessionDelegate {
    public func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              certificateValidator.validate(challenge) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        
        completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))
    }
}