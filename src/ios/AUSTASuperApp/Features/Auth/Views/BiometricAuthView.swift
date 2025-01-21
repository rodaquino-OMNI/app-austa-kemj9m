//
// BiometricAuthView.swift
// AUSTA SuperApp
//
// SwiftUI view for secure biometric authentication with HIPAA compliance
// SwiftUI v3.0 - iOS 14.0+
// Combine v3.0 - iOS 14.0+

import SwiftUI
import Combine

@available(iOS 14.0, *)
@MainActor
public struct BiometricAuthView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel: BiometricAuthViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    
    // MARK: - Properties
    
    private let authenticationTimeout: TimeInterval = 30.0
    private let performanceMonitor = PerformanceMonitor(threshold: 500) // 500ms threshold
    private let securityPadding: CGFloat = 20
    
    // MARK: - Initialization
    
    public init(securityLevel: SecurityLevel) {
        _viewModel = StateObject(wrappedValue: BiometricAuthViewModel(
            authService: AuthService.shared,
            securityLevel: securityLevel
        ))
    }
    
    // MARK: - Body
    
    public var body: some View {
        VStack(spacing: 24) {
            // Security Status Indicator
            SecurityStatusView(status: viewModel.securityStatus)
                .padding(.top, securityPadding)
            
            // Biometric Icon
            BiometricIconView(type: BiometricUtils.shared.getBiometricType())
                .frame(width: 80, height: 80)
                .accessibilityLabel(Text("Biometric authentication icon"))
            
            // Authentication Prompt
            Text(getAuthenticationPrompt())
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.horizontal, securityPadding)
                .accessibilityLabel(Text("Authentication prompt"))
            
            // Action Buttons
            VStack(spacing: 16) {
                Button(action: authenticateUser) {
                    HStack {
                        Image(systemName: "faceid")
                            .font(.title2)
                        Text("Authenticate")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(viewModel.isAuthenticating)
                .accessibilityLabel(Text("Authenticate using biometrics"))
                
                Button(action: { dismiss() }) {
                    Text("Cancel")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                .accessibilityLabel(Text("Cancel authentication"))
            }
            .padding(.horizontal, securityPadding)
            
            // Error Message
            if let error = viewModel.error {
                ErrorView(error: error)
                    .transition(.opacity)
                    .accessibilityLabel(Text("Authentication error"))
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .onChange(of: scenePhase) { newPhase in
            handleScenePhaseChange(newPhase)
        }
        .onAppear {
            performanceMonitor.start()
            validateDeviceSecurity()
        }
        .onDisappear {
            performanceMonitor.stop()
        }
    }
    
    // MARK: - Private Methods
    
    private func authenticateUser() {
        performanceMonitor.measure {
            Task {
                do {
                    try await viewModel.authenticate()
                        .receive(on: DispatchQueue.main)
                        .sink { completion in
                            if case .failure(let error) = completion {
                                handleAuthenticationError(error)
                            }
                        } receiveValue: { _ in
                            dismiss()
                        }
                        .store(in: &viewModel.cancellables)
                } catch {
                    handleAuthenticationError(error)
                }
            }
        }
    }
    
    private func validateDeviceSecurity() {
        guard AuthService.shared.validateDeviceSecurity() else {
            viewModel.error = .securityViolation
            return
        }
    }
    
    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .inactive, .background:
            // Clear sensitive data when app goes to background
            viewModel.clearSensitiveData()
        case .active:
            // Revalidate security when app becomes active
            validateDeviceSecurity()
        @unknown default:
            break
        }
    }
    
    private func handleAuthenticationError(_ error: Error) {
        withAnimation {
            if let biometricError = error as? BiometricAuthError {
                viewModel.error = biometricError
            } else {
                viewModel.error = .authFailed
            }
        }
    }
    
    private func getAuthenticationPrompt() -> String {
        switch viewModel.securityLevel {
        case .high:
            return "Please authenticate to access protected health information"
        case .elevated:
            return "Additional verification required for secure access"
        case .standard:
            return "Verify your identity to continue"
        }
    }
}

// MARK: - Supporting Views

@available(iOS 14.0, *)
private struct SecurityStatusView: View {
    let status: SecurityStatus
    
    var body: some View {
        HStack {
            Image(systemName: status.iconName)
                .foregroundColor(status.color)
            Text(status.description)
                .font(.subheadline)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(status.color.opacity(0.1))
        .cornerRadius(8)
    }
}

@available(iOS 14.0, *)
private struct BiometricIconView: View {
    let type: BiometricType
    
    var body: some View {
        Image(systemName: type == .faceID ? "faceid" : "touchid")
            .font(.system(size: 44))
            .foregroundColor(.accentColor)
    }
}

@available(iOS 14.0, *)
private struct ErrorView: View {
    let error: BiometricAuthError
    
    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text(error.localizedDescription)
                .font(.subheadline)
                .foregroundColor(.red)
        }
        .padding()
        .background(Color.red.opacity(0.1))
        .cornerRadius(8)
    }
}