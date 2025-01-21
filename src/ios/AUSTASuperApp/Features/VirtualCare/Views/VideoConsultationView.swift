//
// VideoConsultationView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import AVFoundation // Version: iOS 14.0+

/// HIPAA-compliant video consultation interface with secure streaming and encrypted communication
@available(iOS 14.0, *)
@MainActor
struct VideoConsultationView: View {
    // MARK: - Properties
    
    @StateObject private var viewModel: VideoConsultationViewModel
    @State private var showingChat = false
    @State private var showingControls = true
    @State private var isFullScreen = false
    @State private var showingQualityWarning = false
    @State private var showingSecurityAlert = false
    @Environment(\.presentationMode) private var presentationMode
    @Environment(\.accessibilityEnabled) private var accessibilityEnabled
    
    // MARK: - Initialization
    
    init(viewModel: VideoConsultationViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    // MARK: - Body
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Video Streams Container
                videoStreamsView(size: geometry.size)
                    .edgesIgnoringSafeArea(.all)
                
                // Controls Overlay
                if showingControls {
                    controlsOverlay
                        .transition(.opacity)
                }
                
                // Chat Sidebar
                if showingChat {
                    chatSidebar
                        .transition(.move(edge: .trailing))
                }
                
                // Quality Warning
                if showingQualityWarning {
                    qualityWarningBanner
                }
                
                // Security Status
                securityStatusIndicator
            }
        }
        .alert(isPresented: $showingSecurityAlert) {
            Alert(
                title: Text("Security Alert"),
                message: Text("Encryption requirements not met. Please check your connection."),
                primaryButton: .default(Text("Retry")),
                secondaryButton: .destructive(Text("End Call"), action: endCall)
            )
        }
        .onAppear {
            setupConsultation()
        }
        .onDisappear {
            cleanupConsultation()
        }
    }
    
    // MARK: - UI Components
    
    private var controlsOverlay: some View {
        VStack {
            // Top Bar
            consultationHeader
            
            Spacer()
            
            // Bottom Controls
            controlsBar
                .padding(.bottom, 30)
        }
        .background(LinearGradient(
            colors: [.black.opacity(0.4), .clear, .black.opacity(0.4)],
            startPoint: .top,
            endPoint: .bottom
        ))
    }
    
    private var consultationHeader: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(viewModel.consultation.provider.name)
                    .font(.headline)
                    .foregroundColor(.white)
                
                HStack {
                    connectionQualityIndicator
                    Text(viewModel.consultation.duration)
                        .font(.subheadline)
                        .foregroundColor(.white)
                }
            }
            
            Spacer()
            
            Button(action: toggleFullScreen) {
                Image(systemName: isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .foregroundColor(.white)
            }
            .accessibilityLabel(isFullScreen ? "Exit full screen" : "Enter full screen")
        }
        .padding()
    }
    
    private var controlsBar: some View {
        HStack(spacing: 20) {
            // Microphone Toggle
            ControlButton(
                icon: viewModel.isAudioEnabled ? "mic.fill" : "mic.slash.fill",
                action: toggleAudio,
                isEnabled: viewModel.isAudioEnabled,
                label: "Microphone"
            )
            
            // Camera Toggle
            ControlButton(
                icon: viewModel.isVideoEnabled ? "video.fill" : "video.slash.fill",
                action: toggleVideo,
                isEnabled: viewModel.isVideoEnabled,
                label: "Camera"
            )
            
            // End Call
            Button(action: endCall) {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 24))
                    .foregroundColor(.white)
                    .padding(12)
                    .background(Circle().fill(Color.red))
            }
            .accessibilityLabel("End call")
            
            // Chat Toggle
            ControlButton(
                icon: "message.fill",
                action: toggleChat,
                isEnabled: showingChat,
                label: "Chat"
            )
            
            // More Options
            ControlButton(
                icon: "ellipsis",
                action: showMoreOptions,
                isEnabled: true,
                label: "More options"
            )
        }
        .padding()
        .background(Color.black.opacity(0.5))
        .cornerRadius(16)
    }
    
    private var chatSidebar: some View {
        ChatView(consultation: viewModel.consultation, webRTCService: viewModel.webRTCService)
            .frame(width: 320)
            .transition(.move(edge: .trailing))
    }
    
    private var qualityWarningBanner: some View {
        VStack {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.yellow)
                Text("Poor connection quality")
                    .foregroundColor(.white)
            }
            .padding()
            .background(Color.black.opacity(0.7))
            .cornerRadius(8)
        }
        .padding(.top)
    }
    
    private var securityStatusIndicator: some View {
        VStack {
            HStack {
                Image(systemName: viewModel.encryptionStatus == .active ? "lock.fill" : "lock.open.fill")
                    .foregroundColor(viewModel.encryptionStatus == .active ? .green : .red)
                Text(viewModel.encryptionStatus == .active ? "Encrypted" : "Not Secure")
                    .font(.caption)
                    .foregroundColor(.white)
            }
            .padding(8)
            .background(Color.black.opacity(0.5))
            .cornerRadius(8)
        }
        .padding(.top)
    }
    
    // MARK: - Helper Views
    
    private func videoStreamsView(size: CGSize) -> some View {
        ZStack {
            // Remote Video
            RemoteVideoView(viewModel: viewModel)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            
            // Local Video Preview
            LocalVideoView(viewModel: viewModel)
                .frame(width: size.width / 4, height: size.height / 4)
                .cornerRadius(12)
                .shadow(radius: 4)
                .padding()
                .position(x: size.width - 80, y: size.height - 100)
        }
    }
    
    private var connectionQualityIndicator: some View {
        HStack {
            Image(systemName: qualityIconName)
                .foregroundColor(qualityColor)
            Text(qualityText)
                .font(.caption)
                .foregroundColor(.white)
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupConsultation() {
        // Start secure video session
        viewModel.startSecureConsultation()
            .sink(
                receiveCompletion: { completion in
                    if case .failure = completion {
                        showingSecurityAlert = true
                    }
                },
                receiveValue: { _ in
                    // Setup complete
                }
            )
            .store(in: &viewModel.cancellables)
        
        // Monitor connection quality
        viewModel.monitorConnectionQuality()
            .sink { quality in
                showingQualityWarning = quality == .poor
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func cleanupConsultation() {
        viewModel.endSecureConsultation()
            .sink { _ in }
            .store(in: &viewModel.cancellables)
    }
    
    private func toggleAudio() {
        viewModel.toggleAudio()
    }
    
    private func toggleVideo() {
        viewModel.toggleVideo()
    }
    
    private func toggleChat() {
        withAnimation {
            showingChat.toggle()
        }
    }
    
    private func toggleFullScreen() {
        withAnimation {
            isFullScreen.toggle()
        }
    }
    
    private func endCall() {
        viewModel.endSecureConsultation()
            .sink { _ in
                presentationMode.wrappedValue.dismiss()
            }
            .store(in: &viewModel.cancellables)
    }
    
    private func showMoreOptions() {
        // Implement more options menu
    }
    
    private var qualityIconName: String {
        switch viewModel.connectionQuality {
        case .high: return "wifi"
        case .medium: return "wifi.exclamationmark"
        case .low: return "wifi.slash"
        case .poor: return "exclamationmark.triangle.fill"
        }
    }
    
    private var qualityColor: Color {
        switch viewModel.connectionQuality {
        case .high: return .green
        case .medium: return .yellow
        case .low, .poor: return .red
        }
    }
    
    private var qualityText: String {
        switch viewModel.connectionQuality {
        case .high: return "Excellent"
        case .medium: return "Good"
        case .low: return "Poor"
        case .poor: return "Critical"
        }
    }
}

// MARK: - Supporting Views

@available(iOS 14.0, *)
private struct ControlButton: View {
    let icon: String
    let action: () -> Void
    let isEnabled: Bool
    let label: String
    
    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(isEnabled ? .white : .red)
                .padding(12)
                .background(Circle().fill(Color.black.opacity(0.5)))
        }
        .accessibilityLabel(label)
    }
}

@available(iOS 14.0, *)
private struct RemoteVideoView: View {
    @ObservedObject var viewModel: VideoConsultationViewModel
    
    var body: some View {
        Color.black // Placeholder for actual video view
            .overlay(
                Group {
                    if viewModel.viewState == .connecting {
                        ProgressView("Connecting...")
                            .foregroundColor(.white)
                    }
                }
            )
    }
}

@available(iOS 14.0, *)
private struct LocalVideoView: View {
    @ObservedObject var viewModel: VideoConsultationViewModel
    
    var body: some View {
        Color.gray // Placeholder for actual video view
            .overlay(
                Group {
                    if !viewModel.isVideoEnabled {
                        Image(systemName: "video.slash.fill")
                            .foregroundColor(.white)
                    }
                }
            )
    }
}