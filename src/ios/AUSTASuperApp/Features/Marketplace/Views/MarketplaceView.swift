//
// MarketplaceView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+

// MARK: - Constants

private enum Constants {
    static let GRID_SPACING: CGFloat = 16.0
    static let CARD_ASPECT_RATIO: CGFloat = 0.75
    static let MIN_COLUMN_WIDTH: CGFloat = 160.0
    static let SEARCH_DEBOUNCE_TIME: TimeInterval = 0.5
    static let MAX_CACHE_SIZE = 100
    static let SECURITY_LOG_RETENTION = 30
    static let ANIMATION_DURATION: TimeInterval = 0.3
}

/// HIPAA-compliant marketplace view implementing secure product grid and search functionality
@available(iOS 14.0, *)
@MainActor
public struct MarketplaceView: View {
    
    // MARK: - View Model
    
    @StateObject private var viewModel: MarketplaceViewModel
    
    // MARK: - State Properties
    
    @State private var selectedProduct: Product?
    @State private var showingFilters = false
    @State private var errorAlert: ErrorAlert?
    @State private var gridColumns = [GridItem]()
    
    // MARK: - Environment Properties
    
    @Environment(\.horizontalSizeClass) var sizeClass
    @Environment(\.sizeCategory) var sizeCategory
    
    // MARK: - Private Properties
    
    private let imageCache: NSCache<NSString, UIImage>
    
    // MARK: - Initialization
    
    public init(viewModel: MarketplaceViewModel) {
        self._viewModel = StateObject(wrappedValue: viewModel)
        
        // Initialize image cache with size limits
        self.imageCache = NSCache<NSString, UIImage>()
        self.imageCache.countLimit = Constants.MAX_CACHE_SIZE
    }
    
    // MARK: - Body
    
    public var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                searchBar
                    .padding()
                
                if viewModel.isLoading && viewModel.products.isEmpty {
                    loadingView
                } else if viewModel.products.isEmpty {
                    emptyStateView
                } else {
                    productGrid
                }
            }
            .navigationTitle("Marketplace")
            .navigationBarItems(trailing: filterButton)
            .sheet(isPresented: $showingFilters) {
                filterView
            }
            .alert(item: $errorAlert) { error in
                Alert(
                    title: Text("Error"),
                    message: Text(error.message),
                    dismissButton: .default(Text("OK"))
                )
            }
            .onAppear {
                setupGridColumns()
                viewModel.fetchProducts()
            }
            .onChange(of: sizeClass) { _ in
                setupGridColumns()
            }
        }
    }
    
    // MARK: - Search Bar
    
    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            
            TextField("Search products", text: $viewModel.searchQuery)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .accessibility(label: Text("Search products"))
            
            if !viewModel.searchQuery.isEmpty {
                Button(action: {
                    viewModel.searchQuery = ""
                    viewModel.logUserAction("clear_search")
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .accessibility(label: Text("Clear search"))
            }
        }
    }
    
    // MARK: - Product Grid
    
    private var productGrid: some View {
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: Constants.GRID_SPACING) {
                ForEach(viewModel.products) { product in
                    NavigationLink(
                        destination: ProductDetailView(
                            productId: product.id,
                            viewModel: viewModel
                        )
                    ) {
                        productCard(product)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                
                if viewModel.hasMorePages {
                    loadMoreTrigger
                }
            }
            .padding()
        }
        .refreshable {
            await refreshProducts()
        }
    }
    
    // MARK: - Product Card
    
    private func productCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SecureAsyncImage(
                url: URL(string: product.images.first ?? ""),
                cache: imageCache,
                placeholder: {
                    Rectangle()
                        .fill(Color.gray.opacity(0.2))
                        .aspectRatio(1, contentMode: .fit)
                },
                image: { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                }
            )
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.headline)
                    .lineLimit(2)
                
                Text(product.category.rawValue.capitalized)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                Text(formatPrice(product.price))
                    .font(.subheadline)
                    .fontWeight(.bold)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 2)
        .accessibility(label: Text("\(product.name), \(formatPrice(product.price))"))
    }
    
    // MARK: - Supporting Views
    
    private var loadingView: some View {
        VStack {
            ProgressView()
            Text("Loading products...")
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "cart")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text("No products found")
                .font(.headline)
            
            if !viewModel.searchQuery.isEmpty {
                Text("Try adjusting your search")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var loadMoreTrigger: some View {
        HStack {
            Spacer()
            ProgressView()
            Spacer()
        }
        .onAppear {
            viewModel.fetchProducts()
        }
    }
    
    private var filterButton: some View {
        Button(action: {
            showingFilters = true
            viewModel.logUserAction("show_filters")
        }) {
            Image(systemName: "line.horizontal.3.decrease.circle")
                .accessibility(label: Text("Filter products"))
        }
    }
    
    private var filterView: some View {
        NavigationView {
            List {
                ForEach(ProductCategory.allCases, id: \.self) { category in
                    Button(action: {
                        viewModel.selectedCategory = category
                        showingFilters = false
                        viewModel.logUserAction("apply_filter", context: ["category": category.rawValue])
                    }) {
                        HStack {
                            Text(category.rawValue.capitalized)
                            Spacer()
                            if viewModel.selectedCategory == category {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.accentColor)
                            }
                        }
                    }
                }
                
                Button(action: {
                    viewModel.selectedCategory = nil
                    showingFilters = false
                    viewModel.logUserAction("clear_filters")
                }) {
                    Text("Clear Filters")
                        .foregroundColor(.red)
                }
            }
            .navigationTitle("Filter Products")
            .navigationBarItems(trailing: Button("Done") {
                showingFilters = false
            })
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupGridColumns() {
        let isCompact = sizeClass == .compact
        let spacing = Constants.GRID_SPACING
        let minWidth = isCompact ? Constants.MIN_COLUMN_WIDTH : Constants.MIN_COLUMN_WIDTH * 1.5
        
        gridColumns = [
            GridItem(.adaptive(minimum: minWidth), spacing: spacing)
        ]
    }
    
    private func formatPrice(_ price: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 2
        return formatter.string(from: price as NSDecimalNumber) ?? "$0.00"
    }
    
    private func refreshProducts() async {
        viewModel.products.removeAll()
        viewModel.currentPage = 1
        viewModel.hasMorePages = true
        viewModel.fetchProducts()
    }
}

// MARK: - Error Alert

private struct ErrorAlert: Identifiable {
    let id = UUID()
    let message: String
}

// MARK: - Preview Provider

#if DEBUG
struct MarketplaceView_Previews: PreviewProvider {
    static var previews: some View {
        MarketplaceView(viewModel: MarketplaceViewModel(
            marketplaceService: PreviewMarketplaceService()
        ))
    }
}
#endif