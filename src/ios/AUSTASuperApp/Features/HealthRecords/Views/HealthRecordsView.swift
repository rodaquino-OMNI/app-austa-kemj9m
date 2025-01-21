//
// HealthRecordsView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+
import SecurityKit // Version: 1.0.0
import AuditLogger // Version: 2.1.0

/// HIPAA-compliant view for secure health records management
@available(iOS 14.0, *)
struct HealthRecordsView: View {
    
    // MARK: - Properties
    
    @StateObject private var viewModel = HealthRecordsViewModel()
    @State private var searchText = ""
    @State private var selectedRecord: HealthRecord?
    @State private var showingDocumentViewer = false
    @State private var showingFilterSheet = false
    @State private var showingErrorAlert = false
    @State private var errorMessage = ""
    @State private var isRefreshing = false
    
    // Security and network states
    @State private var networkStatus: NetworkStatus = .connected
    @State private var isOfflineMode = false
    @State private var securityContext: SecurityContext?
    
    // MARK: - Body
    
    var body: some View {
        NavigationView {
            ZStack {
                // Main content
                VStack(spacing: 0) {
                    // Search and filter bar
                    searchFilterBar
                    
                    // Records list
                    recordsList
                    
                    // Offline mode indicator
                    if isOfflineMode {
                        offlineModeIndicator
                    }
                }
                
                // Loading overlay
                if viewModel.isLoading {
                    loadingOverlay
                }
            }
            .navigationTitle("Health Records")
            .navigationBarItems(trailing: navigationBarButtons)
            .alert(isPresented: $showingErrorAlert) {
                Alert(
                    title: Text("Error"),
                    message: Text(errorMessage),
                    dismissButton: .default(Text("OK"))
                )
            }
            .sheet(isPresented: $showingDocumentViewer) {
                if let record = selectedRecord {
                    SecureDocumentViewer(record: record)
                        .environmentObject(viewModel)
                }
            }
        }
        .onAppear {
            setupView()
        }
    }
    
    // MARK: - Subviews
    
    private var searchFilterBar: some View {
        VStack(spacing: 0) {
            // Search bar
            SearchBar(text: $searchText, placeholder: "Search records...")
                .padding()
                .onChange(of: searchText) { _ in
                    filterRecords()
                }
            
            // Filter options
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(HealthRecordsFilter.allCases, id: \.self) { filter in
                        FilterChip(
                            title: filter.displayName,
                            isSelected: viewModel.currentFilter == filter
                        ) {
                            Task {
                                await viewModel.updateFilter(filter)
                            }
                        }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.vertical, 8)
            
            Divider()
        }
        .background(Color(.systemBackground))
    }
    
    private var recordsList: some View {
        List {
            ForEach(viewModel.healthRecords) { record in
                HealthRecordCell(record: record)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        handleRecordSelection(record)
                    }
            }
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
        .listStyle(PlainListStyle())
        .refreshable {
            await refreshRecords()
        }
    }
    
    private var offlineModeIndicator: some View {
        VStack {
            HStack {
                Image(systemName: "wifi.slash")
                Text("Offline Mode")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(8)
            .background(Color(.systemGray6))
            .cornerRadius(8)
            
            if let lastSync = viewModel.lastSyncDate {
                Text("Last synced: \(lastSync, formatter: dateFormatter)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
    }
    
    private var loadingOverlay: some View {
        Color.black.opacity(0.3)
            .edgesIgnoringSafeArea(.all)
            .overlay(
                ProgressView()
                    .scaleEffect(1.5)
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
            )
    }
    
    private var navigationBarButtons: some View {
        HStack {
            Button(action: {
                showingFilterSheet = true
            }) {
                Image(systemName: "line.3.horizontal.decrease.circle")
            }
            
            Button(action: {
                Task {
                    await refreshRecords()
                }
            }) {
                Image(systemName: "arrow.clockwise")
            }
            .disabled(isRefreshing)
        }
    }
    
    // MARK: - Private Methods
    
    private func setupView() {
        // Initialize security context
        securityContext = SecurityContext()
        
        // Setup network monitoring
        setupNetworkMonitoring()
        
        // Initial data fetch
        Task {
            await refreshRecords()
        }
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.connectionType
            .receive(on: DispatchQueue.main)
            .sink { status in
                networkStatus = status
                isOfflineMode = status == .disconnected
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func refreshRecords() async {
        isRefreshing = true
        defer { isRefreshing = false }
        
        do {
            try await viewModel.loadHealthRecords(forceRefresh: true)
        } catch {
            handleError(error)
        }
    }
    
    private func filterRecords() {
        Task {
            await viewModel.filterRecords(searchText: searchText)
        }
    }
    
    private func handleRecordSelection(_ record: HealthRecord) {
        do {
            // Validate security context
            try viewModel.securityContext.validateAccess(for: record)
            
            // Log access attempt
            viewModel.auditLog("record_accessed", metadata: [
                "record_id": record.id,
                "access_type": "view"
            ])
            
            selectedRecord = record
            showingDocumentViewer = true
        } catch {
            handleError(error)
        }
    }
    
    private func handleError(_ error: Error) {
        errorMessage = error.localizedDescription
        showingErrorAlert = true
    }
    
    // MARK: - Formatters
    
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

// MARK: - Supporting Views

private struct SearchBar: View {
    @Binding var text: String
    let placeholder: String
    
    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            
            TextField(placeholder, text: $text)
                .textFieldStyle(PlainTextFieldStyle())
            
            if !text.isEmpty {
                Button(action: { text = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(8)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

private struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.accentColor : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(16)
        }
    }
}

private struct HealthRecordCell: View {
    let record: HealthRecord
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(record.type.rawValue)
                    .font(.headline)
                Spacer()
                Text(record.date, style: .date)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            Text("Provider: \(record.providerId)")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            if !record.metadata.securityLabels.isEmpty {
                HStack {
                    ForEach(record.metadata.securityLabels, id: \.self) { label in
                        Text(label)
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.systemGray6))
                            .cornerRadius(4)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}

private struct SecureDocumentViewer: View {
    let record: HealthRecord
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject var viewModel: HealthRecordsViewModel
    
    var body: some View {
        NavigationView {
            ScrollView {
                // Document content would go here
                Text("Secure Document Viewer")
            }
            .navigationTitle("Document Viewer")
            .navigationBarItems(trailing: Button("Done") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}

// MARK: - Preview Provider

struct HealthRecordsView_Previews: PreviewProvider {
    static var previews: some View {
        if #available(iOS 14.0, *) {
            HealthRecordsView()
        }
    }
}