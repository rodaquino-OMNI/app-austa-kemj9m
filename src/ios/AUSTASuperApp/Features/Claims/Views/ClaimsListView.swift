//
// ClaimsListView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SecurityKit // Version: 1.0.0

/// HIPAA-compliant SwiftUI view for displaying encrypted insurance claims
@available(iOS 14.0, *)
@MainActor
struct ClaimsListView: View {
    
    // MARK: - View Model
    
    @StateObject private var viewModel: ClaimsViewModel
    
    // MARK: - State Properties
    
    @State private var searchText = ""
    @State private var filterStatus: ClaimStatus?
    @State private var showingSubmitSheet = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showingSortOptions = false
    @State private var sortOrder: SortOrder = .descending
    
    // MARK: - Environment Properties
    
    @Environment(\.sizeCategory) private var sizeCategory
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Private Properties
    
    private let auditLogger = AuditLogger.shared
    
    // MARK: - Initialization
    
    init(viewModel: ClaimsViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    // MARK: - Body
    
    var body: some View {
        NavigationView {
            ZStack {
                VStack(spacing: 0) {
                    // Search and Filter Bar
                    searchAndFilterBar
                        .padding()
                        .background(Color(.systemBackground))
                        .shadow(radius: 1)
                    
                    // Claims List
                    if viewModel.claims.isEmpty && !isLoading {
                        emptyStateView
                    } else {
                        claimsList
                    }
                }
                
                // Loading Overlay
                if isLoading {
                    loadingOverlay
                }
                
                // Error Alert
                if let error = errorMessage {
                    errorAlert(message: error)
                }
            }
            .navigationTitle("Insurance Claims")
            .navigationBarItems(
                leading: filterButton,
                trailing: addClaimButton
            )
        }
        .onAppear {
            loadClaims()
            auditLogger.logEvent("claims_view_accessed")
        }
    }
    
    // MARK: - Subviews
    
    private var searchAndFilterBar: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                
                TextField("Search Claims", text: $searchText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .accessibility(label: Text("Search claims field"))
            }
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(ClaimStatus.allCases, id: \.self) { status in
                        filterChip(status)
                    }
                }
            }
        }
    }
    
    private var claimsList: some View {
        List {
            ForEach(filteredClaims, id: \.id) { claim in
                NavigationLink(destination: ClaimDetailView(claim: claim)) {
                    ClaimRowView(claim: claim)
                        .contentShape(Rectangle())
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .onAppear {
                    auditLogger.logEvent("claim_viewed", metadata: ["claim_id": claim.id])
                }
            }
        }
        .listStyle(InsetGroupedListStyle())
        .refreshable {
            await refreshClaims()
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 64))
                .foregroundColor(.secondary)
            
            Text("No Claims Found")
                .font(.headline)
            
            Text("Submit a new claim or adjust your filters")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
    
    private var loadingOverlay: some View {
        Color.black.opacity(0.3)
            .edgesIgnoringSafeArea(.all)
            .overlay(
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)
            )
    }
    
    private func errorAlert(message: String) -> some View {
        Alert(
            title: Text("Error"),
            message: Text(message),
            dismissButton: .default(Text("OK")) {
                errorMessage = nil
            }
        )
    }
    
    private var filterButton: some View {
        Button(action: { showingSortOptions.toggle() }) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .accessibility(label: Text("Sort and filter options"))
        }
        .actionSheet(isPresented: $showingSortOptions) {
            ActionSheet(
                title: Text("Sort Claims"),
                buttons: [
                    .default(Text("Date: Newest First")) {
                        sortOrder = .descending
                        auditLogger.logEvent("claims_sorted", metadata: ["order": "descending"])
                    },
                    .default(Text("Date: Oldest First")) {
                        sortOrder = .ascending
                        auditLogger.logEvent("claims_sorted", metadata: ["order": "ascending"])
                    },
                    .cancel()
                ]
            )
        }
    }
    
    private var addClaimButton: some View {
        Button(action: { showingSubmitSheet.toggle() }) {
            Image(systemName: "plus.circle")
                .accessibility(label: Text("Submit new claim"))
        }
        .sheet(isPresented: $showingSubmitSheet) {
            ClaimSubmissionView()
        }
    }
    
    private func filterChip(_ status: ClaimStatus) -> some View {
        Button(action: {
            withAnimation {
                filterStatus = filterStatus == status ? nil : status
                auditLogger.logEvent("claims_filtered", metadata: ["status": status.rawValue])
            }
        }) {
            Text(status.rawValue.capitalized)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(filterStatus == status ? Color.blue : Color(.systemGray5))
                )
                .foregroundColor(filterStatus == status ? .white : .primary)
        }
        .buttonStyle(PlainButtonStyle())
        .animation(.easeInOut, value: filterStatus)
    }
    
    // MARK: - Helper Methods
    
    private var filteredClaims: [Claim] {
        var claims = viewModel.claims
        
        // Apply search filter
        if !searchText.isEmpty {
            claims = claims.filter { claim in
                claim.id.localizedCaseInsensitiveContains(searchText) ||
                claim.type.rawValue.localizedCaseInsensitiveContains(searchText)
            }
        }
        
        // Apply status filter
        if let status = filterStatus {
            claims = claims.filter { $0.status == status }
        }
        
        // Apply sorting
        claims.sort { first, second in
            switch sortOrder {
            case .ascending:
                return first.submissionDate < second.submissionDate
            case .descending:
                return first.submissionDate > second.submissionDate
            }
        }
        
        return claims
    }
    
    private func loadClaims() {
        Task {
            isLoading = true
            do {
                try await viewModel.fetchClaims()
            } catch {
                errorMessage = error.localizedDescription
                auditLogger.logError(error)
            }
            isLoading = false
        }
    }
    
    private func refreshClaims() async {
        do {
            try await viewModel.fetchClaims()
            auditLogger.logEvent("claims_refreshed")
        } catch {
            errorMessage = error.localizedDescription
            auditLogger.logError(error)
        }
    }
}

// MARK: - Sort Order

private enum SortOrder {
    case ascending
    case descending
}

// MARK: - Preview Provider

#if DEBUG
struct ClaimsListView_Previews: PreviewProvider {
    static var previews: some View {
        ClaimsListView(viewModel: ClaimsViewModel(
            claimsService: ClaimsService(auditLogger: AuditLogger.shared),
            securityUtils: SecurityUtils(),
            performanceMonitor: PerformanceMonitor(),
            auditLogger: AuditLogger.shared
        ))
    }
}
#endif