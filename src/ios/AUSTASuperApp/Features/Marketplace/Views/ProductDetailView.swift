//
// ProductDetailView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// A secure and accessible view for displaying detailed product information
/// with HIPAA compliance and performance optimizations
@available(iOS 14.0, *)
@MainActor
public struct ProductDetailView: View {
    
    // MARK: - View Model
    
    @StateObject private var viewModel: MarketplaceViewModel
    
    // MARK: - State Properties
    
    @State private var isLoading = true
    @State private var showError = false
    @State private var errorMessage: String?
    @State private var showPurchaseConfirmation = false
    @State private var imageLoadingStates: [String: Bool] = [:]
    @State private var selectedImageIndex = 0
    @State private var isImageCarouselExpanded = false
    
    // MARK: - Private Properties
    
    private let productId: String
    private let securityProvider: SecurityProvider
    private let analyticsTracker: AnalyticsTracking
    private let imageCache = NSCache<NSString, UIImage>()
    
    // MARK: - Constants
    
    private enum Constants {
        static let imageAspectRatio: CGFloat = 16/9
        static let maxImageSize: CGFloat = 800
        static let cornerRadius: CGFloat = 12
        static let spacing: CGFloat = 16
        static let animationDuration: Double = 0.3
    }
    
    // MARK: - Initialization
    
    public init(productId: String,
               viewModel: MarketplaceViewModel,
               securityProvider: SecurityProvider,
               analyticsTracker: AnalyticsTracking) {
        self.productId = productId
        self._viewModel = StateObject(wrappedValue: viewModel)
        self.securityProvider = securityProvider
        self.analyticsTracker = analyticsTracker
        
        // Configure image cache
        imageCache.countLimit = 10
        imageCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }
    
