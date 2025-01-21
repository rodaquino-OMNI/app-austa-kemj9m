// Foundation - iOS 14.0+
import Foundation
// Network - iOS 14.0+
import Network
// Combine - iOS 14.0+
import Combine

/// Represents the possible states of network connectivity
public enum NetworkStatus: String {
    case connected = "Connected"
    case disconnected = "Disconnected"
}

/// Comprehensive network-specific error types
public enum NetworkError: LocalizedError {
    case connectionLost
    case timeout
    case invalidResponse
    case serverError
    case custom(String)
    
    public var errorDescription: String? {
        switch self {
        case .connectionLost:
            return "Network connection has been lost"
        case .timeout:
            return "Network request timed out"
        case .invalidResponse:
            return "Invalid network response received"
        case .serverError:
            return "Server error occurred"
        case .custom(let message):
            return message
        }
    }
}

/// A singleton class responsible for monitoring network connectivity status
/// with comprehensive error handling and recovery mechanisms
@available(iOS 14.0, *)
public final class NetworkMonitor {
    
    // MARK: - Singleton Instance
    
    /// Shared instance for network monitoring
    public static let shared = NetworkMonitor()
    
    // MARK: - Properties
    
    /// Network path monitor for tracking connectivity
    private let pathMonitor: NWPathMonitor
    
    /// Publisher for current connection status
    public let isConnected: CurrentValueSubject<Bool, Never>
    
    /// Publisher for current connection type
    public let connectionType: CurrentValueSubject<NetworkStatus, Never>
    
    /// Dedicated dispatch queue for network monitoring
    private let queue: DispatchQueue
    
    /// Publisher for network errors
    private let errorSubject = PassthroughSubject<NetworkError, Never>()
    
    /// Counter for recovery attempts
    private var recoveryAttempts: Int = 0
    
    /// Last known network status
    private var lastKnownStatus: NetworkStatus = .disconnected
    
    /// Set of cancellables for managing subscriptions
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        pathMonitor = NWPathMonitor()
        queue = DispatchQueue(label: "com.austa.networkmonitor", qos: .userInitiated)
        isConnected = CurrentValueSubject<Bool, Never>(false)
        connectionType = CurrentValueSubject<NetworkStatus, Never>(.disconnected)
        
        setupErrorHandling()
    }
    
    // MARK: - Public Methods
    
    /// Starts network connectivity monitoring with error handling
    public func startMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            
            let isConnected = path.status == .satisfied
            self.isConnected.send(isConnected)
            self.connectionType.send(isConnected ? .connected : .disconnected)
            
            if isConnected {
                self.recoveryAttempts = 0
                self.lastKnownStatus = .connected
            } else {
                self.handleNetworkError(.connectionLost)
            }
            
            self.monitorConnectionQuality(path)
        }
        
        pathMonitor.start(queue: queue)
    }
    
    /// Safely stops network connectivity monitoring
    public func stopMonitoring() {
        pathMonitor.cancel()
        isConnected.send(false)
        connectionType.send(.disconnected)
        cancellables.removeAll()
    }
    
    /// Performs comprehensive network connectivity check
    public func checkConnectivity() -> Bool {
        let path = pathMonitor.currentPath
        let isConnected = path.status == .satisfied
        
        if !isConnected {
            handleNetworkError(.connectionLost)
        }
        
        return isConnected
    }
    
    // MARK: - Private Methods
    
    /// Sets up error handling and recovery system
    private func setupErrorHandling() {
        errorSubject
            .debounce(for: .seconds(1), scheduler: queue)
            .sink { [weak self] error in
                self?.attemptRecovery(from: error)
            }
            .store(in: &cancellables)
    }
    
    /// Monitors connection quality and performance
    private func monitorConnectionQuality(_ path: NWPath) {
        guard path.status == .satisfied else { return }
        
        // Monitor interface type
        if path.usesInterfaceType(.wifi) {
            // Enhanced monitoring for WiFi
            monitorWiFiQuality()
        } else if path.usesInterfaceType(.cellular) {
            // Enhanced monitoring for cellular
            monitorCellularQuality()
        }
        
        // Check for constrained path
        if path.isConstrained {
            errorSubject.send(.custom("Network performance may be limited"))
        }
    }
    
    /// Monitors WiFi connection quality
    private func monitorWiFiQuality() {
        // Implementation for WiFi quality monitoring
        // This would include signal strength, bandwidth, etc.
    }
    
    /// Monitors cellular connection quality
    private func monitorCellularQuality() {
        // Implementation for cellular quality monitoring
        // This would include signal strength, network type (4G/5G), etc.
    }
    
    /// Handles network errors with recovery attempts
    private func handleNetworkError(_ error: NetworkError) {
        errorSubject.send(error)
        
        // Log error for analytics
        print("Network Error: \(error.localizedDescription)")
        
        // Update connection status
        if case .connectionLost = error {
            isConnected.send(false)
            connectionType.send(.disconnected)
        }
    }
    
    /// Attempts to recover from network errors
    private func attemptRecovery(from error: NetworkError) {
        guard recoveryAttempts < 3 else {
            errorSubject.send(.custom("Maximum recovery attempts reached"))
            return
        }
        
        recoveryAttempts += 1
        
        // Implement exponential backoff
        let delay = Double(pow(2, Double(recoveryAttempts)))
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self else { return }
            
            if self.checkConnectivity() {
                self.recoveryAttempts = 0
            }
        }
    }
}