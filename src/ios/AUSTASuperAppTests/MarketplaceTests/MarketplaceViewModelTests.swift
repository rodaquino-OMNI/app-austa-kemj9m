//
// MarketplaceViewModelTests.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import XCTest // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
@testable import AUSTASuperApp

/// Comprehensive test suite for MarketplaceViewModel with security and performance validation
@available(iOS 14.0, *)
final class MarketplaceViewModelTests: XCTestCase {
    
    // MARK: - Properties
    
    private var viewModel: MarketplaceViewModel!
    private var mockService: MockMarketplaceService!
    private var cancellables: Set<AnyCancellable>!
    private var performanceMetrics: XCTMeasureOptions!
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        mockService = MockMarketplaceService()
        viewModel = MarketplaceViewModel(marketplaceService: mockService)
        cancellables = Set<AnyCancellable>()
        
        // Configure performance metrics
        performanceMetrics = XCTMeasureOptions()
        performanceMetrics.iterationCount = 100
    }
    
    override func tearDown() {
        cancellables.removeAll()
        viewModel = nil
        mockService = nil
        super.tearDown()
    }
    
    // MARK: - Initial State Tests
    
    func testInitialState() {
        XCTAssertTrue(viewModel.products.isEmpty, "Products should be empty initially")
        XCTAssertNil(viewModel.selectedCategory, "Selected category should be nil initially")
        XCTAssertEqual(viewModel.searchQuery, "", "Search query should be empty initially")
        XCTAssertFalse(viewModel.isLoading, "Should not be loading initially")
        XCTAssertEqual(viewModel.state, .idle, "Initial state should be idle")
    }
    
    // MARK: - Product Fetching Tests
    
    func testFetchProducts() {
        let expectation = XCTestExpectation(description: "Fetch products")
        let testProducts = createTestProducts()
        mockService.mockProducts = testProducts
        
        // Measure performance
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
            viewModel.fetchProducts()
        }
        
        viewModel.$products
            .dropFirst()
            .sink { products in
                XCTAssertEqual(products.count, testProducts.count)
                XCTAssertFalse(self.viewModel.isLoading)
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testFetchProductsPerformance() {
        measure(options: performanceMetrics) {
            let expectation = XCTestExpectation(description: "Performance test")
            viewModel.fetchProducts()
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: 1.0)
        }
    }
    
    // MARK: - Search Tests
    
    func testProductSearch() {
        let expectation = XCTestExpectation(description: "Search products")
        let searchQuery = "test"
        
        viewModel.$products
            .dropFirst()
            .sink { products in
                XCTAssertTrue(products.allSatisfy { $0.name.contains(searchQuery) })
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        viewModel.searchProducts(query: searchQuery)
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testSearchDebounce() {
        let expectation = XCTestExpectation(description: "Search debounce")
        var searchCallCount = 0
        
        mockService.searchHandler = { _ in
            searchCallCount += 1
        }
        
        // Rapid consecutive searches
        viewModel.searchProducts(query: "t")
        viewModel.searchProducts(query: "te")
        viewModel.searchProducts(query: "tes")
        viewModel.searchProducts(query: "test")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertEqual(searchCallCount, 1, "Debounce should consolidate rapid searches")
            expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Category Filtering Tests
    
    func testCategoryFiltering() {
        let expectation = XCTestExpectation(description: "Filter by category")
        let category = ProductCategory.digitalTherapy
        
        viewModel.$products
            .dropFirst()
            .sink { products in
                XCTAssertTrue(products.allSatisfy { $0.category == category })
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        viewModel.searchProducts(query: "", category: category)
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Error Handling Tests
    
    func testErrorHandling() {
        let expectation = XCTestExpectation(description: "Handle error")
        let testError = ServiceError.networkError(NSError(domain: "", code: -1))
        mockService.mockError = testError
        
        viewModel.$state
            .dropFirst()
            .sink { state in
                if case .error(let error) = state {
                    XCTAssertEqual(error.localizedDescription, testError.localizedDescription)
                    expectation.fulfill()
                }
            }
            .store(in: &cancellables)
        
        viewModel.fetchProducts()
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Security Tests
    
    func testSecureDataHandling() {
        let sensitiveProduct = createTestProducts(count: 1)[0]
        let expectation = XCTestExpectation(description: "Secure data handling")
        
        mockService.securityValidation = { product in
            // Verify sensitive data handling
            XCTAssertTrue(Thread.isMainThread, "Must handle sensitive data on main thread")
            XCTAssertNotNil(product.id, "Product must have valid ID")
            expectation.fulfill()
        }
        
        viewModel.getProductDetails(productId: sensitiveProduct.id)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Helper Methods
    
    private func createTestProducts(count: Int = 5) -> [Product] {
        return (0..<count).map { index in
            try! Product(
                id: "test_\(index)",
                name: "Test Product \(index)",
                description: "Test Description \(index)",
                category: .digitalTherapy,
                price: Decimal(index + 1),
                providerId: "provider_\(index)",
                images: ["image_\(index)"],
                details: ProductDetails(
                    duration: TimeInterval(3600),
                    features: ["Feature 1", "Feature 2"],
                    requirements: ["Requirement 1"],
                    availability: .available
                )
            )
        }
    }
}

// MARK: - Mock Service

private final class MockMarketplaceService: MarketplaceServiceProtocol {
    var mockProducts: [Product] = []
    var mockError: Error?
    var searchHandler: ((String) -> Void)?
    var securityValidation: ((Product) -> Void)?
    
    func getProducts(category: ProductCategory?, page: Int, pageSize: Int) -> AnyPublisher<PaginatedResponse<[Product]>, Error> {
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        let filteredProducts = category != nil ?
            mockProducts.filter { $0.category == category } :
            mockProducts
        
        let response = PaginatedResponse(
            items: filteredProducts,
            totalItems: filteredProducts.count,
            currentPage: page,
            totalPages: 1
        )
        
        return Just(response)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
    
    func getProductDetails(productId: String, forceRefresh: Bool) -> AnyPublisher<Product, Error> {
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        guard let product = mockProducts.first(where: { $0.id == productId }) else {
            return Fail(error: ServiceError.notFound).eraseToAnyPublisher()
        }
        
        securityValidation?(product)
        
        return Just(product)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
    
    func purchaseProduct(productId: String, options: PurchaseOptions) -> AnyPublisher<OrderConfirmation, Error> {
        if let error = mockError {
            return Fail(error: error).eraseToAnyPublisher()
        }
        
        let confirmation = OrderConfirmation(
            orderId: "order_\(productId)",
            status: "confirmed",
            timestamp: Date(),
            transactionId: "tx_\(UUID().uuidString)"
        )
        
        return Just(confirmation)
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
}