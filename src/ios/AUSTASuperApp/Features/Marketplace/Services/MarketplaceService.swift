//
// MarketplaceService.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

// MARK: - Constants

private let CACHE_DURATION: TimeInterval = AppConstants.Storage.CACHE_DURATION
private let MAX_RETRY_ATTEMPTS: Int = AppConstants.API.MAX_RETRY_ATTEMPTS
private let MAX_CACHE_SIZE: Int = AppConstants.Storage.MAX_CACHE_SIZE
private let REQUEST_TIMEOUT: TimeInterval = AppConstants.API.TIMEOUT_INTERVAL
private let BATCH_SIZE: Int = 20

// MARK: - Types

/// Response type for paginated product listings
public struct PaginatedResponse<T: Codable>: Codable {
    public let items: T
    public let totalItems: Int
    public let currentPage: Int
    public let totalPages: Int
}

/// Options for product purchase
public struct PurchaseOptions: Codable {
    public let quantity: Int
    public let paymentMethod: String
    public let deliveryPreference: String?
}

/// Order confirmation details
public struct OrderConfirmation: Codable {
    public let orderId: String
    public let status: String
    public let timestamp: Date
    public let transactionId: String
}

/// Date range for filtering orders
public struct DateRange {
    public let startDate: Date
    public let endDate: Date
}

/// Order status enumeration
public enum OrderStatus: String, Codable {
    case pending = "pending"
    case confirmed = "confirmed"
    case completed = "completed"
    case cancelled = "cancelled"
}

// MARK: - Cached Product

private class CachedProduct {
    let product: Product
    let timestamp: Date
    
    init(product: Product) {
        self.product = product
        self.timestamp = Date()
    }
    
    var isValid: Bool {
        return Date().timeIntervalSince(timestamp) < CACHE_DURATION
    }
}

// MARK: - MarketplaceService Protocol

public protocol MarketplaceServiceProtocol {
    func getProducts(category: ProductCategory?, page: Int, pageSize: Int) -> AnyPublisher<PaginatedResponse<[Product]>, Error>
    func getProductDetails(productId: String, forceRefresh: Bool) -> AnyPublisher<Product, Error>
    func purchaseProduct(productId: String, options: PurchaseOptions) -> AnyPublisher<OrderConfirmation, Error>
    func getOrders(dateRange: DateRange?, status: OrderStatus?) -> AnyPublisher<[Order], Error>
}

// MARK: - MarketplaceService Implementation

@available(iOS 14.0, *)
public final class MarketplaceService: MarketplaceServiceProtocol {
    
    // MARK: - Properties
    
    private let apiClient: APIClient
    private let cache: NSCache<NSString, CachedProduct>
    private let monitor: PerformanceMonitor
    private let validator: InputValidator
    private let queue: DispatchQueue
    
    // MARK: - Initialization
    
    public init(client: APIClient = .shared,
                monitor: PerformanceMonitor = .shared) {
        self.apiClient = client
        self.monitor = monitor
        
        // Initialize cache with size limits
        self.cache = NSCache<NSString, CachedProduct>()
        self.cache.totalCostLimit = MAX_CACHE_SIZE
        
        // Initialize input validator
        self.validator = InputValidator()
        
        // Initialize concurrent queue for thread safety
        self.queue = DispatchQueue(label: "com.austa.marketplace",
                                 qos: .userInitiated,
                                 attributes: .concurrent)
    }
    
    // MARK: - Public Methods
    
