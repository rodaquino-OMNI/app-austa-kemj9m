//
// LoginView.swift
// AUSTA SuperApp
//
// HIPAA-compliant login screen with comprehensive security features
// Version: 1.0.0
//

import SwiftUI // iOS 14.0+
import Combine // iOS 14.0+
import LocalAuthentication // iOS 14.0+

@available(iOS 14.0, *)
@MainActor
public struct LoginView: View {
    // MARK: - View Model
    
    @StateObject private var viewModel = LoginViewModel()
    
    // MARK: - State Properties
    
    @State private var isShowingBiometricAuth = false
    @State private var isSecureTextEntry = true
    @State private var keyboardHeight: CGFloat = 0
    
    // MARK: - Environment
    
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    
    // MARK: - Constants
    
    private let securityPadding: CGFloat = 20
    private let logoSize: CGFloat = 120
    
    // MARK: - Body
    
    public var body: some View {
        AdaptiveStack(spacing: 24) {
            // Logo
            Image("AUSTALogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: logoSize, height: logoSize)
                .accessibilityLabel(Text("AUSTA SuperApp Logo"))
            
            // Login Form
            VStack(spacing: 16) {
                // Email Field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.bodyMedium)
                        .foregroundColor(.highContrastText)
                    
                    TextField("Enter your email", text: Binding(
                        get: { viewModel.email },
                        set: { viewModel.updateEmail($0) }
                    ))
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .accessibilityLabel(Text("Email input field"))
                }
                
                // Password Field
                VStack(alignment: .leading, spacing: 8) {
                    Text("Password")
                        .font(.bodyMedium)
                        .foregroundColor(.highContrastText)
                    
                    HStack {
                        Group {
                            if isSecureTextEntry {
                                SecureField("Enter your password", text: Binding(
                                    get: { viewModel.password },
                                    set: { viewModel.updatePassword($0) }
                                ))
                            } else {
                                TextField("Enter your password", text: Binding(
                                    get: { viewModel.password },
                                    set: { viewModel.updatePassword($0) }
                                ))
                            }
                        }
                        .textContentType(.password)
                        .accessibilityLabel(Text("Password input field"))
                        
                        Button(action: { isSecureTextEntry.toggle() }) {
                            Image(systemName: isSecureTextEntry ? "eye.slash.fill" : "eye.fill")
                                .foregroundColor(.secondary)
                        }
                        .accessibilityLabel(Text(isSecureTextEntry ? "Show password" : "Hide password"))
                    }
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                }
            }
            .padding(.horizontal, securityPadding)
            
            // Error Message
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.bodyMedium)
                    .foregroundColor(.accentError)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, securityPadding)
                    .accessibilityLabel(Text("Error: \(errorMessage)"))
            }
            
            // Login Button
            Button(action: loginButtonTapped) {
                if viewModel.isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Text("Log In")
                        .font(.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .primaryButtonStyle()
            .disabled(viewModel.isLoading)
            .padding(.horizontal, securityPadding)
            .accessibilityLabel(Text(viewModel.isLoading ? "Logging in" : "Log in button"))
            
            // Biometric Login
            if viewModel.isBiometricAvailable {
                Button(action: showBiometricAuth) {
                    HStack {
                        Image(systemName: "faceid")
                        Text("Login with Biometrics")
                    }
                }
                .secondaryButtonStyle()
                .padding(.horizontal, securityPadding)
                .accessibilityLabel(Text("Login with biometric authentication"))
            }
        }
        .padding(.vertical, 32)
        .cardStyle()
        .onChange(of: scenePhase) { newPhase in
            handleScenePhaseChange(newPhase)
        }
        .onAppear {
            setupKeyboardHandling()
        }
        .sheet(isPresented: $isShowingBiometricAuth) {
            BiometricAuthView(securityLevel: .high)
        }
    }
    
    // MARK: - Private Methods
    
    private func loginButtonTapped() {
        Task {
            do {
                try await viewModel.login()
            } catch {
                // Error is handled by view model
            }
        }
    }
    
    private func showBiometricAuth() {
        isShowingBiometricAuth = true
    }
    
    private func handleScenePhaseChange(_ phase: ScenePhase) {
        switch phase {
        case .inactive, .background:
            // Clear sensitive data when app goes to background
            viewModel.updatePassword("")
            isSecureTextEntry = true
        case .active:
            // Validate security when app becomes active
            validateSecurity()
        @unknown default:
            break
        }
    }
    
    private func setupKeyboardHandling() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .map { notification in
                notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect ?? .zero
            }
            .map { $0.height }
            .assign(to: &$keyboardHeight)
        
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .map { _ in CGFloat(0) }
            .assign(to: &$keyboardHeight)
    }
    
    private func validateSecurity() {
        guard BiometricUtils.shared.validateDeviceSecurity() else {
            viewModel.errorMessage = "Device security requirements not met"
            return
        }
    }
}

// MARK: - Preview Provider

@available(iOS 14.0, *)
struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            LoginView()
                .preferredColorScheme(.light)
            
            LoginView()
                .preferredColorScheme(.dark)
                .environment(\.sizeCategory, .accessibilityLarge)
        }
    }
}