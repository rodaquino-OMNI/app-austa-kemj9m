//
// HealthMetricsView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// SwiftUI view component for displaying HIPAA-compliant health metrics with accessibility support
@available(iOS 14.0, *)
@MainActor
public struct HealthMetricsView: View {
    
    // MARK: - Properties
    
    @StateObject private var viewModel: DashboardViewModel
    @State private var selectedMetric: HealthMetric?
    @State private var showingDetail: Bool = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.sizeCategory) private var sizeCategory
    
    // MARK: - Constants
    
    private let gridColumns = Array(repeating: GridItem(.flexible(), spacing: 16), count: METRIC_GRID_COLUMNS)
    private let cardHeight: CGFloat = METRIC_CARD_HEIGHT
    private let minimumTapSize: CGFloat = MINIMUM_TOUCH_TARGET_SIZE
    
    // MARK: - Initialization
    
    public init(viewModel: DashboardViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    // MARK: - Body
    
    public var body: some View {
        GeometryReader { geometry in
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: 16) {
                    if viewModel.isLoading {
                        loadingView
                    } else if let error = viewModel.error {
                        errorView(error)
                    } else {
                        metricsGrid
                    }
                }
                .padding()
            }
            .refreshable {
                await viewModel.refreshDashboard()
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Health Metrics Dashboard")
            .sheet(isPresented: $showingDetail) {
                if let metric = selectedMetric {
                    metricDetailSheet(metric)
                }
            }
        }
    }
    
    // MARK: - Private Views
    
    private var metricsGrid: some View {
        ForEach(viewModel.healthMetrics, id: \.id) { metric in
            metricCard(metric)
                .onTapGesture {
                    withAnimation(.easeInOut(duration: ANIMATION_DURATION)) {
                        selectedMetric = metric
                        showingDetail = true
                    }
                }
        }
    }
    
    private var loadingView: some View {
        ForEach(0..<4) { _ in
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.gray.opacity(0.2))
                .frame(height: cardHeight)
                .redacted(reason: .placeholder)
                .shimmer()
        }
    }
    
    private func errorView(_ error: Error) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.red)
            
            Text(error.localizedDescription)
                .font(.headline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            Button("Retry") {
                Task {
                    await viewModel.refreshDashboard()
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error loading health metrics")
        .accessibilityAddTraits(.isButton)
    }
    
    private func metricCard(_ metric: HealthMetric) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                metricIcon(for: metric.metricType)
                    .foregroundColor(metric.isNormal ? .green : .red)
                
                Text(metric.metricType.rawValue.capitalized)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "%.1f", metric.value))
                    .font(.system(.title, design: .rounded))
                    .fontWeight(.bold)
                    .foregroundColor(metric.isNormal ? .primary : .red)
                
                Text(metric.unit)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            if let range = metric.referenceRange {
                Text("Normal range: \(formatRange(range))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .frame(height: cardHeight)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(colorScheme == .dark ? Color(.systemGray6) : .white)
                .shadow(radius: 2)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(metric.metricType.rawValue.capitalized): \(String(format: "%.1f", metric.value)) \(metric.unit)")
        .accessibilityValue(metric.isNormal ? "Normal" : "Abnormal")
        .accessibilityHint("Double tap to view details")
        .accessibilityAddTraits(.isButton)
    }
    
    private func metricDetailSheet(_ metric: HealthMetric) -> some View {
        NavigationView {
            VStack(spacing: 20) {
                metricDetailHeader(metric)
                metricDetailContent(metric)
                Spacer()
            }
            .padding()
            .navigationTitle(metric.metricType.rawValue.capitalized)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        showingDetail = false
                    }
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func metricIcon(for type: HealthMetricType) -> some View {
        let iconName: String
        switch type {
        case .HEART_RATE:
            iconName = "heart.fill"
        case .BLOOD_PRESSURE:
            iconName = "waveform.path.ecg"
        case .BLOOD_GLUCOSE:
            iconName = "drop.fill"
        case .TEMPERATURE:
            iconName = "thermometer"
        case .OXYGEN_SATURATION:
            iconName = "lungs.fill"
        case .STEPS:
            iconName = "figure.walk"
        default:
            iconName = "staroflife.fill"
        }
        
        return Image(systemName: iconName)
            .font(.title2)
            .frame(width: minimumTapSize, height: minimumTapSize)
            .accessibilityHidden(true)
    }
    
    private func formatRange(_ range: ClosedRange<Double>) -> String {
        return "\(String(format: "%.1f", range.lowerBound)) - \(String(format: "%.1f", range.upperBound))"
    }
}

// MARK: - Shimmer Effect

private struct ShimmerEffect: ViewModifier {
    @State private var phase: CGFloat = 0
    
    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { geometry in
                    LinearGradient(
                        gradient: Gradient(colors: [
                            .clear,
                            .white.opacity(0.5),
                            .clear
                        ]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geometry.size.width * 2)
                    .offset(x: -geometry.size.width + (geometry.size.width * 2 * phase))
                    .animation(
                        Animation.linear(duration: 1.5)
                            .repeatForever(autoreverses: false),
                        value: phase
                    )
                }
            )
            .onAppear {
                phase = 1
            }
            .clipped()
    }
}

extension View {
    func shimmer() -> some View {
        modifier(ShimmerEffect())
    }
}