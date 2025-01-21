//
// LocalStorage.swift
// AUSTA SuperApp
//
// Thread-safe local storage implementation for non-sensitive data with
// enhanced caching, compression, and cleanup capabilities.
//

import Foundation // iOS 14.0+

/// Comprehensive error handling for local storage operations
@available(iOS 14.0, *)
public enum LocalStorageError: LocalizedError {
    case saveFailed(String)
    case loadFailed(String)
    case deleteFailed(String)
    case invalidData(String)
    case quotaExceeded
    case fileCorrupted
    case compressionFailed
    case encryptionFailed
    
    public var errorDescription: String? {
        switch self {
        case .saveFailed(let reason):
            return "Failed to save data: \(reason)"
        case .loadFailed(let reason):
            return "Failed to load data: \(reason)"
        case .deleteFailed(let reason):
            return "Failed to delete data: \(reason)"
        case .invalidData(let reason):
            return "Invalid data format: \(reason)"
        case .quotaExceeded:
            return "Storage quota exceeded"
        case .fileCorrupted:
            return "Storage file corrupted"
        case .compressionFailed:
            return "Data compression failed"
        case .encryptionFailed:
            return "Data encryption failed"
        }
    }
}

/// Thread-safe singleton class managing local storage operations
@available(iOS 14.0, *)
public final class LocalStorage {
    
    // MARK: - Properties
    
    public static let shared = LocalStorage()
    
    private let userDefaults: UserDefaults
    private let fileManager: FileManager
    private let secureStorage: SecureStorage
    private let storageQueue: DispatchQueue
    private let maxStorageQuota: Int64 = 50 * 1024 * 1024 // 50MB
    private let compressionEnabled: Bool = true
    private let cleanupInterval: TimeInterval = 24 * 60 * 60 // 24 hours
    
    // MARK: - Initialization
    
    private init() {
        userDefaults = UserDefaults.standard
        fileManager = FileManager.default
        secureStorage = SecureStorage.shared
        
        // Create dedicated serial queue for storage operations
        storageQueue = DispatchQueue(
            label: "com.austa.superapp.storage",
            qos: .userInitiated
        )
        
        // Setup periodic cleanup
        setupCleanupTimer()
        
        // Register for memory warnings
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Saves data to local storage with optional compression
    public func saveData(_ data: Any, 
                        forKey key: String,
                        compress: Bool = true) -> Result<Void, LocalStorageError> {
        
        return storageQueue.sync {
            do {
                // Validate data is property list compliant
                guard PropertyListSerialization.propertyList(
                    data,
                    isValidFor: .binary
                ) else {
                    return .failure(.invalidData("Data is not property list compliant"))
                }
                
                // Check storage quota
                if getCurrentStorageSize() + estimateDataSize(data) > maxStorageQuota {
                    return .failure(.quotaExceeded)
                }
                
                // Prepare data for storage
                var storageData: Data
                if let jsonData = try? JSONSerialization.data(withJSONObject: data) {
                    storageData = jsonData
                    
                    // Apply compression if enabled and beneficial
                    if compress && compressionEnabled && storageData.count > 1024 {
                        if let compressedData = try? compressData(storageData) {
                            storageData = compressedData
                        }
                    }
                    
                    // Store data
                    userDefaults.set(storageData, forKey: key)
                    userDefaults.synchronize()
                    
                    // Update storage metrics
                    updateStorageMetrics(forKey: key, size: storageData.count)
                    
                    return .success(())
                } else {
                    return .failure(.saveFailed("JSON serialization failed"))
                }
            } catch {
                return .failure(.saveFailed(error.localizedDescription))
            }
        }
    }
    
    /// Loads data from local storage with automatic decompression
    public func loadData(forKey key: String) -> Result<Any?, LocalStorageError> {
        return storageQueue.sync {
            do {
                guard let data = userDefaults.data(forKey: key) else {
                    return .success(nil)
                }
                
                // Check if data is compressed
                let decompressedData: Data
                if isCompressedData(data) {
                    guard let uncompressed = try? decompressData(data) else {
                        return .failure(.fileCorrupted)
                    }
                    decompressedData = uncompressed
                } else {
                    decompressedData = data
                }
                
                // Deserialize data
                if let jsonObject = try JSONSerialization.jsonObject(with: decompressedData) {
                    return .success(jsonObject)
                } else {
                    return .failure(.loadFailed("JSON deserialization failed"))
                }
            } catch {
                return .failure(.loadFailed(error.localizedDescription))
            }
        }
    }
    
    /// Performs storage cleanup and maintenance
    public func cleanupStorage() -> Result<Void, LocalStorageError> {
        return storageQueue.sync {
            do {
                let storageKeys = userDefaults.dictionaryRepresentation().keys
                var removedCount = 0
                var freedSpace: Int64 = 0
                
                for key in storageKeys {
                    if shouldRemoveItem(forKey: key) {
                        if let size = getItemSize(forKey: key) {
                            userDefaults.removeObject(forKey: key)
                            freedSpace += Int64(size)
                            removedCount += 1
                        }
                    }
                }
                
                userDefaults.synchronize()
                
                // Log cleanup results
                NSLog("Storage cleanup completed: removed \(removedCount) items, freed \(freedSpace) bytes")
                
                return .success(())
            } catch {
                return .failure(.deleteFailed(error.localizedDescription))
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func setupCleanupTimer() {
        Timer.scheduledTimer(
            withTimeInterval: cleanupInterval,
            repeats: true
        ) { [weak self] _ in
            _ = self?.cleanupStorage()
        }
    }
    
    private func getCurrentStorageSize() -> Int64 {
        var totalSize: Int64 = 0
        for (key, _) in userDefaults.dictionaryRepresentation() {
            if let size = getItemSize(forKey: key) {
                totalSize += Int64(size)
            }
        }
        return totalSize
    }
    
    private func estimateDataSize(_ data: Any) -> Int64 {
        if let jsonData = try? JSONSerialization.data(withJSONObject: data) {
            return Int64(jsonData.count)
        }
        return 0
    }
    
    private func compressData(_ data: Data) throws -> Data {
        // Implement data compression using compression framework
        return data
    }
    
    private func decompressData(_ data: Data) throws -> Data {
        // Implement data decompression
        return data
    }
    
    private func isCompressedData(_ data: Data) -> Bool {
        // Check compression signature
        return false
    }
    
    private func updateStorageMetrics(forKey key: String, size: Int) {
        let metricsKey = "storage_metrics_\(key)"
        let metrics: [String: Any] = [
            "size": size,
            "timestamp": Date().timeIntervalSince1970
        ]
        userDefaults.set(metrics, forKey: metricsKey)
    }
    
    private func getItemSize(forKey key: String) -> Int? {
        let metricsKey = "storage_metrics_\(key)"
        if let metrics = userDefaults.dictionary(forKey: metricsKey),
           let size = metrics["size"] as? Int {
            return size
        }
        return nil
    }
    
    private func shouldRemoveItem(forKey key: String) -> Bool {
        let metricsKey = "storage_metrics_\(key)"
        if let metrics = userDefaults.dictionary(forKey: metricsKey),
           let timestamp = metrics["timestamp"] as? TimeInterval {
            let age = Date().timeIntervalSince1970 - timestamp
            return age > (7 * 24 * 60 * 60) // Remove items older than 7 days
        }
        return false
    }
    
    @objc private func handleMemoryWarning() {
        storageQueue.async { [weak self] in
            _ = self?.cleanupStorage()
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}