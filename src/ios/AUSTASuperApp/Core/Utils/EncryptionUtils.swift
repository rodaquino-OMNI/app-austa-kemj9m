//
// EncryptionUtils.swift
// AUSTA SuperApp
//
// HIPAA-compliant encryption utilities implementing AES-256-GCM
// with secure key management and automated rotation
//

import Foundation // iOS 14.0+
import CryptoKit // iOS 14.0+
import Security  // iOS 14.0+

/// Comprehensive error handling for encryption operations
@objc public enum EncryptionError: LocalizedError {
    case keyGenerationFailed
    case encryptionFailed
    case decryptionFailed
    case invalidKeySize
    case dataCorrupted
    case keyRotationFailed
    case keychainAccessFailed
    case integrityCheckFailed
    case memorySecurityFailed
    
    public var errorDescription: String? {
        switch self {
        case .keyGenerationFailed: return "Failed to generate encryption key"
        case .encryptionFailed: return "Data encryption failed"
        case .decryptionFailed: return "Data decryption failed"
        case .invalidKeySize: return "Invalid encryption key size"
        case .dataCorrupted: return "Data integrity check failed"
        case .keyRotationFailed: return "Key rotation operation failed"
        case .keychainAccessFailed: return "Secure keychain access failed"
        case .integrityCheckFailed: return "Data integrity verification failed"
        case .memorySecurityFailed: return "Secure memory operation failed"
        }
    }
}

/// Constants for encryption operations
private enum EncryptionConstants {
    static let KEY_SIZE: Int = 32 // 256 bits
    static let SALT_SIZE: Int = 16
    static let KEY_ROTATION_INTERVAL: TimeInterval = 30 * 24 * 60 * 60 // 30 days
    static let KEYCHAIN_SERVICE = "com.austa.superapp.encryption"
    static let KEYCHAIN_KEY_ID = "master_key"
}

/// Secure memory handling for sensitive operations
private final class SecureMemoryHandler {
    private var secureMemory: UnsafeMutableRawPointer?
    
    init() {
        // Allocate memory with secure memory attributes
        let pageSize = sysconf(_SC_PAGESIZE)
        secureMemory = mmap(nil, Int(pageSize), PROT_READ | PROT_WRITE,
                           MAP_PRIVATE | MAP_ANON, -1, 0)
        mlock(secureMemory, Int(pageSize))
    }
    
    deinit {
        if let memory = secureMemory {
            munlock(memory, Int(sysconf(_SC_PAGESIZE)))
            munmap(memory, Int(sysconf(_SC_PAGESIZE)))
        }
    }
    
    func secureOperation<T>(_ operation: (UnsafeMutableRawPointer) -> T) -> T {
        guard let memory = secureMemory else {
            fatalError("Secure memory not initialized")
        }
        defer {
            // Zero out memory after operation
            memset_s(memory, Int(sysconf(_SC_PAGESIZE)), 0, Int(sysconf(_SC_PAGESIZE)))
        }
        return operation(memory)
    }
}

/// Thread-safe singleton manager for encryption operations
@available(iOS 14.0, *)
@objc public final class EncryptionManager: NSObject {
    
    // MARK: - Properties
    
    @objc public static let shared = EncryptionManager()
    private let queue: DispatchQueue
    private let keychain: KeychainAccess
    private var symmetricKey: SymmetricKey
    private var lastKeyRotation: Date
    private let secureMemory: SecureMemoryHandler
    
    // MARK: - Initialization
    
    private override init() {
        queue = DispatchQueue(label: "com.austa.superapp.encryption",
                            qos: .userInitiated, attributes: .concurrent)
        secureMemory = SecureMemoryHandler()
        keychain = KeychainAccess(service: EncryptionConstants.KEYCHAIN_SERVICE)
        
        // Initialize with secure key generation or retrieval
        do {
            if let existingKey = try keychain.retrieveKey(identifier: EncryptionConstants.KEYCHAIN_KEY_ID) {
                symmetricKey = existingKey
                lastKeyRotation = try keychain.retrieveKeyRotationDate() ?? Date()
            } else {
                symmetricKey = SymmetricKey(size: .bits256)
                try keychain.storeKey(symmetricKey, identifier: EncryptionConstants.KEYCHAIN_KEY_ID)
                lastKeyRotation = Date()
                try keychain.storeKeyRotationDate(lastKeyRotation)
            }
        } catch {
            fatalError("Encryption initialization failed: \(error)")
        }
        
        super.init()
    }
    
    // MARK: - Public Methods
    
