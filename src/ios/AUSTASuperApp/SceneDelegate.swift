//
// SceneDelegate.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import UIKit // Version: iOS 14.0+
import SwiftUI // Version: iOS 14.0+

/// Scene delegate responsible for managing the UIScene lifecycle with HIPAA compliance
/// and secure state management for the AUSTA SuperApp iOS client.
@available(iOS 14.0, *)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    
    // MARK: - Properties
    
    /// Main window for the scene
    var window: UIWindow?
    
    /// Security context for HIPAA compliance
    private var securityContext: SecurityContext?
    
    /// Performance monitoring for maintaining 99.99% availability
    private var performanceMonitor: PerformanceMonitor?
    
    /// Network connectivity monitor
    private let networkMonitor = NetworkMonitor.shared
    
    /// Scene state monitor for security
    private var sceneStateMonitor: SceneStateMonitor?
    
    // MARK: - Scene Lifecycle Methods
    
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        
        do {
            // Initialize security context with HIPAA compliance
            try initializeSecurityContext()
            
            // Configure window with security parameters
            window = UIWindow(windowScene: windowScene)
            window?.overrideUserInterfaceStyle = .light
            window?.backgroundColor = .systemBackground
            
            // Create dashboard view with security context
            let healthKitService = HealthKitService()
            let healthRecordsService = HealthRecordsService()
            let dashboardViewModel = DashboardViewModel(
                healthKitService: healthKitService,
                healthRecordsService: healthRecordsService
            )
            
            let dashboardView = DashboardView(viewModel: dashboardViewModel)
                .environment(\.securityContext, securityContext)
            
            // Configure root view controller with security wrapper
            let hostingController = UIHostingController(rootView: dashboardView)
            configureHostingController(hostingController)
            
            window?.rootViewController = hostingController
            window?.makeKeyAndVisible()
            
            // Start monitoring
            startMonitoring()
            
            // Log secure scene connection
            auditLog("scene_connected", metadata: [
                "session_id": session.persistentIdentifier,
                "timestamp": Date().timeIntervalSince1970
            ])
            
        } catch {
            handleSecurityError(error)
        }
    }
    
    func sceneDidDisconnect(_ scene: UIScene) {
        // Perform secure cleanup
        performSecureCleanup()
        
        // Stop monitoring
        stopMonitoring()
        
        // Log secure disconnection
        auditLog("scene_disconnected", metadata: [
            "timestamp": Date().timeIntervalSince1970
        ])
    }
    
    func sceneDidBecomeActive(_ scene: UIScene) {
        do {
            // Validate security context
            try validateSecurityContext()
            
            // Resume secure state
            resumeSecureState()
            
            // Start performance monitoring
            performanceMonitor?.startMonitoring()
            
            // Log activation
            auditLog("scene_activated", metadata: [
                "timestamp": Date().timeIntervalSince1970
            ])
            
        } catch {
            handleSecurityError(error)
        }
    }
    
    func sceneWillResignActive(_ scene: UIScene) {
        // Secure sensitive UI state
        secureSensitiveState()
        
        // Pause monitoring
        performanceMonitor?.pauseMonitoring()
        
        // Log deactivation
        auditLog("scene_deactivated", metadata: [
            "timestamp": Date().timeIntervalSince1970
        ])
    }
    
    // MARK: - Private Methods
    
    private func initializeSecurityContext() throws {
        guard securityContext == nil else { return }
        
        // Create security context with HIPAA compliance
        securityContext = SecurityContext(
            securityLevel: .hipaa,
            encryptionEnabled: true,
            biometricRequired: AppConstants.Features.ENABLE_BIOMETRIC_AUTH
        )
        
        // Initialize performance monitoring
        performanceMonitor = PerformanceMonitor(
            targetAvailability: 0.9999,
            metricsEnabled: AppConstants.Features.ENABLE_ANALYTICS
        )
        
        // Initialize scene state monitoring
        sceneStateMonitor = SceneStateMonitor(
            securityContext: securityContext,
            auditEnabled: true
        )
    }
    
    private func configureHostingController(_ controller: UIHostingController<DashboardView>) {
        // Configure accessibility
        controller.view.accessibilityIdentifier = "DashboardView"
        
        // Configure content size category
        controller.view.adjustsFontForContentSizeCategory = true
        
        // Configure secure interaction
        controller.view.isUserInteractionEnabled = true
        
        // Configure secure layout
        controller.view.insetsLayoutMarginsFromSafeArea = true
    }
    
    private func startMonitoring() {
        // Start network monitoring
        networkMonitor.startMonitoring()
        
        // Start performance monitoring
        performanceMonitor?.startMonitoring()
        
        // Start scene state monitoring
        sceneStateMonitor?.startMonitoring()
    }
    
    private func stopMonitoring() {
        networkMonitor.stopMonitoring()
        performanceMonitor?.stopMonitoring()
        sceneStateMonitor?.stopMonitoring()
    }
    
    private func validateSecurityContext() throws {
        guard let context = securityContext else {
            throw ServiceError.securityViolation
        }
        
        // Validate HIPAA compliance
        try context.validateHIPAACompliance()
        
        // Validate encryption
        guard context.isEncryptionEnabled else {
            throw ServiceError.securityViolation
        }
    }
    
    private func performSecureCleanup() {
        // Clear sensitive data
        securityContext?.clearSensitiveData()
        
        // Clear window contents
        window?.rootViewController = nil
        window = nil
        
        // Clear monitors
        performanceMonitor = nil
        sceneStateMonitor = nil
    }
    
    private func resumeSecureState() {
        // Resume UI updates
        window?.rootViewController?.view.isUserInteractionEnabled = true
        
        // Refresh security parameters
        securityContext?.refreshSecurityParameters()
    }
    
    private func secureSensitiveState() {
        // Disable UI interaction
        window?.rootViewController?.view.isUserInteractionEnabled = false
        
        // Secure sensitive views
        securityContext?.secureSensitiveViews()
    }
    
    private func handleSecurityError(_ error: Error) {
        // Log security error
        auditLog("security_error", metadata: [
            "error": error.localizedDescription,
            "timestamp": Date().timeIntervalSince1970
        ])
        
        // Present secure error view
        presentSecureErrorView(error)
    }
    
    private func presentSecureErrorView(_ error: Error) {
        let errorViewController = UIHostingController(
            rootView: SecureErrorView(error: error)
        )
        window?.rootViewController = errorViewController
    }
    
    private func auditLog(_ action: String, metadata: [String: Any]?) {
        var auditMetadata = metadata ?? [:]
        auditMetadata["action"] = action
        
        if AppConstants.Features.ENABLE_ANALYTICS {
            // Implementation of audit logging
        }
    }
}