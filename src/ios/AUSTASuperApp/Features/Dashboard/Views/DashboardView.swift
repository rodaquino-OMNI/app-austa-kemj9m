//
// DashboardView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// Main dashboard view implementing HIPAA-compliant health metrics display with enhanced accessibility
@available(iOS 14.0, *)
@MainActor
public struct DashboardView: View {
    
    // MARK: - Properties
    
    @StateObject private var viewModel: DashboardViewModel
    @State private var isRefreshing: Bool = false
    @State private var retryCount: Int = 0
    @State private var lastRefreshTime: Date = Date()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    
    // MARK: - Constants
    
    private let SECTION_SPACING: CGFloat = 20.0
    private let REFRESH_CONTROL_THRESHOLD: CGFloat = 50.0
    private let OFFLINE_CACHE_DURATION: TimeInterval = 3600
    
    // MARK: - Initialization
    
    public init(viewModel: DashboardViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    // MARK: - Body
    
    public var body: some View {
        ScrollView {
            pullToRefresh
            
            VStack(spacing: SECTION_SPACING) {
                // Offline mode indicator
                if NetworkMonitor.shared.connectionType.value == .disconnected {
                    offlineModeIndicator
                }
                
                // Health metrics section
                healthMetricsSection
                
                // Quick actions section
                quickActionsSection
                
                // Upcoming appointments section
                upcomingAppointmentsSection
            }
            .padding()
        }
        .background(Color.semanticBackground)
        .onChange(of: scenePhase) { newPhase in
            handleScenePhaseChange(newPhase)
        }
        .onAppear {
            Task {
                await viewModel.refreshDashboard()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Dashboard")
    }
    
    // MARK: - Private Views
    
    private var pullToRefresh: some View {
        GeometryReader { geometry in
            if geometry.frame(in: .global).minY > REFRESH_CONTROL_THRESHOLD && !isRefreshing {
                Spacer()
                    .onAppear {
                        handleRefresh()
                    }
            }
        }
    }
    
    private var offlineModeIndicator: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .foregroundColor(.accentError)
            Text("Offline Mode - Using Cached Data")
                .font(.bodyMedium)
                .foregroundColor(.accentError)
        }
        .padding()
        .background(Color.accentError.opacity(0.1))
        .cornerRadius(8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Offline mode active")
        .accessibilityAddTraits(.isAlert)
    }
    
    private var healthMetricsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Health Metrics")
                .font(.titleMedium)
                .foregroundColor(.highContrastText)
                .accessibilityAddTraits(.isHeader)
            
            if viewModel.isLoading {
                loadingView
            } else if let error = viewModel.error {
                errorView(error)
            } else {
                HealthMetricsView(viewModel: viewModel)
                    .cardStyle()
                    .hipaaCompliant()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Health metrics section")
    }
    
    private var quickActionsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Quick Actions")
                .font(.titleMedium)
                .foregroundColor(.highContrastText)
                .accessibilityAddTraits(.isHeader)
            
            AdaptiveStack(axis: .horizontal, spacing: 12) {
                quickActionButton(
                    icon: "video.fill",
                    title: "Virtual Care",
                    action: { /* Implementation */ }
                )
                
                quickActionButton(
                    icon: "doc.text.fill",
                    title: "Health Records",
                    action: { /* Implementation */ }
                )
                
                quickActionButton(
                    icon: "dollarsign.circle.fill",
                    title: "Insurance",
                    action: { /* Implementation */ }
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Quick actions section")
    }
    
    private var upcomingAppointmentsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Upcoming Appointments")
                .font(.titleMedium)
                .foregroundColor(.highContrastText)
                .accessibilityAddTraits(.isHeader)
            
            // Placeholder for appointments list
            Text("No upcoming appointments")
                .font(.bodyMedium)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding()
                .cardStyle()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Upcoming appointments section")
    }
    
    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading health data...")
                .font(.bodyMedium)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .cardStyle()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loading health data")
        .accessibilityAddTraits(.updatesFrequently)
    }
    
    private func errorView(_ error: Error) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 32))
                .foregroundColor(.accentError)
            
            Text(error.localizedDescription)
                .font(.bodyMedium)
                .foregroundColor(.accentError)
                .multilineTextAlignment(.center)
            
            Button("Retry") {
                handleRefresh()
            }
            .primaryButtonStyle()
        }
        .padding()
        .cardStyle()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error loading health data")
        .accessibilityAddTraits(.isAlert)
    }
    
    private func quickActionButton(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(.brandPrimary)
                Text(title)
                    .font(.bodyMedium)
                    .foregroundColor(.highContrastText)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .cardStyle()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
    }
    
    // MARK: - Private Methods
    
    private func handleRefresh() {
        guard !isRefreshing else { return }
        
        isRefreshing = true
        
        Task {
            await viewModel.refreshDashboard()
            isRefreshing = false
            lastRefreshTime = Date()
        }
    }
    
    private func handleScenePhaseChange(_ newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            if Date().timeIntervalSince(lastRefreshTime) > REFRESH_INTERVAL {
                Task {
                    await viewModel.refreshDashboard()
                }
            }
        case .background:
            // Perform cleanup if needed
            break
        default:
            break
        }
    }
}

// MARK: - Preview Provider

#if DEBUG
struct DashboardView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            DashboardView(viewModel: DashboardViewModel(
                healthKitService: HealthKitService(),
                healthRecordsService: HealthRecordsService()
            ))
            .previewDisplayName("Light Mode")
            
            DashboardView(viewModel: DashboardViewModel(
                healthKitService: HealthKitService(),
                healthRecordsService: HealthRecordsService()
            ))
            .preferredColorScheme(.dark)
            .previewDisplayName("Dark Mode")
        }
    }
}
#endif