    /// Encrypts data using AES-256-GCM with integrity verification
    @objc public func encrypt(_ data: Data) -> Result<Data, EncryptionError> {
        queue.sync {
            return secureMemory.secureOperation { memory in
                do {
                    // Check key rotation
                    if Date().timeIntervalSince(lastKeyRotation) >= EncryptionConstants.KEY_ROTATION_INTERVAL {
                        try rotateKey().get()
                    }
                    
                    // Generate nonce
                    let nonce = try AES.GCM.Nonce()
                    
                    // Perform encryption
                    let sealedBox = try AES.GCM.seal(data, using: symmetricKey, nonce: nonce)
                    
                    // Combine nonce, ciphertext, and tag
                    var encryptedData = Data()
                    encryptedData.append(sealedBox.nonce)
                    encryptedData.append(sealedBox.ciphertext)
                    encryptedData.append(sealedBox.tag)
                    
                    return .success(encryptedData)
                } catch {
                    return .failure(.encryptionFailed)
                }
            }
        }
    }
    
    /// Decrypts data with integrity verification
    @objc public func decrypt(_ encryptedData: Data) -> Result<Data, EncryptionError> {
        queue.sync {
            return secureMemory.secureOperation { memory in
                do {
                    // Extract components
                    let nonceSize = AES.GCM.Nonce.size
                    let tagSize = AES.GCM.TAG_SIZE
                    
                    guard encryptedData.count >= nonceSize + tagSize else {
                        return .failure(.dataCorrupted)
                    }
                    
                    let nonce = try AES.GCM.Nonce(data: encryptedData.prefix(nonceSize))
                    let ciphertext = encryptedData.dropFirst(nonceSize).dropLast(tagSize)
                    let tag = encryptedData.suffix(tagSize)
                    
                    // Verify integrity
                    let sealedBox = try AES.GCM.SealedBox(nonce: nonce,
                                                         ciphertext: ciphertext,
                                                         tag: tag)
                    
                    // Perform decryption
                    let decryptedData = try AES.GCM.open(sealedBox, using: symmetricKey)
                    return .success(decryptedData)
                } catch {
                    return .failure(.decryptionFailed)
                }
            }
        }
    }
    
    /// Performs secure key rotation
    @objc public func rotateKey() -> Result<Void, EncryptionError> {
        queue.sync(flags: .barrier) {
            do {
                // Generate new key
                let newKey = SymmetricKey(size: .bits256)
                
                // Backup current key
                let backupKey = symmetricKey
                
                // Update key and store in keychain
                symmetricKey = newKey
                try keychain.storeKey(newKey, identifier: EncryptionConstants.KEYCHAIN_KEY_ID)
                
                // Update rotation timestamp
                lastKeyRotation = Date()
                try keychain.storeKeyRotationDate(lastKeyRotation)
                
                // Secure cleanup
                withUnsafeBytes(of: backupKey) { pointer in
                    memset_s(UnsafeMutableRawPointer(mutating: pointer.baseAddress!),
                            pointer.count, 0, pointer.count)
                }
                
                return .success(())
            } catch {
                return .failure(.keyRotationFailed)
            }
        }
    }
    
    /// Verifies data integrity
    @objc public func verifyIntegrity(data: Data, tag: Data) -> Result<Bool, EncryptionError> {
        queue.sync {
            do {
                let computedTag = try HMAC<SHA256>.authenticationCode(for: data, using: symmetricKey)
                let computedTagData = Data(computedTag)
                
                // Constant-time comparison
                guard computedTagData.count == tag.count else {
                    return .success(false)
                }
                
                var result = 0
                for i in 0..<computedTagData.count {
                    result |= computedTagData[i] ^ tag[i]
                }
                
                return .success(result == 0)
            } catch {
                return .failure(.integrityCheckFailed)
            }
        }
    }
}

// MARK: - Private KeychainAccess Helper

private final class KeychainAccess {
    private let service: String
    
    init(service: String) {
        self.service = service
    }
    
    func storeKey(_ key: SymmetricKey, identifier: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: identifier,
            kSecValueData as String: key.withUnsafeBytes { Data($0) },
            kSecAttrAccessControl as String: try SecAccessControl.create(
                protection: .whenPasscodeSet,
                access: [.privateKeyUsage]
            )
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw EncryptionError.keychainAccessFailed
        }
    }
    
    func retrieveKey(identifier: String) throws -> SymmetricKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: identifier,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let keyData = result as? Data else {
            return nil
        }
        
        return SymmetricKey(data: keyData)
    }
    
    func storeKeyRotationDate(_ date: Date) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "key_rotation_date",
            kSecValueData as String: try NSKeyedArchiver.archivedData(
                withRootObject: date,
                requiringSecureCoding: true
            )
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw EncryptionError.keychainAccessFailed
        }
    }
    
    func retrieveKeyRotationDate() throws -> Date? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "key_rotation_date",
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let dateData = result as? Data,
              let date = try NSKeyedUnarchiver.unarchivedObject(
                ofClass: NSDate.self,
                from: dateData
              ) as? Date else {
            return nil
        }
        
        return date
    }
}