    // MARK: - Body
    
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Constants.spacing) {
                if isLoading {
                    loadingView
                } else {
                    productContent
                }
            }
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
        .alert(isPresented: $showError) {
            Alert(
                title: Text("Error"),
                message: Text(errorMessage ?? "An error occurred"),
                dismissButton: .default(Text("OK"))
            )
        }
        .sheet(isPresented: $showPurchaseConfirmation) {
            purchaseConfirmationView
        }
        .onAppear {
            loadProductDetails()
            analyticsTracker.trackScreenView("product_detail", metadata: ["product_id": productId])
        }
        .onDisappear {
            cleanup()
        }
    }
    
    // MARK: - Private Views
    
    @ViewBuilder
    private var loadingView: some View {
        VStack(spacing: Constants.spacing) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle())
            Text("Loading product details...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibility(label: Text("Loading product details"))
    }
    
    @ViewBuilder
    private var productContent: some View {
        VStack(alignment: .leading, spacing: Constants.spacing) {
            secureImageCarousel
            productInformation
            purchaseSection
        }
    }
    
    @ViewBuilder
    private var secureImageCarousel: some View {
        if let product = viewModel.currentProduct {
            TabView(selection: $selectedImageIndex) {
                ForEach(Array(product.images.enumerated()), id: \.element) { index, imageUrl in
                    SecureAsyncImage(
                        url: URL(string: imageUrl),
                        cache: imageCache,
                        placeholder: {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .aspectRatio(Constants.imageAspectRatio, contentMode: .fit)
                        },
                        image: { image in
                            image
                                .resizable()
                                .aspectRatio(Constants.imageAspectRatio, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: Constants.cornerRadius))
                        }
                    )
                    .tag(index)
                    .accessibility(label: Text("Product image \(index + 1) of \(product.images.count)"))
                }
            }
            .tabViewStyle(PageTabViewStyle())
            .frame(height: 250)
        }
    }
    
    @ViewBuilder
    private var productInformation: some View {
        if let product = viewModel.currentProduct {
            VStack(alignment: .leading, spacing: Constants.spacing) {
                Text(product.name)
                    .font(.title)
                    .fontWeight(.bold)
                    .accessibility(addTraits: .isHeader)
                
                Text(product.description)
                    .font(.body)
                    .foregroundColor(.secondary)
                
                productFeatures(product)
                
                if let requirements = product.details.requirements {
                    requirementsSection(requirements)
                }
                
                priceSection(product)
            }
        }
    }
    
    @ViewBuilder
    private func productFeatures(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: Constants.spacing / 2) {
            Text("Features")
                .font(.headline)
                .accessibility(addTraits: .isHeader)
            
            ForEach(product.details.features, id: \.self) { feature in
                HStack(spacing: Constants.spacing / 2) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text(feature)
                        .font(.subheadline)
                }
                .accessibility(label: Text("Feature: \(feature)"))
            }
        }
    }
    
    @ViewBuilder
    private func requirementsSection(_ requirements: [String]) -> some View {
        VStack(alignment: .leading, spacing: Constants.spacing / 2) {
            Text("Requirements")
                .font(.headline)
                .accessibility(addTraits: .isHeader)
            
            ForEach(requirements, id: \.self) { requirement in
                HStack(spacing: Constants.spacing / 2) {
                    Image(systemName: "info.circle.fill")
                        .foregroundColor(.blue)
                    Text(requirement)
                        .font(.subheadline)
                }
                .accessibility(label: Text("Requirement: \(requirement)"))
            }
        }
    }
    
    @ViewBuilder
    private func priceSection(_ product: Product) -> some View {
        HStack {
            Text("Price")
                .font(.headline)
            Spacer()
            Text(formatPrice(product.price))
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.primary)
        }
        .accessibility(label: Text("Price: \(formatPrice(product.price))"))
    }
    
    @ViewBuilder
    private var purchaseSection: some View {
        VStack(spacing: Constants.spacing) {
            Button(action: handlePurchase) {
                Text("Purchase")
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .cornerRadius(Constants.cornerRadius)
            }
            .disabled(isLoading)
            .accessibility(label: Text("Purchase product"))
            
            if let product = viewModel.currentProduct {
                Text(availabilityText(for: product.details.availability))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }
    
    @ViewBuilder
    private var purchaseConfirmationView: some View {
        NavigationView {
            VStack(spacing: Constants.spacing) {
                // Purchase confirmation implementation
                Text("Confirm Purchase")
                    .font(.headline)
            }
            .navigationBarItems(trailing: Button("Close") {
                showPurchaseConfirmation = false
            })
        }
    }
    
    // MARK: - Private Methods
    
    private func loadProductDetails() {
        Task {
            do {
                isLoading = true
                try await viewModel.getProductDetails(productId: productId)
                    .sink { completion in
                        if case .failure(let error) = completion {
                            handleError(error)
                        }
                    } receiveValue: { _ in
                        isLoading = false
                    }
                    .store(in: &viewModel.cancellables)
            } catch {
                handleError(error)
            }
        }
    }
    
    private func handlePurchase() {
        guard let product = viewModel.currentProduct else { return }
        
        analyticsTracker.trackEvent(
            "product_purchase_initiated",
            metadata: ["product_id": product.id]
        )
        
        showPurchaseConfirmation = true
    }
    
    private func handleError(_ error: Error) {
        isLoading = false
        errorMessage = error.localizedDescription
        showError = true
        
        analyticsTracker.trackError(
            error,
            metadata: ["product_id": productId]
        )
    }
    
    private func formatPrice(_ price: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 2
        return formatter.string(from: price as NSDecimalNumber) ?? "$0.00"
    }
    
    private func availabilityText(for availability: ProductAvailability) -> String {
        switch availability {
        case .available:
            return "In Stock"
        case .comingSoon:
            return "Coming Soon"
        case .limitedSpots:
            return "Limited Availability"
        case .soldOut:
            return "Sold Out"
        }
    }
    
    private func cleanup() {
        viewModel.cleanup()
        imageCache.removeAllObjects()
    }
}

// MARK: - Preview Provider

#if DEBUG
struct ProductDetailView_Previews: PreviewProvider {
    static var previews: some View {
        ProductDetailView(
            productId: "preview_product",
            viewModel: MarketplaceViewModel(marketplaceService: PreviewMarketplaceService()),
            securityProvider: PreviewSecurityProvider(),
            analyticsTracker: PreviewAnalyticsTracker()
        )
    }
}
#endif