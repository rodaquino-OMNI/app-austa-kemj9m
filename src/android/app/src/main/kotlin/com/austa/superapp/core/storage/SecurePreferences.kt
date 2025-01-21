package com.austa.superapp.core.storage

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import android.util.LruCache
import com.austa.superapp.core.security.EncryptionManager
import kotlinx.serialization.json.Json
import java.security.SecurityException
import java.util.concurrent.locks.ReentrantLock

/**
 * HIPAA-compliant secure storage implementation using encrypted SharedPreferences.
 * Provides thread-safe operations, caching, and key rotation support for sensitive healthcare data.
 *
 * Version: 1.0.0
 * Security Level: HIGH
 * Data Classification: PHI/PII
 */
class SecurePreferences @Throws(SecurityException::class) constructor(
    private val context: Context
) {
    companion object {
        private const val TAG = "SecurePreferences"
        private const val CACHE_SIZE = 100 // Maximum number of cached entries
        private const val PREF_NAME = AppConstants.SECURITY.SHARED_PREFS_NAME
        private const val KEY_ALIAS = AppConstants.SECURITY.KEY_ALIAS
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val ENCRYPTION_VERSION = 1
        private const val VERSION_KEY = "encryption_version"
    }

    private val encryptionManager: EncryptionManager = EncryptionManager()
    private val sharedPreferences: SharedPreferences
    private val json: Json
    private val cache: LruCache<String, String>
    private val lock = ReentrantLock()

    init {
        try {
            sharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            json = Json { 
                ignoreUnknownKeys = true
                isLenient = true
            }
            cache = LruCache(CACHE_SIZE)
            verifyEncryptionKey()
            checkAndMigrateVersion()
        } catch (e: Exception) {
            Log.e(TAG, "Initialization failed", e)
            throw SecurityException("Failed to initialize SecurePreferences", e)
        }
    }

    /**
     * Stores an encrypted string value with retry mechanism and security logging.
     *
     * @param key The key to store the value under
     * @param value The string value to encrypt and store
     * @return Boolean indicating success of the operation
     * @throws SecurityException if encryption fails after maximum retries
     */
    @Throws(SecurityException::class)
    fun putString(key: String, value: String): Boolean {
        require(key.isNotBlank()) { "Key cannot be blank" }
        require(value.isNotBlank()) { "Value cannot be blank" }

        lock.lock()
        try {
            var attempts = 0
            var lastException: Exception? = null

            while (attempts < MAX_RETRY_ATTEMPTS) {
                try {
                    val encryptedData = encryptionManager.encryptData(
                        value.toByteArray(Charsets.UTF_8),
                        KEY_ALIAS
                    )

                    val serializedData = json.encodeToString(
                        EncryptedData.serializer(),
                        encryptedData
                    )

                    sharedPreferences.edit().apply {
                        putString(key, serializedData)
                        apply()
                    }

                    cache.put(key, value)
                    Log.i(TAG, "Successfully stored encrypted data for key: $key")
                    return true

                } catch (e: Exception) {
                    lastException = e
                    attempts++
                    Log.w(TAG, "Attempt $attempts failed for key: $key", e)
                }
            }

            throw SecurityException("Failed to store encrypted data after $MAX_RETRY_ATTEMPTS attempts", lastException)
        } finally {
            lock.unlock()
        }
    }

    /**
     * Retrieves and decrypts a stored string value with caching support.
     *
     * @param key The key to retrieve the value for
     * @param defaultValue The default value to return if key not found
     * @return The decrypted string value or defaultValue if not found
     * @throws SecurityException if decryption fails
     */
    @Throws(SecurityException::class)
    fun getString(key: String, defaultValue: String): String {
        require(key.isNotBlank()) { "Key cannot be blank" }

        lock.lock()
        try {
            // Check cache first
            cache.get(key)?.let { cachedValue ->
                Log.d(TAG, "Cache hit for key: $key")
                return cachedValue
            }

            val encryptedString = sharedPreferences.getString(key, null)
                ?: return defaultValue.also {
                    Log.d(TAG, "No value found for key: $key, returning default")
                }

            try {
                val encryptedData = json.decodeFromString(
                    EncryptedData.serializer(),
                    encryptedString
                )

                val decryptedBytes = encryptionManager.decryptData(encryptedData)
                val decryptedString = String(decryptedBytes, Charsets.UTF_8)

                // Update cache with decrypted value
                cache.put(key, decryptedString)
                Log.i(TAG, "Successfully retrieved and decrypted data for key: $key")

                return decryptedString

            } catch (e: Exception) {
                Log.e(TAG, "Failed to decrypt data for key: $key", e)
                throw SecurityException("Failed to decrypt stored data", e)
            }
        } finally {
            lock.unlock()
        }
    }

    /**
     * Performs key rotation for all stored data with comprehensive logging.
     *
     * @return Boolean indicating success of key rotation
     * @throws SecurityException if key rotation fails
     */
    @Throws(SecurityException::class)
    fun rotateEncryptionKey(): Boolean {
        lock.lock()
        try {
            Log.i(TAG, "Starting encryption key rotation")
            
            // Rotate the encryption key
            if (!encryptionManager.rotateKey(KEY_ALIAS)) {
                throw SecurityException("Failed to rotate encryption key")
            }

            // Re-encrypt all stored data with new key
            val allEntries = sharedPreferences.all
            val editor = sharedPreferences.edit()

            allEntries.forEach { (key, value) ->
                if (key != VERSION_KEY && value is String) {
                    try {
                        val encryptedData = json.decodeFromString(
                            EncryptedData.serializer(),
                            value
                        )
                        val decryptedData = encryptionManager.decryptData(encryptedData)
                        val newEncryptedData = encryptionManager.encryptData(decryptedData, KEY_ALIAS)
                        
                        editor.putString(
                            key,
                            json.encodeToString(EncryptedData.serializer(), newEncryptedData)
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to re-encrypt data for key: $key", e)
                        throw SecurityException("Failed to re-encrypt data during key rotation", e)
                    }
                }
            }

            editor.apply()
            cache.evictAll()
            
            Log.i(TAG, "Successfully completed encryption key rotation")
            return true

        } finally {
            lock.unlock()
        }
    }

    /**
     * Migrates data to new encryption version with validation.
     *
     * @param oldVersion Previous encryption version
     * @param newVersion Target encryption version
     * @return Boolean indicating success of migration
     */
    fun migrateData(oldVersion: Int, newVersion: Int): Boolean {
        lock.lock()
        try {
            Log.i(TAG, "Starting data migration from v$oldVersion to v$newVersion")

            if (oldVersion >= newVersion) {
                Log.w(TAG, "Migration not needed: old version ($oldVersion) >= new version ($newVersion)")
                return false
            }

            // Perform version-specific migrations
            when (oldVersion) {
                1 -> {
                    if (newVersion == 2) {
                        // Example migration from v1 to v2
                        rotateEncryptionKey()
                        sharedPreferences.edit()
                            .putInt(VERSION_KEY, newVersion)
                            .apply()
                    }
                }
                // Add more version migrations as needed
            }

            Log.i(TAG, "Successfully migrated data to version $newVersion")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Data migration failed", e)
            throw SecurityException("Failed to migrate data to new version", e)
        } finally {
            lock.unlock()
        }
    }

    /**
     * Verifies encryption key integrity and availability.
     */
    private fun verifyEncryptionKey() {
        try {
            // Verify key by attempting a test encryption
            encryptionManager.encryptData("test".toByteArray(), KEY_ALIAS)
            Log.i(TAG, "Encryption key verification successful")
        } catch (e: Exception) {
            Log.e(TAG, "Encryption key verification failed", e)
            throw SecurityException("Failed to verify encryption key integrity", e)
        }
    }

    /**
     * Checks current encryption version and initiates migration if needed.
     */
    private fun checkAndMigrateVersion() {
        val currentVersion = sharedPreferences.getInt(VERSION_KEY, 1)
        if (currentVersion < ENCRYPTION_VERSION) {
            migrateData(currentVersion, ENCRYPTION_VERSION)
        }
    }
}