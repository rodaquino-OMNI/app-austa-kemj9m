//
// MarketplaceViewModel.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import Foundation // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SwiftUI // Version: iOS 14.0+
import os.log // Version: iOS 14.0+

/// Constants for marketplace operations
private enum Constants {
    static let PRODUCTS_PAGE_SIZE = 20
    static let SEARCH_DEBOUNCE_TIME: TimeInterval = 0.5
    static let MAX_CACHE_SIZE = 100
    static let MAX_RETRY_ATTEMPTS = 3
}

/// View model for managing marketplace feature with enhanced security and performance
@MainActor
@available(iOS 14.0, *)
public final class MarketplaceViewModel: ViewModelProtocol, ObservableObject {
    
    // MARK: - Published Properties
    
    @Published private(set) var products: [Product] = []
    @Published var selectedCategory: ProductCategory?
    @Published var searchQuery: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var currentPage: Int = 1
    @Published var hasMorePages: Bool = true
    @Published var state: ViewModelState = .idle
    @Published var lifecycleState: ViewModelLifecycle = .inactive
    
    // MARK: - Private Properties
    
    private let marketplaceService: MarketplaceService
    private var cancellables = Set<AnyCancellable>()
    private let productCache: NSCache<NSString, [Product]>
    private let logger = OSLog(subsystem: AppConstants.Security.KEYCHAIN_SERVICE, category: "MarketplaceViewModel")
    private let searchSubject = PassthroughSubject<String, Never>()
    private let categorySubject = PassthroughSubject<ProductCategory?, Never>()
    
    // MARK: - Initialization
    
    public init(marketplaceService: MarketplaceService) {
        self.marketplaceService = marketplaceService
        
        // Initialize cache with size limits
        self.productCache = NSCache<NSString, [Product]>()
        self.productCache.countLimit = Constants.MAX_CACHE_SIZE
        
        setupBindings()
        setupSearchDebounce()
        activate()
    }
    
    // MARK: - Public Methods
    
    /// Fetches products with pagination and caching
    public func fetchProducts() {
        guard !isLoading, hasMorePages else { return }
        
        setLoading(true)
        
        // Check cache first
        let cacheKey = getCacheKey(page: currentPage, category: selectedCategory)
        if let cachedProducts = productCache.object(forKey: cacheKey as NSString) {
            self.products.append(contentsOf: cachedProducts)
            setLoading(false)
            return
        }
        
        marketplaceService.getProducts(
            category: selectedCategory,
            page: currentPage,
            pageSize: Constants.PRODUCTS_PAGE_SIZE
        )
        .receive(on: DispatchQueue.main)
        .retry(Constants.MAX_RETRY_ATTEMPTS)
        .sink { [weak self] completion in
            guard let self = self else { return }
            
            switch completion {
            case .finished:
                break
            case .failure(let error):
                self.handleError(ServiceError.networkError(error))
            }
        } receiveValue: { [weak self] response in
            guard let self = self else { return }
            
            // Update pagination state
            self.hasMorePages = response.currentPage < response.totalPages
            self.currentPage += 1
            
            // Cache and update products
            self.cacheProducts(response.items, forKey: cacheKey)
            self.products.append(contentsOf: response.items)
            
            self.handleSuccess(response)
        }
        .store(in: &cancellables)
    }
    
    /// Retrieves detailed product information securely
    public func getProductDetails(productId: String) -> AnyPublisher<Product, Error> {
        guard !productId.isEmpty else {
            return Fail(error: ServiceError.invalidInput("Invalid product ID"))
                .eraseToAnyPublisher()
        }
        
        return marketplaceService.getProductDetails(productId: productId, forceRefresh: false)
            .receive(on: DispatchQueue.main)
            .handleEvents(
                receiveOutput: { [weak self] product in
                    self?.logOperation("product_details_viewed", context: ["product_id": productId])
                },
                receiveCompletion: { [weak self] completion in
                    if case .failure = completion {
                        self?.logOperation("product_details_error", context: ["product_id": productId])
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    /// Performs secure product search with debouncing
    public func searchProducts(query: String, category: ProductCategory? = nil) {
        searchQuery = query
        selectedCategory = category
        searchSubject.send(query)
        categorySubject.send(category)
    }
    
    // MARK: - Private Methods
    
    private func setupBindings() {
        // Combine search and category filters
        Publishers.CombineLatest(
            searchSubject.debounce(for: .seconds(Constants.SEARCH_DEBOUNCE_TIME), scheduler: DispatchQueue.main),
            categorySubject
        )
        .sink { [weak self] query, category in
            guard let self = self else { return }
            
            self.products.removeAll()
            self.currentPage = 1
            self.hasMorePages = true
            self.fetchProducts()
        }
        .store(in: &cancellables)
    }
    
    private func setupSearchDebounce() {
        $searchQuery
            .debounce(for: .seconds(Constants.SEARCH_DEBOUNCE_TIME), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .sink { [weak self] query in
                self?.searchSubject.send(query)
            }
            .store(in: &cancellables)
    }
    
    private func cacheProducts(_ products: [Product], forKey key: String) {
        productCache.setObject(products, forKey: key as NSString)
    }
    
    private func getCacheKey(page: Int, category: ProductCategory?) -> String {
        let categoryString = category?.rawValue ?? "all"
        return "products_\(categoryString)_\(page)"
    }
    
    private func logOperation(_ operation: String, context: [String: Any]? = nil) {
        var logContext = context ?? [:]
        logContext["view_model"] = "MarketplaceViewModel"
        logContext["timestamp"] = Date().timeIntervalSince1970
        
        os_log(
            "Operation: %{public}@ Context: %{public}@",
            log: logger,
            type: .info,
            operation,
            String(describing: logContext)
        )
    }
    
    // MARK: - Cleanup
    
    deinit {
        cleanup()
    }
}

// MARK: - Error Handling Extension

private extension MarketplaceViewModel {
    func handleSearchError(_ error: Error) {
        os_log(
            "Search error occurred: %{public}@",
            log: logger,
            type: .error,
            error.localizedDescription
        )
        
        errorMessage = "Failed to perform search. Please try again."
        state = .error(.networkError(error))
    }
}