    public func getProducts(category: ProductCategory?,
                          page: Int,
                          pageSize: Int) -> AnyPublisher<PaginatedResponse<[Product]>, Error> {
        // Validate input parameters
        guard validator.isValidPagination(page: page, pageSize: pageSize) else {
            return Fail(error: MarketplaceError.invalidPagination).eraseToAnyPublisher()
        }
        
        // Build API endpoint
        let endpoint = APIEndpoints.marketplace.getProducts(category: category?.rawValue)
        
        // Add pagination parameters
        let parameters: [String: Any] = [
            "page": page,
            "pageSize": min(pageSize, BATCH_SIZE),
            "category": category?.rawValue ?? ""
        ]
        
        // Start performance monitoring
        let metrics = monitor.startMetrics(name: "get_products")
        
        return apiClient.request(
            endpoint: endpoint,
            method: .get,
            parameters: parameters,
            priority: .normal
        )
        .handleEvents(
            receiveOutput: { [weak self] _ in
                self?.monitor.endMetrics(metrics)
            },
            receiveCompletion: { [weak self] completion in
                if case .failure = completion {
                    self?.monitor.recordError(metrics, error: "products_fetch_failed")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    public func getProductDetails(productId: String,
                                forceRefresh: Bool = false) -> AnyPublisher<Product, Error> {
        // Validate product ID
        guard validator.isValidProductId(productId) else {
            return Fail(error: MarketplaceError.invalidProductId).eraseToAnyPublisher()
        }
        
        // Check cache if not forcing refresh
        if !forceRefresh, let cached = getCachedProduct(productId) {
            return Just(cached.product)
                .setFailureType(to: Error.self)
                .eraseToAnyPublisher()
        }
        
        let endpoint = APIEndpoints.marketplace.getProductDetails(productId: productId)
        let metrics = monitor.startMetrics(name: "get_product_details")
        
        return apiClient.request(
            endpoint: endpoint,
            method: .get,
            priority: .high
        )
        .handleEvents(
            receiveOutput: { [weak self] (product: Product) in
                self?.cacheProduct(product)
                self?.monitor.endMetrics(metrics)
            },
            receiveCompletion: { [weak self] completion in
                if case .failure = completion {
                    self?.monitor.recordError(metrics, error: "product_details_fetch_failed")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    public func purchaseProduct(productId: String,
                              options: PurchaseOptions) -> AnyPublisher<OrderConfirmation, Error> {
        // Validate purchase parameters
        guard validator.isValidPurchaseOptions(options) else {
            return Fail(error: MarketplaceError.invalidPurchaseOptions).eraseToAnyPublisher()
        }
        
        let endpoint = APIEndpoints.marketplace.purchaseProduct(productId: productId)
        let metrics = monitor.startMetrics(name: "purchase_product")
        
        return apiClient.request(
            endpoint: endpoint,
            method: .post,
            body: try? JSONEncoder().encode(options),
            priority: .high
        )
        .handleEvents(
            receiveOutput: { [weak self] _ in
                self?.monitor.endMetrics(metrics)
            },
            receiveCompletion: { [weak self] completion in
                if case .failure = completion {
                    self?.monitor.recordError(metrics, error: "product_purchase_failed")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    public func getOrders(dateRange: DateRange?,
                         status: OrderStatus?) -> AnyPublisher<[Order], Error> {
        var parameters: [String: Any] = [:]
        
        if let dateRange = dateRange {
            parameters["startDate"] = ISO8601DateFormatter().string(from: dateRange.startDate)
            parameters["endDate"] = ISO8601DateFormatter().string(from: dateRange.endDate)
        }
        
        if let status = status {
            parameters["status"] = status.rawValue
        }
        
        let endpoint = APIEndpoints.marketplace.getOrders(status: status?.rawValue)
        let metrics = monitor.startMetrics(name: "get_orders")
        
        return apiClient.request(
            endpoint: endpoint,
            method: .get,
            parameters: parameters,
            priority: .normal
        )
        .handleEvents(
            receiveOutput: { [weak self] _ in
                self?.monitor.endMetrics(metrics)
            },
            receiveCompletion: { [weak self] completion in
                if case .failure = completion {
                    self?.monitor.recordError(metrics, error: "orders_fetch_failed")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func getCachedProduct(_ productId: String) -> CachedProduct? {
        guard let cached = cache.object(forKey: productId as NSString),
              cached.isValid else {
            return nil
        }
        return cached
    }
    
    private func cacheProduct(_ product: Product) {
        queue.async(flags: .barrier) {
            self.cache.setObject(CachedProduct(product: product),
                               forKey: product.id as NSString)
        }
    }
}

// MARK: - MarketplaceError

private enum MarketplaceError: LocalizedError {
    case invalidPagination
    case invalidProductId
    case invalidPurchaseOptions
    case cacheError
    
    var errorDescription: String? {
        switch self {
        case .invalidPagination:
            return "Invalid pagination parameters"
        case .invalidProductId:
            return "Invalid product identifier"
        case .invalidPurchaseOptions:
            return "Invalid purchase options"
        case .cacheError:
            return "Cache operation failed"
        }
    }
}